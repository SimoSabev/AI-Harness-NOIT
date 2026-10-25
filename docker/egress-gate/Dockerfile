# syntax=docker/dockerfile:1
# mandat-egress-gate: built ONLY locally (D-032). Build context = repo root, filtered by .dockerignore (D-078).
FROM node:24.22.0-bookworm-slim@sha256:a5f4366e834695d5f363b920c104953a535d3a9864d1bdf74566a0ebe01daee5 AS build
WORKDIR /src
RUN --mount=type=secret,id=extra_ca,required=false \
    if [ -s /run/secrets/extra_ca ]; then export NODE_EXTRA_CA_CERTS=/run/secrets/extra_ca; fi; \
    npm i -g --no-audit --no-fund pnpm@12.14.0
COPY . .
# D-389: the pnpm store survives between builds (a code change no longer downloads every dependency again), and only
# this image's packages are installed, not the whole workspace.
RUN --mount=type=cache,id=mandat-pnpm-store,target=/pnpm-store --mount=type=secret,id=extra_ca,required=false set -eu; \
    if [ -s /run/secrets/extra_ca ]; then export NODE_EXTRA_CA_CERTS=/run/secrets/extra_ca; fi; \
    pnpm install --frozen-lockfile --store-dir /pnpm-store --filter "@mandat/egress-gate..." \
 && pnpm --filter "@mandat/egress-gate..." build \
 && pnpm --filter @mandat/egress-gate --prod deploy /out

FROM node:24.22.0-bookworm-slim@sha256:a5f4366e834695d5f363b920c104953a535d3a9864d1bdf74566a0ebe01daee5
COPY --from=build /out /opt/mandat/egress-gate
USER 1000:1000
CMD ["node","/opt/mandat/egress-gate/dist/main.js"]
