FROM node:24-bookworm

# git lets the judge detect fixture modifications (read-only discipline gate)
RUN apt-get update && apt-get install -y --no-install-recommends git     && rm -rf /var/lib/apt/lists/*

WORKDIR /app
COPY fixture /app/fixture

# Baseline commit: the judge uses `git status --porcelain -- fixture` to check whether the agent kept read-only discipline
RUN git init -q && git add -A && git -c user.email=bench@local -c user.name=bench commit -q -m "baseline"
