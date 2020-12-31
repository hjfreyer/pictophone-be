use crate::aovec;
use crate::protobuf::google::firestore::v1 as fs;
use crate::protobuf::pictophone::logic as ptl;
use crate::util;
use anyhow::bail;
use fs::firestore_client::FirestoreClient;
use futures::Stream;
use log::{trace, warn};
use maplit::hashmap;
use std::pin::Pin;

#[tonic::async_trait]
pub trait Datastore {
    async fn push_action(&self, action: ptl::VersionedAction) -> anyhow::Result<usize>;

    type LogStream: Stream<Item = anyhow::Result<ptl::VersionedAction>> + Send + Sync;
    async fn watch_log(&self) -> anyhow::Result<Self::LogStream>;
}

pub fn local() -> Local {
    Local {
        actions: aovec::AOVec::new(),
    }
}

pub struct Local {
    actions: aovec::AOVec<ptl::VersionedAction>,
}

#[tonic::async_trait]
impl Datastore for Local {
    async fn push_action(&self, action: ptl::VersionedAction) -> anyhow::Result<usize> {
        Ok(self.actions.push(action).await)
    }

    type LogStream =
        Pin<Box<dyn Stream<Item = anyhow::Result<ptl::VersionedAction>> + Send + Sync>>;

    async fn watch_log(&self) -> anyhow::Result<Self::LogStream> {
        todo!()
    }
}

pub fn firestore(
    client: FirestoreClient<tonic::transport::Channel>,
    database_name: String,
) -> Firestore {
    Firestore {
        client,
        database_name,
    }
}

pub struct Firestore {
    client: FirestoreClient<tonic::transport::Channel>,
    database_name: String,
}

impl Firestore {
    fn doc_name(&self) -> String {
        format!("{}/documents/actions/root", self.database_name)
    }
    async fn fetch_log(
        &self,
        consistency_selector: Option<fs::get_document_request::ConsistencySelector>,
    ) -> anyhow::Result<Vec<ptl::VersionedAction>> {
        let req = fs::GetDocumentRequest {
            name: self.doc_name(),
            mask: None,
            consistency_selector,
        };
        let resp = self.client.clone().get_document(req).await;
        let doc = match resp {
            Ok(response) => response.into_inner(),
            Err(status) if status.code() == tonic::Code::NotFound => return Ok(vec![]),
            Err(status) => return Err(status.into()),
        };
        doc_to_log(&doc)
    }

    async fn read_modify_write_log<R, F>(&self, mut f: F) -> anyhow::Result<R>
    where
        F: FnMut(Vec<ptl::VersionedAction>) -> anyhow::Result<(R, Vec<ptl::VersionedAction>)>,
    {
        let mut client = self.client.to_owned();
        loop {
            let txid = client
                .begin_transaction(fs::BeginTransactionRequest {
                    database: self.database_name.clone(),
                    options: None,
                })
                .await?
                .into_inner()
                .transaction;
            let log = self
                .fetch_log(Some(
                    fs::get_document_request::ConsistencySelector::Transaction(txid.to_owned()),
                ))
                .await?;
            let (res, new_log) = f(log)?;
            let () = match self
                .client
                .clone()
                .commit(fs::CommitRequest {
                    database: self.database_name.to_owned(),
                    transaction: txid.to_owned(),
                    writes: vec![fs::Write {
                        operation: Some(fs::write::Operation::Update(self.log_to_doc(&new_log)?)),
                        current_document: None,
                        update_mask: None,
                        update_transforms: vec![],
                    }],
                })
                .await
            {
                Ok(_) => return Ok(res),
                Err(status) if status.code() == tonic::Code::Aborted => {
                    trace!("Transaction aborted. Retrying.")
                }
                Err(status) => return Err(status.into()),
            };
        }
    }

    async fn watch_log_impl(
        &self,
    ) -> anyhow::Result<impl Stream<Item = anyhow::Result<ptl::VersionedAction>>> {
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
                            documents: vec![self.doc_name().clone()],
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

        let log_updates = util::end_after_error(stream)
            .inspect_err(|e| warn!("API Error: {:?}", e))
            .map_err(anyhow::Error::new)
            .try_filter_map(|resp: fs::ListenResponse| {
                futures::future::ready(match resp.response_type {
                    Some(fs::listen_response::ResponseType::DocumentChange(
                        fs::DocumentChange {
                            document: Some(doc),
                            ..
                        },
                    )) => doc_to_log(&doc).map(Some),
                    _ => Ok(None),
                })
            });

        let mut emitted_through = 0;
        Ok(
            log_updates.flat_map(move |actions: anyhow::Result<Vec<ptl::VersionedAction>>| {
                futures::stream::iter(match actions {
                    Ok(actions) => {
                        let new_actions: Vec<anyhow::Result<ptl::VersionedAction>> = actions
                            .as_slice()[emitted_through..]
                            .iter()
                            .cloned()
                            .map(Ok)
                            .collect();
                        emitted_through = std::cmp::max(emitted_through, actions.len());
                        new_actions
                    }
                    Err(e) => vec![Err(e)],
                })
            }),
        )
    }

    fn log_to_doc(&self, actions: &[ptl::VersionedAction]) -> anyhow::Result<fs::Document> {
        let encoded_actions = actions
            .iter()
            .map(|action| -> anyhow::Result<fs::Value> {
                use prost::Message;
                let mut bytes = vec![];
                let () = action.encode(&mut bytes)?;
                Ok(fs::Value {
                    value_type: Some(fs::value::ValueType::BytesValue(bytes)),
                })
            })
            .collect::<anyhow::Result<Vec<fs::Value>>>()?;
        let actions_array = fs::Value {
            value_type: Some(fs::value::ValueType::ArrayValue(fs::ArrayValue {
                values: encoded_actions,
            })),
        };
        Ok(fs::Document {
            name: self.doc_name(),
            create_time: None,
            update_time: None,
            fields: hashmap! {"actions".to_owned() => actions_array},
        })
    }
}

fn doc_to_log(doc: &fs::Document) -> anyhow::Result<Vec<ptl::VersionedAction>> {
    let actions = match doc.fields.get("actions") {
        Some(fs::Value {
            value_type: Some(fs::value::ValueType::ArrayValue(actions)),
        }) => &actions.values,
        Some(_) => bail!("malformed actions field"),
        None => return Ok(vec![]),
    };

    actions
        .iter()
        .map(|value| -> anyhow::Result<ptl::VersionedAction> {
            use prost::Message;
            let bytes = match &value.value_type {
                Some(fs::value::ValueType::BytesValue(b)) => b,
                Some(_) => bail!("non-bytes value"),
                None => bail!("unset value in array"),
            };
            Ok(ptl::VersionedAction::decode(bytes.as_slice())?)
        })
        .collect()
}
#[tonic::async_trait]
impl Datastore for Firestore {
    async fn push_action(&self, action: ptl::VersionedAction) -> anyhow::Result<usize> {
        self.read_modify_write_log(|mut log| {
            log.push(action.clone());
            Ok((log.len(), log))
        })
        .await
    }

    type LogStream =
        Pin<Box<dyn Stream<Item = anyhow::Result<ptl::VersionedAction>> + Send + Sync>>;

    async fn watch_log(&self) -> anyhow::Result<Self::LogStream> {
        Ok(Box::pin(self.watch_log_impl().await?))
    }
}
