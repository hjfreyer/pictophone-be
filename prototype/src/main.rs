use std::collections::{BTreeMap, BTreeSet};

use maplit::{btreemap, btreeset};

mod lib {
    use std::collections::{BTreeMap, BTreeSet};

    use maplit::{btreemap, btreeset};

    pub trait CommitGraph {
        type CommitId;
        type Action;

        fn action(&self, commit_id: &Self::CommitId) -> Option<Self::Action>;

        fn predecessors(&self, commit_id: &Self::CommitId) -> Vec<Self::CommitId>;

        fn all_commits(&self) -> Vec<Self::CommitId>;
    }

    pub mod evolver {
        use std::collections::{BTreeMap, BTreeSet};

        pub trait Evolver {
            type Action;
            type Response;

            type TopicId;
            type State;

            fn evolve(
                &self,
                action: &Self::Action,
                reads: BTreeMap<Self::TopicId, Option<Self::State>>,
            ) -> Response<Self::Response, Self::TopicId, Self::State>;
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
    pub struct TopicRev(usize);

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
    pub enum OutputsError {
        CommitIdNotFound,
    }

    pub fn outputs<Action, CommitId, StateId, State, Response>(
        graph: &impl CommitGraph<Action = Action, CommitId = CommitId>,
        evolver: &impl evolver::Evolver<
            Action = Action,
            TopicId = StateId,
            State = State,
            Response = Response,
        >,
        commit_id: &CommitId,
    ) -> Result<(Response, BTreeMap<StateId, (TopicRev, State)>), OutputsError>
    where
        StateId: Ord + Clone,
        State: Clone,
    {
        let action = if let Some(action) = graph.action(commit_id) {
            action
        } else {
            return Err(OutputsError::CommitIdNotFound);
        };
        let preds = graph.predecessors(commit_id);
        let outs: Result<Vec<(Response, BTreeMap<StateId, (TopicRev, State)>)>, OutputsError> =
            preds
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
                                    None => TopicRev(0),
                                };
                                (topic_id, (new_rev, new_state))
                            })
                            .collect(),
                    ))
                }
            }
        }
    }

    #[derive(Debug)]
    pub struct Indexer<CommitId: Ord, TopicId: Ord> {
        indexed: BTreeSet<CommitId>,
        topics: BTreeMap<TopicId, Vec<CommitId>>,
    }

    impl<CommitId: Ord, TopicId: Ord> Indexer<CommitId, TopicId> {
        pub fn new() -> Indexer<CommitId, TopicId> {
            Indexer {
                indexed: Default::default(),
                topics: Default::default(),
            }
        }

        pub fn index_action<Action, G, E>(
            &mut self,
            graph: &G,
            evolver: &E,
            commit_id: &G::CommitId,
        ) -> Result<(), OutputsError>
        where
            G: CommitGraph<CommitId = CommitId, Action = Action>,
            E: evolver::Evolver<Action = Action, TopicId = TopicId>,
            CommitId: Ord + Clone,
            TopicId: Ord + Clone + std::fmt::Debug,
            E::State: Clone,
        {
            if self.indexed.contains(commit_id) {
                return Ok(());
            }
            for pred in graph.predecessors(commit_id) {
                self.index_action(graph, evolver, &pred).unwrap();
            }

            let (_resp, outs) = outputs(graph, evolver, commit_id)?;
            for (topic_id, (rev, _state)) in outs {
                if let Some(commit_ids) = self.topics.get_mut(&topic_id) {
                    if commit_ids.len() != rev.0 {
                        panic!(
                            "inconsistent height: topic_id = {:?}, commit_ids.len() = {}; rev = {}",
                            topic_id,
                            commit_ids.len(),
                            rev.0
                        );
                    }
                    commit_ids.push(commit_id.to_owned());
                } else {
                    if rev.0 != 0 {
                        panic!("inconsistent height: commit_ids empty; rev = {}", rev.0);
                    }

                    self.topics.insert(topic_id, vec![commit_id.to_owned()]);
                }
            }
            self.indexed.insert(commit_id.to_owned());
            Ok(())
        }
    }
}

#[derive(Debug, Hash, Clone, Copy, Eq, PartialEq, Ord, PartialOrd)]
struct CommitId(usize);

use lib::{evolver, CommitGraph};

struct TestCommitGraph {
    actions: Vec<WrappedAction>,
}

struct WrappedAction {
    action: Action,
    pending: bool,
    predecessors: Vec<CommitId>,
}

impl TestCommitGraph {
    pub fn propose(&mut self, action: Action) -> CommitId {
        let commit_id = CommitId(self.actions.len());
        self.actions.push(WrappedAction {
            action,
            pending: true,
            predecessors: vec![],
        });
        commit_id
    }

    pub fn add_predecessor(&mut self, before_id: &CommitId, after_id: &CommitId) {
        let before = self.actions.get(before_id.0).unwrap();
        if before.pending {
            panic!("before is still pending")
        }

        let after = self.actions.get_mut(after_id.0).unwrap();
        if !after.pending {
            panic!("tooo lateeee")
        }
        after.predecessors.push(before_id.to_owned());
    }

    pub fn commit(&mut self, commit_id: &CommitId) {
        let c = self.actions.get_mut(commit_id.0).unwrap();
        c.pending = false;
    }
}

impl CommitGraph for TestCommitGraph {
    type CommitId = CommitId;

    type Action = Action;

    fn action(&self, commit_id: &Self::CommitId) -> Option<Self::Action> {
        self.actions.get(commit_id.0).map(|wa| wa.action.to_owned())
    }

    fn predecessors(&self, commit_id: &Self::CommitId) -> Vec<Self::CommitId> {
        let wa = self.actions.get(commit_id.0).unwrap();
        if wa.pending {
            panic!("no peeking")
        }
        wa.predecessors.to_owned()
    }

    fn all_commits(&self) -> Vec<Self::CommitId> {
        self.actions
            .iter()
            .enumerate()
            .filter_map(|(idx, wa)| {
                if wa.pending {
                    None
                } else {
                    Some(CommitId(idx))
                }
            })
            .collect()
    }
}

struct TestEvolver {}
impl evolver::Evolver for TestEvolver {
    type Action = Action;
    type Response = Response;

    type TopicId = TopicId;
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
    let mut graph = TestCommitGraph { actions: vec![] };
    let evolver = TestEvolver {};

    let game_a = || GameId("a".to_owned());
    let game_b = || GameId("b".to_owned());
    let sc_a = || ShortCodeId("A".to_owned());

    let a0 = graph.propose(Action::CreateGame {
        game_id: game_a(),
        short_code: sc_a(),
    });
    graph.commit(&a0);

    let a1 = graph.propose(Action::CreateGame {
        game_id: game_b(),
        short_code: sc_a(),
    });
    graph.add_predecessor(&a0, &a1);
    graph.commit(&a1);

    let a2 = graph.propose(Action::DeleteGame { game_id: game_a() });
    graph.add_predecessor(&a0, &a2);
    graph.commit(&a2);

    let a3 = graph.propose(Action::CreateGame {
        game_id: game_b(),
        short_code: sc_a(),
    });
    graph.add_predecessor(&a2, &a3);
    graph.commit(&a3);

    println!("{:#?}", lib::outputs(&graph, &evolver, &CommitId(3)));
    let mut indexer = lib::Indexer::new();

    for commit_id in graph.all_commits() {
        indexer.index_action(&graph, &evolver, &commit_id).unwrap();
        println!("{:?}", indexer);
    }
}
