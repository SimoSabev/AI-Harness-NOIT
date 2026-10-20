# Демо промпт т. 9.8: the online worker (MANDAT_MODE=worker). No Claude Code / Codex inside (K2): agents run only in
# mandat-sandbox containers that the worker starts through the host's (rootless) Docker. Not published (AGENTS.md rule 3).
FROM node:24.22.0-bookworm-slim AS build
RUN corepack enable
WORKDIR /src
COPY . .
RUN --mount=type=secret,id=extra_ca,required=false set -eu; \
    if [ -s /run/secrets/extra_ca ]; then export NODE_EXTRA_CA_CERTS=/run/secrets/extra_ca; fi; \
    pnpm install --frozen-lockfile \
 && pnpm --filter "@mandat/cli..." build \
 && pnpm --filter @mandat/cli --prod deploy /out

FROM node:24.22.0-bookworm-slim
RUN apt-get update && apt-get install -y --no-install-recommends git docker.io ca-certificates && rm -rf /var/lib/apt/lists/* \
 && useradd -u 1001 -m mandat
COPY --from=build /out /opt/mandat/cli
COPY supabase /opt/mandat/supabase
USER mandat
ENV MANDAT_MODE=worker MANDAT_WEBHOOK_HOST=0.0.0.0 MANDAT_WEBHOOK_PORT=8790 NODE_ENV=production
EXPOSE 8790
ENTRYPOINT ["node", "/opt/mandat/cli/dist/main.js", "worker"]
