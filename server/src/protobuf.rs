#[derive(thiserror::Error, Debug)]
#[error("wrong oneof selected")]
pub struct WrongOneofSelected();

macro_rules! oneof_convert {
    ($container_type:ident, $oneof_field:ident, $($elem_type:ident, )*) => {
        oneof_convert!($container_type, $oneof_field, $(($elem_type, $elem_type), )*);
    };
    ($container_type:ident, $oneof_field:ident, $(($elem_type:ty, $elem_field_name:ident), )*) => {
        $(
            paste::paste!{
                impl From<$elem_type> for $container_type {
                    fn from(e: $elem_type) -> Self {
                        Self {
                            $oneof_field: Some([<$container_type:snake>] ::[<$oneof_field:camel>]::$elem_field_name(e)),
                        }
                    }
                }


                impl std::convert::TryFrom<$container_type> for $elem_type {
                    type Error = $crate::protobuf::WrongOneofSelected;
                    fn try_from(value: $container_type) -> Result<Self, Self::Error> {
                        match value.$oneof_field {
                            Some([<$container_type:snake>] ::[<$oneof_field:camel>]::$elem_field_name(e)) => Ok(e),
                            _ => Err($crate::protobuf::WrongOneofSelected()),
                        }
                        // Self {
                        //     method: Some([<$container_type:snake>] ::[<$oneof_field:camel>] ::Evolve(e)),
                        // }
                    }
                }
            }
        )*
    };
}

pub mod pictophone {
    pub mod versioned {
        use std::convert::TryFrom;

        tonic::include_proto!("pictophone.versioned");

        macro_rules! version {
            ($version_mod:ident, $version_enum:ident) => {
                oneof_convert!(
                    ActionRequest,
                    version,
                    (super::$version_mod::ActionRequest, $version_enum),
                );
                oneof_convert!(
                    ActionResponse,
                    version,
                    (super::$version_mod::ActionResponse, $version_enum),
                );
                oneof_convert!(
                    QueryRequest,
                    version,
                    (super::$version_mod::QueryRequest, $version_enum),
                );
                oneof_convert!(
                    QueryResponse,
                    version,
                    (super::$version_mod::QueryResponse, $version_enum),
                );
            };
        }

        version!(v1_0, V1p0);
        version!(v1_1, V1p1);

        macro_rules! serialize {
            ($name:ident) => {
                paste::paste!{
                    impl TryFrom<$name> for super::dolt::[<Versioned $name Bytes>] {
                        type Error = prost::EncodeError;

                        fn try_from(value: $name) -> Result<Self, Self::Error> {
                            use prost::Message;
                            let mut bytes = vec![];
                            value.encode(&mut bytes)?;
                            Ok(Self::new(bytes))
                        }
                    }


                    impl TryFrom<super::dolt::[<Versioned $name Bytes>]> for $name  {
                        type Error = prost::DecodeError;

                        fn try_from(value: super::dolt::[<Versioned $name Bytes>]) -> Result<Self, Self::Error> {
                            use prost::Message;
                            Self::decode(value.into_bytes().as_slice())
                        }
                    }
                }
            };
        }

        serialize!(ActionRequest);
        serialize!(ActionResponse);
        serialize!(QueryRequest);
        serialize!(QueryResponse);
    }

    pub mod dolt {
        tonic::include_proto!("pictophone.dolt");

        oneof_convert!(Request, method, ActionRequest, QueryRequest,);
        oneof_convert!(Response, method, ActionResponse, QueryResponse,);

        macro_rules! typed_bytes {
            ($name:ident) => {
                paste::paste! {
                    #[derive(Debug, Clone)]
                    pub struct $name(Vec<u8>);

                    impl $name {
                        pub fn new(bytes: Vec<u8>) -> Self {
                            Self(bytes)
                        }

                        pub fn into_bytes(self) -> Vec<u8> {
                            self.0
                        }
                    }
                }
            };
        }

        typed_bytes!(VersionedActionRequestBytes);
        typed_bytes!(VersionedActionResponseBytes);
        typed_bytes!(VersionedQueryRequestBytes);
        typed_bytes!(VersionedQueryResponseBytes);

        #[tonic::async_trait]
        pub trait Server: Send + Sync + 'static {
            async fn handle_action(
                &self,
                action: VersionedActionRequestBytes,
                metadata: tonic::metadata::MetadataMap,
            ) -> Result<VersionedActionResponseBytes, anyhow::Error>;

            type QueryStream: futures::Stream<Item = Result<VersionedQueryResponseBytes, anyhow::Error>>
                + Send
                + Sync;

            async fn handle_query(
                &self,
                query: VersionedQueryRequestBytes,
                metadata: tonic::metadata::MetadataMap,
            ) -> Result<Self::QueryStream, anyhow::Error>;
        }
    }

    pub mod v1_0 {
        tonic::include_proto!("pictophone.v1_0");

        oneof_convert!(
            CreateGameResponse,
            error,
            GameAlreadyExistsError,
            ShortCodeInUseError,
        );
        oneof_convert!(DeleteGameResponse, error, GameNotFoundError,);

        oneof_convert!(ActionRequest, method, CreateGameRequest, DeleteGameRequest,);
        oneof_convert!(
            ActionResponse,
            method,
            CreateGameResponse,
            DeleteGameResponse,
        );

        #[tonic::async_trait]
        impl<T: super::dolt::Server> pictophone_server::Pictophone for T {
            async fn create_game(
                &self,
                request: tonic::Request<CreateGameRequest>,
            ) -> Result<tonic::Response<CreateGameResponse>, tonic::Status> {
                use std::convert::TryFrom;
                use std::convert::TryInto;
                let metadata = request.metadata().to_owned();

                let versioned = super::versioned::ActionRequest::from(ActionRequest::from(
                    request.into_inner(),
                ));

                self.handle_action(
                    versioned
                        .try_into()
                        .map_err(|e| tonic::Status::internal(format!("Internal error: {:#}", e)))?,
                    metadata,
                )
                .await
                .and_then(|r| {
                    Ok(tonic::Response::new(
                        ActionResponse::try_from(super::versioned::ActionResponse::try_from(r)?)?
                            .try_into()?,
                    ))
                })
                .map_err(|e| tonic::Status::internal(format!("Internal error: {:#}", e)))
            }

            async fn delete_game(
                &self,
                request: tonic::Request<DeleteGameRequest>,
            ) -> Result<tonic::Response<DeleteGameResponse>, tonic::Status> {
                use std::convert::TryFrom;
                use std::convert::TryInto;
                let metadata = request.metadata().to_owned();

                let versioned = super::versioned::ActionRequest::from(ActionRequest::from(
                    request.into_inner(),
                ));

                self.handle_action(
                    versioned
                        .try_into()
                        .map_err(|e| tonic::Status::internal(format!("Internal error: {:#}", e)))?,
                    metadata,
                )
                .await
                .and_then(|r| {
                    Ok(tonic::Response::new(
                        ActionResponse::try_from(super::versioned::ActionResponse::try_from(r)?)?
                            .try_into()?,
                    ))
                })
                .map_err(|e| tonic::Status::internal(format!("Internal error: {:#}", e)))
            }
        }
    }

    pub mod v1_1 {
        tonic::include_proto!("pictophone.v1_1");

        oneof_convert!(QueryRequest, method, GetGameRequest,);
        oneof_convert!(QueryResponse, method, GetGameResponse,);

        oneof_convert!(
            ActionRequest,
            method,
            (super::v1_0::CreateGameRequest, CreateGameRequest),
            (super::v1_0::DeleteGameRequest, DeleteGameRequest),
        );
        oneof_convert!(
            ActionResponse,
            method,
            (super::v1_0::CreateGameResponse, CreateGameResponse),
            (super::v1_0::DeleteGameResponse, DeleteGameResponse),
        );

        #[tonic::async_trait]
        impl<T: super::dolt::Server> pictophone_server::Pictophone for T {
            async fn create_game(
                &self,
                request: tonic::Request<super::v1_0::CreateGameRequest>,
            ) -> Result<tonic::Response<super::v1_0::CreateGameResponse>, tonic::Status>
            {
                use std::convert::TryFrom;
                use std::convert::TryInto;
                let metadata = request.metadata().to_owned();

                let versioned = super::versioned::ActionRequest::from(ActionRequest::from(
                    request.into_inner(),
                ));

                self.handle_action(
                    versioned
                        .try_into()
                        .map_err(|e| tonic::Status::internal(format!("Internal error: {:#}", e)))?,
                    metadata,
                )
                .await
                .and_then(|r| {
                    Ok(tonic::Response::new(
                        ActionResponse::try_from(super::versioned::ActionResponse::try_from(r)?)?
                            .try_into()?,
                    ))
                })
                .map_err(|e| tonic::Status::internal(format!("Internal error: {:#}", e)))
            }

            async fn delete_game(
                &self,
                request: tonic::Request<super::v1_0::DeleteGameRequest>,
            ) -> Result<tonic::Response<super::v1_0::DeleteGameResponse>, tonic::Status>
            {
                use std::convert::TryFrom;
                use std::convert::TryInto;
                let metadata = request.metadata().to_owned();

                let versioned = super::versioned::ActionRequest::from(ActionRequest::from(
                    request.into_inner(),
                ));

                self.handle_action(
                    versioned
                        .try_into()
                        .map_err(|e| tonic::Status::internal(format!("Internal error: {:#}", e)))?,
                    metadata,
                )
                .await
                .and_then(|r| {
                    Ok(tonic::Response::new(
                        ActionResponse::try_from(super::versioned::ActionResponse::try_from(r)?)?
                            .try_into()?,
                    ))
                })
                .map_err(|e| tonic::Status::internal(format!("Internal error: {:#}", e)))
            }

            type GetGameStream = std::pin::Pin<
                Box<
                    dyn futures::Stream<Item = Result<GetGameResponse, tonic::Status>>
                        + Send
                        + Sync,
                >,
            >;

            async fn get_game(
                &self,
                request: tonic::Request<GetGameRequest>,
            ) -> Result<tonic::Response<Self::GetGameStream>, tonic::Status> {
                use futures::StreamExt;
                use futures::TryStreamExt;
                use std::convert::TryFrom;
                use std::convert::TryInto;
                let metadata = request.metadata().to_owned();

                let versioned =
                    super::versioned::QueryRequest::from(QueryRequest::from(request.into_inner()));

                let stream = self
                    .handle_query(
                        versioned.try_into().map_err(|e| {
                            tonic::Status::internal(format!("Internal error: {:#}", e))
                        })?,
                        metadata,
                    )
                    .await
                    .map_err(|e| tonic::Status::internal(format!("Internal error: {:#}", e)))?
                    .map(|response| -> Result<GetGameResponse, anyhow::Error> {
                        Ok(
                            QueryResponse::try_from(super::versioned::QueryResponse::try_from(
                                response?,
                            )?)?
                            .try_into()?,
                        )
                    })
                    .map_err(|e| tonic::Status::internal(format!("Internal error: {:#}", e)));

                Ok(tonic::Response::new(Box::pin(stream)))
            }
        }
    }
}

pub mod google {
    pub mod firestore {
        pub mod v1 {
            tonic::include_proto!("google.firestore.v1");
        }
    }
    pub mod rpc {
        tonic::include_proto!("google.rpc");
    }
    pub mod r#type {
        tonic::include_proto!("google.r#type");
    }
}
