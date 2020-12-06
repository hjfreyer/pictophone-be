use serde::{Deserialize, Serialize};

#[derive(Debug, Clone, Serialize, Deserialize)]
pub enum VersionedAction {
    V1(v1::Action),
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub enum VersionedResponse {
    V1(v1::Response),
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub enum LogicResponse {
    Evolve(EvolveResponse),
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct EvolveResponse {
    // #[serde(with = "base64")]
    pub state: Option<Vec<u8>>,
    pub response: VersionedResponse,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub enum LogicRequest {
    Evolve(EvolveRequest),
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct EvolveRequest {
    pub state: Option<Vec<u8>>,
    pub action: VersionedAction,
}

pub mod v1 {
    use serde::{Deserialize, Serialize};

    #[derive(Debug, Hash, Clone, Eq, PartialEq, Ord, PartialOrd, Serialize, Deserialize)]
    pub struct GameId(pub String);

    #[derive(Debug, Hash, Clone, Eq, PartialEq, Ord, PartialOrd, Serialize, Deserialize)]
    pub struct ShortCodeId(pub String);

    #[derive(Debug, Clone, Serialize, Deserialize)]
    pub enum Action {
        CreateGame {
            game_id: GameId,
            short_code: ShortCodeId,
        },
        DeleteGame {
            game_id: GameId,
        },
    }

    #[derive(Debug, Clone, Serialize, Deserialize)]
    pub enum Response {
        Ok,
        GameNotFound { game_id: GameId },
        GameAlreadyExists { game_id: GameId },
        ShortCodeInUse { short_code: ShortCodeId },
    }
}

// mod base64 {
//     use base64;
//     use serde::{Serializer, de, Deserialize, Deserializer};

//     pub fn serialize<S>(bytes: &[u8], serializer: S) -> Result<S::Ok, S::Error>
//         where S: Serializer
//     {
//         serializer.serialize_ ;
//         serialize_str(&base64::encode(bytes))

//         // Could also use a wrapper type with a Display implementation to avoid
//         // allocating the String.
//         //
//         // serializer.collect_str(&Base64(bytes))
//     }

//     pub fn deserialize<'de, D>(deserializer: D) -> Result<Vec<u8>, D::Error>
//         where D: Deserializer<'de>
//     {
//         let s = <&str>::deserialize(deserializer)?;
//         base64::decode(s).map_err(de::Error::custom)
//     }
// }
