FROM node:24-bookworm@sha256:be23f54a88d34e8824c741b19b91064094f92c1c97b194144bfc8b50d67258e2

# git owns the fixture baseline; tmux/asciinema let terminal agents start
# without a second best-effort package installation during the closed agent phase.
RUN apt-get update && apt-get install -y --no-install-recommends git tmux asciinema \
    && rm -rf /var/lib/apt/lists/*

RUN npm install -g pnpm@11.24.0

# Keep the two published user-questions implementations in independent dependency
# closures. Their checked-in lockfiles make the real-contract probe repeatable;
# lifecycle scripts are unnecessary for this pure JavaScript registration seam.
COPY cohorts/rc2 /opt/dsh-cohorts/rc2
COPY cohorts/alpha2 /opt/dsh-cohorts/alpha2
RUN pnpm --dir /opt/dsh-cohorts/rc2 install --frozen-lockfile --ignore-scripts \
    && pnpm --dir /opt/dsh-cohorts/alpha2 install --frozen-lockfile --ignore-scripts

WORKDIR /app
COPY fixture /app/fixture

# The judge uses the baseline to reject untouched submissions. Dependencies and
# generated test output are intentionally outside the committed fixture surface.
RUN git init -q \
    && git add -A \
    && git -c user.email=bench@local -c user.name=bench commit -q -m "baseline"
