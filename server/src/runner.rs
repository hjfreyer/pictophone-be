use std::collections::HashMap;

use log::trace;

use {
    crate::protobuf::pictophone::logic::{Request, Response},
    log::info,
    std::{
        fs,
        sync::{Arc, RwLock},
    },
    wasi_common::virtfs::pipe::{ReadPipe, WritePipe},
    wasmtime::{Engine, Linker, Module, Store},
    wasmtime_wasi::{Wasi, WasiCtxBuilder},
};

#[derive(Debug, Clone, PartialEq, Eq, Hash)]
pub struct BinaryVersion {
    semver: String,
}

impl BinaryVersion {
    pub fn from_semver(semver: &str) -> Option<BinaryVersion> {
        macro_rules! declare_semver {
            ($($semver:literal, )*) => {
                match semver {
                    $(
                        $semver => Some(BinaryVersion{semver: $semver.to_owned()}),
                    )*
                    _ => None,
                }
            };
        }

        declare_semver!("1.0.0", "1.1.0",)
    }

    fn filename(&self) -> String {
        format!("v{}.wasm", self.semver)
    }
}

impl Default for BinaryVersion {
    fn default() -> Self {
        BinaryVersion::from_semver("1.1.0").unwrap()
    }
}

pub struct Runner {
    bin_path: std::path::PathBuf,
    engine: Engine,
    modules: RwLock<HashMap<BinaryVersion, Module>>,
}

impl Runner {
    pub fn new(bin_path: &std::path::Path) -> Result<Self, anyhow::Error> {
        Ok(Runner {
            bin_path: bin_path.to_owned(),
            engine: Engine::default(),
            modules: RwLock::new(HashMap::<BinaryVersion, Module>::new()),
        })
    }

    pub fn run(
        &self,
        version: &BinaryVersion,
        request: Request,
    ) -> Result<Response, anyhow::Error> {
        trace!(target: "runner", "Running version: {:?}", version);
        let buf = Arc::new(RwLock::new(Vec::new()));

        let mut req_buf = vec![];

        use prost::Message;
        request.encode(&mut req_buf)?;

        {
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

            let module = self.load_module(version)?;

            linker.module("", &module)?;
            linker.get_default("")?.get0::<()>()?()?;
        }
        let lck = buf.read().unwrap();
        let resp = Response::decode(&**lck)?;
        Ok(resp)
    }

    fn load_module(&self, version: &BinaryVersion) -> anyhow::Result<Module> {
        if let Some(module) = self.modules.read().unwrap().get(version) {
            return Ok(module.to_owned());
        }
        info!(target: "runner", "loading module {}", version.semver);
        let mut lock = self.modules.write().unwrap();
        let bin = fs::read(self.bin_path.join(version.filename()))?;
        let module = Module::from_binary(&self.engine, &bin)?;
        lock.insert(version.to_owned(), module.to_owned());
        Ok(module)
    }
}
