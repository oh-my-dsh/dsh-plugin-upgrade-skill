# S1-static-scan · 静态触点扫描（只读）

agent 只读扫描 `/app/fixture/` 里的 dsh 0.1.1 旧插件，按七类触点把命中点映射到
0.1.1-rc.2 → 0.1.2-alpha.2 走廊的变更卡片，报告写到 `/app/agent-output/S1-static-scan/`。
考「扫描完整 + 卡片映射准确（含走廊折叠 A1-02 ↔ A2-01）+ 只读纪律」。
题面见 [instruction.md](instruction.md)，判分逻辑见 [tests/judge.mjs](tests/judge.mjs)。

- **环境**：`node:24-bookworm` + git（fixture 以 git 基线提交支持只读门禁），不装 dsh（本题静态）。
- **Verifier**：judge 检查 fixture 零改动 + 报告命中全部 6 张期望卡，0-100 分归一化写
  `/logs/verifier/reward.txt`。
- **Oracle**：`harbor run -p benchmark/tasks/S1-static-scan -a oracle`，期望 reward 1.0。

```
environment/fixture/   # 旧插件源码（含七类触点全埋的陷阱）
tests/                 # judge.mjs + judge-utils.mjs + test.sh
solution/              # 参考报告 + solve.sh
```
