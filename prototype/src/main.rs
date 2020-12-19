use {
    anyhow::bail,
    protobuf::pictophone::logic as ptl,
    protobuf::pictophone::v1_0 as pt,
    tokio::sync::Mutex,
    tonic::transport::Server as TServer,
    tonic::{Request, Response, Status},
};

mod protobuf;
mod runner;

struct InnerServer {
    runner: runner::Runner,
    actions: Vec<ptl::VersionedAction>,
}

impl InnerServer {
    fn handle_action(
        &mut self,
        action: ptl::VersionedAction,
    ) -> Result<ptl::VersionedResponse, anyhow::Error> {
        let mut state = vec![];
        for action in &self.actions {
            let req = ptl::Request {
                method: Some(ptl::request::Method::Evolve(ptl::EvolveRequest {
                    state: state.to_owned(),
                    action: Some(action.to_owned()),
                })),
            };

            let res = self.runner.run(runner::LogicVersion::V1_0_0, req)?;
            let res = match res.method {
                Some(ptl::response::Method::Evolve(res)) => res,
                _ => bail!("malformed response to evolve request"),
            };
            if 0 < res.state.len() {
                state = res.state;
            }
        }

        println!("ACTION: {:?}", action);

        if 0 < state.len() {
            let state: serde_json::Value = serde_json::from_slice(&state)?;
            println!("PRE-STATE: {:?}", state);
        } else {
            println!("PRE-STATE: None");
        }
        let res = self.runner.run(
            runner::LogicVersion::V1_0_0,
            ptl::Request {
                method: Some(ptl::request::Method::Evolve(ptl::EvolveRequest {
                    state: state.to_owned(),
                    action: Some(action.to_owned()),
                })),
            },
        )?;
        let res = match res.method {
            Some(ptl::response::Method::Evolve(res)) => res,
            _ => bail!("malformed response to evolve request"),
        };

        if 0 < res.state.len() {
            let state: serde_json::Value = serde_json::from_slice(&res.state)?;
            println!("POST-STATE: {:?}", state);
        }

        self.actions.push(action);
        Ok(res.response.unwrap())
    }
}

struct Server {
    inner: Mutex<InnerServer>,
}

#[tonic::async_trait]
impl pt::pictophone_server::Pictophone for Server {
    async fn create_game(
        &self,
        request: Request<pt::CreateGameRequest>,
    ) -> Result<Response<pt::CreateGameResponse>, Status> {
        use std::convert::TryFrom;
        self.inner
            .lock()
            .await
            .handle_action(ptl::VersionedAction::from(pt::Action::from(
                request.into_inner(),
            )))
            .and_then(|r| Ok(pt::Response::try_from(r)?))
            .and_then(|r| Ok(pt::CreateGameResponse::try_from(r)?))
            .map(Response::new)
            .map_err(|_| Status::internal("wtf"))
    }

    async fn delete_game(
        &self,
        request: Request<pt::DeleteGameRequest>,
    ) -> Result<Response<pt::DeleteGameResponse>, Status> {
        use std::convert::TryFrom;
        let action = ptl::VersionedAction::from(pt::Action::from(request.into_inner()));
        self.inner
            .lock()
            .await
            .handle_action(action)
            .and_then(|r| Ok(pt::Response::try_from(r)?))
            .and_then(|r| Ok(pt::DeleteGameResponse::try_from(r)?))
            .map(Response::new)
            .map_err(|_| Status::internal("wtf"))
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

#[tokio::main]
async fn main() -> Result<(), anyhow::Error> {
    let addr = "0.0.0.0:8080".parse()?;
    let server = Server {
        inner: Mutex::new(InnerServer {
            runner: runner::Runner::new(&std::path::PathBuf::from("prototype/src/binaries"))?,
            actions: vec![],
        }),
    };

    println!("Boom, running on: {}", addr);

    TServer::builder()
        .add_service(pt::pictophone_server::PictophoneServer::new(server))
        .serve(addr)
        .await?;

    Ok(())
}
