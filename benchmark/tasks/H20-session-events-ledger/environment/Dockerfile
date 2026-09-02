FROM node:24-bookworm

# git for the judge's tamper baseline (tracked files include node_modules).
RUN apt-get update && apt-get install -y --no-install-recommends git \
    && rm -rf /var/lib/apt/lists/*

WORKDIR /app
COPY fixture /app/fixture

# Exact pinned first-party closure: the alpha.4 session package the fixture
# migrates TO. Installed at build time from the committed lockfile; the agent
# phase needs no network for the migration itself.
RUN cd /app/fixture && npm ci --no-audit --no-fund

# Baseline commit + pinned HEAD: the judge rejects any tracked modification
# outside fixture/src/session-ledger.mjs and any history rewrite.
RUN git init -q && git add -A && git -c user.email=bench@local -c user.name=bench commit -q -m "baseline" \
    && git rev-parse HEAD > /app/baseline.sha
