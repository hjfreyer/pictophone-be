FROM debian:buster-slim as env_setup

# Install OS packages.
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

ENV RUST_LOG=info,wasmtime::linker=error

WORKDIR /usr/src/app

COPY --from=builder /target/release/server /usr/local/bin/app_server

COPY binaries/ /data/wasm/
COPY config/server/prod.toml /data/config.toml
CMD ["/usr/local/bin/app_server"]