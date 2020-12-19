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

#[derive(Debug, Copy, Clone, PartialOrd, PartialEq, Ord, Eq)]
pub enum LogicVersion {
    V1_0_0,
}

pub struct Runner {
    engine: Engine,
    v1_0_0module: Module,
}

impl Runner {
    pub fn new(bin_path: &std::path::Path) -> Result<Self, anyhow::Error> {
        let engine = Engine::default();

        let v1_0_0_bin = fs::read(bin_path.join("v1.0.0.wasm"))?;
        let v1_0_0module = Module::from_binary(&engine, &v1_0_0_bin)?;
        Ok(Runner {
            engine,
            v1_0_0module,
        })
    }

    pub fn run(&self, version: LogicVersion, request: Request) -> Result<Response, anyhow::Error> {
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

            linker.module("", &self.v1_0_0module)?;
            linker.get_default("")?.get0::<()>()?()?;
        }
        let lck = buf.read().unwrap();
        let resp = Response::decode(&**lck)?;
        Ok(resp)
    }
}
