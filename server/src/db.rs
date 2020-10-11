#![allow(dead_code,  unused_variables)]
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
// use futures::Future;

use crate::proto::*;
use core::convert::Infallible;
use std::path;
//
use maplit::{btreemap, btreeset};

use firestore_client::FirestoreClient;
use google::firestore::v1::*;

pub trait TypedString: Sized {
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
        pub struct $name(pub String);

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

typed_path![FacetId];
typed_path![CollectionId];
typed_path![CommitIdOld];

#[derive(Clone)]
pub struct SnapshotRequest {
    pub facet_ids: BTreeSet<FacetId>,
    pub collection_ids: BTreeSet<CollectionId>,
}

impl SnapshotRequest {
    pub fn is_subset_of(&self, other: &SnapshotRequest) -> bool {
        self.facet_ids.is_subset(&other.facet_ids)
            && self.collection_ids.is_subset(&other.collection_ids)
    }

    pub fn extend(&mut self, other: SnapshotRequest) {
        self.facet_ids.extend(other.facet_ids.into_iter());
        self.collection_ids.extend(other.collection_ids.into_iter());
    }
}

#[derive(Clone)]
pub struct Snapshot<CommitId> {
    facets: BTreeMap<FacetId, Option<CommitId>>,
    complete_collection_ids: BTreeSet<CollectionId>,
}

pub trait TransactionContext {
    type CommitId: Clone;
    fn snapshot(&self) -> Snapshot<Self::CommitId>;
}

#[derive(Clone)]
pub struct Commit<Payload, CommitId> {
    payload: Payload,
    previous: Snapshot<CommitId>,
}

pub enum CommitError<E> {
    TransactionConflict,
    DatabaseError(E),
}

pub struct FacetUpdate {
    added_memberships: BTreeSet<CollectionId>,
    removed_memberships: BTreeSet<CollectionId>,
}

#[tonic::async_trait]
pub trait Database {
    type Payload;
    type CommitId;
    type TxCtx: TransactionContext;
    type Error;

    async fn start_transaction(&self, req: SnapshotRequest) -> Result<Self::TxCtx, Self::Error>;

    async fn commit_transaction(
        &mut self,
        tx: Self::TxCtx,
        payload: Self::Payload,
        updates: BTreeMap<FacetId, FacetUpdate>,
    ) -> Result<Self::CommitId, CommitError<Self::Error>>;

    async fn lookup(
        &self,
        commit_id: &Self::CommitId,
    ) -> Result<Option<Commit<Self::Payload, Self::CommitId>>, Self::Error>;
}

mod local {
    use super::*;

    pub struct TransactionContext {
        num_commits: usize,
        snapshot: Snapshot<usize>,
    }

    impl super::TransactionContext for TransactionContext {
        type CommitId = usize;
        fn snapshot(&self) -> Snapshot<Self::CommitId> {
            self.snapshot.clone()
        }
    }

    #[derive(Default)]
    pub struct Database<Payload> {
        commits: Vec<Commit<Payload, usize>>,
        facet_heads: BTreeMap<FacetId, usize>,
        collections: BTreeMap<CollectionId, BTreeSet<FacetId>>,
    }

    #[tonic::async_trait]
    impl<Payload: Clone + Send + Sync> super::Database for Database<Payload> {
        type Payload = Payload;
        type CommitId = usize;
        type TxCtx = TransactionContext;
        type Error = Infallible;

        async fn start_transaction(
            &self,
            req: SnapshotRequest,
        ) -> Result<Self::TxCtx, Self::Error> {
            use itertools::Itertools;

            let all_facet_ids: BTreeSet<FacetId> = req
                .collection_ids
                .iter()
                .map(|collection_id| {
                    self.collections
                        .get(collection_id)
                        .cloned()
                        .unwrap_or_default()
                })
                .chain(std::iter::once(req.facet_ids))
                .concat();

            let complete_collection_ids = req.collection_ids;
            let facets = all_facet_ids
                .into_iter()
                .map(|facet_id| {
                    let commit = self.facet_heads.get(&facet_id).cloned();
                    (facet_id, commit)
                })
                .collect();

            Ok(TransactionContext {
                num_commits: self.commits.len(),
                snapshot: Snapshot {
                    facets,
                    complete_collection_ids,
                },
            })
        }

        async fn commit_transaction(
            &mut self,
            tx: Self::TxCtx,
            payload: Self::Payload,
            updates: BTreeMap<FacetId, FacetUpdate>,
        ) -> Result<Self::CommitId, CommitError<Self::Error>> {
            if self.commits.len() != tx.num_commits {
                Err(CommitError::TransactionConflict)
            } else {
                let commit_id = self.commits.len();
                for (facet_id, facet_update) in updates.iter() {
                    self.facet_heads.insert(facet_id.to_owned(), commit_id);
                    for added in &facet_update.added_memberships {
                        match self.collections.get_mut(&added) {
                            None => {
                                self.collections
                                    .insert(added.to_owned(), btreeset![facet_id.to_owned()]);
                            }
                            Some(collection) => {
                                collection.insert(facet_id.to_owned());
                            }
                        }
                    }
                    for removed in &facet_update.removed_memberships {
                        match self.collections.get_mut(&removed) {
                            None => (),
                            Some(collection) => {
                                collection.remove(facet_id);
                            }
                        }
                    }
                }
                self.commits.push(Commit {
                    payload,
                    previous: tx.snapshot,
                });
                Ok(commit_id)
            }
        }

        async fn lookup(
            &self,
            commit_id: &Self::CommitId,
        ) -> Result<Option<Commit<Self::Payload, Self::CommitId>>, Self::Error> {
            Ok(self.commits.get(*commit_id).cloned())
        }
    }
}
