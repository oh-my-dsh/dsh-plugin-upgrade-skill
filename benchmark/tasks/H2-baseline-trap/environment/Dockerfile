FROM node:24-bookworm

# git 供 judge 检测 fixture 改动（迁移发生与否 + 偷修门禁）
RUN apt-get update && apt-get install -y --no-install-recommends git \
    && rm -rf /var/lib/apt/lists/*

# 与 validation-report-2026-08-30.md 第六节一致
RUN npm install -g pnpm@11.24.0 @deepseek-ai/dsh@0.1.2-alpha.2

WORKDIR /app
COPY fixture /app/fixture

# 基线提交：judge 用 `git status --porcelain -- fixture` 判定迁移是否发生、测试文件是否被偷修
RUN git init -q && git add -A && git -c user.email=bench@local -c user.name=bench commit -q -m "baseline"
