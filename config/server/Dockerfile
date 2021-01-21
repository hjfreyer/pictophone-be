FROM rust AS deps_builder

WORKDIR /usr/src

# Install dependencies before building code.
RUN USER=root cargo new server

COPY server/Cargo.toml /usr/src/server/
COPY Cargo.lock /usr/src/server/

RUN USER=root cargo new serde_firestore
COPY serde_firestore/Cargo.toml /usr/src/serde_firestore/
COPY Cargo.lock /usr/src/serde_firestore/

RUN cargo build --release --manifest-path server/Cargo.toml
RUN cargo build --release --manifest-path serde_firestore/Cargo.toml

# Install OS packages.
FROM envoyproxy/envoy:v1.16.1 as env_setup

RUN apt-get update && \
  apt-get install -y ca-certificates

FROM deps_builder as builder 

# Now actually add and build the code.
COPY proto/ proto/
COPY server/ server/
COPY serde_firestore/ serde_firestore/

RUN cargo build --release --manifest-path server/Cargo.toml

# Copy the binary in.
FROM env_setup

COPY config/server/start.sh /usr/local/bin/start.sh
ENV RUST_LOG=info,wasmtime::linker=error
ENV ENVOY_UID=0

WORKDIR /usr/src/app

COPY --from=builder /usr/src/server/target/release/server /usr/local/bin/app_server

COPY binaries/ /data/wasm/
COPY config/server/prod.toml /data/config.toml
COPY config/server/envoy.yaml /etc/envoy/envoy.yaml
CMD ["/usr/local/bin/start.sh"]