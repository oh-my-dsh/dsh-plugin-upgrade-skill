FROM node:24-bookworm

# git lets the judge detect whether the fixture was modified (migration gate)
RUN apt-get update && apt-get install -y --no-install-recommends git \
    && rm -rf /var/lib/apt/lists/*

# Consistent with section 6 of validation-report-2026-08-30.md: install pnpm and dsh 0.1.2-alpha.2 globally
# so that the agent and the judge can do real cold-boot verification inside the container.
RUN npm install -g pnpm@11.24.0 @deepseek-ai/dsh@0.1.2-alpha.2

WORKDIR /app
COPY fixture /app/fixture

# Baseline commit: the judge uses `git status --porcelain -- fixture` to determine whether the agent completed the migration
RUN git init -q && git add -A && git -c user.email=bench@local -c user.name=bench commit -q -m "baseline"
