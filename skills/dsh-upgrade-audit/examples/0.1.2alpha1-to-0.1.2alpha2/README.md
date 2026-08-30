# Example: 0.1.2-alpha.1 → 0.1.2-alpha.2 audit report

本 skill（源码模式）在 deepseek-harness 检出里产出的真实审计报告，区间 `dsh-v0.1.2-alpha.1..dsh-v0.1.2-alpha.2`（234 commits，其中 157 个非合并；1,604 files changed，+27,862 / −14,050）。

展示的输出契约全貌：

- `UPGRADE-ADAPTATION.md` — 头部区间统计与 merge-base 纯度说明、Verdict、§1 回滚分节（含方向性判定）、按消费者影响排序的破坏分节（每条带 **Adapt:** 行）、Confirmed unchanged、边界签名表、编号 Adaptation checklist
- `CHANGELOG.md` — 按类型分类的 commit 清单，**必须包含 Reverts 分节**

机械工件（`commits.txt`、`files.txt`、`diffstat.txt`、全量 `.diff`）不入库，需要时在 deepseek-harness 检出里重新生成：

```sh
node <skill-dir>/scripts/gen-artifacts.mjs dsh-v0.1.2-alpha.1 dsh-v0.1.2-alpha.2 tmp/0.1.2alpha1-to-0.1.2alpha2
```
