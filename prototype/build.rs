fn main() -> Result<(), Box<dyn std::error::Error>> {
    tonic_build::compile_protos("proto/helloworld.proto")?;
    tonic_build::compile_protos("proto/pictophone.proto")?;
    tonic_build::configure()
        .build_server(false)
        .compile(&["proto/google/firestore/v1/firestore.proto"], &["proto"])?;

    Ok(())
}
