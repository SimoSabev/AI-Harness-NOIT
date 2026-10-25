# syntax=docker/dockerfile:1.7
# v5 E9б (D12, D-364): the browser of the UI check — Playwright's own image (Chromium + Node), pinned by digest; the
# playwright package pinned by integrity, no install scripts; the runner script of packages/verify/ui-runner.
FROM mcr.microsoft.com/playwright:v1.63.0-noble@sha256:eff16c30e6f3f4af0a03fa4b706120d5e9b0891c344a27d64559aff5900a4a27
ARG PW_VERSION=1.63.0
ARG PW_INTEGRITY=sha512-+7ziBLidS4NaNCdt57SUDT+wYmmd5fmiQejUic/kb+YsYSCPyOOE9sebzMjNmQrsnNpDJqd4WHvV/8lfKfUDUg==
ARG PWC_INTEGRITY=sha512-rYCsBF/M5HjUch52bbtVONEFjv6Xu8sm8h72dNlR5bzIE1fvC/bxgspzkjSfU+MweEMmPM8KJebG6nnyxo5mCg==
RUN --mount=type=secret,id=extra_ca,required=false set -eu; \
    if [ -s /run/secrets/extra_ca ]; then export NODE_EXTRA_CA_CERTS=/run/secrets/extra_ca; fi; \
    mkdir /tmp/pw && cd /tmp/pw; \
    npm pack --silent "playwright@${PW_VERSION}" "playwright-core@${PW_VERSION}"; \
    check() { got="sha512-$(node -e 'process.stdout.write(require("crypto").createHash("sha512").update(require("fs").readFileSync(process.argv[1])).digest("base64"))' "$1")"; \
              [ "$got" = "$2" ] || { echo "integrity mismatch for $1: $got" >&2; exit 1; }; }; \
    check "playwright-${PW_VERSION}.tgz" "$PW_INTEGRITY"; \
    check "playwright-core-${PW_VERSION}.tgz" "$PWC_INTEGRITY"; \
    mkdir -p /opt/mandat/ui && cd /opt/mandat/ui && echo '{"name":"mandat-ui","private":true}' > package.json; \
    npm install --offline --ignore-scripts --no-audit --no-fund "/tmp/pw/playwright-core-${PW_VERSION}.tgz" "/tmp/pw/playwright-${PW_VERSION}.tgz"; \
    cd / && rm -rf /tmp/pw /root/.npm
COPY packages/verify/ui-runner/ /opt/mandat/ui/
RUN chmod -R a+rX /opt/mandat/ui /ms-playwright && mkdir -p /m/work /m/out /home/agent && chown -R 1000:1000 /m /home/agent
ENV PLAYWRIGHT_BROWSERS_PATH=/ms-playwright
