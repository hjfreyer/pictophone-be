macro_rules! oneof_convert {
    ($container_type:ident, $enum_field:ident, $container_enum:ty, $($element_type:ident, )*) => {
        oneof_convert!($container_type, $enum_field, $container_enum, $(($element_type, $element_type),)*);
    };
    ($container_type:ident, $enum_field:ident, $container_enum:ty, $(($element_type:ty, $element_enum:ident), )*) => {
        $(
            impl From<$element_type> for $container_type {
                fn from(e: $element_type) -> Self {
                    Self {
                        $enum_field: Some(<$container_enum>::$element_enum(e)),
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
        create_game_response::Error,
        GameAlreadyExistsError,
        ShortCodeInUseError,
    );
    oneof_convert!(
        DeleteGameResponse,
        error,
        delete_game_response::Error,
        GameNotFoundError,
    );

    oneof_convert!(
        Action,
        method,
        action::Method,
        CreateGameRequest,
        DeleteGameRequest,
    );
    oneof_convert!(
        Response,
        method,
        response::Method,
        CreateGameResponse,
        DeleteGameResponse,
    );
}

pub mod v1_1 {
    include!(concat!(env!("OUT_DIR"), "/pictophone.v1_1.rs"));

    oneof_convert!(
        Action,
        method,
        action::Method,
        (super::v1_0::CreateGameRequest, CreateGameRequest),
        (super::v1_0::DeleteGameRequest, DeleteGameRequest),
    );
    oneof_convert!(
        Response,
        method,
        response::Method,
        (super::v1_0::CreateGameResponse, CreateGameResponse),
        (super::v1_0::DeleteGameResponse, DeleteGameResponse),
    );

    oneof_convert!(
        QueryResponse,
        method,
        query_response::Method,
        GetGameResponse,
    );
}

pub mod logic {
    include!(concat!(env!("OUT_DIR"), "/pictophone.logic.rs"));

    oneof_convert!(
        VersionedAction,
        version,
        versioned_action::Version,
        (super::v1_0::Action, V1p0),
        (super::v1_1::Action, V1p1),
    );

    oneof_convert!(
        VersionedResponse,
        version,
        versioned_response::Version,
        (super::v1_0::Response, V1p0),
        (super::v1_1::Response, V1p1),
    );

    oneof_convert!(
        VersionedQueryRequest,
        version,
        versioned_query_request::Version,
        (super::v1_0::QueryRequest, V1p0),
        (super::v1_1::QueryRequest, V1p1),
    );

    oneof_convert!(
        VersionedQueryResponse,
        version,
        versioned_query_response::Version,
        (super::v1_0::QueryResponse, V1p0),
        (super::v1_1::QueryResponse, V1p1),
    );
}
