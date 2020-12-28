use futures::Stream;
use log::{info, trace, warn};
use protobuf::pictophone::logic as ptl;
use protobuf::pictophone::{v1_0, v1_1};
use std::{convert::TryFrom, pin::Pin, sync::Arc};

mod aovec;
mod protobuf;
mod runner;

struct Server {
    runner: runner::Runner,
    actions: aovec::AOVec<ptl::VersionedAction>,
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

impl Server {
    async fn state_until(
        &self,
        version: &runner::BinaryVersion,
        action_count: usize,
    ) -> Result<(Vec<u8>, Option<ptl::VersionedResponse>), anyhow::Error> {
        self.actions.take(action_count).await.into_iter().try_fold(
            (vec![], None),
            |(state, _prev_resp), action| {
                let request = ptl::Request::from(ptl::EvolveRequest {
                    state: state.clone(),
                    action: Some(action),
                });

                let response = self.runner.run(version, request)?;
                let response = ptl::EvolveResponse::try_from(response)?;
                if 0 < response.state.len() {
                    Ok((response.state, response.response))
                } else {
                    Ok((state, response.response))
                }
            },
        )
    }
}

#[tonic::async_trait]
impl ptl::DoltServer for std::sync::Arc<Server> {
    async fn handle_action(
        &self,
        action: ptl::VersionedAction,
        metadata: tonic::metadata::MetadataMap,
    ) -> Result<ptl::VersionedResponse, anyhow::Error> {
        trace!("ACTION: {:?}", action);
        let action_count = self.actions.push(action).await;

        let version = get_binary_version(&metadata);
        let (last_state, last_resp) = self.state_until(&version, action_count).await?;

        if 0 < last_state.len() {
            let state: serde_json::Value = serde_json::from_slice(&last_state)?;
            trace!("POST-STATE: {:?}", state);
        }

        last_resp.ok_or_else(|| anyhow::anyhow!("last action didn't return a response"))
    }

    type QueryStream = Pin<
        Box<dyn Stream<Item = Result<ptl::VersionedQueryResponse, anyhow::Error>> + Send + Sync>,
    >;
    async fn handle_query(
        &self,
        query: ptl::VersionedQueryRequest,
        metadata: tonic::metadata::MetadataMap,
    ) -> Result<Self::QueryStream, anyhow::Error> {
        use futures::StreamExt;
        let version = get_binary_version(&metadata);
        let this = self.clone();

        trace!("Query START");
        let _guard = scopeguard::guard((), |_| {
            trace!("Query END");
        });
        let result = self.actions.watch().await.flat_map(move |action_count| {
            &_guard;  // Force capture of _guard;
            let this = this.clone();
            let query = query.clone();
            let version = version.clone();
            futures::stream::once(async move {
                let (state, _) = this.state_until(&version, action_count).await?;

                let response = this.runner.run(
                    &version,
                    ptl::Request::from(ptl::QueryRequest {
                        state: state.to_owned(),
                        query: Some(query),
                    }),
                )?;
                let response = ptl::VersionedQueryResponse::try_from(response)?;
                Ok(response)
            })
        });

        Ok(Box::pin(result))
    }
}

#[tokio::main]
async fn main() -> Result<(), anyhow::Error> {
    env_logger::init();

    let port = std::env::var("PORT").unwrap_or("8080".to_owned());
    let wasm_path = std::env::var("WASM_PATH").unwrap_or("binaries".to_owned());

    let addr = format!("0.0.0.0:{}", port).parse()?;

    let server = Arc::new(Server {
        runner: runner::Runner::new(&std::path::PathBuf::from(wasm_path))?,
        actions: aovec::AOVec::new(),
    });

    info!("Boom, running on: {}", addr);

    tonic::transport::Server::builder()
        .add_service(v1_0::pictophone_server::PictophoneServer::new(
            server.clone(),
        ))
        .add_service(v1_1::pictophone_server::PictophoneServer::new(server))
        .serve(addr)
        .await?;

    Ok(())
}
