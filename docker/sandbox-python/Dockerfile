# syntax=docker/dockerfile:1
# E10 languages (D-681): mandat-sandbox-python = the sandbox image (the same agents, fakes, hooks and reporters) plus
# Python 3 from Debian (apt checks the signed archive) and pytest in a venv, every wheel pinned by sha256 (--require-hashes).
# Built ONLY locally on top of the exact sandbox tag (`mandat images build --lang python`), never published (4.1). The
# container flags still come only from SANDBOX_HARDENING: this file adds files, never a capability.
ARG SANDBOX
FROM ${SANDBOX}
USER root
RUN set -eu; apt-get update \
 && apt-get install -y --no-install-recommends python3 python3-venv \
 && rm -rf /var/lib/apt/lists/*
COPY docker/sandbox-python/requirements.lock /opt/mandat/py-requirements.lock
RUN --mount=type=secret,id=extra_ca,required=false set -eu; \
    if [ -s /run/secrets/extra_ca ]; then export PIP_CERT=/run/secrets/extra_ca; fi; \
    python3 -m venv /opt/mandat/py; \
    /opt/mandat/py/bin/pip install --no-cache-dir --disable-pip-version-check --require-hashes --only-binary=:all: --no-deps -r /opt/mandat/py-requirements.lock; \
    /opt/mandat/py/bin/python -m pytest --version | grep -F "pytest 9.2.0"; \
    chmod -R a+rX,go-w /opt/mandat/py
# the venv first: `python3 -m pytest` is the pinned pytest; no .pyc next to the repo's files, no user site-packages
ENV PATH=/opt/mandat/py/bin:$PATH PYTHONDONTWRITEBYTECODE=1 PYTHONNOUSERSITE=1 PIP_NO_INDEX=1 PIP_DISABLE_PIP_VERSION_CHECK=1
USER 1000:1000
WORKDIR /m/work
