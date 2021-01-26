# Install OS packages.
FROM envoyproxy/envoy:v1.16.1 as env_setup

RUN apt-get update && \
  apt-get install -y ca-certificates

FROM gcr.io/pictophone-test/server-deps AS builder

WORKDIR /usr/src

COPY proto/ proto/
COPY server/ server/
COPY serde_firestore/ serde_firestore/

COPY Cargo.lock server/
COPY Cargo.lock serde_firestore/

RUN cargo build --release --manifest-path server/Cargo.toml

# Copy the binary in.
FROM env_setup

COPY config/server/start.sh /usr/local/bin/start.sh
ENV RUST_LOG=info,wasmtime::linker=error
ENV ENVOY_UID=0

WORKDIR /usr/src/app

COPY --from=builder /target/release/server /usr/local/bin/app_server

COPY binaries/ /data/wasm/
COPY config/server/prod.toml /data/config.toml
COPY config/server/envoy.yaml /etc/envoy/envoy.yaml
CMD ["/usr/local/bin/start.sh"]