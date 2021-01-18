#[derive(thiserror::Error, Debug)]
#[error("wrong oneof selected")]
pub struct WrongOneofSelected();

macro_rules! oneof_convert {
    ($container_type:ident, $oneof_field:ident, $($elem_type:ident, )*) => {
        oneof_convert!($container_type, $oneof_field, $(($elem_type, $elem_type), )*);
    };
    ($container_type:ident, $oneof_field:ident, $(($elem_type:ty, $elem_field_name:ident), )*) => {
        paste::paste!{
            $(
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
                            _ => Err($crate::proto::WrongOneofSelected()),
                        }
                    }
                }
            )*
            oneof_enum_convert!([<$container_type:snake>] ::[<$oneof_field:camel>], $(($elem_type, $elem_field_name), )*);
            single_field_convert!($container_type, [<$container_type:snake>] ::[<$oneof_field:camel>], $oneof_field);
        }
    };
}

macro_rules! oneof_enum_convert {
    ($enum_type:ty, $($elem_type:ident, )+) => {
        oneof_enum_convert!($enum_type, $(($elem_type, $elem_type), )+);
    };
    ($enum_type:ty, $(($elem_type:ty, $elem_field_name:ident), )*) => {
        paste::paste!{
            $(
                impl From<$elem_type> for $enum_type {
                    fn from(e: $elem_type) -> Self {
                        $enum_type::$elem_field_name(e)
                    }
                }

                impl std::convert::TryFrom<$enum_type> for $elem_type {
                    type Error = $crate::proto::WrongOneofSelected;
                    fn try_from(value: $enum_type) -> Result<Self, Self::Error> {
                        match value {
                            $enum_type :: $elem_field_name(e) => Ok(e),
                            _ => Err($crate::proto::WrongOneofSelected()),
                        }
                    }
                }
            )*
        }
    };
}

macro_rules! single_field_convert {
    ($container_type:ty, $field_type:ty, $field_name:ident) => {
        paste::paste! {
            impl From<$field_type> for $container_type {
                fn from(value: $field_type) -> Self {
                    Self { $field_name: Some(value) }
                }
            }
        }
    };
}

pub mod v0_1 {
    include!(concat!(env!("OUT_DIR"), "/pictophone.v0_1.rs"));

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

    oneof_convert!(
        JoinGameResponse,
        error,
        GameAlreadyStartedError,
        UnknownError,
    );

    oneof_convert!(StartGameResponse, error, UnknownError, PlayerNotInGameError,);

    oneof_convert!(
        MakeMoveResponse,
        error,
        UnknownError,
        MoveAbortedError,
        PlayerNotInGameError,
        GameNotStartedError,
        EmptyHandError,
    );

    oneof_enum_convert!(get_game_response::Error, UnknownError, PlayerNotInGameError,);
}

pub mod dolt {
    include!(concat!(env!("OUT_DIR"), "/dolt.rs"));

    oneof_convert!(Request, method, ActionRequest, QueryRequest,);
    oneof_convert!(Response, method, ActionResponse, QueryResponse,);
}

pub mod versioned {
    include!(concat!(env!("OUT_DIR"), "/pictophone.versioned.rs"));

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
}
