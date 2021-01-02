use serde::Deserialize;

#[derive(Debug, Deserialize)]
pub enum CredentialSource {
    InstanceMetadata,
    Literal { auth_key: String },
}

#[derive(Debug, Deserialize)]
pub struct Config {
    pub port: String,
    pub wasm_path: String,
    pub credential_source: CredentialSource,
}

impl Config {
    pub fn new() -> anyhow::Result<Self> {
        let mut res = config::Config::new();
        res.merge(config::File::with_name("/data/config.toml").required(false))?
            .merge(config::File::with_name("config/server/local.toml").required(false))?
            .merge(config::Environment::with_prefix("server"))?;

        Ok(res.try_into()?)
    }
}
