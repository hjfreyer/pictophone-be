#[derive(thiserror::Error, Debug)]
#[error("wrong oneof selected")]
pub struct WrongOneofSelected();

// // method_new!(Paste);
// macro_rules! oneof_convert {
//     // ($container_type:ident, $enum_field:ident, $container_enum:ty, $($element_type:ident, )*) => {
//     //     oneof_convert!($container_type, $enum_field, $container_enum, $(($element_type, $element_type),)*);
//     // };
//     ($container_mod:path, $container_type:ident, $enum_field:ident, $(($element_mod:path, $element_type:ident), )*) => {
//         $(
//             paste::paste!{
//                 impl From<EvolveRequest> for [<$container_mod :: $container_type>] {
//                     fn from(e: $element_type) -> Self {
//                         Self {
//                             $enum_field: Some(<$container_enum>::$element_enum(e)),
//                         }
//                     }
//                 }
//             }
//         )*
//     };
// }

// method_new!(Paste);
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
    pub mod logic {
        tonic::include_proto!("pictophone.logic");

        macro_rules! version {
            ($version_mod:ident, $version_enum:ident) => {
                oneof_convert!(
                    VersionedAction,
                    version,
                    (super::$version_mod::Action, $version_enum),
                );
                oneof_convert!(
                    VersionedResponse,
                    version,
                    (super::$version_mod::Response, $version_enum),
                );
                oneof_convert!(
                    VersionedQueryRequest,
                    version,
                    (super::$version_mod::QueryRequest, $version_enum),
                );
                oneof_convert!(
                    VersionedQueryResponse,
                    version,
                    (super::$version_mod::QueryResponse, $version_enum),
                );
            };
        }

        version!(v1_0, V1p0);
        version!(v1_1, V1p1);

        oneof_convert!(Request, method, EvolveRequest, QueryRequest,);
        oneof_convert!(Response, method, EvolveResponse, VersionedQueryResponse,);

        #[tonic::async_trait]
        pub trait DoltServer: Send + Sync + 'static {
            async fn handle_action(
                &self,
                action: VersionedAction,
                metadata: tonic::metadata::MetadataMap,
            ) -> Result<VersionedResponse, anyhow::Error>;

            type QueryStream: futures::Stream<Item = Result<VersionedQueryResponse, anyhow::Error>>
                + Send
                + Sync;

            async fn handle_query(
                &self,
                query: VersionedQueryRequest,
                metadata: tonic::metadata::MetadataMap,
            ) -> Result<Self::QueryStream, anyhow::Error>;
        }

        #[tonic::async_trait]
        impl<T: DoltServer> super::v1_0::DoltServer for T {
            async fn handle_action(
                &self,
                action: super::v1_0::Action,
                metadata: tonic::metadata::MetadataMap,
            ) -> Result<super::v1_0::Response, anyhow::Error> {
                use std::convert::TryInto;
                DoltServer::handle_action(self, action.into(), metadata)
                    .await
                    .and_then(|r| Ok(r.try_into()?))
            }

            type QueryStream = std::pin::Pin<
                Box<
                    dyn futures::Stream<Item = Result<super::v1_0::QueryResponse, anyhow::Error>>
                        + Send
                        + Sync,
                >,
            >;

            async fn handle_query(
                &self,
                query: super::v1_0::QueryRequest,
                metadata: tonic::metadata::MetadataMap,
            ) -> Result<Self::QueryStream, anyhow::Error> {
                use futures::stream::StreamExt;
                use std::convert::TryInto;
                let res = DoltServer::handle_query(self, query.into(), metadata)
                    .await?
                    .map(|response| Ok(response?.try_into()?));
                Ok(Box::pin(res))
            }
        }

        #[tonic::async_trait]
        impl<T: DoltServer> super::v1_1::DoltServer for T {
            async fn handle_action(
                &self,
                action: super::v1_1::Action,
                metadata: tonic::metadata::MetadataMap,
            ) -> Result<super::v1_1::Response, anyhow::Error> {
                use std::convert::TryInto;
                DoltServer::handle_action(self, action.into(), metadata)
                    .await
                    .and_then(|r| Ok(r.try_into()?))
            }

            type QueryStream = std::pin::Pin<
                Box<
                    dyn futures::Stream<Item = Result<super::v1_1::QueryResponse, anyhow::Error>>
                        + Send
                        + Sync,
                >,
            >;

            async fn handle_query(
                &self,
                query: super::v1_1::QueryRequest,
                metadata: tonic::metadata::MetadataMap,
            ) -> Result<Self::QueryStream, anyhow::Error> {
                use futures::stream::StreamExt;
                use std::convert::TryInto;
                let res = DoltServer::handle_query(self, query.into(), metadata)
                    .await?
                    .map(|response| Ok(response?.try_into()?));
                Ok(Box::pin(res))
            }
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

        oneof_convert!(Action, method, CreateGameRequest, DeleteGameRequest,);
        oneof_convert!(Response, method, CreateGameResponse, DeleteGameResponse,);

        #[tonic::async_trait]
        pub trait DoltServer: Send + Sync + 'static {
            async fn handle_action(
                &self,
                action: Action,
                metadata: tonic::metadata::MetadataMap,
            ) -> Result<Response, anyhow::Error>;

            type QueryStream: futures::Stream<Item = Result<QueryResponse, anyhow::Error>>
                + Send
                + Sync;
            async fn handle_query(
                &self,
                query: QueryRequest,
                metadata: tonic::metadata::MetadataMap,
            ) -> Result<Self::QueryStream, anyhow::Error>;
        }

        #[tonic::async_trait]
        impl<T: DoltServer> pictophone_server::Pictophone for T {
            async fn create_game(
                &self,
                request: tonic::Request<CreateGameRequest>,
            ) -> Result<tonic::Response<CreateGameResponse>, tonic::Status> {
                use std::convert::TryInto;
                let metadata = request.metadata().to_owned();
                self.handle_action(request.into_inner().into(), metadata)
                    .await
                    .and_then(|r| Ok(tonic::Response::new(r.try_into()?)))
                    .map_err(|_| tonic::Status::internal("wtf"))
            }

            async fn delete_game(
                &self,
                request: tonic::Request<DeleteGameRequest>,
            ) -> Result<tonic::Response<DeleteGameResponse>, tonic::Status> {
                use std::convert::TryInto;
                let metadata = request.metadata().to_owned();
                self.handle_action(request.into_inner().into(), metadata)
                    .await
                    .and_then(|r| Ok(tonic::Response::new(r.try_into()?)))
                    .map_err(|_| tonic::Status::internal("wtf"))
            }
        }
    }

    pub mod v1_1 {
        tonic::include_proto!("pictophone.v1_1");

        oneof_convert!(QueryRequest, method, GetGameRequest,);
        oneof_convert!(QueryResponse, method, GetGameResponse,);

        oneof_convert!(
            Action,
            method,
            (super::v1_0::CreateGameRequest, CreateGameRequest),
            (super::v1_0::DeleteGameRequest, DeleteGameRequest),
        );
        oneof_convert!(
            Response,
            method,
            (super::v1_0::CreateGameResponse, CreateGameResponse),
            (super::v1_0::DeleteGameResponse, DeleteGameResponse),
        );

        #[tonic::async_trait]
        pub trait DoltServer: Send + Sync + 'static {
            async fn handle_action(
                &self,
                action: Action,
                metadata: tonic::metadata::MetadataMap,
            ) -> Result<Response, anyhow::Error>;

            type QueryStream: futures::Stream<Item = Result<QueryResponse, anyhow::Error>>
                + Send
                + Sync;
            async fn handle_query(
                &self,
                query: QueryRequest,
                metadata: tonic::metadata::MetadataMap,
            ) -> Result<Self::QueryStream, anyhow::Error>;
        }

        #[tonic::async_trait]
        impl<T: DoltServer> pictophone_server::Pictophone for T {
            async fn create_game(
                &self,
                request: tonic::Request<super::v1_0::CreateGameRequest>,
            ) -> Result<tonic::Response<super::v1_0::CreateGameResponse>, tonic::Status>
            {
                use std::convert::TryInto;
                let metadata = request.metadata().to_owned();
                self.handle_action(request.into_inner().into(), metadata)
                    .await
                    .and_then(|r| Ok(tonic::Response::new(r.try_into()?)))
                    .map_err(|_| tonic::Status::internal("wtf"))
            }

            async fn delete_game(
                &self,
                request: tonic::Request<super::v1_0::DeleteGameRequest>,
            ) -> Result<tonic::Response<super::v1_0::DeleteGameResponse>, tonic::Status>
            {
                use std::convert::TryInto;
                let metadata = request.metadata().to_owned();
                self.handle_action(request.into_inner().into(), metadata)
                    .await
                    .and_then(|r| Ok(tonic::Response::new(r.try_into()?)))
                    .map_err(|_| tonic::Status::internal("wtf"))
            }

            type GetGameStream = std::pin::Pin<
                Box<
                    dyn futures::Stream<Item = Result<GetGameResponse, tonic::Status>>
                        + Send
                        + Sync,
                >,
            >;
            // tokio::sync::mpsc::Receiver<Result<GetGameResponse, tonic::Status>>;

            async fn get_game(
                &self,
                request: tonic::Request<GetGameRequest>,
            ) -> Result<tonic::Response<Self::GetGameStream>, tonic::Status> {
                use futures::StreamExt;
                use futures::TryStreamExt;
                use std::convert::TryInto;
                let metadata = request.metadata().to_owned();

                let stream = self
                    .handle_query(request.into_inner().into(), metadata)
                    .await
                    .map_err(|_| tonic::Status::internal("wtf"))?;
                let x = stream
                    .map(|response| -> Result<GetGameResponse, anyhow::Error> {
                        Ok(response?.try_into()?)
                    })
                    .map_err(|_| tonic::Status::internal("wtf"));

                Ok(tonic::Response::new(Box::pin(x)))
            }
        }
    }
}

// pub mod google {
//     pub mod firestore {
//         pub mod v1 {
//             tonic::include_proto!("google.firestore.v1");
//         }
//     }
//     pub mod rpc {
//         tonic::include_proto!("google.rpc");
//     }
//     pub mod r#type {
//         tonic::include_proto!("google.r#type");
//     }
// }

// pub mod pictophone {
//     pub mod v1_0 {
//         include!(concat!(env!("OUT_DIR"), "/pictophone.v1_0.rs"));
//     }
//     pub mod logic {
//         include!(concat!(env!("OUT_DIR"), "/pictophone.logic.rs"));
//     }
//     // pub mod v1_1 {
//     //     include!(concat!(env!("OUT_DIR"), "/pictophone.v1_1.rs"));
//     // }
// }
