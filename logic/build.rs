fn main() -> Result<(), Box<dyn std::error::Error>> {
    prost_build::compile_protos(
        &["../proto/dolt.proto", "../proto/pictophone/versioned.proto"],
        &["../proto/"],
    )?;

    Ok(())
}
