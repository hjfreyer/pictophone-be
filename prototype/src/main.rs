use std::collections::{BTreeMap, BTreeSet};

use maplit::{btreemap, btreeset};

trait CommitGraph {
    type CommitId;
    type Action;

    fn action(&self, commit_id: &Self::CommitId) -> Option<Self::Action>;

    fn predecessors(&self, commit_id: &Self::CommitId) -> Vec<Self::CommitId>;
}

struct TestCommitGraph {}

impl CommitGraph for TestCommitGraph {
    type CommitId = ChangeId;

    type Action = Action;

    fn action(&self, commit_id: &Self::CommitId) -> Option<Self::Action> {
        let game_a = || GameId("a".to_owned());
        let game_b = || GameId("b".to_owned());
        let sc_a = || ShortCodeId("A".to_owned());
        vec![
            Action::CreateGame {
                game_id: game_a(),
                short_code: sc_a(),
            },
            Action::CreateGame {
                game_id: game_b(),
                short_code: sc_a(),
            },
            Action::DeleteGame { game_id: game_a() },
            Action::CreateGame {
                game_id: game_b(),
                short_code: sc_a(),
            },
        ]
        .get(commit_id.0)
        .cloned()
    }

    fn predecessors(&self, commit_id: &Self::CommitId) -> Vec<Self::CommitId> {
        vec![
            vec![],
            vec![ChangeId(0)],
            vec![ChangeId(0)],
            vec![ChangeId(2)],
        ]
        .get(commit_id.0)
        .cloned()
        .unwrap_or_default()
    }
}

mod evolver {
    use std::collections::{BTreeMap, BTreeSet};

    pub trait Evolver {
        type Action;
        type Response;

        type Id;
        type State;

        fn evolve(
            &self,
            action: &Self::Action,
            reads: BTreeMap<Self::Id, Option<Self::State>>,
        ) -> Response<Self::Response, Self::Id, Self::State>;
    }

    #[derive(Debug, Clone)]
    pub enum Response<R, Id, State> {
        NeedMore {
            topics: BTreeSet<Id>,
        },
        Commit {
            response: R,
            updates: BTreeMap<Id, State>,
        },
    }
}

#[derive(Debug, Hash, Copy, Clone, Eq, PartialEq, Ord, PartialOrd)]
struct TopicRev(usize);

#[derive(Debug, Hash, Clone, Copy, Eq, PartialEq)]
struct ChangeId(usize);

fn merge_trees<Key, Rank, Value>(
    input: Vec<BTreeMap<Key, (Rank, Value)>>,
) -> BTreeMap<Key, (Rank, Value)>
where
    Key: Ord,
    Rank: Ord,
{
    let mut res = btreemap![];

    for inmap in input.into_iter() {
        for (topic_id, (new_rev, new_state)) in inmap.into_iter() {
            match res.get(&topic_id) {
                None => {
                    res.insert(topic_id, (new_rev, new_state));
                }
                Some((prev_rev, _prev_state)) => {
                    if *prev_rev < new_rev {
                        res.insert(topic_id, (new_rev, new_state));
                    }
                }
            }
        }
    }

    res
}

#[derive(Debug)]
enum OutputsError {
    CommitIdNotFound,
}

fn outputs<Action, CommitId, StateId, State, Response>(
    graph: &impl CommitGraph<Action = Action, CommitId = CommitId>,
    evolver: &impl evolver::Evolver<Action = Action, Id = StateId, State = State, Response = Response>,
    change_id: &CommitId,
) -> Result<(Response, BTreeMap<StateId, (TopicRev, State)>), OutputsError>
where
    StateId: Ord + Clone,
    State: Clone,
{
    let action = if let Some(action) = graph.action(change_id) {
        action
    } else {
        return Err(OutputsError::CommitIdNotFound);
    };
    let preds = graph.predecessors(change_id);
    let outs: Result<Vec<(Response, BTreeMap<StateId, (TopicRev, State)>)>, OutputsError> = preds
        .iter()
        .map(|cid| outputs(graph, evolver, cid))
        .collect();
    let outs = merge_trees(outs?.into_iter().map(|(_resp, states)| states).collect());

    let mut needs: BTreeSet<StateId> = btreeset![];
    loop {
        let reads = needs
            .iter()
            .map(|topic_id| {
                (
                    topic_id.to_owned(),
                    outs.get(topic_id).map(|(_rev, state)| state.to_owned()),
                )
            })
            .collect();
        match evolver.evolve(&action, reads) {
            evolver::Response::NeedMore { topics } => needs = topics,
            evolver::Response::Commit { response, updates } => {
                return Ok((
                    response,
                    updates
                        .into_iter()
                        .map(|(topic_id, new_state)| {
                            let new_rev = match outs.get(&topic_id) {
                                Some((old_rev, _old_state)) => TopicRev(old_rev.0 + 1),
                                None => TopicRev(1),
                            };
                            (topic_id, (new_rev, new_state))
                        })
                        .collect(),
                ))
            }
        }
    }
}

// fn state(
//     &self,
//     implementation: Implementation,
//     topic: TopicId,
//     slice: Slice,
// ) -> Option<(TopicRev, State)> {
//     todo!()
// }
// fn state_at_action(
//     &self,
//     implementation: Implementation,
//     topic: TopicId,
//     slice: Slice,
// ) -> Option<(TopicRev, State)> {
//     todo!()
// }

struct TestEvolver {}
impl evolver::Evolver for TestEvolver {
    type Action = Action;
    type Response = Response;

    type Id = TopicId;
    type State = State;

    fn evolve(
        &self,
        action: &Action,
        reads: BTreeMap<TopicId, Option<State>>,
    ) -> evolver::Response<Response, TopicId, State> {
        match action {
            Action::CreateGame {
                game_id,
                short_code,
            } => {
                let game_topic_id = TopicId::Game(game_id.to_owned());
                let sc_topic_id = TopicId::ShortCode(short_code.to_owned());
                let game_state = match reads.get(&game_topic_id) {
                    Some(state) => state
                        .as_ref()
                        .map(|s| s.game().unwrap().to_owned())
                        .unwrap_or_default(),
                    None => {
                        return evolver::Response::NeedMore {
                            topics: btreeset! {game_topic_id, sc_topic_id},
                        }
                    }
                };
                let sc_state = match reads.get(&sc_topic_id) {
                    Some(state) => state
                        .as_ref()
                        .map(|s| s.sc().unwrap().to_owned())
                        .unwrap_or_default(),
                    None => {
                        return evolver::Response::NeedMore {
                            topics: btreeset! {game_topic_id, sc_topic_id},
                        }
                    }
                };

                match game_state {
                    Game::None => {}
                    _ => {
                        return evolver::Response::Commit {
                            response: Response::GameAlreadyExists {
                                game_id: game_id.to_owned(),
                            },
                            updates: btreemap! {},
                        }
                    }
                }

                if let ShortCode::ForGame(_) = sc_state {
                    return evolver::Response::Commit {
                        response: Response::ShortCodeInUse {
                            short_code: short_code.to_owned(),
                        },
                        updates: btreemap! {},
                    };
                }

                evolver::Response::Commit {
                    response: Response::Ok,
                    updates: btreemap! {
                        game_topic_id => State::Game(Game::Created{short_code: short_code.to_owned()}),
                        sc_topic_id => State::ShortCode(ShortCode::ForGame(game_id.to_owned())),
                    },
                }
            }
            Action::DeleteGame { game_id } => {
                let game_topic_id = TopicId::Game(game_id.to_owned());
                let game_state = match reads.get(&game_topic_id) {
                    Some(state) => state
                        .as_ref()
                        .map(|s| s.game().unwrap().to_owned())
                        .unwrap_or_default(),
                    None => {
                        return evolver::Response::NeedMore {
                            topics: btreeset! {game_topic_id},
                        }
                    }
                };

                let short_code = match game_state {
                    Game::None => {
                        return evolver::Response::Commit {
                            response: Response::GameNotFound {
                                game_id: game_id.to_owned(),
                            },
                            updates: btreemap! {},
                        }
                    }

                    Game::Created { short_code } => short_code,
                };
                let sc_topic_id = TopicId::ShortCode(short_code);

                evolver::Response::Commit {
                    response: Response::Ok,
                    updates: btreemap! {
                        game_topic_id => State::Game(Game::None),
                        sc_topic_id => State::ShortCode(ShortCode::None),
                    },
                }
            }
        }
    }
}
// }

#[cfg(test)]
mod test {
    use super::*;

    #[test]
    fn test_it() {
        assert_eq!(1, 1);
    }
}

#[derive(Debug, Hash, Clone, Eq, PartialEq, Ord, PartialOrd)]
struct GameId(String);

#[derive(Debug, Hash, Clone, Eq, PartialEq, Ord, PartialOrd)]
struct ShortCodeId(String);

#[derive(Debug, Hash, Clone, Eq, PartialEq, Ord, PartialOrd)]
enum TopicId {
    Game(GameId),
    ShortCode(ShortCodeId),
}

#[derive(Debug, Clone)]
enum Action {
    CreateGame {
        game_id: GameId,
        short_code: ShortCodeId,
    },
    DeleteGame {
        game_id: GameId,
    },
}

#[derive(Debug, Clone)]
enum State {
    Game(Game),
    ShortCode(ShortCode),
}

impl State {
    fn game(&self) -> Option<&Game> {
        match self {
            State::Game(g) => Some(g),
            _ => None,
        }
    }

    fn sc(&self) -> Option<&ShortCode> {
        match self {
            State::ShortCode(sc) => Some(sc),
            _ => None,
        }
    }
}

#[derive(Debug, Clone)]
enum Game {
    None,
    Created { short_code: ShortCodeId },
}

impl Default for Game {
    fn default() -> Self {
        Game::None
    }
}

#[derive(Debug, Clone)]
enum ShortCode {
    None,
    ForGame(GameId),
}

impl Default for ShortCode {
    fn default() -> Self {
        ShortCode::None
    }
}

#[derive(Debug, Clone)]
enum Response {
    Ok,
    GameNotFound { game_id: GameId },
    GameAlreadyExists { game_id: GameId },
    ShortCodeInUse { short_code: ShortCodeId },
}

fn main() {
    println!(
        "{:#?}",
        outputs(&TestCommitGraph {}, &TestEvolver{}, &ChangeId(3))
    );
}
