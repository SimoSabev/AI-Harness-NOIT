# syntax=docker/dockerfile:1
# mandat-sandbox: unmodified Claude Code + the fake agents. Built ONLY locally, never published (4.1).

# E8e (D-354): the MCP sidecar bridge (stdio MCP server → streamable HTTP), deployed with its production dependencies.
# The sidecar runs this same image with role mcp; the agent never runs it.
FROM node:24.22.0-bookworm-slim@sha256:a5f4366e834695d5f363b920c104953a535d3a9864d1bdf74566a0ebe01daee5 AS mcpbridge
WORKDIR /src
RUN --mount=type=secret,id=extra_ca,required=false \
    if [ -s /run/secrets/extra_ca ]; then export NODE_EXTRA_CA_CERTS=/run/secrets/extra_ca; fi; \
    npm i -g --no-audit --no-fund pnpm@12.14.0
COPY . .
RUN --mount=type=secret,id=extra_ca,required=false set -eu; \
    if [ -s /run/secrets/extra_ca ]; then export NODE_EXTRA_CA_CERTS=/run/secrets/extra_ca; fi; \
    pnpm install --frozen-lockfile --filter "@mandat/mcp-bridge..." \
 && pnpm --filter "@mandat/mcp-bridge..." build \
 && pnpm --filter @mandat/mcp-bridge --prod deploy /out \
 && find /out -type d \( -name tests -o -name __tests__ -o -name test \) -prune -exec rm -rf {} + \
 && find /out -type f \( -name "*.test.*" -o -name "*.spec.*" \) -delete
# (the dependencies' own test files carry sample tokens; the R8 keyscan must see none in the sandbox image)

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

# D-301: pnpm and yarn v1 for repos that use them; pinned by integrity like the agents (no TOFU), no install scripts.
# The base image's own yarn (unpinned here) is removed first, so `yarn` is exactly the checked tarball.
ARG PNPM_VERSION=12.14.0
ARG PNPM_INTEGRITY=sha512-wYum2HmT09Fky16JSPMrLAbuhUSH4GzY2GeBNC+z5btGNDZwNHEehoArqpw3vqkGzhkprQjXCITJfYAd8TOJpg==
ARG YARN_VERSION=1.22.22
ARG YARN_INTEGRITY=sha512-prL3kGtyG7o9Z9Sv8IPfBNrWTDmXB4Qbes8A9rEzt6wkJV8mUvoirjU0Mp3GGAU06Y0XQyA3/2/RQFVuK7MTfg==
RUN --mount=type=secret,id=extra_ca,required=false set -eu; \
    if [ -s /run/secrets/extra_ca ]; then export NODE_EXTRA_CA_CERTS=/run/secrets/extra_ca; fi; \
    mkdir /tmp/pm && cd /tmp/pm; \
    npm pack --silent "pnpm@${PNPM_VERSION}" "yarn@${YARN_VERSION}"; \
    check() { got="sha512-$(node -e 'process.stdout.write(require("crypto").createHash("sha512").update(require("fs").readFileSync(process.argv[1])).digest("base64"))' "$1")"; \
              [ "$got" = "$2" ] || { echo "integrity mismatch for $1: $got" >&2; exit 1; }; }; \
    check "pnpm-${PNPM_VERSION}.tgz" "$PNPM_INTEGRITY"; \
    check "yarn-${YARN_VERSION}.tgz" "$YARN_INTEGRITY"; \
    rm -rf /usr/local/bin/yarn /usr/local/bin/yarnpkg /opt/yarn-v*; \
    npm install -g --offline --ignore-scripts --no-audit --no-fund "./pnpm-${PNPM_VERSION}.tgz" "./yarn-${YARN_VERSION}.tgz"; \
    cd / && rm -rf /tmp/pm /root/.npm; \
    pnpm --version | grep -F "${PNPM_VERSION}"; yarn --version | grep -F "${YARN_VERSION}"

# E8и (D-358): yarn berry for repos with a yarn 4 lockfile (`__metadata`), the single-file release from @yarnpkg/cli-dist,
# pinned by integrity; run as `node /opt/yarn-berry/yarn.js` with YARN_IGNORE_PATH=1 (the repo's yarnPath is never used).
ARG YARN_BERRY_VERSION=4.18.1
ARG YARN_BERRY_INTEGRITY=sha512-EH+A4TxAtBWXKE0DGQxW9Bo9crXHLJ73mfxjTQJuv8XonNWWTpei8BQ5JjczHJNU9GROTycwMFn8iOvRIZXUcA==
RUN --mount=type=secret,id=extra_ca,required=false set -eu; \
    if [ -s /run/secrets/extra_ca ]; then export NODE_EXTRA_CA_CERTS=/run/secrets/extra_ca; fi; \
    mkdir /tmp/yb && cd /tmp/yb; \
    npm pack --silent "@yarnpkg/cli-dist@${YARN_BERRY_VERSION}"; \
    got="sha512-$(node -e 'process.stdout.write(require("crypto").createHash("sha512").update(require("fs").readFileSync(process.argv[1])).digest("base64"))' "yarnpkg-cli-dist-${YARN_BERRY_VERSION}.tgz")"; \
    [ "$got" = "$YARN_BERRY_INTEGRITY" ] || { echo "integrity mismatch for yarn berry: $got" >&2; exit 1; }; \
    mkdir -p /opt/yarn-berry; \
    tar -xzf "yarnpkg-cli-dist-${YARN_BERRY_VERSION}.tgz" -C /opt/yarn-berry --strip-components=2 package/bin/yarn.js; \
    cd / && rm -rf /tmp/yb /root/.npm; \
    YARN_IGNORE_PATH=1 node /opt/yarn-berry/yarn.js --version | grep -Fx "${YARN_BERRY_VERSION}"

# E8и (D-358): bun for repos with a text bun.lock — only `bun install` (the tests still run with vitest/jest); the platform
# binary from @oven/bun-linux-<arch> (x64: the baseline build, no AVX2 needed), pinned by integrity.
ARG BUN_VERSION=1.4.3
ARG BUN_INTEGRITY_amd64=sha512-4kW2iuLPQLv3N6o21tLwD1ALhI75LFT9YvlpoHrkM6IalbuS3LNKcHc9ex5kAHifJEFFm0ExGx1Zj75wdDux7w==
ARG BUN_INTEGRITY_arm64=sha512-ylogDFxDD+aRKO0TJauwDzCWM+rULvc85gRNZQ9CnY6rm2BU4GC2XUDi20bh67CIuB4Wt/0PL1xpsJ2hqplMww==
RUN --mount=type=secret,id=extra_ca,required=false set -eu; \
    if [ -s /run/secrets/extra_ca ]; then export NODE_EXTRA_CA_CERTS=/run/secrets/extra_ca; fi; \
    case "${TARGETARCH:-amd64}" in \
      amd64) PKG=bun-linux-x64-baseline; WANT="$BUN_INTEGRITY_amd64" ;; \
      arm64) PKG=bun-linux-aarch64; WANT="$BUN_INTEGRITY_arm64" ;; \
      *) echo "unsupported arch ${TARGETARCH}" >&2; exit 1 ;; \
    esac; \
    mkdir /tmp/bun && cd /tmp/bun; \
    npm pack --silent "@oven/${PKG}@${BUN_VERSION}"; \
    got="sha512-$(node -e 'process.stdout.write(require("crypto").createHash("sha512").update(require("fs").readFileSync(process.argv[1])).digest("base64"))' "oven-${PKG}-${BUN_VERSION}.tgz")"; \
    [ "$got" = "$WANT" ] || { echo "integrity mismatch for bun: $got" >&2; exit 1; }; \
    tar -xzf "oven-${PKG}-${BUN_VERSION}.tgz" -C /usr/local/bin --strip-components=2 package/bin/bun; \
    chmod 0755 /usr/local/bin/bun; \
    cd / && rm -rf /tmp/bun /root/.npm; \
    DO_NOT_TRACK=1 bun --version | grep -Fx "${BUN_VERSION}"

COPY packages/agents/fakes/ /opt/mandat/fakes/
# v5 E8а / SH2: the harness hooks (ESM, no dependencies); the agent can run them, never change them
COPY packages/agents/hooks/ /opt/mandat/hooks/
COPY --from=mcpbridge /out /opt/mandat/mcp-bridge
# E4 (т. 9.0): recorded transcripts + fixed patches for the deterministic replay agents
COPY demo/recordings/*.jsonl demo/recordings/*.patch /opt/mandat/replay/
RUN chmod 0555 /opt/mandat/fakes /opt/mandat/replay /opt/mandat/hooks && chmod 0444 /opt/mandat/fakes/* /opt/mandat/replay/* /opt/mandat/hooks/* \
 && mkdir -p /m/work /m/out /m/in /home/agent \
 && chown 1000:1000 /m /m/work /m/out && chown root:root /m/in && chmod 0755 /m/in

USER 1000:1000
WORKDIR /m/work
