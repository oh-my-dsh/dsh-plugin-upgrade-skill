FROM node:24-bookworm

RUN apt-get update && apt-get install -y --no-install-recommends \
    ca-certificates chromium fonts-liberation git sqlite3 \
    && rm -rf /var/lib/apt/lists/* \
    && npm install -g pnpm@11.24.0 @deepseek-ai/dsh@0.1.2-alpha.2 \
    && npm install --prefix /opt/bench playwright-core@1.55.0 \
    && npm cache clean --force

WORKDIR /app
COPY . /tests
RUN chmod +x /tests/test.sh
