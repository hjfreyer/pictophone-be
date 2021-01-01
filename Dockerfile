FROM rust AS deps_builder

WORKDIR /usr/src

# Install dependencies before building code.
RUN USER=root cargo new server

COPY server/Cargo.toml /usr/src/server/
COPY Cargo.lock /usr/src/server/

RUN cargo build --release --manifest-path server/Cargo.toml

# Install OS packages.
FROM debian:buster-slim as env_setup

RUN apt-get update && \
  apt-get install -y ca-certificates


FROM deps_builder as builder 

# Now actually add and build the code.
COPY proto/ proto/
COPY server/ server/

RUN cargo build --release --manifest-path server/Cargo.toml

# Copy the binary in.
FROM env_setup

ENV RUST_LOG=info,server=trace

WORKDIR /usr/src/app

COPY --from=builder /usr/src/server/target/release/server /usr/local/bin/
COPY binaries/ /data/wasm/
COPY config/prod.toml /data/config.toml

CMD ["/usr/local/bin/server"]