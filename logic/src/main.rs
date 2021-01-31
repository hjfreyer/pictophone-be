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

#[derive(Debug, Hash, Clone, Copy, Eq, PartialEq, Ord, PartialOrd, Serialize, Deserialize)]
struct Card(u32);

#[derive(Debug, Clone, Serialize, Deserialize, Default)]
struct State {
    games: BTreeMap<GameId, Game>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
enum Game {
    Unstarted { players: Vec<PlayerId> },
    Started(StartedGame),
}

#[derive(Debug, Clone, Serialize, Deserialize)]
struct StartedGame {
    random_seed: u64,
    etag: u64,
    round_num: usize,
    num_mistakes: u32,
    cards_played: Vec<Card>,
    players: Vec<StartedGamePlayer>,
}

impl Default for Game {
    fn default() -> Self {
        Game::Unstarted { players: vec![] }
    }
}

#[derive(Debug, Clone, Serialize, Deserialize)]
struct StartedGamePlayer {
    id: PlayerId,
    hand: Vec<Card>,
}

impl Game {
    fn make_move(
        self,
        request: api::MakeMoveRequest,
    ) -> Result<Self, api::make_move_response::Error> {
        let game = match self {
            Game::Unstarted { .. } => return Err(api::GameNotStartedError {}.into()),
            Game::Started(game) => game,
        };

        let mut players = game.players;
        let active_player = players
            .iter_mut()
            .find(|p| p.id == PlayerId(request.player_id.clone()))
            .ok_or_else(|| api::PlayerNotInGameError {})?;

        if request.etag != game.etag {
            return Err(api::MoveAbortedError {}.into());
        };

        let played_card = active_player
            .hand
            .pop()
            .ok_or_else(|| api::EmptyHandError {})?;

        let mistakes_were_made = players
            .iter()
            .any(|p| p.hand.iter().any(|card| *card < played_card));

        let new_game = StartedGame {
            random_seed: game.random_seed,
            etag: game.etag + 1,
            round_num: game.round_num,
            num_mistakes: game.num_mistakes + if mistakes_were_made { 1 } else { 0 },
            cards_played: {
                let mut played = game.cards_played;
                played.push(played_card);
                played
            },
            players,
        };

        Ok(Game::Started(
            if new_game.players.iter().all(|p| p.hand.is_empty()) {
                new_game.advance_round()
            } else {
                new_game
            },
        ))
    }
}

impl StartedGame {
    fn advance_round(self) -> Self {
        use rand::seq::SliceRandom;
        use rand::Rng;
        use rand::SeedableRng;

        let mut rng = rand::rngs::StdRng::seed_from_u64(self.random_seed);

        let round_num = self.round_num + 1;

        let deck: Vec<Card> = (0..100).map(Card).collect();
        let num_players = self.players.len();

        let drawn: Vec<Card> = deck
            .choose_multiple(&mut rng, round_num * num_players)
            .copied()
            .collect();

        let players = self
            .players
            .into_iter()
            .zip(drawn.chunks(round_num))
            .map(|(player, hand)| StartedGamePlayer {
                id: player.id,
                hand: {
                    let mut hand = hand.to_vec();
                    hand.sort();
                    hand.reverse();
                    hand
                },
            })
            .collect();

        StartedGame {
            random_seed: rng.gen(),
            etag: self.etag,
            round_num,
            num_mistakes: self.num_mistakes,
            cards_played: vec![],
            players,
        }
    }
}

fn handle_join_game(
    state: Option<State>,
    request: api::JoinGameRequest,
) -> Result<Option<State>, api::join_game_response::Error> {
    let player_id = PlayerId(request.player_id);
    let mut state = state.unwrap_or_default();
    let game = state
        .games
        .entry(GameId(request.game_id.clone()))
        .or_default();

    match game {
        Game::Started { .. } => Err(api::GameAlreadyStartedError {}.into()),
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
) -> Result<Option<State>, api::start_game_response::Error> {
    let mut state = state.unwrap_or_default();
    let game = state
        .games
        .entry(GameId(request.game_id.clone()))
        .or_default();

    let players = match game {
        Game::Started { .. } => return Ok(None),
        Game::Unstarted { players } => players,
    };

    if !players.contains(&PlayerId(request.player_id.to_owned())) {
        return Err(api::PlayerNotInGameError {}.into());
    }

    let started_game = StartedGame {
        random_seed: request.random_seed,
        etag: 0,
        round_num: 0,
        num_mistakes: 0,
        cards_played: vec![],
        players: players
            .into_iter()
            .map(|player_id| StartedGamePlayer {
                id: player_id.clone(),
                hand: vec![],
            })
            .collect(),
    };

    *game = Game::Started(started_game.advance_round());

    Ok(Some(state))
}

fn handle_make_move(
    state: Option<State>,
    request: api::MakeMoveRequest,
) -> Result<Option<State>, api::make_move_response::Error> {
    let mut state = state.unwrap_or_default();
    let game = state
        .games
        .entry(GameId(request.game_id.clone()))
        .or_default();

    *game = game.clone().make_move(request)?;

    Ok(Some(state))
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

    let game = match game {
        Game::Unstarted { players } => {
            return if players.contains(&PlayerId(request.player_id.clone())) {
                Ok(api::Game {
                    player_ids: players.into_iter().map(|p| p.0).collect(),
                    state: Some(api::game::State::Unstarted(api::game::Unstarted {})),
                })
            } else {
                Err(api::PlayerNotInGameError {}.into())
            }
        }
        Game::Started(game) => game,
    };
    let active_player = game
        .players
        .iter()
        .find(|p| p.id == PlayerId(request.player_id.clone()))
        .ok_or_else(|| api::PlayerNotInGameError {})?;

    Ok(api::Game {
        player_ids: game.players.iter().map(|p| p.id.0.to_owned()).collect(),
        state: Some(api::game::State::Started(api::game::Started {
            num_mistakes: game.num_mistakes,
            round_num: game.round_num as u32,
            numbers_played: game.cards_played.iter().map(|c| c.0).collect(),
            hand: active_player.hand.iter().map(|c| c.0).collect(),
            etag: game.etag,
        })),
    })
}

fn handle_parsed_action(
    state: Option<State>,
    request: vpb::ActionRequest,
) -> anyhow::Result<(Option<State>, vpb::ActionResponse)> {
    let vpb::action_request::Version::V0p1(action_request) =
        request.version.expect("no version specified");

    let (new_state, response): (Option<State>, api::action_response::Method) =
        match action_request.method {
            Some(api::action_request::Method::JoinGameRequest(request)) => {
                let (state, response) = handle_join_game(state, request)
                    .map(|state| (state, Default::default()))
                    .unwrap_or_else(|error| (None, error.into()));
                (
                    state,
                    api::action_response::Method::JoinGameResponse(response),
                )
            }
            Some(api::action_request::Method::StartGameRequest(request)) => {
                let (state, response) = handle_start_game(state, request)
                    .map(|state| (state, Default::default()))
                    .unwrap_or_else(|error| (None, error.into()));
                (
                    state,
                    api::action_response::Method::StartGameResponse(response),
                )
            }
            Some(api::action_request::Method::MakeMoveRequest(request)) => {
                let (state, response) = handle_make_move(state, request)
                    .map(|state| (state, Default::default()))
                    .unwrap_or_else(|error| (None, error.into()));
                (
                    state,
                    api::action_response::Method::MakeMoveResponse(response),
                )
            }
            None => bail!("no method specified"),
        };
    Ok((
        new_state,
        api::ActionResponse {
            method: Some(response),
        }
        .into(),
    ))
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
