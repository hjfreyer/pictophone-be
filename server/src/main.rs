use log::{info, trace, warn};
use std::{convert::TryFrom, pin::Pin, sync::Arc};

use {
    futures::Stream,
    protobuf::pictophone::logic as ptl,
    protobuf::pictophone::{v1_0, v1_1},
    tokio::sync::Mutex,
};

mod protobuf;
mod runner;

struct InnerServer {
    runner: runner::Runner,
    actions: Vec<ptl::VersionedAction>,
}

fn get_binary_version(metadata: &tonic::metadata::MetadataMap) -> runner::BinaryVersion {
    metadata
        .get("x-impl")
        .and_then(|field| field.to_str().ok())
        .and_then(|semver| {
            let version = runner::BinaryVersion::from_semver(semver);
            if version.is_none() {
                warn!("user specified illegal value for x-impl: {:?}", semver);
            }
            version
        })
        .unwrap_or_default()
}

impl InnerServer {
    fn state_head(&mut self, version: &runner::BinaryVersion) -> Result<Vec<u8>, anyhow::Error> {
        self.actions
            .iter()
            .cloned()
            .try_fold(vec![], |state, action| {
                let request = ptl::Request::from(ptl::EvolveRequest {
                    state: state.clone(),
                    action: Some(action),
                });

                let response = self.runner.run(version, request)?;
                let response = ptl::EvolveResponse::try_from(response)?;
                if 0 < response.state.len() {
                    Ok(response.state)
                } else {
                    Ok(state)
                }
            })
    }

    fn handle_action(
        &mut self,
        action: ptl::VersionedAction,
        metadata: tonic::metadata::MetadataMap,
    ) -> Result<ptl::VersionedResponse, anyhow::Error> {
        let version = get_binary_version(&metadata);
        let state = self.state_head(&version)?;

        trace!("ACTION: {:?}", action);

        if 0 < state.len() {
            let state: serde_json::Value = serde_json::from_slice(&state)?;
            trace!("PRE-STATE: {:?}", state);
        } else {
            trace!("PRE-STATE: None");
        }
        let res = self.runner.run(
            &version,
            ptl::Request::from(ptl::EvolveRequest {
                state: state.to_owned(),
                action: Some(action.to_owned()),
            }),
        )?;
        let res = ptl::EvolveResponse::try_from(res)?;

        if 0 < res.state.len() {
            let state: serde_json::Value = serde_json::from_slice(&res.state)?;
            trace!("POST-STATE: {:?}", state);
        }

        self.actions.push(action);
        Ok(res.response.unwrap())
    }

    async fn handle_query(
        &mut self,
        query: ptl::VersionedQueryRequest,
        metadata: tonic::metadata::MetadataMap,
    ) -> Result<impl Stream<Item = Result<ptl::VersionedQueryResponse, anyhow::Error>>, anyhow::Error>
    {
        let version = get_binary_version(&metadata);
        let state = self.state_head(&version)?;

        let response = self.runner.run(
            &version,
            ptl::Request::from(ptl::QueryRequest {
                state: state.to_owned(),
                query: Some(query),
            }),
        )?;
        let response = ptl::VersionedQueryResponse::try_from(response)?;
        Ok(futures::stream::once(async { Ok(response) }))
    }
}

struct Server {
    inner: Arc<Mutex<InnerServer>>,
}

#[tonic::async_trait]
impl ptl::DoltServer for Server {
    async fn handle_action(
        &self,
        action: ptl::VersionedAction,
        metadata: tonic::metadata::MetadataMap,
    ) -> Result<ptl::VersionedResponse, anyhow::Error> {
        self.inner.lock().await.handle_action(action, metadata)
    }

    type QueryStream = Pin<
        Box<dyn Stream<Item = Result<ptl::VersionedQueryResponse, anyhow::Error>> + Send + Sync>,
    >;

    async fn handle_query(
        &self,
        query: ptl::VersionedQueryRequest,
        metadata: tonic::metadata::MetadataMap,
    ) -> Result<Self::QueryStream, anyhow::Error> {
        Ok(Box::pin(
            self.inner
                .lock()
                .await
                .handle_query(query, metadata)
                .await?,
        ))
    }
}

#[tokio::main]
async fn main() -> Result<(), anyhow::Error> {
    env_logger::init();

    let addr = "0.0.0.0:8080".parse()?;
    let inner = Arc::new(Mutex::new(InnerServer {
        runner: runner::Runner::new(&std::path::PathBuf::from("server/src/binaries"))?,
        actions: vec![],
    }));

    info!("Boom, running on: {}", addr);

    tonic::transport::Server::builder()
        .add_service(v1_0::pictophone_server::PictophoneServer::new(Server {
            inner: inner.clone(),
        }))
        .add_service(v1_1::pictophone_server::PictophoneServer::new(Server {
            inner,
        }))
        .serve(addr)
        .await?;

    Ok(())
}
