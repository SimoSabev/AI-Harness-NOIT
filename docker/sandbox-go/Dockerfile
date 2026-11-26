# syntax=docker/dockerfile:1
# E10 languages (D-682): mandat-sandbox-go = the sandbox image plus the official Go release archive, pinned by the sha256
# that go.dev/dl publishes (https://go.dev/dl/?mode=json, 26.11.2026). Built ONLY locally on top of the exact sandbox tag
# (`mandat images build --lang go`), never published (4.1). The container flags still come only from SANDBOX_HARDENING.
ARG SANDBOX
FROM ${SANDBOX}
USER root
ARG GO_VERSION=1.27.4
ARG GO_SHA256_amd64=7226736c2339719cda28fbf3a54d71aa63bcefe376e98cef00034268dab24840
ARG GO_SHA256_arm64=3392582988a273a87ab5043ee1b2c9c17a2c3c00580bf9326c47a2e0aaaeac92
ARG TARGETARCH
RUN --mount=type=secret,id=extra_ca,required=false set -eu; \
    if [ -s /run/secrets/extra_ca ]; then export NODE_EXTRA_CA_CERTS=/run/secrets/extra_ca; fi; \
    case "${TARGETARCH:-amd64}" in \
      amd64) SUM="$GO_SHA256_amd64" ;; \
      arm64) SUM="$GO_SHA256_arm64" ;; \
      *) echo "unsupported arch ${TARGETARCH}" >&2; exit 1 ;; \
    esac; \
    node -e 'fetch(process.argv[1]).then(async (r) => { if (!r.ok) throw new Error(String(r.status)); require("fs").writeFileSync("/tmp/go.tgz", Buffer.from(await r.arrayBuffer())); })' \
      "https://go.dev/dl/go${GO_VERSION}.linux-${TARGETARCH:-amd64}.tar.gz"; \
    echo "${SUM}  /tmp/go.tgz" | sha256sum -c -; \
    tar -xzf /tmp/go.tgz -C /usr/local; rm /tmp/go.tgz; \
    ln -s /usr/local/go/bin/go /usr/local/bin/go; ln -s /usr/local/go/bin/gofmt /usr/local/bin/gofmt; \
    env -i PATH=/usr/local/bin:/usr/bin:/bin HOME=/tmp go version | grep -F "go${GO_VERSION} "
# the sandbox sets its own PATH (/usr/local/bin:/usr/bin:/bin): go is linked there. No toolchain download, no module
# proxy, no checksum database, no telemetry: a project's go.mod cannot fetch anything; the build cache is in the tmpfs home
ENV GOTOOLCHAIN=local GOPROXY=off GOSUMDB=off GOTELEMETRY=off \
    GOCACHE=/home/agent/.cache/go-build GOPATH=/home/agent/go CGO_ENABLED=0
USER 1000:1000
WORKDIR /m/work
