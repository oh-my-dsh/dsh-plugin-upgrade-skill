FROM node:24-bookworm

RUN apt-get update && apt-get install -y --no-install-recommends \
    ca-certificates chromium fonts-liberation git \
    && rm -rf /var/lib/apt/lists/*

RUN npm install -g pnpm@11.24.0 @deepseek-ai/dsh@0.1.2-alpha.2 \
    && npm install --prefix /opt/bench playwright-core@1.55.0

WORKDIR /app
COPY fixture /app/fixture

RUN git init -q && git add -A && git -c user.email=bench@local -c user.name=bench commit -q -m "baseline"
