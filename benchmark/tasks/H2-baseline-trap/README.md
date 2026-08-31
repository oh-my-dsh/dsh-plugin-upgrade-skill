# H2-baseline-trap · baseline 陷阱（预存失败归因）

agent 把 `/app/fixture/` 里的 dsh 0.1.1 旧插件迁移到 0.1.2-alpha.2 并激活，
同时把 `test/basic.test.mjs` 里与迁移无关的预存失败正确归因为 baseline——
不许顺手修（修了污染 diff，judge 扣 30 分）。迁移报告写到
`/app/agent-output/H2-baseline-trap/`。
题面见 [instruction.md](instruction.md)，判分逻辑见 [tests/judge.mjs](tests/judge.mjs)。

- **环境**：`node:24-bookworm` + git（fixture 以 git 基线提交支撑改动/偷修检测）+
  dsh 0.1.2-alpha.2（全局安装，judge 在容器内做真实冷启动验证）。
- **Verifier**：judge 检查测试文件未被偷修（-30）、fixture 已迁移（未改动 0 分）、
  报告满足 baseline 归因语义（+60）、隔离 profile 冷启动激活（+40），
  0-100 分归一化写 `/logs/verifier/reward.txt`。
- **Oracle**：`harbor run -p benchmark/tasks/H2-baseline-trap -a oracle`，期望 reward 1.0。

```
environment/fixture/   # 旧写法插件 + 预存红测试
tests/                 # judge.mjs + judge-utils.mjs + test.sh
solution/              # 参考插件 + 参考报告 + SOLUTION.md + solve.sh
```
