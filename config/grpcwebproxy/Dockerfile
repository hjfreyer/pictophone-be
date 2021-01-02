FROM golang:buster AS builder

RUN git clone https://github.com/improbable-eng/grpc-web.git /go/src/github.com/improbable-eng/grpc-web

WORKDIR /go/src/github.com/improbable-eng/grpc-web

RUN go get -u github.com/golang/dep/cmd/dep
RUN dep ensure
RUN go install ./go/grpcwebproxy

FROM debian:buster-slim

RUN apt-get update && \
  apt-get install -y ca-certificates

COPY --from=builder /go/bin/grpcwebproxy /usr/local/bin/

ENTRYPOINT ["/usr/local/bin/grpcwebproxy", \
    "--run_tls_server=false", \
    "--allow_all_origins"]