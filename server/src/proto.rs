#[derive(thiserror::Error, Debug)]
#[error("wrong oneof selected: wanted {wanted}, got {got}")]
pub struct WrongOneofSelected {
    wanted: &'static str,
    got: String,
}

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
                    type Error = $crate::proto::WrongOneofSelected;
                    fn try_from(value: $container_type) -> Result<Self, Self::Error> {
                        match value.$oneof_field {
                            Some([<$container_type:snake>] ::[<$oneof_field:camel>]::$elem_field_name(e)) => Ok(e),
                            _ => Err($crate::proto::WrongOneofSelected{
                                wanted: stringify!([<$container_type:snake>] ::[<$oneof_field:camel>]::$elem_field_name),
                                got:format!("{:?}", value),
                            }),
                        }
                    }
                }
            }
        )*
    };
}

pub mod dolt {
    tonic::include_proto!("dolt");

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

        version!(v0_1, V0p1);

        macro_rules! serialize {
            ($name:ident) => {
                paste::paste!{
                    impl TryFrom<$name> for super::super::dolt::[<Versioned $name Bytes>] {
                        type Error = prost::EncodeError;

                        fn try_from(value: $name) -> Result<Self, Self::Error> {
                            use prost::Message;
                            let mut bytes = vec![];
                            value.encode(&mut bytes)?;
                            Ok(Self::new(bytes))
                        }
                    }


                    impl TryFrom<super::super::dolt::[<Versioned $name Bytes>]> for $name  {
                        type Error = prost::DecodeError;

                        fn try_from(value: super::super::dolt::[<Versioned $name Bytes>]) -> Result<Self, Self::Error> {
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

    pub mod v0_1 {
        tonic::include_proto!("pictophone.v0_1");

        oneof_convert!(QueryRequest, method, GetGameRequest,);
        oneof_convert!(QueryResponse, method, GetGameResponse,);

        oneof_convert!(
            ActionRequest,
            method,
            JoinGameRequest,
            StartGameRequest,
            MakeMoveRequest,
        );
        oneof_convert!(
            ActionResponse,
            method,
            JoinGameResponse,
            StartGameResponse,
            MakeMoveResponse,
        );

        macro_rules! action_body {
            ($self:expr, $request:expr) => {{
                use std::convert::TryFrom;
                use std::convert::TryInto;
                let metadata = $request.metadata().to_owned();

                let versioned = super::versioned::ActionRequest::from(ActionRequest::from(
                    $request.into_inner(),
                ));

                $self
                    .handle_action(
                        versioned.try_into().map_err(|e| {
                            tonic::Status::internal(format!("Internal error: {:#}", e))
                        })?,
                        metadata,
                    )
                    .await
                    .and_then(|r| {
                        Ok(tonic::Response::new(
                            ActionResponse::try_from(super::versioned::ActionResponse::try_from(
                                r,
                            )?)?
                            .try_into()?,
                        ))
                    })
                    .map_err(|e| tonic::Status::internal(format!("Internal error: {:#}", e)))
            }};
        }

        #[tonic::async_trait]
        impl<T: super::super::dolt::Server> pictophone_server::Pictophone for T {
            async fn join_game(
                &self,
                request: tonic::Request<JoinGameRequest>,
            ) -> Result<tonic::Response<JoinGameResponse>, tonic::Status> {
                action_body!(self, request)
            }

            async fn start_game(
                &self,
                request: tonic::Request<StartGameRequest>,
            ) -> Result<tonic::Response<StartGameResponse>, tonic::Status> {
                action_body!(self, request)
            }

            async fn make_move(
                &self,
                request: tonic::Request<MakeMoveRequest>,
            ) -> Result<tonic::Response<MakeMoveResponse>, tonic::Status> {
                action_body!(self, request)
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
