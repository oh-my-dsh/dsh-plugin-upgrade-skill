FROM node:24-bookworm

# git 供 judge 检测 fixture 是否被改动（迁移门槛）
RUN apt-get update && apt-get install -y --no-install-recommends git \
    && rm -rf /var/lib/apt/lists/*

# dsh 0.1.2-alpha.2 + pnpm：agent 冷启动验证与 judge 运行时判定共用（与 validation-report-2026-08-30.md 第六节一致）
RUN npm install -g pnpm@11.24.0 @deepseek-ai/dsh@0.1.2-alpha.2

WORKDIR /app
COPY fixture /app/fixture

# 基线提交：judge 用 `git status --porcelain -- fixture` 判定 agent 是否真的改了 fixture
RUN git init -q && git add -A && git -c user.email=bench@local -c user.name=bench commit -q -m "baseline"
