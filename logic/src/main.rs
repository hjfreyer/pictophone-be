use anyhow::bail;

use {
    proto::dolt as dpb,
    proto::v0_1 as api,
    proto::versioned as vpb,
    serde::{Deserialize, Serialize},
    std::collections::BTreeMap,
};

mod proto;

macro_rules! oneof_dispatch {
    ($mod:ident, $container_name:ident.$field:ident, $($case:ident => $handler:expr, )*) => {
        paste::paste!{
            match $container_name.$field {
                $(
                    Some($mod :: $container_name :: [<$field:camel>] :: $case(request)) => {
                        $handler(request).map(|response| response.into())
                    }
                )*
                None => unimplemented!("no $case specified"),
            }
        }
    };
}

#[derive(Debug, Hash, Clone, Eq, PartialEq, Ord, PartialOrd, Serialize, Deserialize)]
struct GameId(String);

#[derive(Debug, Hash, Clone, Eq, PartialEq, Ord, PartialOrd, Serialize, Deserialize)]
struct PlayerId(String);

#[derive(Debug, Clone, Serialize, Deserialize, Default)]
struct State {
    games: BTreeMap<GameId, Game>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
enum Game {
    Unstarted { players: Vec<PlayerId> },
    Started { players: Vec<StartedGamePlayer> },
}

impl Default for Game {
    fn default() -> Self {
        Game::Unstarted { players: vec![] }
    }
}

#[derive(Debug, Clone, Serialize, Deserialize)]
struct StartedGamePlayer {
    id: PlayerId,
    submissions: Vec<Submission>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
enum Submission {
    Word(String),
    DrawingId(String),
}

fn handle_join_game(
    state: Option<State>,
    request: api::JoinGameRequest,
) -> Result<Option<State>, api::JoinGameResponse> {
    let player_id = PlayerId(request.player_id);
    let mut state = state.unwrap_or_default();
    let game = state
        .games
        .entry(GameId(request.game_id.clone()))
        .or_default();

    match game {
        Game::Started { .. } => Err(api::GameAlreadyStartedError {
            game_id: request.game_id,
        }
        .into()),
        Game::Unstarted { players } if players.contains(&player_id) => Ok(None),
        Game::Unstarted { players } => {
            players.push(player_id);
            Ok(Some(state))
        }
    }
}

fn handle_start_game(
    state: Option<State>,
    request: api::StartGameRequest,
) -> Result<Option<State>, api::StartGameResponse> {
    let mut state = state.unwrap_or_default();
    let game = state
        .games
        .entry(GameId(request.game_id.clone()))
        .or_default();

    let players = match game {
        Game::Started { .. } => return Ok(None),
        Game::Unstarted { players } => players,
    };

    *game = Game::Started {
        players: players
            .into_iter()
            .map(|player_id| StartedGamePlayer {
                id: player_id.clone(),
                submissions: vec![],
            })
            .collect(),
    };

    Ok(Some(state))
}

fn handle_make_move(
    state: Option<State>,
    request: api::MakeMoveRequest,
) -> Result<Option<State>, api::MakeMoveResponse> {
    let mut state = state.unwrap_or_default();
    let game = state
        .games
        .entry(GameId(request.game_id.clone()))
        .or_default();

    let players = match game {
        Game::Unstarted { .. } => {
            return Err(api::NotYourTurnError {
                game_id: request.game_id,
                player_id: request.player_id,
            }
            .into())
        }
        Game::Started { players } => players,
    };

    let num_players = players.len();
    let round_num = players
        .iter()
        .map(|p| p.submissions.len())
        .min()
        .unwrap_or(0);

    let player = players
        .iter_mut()
        .find(|p| p.id == PlayerId(request.player_id.clone()));
    let player = match player {
        Some(player) => player,
        None => {
            return Err(api::NotYourTurnError {
                game_id: request.game_id,
                player_id: request.player_id,
            }
            .into())
        }
    };

    if round_num == num_players || player.submissions.len() != round_num {
        return Err(api::NotYourTurnError {
            game_id: request.game_id,
            player_id: request.player_id,
        }
        .into());
    }

    let wanted = if round_num % 2 == 0 {
        api::SubmissionKind::Word
    } else {
        api::SubmissionKind::Drawing
    };

    let submission_or_got = match request.submission {
        Some(api::make_move_request::Submission::Word(word))
            if wanted == api::SubmissionKind::Word =>
        {
            Ok(Submission::Word(word))
        }
        Some(api::make_move_request::Submission::Word(..)) => Err(api::SubmissionKind::Word),
        Some(api::make_move_request::Submission::DrawingId(drawing_id))
            if wanted == api::SubmissionKind::Drawing =>
        {
            Ok(Submission::DrawingId(drawing_id))
        }
        Some(api::make_move_request::Submission::DrawingId(..)) => {
            Err(api::SubmissionKind::Drawing)
        }
        None => Err(api::SubmissionKind::Unspecified),
    };

    let submission = submission_or_got.map_err(|got| api::IncorrectSubmissionKindError {
        wanted: wanted as i32,
        got: got as i32,
    })?;

    player.submissions.push(submission);
    Ok(Some(state))
}

impl From<Submission> for api::sequence::entry::Submission {
    fn from(s: Submission) -> Self {
        match s {
            Submission::Word(word) => Self::Word(word),
            Submission::DrawingId(drawing) => Self::DrawingId(drawing),
        }
    }
}

impl From<Submission> for api::game::ready_for_response::Prompt {
    fn from(s: Submission) -> Self {
        match s {
            Submission::Word(word) => Self::Word(word),
            Submission::DrawingId(drawing) => Self::DrawingId(drawing),
        }
    }
}

impl From<api::sequence::entry::Submission> for Submission {
    fn from(s: api::sequence::entry::Submission) -> Self {
        match s {
            api::sequence::entry::Submission::Word(word) => Self::Word(word),
            api::sequence::entry::Submission::DrawingId(drawing) => Self::DrawingId(drawing),
        }
    }
}

fn handle_get_game(
    state: Option<State>,
    request: api::GetGameRequest,
) -> Result<api::Game, api::get_game_response::Error> {
    let state = state.unwrap_or_default();
    let game = state
        .games
        .get(&GameId(request.game_id.clone()))
        .cloned()
        .unwrap_or_default();

    match game {
        Game::Unstarted { players } => {
            if players.contains(&PlayerId(request.player_id.clone())) {
                Ok(api::Game {
                    player_ids: players.into_iter().map(|p| p.0).collect(),
                    state: Some(api::game::State::Unstarted(api::game::Unstarted {})),
                })
            } else {
                Err(api::get_game_response::Error::PlayerNotInGameError(
                    api::PlayerNotInGameError {
                        game_id: request.game_id,
                        player_id: request.player_id,
                    },
                ))
            }
        }
        Game::Started { players } => {
            let num_players = players.len();
            let round_num = players
                .iter()
                .map(|p| p.submissions.len())
                .min()
                .unwrap_or(0);
            let player_ids = players.iter().map(|p| p.id.0.to_owned()).collect();
            let (active_player_idx, active_player) = players
                .iter()
                .enumerate()
                .find(|(_, p)| p.id == PlayerId(request.player_id.clone()))
                .ok_or_else(|| {
                    api::get_game_response::Error::PlayerNotInGameError(api::PlayerNotInGameError {
                        game_id: request.game_id,
                        player_id: request.player_id,
                    })
                })?;

            if num_players == round_num {
                // Game is over.
                let mut sequences = vec![api::Sequence { entries: vec![] }; num_players];
                for round_idx in 0..round_num {
                    for (player_idx, player) in players.iter().enumerate() {
                        sequences[(round_idx + player_idx) % num_players]
                            .entries
                            .push(api::sequence::Entry {
                                player_id: player.id.0.clone(),
                                submission: Some(player.submissions[round_idx].to_owned().into()),
                            })
                    }
                }

                Ok(api::Game {
                    player_ids,
                    state: Some(api::game::State::Complete(api::game::Complete {
                        sequences,
                    })),
                })
            } else if active_player.submissions.len() == 0 {
                // First round.
                Ok(api::Game {
                    player_ids,
                    state: Some(api::game::State::ReadyForInitialPrompt(
                        api::game::ReadyForInitialPrompt {},
                    )),
                })
            } else if active_player.submissions.len() == round_num {
                // Non-first round, waiting for response.
                let next_player_idx = (active_player_idx + 1) % num_players;
                let prompt = &players[next_player_idx].submissions[round_num - 1];
                Ok(api::Game {
                    player_ids,
                    state: Some(api::game::State::ReadyForResponse(
                        api::game::ReadyForResponse {
                            prompt: Some(prompt.to_owned().into()),
                        },
                    )),
                })
            } else {
                // Blocked on other players.
                Ok(api::Game {
                    player_ids,
                    state: Some(api::game::State::Blocked(api::game::Blocked {})),
                })
            }
        }
    }
}

fn handle_parsed_action(
    state: Option<State>,
    request: vpb::ActionRequest,
) -> anyhow::Result<(Option<State>, vpb::ActionResponse)> {
    let vpb::action_request::Version::V0p1(action_request) =
        request.version.expect("no version specified");

    let result: Result<Option<State>, api::ActionResponse> = match action_request.method {
        Some(api::action_request::Method::JoinGameRequest(request)) => {
            handle_join_game(state, request).map_err(|r| r.into())
        }
        Some(api::action_request::Method::StartGameRequest(request)) => {
            handle_start_game(state, request).map_err(|r| r.into())
        }
        Some(api::action_request::Method::MakeMoveRequest(request)) => {
            handle_make_move(state, request).map_err(|r| r.into())
        }
        None => bail!("no method specified"),
    };
    let (new_state, response) = result
        .map(|s| (s, Default::default()))
        .unwrap_or_else(|e| (None, e));

    Ok((new_state, response.into()))
}

fn handle_parsed_query(
    state: Option<State>,
    request: vpb::QueryRequest,
) -> anyhow::Result<vpb::QueryResponse> {
    let vpb::query_request::Version::V0p1(query_request) =
        request.version.expect("no version specified");

    let response: api::QueryResponse = match query_request.method {
        Some(api::query_request::Method::GetGameRequest(request)) => {
            handle_get_game(state, request)
                .map(|game| api::GetGameResponse {
                    game: Some(game),
                    error: None,
                })
                .unwrap_or_else(|error| api::GetGameResponse {
                    game: None,
                    error: Some(error),
                })
                .into()
        }
        None => bail!("no method specified"),
    };

    Ok(response.into())
}

fn handle_action(request: dpb::ActionRequest) -> anyhow::Result<dpb::ActionResponse> {
    use prost::Message;

    let state = request
        .state
        .map(|state| serde_json::from_slice(state.serialized.as_slice()))
        .transpose()?;
    let action_request = vpb::ActionRequest::decode(request.action.as_slice())?;

    let (new_state, response) = handle_parsed_action(state, action_request)?;

    let mut response_buf = vec![];
    let () = response.encode(&mut response_buf)?;
    Ok(dpb::ActionResponse {
        state: new_state
            .map(|state| -> anyhow::Result<dpb::State> {
                Ok(dpb::State {
                    serialized: serde_json::to_vec(&state)?,
                })
            })
            .transpose()?,
        response: response_buf,
    })
}

fn handle_query(request: dpb::QueryRequest) -> anyhow::Result<dpb::QueryResponse> {
    use prost::Message;

    let state = request
        .state
        .map(|state| serde_json::from_slice(state.serialized.as_slice()))
        .transpose()?;
    let query_request = vpb::QueryRequest::decode(request.query.as_slice())?;

    let response = handle_parsed_query(state, query_request)?;

    let mut response_buf = vec![];
    let () = response.encode(&mut response_buf)?;
    Ok(dpb::QueryResponse {
        response: response_buf,
    })
}

fn main() -> Result<(), anyhow::Error> {
    use prost::Message;
    use std::io::{Read, Write};

    let mut req_buf = vec![];
    let _ = std::io::stdin().read_to_end(&mut req_buf)?;

    let request = dpb::Request::decode(req_buf.as_slice())?;

    let response: dpb::Response = oneof_dispatch!(dpb, request.method,
        ActionRequest => handle_action,
        QueryRequest => handle_query,
    )?;

    let mut resp_buf = vec![];
    let () = response.encode(&mut resp_buf)?;
    let _ = std::io::stdout().lock().write(&resp_buf)?;
    Ok(())
}
