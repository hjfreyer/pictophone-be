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
                    type Error = $crate::proto::WrongOneofSelected;
                    fn try_from(value: $container_type) -> Result<Self, Self::Error> {
                        match value.$oneof_field {
                            Some([<$container_type:snake>] ::[<$oneof_field:camel>]::$elem_field_name(e)) => Ok(e),
                            _ => Err($crate::proto::WrongOneofSelected()),
                        }
                    }
                }
            }
        )*
    };
}

pub mod v1_0 {
    include!(concat!(env!("OUT_DIR"), "/pictophone.v1_0.rs"));

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
}

pub mod v1_1 {
    include!(concat!(env!("OUT_DIR"), "/pictophone.v1_1.rs"));

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

    oneof_convert!(QueryResponse, method, GetGameResponse,);
}

pub mod dolt {
    include!(concat!(env!("OUT_DIR"), "/pictophone.dolt.rs"));

    oneof_convert!(Request, method, ActionRequest, QueryRequest,);
    oneof_convert!(Response, method, ActionResponse, QueryResponse,);
}

pub mod versioned {
    include!(concat!(env!("OUT_DIR"), "/pictophone.versioned.rs"));

    oneof_convert!(
        ActionRequest,
        version,
        (super::v1_0::ActionRequest, V1p0),
        (super::v1_1::ActionRequest, V1p1),
    );

    oneof_convert!(
        ActionResponse,
        version,
        (super::v1_0::ActionResponse, V1p0),
        (super::v1_1::ActionResponse, V1p1),
    );

    oneof_convert!(
        QueryRequest,
        version,
        (super::v1_0::QueryRequest, V1p0),
        (super::v1_1::QueryRequest, V1p1),
    );

    oneof_convert!(
        QueryResponse,
        version,
        (super::v1_0::QueryResponse, V1p0),
        (super::v1_1::QueryResponse, V1p1),
    );
}
