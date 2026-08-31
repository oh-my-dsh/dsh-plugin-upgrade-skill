# M1-host-migration · 宿主插件迁移（基础容器题）

agent 直接修改 `/app/fixture/` 里的 dsh 0.1.1 时代宿主插件，把它迁到
0.1.2-alpha.2（`inject: ["apiProxy"]` → `inject: ["llm"]`，
`ctx.apiProxy.llm.providers()` → `ctx.llm.listProviders()`，删死依赖
`@deepseek-ai/dsh-host-apiproxy`），目标是隔离 profile 下冷启动激活、推进到宿主应用层。
考「卡片定位 + 宿主平面迁法 + 冷启动激活」。
题面见 [instruction.md](instruction.md)，判分逻辑见 [tests/judge.mjs](tests/judge.mjs)。

- **环境**：`node:24-bookworm` + git（fixture 以 git 基线提交支持改动门禁），
  全局安装 dsh 0.1.2-alpha.2 + pnpm（agent 与 verifier 共用）。
- **Verifier**：judge 在任务容器内建隔离 profile，把 `/app/fixture` 直接
  `dsh plugin add`，headless 冷启动判定（0/30/40/100 分档，MISSING_CREDENTIAL 属无
  key 预期），reward 归一化写 `/logs/verifier/reward.txt`。
- **Oracle**：`harbor run -p benchmark/tasks/M1-host-migration -a oracle`，期望 reward 1.0。

```
environment/Dockerfile   # 镜像：git 基线 + 全局 dsh 0.1.2-alpha.2
environment/fixture/     # 旧写法宿主插件（0.1.1-rc.2 时代）
tests/                   # judge.mjs + judge-utils.mjs + test.sh
solution/                # 参考改动（solution/plugin/）+ SOLUTION.md + solve.sh
```
