FROM node:24-bookworm

# git 供 judge 检测 fixture 是否被改动（迁移门禁）
RUN apt-get update && apt-get install -y --no-install-recommends git \
    && rm -rf /var/lib/apt/lists/*

# 与 validation-report-2026-08-30.md 第六节一致：全局安装 pnpm 与 dsh 0.1.2-alpha.2，
# 供 agent 与 judge 在容器内做真实冷启动验证。
RUN npm install -g pnpm@11.24.0 @deepseek-ai/dsh@0.1.2-alpha.2

WORKDIR /app
COPY fixture /app/fixture

# 基线提交：judge 用 `git status --porcelain -- fixture` 判定 agent 是否完成迁移
RUN git init -q && git add -A && git -c user.email=bench@local -c user.name=bench commit -q -m "baseline"
