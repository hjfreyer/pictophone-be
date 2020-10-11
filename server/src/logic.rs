use std::borrow::{Borrow, Cow};
use tonic::{
    metadata::MetadataValue,
    transport::Server,
    //transport::Channel,
    transport::{Channel, ClientTlsConfig},

    // transport::Channel,
    Request,
    Response,
    Status,
};

// use firestore::*;
use futures::stream::{Stream, StreamExt, TryStreamExt};
use futures::{Future, FutureExt, TryFuture, TryFutureExt};
// use futures::TryFutureExt;
const ENDPOINT: &str = "https://firestore.googleapis.com";
const DOMAIN: &str = "firestore.googleapis.com";

use futures::try_join;
use hello_world::greeter_server::{Greeter, GreeterServer};
use hello_world::{HelloReply, HelloRequest};
use pictophone as pt;
use pictophone::pictophone10_server::{Pictophone10, Pictophone10Server};
use serde::{Deserialize, Deserializer, Serialize};
use std::collections::{BTreeMap, BTreeSet, HashMap, HashSet};
use std::time::Duration;
use tokio::sync::mpsc;
use tokio::time::interval;
// use futures::Future;
use crate::proto::*;
use std::path;
//
use maplit::{btreemap, btreeset};


use firestore_client::FirestoreClient;
use google::firestore::v1::*;

use crate::db::*;
// #[cfg(test)]
// mod tests {

//     use crate::google::firestore::v1::*;
//     #[test]
//     fn it_works() {
//         let d = Document {
//             fields: [(
//                 "facet_id".to_string(),
//                 Value {
//                     value_type: Some(value::ValueType::StringValue("foo".to_string())),
//                 },
//             )]
//             .iter()
//             .cloned()
//             .collect(),

//             create_time: None,
//             update_time: None,
//             name: "foo".to_string(),
//         };
//         let cm: super::CollectionMember = super::firestore_values::document_to_pod(&d).unwrap();
//         println!("{:?}", cm);
//         assert_eq!(2 + 2, 5);
//     }
// }

pub async fn do_action(
    db: &impl Database,
    any_action: pt::AnyAction,
) -> Result<Response<pt::Empty>, Status> {
    loop {
        let mut needs = ParentsRequest {
            facets: BTreeSet::new(),
            collections: BTreeSet::new(),
        };
        let (updates, parents, tx) = loop {
            let (parents, tx) = db.get_parents(&needs).await?;
            let parent_facets = get_parent_facets(db, &parents).await?;
            let DataPoll { result, parents: n } = update_structure(&any_action, &parent_facets);
            match result {
                Some(updates) => break (updates, parents, tx),
                None => {
                    needs = n;
                }
            }
        };
        let commit = Commit {
            action: any_action.clone(),
            parents,
        };
        let commit_id = new_commit_id(&commit);
        match db.commit(&tx, &commit_id, &commit, &updates).await {
            Ok(_) => return Ok(Response::new(pt::Empty {})),
            Err(CommitError::TransactionConflict(_)) => {
                // Try again.
            }
            Err(CommitError::Status(e)) => return Err(Status::internal(format!("{:?}", e))),
        }
    }
}

#[derive(Clone)]
struct Facet {
    game: Game,
}

fn update_structure(
    action: &pictophone::AnyAction,
    parents: &ParentFacets,
) -> DataPoll<PointerUpdates> {
    unimplemented!()
}

#[derive(Debug)]
enum GetFacetsError<DBError> {
    InvalidDBState(String),
    IntegratorDivergence(String),
    DBError(DBError),
}

async fn get_parent_facets<DB : Database>(
    db: &DB,
    parent_commits: &Parents,
) -> Result<ParentFacets, GetFacetsError<DB::Error>> {
    let commit_ids: BTreeSet<CommitId> = parent_commits
        .facets
        .values()
        .filter_map(|f| f.clone())
        .collect();
    let mut commit_map: BTreeMap<CommitId, Commit<pt::AnyAction, DB::CommitId>> = btreemap![];
    for commit_id in &commit_ids {
        commit_map.insert(
            commit_id.to_owned(),
            db.lookup(commit_id)
                .await
                        .map_err(GetFacetsError::DBError)?
                .ok_or_else(|| GetFacetsError::InvalidDBState("No such commit".to_string()))?,
        );
    }

    unimplemented!()
}

fn game_facet_id(game_id: &str) -> FacetId {
    FacetId(format!("games/{}", game_id))
}

async fn get_facets_for_commit<DB: Database>(
    db: &DB,
    commit_id: &CommitId,
) -> Result<BTreeMap<FacetId, Facet>, GetFacetsError<DB::Error>> {
    let commit = db
        .lookup(&commit_id)
        .await
        .map_err(GetFacetsError::DBError)?
        .ok_or_else(|| GetFacetsError::InvalidDBState("No such commit".to_string()))?;
    let parent_facets = get_parent_facets(db, &commit.previous).await?;

    let (game_id, game) =
        pictophone_user_integrate(Action::from_proto(commit.payload), &parent_facets)
            .result
            .ok_or_else(|| {
                GetFacetsError::IntegratorDivergence("integrator requested more resources than it originally did".to_string())
            })?
            .map_err(|_| GetFacetsError::IntegratorDivergence("commit ref pointed to action that errored".to_string()))?
            .ok_or_else(|| GetFacetsError::IntegratorDivergence("commit ref pointed to action that changed nothing".to_string()))?;

    Ok(btreemap![
        game_facet_id(&game_id) => Facet { game }])
}

mod deps {
    use super::*;

    pub(super) fn get_game(parents: &ParentFacets, game_id: &str) -> DataPoll<Option<Game>> {
        let facet_id = FacetId(format!("games/{}", game_id));
        let needs = SnapshotRequest {
            facet_ids: btreeset![facet_id.clone()],
            collection_ids: btreeset![],
        };
        match parents.facets.get(&facet_id) {
            None => DataPoll {
                result: None,
                parents: needs,
            },
            Some(maybe_facet) => DataPoll {
                result: Some(maybe_facet.as_ref().map(|f| f.game.clone())),
                parents: needs,
            },
        }
    }
    pub(super) fn get_short_code(
        parents: &ParentFacets,
        short_code_id: &str,
    ) -> DataPoll<Option<()>> {
        let collection_id = CollectionId(format!("shortCode/{}", short_code_id));
        let needs = SnapshotRequest {
            facet_ids: btreeset![],
            collection_ids: btreeset![collection_id.clone()],
        };
        let short_code_id = short_code_id.to_string();
        if parents.collections.contains(&collection_id) {
            DataPoll {
                result: None,
                parents: needs,
            }
        } else {
            for (facet_id, maybe_facet) in &parents.facets {
                if let Some(facet) = maybe_facet {
                    let share = extract_short_code_share(&short_code_id, facet_id, facet);
                    if share.is_some() {
                        return DataPoll {
                            result: Some(Some(())),
                            parents: needs,
                        };
                    }
                }
            }
            DataPoll {
                result: None,
                parents: needs,
            }
        }
    }
}

struct DataPoll<T> {
    result: Option<T>,
    parents: SnapshotRequest,
}

struct ParentFacets {
    facets: BTreeMap<FacetId, Option<Facet>>,
    collections: BTreeSet<CollectionId>,
}

fn extract_short_code_share(short_code: &str, facet_id: &FacetId, facet: &Facet) -> Option<()> {
    let sc = match &facet.game {
        Game::Unstarted { short_code, .. } => Some(short_code),
    }?;

    if *sc == *short_code {
        Some(())
    } else {
        None
    }
}

enum Action {
    CreateGame { game_id: String, short_code: String },
    // JoinGame {
    //     game_id: String,
    //     player_id: String,
    // }
}

impl Action {
    fn from_proto(any_action: pt::AnyAction) -> Action {
        unimplemented!()
    }
}

enum ApplicationError {
    GameAlreadyExists,
    GameNotFound,
    ShortCodeInUse,
}

#[derive(Clone)]
enum Game {
    Unstarted {
        players: Vec<String>,
        short_code: String,
    },
}

type PictophoneResult = Result<Option<(String, Game)>, ApplicationError>;

fn data_join<A, B>(a: DataPoll<A>, b: DataPoll<B>) -> DataPoll<(A, B)> {
    let mut parents = a.parents;
    parents.extend(b.parents);
    match (a.result, b.result) {
        (Some(aa), Some(bb)) => DataPoll {
            result: Some((aa, bb)),
            parents,
        },
        _ => DataPoll {
            result: None,
            parents,
        },
    }
}

fn pictophone_user_integrate(action: Action, parents: &ParentFacets) -> DataPoll<PictophoneResult> {
    match action {
        Action::CreateGame {
            game_id,
            short_code,
        } => {
            let game_fetch = deps::get_game(parents, &game_id);
            let short_code_fetch = deps::get_short_code(parents, &short_code);

            let DataPoll { result, parents } = data_join(game_fetch, short_code_fetch);

            match result {
                None => DataPoll {
                    result: None,
                    parents,
                },
                Some((game, sc)) => {
                    let mk_res = move |result| DataPoll {
                        result: Some(result),
                        parents,
                    };

                    if game.is_some() {
                        return mk_res(Err(ApplicationError::GameAlreadyExists));
                    }
                    if sc.is_some() {
                        return mk_res(Err(ApplicationError::ShortCodeInUse));
                    }
                    mk_res(Ok(Some((
                        game_id.clone(),
                        Game::Unstarted {
                            short_code: short_code.clone(),
                            players: vec![],
                        },
                    ))))
                }
            }
        } // Action::JoinGame{game_id, player_id} => {
          //     let game = deps.get(deps::get_game(game_id)).ok_or()?;

          // }}
    }
}