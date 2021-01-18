fn main() -> Result<(), Box<dyn std::error::Error>> {
    tonic_build::configure()
        .build_client(false)
        .format(false)
        .compile(
            &["../proto/pictophone/versioned.proto", "../proto/dolt.proto"],
            &["../proto"],
        )?;
    Ok(())
}
