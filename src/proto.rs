pub mod hello_world {
    tonic::include_proto!("helloworld");
}

pub mod pictophone {
    tonic::include_proto!("pictophone");
}

pub mod google {
    pub mod firestore {
        pub mod v1 {
            tonic::include_proto!("google.firestore.v1");
        }
    }
    pub mod rpc {
        tonic::include_proto!("google.rpc");
    }
    pub mod r#type {
        tonic::include_proto!("google.r#type");
    }
}
