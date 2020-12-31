from rust as builder

WORKDIR /usr/src

# Install dependencies before building code.
RUN USER=root cargo new server

COPY server/Cargo.toml /usr/src/server/
COPY Cargo.lock /usr/src/server/

RUN cargo build --release --manifest-path server/Cargo.toml

# Now actually add and build the code.
COPY proto/ proto/
COPY server/ server/

RUN cargo build --release --manifest-path server/Cargo.toml

FROM debian:buster-slim

ENV PORT=8080
ENV RUST_LOG=info
ENV WASM_PATH=/data/wasm/

WORKDIR /usr/src/app

COPY --from=builder /usr/src/server/target/release/server /usr/local/bin/
COPY binaries/ /data/wasm/

CMD ["/usr/local/bin/server"]