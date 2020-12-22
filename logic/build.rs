fn main() -> Result<(), Box<dyn std::error::Error>> {
    prost_build::compile_protos(
        &[
            "../proto/pictophone/logic.proto",
            "../proto/pictophone/v1_0.proto",
            "../proto/pictophone/v1_1.proto",
        ],
        &["../proto/"],
    )?;

    Ok(())
}
