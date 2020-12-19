use {
    proto::logic as ptl,
    proto::v1_0 as api,
    serde::{Deserialize, Serialize},
    std::collections::BTreeMap,
};

mod proto;

#[derive(Debug, Hash, Clone, Eq, PartialEq, Ord, PartialOrd, Serialize, Deserialize)]
pub struct GameId(pub String);

#[derive(Debug, Hash, Clone, Eq, PartialEq, Ord, PartialOrd, Serialize, Deserialize)]
pub struct ShortCodeId(pub String);

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
}

#[derive(Debug, Clone, Serialize, Deserialize)]
struct Game {
    short_code: ShortCodeId,
}

fn create_game(
    state: Option<State>,
    request: &api::CreateGameRequest,
) -> Result<State, api::CreateGameResponse> {
    let game_id = GameId(request.game_id.to_owned());
    let short_code = ShortCodeId(request.short_code.to_owned());

    let mut state = state.unwrap_or_default();
    let game_state = state.games.get(&game_id);

    match game_state {
        None => {}
        _ => {
            return Err(api::GameAlreadyExistsError {
                game_id: request.game_id.to_owned(),
            }
            .into())
        }
    }

    if let Some(_) = state.sc_to_game_id(&short_code) {
        return Err(api::ShortCodeInUseError {
            short_code: request.short_code.to_owned(),
        }
        .into());
    }

    state.games.insert(
        game_id.to_owned(),
        Game {
            short_code: short_code.to_owned(),
        },
    );

    Ok(state)
}

fn delete_game(
    state: Option<State>,
    request: &api::DeleteGameRequest,
) -> Result<State, api::DeleteGameResponse> {
    let game_id = GameId(request.game_id.to_owned());

    let mut state = state.unwrap_or_default();

    if let None = state.games.remove(&game_id) {
        return Err(api::GameNotFoundError {
            game_id: request.game_id.to_owned(),
        }
        .into());
    }

    Ok(state)
}

fn evolve1_0(state: Option<State>, action: &api::Action) -> (Option<State>, api::Response) {
    match &action.method {
        Some(api::action::Method::CreateGame(request)) => {
            let (state, response) = create_game(state, request)
                .map(|s| (Some(s), api::CreateGameResponse { error: None }))
                .unwrap_or_else(|r| (None, r));
            let response = api::Response {
                method: Some(api::response::Method::CreateGame(response)),
            };
            (state, response)
        }
        Some(api::action::Method::DeleteGame(request)) => {
            let (state, response) = delete_game(state, request)
                .map(|s| (Some(s), api::DeleteGameResponse { error: None }))
                .unwrap_or_else(|r| (None, r));
            let response = api::Response {
                method: Some(api::response::Method::DeleteGame(response)),
            };
            (state, response)
        }
        None => unimplemented!(),
    }
}

fn evolve(
    state: Option<State>,
    action: &ptl::VersionedAction,
) -> (Option<State>, ptl::VersionedResponse) {
    match &action.version {
        Some(ptl::versioned_action::Version::V10(action)) => {
            let (state, resp) = evolve1_0(state, action);
            (
                state,
                ptl::VersionedResponse {
                    version: Some(ptl::versioned_response::Version::V10(resp)),
                },
            )
        }
        None => unimplemented!(),
    }
}

fn main() -> Result<(), anyhow::Error> {
    let mut buffer = vec![];
    use prost::Message;
    use std::io::{Read, Write};
    let _ = std::io::stdin().read_to_end(&mut buffer)?;

    let request = ptl::Request::decode(buffer.as_slice())?;

    match request.method {
        Some(ptl::request::Method::Evolve(request)) => {
            let state = if request.state.len() == 0 {
                None
            } else {
                serde_json::from_slice(&request.state)?
            };
            let (state, response) = evolve(state, &request.action.unwrap());

            let mut resp_buf = vec![];
            let () = ptl::Response {
                method: Some(ptl::response::Method::Evolve(ptl::EvolveResponse {
                    state: state
                        .map(|s| serde_json::to_vec(&s))
                        .transpose()?
                        .unwrap_or_else(|| vec![]),
                    response: Some(response),
                })),
            }
            .encode(&mut resp_buf)?;

            let _ = std::io::stdout().lock().write(&resp_buf)?;
        }
        _ => unimplemented!(),
    }
    Ok(())
}
