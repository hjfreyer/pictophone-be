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
use serde::{Deserialize, Serialize};
use std::collections::{BTreeMap, BTreeSet, HashMap, HashSet};
use std::time::Duration;
use tokio::sync::mpsc;
use tokio::time::interval;
mod proto;
// use futures::Future;
use proto::*;
use std::path;
//

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
    // `()` indicates that the macro takes no argument.
    ($name:ident) => {
        #[derive(Deserialize, PartialEq, Eq, PartialOrd, Ord, Debug, Clone)]
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

impl Database {
    fn new(client: FirestoreClient<Channel>, project_id: &str) -> Database {
        Database {
            client,
            db_base: format!("projects/{}/databases/(default)/documents/", project_id),
        }
    }

    async fn get_commit(commit_id: &CommitId) -> Result<Commit, Status> {
        unimplemented!();
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

struct ParentsRequest {
    facets: Vec<FacetId>,
    collections: Vec<CollectionId>,
}

struct Parents {
    facets: BTreeMap<FacetId, Option<CommitId>>,
    collections: BTreeSet<CollectionId>,
}

struct Commit {
    payload: pt::AnyAction,
    parents: Parents,
}

async fn get_parents(db: &Database, req: &ParentsRequest) -> Result<Parents, Status> {
    let mut facets_to_get: BTreeSet<FacetId> = futures::stream::iter(req.collections.iter())
        .flat_map(|collection_id| db.collection_members(collection_id).into_stream())
        .try_collect()
        .await?;
    facets_to_get.extend(req.facets.iter().cloned());

    let facets = futures::stream::iter(facets_to_get.into_iter())
        .map(|facet_id| async move {
            db.facet_version(&facet_id)
                .await
                .map(|commit_id| (facet_id, commit_id))
        })
        .buffer_unordered(10)
        .try_collect()
        .await?;

    Ok(Parents {
        facets,
        collections: req.collections.iter().cloned().collect(),
    })
}

#[tonic::async_trait]
impl Pictophone10 for MyGreeter {
    async fn join_game(
        &self,
        request: Request<pt::JoinGameRequest>,
    ) -> Result<Response<pt::Empty>, Status> {
        // let action10 = pt::Action10 {
        //     action: Some(pt::action1_0::Action::Join(request.into_inner())),
        // };
        // let any_action = pt::AnyAction {
        //     version: Some(pt::any_action::Version::V10(action10)),
        // };

        // let mut previous_facet_versions = HashMap::<String, Option<String>>::new();
        // let mut previous_facets = HashMap::new();
        // let mut complete_collections = HashSet::new();
        // loop {
        //     match integrate(&any_action, &previous_facets, &complete_collections) {
        //         Ok(facet) => unimplemented!(),
        //         Err(IntegrationError::ApplicationError(status)) => return Err(status),
        //         Err(IntegrationError::NeedMore(needs)) => {
        //             meet_needs(
        //                 &self.client,
        //                 &needs,
        //                 &mut previous_facet_versions,
        //                 &mut previous_facets,
        //                 &mut complete_collections,
        //             )
        //             .await
        //         }
        //     }
        // }
        unimplemented!();
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

struct Facet {}

// struct Needs {
//     facets: Vec<FacetId>,
//     collections: Vec<CollectionId>,
// }

// struct Dependencies {
//     facets: Vec<FacetId>,
//     facets: HashMap<FacetId, Option<Facet>>,
//     complete_collections: HashSet<CollectionId>,
// }

enum IntegrationError {
    ApplicationError(Status),
    NeedMore(ParentsRequest),
}

// fn integrate(
//     action: &pictophone::AnyAction,
//     previous_facets: &HashMap<FacetId, Option<Facet>>,
//     complete_collections: &HashSet<CollectionId>,
// ) -> Result<Facet, IntegrationError> {
//     unimplemented!();
// }

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

    // client.create_document2().await;

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
