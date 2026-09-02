FROM node:24-bookworm

RUN apt-get update && apt-get install -y --no-install-recommends git \
    && rm -rf /var/lib/apt/lists/* \
    && npm install -g pnpm@11.24.0 @deepseek-ai/dsh@0.1.2-alpha.2 \
    && npm cache clean --force

WORKDIR /app
COPY fixture /app/fixture

RUN git init -q \
    && git add -A \
    && git -c user.email=bench@local -c user.name=bench commit -q -m "dsh-data-agent v0.1.3 source baseline"
