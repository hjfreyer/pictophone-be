use tempfile::NamedTempFile;

use anyhow::anyhow;
use std::process::Command;
use std::{
    io::{self, Write},
    process::Stdio,
};
const V1_0_0: &'static [u8] = include_bytes!("binaries/v1.0.0.wasm");

#[derive(Debug, Copy, Clone)]
pub enum ApiVersion {
    V1_0,
}

#[derive(Debug, Copy, Clone)]
pub enum LogicVersion {
    V1_0_0,
}

impl LogicVersion {
    pub fn implemented_apis(self) -> Vec<ApiVersion> {
        match self {
            LogicVersion::V1_0_0 => return vec![ApiVersion::V1_0],
        }
    }

    fn binary(self) -> Result<NamedTempFile, anyhow::Error> {
        let mut file = NamedTempFile::new()?;

        match self {
            LogicVersion::V1_0_0 => file.write_all(V1_0_0)?,
        };

        Ok(file)
    }

    pub fn run(self, input: &str) -> Result<String, anyhow::Error> {
        let f = self.binary()?;

        println!("Request: {}", input);

        let out = Command::new("wavm")
            .args(&[
                "run",
                f.path().to_str().ok_or(anyhow!("invalid path name"))?,
                input,
            ])
            .stderr(Stdio::inherit())
            .output()?;

        Ok(std::str::from_utf8(&out.stdout)?.to_owned())
    }
}
