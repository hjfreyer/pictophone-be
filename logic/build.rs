fn main() -> Result<(), Box<dyn std::error::Error>> {
    prost_build::compile_protos(
        &[
            "../proto/pictophone/dolt.proto",
            "../proto/pictophone/versioned.proto",
        ],
        &["../proto/"],
    )?;

    Ok(())
}
