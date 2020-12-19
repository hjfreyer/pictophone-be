pub mod v1_0 {
    include!(concat!(env!("OUT_DIR"), "/pictophone.v1_0.rs"));

    macro_rules! error_cases {
        ($response_type:ident, $response_mod:ident, $(($error_type:ident, $error_enum:ident), )*) => {
            $(
                impl From<$error_type> for $response_type {
                    fn from(e: $error_type) -> Self {
                        Self {
                            error: Some($response_mod::Error::$error_enum(e)),
                        }
                    }
                }
            )*
        };
    }

    error_cases!(
        CreateGameResponse,
        create_game_response,
        (GameAlreadyExistsError, GameAlreadyExists),
        (ShortCodeInUseError, ShortCodeInUse),
    );
    error_cases!(
        DeleteGameResponse,
        delete_game_response,
        (GameNotFoundError, GameNotFound),
    );
}
pub mod logic {
    include!(concat!(env!("OUT_DIR"), "/pictophone.logic.rs"));
}
