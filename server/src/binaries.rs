use std::{fs, path::PathBuf};

use log::info;

#[derive(Debug, Clone, PartialEq, Eq, Hash)]
pub struct Version {
    semver: String,
}

impl Version {
    pub fn new(semver: String) -> Self {
        Version { semver }
    }
}

#[tonic::async_trait]
pub trait Provider {
    async fn default(&self) -> anyhow::Result<Version>;

    async fn load(&self, version: &Version) -> anyhow::Result<Option<Vec<u8>>>;
}

pub struct Filesystem {
    default: Version,
    bin_path: PathBuf,
}

impl Filesystem {
    pub fn new(default: Version, bin_path: PathBuf) -> Self {
        Self { default, bin_path }
    }
}

#[tonic::async_trait]
impl Provider for Filesystem {
    async fn default(&self) -> anyhow::Result<Version> {
        Ok(self.default.to_owned())
    }

    async fn load(&self, version: &Version) -> anyhow::Result<Option<Vec<u8>>> {
        let bin = fs::read(self.bin_path.join(format!("v{}.wasm", version.semver)));
        match bin {
            Ok(bin) => Ok(Some(bin)),
            Err(e) if e.kind() == std::io::ErrorKind::NotFound => Ok(None),
            Err(e) => Err(e.into()),
        }
    }
}
