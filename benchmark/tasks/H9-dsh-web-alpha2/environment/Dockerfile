FROM node:24-bookworm

RUN apt-get update && apt-get install -y --no-install-recommends git \
    && rm -rf /var/lib/apt/lists/* \
    && npm install -g pnpm@11.24.0 @deepseek-ai/dsh@0.1.2-alpha.2 \
    && npm cache clean --force

WORKDIR /app
COPY fixture /app/fixture

# The baseline lets the verifier distinguish the migration from unrelated rewrites.
RUN git init -q \
    && git add -A \
    && git -c user.email=bench@local -c user.name=bench commit -q -m "dsh-web v0.3.8 source baseline"
