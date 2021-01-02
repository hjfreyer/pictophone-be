use crate::protobuf::google::firestore::v1 as fs;
use anyhow::{bail, Context};
use datastore::Datastore;
use fs::firestore_client::FirestoreClient;
use futures::{executor::block_on, Stream};
use log::{info, trace, warn};
use protobuf::pictophone::dolt as dpb;
use protobuf::pictophone::versioned as vpb;
use protobuf::pictophone::{v1_0, v1_1};
use std::{pin::Pin, sync::Arc};
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

impl<DS: Datastore + Send + Sync> Server<DS> {
    async fn state_stream(
        self: std::sync::Arc<Self>,
        version: &runner::BinaryVersion,
    ) -> anyhow::Result<
        impl Stream<Item = anyhow::Result<(StateBytes, dpb::VersionedActionResponseBytes)>>,
    > {
        use futures::StreamExt;
        use prost::Message;
        let version = version.to_owned();
        Ok(self.datastore.watch_log().await?.scan(
            StateBytes::new(vec![]),
            move |state_bytes, action_bytes| {
                futures::future::ready({
                    let result = (|| {
                        use std::convert::TryFrom;
                        use std::convert::TryInto;

                        let action_bytes = action_bytes?;
                        let request = dpb::Request::from(dpb::ActionRequest {
                            state: state_bytes.clone().into_bytes(),
                            action: action_bytes.into_bytes(),
                        });

                        let response = self.runner.run(&version, request)?;
                        let response = dpb::ActionResponse::try_from(response)?;

                        let new_state_bytes = StateBytes::new(response.state);
                        if !new_state_bytes.as_ref().is_empty() {
                            *state_bytes = new_state_bytes
                        };
                        let response_bytes =
                            dpb::VersionedActionResponseBytes::new(response.response);

                        Ok((state_bytes.clone(), response_bytes))
                    })();
                    Some(result)
                })
            },
        ))

        // futures::future::ready(Some((|| {
        //     use std::convert::TryInto;
        //     let action = action?;
        //     // let mut action_buffer = vec![];
        //     // let () = action.encode(&mut action_buffer)?;
        //     let bytes : dpb::VersionedActionRequestBytes = action.try_into()?;
        //     let request = dpb::Request::from(dpb::ActionRequest {
        //         state: state.clone(),
        //         action: bytes.into_bytes(),
        //     });

        //     let response = self.runner.run(&version, request)?;
        //     let response = dpb::ActionResponse::try_from(response)?;
        //     if 0 < response.state.len() {
        //         *state = response.state;
        //         Ok((state.clone(), response.response))
        //     } else {
        //         Ok((state.clone(), response.response))
        //     }
        // })()))
    }
}

#[tonic::async_trait]
impl<DS: Datastore + Send + Sync> dpb::Server for std::sync::Arc<Server<DS>> {
    async fn handle_action(
        &self,
        action: dpb::VersionedActionRequestBytes,
        metadata: tonic::metadata::MetadataMap,
    ) -> Result<dpb::VersionedActionResponseBytes, anyhow::Error> {
        use futures::StreamExt;
        trace!("ACTION: {:?}", action);
        let action_count = self.datastore.push_action(action).await?;

        let version = get_binary_version(&metadata);
        let mut states: Vec<(StateBytes, dpb::VersionedActionResponseBytes)> = self
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
        use futures::StreamExt;
        use std::convert::TryFrom;
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
                    dpb::Request::from(dpb::QueryRequest {
                        state: state.into_bytes(),
                        query: query.to_owned().into_bytes(),
                    }),
                )?;
                let response = dpb::QueryResponse::try_from(response)?;
                Ok(dpb::VersionedQueryResponseBytes::new(response.response))
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
