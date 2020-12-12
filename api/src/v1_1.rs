use {
    crate::v1_0::{GameId, ShortCodeId},
    serde::{Deserialize, Serialize},
};

#[derive(Debug, Clone, Serialize, Deserialize)]
pub enum WatchRequest {
    Game(GameId),
    ShortCode(ShortCodeId),
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub enum WatchResponse {
    Game(Option<Game>),
    ShortCode(Option<ShortCode>),
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct Game {
    short_code: ShortCodeId,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct ShortCode {
    game: GameId,
}
