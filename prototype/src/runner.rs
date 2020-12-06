use tempfile::NamedTempFile;

use anyhow::anyhow;
use bytes::BufMut;
use std::{
    io::{self, Write},
    process::Stdio,
};
use std::{
    process::Command,
    sync::{Arc, RwLock},
};
use wasi_common::virtfs::pipe::WritePipe;
use wasmtime::{Engine, Linker, Module, Store};
use wasmtime_wasi::{Wasi, WasiCtx, WasiCtxBuilder};

const V1_0_0: &'static [u8] = include_bytes!("binaries/v1.0.0.wasm");

#[derive(Debug, Copy, Clone)]
pub enum ApiVersion {
    V1_0,
}

#[derive(Debug, Copy, Clone)]
pub enum LogicVersion {
    V1_0_0,
}

pub struct Runner {
    //store: Store,
    engine: Engine,
    v1_0_0module: Module,
}

impl Runner {
    pub fn new() -> Result<Self, anyhow::Error> {
        let engine = Engine::default();
        let v1_0_0module = Module::from_binary(&engine, V1_0_0)?;
        Ok(Runner {
            engine,
            v1_0_0module,
        })
    }

    pub fn run(&self, version: LogicVersion, input: &str) -> Result<String, anyhow::Error> {
        let buf = Arc::new(RwLock::new(Vec::new()));

        {
            let stdout = WritePipe::from_shared(buf.clone());
            let store = Store::new(&self.engine);
            let mut linker = Linker::new(&store);

            let ctx = WasiCtxBuilder::new()
                .args(&["binname", input])
                .stdout(stdout)
                .build()?;

            let wasi = Wasi::new(&store, ctx);
            wasi.add_to_linker(&mut linker)?;

            linker.module("", &self.v1_0_0module)?;
            linker.get_default("")?.get0::<()>()?()?;
        }
        let lck = buf.read().unwrap();
        Ok(std::str::from_utf8(&lck)?.to_owned())
    }
}

// impl LogicVersion {
//     pub fn implemented_apis(self) -> Vec<ApiVersion> {
//         match self {
//             LogicVersion::V1_0_0 => return vec![ApiVersion::V1_0],
//         }
//     }

//     fn binary(self) -> Result<NamedTempFile, anyhow::Error> {
//         let mut file = NamedTempFile::new()?;

//         match self {
//             LogicVersion::V1_0_0 => file.write_all(V1_0_0)?,
//         };

//         Ok(file)
//     }

//     pub fn run(self, input: &str) -> Result<String, anyhow::Error> {
//         let store = wasmtime::Store::default();

//         let mut linker = Linker::new(&store);

//         //let mut buf = Arc::new(RwLock::new(vec![].writer()));
//         // let stdout = WritePipe::from_shared(buf.clone());
//         let stdout = WritePipe::new_in_memory();
//         let ctx = WasiCtxBuilder::new()
//             .args(&["binname", input])
//             .stdout(stdout.clone())
//             .build()?;

//         let wasi = Wasi::new(&store, ctx);
//         wasi.add_to_linker(&mut linker)?;

//         {
//             let module = Module::from_binary(store.engine(), V1_0_0)?;
//             linker.module("", &module)?;
//         }
//         //let instance = linker.instantiate(&module)?;

//         linker.get_default("")?.get0::<()>()?()?;

//         println!("RRRR: {:?}", stdout.clone().try_into_inner());

//         let f = self.binary()?;

//         println!("Request: {}", input);

//         let out = Command::new("wavm")
//             .args(&[
//                 "run",
//                 f.path().to_str().ok_or(anyhow!("invalid path name"))?,
//                 input,
//             ])
//             .stderr(Stdio::inherit())
//             .output()?;

//         Ok(std::str::from_utf8(&out.stdout)?.to_owned())
//     }
// }
