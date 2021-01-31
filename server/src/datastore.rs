use crate::{proto::dolt::VersionedActionRequestBytes, util::aovec};
use fs::firestore_client::FirestoreClient;
use futures::{Future, Stream};
use googapis::google::firestore::v1 as fs;
use log::{trace, warn};
use maplit::hashmap;
use std::{
    pin::Pin,
    sync::{Arc, RwLock},
};

#[tonic::async_trait]
pub trait Datastore {
    async fn push_action(&self, action: VersionedActionRequestBytes) -> anyhow::Result<u64>;

    type LogStream: Stream<Item = anyhow::Result<VersionedActionRequestBytes>> + Send + Sync + Unpin;
    async fn watch_log(&self) -> anyhow::Result<Self::LogStream>;
}

pub fn local() -> Local {
    Local {
        actions: aovec::AOVec::new(),
    }
}

pub struct Local {
    actions: aovec::AOVec<VersionedActionRequestBytes>,
}

#[tonic::async_trait]
impl Datastore for Local {
    async fn push_action(&self, action: VersionedActionRequestBytes) -> anyhow::Result<u64> {
        use std::convert::TryInto;
        Ok(self.actions.push(action).await.try_into().unwrap())
    }

    type LogStream =
        Pin<Box<dyn Stream<Item = anyhow::Result<VersionedActionRequestBytes>> + Send + Sync>>;

    async fn watch_log(&self) -> anyhow::Result<Self::LogStream> {
        todo!()
    }
}

pub fn firestore(
    client: FirestoreClient<tonic::transport::Channel>,
    database_name: String,
) -> Arc<Firestore> {
    Arc::new(Firestore {
        handle: FirestoreHandle {
            client,
            database_name,
        },
        cache: Default::default(),
    })
}

pub struct Firestore {
    handle: FirestoreHandle,
    cache: RwLock<
        Vec<
            futures::future::Shared<
                futures::future::BoxFuture<'static, VersionedActionRequestBytes>,
            >,
        >,
    >,
}

#[derive(Clone)]
struct FirestoreHandle {
    client: FirestoreClient<tonic::transport::Channel>,
    database_name: String,
}

#[derive(Debug, serde::Serialize, serde::Deserialize)]
struct ActionMetadata {
    #[serde(default)]
    count: u64,
}

#[derive(Debug, serde::Serialize, serde::Deserialize)]
struct ActionRecord {
    #[serde(default)]
    serialized: serde_bytes::ByteBuf,
}

impl FirestoreHandle {
    fn metadata_doc_name(&self) -> String {
        format!("{}/documents/metadata/actions", self.database_name)
    }
    fn action_doc_name(&self, index: u64) -> String {
        format!("{}/documents/actions/{}", self.database_name, index)
    }

    async fn fetch_action_metadata(
        self,
        consistency_selector: Option<fs::get_document_request::ConsistencySelector>,
    ) -> anyhow::Result<ActionMetadata> {
        let mut client = self.client.to_owned();
        let resp = client
            .get_document(fs::GetDocumentRequest {
                name: self.metadata_doc_name(),
                mask: None,
                consistency_selector,
            })
            .await;
        let doc = match resp {
            Ok(response) => response.into_inner(),
            Err(status) if status.code() == tonic::Code::NotFound => {
                return Ok(ActionMetadata { count: 0 })
            }
            Err(status) => return Err(status.into()),
        };

        Ok(serde_firestore::from_doc(&doc)?)
    }

    // Not found => error
    async fn fetch_action(self, index: u64) -> anyhow::Result<VersionedActionRequestBytes> {
        let doc = self
            .client
            .clone()
            .get_document(fs::GetDocumentRequest {
                name: self.action_doc_name(index),
                mask: None,
                consistency_selector: None,
            })
            .await?
            .into_inner();

        let action: ActionRecord = serde_firestore::from_doc(&doc)?;

        Ok(VersionedActionRequestBytes::new(action.serialized.to_vec()))
    }

    async fn watch_log_len(self) -> anyhow::Result<impl Stream<Item = anyhow::Result<u64>>> {
        use futures::StreamExt;
        use futures::TryStreamExt;

        let mut req = tonic::Request::new(
            futures::stream::iter(vec![fs::ListenRequest {
                database: self.database_name.clone(),
                labels: Default::default(),
                target_change: Some(fs::listen_request::TargetChange::AddTarget(fs::Target {
                    target_id: 1,
                    once: false,
                    target_type: Some(fs::target::TargetType::Documents(
                        fs::target::DocumentsTarget {
                            documents: vec![self.metadata_doc_name().clone()],
                        },
                    )),
                    resume_type: None,
                })),
            }])
            .chain(futures::stream::pending()),
        );
        req.metadata_mut().insert(
            "google-cloud-resource-prefix",
            tonic::metadata::MetadataValue::from_str(&self.database_name)?,
        );
        let stream = self.client.clone().listen(req).await?.into_inner();
        let doc_changes = stream
            .map_err(anyhow::Error::new)
            .try_filter_map(|resp: fs::ListenResponse| {
                futures::future::ready(match resp.response_type {
                    Some(fs::listen_response::ResponseType::DocumentChange(
                        fs::DocumentChange {
                            document: Some(doc),
                            ..
                        },
                    )) => Ok(Some(doc)),
                    _ => Ok(None),
                })
            })
            .inspect(|change| trace!("Doc change: {:?}", change));
        let action_counts = doc_changes.map(|doc: anyhow::Result<fs::Document>| {
            let meta: ActionMetadata = serde_firestore::from_doc(&doc?)?;
            Ok(meta.count)
        });
        let filled_in = fill_in_gaps(action_counts);

        Ok(filled_in)
    }
}

impl Firestore {
    // Not found => error
    async fn fetch_action(
        self: Arc<Self>,
        index: u64,
    ) -> anyhow::Result<VersionedActionRequestBytes> {
        trace!("Fetching action with index {}", index);
        use futures::FutureExt;
        // let x = self.cache.read();
        let already_there = {
            let cache = self.cache.read().unwrap();
            cache.get(index as usize).cloned()
        };
        let fut = if let Some(fut) = already_there {
            trace!("Cache hit");
            fut
        } else {
            trace!("Cache miss");
            let mut cache = self.cache.write().unwrap();
            while cache.len() <= (index as usize) {
                let handle = self.handle.clone();
                let new_idx = cache.len();
                cache.push(
                    async move { handle.fetch_action(new_idx as u64).await.unwrap() }
                        .boxed()
                        .shared(),
                )
            }

            cache.get(index as usize).unwrap().clone()
        };
        Ok(fut.await)
    }
}

#[tonic::async_trait]
impl Datastore for Arc<Firestore> {
    async fn push_action(&self, action: VersionedActionRequestBytes) -> anyhow::Result<u64> {
        use std::convert::TryInto;
        let handle = self.handle.to_owned();
        let mut client = handle.client.to_owned();
        loop {
            let txid = client
                .begin_transaction(fs::BeginTransactionRequest {
                    database: handle.database_name.clone(),
                    options: None,
                })
                .await?
                .into_inner()
                .transaction;

            let consistency_selector = Some(
                fs::get_document_request::ConsistencySelector::Transaction(txid.to_owned()),
            );

            let ActionMetadata { count } = handle
                .to_owned()
                .fetch_action_metadata(consistency_selector.clone())
                .await?;

            let new_count_value = fs::Value {
                value_type: Some(fs::value::ValueType::IntegerValue(
                    (count + 1).try_into().unwrap(),
                )),
            };
            let new_metadata_doc = fs::Document {
                name: handle.metadata_doc_name(),
                create_time: None,
                update_time: None,
                fields: hashmap! {"count".to_owned() => new_count_value},
            };
            let serialized_value = fs::Value {
                value_type: Some(fs::value::ValueType::BytesValue(
                    action.clone().into_bytes(),
                )),
            };
            let new_action_doc = fs::Document {
                name: handle.action_doc_name(count),
                create_time: None,
                update_time: None,
                fields: hashmap! {"serialized".to_owned() => serialized_value},
            };

            let () = match handle
                .client
                .clone()
                .commit(fs::CommitRequest {
                    database: self.handle.database_name.to_owned(),
                    transaction: txid.to_owned(),
                    writes: vec![
                        fs::Write {
                            operation: Some(fs::write::Operation::Update(new_metadata_doc)),
                            current_document: None,
                            update_mask: None,
                            update_transforms: vec![],
                        },
                        fs::Write {
                            operation: Some(fs::write::Operation::Update(new_action_doc)),
                            current_document: None,
                            update_mask: None,
                            update_transforms: vec![],
                        },
                    ],
                })
                .await
            {
                Ok(_) => return Ok(count + 1),
                Err(status) if status.code() == tonic::Code::Aborted => {
                    warn!("Transaction aborted. Retrying.")
                }
                Err(status) => return Err(status.into()),
            };
        }
    }

    type LogStream =
        Pin<Box<dyn Stream<Item = anyhow::Result<VersionedActionRequestBytes>> + Send + Sync>>;

    async fn watch_log(&self) -> anyhow::Result<Self::LogStream> {
        use futures::TryStreamExt;
        let this = self.clone();
        Ok(Box::pin(sync_wrapper::ext::SyncStream::new(
            self.handle
                .clone()
                .watch_log_len()
                .await?
                .and_then(move |index| this.clone().fetch_action(index)),
        )))
    }
}

fn fill_in_gaps(
    number_stream: impl Stream<Item = anyhow::Result<u64>> + Unpin,
) -> impl Stream<Item = anyhow::Result<u64>> {
    use futures::StreamExt;
    let ranges = futures::stream::unfold((0, number_stream), |(ceil, number_stream)| async move {
        let (maybe_number, number_stream) = number_stream.into_future().await;
        let new_ceil = match maybe_number {
            Some(Ok(new_ceil)) => new_ceil,
            Some(Err(e)) => return Some((vec![Err(e)], (ceil, number_stream))),
            None => return None,
        };
        Some((
            (ceil..new_ceil).map(Ok).collect(),
            (std::cmp::max(new_ceil, ceil), number_stream),
        ))
    });
    ranges.flat_map(futures::stream::iter)
}
