use std::collections::HashMap;

use crate::binaries;
use anyhow::anyhow;
use log::trace;

use {
    crate::proto::dolt::{Request, Response},
    log::info,
    std::{
        fs,
        sync::{Arc, RwLock},
    },
    wasi_common::virtfs::pipe::{ReadPipe, WritePipe},
    wasmtime::{Engine, Linker, Module, Store},
    wasmtime_wasi::{Wasi, WasiCtxBuilder},
};

pub struct Runner<P> {
    provider: P,
    engine: Engine,
    modules: RwLock<HashMap<binaries::Version, Module>>,
}

impl<P: binaries::Provider + Send + Sync> Runner<P> {
    pub fn new(provider: P) -> Result<Self, anyhow::Error> {
        Ok(Runner {
            provider,
            engine: Engine::default(),
            modules: RwLock::new(HashMap::<binaries::Version, Module>::new()),
        })
    }

    pub async fn run(
        &self,
        version: &Option<binaries::Version>,
        request: Request,
    ) -> Result<Response, anyhow::Error> {
        let version = if let Some(version) = version {
            version.to_owned()
        } else {
            self.provider.default().await?
        };

        trace!(target: "runner", "Running version: {:?}", version);
        let buf = Arc::new(RwLock::new(Vec::new()));

        let mut req_buf = vec![];

        use prost::Message;
        request.encode(&mut req_buf)?;

        {
            let module = self.load_module(&version).await?;

            let stdin = ReadPipe::from(req_buf);
            let stdout = WritePipe::from_shared(buf.clone());
            let store = Store::new(&self.engine);
            let mut linker = Linker::new(&store);

            let ctx = WasiCtxBuilder::new()
                .stdin(stdin)
                .stdout(stdout)
                .inherit_stderr()
                .build()?;

            let wasi = Wasi::new(&store, ctx);
            wasi.add_to_linker(&mut linker)?;

            linker.module("", &module)?;
            linker.get_default("")?.get0::<()>()?()?;
        }
        let lck = buf.read().unwrap();
        let resp = Response::decode(&**lck)?;
        Ok(resp)
    }

    async fn load_module(&self, version: &binaries::Version) -> anyhow::Result<Module> {
        if let Some(module) = self.modules.read().unwrap().get(version) {
            return Ok(module.to_owned());
        }
        info!(target: "runner", "loading module {:?}", version);
        let bin = self
            .provider
            .load(version)
            .await?
            .ok_or_else(|| anyhow!("version not found: {:?}", version))?;
        let mut lock = self.modules.write().unwrap();
        let module = Module::from_binary(&self.engine, &bin)?;
        lock.insert(version.to_owned(), module.to_owned());
        Ok(module)
    }
}
