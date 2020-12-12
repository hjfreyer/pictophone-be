pub mod hello_world {
    tonic::include_proto!("helloworld");
}

pub mod pictophone {
    pub mod v1_0 {
        tonic::include_proto!("pictophone.v1_0");
    }
    pub mod v1_1 {
        tonic::include_proto!("pictophone.v1_1");
    }
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
