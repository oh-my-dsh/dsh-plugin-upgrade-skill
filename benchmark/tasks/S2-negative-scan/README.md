# S2-negative-scan · 负向扫描（零命中 ≠ 兼容）

agent 只读扫描 `/app/fixture/` 里的最小 dsh 0.1.1 旧插件：唯一命中 #3（apiProxy →
DSH-0.1.2-A1-01），其余六类零命中；报告必须论证「零命中 ≠ 兼容」并声明仍须真实
验证，写到 `/app/agent-output/S2-negative-scan/`。
考「识别唯一命中点 + 零命中语义论证 + 验证意识 + 只读纪律」。
题面见 [instruction.md](instruction.md)，判分逻辑见 [tests/judge.mjs](tests/judge.mjs)。

- **环境**：`node:24-bookworm` + git（fixture 以 git 基线提交支持只读门禁），全局安装
  dsh 0.1.2-alpha.2 供可选冷启动验证，但本题判分不跑 dsh（静态）。
- **Verifier**：judge 检查 fixture 零改动 + 报告命中 A1-01 映射、零命中交代、
  「零命中 ≠ 兼容」语义、必须验证声明（40/20/20/20），0-100 分归一化写
  `/logs/verifier/reward.txt`。
- **Oracle**：`harbor run -p benchmark/tasks/S2-negative-scan -a oracle`，期望 reward 1.0。

```
environment/fixture/   # 最小插件源码（仅 #3 apiProxy 一个命中，另埋零命中诱饵）
tests/                 # judge.mjs + judge-utils.mjs + test.sh
solution/              # 参考报告 + solve.sh
```
