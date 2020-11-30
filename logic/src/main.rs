use {
    anyhow::anyhow,
    //     wasm_bindgen::prelude::*,
    proto::{
        v1::{self, Action, GameId, Response, ShortCodeId},
        LogicRequest, LogicResponse, VersionedAction, VersionedResponse,
    },
    serde::{Deserialize, Serialize},
    std::collections::BTreeMap,
    std::env,
};

// #[derive(Debug, Hash, Clone, Eq, PartialEq, Ord, PartialOrd)]
// enum TopicId {
//     Game(GameId),
//     ShortCode(ShortCodeId),
// }

// #[derive(Debug, Clone, Serialize, Deserialize)]
// enum Request {
//     Evolve {
//         state: Option<State>,
//         action: Action,
//     },
// }

// pub struct Response {
//     state : State,
//     response: proto::Response,
// }

#[derive(Debug, Clone, Serialize, Deserialize, Default)]
struct State {
    games: BTreeMap<GameId, Game>,
}

impl State {
    fn sc_to_game_id(&self, sc_id: &ShortCodeId) -> Option<GameId> {
        for (gid, game) in self.games.iter() {
            if game.short_code == *sc_id {
                return Some(gid.to_owned());
            }
        }
        None
    }
    //     fn game(&self) -> Option<&Game> {
    //         match self {
    //             State::Game(g) => Some(g),
    //             _ => None,
    //         }
    //     }

    //     fn sc(&self) -> Option<&ShortCode> {
    //         match self {
    //             State::ShortCode(sc) => Some(sc),
    //             _ => None,
    //         }
    //     }
}

#[derive(Debug, Clone, Serialize, Deserialize)]
struct Game {
    short_code: ShortCodeId,
}

// impl Default for Game {
//     fn default() -> Self {
//         Game::None
//     }
// }

// #[derive(Debug, Clone, Serialize, Deserialize)]
// enum ShortCode {
//     None,
//     ForGame(GameId),
// }

// impl Default for ShortCode {
//     fn default() -> Self {
//         ShortCode::None
//     }
// }

fn evolve(state: Option<State>, action: &v1::Action) -> Result<State, v1::Response> {
    match action {
        v1::Action::CreateGame {
            game_id,
            short_code,
        } => {
            // let game_topic_id = TopicId::Game(game_id.to_owned());
            // let sc_topic_id = TopicId::ShortCode(short_code.to_owned());
            // let game_state = match reads.get(&game_topic_id) {
            //     Some(state) => state
            //         .as_ref()
            //         .map(|s| s.game().unwrap().to_owned())
            //         .unwrap_or_default(),
            //     None => {
            //         return evolver::Response::NeedMore {
            //             topics: btreeset! {game_topic_id, sc_topic_id},
            //         }
            //     }
            // };
            // let sc_state = match reads.get(&sc_topic_id) {
            //     Some(state) => state
            //         .as_ref()
            //         .map(|s| s.sc().unwrap().to_owned())
            //         .unwrap_or_default(),
            //     None => {
            //         return evolver::Response::NeedMore {
            //             topics: btreeset! {game_topic_id, sc_topic_id},
            //         }
            //     }
            // };
            let mut state = state.unwrap_or_default();
            let game_state = state.games.get(game_id);

            match game_state {
                None => {}
                _ => {
                    return Err(Response::GameAlreadyExists {
                        game_id: game_id.to_owned(),
                    })
                }
            }

            if let Some(_) = state.sc_to_game_id(short_code) {
                return Err(Response::ShortCodeInUse {
                    short_code: short_code.to_owned(),
                });
            }

            state.games.insert(
                game_id.to_owned(),
                Game {
                    short_code: short_code.to_owned(),
                },
            );

            Ok(state)
        }
        Action::DeleteGame { game_id } => {
            let mut state = state.unwrap_or_default();

            if state.games.contains_key(game_id) {
                state.games.remove(game_id);
                Ok(state)
            } else {
                Err(Response::GameNotFound {
                    game_id: game_id.to_owned(),
                })
            }
        }
    }
}

fn main() -> Result<(), anyhow::Error> {
    let args: Vec<String> = env::args().collect();
    let request = args.get(1).ok_or(anyhow!("no request specified"))?;
    let request: LogicRequest = serde_json::from_str(request)?;

    let state: Option<State> = request
        .state
        .map(|s| serde_json::from_slice(&s))
        .transpose()?;
    let action = match request.action {
        VersionedAction::V1(action) => action,
    };
    let response = match evolve(state, &action) {
        Ok(state) => LogicResponse {
            state: Some(serde_json::to_vec(&state)).transpose()?,
            response: VersionedResponse::V1(Response::Ok),
        },

        Err(resp) => LogicResponse {
            state: None,
            response: VersionedResponse::V1(resp),
        },
    };
    serde_json::to_writer(std::io::stdout(), &response)?;
    Ok(())
}

// #[wasm_bindgen]
// pub fn greet(name: &str)->String {
//     format!("Hello, {}!", name)
// }
