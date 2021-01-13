use anyhow::{bail, Context};
use datastore::Datastore;
use fs::firestore_client::FirestoreClient;
use futures::{executor::block_on, Stream};
use googapis::google::firestore::v1 as fs;
use log::{error, info, trace, warn};
use protobuf::pictophone::dolt as dpb;
use std::{pin::Pin, sync::Arc};
use tonic::{
    metadata::MetadataValue,
    transport::{ClientTlsConfig, Endpoint},
    Request,
};

mod auth;
mod binaries;
mod config;
mod datastore;
mod protobuf;
mod runner;
mod util;

struct Server<P, DS> {
    runner: runner::Runner<P>,
    datastore: DS,
}

fn get_binary_version(metadata: &tonic::metadata::MetadataMap) -> Option<binaries::Version> {
    metadata
        .get("x-impl")
        .and_then(|field| field.to_str().ok())
        .map(|semver| binaries::Version::new(semver.to_owned()))
}

#[derive(Debug, Clone)]
pub struct StateBytes(Vec<u8>);

impl StateBytes {
    pub fn new(bytes: Vec<u8>) -> Self {
        Self(bytes)
    }

    pub fn into_bytes(self) -> Vec<u8> {
        self.0
    }
}

impl AsRef<[u8]> for StateBytes {
    fn as_ref(&self) -> &[u8] {
        &self.0
    }
}

impl<P, DS> Server<P, DS>
where
    P: binaries::Provider + Send + Sync + 'static,
    DS: Datastore + Send + Sync + 'static,
{
    async fn fold_state(
        runner: &runner::Runner<P>,
        version: &Option<binaries::Version>,
        state_bytes: &mut StateBytes,
        action_bytes: dpb::VersionedActionRequestBytes,
    ) -> anyhow::Result<(StateBytes, dpb::VersionedActionResponseBytes)> {
        use std::convert::TryFrom;

        let request = dpb::Request::from(dpb::ActionRequest {
            state: Some(dpb::State {
                serialized: state_bytes.clone().into_bytes(),
            }),
            action: action_bytes.into_bytes(),
        });

        let response = runner.run(version, request).await?;
        let response = dpb::ActionResponse::try_from(response)?;

        if let Some(new_state_bytes) = response.state {
            *state_bytes = StateBytes(new_state_bytes.serialized);
        }
        let response_bytes = dpb::VersionedActionResponseBytes::new(response.response);

        Ok((state_bytes.clone(), response_bytes))
    }

    async fn state_stream(
        self: std::sync::Arc<Self>,
        version: Option<binaries::Version>,
    ) -> anyhow::Result<
        impl Stream<Item = anyhow::Result<(StateBytes, dpb::VersionedActionResponseBytes)>>,
    > {
        use futures::StreamExt;
        let this = self.clone();
        let version = version.to_owned();
        let state_bytes = StateBytes::new(vec![]);

        let log_stream = self.datastore.watch_log().await?;

        Ok(futures::stream::unfold(
            (this, version, state_bytes, log_stream),
            |(this, version, mut state_bytes, log_stream)| async move {
                let (action_bytes, log_stream_tail) = log_stream.into_future().await;
                let action_bytes = match action_bytes {
                    Some(Ok(action_bytes)) => action_bytes,
                    Some(Err(e)) => {
                        return Some((Err(e), (this, version, state_bytes, log_stream_tail)))
                    }
                    None => return None,
                };
                Some(
                    match Self::fold_state(&this.runner, &version, &mut state_bytes, action_bytes)
                        .await
                    {
                        Ok((state_bytes, response_bytes)) => (
                            Ok((state_bytes.clone(), response_bytes)),
                            (this, version, state_bytes, log_stream_tail),
                        ),
                        Err(e) => (Err(e), (this, version, state_bytes, log_stream_tail)),
                    },
                )
            },
        ))
    }
}

#[tonic::async_trait]

impl<P, DS> dpb::Server for std::sync::Arc<Server<P, DS>>
where
    P: binaries::Provider + Send + Sync + 'static,
    DS: Datastore + Send + Sync + 'static,
{
    async fn handle_action(
        &self,
        action: dpb::VersionedActionRequestBytes,
        metadata: tonic::metadata::MetadataMap,
    ) -> Result<dpb::VersionedActionResponseBytes, anyhow::Error> {
        use futures::StreamExt;
        trace!("Received Action: {:?}", action);
        let action_count = self.datastore.push_action(action).await?;
        trace!("Action committed");

        let version = get_binary_version(&metadata);
        let mut states: Vec<(StateBytes, dpb::VersionedActionResponseBytes)> = self
            .clone()
            .state_stream(version)
            .await?
            .filter_map(|s| {
                futures::future::ready(match s {
                    Ok(s) => Some(s),
                    Err(e) => {
                        error!("swallowing error in handle_action: {:?}", e);
                        None
                    }
                })
            })
            .skip(action_count - 1)
            .take(1)
            .collect()
            .await;
        trace!("State integration completed");
        let (last_state, last_resp) = if let Some((state, resp)) = states.pop() {
            (state, resp)
        } else {
            bail!("state stream ended early")
        };

        if !last_state.as_ref().is_empty() {
            let state: serde_json::Value = serde_json::from_slice(last_state.as_ref())?;
            trace!("POST-STATE: {:?}", state);
        }

        Ok(last_resp)
    }

    type QueryStream = Pin<
        Box<
            dyn Stream<Item = Result<dpb::VersionedQueryResponseBytes, anyhow::Error>>
                + Send
                + Sync,
        >,
    >;
    async fn handle_query(
        &self,
        query: dpb::VersionedQueryRequestBytes,
        metadata: tonic::metadata::MetadataMap,
    ) -> Result<Self::QueryStream, anyhow::Error> {
        use futures::TryStreamExt;
        use std::convert::TryFrom;
        let version = get_binary_version(&metadata);
        let this = self.clone();

        trace!("Query START");
        let _guard = scopeguard::guard((), |_| {
            trace!("Query END");
        });
        let result = self
            .clone()
            .state_stream(version.to_owned())
            .await?
            .and_then(move |(state, _resp)| {
                &_guard; // Force capture of _guard;
                let this = this.to_owned();
                let version = version.to_owned();
                let query = query.to_owned();
                async move {
                    let response = this
                        .runner
                        .run(
                            &version,
                            dpb::Request::from(dpb::QueryRequest {
                                state: Some(dpb::State {
                                    serialized: state.into_bytes(),
                                }),
                                query: query.into_bytes(),
                            }),
                        )
                        .await?;
                    let response = dpb::QueryResponse::try_from(response)?;
                    Ok(dpb::VersionedQueryResponseBytes::new(response.response))
                }
            });
        let result = sync_wrapper::ext::SyncStream::new(result);

        Ok(Box::pin(result))
    }
}

const ENDPOINT: &str = "https://firestore.googleapis.com";

fn firestore_endpoint() -> Endpoint {
    Endpoint::new(ENDPOINT)
        .unwrap()
        .tls_config(ClientTlsConfig::new().domain_name("firestore.googleapis.com"))
}

fn token_source(config: &config::Config) -> anyhow::Result<Box<dyn auth::Source + Send + Sync>> {
    match &config.credential_source {
        config::CredentialSource::Literal { auth_key } => {
            Ok(Box::new(auth::ServiceAccountTokenSource::new(
                serde_json::from_str(auth_key)?,
                "https://firestore.googleapis.com/".to_owned(),
                vec!["https://www.googleapis.com/auth/cloud-platform".to_owned()],
            )?))
        }

        config::CredentialSource::InstanceMetadata => {
            Ok(Box::new(auth::InstanceTokenSource::new(vec![
                "https://www.googleapis.com/auth/cloud-platform".to_owned(),
            ])?))
        }
    }
}

#[tokio::main]
async fn main() -> Result<(), anyhow::Error> {
    env_logger::init();

    let config = config::Config::new()?;

    info!("Starting with config: {:#?}", config);

    let addr = format!("0.0.0.0:{}", config.port).parse()?;

    let token_source = auth::CachedTokenSource::new(
        token_source(&config).context("while setting up token thing")?,
    );

    let channel = firestore_endpoint()
        .connect()
        .await
        .context("while connecting to firestore")?;

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
        runner: runner::Runner::new(binaries::Filesystem::new(
            binaries::Version::new("1.0.0".to_owned()),
            std::path::PathBuf::from(config.wasm_path),
        ))?,
        datastore: datastore::firestore(
            firestore,
            "projects/pictophone-test/databases/(default)".to_owned(),
        ),
    });

    info!("Boom, running on: {}", addr);

    tonic::transport::Server::builder()
        .add_service(protobuf::pictophone::v0_1::pictophone_server::PictophoneServer::new(server))
        .serve(addr)
        .await?;

    Ok(())
}
