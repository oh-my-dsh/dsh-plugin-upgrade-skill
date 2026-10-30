# Kimi-K3 S1–S24 round 1 · 成本统计汇总

- 运行：kimi-k3 S1–S24 round 1（48 格 = 24 题 × noskill/skill 双臂）
- 生成时间：2026-10-22（会话记录整理）
- 数据来源：run-manifest.json / cell-ledger.md 原件已于判分后从工作树清理；本汇总数字恢复自归档提交 `9ef355a5`（分支 `benchmark/new-models-k3-qwen-max-v41-flash`，已推 origin），该提交含运行当时的 manifest 与 ledger 原件。

## 1. Token（input / output / cacheRead / totalTokens，分臂）

**取不到。** 原因：DSH 宿主不向编排会话返回子代理的 token/usage 计数——solver 完成消息只含结论文本，无 usage 字段；子代理会话日志在运行期内始终未能定位（`C:\Users\lhh\.dsh\logs` 仅启动日志），无处逐请求累加 totalTokens。归档 manifest 全文 0 处 token/toolcall 字段，ledger tokens 列 48 行均为 `n/a`。编排会话自身的 token 计数既不可读，也不按格/按臂拆分，不能替代。

## 2. 工具调用总数（分臂）

**取不到。** 原因同上：宿主不返回子代理工具调用计数；ledger toolcalls 列 48 行均为 `n/a`；manifest 无该字段。

## 3. 单元格时长合计（分臂）+ 墙钟窗口

| 臂 | 格数 | 时长合计 | 单格 min / 中位 / max |
|---|---|---|---|
| noskill | 24 | **344 min** | 3m / ~12m / 47m |
| skill | 24 | **367 min** | 2m / ~14m / 40m |
| 合计 | 48 | **711 min** | — |

- 墙钟窗口：`started_at 2026-10-20T14:22+08:00` → `completed_at 2026-10-20T17:41+08:00`，约 **3h19m**；首个 solver 启动 14:35、末格结束 17:41，solver 活跃窗口约 **3h06m**。
- 时长合计（711m）> 墙钟（约 3h19m）的原因：编排采用 4–5 并发 spawn（noskill 先于 skill），多格并行推进。
- 时长均为 manifest 逐格 `duration` 字段（约数，"~Nm"）之和；分臂拆分为本次从归档 manifest 重新计算。

## 4. cell-ledger.md tokens 列

**补不出。** 无数据源（见第 1 条原因）。ledger 原件现存于归档提交 `9ef355a5:`benchmark/results/artifacts/2026-10-20-kimi-k3-s1-s24-r1/cell-ledger.md`（48 行，toolcalls/tokens 列全为 `n/a`，与运行当日的记录一致）；如需恢复该文件到产物根，可从该提交 checkout。

## 附：归档位置

- 提交：`9ef355a5 benchmark: 四新模型 S1-S24 双臂运行归档（Kimi-K3 / Qwen3.8-Max / DeepSeek-V4-Pro / V4.1-Flash）`
- 分支：`benchmark/new-models-k3-qwen-max-v41-flash`（本地 + `origin`）
- 注意：当前分支 `paper/new-model-cohort` 的工作树中，`2026-10-20-kimi-k3-s1-s24-r1/` 为未跟踪目录（git 从未在当前分支提交过它），仅剩 judge-results-*.json 与 orchestration/prompts/。
