use anyhow::{bail, Context};
use datastore::Datastore;
use fs::firestore_client::FirestoreClient;
use futures::{executor::block_on, Stream};
use googapis::google::firestore::v1 as fs;
use log::{error, info, trace};
use proto::dolt as dpb;
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
mod proto;
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

impl From<StateBytes> for dpb::State {
    fn from(s: StateBytes) -> Self {
        Self { serialized: s.0 }
    }
}

impl From<dpb::State> for StateBytes {
    fn from(s: dpb::State) -> Self {
        Self::new(s.serialized)
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
        state_bytes: Option<StateBytes>,
        action_bytes: dpb::VersionedActionRequestBytes,
    ) -> anyhow::Result<(Option<StateBytes>, dpb::VersionedActionResponseBytes)> {
        use std::convert::TryFrom;

        let request = dpb::Request::from(dpb::ActionRequest {
            state: state_bytes.as_ref().map(|b| dpb::State {
                serialized: b.clone().into_bytes(),
            }),
            action: action_bytes.into_bytes(),
        });

        let response = runner.run(version, request).await?;
        let response = dpb::ActionResponse::try_from(response)?;

        let new_state_bytes: Option<StateBytes> = response.state.map(StateBytes::from);
        let response_bytes = dpb::VersionedActionResponseBytes::new(response.response);

        Ok((new_state_bytes.or(state_bytes), response_bytes))
    }

    async fn state_stream(
        self: std::sync::Arc<Self>,
        version: Option<binaries::Version>,
    ) -> anyhow::Result<
        impl Stream<Item = anyhow::Result<(Option<StateBytes>, dpb::VersionedActionResponseBytes)>>,
    > {
        use futures::StreamExt;

        let res = futures::stream::unfold(
            (
                self.clone(),
                version.to_owned(),
                None,
                self.datastore.watch_log().await?,
            ),
            |(this, version, state_bytes, log_stream)| async move {
                trace!(
                    target: "state_stream",
                    "State: {:?}",
                    state_bytes
                        .as_ref()
                        .map(|s: &StateBytes| std::str::from_utf8(&s.0))
                );
                let (action_bytes, log_stream_tail) = log_stream.into_future().await;
                let action_bytes = match action_bytes {
                    Some(Ok(action_bytes)) => action_bytes,
                    Some(Err(e)) => {
                        return Some((Err(e), (this, version, state_bytes, log_stream_tail)))
                    }
                    None => return None,
                };
                Some(
                    match Self::fold_state(&this.runner, &version, state_bytes, action_bytes).await
                    {
                        Ok((state_bytes, response_bytes)) => (
                            Ok((state_bytes.clone(), response_bytes)),
                            (this, version, state_bytes, log_stream_tail),
                        ),
                        Err(e) => (Err(e), (this, version, None, log_stream_tail)),
                    },
                )
            },
        );
        Ok(util::end_after_error(res))
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
        use futures::TryStreamExt;
        use std::convert::TryInto;
        trace!(target: "action", "Received Action: {:?}", action);
        let action_count = self.datastore.push_action(action).await?;
        trace!(target: "action", "Action committed");

        let version = get_binary_version(&metadata);
        let mut states: Vec<(Option<StateBytes>, dpb::VersionedActionResponseBytes)> =
            util::end_after_error(self.clone().state_stream(version).await?)
                .inspect_err(
                    |e| error!(target: "action", "swallowing error in handle_action: {:?}", e),
                )
                .filter_map(|s| {
                    futures::future::ready(match s {
                        Ok(s) => Some(s),
                        Err(e) => {
                            error!(target: "action", "swallowing error in handle_action: {:?}", e);
                            None
                        }
                    })
                })
                .skip((action_count - 1).try_into().unwrap())
                .take(1)
                .collect()
                .await;
        trace!(target: "action", "State integration completed");
        let (last_state, last_resp) = if let Some((state, resp)) = states.pop() {
            (state, resp)
        } else {
            bail!("state stream ended early")
        };

        if let Some(state) = last_state {
            trace!(target: "action", "POST-STATE: {:?}", std::str::from_utf8(state.as_ref()));
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

        trace!(target: "query", "Query START");
        let _guard = scopeguard::guard((), |_| {
            trace!(target: "query", "Query END");
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
                                state: state.map(|s| dpb::State {
                                    serialized: s.into_bytes(),
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
            binaries::Version::new("0.1.0".to_owned()),
            std::path::PathBuf::from(config.wasm_path),
        ))?,
        datastore: datastore::firestore(
            firestore,
            "projects/pictophone-test/databases/(default)".to_owned(),
        ),
    });

    info!("Boom, running on: {}", addr);

    tonic::transport::Server::builder()
        .add_service(proto::pictophone::v0_1::pictophone_server::PictophoneServer::new(server))
        .serve(addr)
        .await?;

    Ok(())
}
