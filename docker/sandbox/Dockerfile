# syntax=docker/dockerfile:1
# mandat-sandbox: unmodified Claude Code + the fake agents. Built ONLY locally, never published (4.1).
FROM node:24.22.0-bookworm-slim@sha256:a5f4366e834695d5f363b920c104953a535d3a9864d1bdf74566a0ebe01daee5

# curl + dig for the R14 probes. SANDBOX_APT=0 only where Debian mirrors are unreachable (D-151);
# r14-netprobe then uses its pure-Node equivalents.
ARG SANDBOX_APT=1
RUN if [ "$SANDBOX_APT" = "1" ]; then \
      apt-get update \
      && apt-get install -y --no-install-recommends curl bind9-dnsutils ca-certificates \
      && rm -rf /var/lib/apt/lists/*; \
    fi

ARG CLAUDE_CODE_VERSION=2.1.302
ARG CLAUDE_CODE_INTEGRITY=sha512-+5GARMH0vX8a+o8xGrmx67KH+aDI5aYVO2qFustRhUJrSMdxzb4LtUmF2rL+PyaxCpHfXYZz38vfIuT2irg/Cg==
ARG TARGETARCH
ARG CLAUDE_CODE_NATIVE_INTEGRITY_amd64=sha512-+d4RUq3E3K+3/J4MysB3z4QXA4rkDNt70VYpTLE6kJCnUe/Z6SB8VJsVJG/NV4bECrvkxkLHjXk+vrgBstfZkw==
ARG CLAUDE_CODE_NATIVE_INTEGRITY_arm64=sha512-eRgp1cK2oSC7vK1/Dha9EsfSxNb6b/LyduzBxRW02c0X+C6xtyAzeGMmRobQSNuTazRxsr/Cf2/l4Sf/LMgxCA==

# D-056 / D-079: both tarballs are pinned by integrity (no TOFU); postinstall stays enabled because it places the
# native binary over bin/claude.exe. extra_ca (D-150) is an optional BuildKit secret, never part of a layer.
RUN --mount=type=secret,id=extra_ca,required=false set -eu; \
    if [ -s /run/secrets/extra_ca ]; then export NODE_EXTRA_CA_CERTS=/run/secrets/extra_ca; fi; \
    case "${TARGETARCH:-amd64}" in \
      amd64) ARCH=x64; NATIVE="$CLAUDE_CODE_NATIVE_INTEGRITY_amd64" ;; \
      arm64) ARCH=arm64; NATIVE="$CLAUDE_CODE_NATIVE_INTEGRITY_arm64" ;; \
      *) echo "unsupported arch ${TARGETARCH}" >&2; exit 1 ;; \
    esac; \
    mkdir /tmp/cc && cd /tmp/cc; \
    npm pack --silent "@anthropic-ai/claude-code@${CLAUDE_CODE_VERSION}" "@anthropic-ai/claude-code-linux-${ARCH}@${CLAUDE_CODE_VERSION}"; \
    check() { got="sha512-$(node -e 'process.stdout.write(require("crypto").createHash("sha512").update(require("fs").readFileSync(process.argv[1])).digest("base64"))' "$1")"; \
              [ "$got" = "$2" ] || { echo "integrity mismatch for $1: $got" >&2; exit 1; }; }; \
    check "anthropic-ai-claude-code-${CLAUDE_CODE_VERSION}.tgz" "$CLAUDE_CODE_INTEGRITY"; \
    check "anthropic-ai-claude-code-linux-${ARCH}-${CLAUDE_CODE_VERSION}.tgz" "$NATIVE"; \
    npm install -g --offline --omit=optional --no-audit --no-fund \
      "./anthropic-ai-claude-code-linux-${ARCH}-${CLAUDE_CODE_VERSION}.tgz" "./anthropic-ai-claude-code-${CLAUDE_CODE_VERSION}.tgz"; \
    cd / && rm -rf /tmp/cc /root/.npm; \
    claude --version | grep -F "${CLAUDE_CODE_VERSION}"

ENV DISABLE_AUTOUPDATER=1 DISABLE_UPDATES=1

# E3в (демо промпт т. 2.4, 8.3; D-288): @openai/codex 0.160.1 (Apache-2.0) as a separate process, like claude. Both
# tarballs are pinned by integrity; the platform tarball (npm alias @openai/codex-linux-<arch>) is unpacked where
# bin/codex.js looks for it, so no install script and no registry lookup by name happens.
ARG CODEX_VERSION=0.160.1
ARG CODEX_INTEGRITY=sha512-f1yrJhwgimKQI1kYQlxdPJcFwkNZxZrbz7Hf89EAcnLqkQ7TiESzr2FgSZn13Ga5RuHjlVUfurzwq10wk9zw2g==
ARG CODEX_NATIVE_INTEGRITY_amd64=sha512-sIDhqV+bsZKKVaVFVY5iB+pAzyOz2XRm3H1KXCsSJwGj5p98qnrT0Fweo1Hfe7WnyTp8mfBNdbVzUeO+mHYugA==
ARG CODEX_NATIVE_INTEGRITY_arm64=sha512-JLyjBlmjPvwTaicHemw+y5xQSz3Uja2r7F/xkvS8gFufTA2g132Ak+0fo35xnJ/k2uc9fTtjm0LrsEGI78L6Ng==
RUN --mount=type=secret,id=extra_ca,required=false set -eu; \
    if [ -s /run/secrets/extra_ca ]; then export NODE_EXTRA_CA_CERTS=/run/secrets/extra_ca; fi; \
    case "${TARGETARCH:-amd64}" in \
      amd64) ARCH=x64; NATIVE="$CODEX_NATIVE_INTEGRITY_amd64" ;; \
      arm64) ARCH=arm64; NATIVE="$CODEX_NATIVE_INTEGRITY_arm64" ;; \
      *) echo "unsupported arch ${TARGETARCH}" >&2; exit 1 ;; \
    esac; \
    mkdir /tmp/cx && cd /tmp/cx; \
    npm pack --silent "@openai/codex@${CODEX_VERSION}" "@openai/codex@${CODEX_VERSION}-linux-${ARCH}"; \
    check() { got="sha512-$(node -e 'process.stdout.write(require("crypto").createHash("sha512").update(require("fs").readFileSync(process.argv[1])).digest("base64"))' "$1")"; \
              [ "$got" = "$2" ] || { echo "integrity mismatch for $1: $got" >&2; exit 1; }; }; \
    check "openai-codex-${CODEX_VERSION}.tgz" "$CODEX_INTEGRITY"; \
    check "openai-codex-${CODEX_VERSION}-linux-${ARCH}.tgz" "$NATIVE"; \
    npm install -g --offline --omit=optional --ignore-scripts --no-audit --no-fund "./openai-codex-${CODEX_VERSION}.tgz"; \
    G="$(npm root -g)/@openai/codex/node_modules/@openai/codex-linux-${ARCH}"; mkdir -p "$G"; \
    tar -xzf "openai-codex-${CODEX_VERSION}-linux-${ARCH}.tgz" --strip-components=1 -C "$G"; \
    cd / && rm -rf /tmp/cx /root/.npm; \
    codex --version | grep -F "${CODEX_VERSION}"

COPY packages/agents/fakes/ /opt/mandat/fakes/
RUN chmod 0555 /opt/mandat/fakes && chmod 0444 /opt/mandat/fakes/* \
 && mkdir -p /m/work /m/out /m/in /home/agent \
 && chown 1000:1000 /m /m/work /m/out && chown root:root /m/in && chmod 0755 /m/in

USER 1000:1000
WORKDIR /m/work
