pub mod pictophone {
    pub mod logic {
        tonic::include_proto!("pictophone.logic");

        macro_rules! version {
            ($version_mod:ident, $version_enum:ident) => {
                impl From<super::$version_mod::Action> for VersionedAction {
                    fn from(value: super::$version_mod::Action) -> Self {
                        Self {
                            version: Some(versioned_action::Version::$version_enum(value)),
                        }
                    }
                }

                impl std::convert::TryFrom<VersionedAction> for super::$version_mod::Action {
                    type Error = WrongVersionError;

                    fn try_from(value: VersionedAction) -> Result<Self, Self::Error> {
                        match value.version {
                            Some(versioned_action::Version::V10(a)) => Ok(a),
                            _ => Err(WrongVersionError()),
                        }
                    }
                }

                impl From<super::$version_mod::Response> for VersionedResponse {
                    fn from(value: super::$version_mod::Response) -> Self {
                        Self {
                            version: Some(versioned_response::Version::$version_enum(value)),
                        }
                    }
                }

                impl std::convert::TryFrom<VersionedResponse> for super::$version_mod::Response {
                    type Error = WrongVersionError;

                    fn try_from(value: VersionedResponse) -> Result<Self, Self::Error> {
                        match value.version {
                            Some(versioned_response::Version::V10(a)) => Ok(a),
                            _ => Err(WrongVersionError()),
                        }
                    }
                }
            };
        }

        version!(v1_0, V10);

        #[derive(thiserror::Error, Debug)]
        #[error("wrong version")]
        pub struct WrongVersionError();
    }
    pub mod v1_0 {
        use std::convert::TryFrom;

        tonic::include_proto!("pictophone.v1_0");

        #[derive(thiserror::Error, Debug)]
        #[error("wrong method")]
        pub struct WrongMethodError();

        impl TryFrom<Response> for CreateGameResponse {
            type Error = WrongMethodError;

            fn try_from(value: Response) -> Result<Self, Self::Error> {
                match value.method {
                    Some(response::Method::CreateGame(resp)) => Ok(resp),
                    _ => Err(WrongMethodError()),
                }
            }
        }

        impl TryFrom<Response> for DeleteGameResponse {
            type Error = WrongMethodError;

            fn try_from(value: Response) -> Result<Self, Self::Error> {
                match value.method {
                    Some(response::Method::DeleteGame(resp)) => Ok(resp),
                    _ => Err(WrongMethodError()),
                }
            }
        }

        macro_rules! action {
            ($method_name:ident, $request_type:ident) => {
                impl From<$request_type> for Action {
                    fn from(value: $request_type) -> Self {
                        Self {
                            method: Some(action::Method::$method_name(value)),
                        }
                    }
                }

                impl TryFrom<Action> for $request_type {
                    type Error = WrongMethodError;

                    fn try_from(value: Action) -> Result<Self, Self::Error> {
                        match value.method {
                            Some(action::Method::$method_name(action)) => Ok(action),
                            _ => Err(WrongMethodError()),
                        }
                    }
                }
            };
        }

        action!(CreateGame, CreateGameRequest);
        action!(DeleteGame, DeleteGameRequest);
    }
    // pub mod v1_1 {
    //     tonic::include_proto!("pictophone.v1_1");
    // }
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
