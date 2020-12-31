use serde::Deserialize;

#[derive(Debug, Deserialize)]
pub struct Config {
    pub port: String,
    pub wasm_path: String,
    pub auth_key: String,
}

impl Config {
    pub fn new() -> anyhow::Result<Self> {
        let mut res = config::Config::new();
        res.merge(config::File::with_name("local/config.toml").required(false))?
            .merge(config::Environment::with_prefix("server"))?;

        Ok(res.try_into()?)
    }
}
