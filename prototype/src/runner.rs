use std::collections::HashMap;

use {
    crate::protobuf::pictophone::logic::{Request, Response},
    std::{
        fs,
        sync::{Arc, RwLock},
    },
    wasi_common::virtfs::pipe::{ReadPipe, WritePipe},
    wasmtime::{Engine, Linker, Module, Store},
    wasmtime_wasi::{Wasi, WasiCtxBuilder},
};

#[derive(Debug, Copy, Clone, PartialOrd, PartialEq, Ord, Eq, Hash)]
pub enum LogicVersion {
    V1_0_0,
    V1_1_0,
}

impl LogicVersion {
    const ALL: [Self; 2] = [Self::V1_0_0, Self::V1_1_0];
    // fn all() -> {

    // }

    fn filename(self) -> &'static str {
        match self {
            LogicVersion::V1_0_0 => "v1.0.0.wasm",
            LogicVersion::V1_1_0 => "v1.1.0.wasm",
        }
    }
}

pub struct Runner {
    engine: Engine,
    modules: HashMap<LogicVersion, Module>,
}

impl Runner {
    pub fn new(bin_path: &std::path::Path) -> Result<Self, anyhow::Error> {
        let engine = Engine::default();

        let mut modules = HashMap::<LogicVersion, Module>::new();
        for version in &LogicVersion::ALL {
            let bin = fs::read(bin_path.join(version.filename()))?;
            let module = Module::from_binary(&engine, &bin)?;
            modules.insert(*version, module);
        }
        Ok(Runner { engine, modules })
    }

    pub fn run(&self, version: LogicVersion, request: Request) -> Result<Response, anyhow::Error> {
        println!("Running version: {:?}", version);
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

            let module = self.modules.get(&version).unwrap();

            linker.module("", module)?;
            linker.get_default("")?.get0::<()>()?()?;
        }
        let lck = buf.read().unwrap();
        let resp = Response::decode(&**lck)?;
        Ok(resp)
    }
}
