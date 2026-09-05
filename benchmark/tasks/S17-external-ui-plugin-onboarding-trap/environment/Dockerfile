FROM node:24-bookworm

# git 供 judge 检测 fixture 是否被改动（只读纪律门禁）
RUN apt-get update && apt-get install -y --no-install-recommends git     && rm -rf /var/lib/apt/lists/*

WORKDIR /app
COPY fixture /app/fixture

# 基线提交：judge 用 `git status --porcelain -- fixture` 判定 agent 是否守只读纪律
RUN git init -q && git add -A && git -c user.email=bench@local -c user.name=bench commit -q -m "baseline"
