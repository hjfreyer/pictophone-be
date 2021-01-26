FROM rust

WORKDIR /usr/src

ENV CARGO_TARGET_DIR=/target

# Install dependencies before building code.
RUN USER=root cargo new server
COPY server/Cargo.toml /usr/src/server/
COPY Cargo.lock /usr/src/server/

RUN USER=root cargo new serde_firestore
COPY serde_firestore/Cargo.toml /usr/src/serde_firestore/
COPY Cargo.lock /usr/src/serde_firestore/

RUN cargo build --release --manifest-path server/Cargo.toml
RUN cargo build --release --manifest-path serde_firestore/Cargo.toml

RUN rm -rf server
RUN rm -rf serde_firestore