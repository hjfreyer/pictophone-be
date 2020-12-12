
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
