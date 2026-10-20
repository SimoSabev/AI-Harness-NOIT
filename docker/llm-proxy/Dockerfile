# syntax=docker/dockerfile:1
# mandat-llm-proxy: built ONLY locally (D-032). Build context = repo root, filtered by .dockerignore (D-078).
FROM node:24.22.0-bookworm-slim@sha256:a5f4366e834695d5f363b920c104953a535d3a9864d1bdf74566a0ebe01daee5 AS build
WORKDIR /src
RUN --mount=type=secret,id=extra_ca,required=false \
    if [ -s /run/secrets/extra_ca ]; then export NODE_EXTRA_CA_CERTS=/run/secrets/extra_ca; fi; \
    npm i -g --no-audit --no-fund pnpm@12.14.0
COPY . .
RUN --mount=type=secret,id=extra_ca,required=false set -eu; \
    if [ -s /run/secrets/extra_ca ]; then export NODE_EXTRA_CA_CERTS=/run/secrets/extra_ca; fi; \
    pnpm install --frozen-lockfile \
 && pnpm --filter "@mandat/llm-proxy..." build \
 && pnpm --filter @mandat/llm-proxy --prod deploy /out

FROM node:24.22.0-bookworm-slim@sha256:a5f4366e834695d5f363b920c104953a535d3a9864d1bdf74566a0ebe01daee5
COPY --from=build /out /opt/mandat/llm-proxy
COPY packages/llm-proxy/stub/stub-upstream.mjs /opt/mandat/stub-upstream.mjs
USER 1000:1000
CMD ["node","/opt/mandat/llm-proxy/dist/main.js"]
