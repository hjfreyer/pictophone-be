use proc_macro2::TokenStream;
use quote::quote;

// struct Descriptor {

// }

// struct InnerGen {}

// struct Gen {
//     // clients: TokenStream,
//     inner: InnerGen,
//     servers: TokenStream,
// }
// impl InnerGen {
//     fn generate_server(&self, service: &prost_build::Service) -> TokenStream {
//         // if service.name != "logic"
//         // for method in &service.methods {

//         // }
//         quote! {
//             pub mod dolt_server{
//                 #[tokio::async_trait]
//                 pub trait DoltServer {
//                     trait R
//                     async fn handle(&self, Request);
//                 }
//             }
//         }
//         // TokenStream::default()
//     }

//     fn finalize_servers(&self) -> TokenStream {
//         TokenStream::default()
//     }
// }

// impl prost_build::ServiceGenerator for Gen {
//     // fn generate(&mut self, service: prost_build::Service, buf: &mut String) {
//     //     eprintln!("XXXXXXXXXXXXXXXXXXX: {:?}", service);
//     //     buf.push_str( "YOOOO")
//     // }

//     fn generate(&mut self, service: prost_build::Service, _buf: &mut String) {
//         // if self.builder.build_server {
//         let server = tonic_build::server::generate(&service, "super"); //;&self.builder.proto_path);
//         self.servers.extend(server);
//         self.servers.extend(self.inner.generate_server(&service));
//         // }

//         // if self.builder.build_client {
//         //     let client = client::generate(&service, &self.builder.proto_path);
//         //     self.clients.extend(client);
//         // }
//     }

//     fn finalize(&mut self, buf: &mut String) {
//         // if self.builder.build_client && !self.clients.is_empty() {
//         //     let clients = &self.clients;

//         //     let client_service = quote::quote! {
//         //         #clients
//         //     };

//         //     let code = format!("{}", client_service);
//         //     buf.push_str(&code);

//         //     self.clients = TokenStream::default();
//         // }

//         if !self.servers.is_empty() {
//             let servers = &mut self.servers;
//             servers.extend(self.inner.finalize_servers());

//             let server_service = quote::quote! {
//                 #servers
//             };

//             let code = format!("{}", server_service);
//             buf.push_str(&code);

//             self.servers = TokenStream::default();
//         }
//     }
// }

// pub fn compile<P>(protos: &[P], includes: &[P]) -> io::Result<()>
// where
//     P: AsRef<Path>,
// {
//     prost_build::Config::new()
//         .service_generator(Box::new(Gen {
//             inner: InnerGen {},
//             servers: TokenStream::default(),
//         }))
//         .compile_protos(protos, includes)
// }

struct Version {
    module_name: &'static str,
    enum_name: &'static str,
}

fn generate() -> TokenStream {
    const VERSIONS: [Version; 2] = [
        Version {
            module_name: "v1_0",
            enum_name: "V1p0",
        },
        Version {
            module_name: "v1_1",
            enum_name: "V1p1",
        },
    ];

    quote! {
        pub trait DoltServer {
            fn handle(&self, )
        }
    }
}

fn main() {
    println!("{}", generate())
}

#[cfg(test)]
mod tests {
    #[test]
    fn it_works() {
        assert_eq!(2 + 2, 4);
    }
}
