# syntax=docker/dockerfile:1
# E10 languages (D-687): mandat-sandbox-rust = the sandbox image plus the official Rust 1.100.0 standalone toolchain
# (rustc, cargo, std only), pinned by the sha256 that static.rust-lang.org publishes next to the archive (26.11.2026), and
# Debian's gcc/libc6-dev as the linker (apt checks the signed archive). Built ONLY locally on top of the exact sandbox
# tag (`mandat images build --lang rust`), never published (4.1). The container flags still come only from SANDBOX_HARDENING.
ARG SANDBOX
FROM ${SANDBOX}
USER root
RUN set -eu; apt-get update \
 && apt-get install -y --no-install-recommends gcc libc6-dev xz-utils \
 && rm -rf /var/lib/apt/lists/*
ARG RUST_VERSION=1.100.0
ARG RUST_SHA256_amd64=98ee6bec240e1cfe944f17e7092412dc5ef6e008484bb668c6936d35a7d15acd
ARG RUST_SHA256_arm64=a21f6a21818df07c1e2e7addb570af5444b3fa9dd61e3a207f4fb1c5a5e665c9
ARG TARGETARCH
RUN --mount=type=secret,id=extra_ca,required=false set -eu; \
    if [ -s /run/secrets/extra_ca ]; then export NODE_EXTRA_CA_CERTS=/run/secrets/extra_ca; fi; \
    case "${TARGETARCH:-amd64}" in \
      amd64) T=x86_64-unknown-linux-gnu; SUM="$RUST_SHA256_amd64" ;; \
      arm64) T=aarch64-unknown-linux-gnu; SUM="$RUST_SHA256_arm64" ;; \
      *) echo "unsupported arch ${TARGETARCH}" >&2; exit 1 ;; \
    esac; \
    node -e 'fetch(process.argv[1]).then(async (r) => { if (!r.ok) throw new Error(String(r.status)); require("fs").writeFileSync("/tmp/rust.tar.xz", Buffer.from(await r.arrayBuffer())); })' \
      "https://static.rust-lang.org/dist/rust-${RUST_VERSION}-${T}.tar.xz"; \
    echo "${SUM}  /tmp/rust.tar.xz" | sha256sum -c -; \
    mkdir /tmp/rust && tar -xJf /tmp/rust.tar.xz -C /tmp/rust --strip-components=1; rm /tmp/rust.tar.xz; \
    /tmp/rust/install.sh --prefix=/usr/local --components="rustc,cargo,rust-std-${T}" --disable-ldconfig; \
    rm -rf /tmp/rust; \
    rustc --version | grep -F "rustc ${RUST_VERSION} "; cargo --version | grep -F "cargo ${RUST_VERSION} "
# nothing is fetched (CARGO_NET_OFFLINE), cargo's home and the build output live in the tmpfs home, never in the tree
ENV CARGO_HOME=/home/agent/.cargo CARGO_TARGET_DIR=/home/agent/target CARGO_NET_OFFLINE=true CARGO_INCREMENTAL=0
USER 1000:1000
WORKDIR /m/work
