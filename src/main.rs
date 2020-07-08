use tonic::{transport::Server, Request, Response, Status};
use firestore::*;

use hello_world::greeter_server::{Greeter, GreeterServer};
use hello_world::{HelloReply, HelloRequest};
use tokio::sync::mpsc;
//use futures_core::Stream;
pub mod hello_world {
    tonic::include_proto!("helloworld");
}

#[derive(Debug, Default)]
pub struct MyGreeter {}

#[tonic::async_trait]
impl Greeter for MyGreeter {
    type SayHelloStream = mpsc::Receiver<Result<hello_world::HelloReply, Status>>;

    async fn say_hello(
        &self,
        request: Request<HelloRequest>,
    ) -> Result<Response<Self::SayHelloStream>, Status> {
        println!("Got a request: {:?}", request);

        let (mut tx, rx) = mpsc::channel(4);

        tokio::spawn(async move {
            for _ in 0..2 {
                let reply = hello_world::HelloReply {
                    message: format!("Hello {}!", request.get_ref().name).into(),
                };
                tx.send(Ok(reply.clone())).await.unwrap();
            }
        });

        Ok(Response::new(rx))
    }
}

#[tokio::main]
async fn main() -> Result<(), Box<dyn std::error::Error>> {
    let addr = "0.0.0.0:8080".parse()?;
    let greeter = MyGreeter::default();

    Server::builder()
        .add_service(GreeterServer::new(greeter))
        .serve(addr)
        .await?;

    Ok(())
}


async fn create_document() -> Result<Document, BoxError> {
    let (mut client, project_id) = try_join!(
        get_client(),
        get_project_id(),
    )?;
    let parent = format!("projects/{}/databases/(default)/documents", project_id);
    let collection_id = "greetings".into();
    let document_id = "".into();
    let mut fields = std::collections::HashMap::new();
    fields.insert(
        "message".into(),
        Value {
            value_type: Some(value::ValueType::StringValue(
                "Hello world from CloudRun!".into(),
            )),
        },
    );
    let document = Some(Document {
        name: "".into(),
        fields,
        create_time: None,
        update_time: None,
    });
    let res = client
        .create_document(CreateDocumentRequest {
            parent,
            collection_id,
            document_id,
            document,
            mask: None,
        })
        .await?;
    Ok(res.into_inner())
}
