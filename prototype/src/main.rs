use anyhow::bail;

use {
    api::{
        v1_0::{self, Action, GameId, ShortCodeId},
        EvolveRequest, LogicRequest, LogicResponse, VersionedAction, VersionedResponse,
    },
    maplit::btreemap,
    std::collections::{BTreeMap, BTreeSet},
    tokio::sync::mpsc,
    tokio::sync::Mutex,
    tonic::transport::Server as TServer,
    tonic::{Request, Response, Status},
};

mod protobuf;
mod runner;
use {
    protobuf::pictophone::v1_0 as pt,
    protobuf::pictophone::v1_0::pictophone_server::{Pictophone, PictophoneServer},
};

struct InnerServer {
    runner: runner::Runner,
    actions: Vec<VersionedAction>,
    // primary_version: runner::LogicVersion,
    // states: BTreeMap<runner::LogicVersion, Vec<Vec<u8>>>,
}

impl InnerServer {
    fn handle_action(
        &mut self,
        action: VersionedAction,
    ) -> Result<VersionedResponse, anyhow::Error> {
        let mut state = None;
        for action in &self.actions {
            let req = LogicRequest::Evolve(EvolveRequest {
                state: state.to_owned(),
                action: action.to_owned(),
            });

            let res = self.runner.run(runner::LogicVersion::V1_0_0, req)?;
            let res = match res {
                LogicResponse::Evolve(res) => res,
                _ => bail!("malformed response to evolve request"),
            };
            if let Some(s) = res.state {
                state = Some(s);
            }
        }

        println!("ACTION: {:?}", action);

        if let Some(state) = &state {
            let state: serde_json::Value = serde_json::from_slice(state)?;
            println!("PRE-STATE: {:?}", state);
        } else {
            println!("PRE-STATE: None");
        }
        let res = self.runner.run(
            runner::LogicVersion::V1_0_0,
            LogicRequest::Evolve(EvolveRequest {
                state,
                action: action.to_owned(),
            }),
        )?;
        let res = match res {
            LogicResponse::Evolve(res) => res,
            _ => bail!("malformed response to evolve request"),
        };

        if let Some(state) = res.state {
            let state: serde_json::Value = serde_json::from_slice(&state)?;
            println!("STATE: {:?}", state);
        }

        self.actions.push(action);
        Ok(res.response)
    }
}

struct Server {
    inner: Mutex<InnerServer>,
}

fn into_status(resp: VersionedResponse) -> Result<(), Status> {
    let resp = match resp {
        VersionedResponse::V1_0(r) => r,
        VersionedResponse::V1_1(r) => r,
    };
    match resp {
        v1_0::Response::Ok => Ok(()),
        v1_0::Response::GameNotFound { .. } => Err(Status::not_found("game not found")),
        v1_0::Response::GameAlreadyExists { .. } => {
            Err(Status::already_exists("game already exists"))
        }
        v1_0::Response::ShortCodeInUse { .. } => Err(Status::already_exists("short code in use")),
    }
}

#[tonic::async_trait]
impl Pictophone for Server {
    async fn create_game(
        &self,
        request: Request<pt::CreateGameRequest>,
    ) -> Result<Response<pt::Empty>, Status> {
        let request = request.into_inner();
        let mut inner = self.inner.lock().await;
        let res = inner
            .handle_action(VersionedAction::V1_0(Action::CreateGame {
                game_id: GameId(request.game_id),
                short_code: ShortCodeId(request.short_code),
            }))
            .map_err(|e| {
                println!("Err: {:?}", e);
                Status::internal("wtf")
            })?;
        into_status(res)?;
        Ok(Response::new(pt::Empty {}))
    }

    async fn delete_game(
        &self,
        request: Request<pt::DeleteGameRequest>,
    ) -> Result<Response<pt::Empty>, Status> {
        let request = request.into_inner();
        let mut inner = self.inner.lock().await;
        let res = inner
            .handle_action(VersionedAction::V1_0(Action::DeleteGame {
                game_id: GameId(request.game_id),
            }))
            .map_err(|e| {
                println!("Err: {:?}", e);
                Status::internal("wtf")
            })?;
        into_status(res)?;
        Ok(Response::new(pt::Empty {}))
    }

    // async fn join_game(
    //     &self,
    //     request: Request<pt::JoinGameRequest>,
    // ) -> Result<Response<pt::Empty>, Status> {
    //     unimplemented!()

    // }

    // async fn start_game(
    //     &self,
    //     request: Request<pt::StartGameRequest>,
    // ) -> Result<Response<pt::Empty>, Status> {
    //     unimplemented!()
    // }
    // async fn make_move(
    //     &self,
    //     request: Request<pt::MakeMoveRequest>,
    // ) -> Result<Response<pt::Empty>, Status> {
    //     unimplemented!()
    // }

    // type GetGameStream = mpsc::Receiver<Result<pt::GetGameResponse, Status>>;

    // async fn get_game(
    //     &self,
    //     request: Request<pt::GetGameRequest>,
    // ) -> Result<Response<Self::GetGameStream>, Status> {
    //     unimplemented!()
    // }
}

#[cfg(test)]
mod test {
    use super::*;

    #[test]
    fn test_it() {
        assert_eq!(1, 1);
    }
}

#[tokio::main]
async fn main() -> Result<(), anyhow::Error> {
    let addr = "0.0.0.0:8080".parse()?;
    let server = Server {
        inner: Mutex::new(InnerServer {
            runner: runner::Runner::new(&std::path::PathBuf::from("prototype/src/binaries"))?,
            actions: vec![],
            // primary_version: runner::LogicVersion::V1_0_0,
            // states: btreemap! {
            //     runner::LogicVersion::V1_0_0 => vec![],
            // },
        }),
    };

    println!("Boom, running on: {}", addr);

    TServer::builder()
        .add_service(PictophoneServer::new(server))
        .serve(addr)
        .await?;

    Ok(())
}
