use crate::protobuf::google::firestore::v1 as fs;
use anyhow::bail;
use datastore::Datastore;
use fs::firestore_client::FirestoreClient;
use futures::{executor::block_on, Stream};
use log::{info, trace, warn};
use protobuf::pictophone::logic as ptl;
use protobuf::pictophone::{v1_0, v1_1};
use std::{convert::TryFrom, pin::Pin, sync::Arc};
use tonic::{
    metadata::MetadataValue,
    transport::{ClientTlsConfig, Endpoint},
    Request,
};

mod aovec;
mod auth;
mod config;
mod datastore;
mod protobuf;
mod runner;
mod util;

struct Server<DS: Datastore + Send + Sync + 'static> {
    runner: runner::Runner,
    datastore: DS,
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

impl<DS: Datastore + Send + Sync> Server<DS> {
    async fn state_stream(
        self: std::sync::Arc<Self>,
        version: &runner::BinaryVersion,
    ) -> anyhow::Result<impl Stream<Item = anyhow::Result<(Vec<u8>, Option<ptl::VersionedResponse>)>>>
    {
        use futures::StreamExt;
        let version = version.to_owned();
        Ok(self
            .datastore
            .watch_log()
            .await?
            .scan(vec![], move |state, action| {
                futures::future::ready(Some((|| {
                    let action = action?;
                    let request = ptl::Request::from(ptl::EvolveRequest {
                        state: state.clone(),
                        action: Some(action),
                    });

                    let response = self.runner.run(&version, request)?;
                    let response = ptl::EvolveResponse::try_from(response)?;
                    if 0 < response.state.len() {
                        *state = response.state;
                        Ok((state.clone(), response.response))
                    } else {
                        Ok((state.clone(), response.response))
                    }
                })()))
            }))
    }
}

#[tonic::async_trait]
impl<DS: Datastore + Send + Sync> ptl::DoltServer for std::sync::Arc<Server<DS>> {
    async fn handle_action(
        &self,
        action: ptl::VersionedAction,
        metadata: tonic::metadata::MetadataMap,
    ) -> Result<ptl::VersionedResponse, anyhow::Error> {
        use futures::StreamExt;
        trace!("ACTION: {:?}", action);
        let action_count = self.datastore.push_action(action).await?;

        let version = get_binary_version(&metadata);
        let mut states: Vec<(Vec<u8>, Option<ptl::VersionedResponse>)> = self
            .clone()
            .state_stream(&version)
            .await?
            .filter_map(|s| async { s.ok() })
            .skip(action_count - 1)
            .take(1)
            .collect()
            .await;
        let (last_state, last_resp) = if let Some((state, resp)) = states.pop() {
            (state, resp)
        } else {
            bail!("state stream ended early")
        };

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
        let result = self
            .clone()
            .state_stream(&version)
            .await?
            .filter_map(|r| async { r.ok() })
            .map(move |(state, _resp)| {
                &_guard; // Force capture of _guard;

                let response = this.runner.run(
                    &version,
                    ptl::Request::from(ptl::QueryRequest {
                        state,
                        query: Some(query.to_owned()),
                    }),
                )?;
                Ok(ptl::VersionedQueryResponse::try_from(response)?)
            });

        Ok(Box::pin(result))
    }
}

const ENDPOINT: &str = "https://firestore.googleapis.com";

fn firestore_endpoint() -> Endpoint {
    Endpoint::new(ENDPOINT)
        .unwrap()
        .tls_config(ClientTlsConfig::new().domain_name("firestore.googleapis.com"))
}

#[tokio::main]
async fn main() -> Result<(), anyhow::Error> {
    env_logger::init();

    let config = config::Config::new()?;
    let addr = format!("0.0.0.0:{}", config.port).parse()?;

    let token_source = auth::CachedTokenSource::new(auth::ServiceAccountTokenSource::new(
        serde_json::from_str(&config.auth_key)?,
        "https://firestore.googleapis.com/".to_owned(),
        vec!["https://www.googleapis.com/auth/cloud-platform".to_owned()],
    )?);

    let channel = firestore_endpoint().connect().await?;

    let firestore = FirestoreClient::with_interceptor(channel, move |mut req: Request<()>| {
        // Deadlock potential here?
        let token = block_on(token_source.token())
            .map_err(|e| tonic::Status::internal(format!("authentication error: {:#}", e)))?;

        req.metadata_mut().insert(
            "authorization",
            MetadataValue::from_str(&format!("Bearer {}", token.token))
                .map_err(|e| tonic::Status::internal(format!("invalid metadata: {:#}", e)))?,
        );
        Ok(req)
    });

    let server = Arc::new(Server {
        runner: runner::Runner::new(&std::path::PathBuf::from(config.wasm_path))?,
        datastore: datastore::firestore(
            firestore,
            "projects/pictophone-test/databases/(default)".to_owned(),
        ),
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
