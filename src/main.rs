#![allow(dead_code, unused_imports, unused_variables)]
// #![feature(async_closure)]
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
mod proto;
// use futures::Future;
use proto::*;
use std::path;
//
use maplit::{btreemap, btreeset};

mod firestore_values;

use firestore_client::FirestoreClient;
use google::firestore::v1::*;

#[derive(Debug)]
pub struct MyGreeter {
    client: Database,
}

async fn retry_until_ok<Fut, FutFn, RetryFut, RetryFutFn>(
    mut factory: FutFn,
    mut retry: RetryFutFn,
) -> Fut::Ok
where
    Fut: futures::TryFuture,
    FutFn: FnMut() -> Fut,
    RetryFut: futures::Future,
    RetryFutFn: FnMut(Fut::Error) -> RetryFut,
{
    loop {
        match factory().into_future().await {
            Result::Ok(value) => return value,
            Result::Err(err) => {
                retry(err).await;
            }
        }
    }
}

trait TypedString: Sized {
    fn new(s: String) -> Self;
    fn as_str(&self) -> &str;

    fn parent(&self) -> Option<Self> {
        use itertools::Itertools;
        let s = self.as_str();
        if s.is_empty() {
            None
        } else {
            let split = s.split("/").collect::<Vec<&str>>();
            let new_len = split.len() - 1;
            Some(Self::new(
                split.into_iter().take(new_len).intersperse("/").collect(),
            ))
        }
    }

    fn file_name(&self) -> Option<&str> {
        let s = self.as_str();
        if s.is_empty() {
            None
        } else {
            let split = s.split("/").collect::<Vec<&str>>();
            split.last().map(|s| *s)
        }
    }
}

macro_rules! typed_path {
    ($name:ident) => {
        #[derive(Serialize, Deserialize, PartialEq, Eq, PartialOrd, Ord, Debug, Clone)]
        struct $name(String);

        impl TypedString for $name {
            fn new(s: String) -> Self {
                Self(s)
            }
            fn as_str(&self) -> &str {
                &self.0
            }
        }
    };
}

// enum ParseDocumentError {
//     NoDataField,
//     DataFieldNotString,
//     SerdeJson(serde_json::Error),
// }

// impl From<serde_json::Error> for ParseDocumentError {
//     fn from(err: serde_json::Error) -> ParseDocumentError {
//         ParseDocumentError::SerdeJson(err)
//     }
// }

// fn parse_document<'a, P : Deserialize<'a>>(doc : Document) -> Result<P, ParseDocumentError> {

// }

//         struct $name(String);

//         impl<P: IntoIterator> $name<P> {
//             // fn as_path(&self) -> &path::Path {
//             //     return self.0.as_ref();
//             // }

//       fn as_str(&self) -> &str {
//  &self.0
//             }

//             fn parent(&self) -> Option<$name<&path::Path>> {
//                 if self.0.is_empty() {
//                     None
//                 } else {
//                 let split = self.0.split("/");

//                 self.as_path().parent().map(|p| $name(p))

//                 }

//             }

//             fn join<P2: AsRef<path::Path>>(&self, p2 : P2) -> $name<path::PathBuf> {
//     $name(self.as_path().join(p2))
//             }
//         }

//         impl<P: Into<path::PathBuf>> From<P> for $name<path::PathBuf> {
//             fn from(s: P) -> $name<path::PathBuf> {
//                 $name(s.into())
//             }
//         }
//     };
// }

typed_path![FacetId];
typed_path![CollectionId];
typed_path![CommitId];

// struct FacetIdBuf(path::PathBuf);

// impl <P : AsRef<path::Path>> FacetId<P> {
//     fn new(p: P) -> FacetId<P> {
//         FacetId(p)
//     }
// }

#[derive(Deserialize, Debug)]
struct CollectionMember {
    facet_id: FacetId,
}

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

#[derive(Clone, Debug)]
struct Database {
    client: FirestoreClient<Channel>,
    db_base: String,
}

enum CommitError {
    TransactionConflict(String),
    Status(Status),
}

impl Database {
    fn new(client: FirestoreClient<Channel>, project_id: &str) -> Database {
        Database {
            client,
            db_base: format!("projects/{}/databases/(default)/documents/", project_id),
        }
    }

    async fn get_parents(
        &self,
        req: &ParentsRequest,
    ) -> Result<(Parents, TransactionContext), Status> {
        // let mut facets_to_get: BTreeSet<FacetId> = futures::stream::iter(req.collections.iter())
        //     .flat_map(|collection_id| db.collection_members(collection_id).into_stream())
        //     .try_collect()
        //     .await?;
        // facets_to_get.extend(req.facets.iter().cloned());

        // let facets = futures::stream::iter(facets_to_get.into_iter())
        //     .map(|facet_id| async move {
        //         db.facet_version(&facet_id)
        //             .await
        //             .map(|commit_id| (facet_id, commit_id))
        //     })
        //     .buffer_unordered(10)
        //     .try_collect()
        //     .await?;

        // Ok(Parents {
        //     facets,
        //     collections: req.collections.iter().cloned().collect(),
        // })
        unimplemented!()
    }

    async fn commit(
        &self,
        tx: &TransactionContext,
        commit_id: &CommitId,
        commit: &Commit,
        ptr_updates: &PointerUpdates,
    ) -> Result<(), CommitError> {
        unimplemented!();
    }

    async fn get_commit(&self, commit_id: &CommitId) -> Result<Option<Commit>, Status> {
        let doc_path: String = format!("{}/{}", self.db_base, commit_id.as_str());
        let req = GetDocumentRequest {
            name: doc_path,
            mask: None,
            consistency_selector: None,
        };

        let doc_res = self.client.clone().get_document(req).await;

        match doc_res {
            Err(e) => {
                if e.code() == tonic::Code::NotFound {
                    Ok(None)
                } else {
                    Err(e)
                }
            }
            Ok(doc) => firestore_values::from_document(&doc.into_inner())
                .map_err(|e| Status::internal(format!("{:?}", e))),
        }
    }

    async fn facet_version(&self, facet_id: &FacetId) -> Result<Option<CommitId>, Status> {
        let doc_path: String = format!("{}/{}", self.db_base, facet_id.as_str());
        let req = GetDocumentRequest {
            name: doc_path,
            mask: None,
            consistency_selector: None,
        };

        let doc_res = self.client.clone().get_document(req).await;

        match doc_res {
            Err(e) => {
                if e.code() == tonic::Code::NotFound {
                    Ok(None)
                } else {
                    Err(e)
                }
            }
            Ok(doc) => firestore_values::from_document(&doc.into_inner())
                .map_err(|e| Status::internal(format!("{:?}", e))),
        }
    }

    fn collection_members(
        &self,
        collection_id: &CollectionId,
    ) -> impl futures::TryStream<Ok = FacetId, Error = Status> {
        let doc_path: String = format!(
            "{}/{}",
            self.db_base,
            collection_id.parent().unwrap().as_str()
        );
        let collection_id = collection_id.file_name().unwrap().to_string();

        let client = self.client.clone();

        let list_given_page_token = move |page_token: String| {
            let doc_path = doc_path.clone();
            let collection_id = collection_id.clone();
            let client = client.clone();
            async move {
                let req = ListDocumentsRequest {
                    parent: doc_path,
                    collection_id: collection_id,
                    page_token: page_token,
                    order_by: "".to_string(),
                    mask: None,
                    consistency_selector: None,
                    page_size: 10,
                    show_missing: false,
                };

                let list = client.clone().list_documents(req).await?;
                let resp = list.into_inner();

                if resp.documents.is_empty() {
                    Ok::<Option<(Vec<Document>, String)>, Status>(None)
                } else {
                    Ok(Some((resp.documents, resp.next_page_token)))
                }
            }
        };

        let docs = futures::stream::try_unfold("".to_string(), list_given_page_token)
            .map_ok(|docs| futures::stream::iter(docs).map(Ok))
            .try_flatten();

        docs.and_then(|doc| {
            let id: Result<FacetId, firestore_values::DeserializeError> =
                firestore_values::from_document(&doc);
            async move { id.map_err(|e| Status::internal(format!("{:?}", e))) }
        })
    }
}

// struct MergeAll<St> {
//     stream : St
//     buffer_size: usize
// }

// impl <St> Stream for MergeAll<St>
// where St : Stream,
//     <St as Stream>::Item : Stream {
//         fn
// }

#[derive(Clone)]
struct ParentsRequest {
    facets: BTreeSet<FacetId>,
    collections: BTreeSet<CollectionId>,
}

impl ParentsRequest {
    fn is_subset_of(&self, other: &ParentsRequest) -> bool {
        self.facets.is_subset(&other.facets) && self.collections.is_subset(&other.collections)
    }

    fn extend(&mut self, other: ParentsRequest) {
        self.facets.extend(other.facets.into_iter());
        self.collections.extend(other.collections.into_iter());
    }
}

#[derive(Serialize, Deserialize)]
struct Parents {
    facets: BTreeMap<FacetId, Option<CommitId>>,
    collections: BTreeSet<CollectionId>,
}

struct TransactionContext {
    precondition: BTreeMap<String, Precondition>,
}

#[derive(Serialize, Deserialize)]
struct Commit {
    action: pt::AnyAction,
    parents: Parents,
}

#[derive(Serialize, Deserialize)]
struct Collection {
    members: Vec<FacetId>,
}

impl Serialize for pt::AnyAction {
    fn serialize<S>(&self, serializer: S) -> Result<S::Ok, S::Error>
    where
        S: serde::Serializer,
    {
        use prost::Message;
        use serde::ser::Error;
        let mut buf = vec![];
        let serialized = self.encode(&mut buf).map_err(Error::custom)?;
        serializer.serialize_bytes(&buf)
    }
}

impl<'de> Deserialize<'de> for pt::AnyAction {
    fn deserialize<D>(deserializer: D) -> Result<Self, D::Error>
    where
        D: Deserializer<'de>,
    {
        use prost::Message;
        use serde::de::Error;
        let buf: Vec<u8> = Deserialize::deserialize(deserializer)?;
        Self::decode(buf.as_slice()).map_err(Error::custom)
    }
}

fn new_commit_id(commit: &Commit) -> CommitId {
    use chrono::prelude::Utc;
    let dt_part = Utc::now().to_rfc3339();

    unimplemented!();
}

// fn

async fn do_action(
    db: &Database,
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

#[tonic::async_trait]
impl Pictophone10 for MyGreeter {
    async fn join_game(
        &self,
        request: Request<pt::JoinGameRequest>,
    ) -> Result<Response<pt::Empty>, Status> {
        do_action(
            &self.client,
            pt::AnyAction {
                version: Some(pt::any_action::Version::V10(pt::Action10 {
                    action: Some(pt::action1_0::Action::Join(request.into_inner())),
                })),
            },
        )
        .await

        // let commit_doc = Document {
        //     name: "".into(),
        //     fields: firestore_values::to_document(&commit).unwrap(),
        //     create_time: None,
        //     update_time: None,
        // };
        //         let res = self
        //             .create_document(CreateDocumentRequest {
        //                 parent,
        //                 collection_id,
        //                 document_id,
        //                 document,
        //                 mask: None,
        //             })
        //             .await
        //             .unwrap();
        //         res.into_inner()
        //         //    Ok(res.into_inner())
    }

    async fn start_game(
        &self,
        request: Request<pt::StartGameRequest>,
    ) -> Result<Response<pt::Empty>, Status> {
        unimplemented!()
    }
    async fn make_move(
        &self,
        request: Request<pt::MakeMoveRequest>,
    ) -> Result<Response<pt::Empty>, Status> {
        unimplemented!()
    }

    type GetGameStream = mpsc::Receiver<Result<pt::GetGameResponse, Status>>;

    async fn get_game(
        &self,
        request: Request<pt::GetGameRequest>,
    ) -> Result<Response<Self::GetGameStream>, Status> {
        unimplemented!()
    }
}

#[derive(Clone)]
struct Facet {
    game: Game,
}

// struct Needs {
//     facets: Vec<FacetId>,
//     collections: Vec<CollectionId>,
// }

// struct Dependencies {
//     facets: Vec<FacetId>,
//     facets: HashMap<FacetId, Option<Facet>>,
//     complete_collections: HashSet<CollectionId>,
// }

struct PointerUpdates {
    changed_facets: Vec<FacetId>,
    added_memberships: Vec<(FacetId, CollectionId)>,
    removed_memberships: Vec<(FacetId, CollectionId)>,
}

fn update_structure(
    action: &pictophone::AnyAction,
    parents: &ParentFacets,
) -> DataPoll<PointerUpdates> {
    unimplemented!()
}

async fn get_parent_facets(
    db: &Database,
    parent_commits: &Parents,
) -> Result<ParentFacets, Status> {
    let commit_ids: BTreeSet<CommitId> = parent_commits
        .facets
        .values()
        .filter_map(|f| f.clone())
        .collect();
    let mut commit_map: BTreeMap<CommitId, Commit> = btreemap![];
    for commit_id in &commit_ids {
        commit_map.insert(
            commit_id.to_owned(),
            db.get_commit(commit_id)
                .await?
                .ok_or_else(|| Status::internal("No such commit"))?,
        );
    }

    unimplemented!()
}

fn game_facet_id(game_id: &str) -> FacetId {
    FacetId(format!("games/{}", game_id))
}

async fn get_facets_for_commit(
    db: &Database,
    commit_id: &CommitId,
) -> Result<BTreeMap<FacetId, Facet>, Status> {
    let commit = db
        .get_commit(&commit_id)
        .await?
        .ok_or_else(|| Status::internal("No such commit"))?;
    let parent_facets = get_parent_facets(db, &commit.parents).await?;

    let (game_id, game) =
        pictophone_user_integrate(Action::from_proto(commit.action), &parent_facets)
            .result
            .ok_or_else(|| {
                Status::internal("integrator requested more resources than it originally did")
            })?
            .map_err(|_| Status::internal("commit ref pointed to action that errored"))?
            .ok_or_else(|| Status::internal("commit ref pointed to action that changed nothing"))?;

    Ok(btreemap![
        game_facet_id(&game_id) => Facet { game }])
}

mod deps {
    use super::*;

    pub(super) fn get_game(parents: &ParentFacets, game_id: &str) -> DataPoll<Option<Game>> {
        let facet_id = FacetId(format!("games/{}", game_id));
        let needs = ParentsRequest {
            facets: btreeset![facet_id.clone()],
            collections: btreeset![],
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
        let needs = ParentsRequest {
            facets: btreeset![],
            collections: btreeset![collection_id.clone()],
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
    parents: ParentsRequest,
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
enum NewClientError {
    GcpAuth(gcp_auth::GCPAuthError),
    InvalidHeader(tonic::metadata::errors::InvalidMetadataValue),
    Transport(tonic::transport::Error),
}
impl From<gcp_auth::GCPAuthError> for NewClientError {
    fn from(err: gcp_auth::GCPAuthError) -> NewClientError {
        NewClientError::GcpAuth(err)
    }
}
impl From<tonic::metadata::errors::InvalidMetadataValue> for NewClientError {
    fn from(err: tonic::metadata::errors::InvalidMetadataValue) -> NewClientError {
        NewClientError::InvalidHeader(err)
    }
}
impl From<tonic::transport::Error> for NewClientError {
    fn from(err: tonic::transport::Error) -> NewClientError {
        NewClientError::Transport(err)
    }
}

async fn new_client() -> Result<FirestoreClient<Channel>, NewClientError> {
    let authentication_manager = gcp_auth::init().await.unwrap();
    let token = authentication_manager
        .get_token(&["https://www.googleapis.com/auth/cloud-platform"])
        .await?;
    let token_meta = MetadataValue::from_str(&format!("Bearer {}", token.as_str()))?;

    let endpoint =
        Channel::from_static(ENDPOINT).tls_config(ClientTlsConfig::new().domain_name(DOMAIN));
    let channel = endpoint.connect().await?;
    Ok(firestore_client::FirestoreClient::with_interceptor(
        channel,
        move |mut req: Request<()>| {
            req.metadata_mut()
                .insert("authorization", token_meta.clone());
            Ok(req)
        },
    ))
}

fn retry(e: NewClientError) -> impl futures::Future {
    tokio::time::delay_for(Duration::new(1, 0))
}

#[tokio::main]
async fn main() -> Result<(), Box<dyn std::error::Error>> {
    let addr = "0.0.0.0:8080".parse()?;
    let greeter = MyGreeter {
        client: Database::new(retry_until_ok(new_client, retry).await, "pictophone-test"),
    };

    println!("Boom, running on: {}", addr);

    println!(
        "{:?}",
        greeter.client.client.clone().create_document2().await
    );

    Server::builder()
        .add_service(Pictophone10Server::new(greeter))
        .serve(addr)
        .await?;

    Ok(())
}
// impl firestore_client::FirestoreClient<Channel> {
//     async fn create_document2(&mut self) -> Document {
//         let project_id = "pictophone-test";
//         let parent = format!("projects/{}/databases/(default)/documents", project_id);
//         let collection_id = "greetings".into();
//         let document_id = "".into();
//         let mut fields = HashMap::new();
//         fields.insert(
//             "message".into(),
//             Value {
//                 value_type: Some(value::ValueType::StringValue(
//                     "Hello world from CloudRun!".into(),
//                 )),
//             },
//         );
//         let document = Some(Document {
//             name: "".into(),
//             fields,
//             create_time: None,
//             update_time: None,
//         });
//         let res = self
//             .create_document(CreateDocumentRequest {
//                 parent,
//                 collection_id,
//                 document_id,
//                 document,
//                 mask: None,
//             })
//             .await
//             .unwrap();
//         res.into_inner()
//         //    Ok(res.into_inner())
//     }
// }

#[derive(Serialize, Deserialize)]
struct FakeData {
    foo: String,
}
impl firestore_client::FirestoreClient<Channel> {
    async fn create_document2(&mut self) -> CommitResponse {
        let project_id = "pictophone-test";
        let parent = format!("projects/{}/databases/(default)", project_id);
        // let collection_id = "greetings".into();
        // let document_id = "".into();
        // let mut fields = HashMap::new();
        // fields.insert(
        //     "message".into(),
        //     Value {
        //         value_type: Some(value::ValueType::StringValue(
        //             "Hello world from CloudRun!".into(),
        //         )),
        //     },
        // );
        let document = Document {
            name: "projects/pictophone-test/databases/(default)/documents/games/aa/actions/02020-06-27T21:01:33.858Z90388966".into(),
            fields: Default::default(),
            create_time: None,
            update_time: None,
        };
        let check = Write {
            operation: Some(write::Operation::Update(document)),
            update_mask: Some(DocumentMask {
                field_paths: vec![],
            }),
            update_transforms: vec![],
            current_document: Some(Precondition {
                condition_type: Some(precondition::ConditionType::UpdateTime(
                    prost_types::Timestamp {
                        seconds: 1593291694,
                        nanos: 37231000,
                    },
                )),
            }),
        };
        let fake_data = FakeData {
            foo: "bar".to_string(),
        };
        let write = Write {
        operation: Some(write::Operation::Update(Document {
            name: "projects/pictophone-test/databases/(default)/documents/games/aa/actions/testtest".into(),
            fields: firestore_values::to_document(&fake_data).unwrap(),
            create_time: None,
            update_time: None,
        })),
        update_mask: None,
    update_transforms: vec![],
    current_document: None,
    };

        let res = self
            .commit(CommitRequest {
                database: parent,
                writes: vec![check, write],
                transaction: vec![],
            })
            .await
            .unwrap();
        res.into_inner()
        //    Ok(res.into_inner())
    }
}
