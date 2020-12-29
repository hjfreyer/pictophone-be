use serde::Deserialize;

#[derive(Debug, Deserialize)]
pub struct Config {
    pub port: String,
    pub wasm_path: String,
}

impl Config {
    pub fn new() -> anyhow::Result<Self> {
        let mut res = config::Config::new();
        res.set_default("port", "8080")?
            .set_default("wasm_path", "binaries")?
            .merge(config::Environment::with_prefix("server"))?;

        Ok(res.try_into()?)
    }
}
