fn main() -> Result<(), Box<dyn std::error::Error>> {
    tonic_build::configure().compile(
        &[
            "../proto/pictophone/v1_0.proto",
            "../proto/pictophone/logic.proto",
        ],
        &["../proto"],
    )?;

    Ok(())
}
