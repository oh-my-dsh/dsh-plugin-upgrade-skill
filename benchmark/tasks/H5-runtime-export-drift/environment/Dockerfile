# H5-runtime-export-drift 题目环境：
# 全局 dsh 0.1.2-alpha.2 是"真实宿主"；fixture 在镜像构建期按冻结 lockfile 装好
# 0.1.1-rc.2 旧 cohort devDeps（旧环境 install/typecheck/build/test 全绿），并把
# 迁移目标 cohort 预热进 pnpm store，避免 trial 内 agent/judge 阶段再依赖网络。
FROM node:24-bookworm
RUN apt-get update && apt-get install -y --no-install-recommends git && rm -rf /var/lib/apt/lists/*
RUN npm install -g pnpm@11.24.0 @deepseek-ai/dsh@0.1.2-alpha.2
WORKDIR /app
COPY fixture /app/fixture
RUN cd /app/fixture && pnpm install --frozen-lockfile
RUN cd /tmp && npm init -y >/dev/null && pnpm add -D @deepseek-ai/dsh-settings@0.1.2-alpha.2 @deepseek-ai/cordis@4.0.2 @deepseek-ai/schemastery@3.18.2 >/dev/null && rm -rf /tmp/package.json /tmp/pnpm-lock.yaml /tmp/pnpm-workspace.yaml /tmp/node_modules
RUN printf 'fixture/node_modules/\nfixture/dist/\n**/*.tgz\n' > /app/.gitignore && git init -q && git add -A && git -c user.email=bench@local -c user.name=bench commit -q -m "baseline"
