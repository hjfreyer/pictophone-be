use serde::{Deserialize, Serialize};

pub mod v1_0;
pub mod v1_1;

#[derive(Debug, Clone, Serialize, Deserialize)]
pub enum ApiVersion {
    V1_0,
    V1_1,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub enum VersionedAction {
    V1_0(v1_0::Action),
    V1_1(v1_0::Action),
}

impl VersionedAction {
    pub fn version(&self) -> ApiVersion {
        match self {
            VersionedAction::V1_0(_) => ApiVersion::V1_0,
            VersionedAction::V1_1(_) => ApiVersion::V1_1,
        }
    }
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub enum VersionedResponse {
    V1_0(v1_0::Response),
    V1_1(v1_0::Response),
}


impl VersionedResponse {
    pub fn version(&self) -> ApiVersion {
        match self {
            VersionedResponse::V1_0(_) => ApiVersion::V1_0,
            VersionedResponse::V1_1(_) => ApiVersion::V1_1,
        }
    }
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub enum VersionedWatchRequest {
    V1_1(v1_1::WatchRequest),
}


impl VersionedWatchRequest {
    pub fn version(&self) -> ApiVersion {
        match self {
            VersionedWatchRequest::V1_1(_) => ApiVersion::V1_1,
        }
    }
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub enum VersionedWatchResponse {
    V1_1(v1_1::WatchResponse),
}


impl VersionedWatchResponse {
    pub fn version(&self) -> ApiVersion {
        match self {
            VersionedWatchResponse::V1_1(_) => ApiVersion::V1_1,
        }
    }
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub enum LogicRequest {
    Evolve(EvolveRequest),
    Watch(WatchRequest),
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub enum LogicResponse {
    Evolve(EvolveResponse),
    Watch(WatchResponse),
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct EvolveRequest {
    pub state: Option<Vec<u8>>,
    pub action: VersionedAction,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct EvolveResponse {
    pub state: Option<Vec<u8>>,
    pub response: VersionedResponse,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct WatchRequest {
    pub state: Option<Vec<u8>>,
    pub request: VersionedWatchRequest,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct WatchResponse {
    pub state: Option<Vec<u8>>,
    pub response: VersionedWatchResponse,
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
