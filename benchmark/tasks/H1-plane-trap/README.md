# H1-plane-trap · 平面陷阱（别信注释）

agent 把 `/app/fixture/` 里的 dsh 0.1.1-rc.2 旧插件迁移到 0.1.2-alpha.2。源码里有一段
误导性迁移注释（建议 `inject: ["remote"]`），照抄会落入平面陷阱：本插件是宿主平面
消费者，应注入领域服务 `llm`，误注 `remote` 会 `pending (waiting for service: remote)`。
考「先判定运行平面再选注入名 + 真实冷启动激活」。

- **环境**：`node:24-bookworm` + git（fixture 以 git 基线提交支持迁移门禁）+
  全局安装 pnpm@11.24.0 与 dsh 0.1.2-alpha.2（容器题，judge 在容器内做冷启动验证）。
- **Verifier**：judge 检查 fixture 有改动 + 静态门槛（inject 含 `remote` 不含 `llm`
  封顶 20）+ 隔离 profile 冷启动激活信号，0-100 分归一化写 `/logs/verifier/reward.txt`。
- **Oracle**：`harbor run -p benchmark/tasks/H1-plane-trap -a oracle`，期望 reward 1.0。

```
environment/fixture/   # 旧写法宿主插件 + 误导性迁移注释（陷阱本体）
tests/                 # judge.mjs + judge-utils.mjs + test.sh
solution/              # 参考插件文件 + SOLUTION.md + solve.sh
```
