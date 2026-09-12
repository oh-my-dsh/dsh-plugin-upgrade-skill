# Benchmark 实验报告：`experiment/main56-v2` vs `main`（solver = GLM-5.3-Flash）

日期：2026-09-12。运行目录：`/Users/rqq/dsh-bench-runs/`（每题 trial 目录含 reward.txt、judge 输出、solver-log）。

## 1. 协议

- 复现 Harbor 0.22.0 trial 机制：每题按 `task.toml` 的 CPU/内存/网络策略起容器（fixture 于 `/app/fixture`，git 基线），solver 仅通过 `docker exec` 工作；`upgrade-only` 条件（skill 挂载于 `/harbor/skills/plugin-upgrade`）；求解结束后将 `tests/` 拷入容器运行官方 `test.sh` → verifier 写 `reward.txt`。
- solver = GLM-5.3-Flash（本人及子代理，单次尝试/题）；禁止阅读 tests/solution/宿主仓库；静态题保持只读纪律。
- 两分支各 56 题全新求解 + 各自分支 grader 评分（主实验）；再双向交叉重评分（同一答案过两分支 grader，标注为独立分析，非新求解）。
- 与正式 Harbor 模型运行的差异：solver 由我的代理循环驱动而非 terminus-2；评分与控制协议与官方一致。

## 2. 主实验（各分支全新运行，本分支 grader）

| 分支 | 有效评分 | 总分 | 均值 | 满分 | 求解时长合计* |
|---|---|---|---|---|---|
| experiment/main56-v2 | 55/56（H9=verifier_error） | 41.12 | 0.7476 | 29 | 22h10m |
| main | 56/56 | 41.05 | 0.7330 | 31 | 24h06m |

*按题累加，4 题并行所以远小于墙钟时间。

两分支均值差 +0.015（≈1.5 分/100 题），在单次求解方差范围内；27/56 题两分支得分完全相同。

## 3. 交叉重评分（同答案 × 两分支 grader；独立分析）

109 个可配对（答案×grader）中：**100 对完全一致（91.7%）**，3 对 |Δ|≤0.2，6 对 |Δ|>0.2：

| 任务 | 答案来源 | 本分支 grader | 对方 grader | Δ |
|---|---|---:|---:|---:|
| H23-storage-domain-version-compat | exp | 1.0 | 0.0 | −1.00 |
| H23-storage-domain-version-compat | main | 1.0 | 0.0 | −1.00 |
| S4-legacy-client-imports | main | 1.0 | 0.25 | −0.75 |
| S1-static-scan | main | 1.0 | 0.6 | −0.40 |
| S3-snapshot-migration | main | 1.0 | 0.6 | −0.40 |
| S6-corridor-net-state | main | 0.5 | 1.0 | +0.50 |

54 题匹配集总分：exp 答案被 main grader 打 39.54（自评 40.64）；main 答案被 exp grader 打 38.10（自评 40.05）。**平均每题评分偏置 −0.028：整体评分改版对既有答案近乎中性，但存在个别严重不兼容（H23）**。

## 4. 控制实验（官方 harbor 入口，7 题套件 × 两分支）

- oracle：7/7 参考答案 = 1（两分支均通过）。
- nop：全部 reward = 0（两分支均通过）。
- 材料校验：`benchmark/conditions/main-56` 的 `manifest.sha256` 与 `artifact-checksums.sha256` 全部通过。
- `npm test`：两分支 EXIT=0 全部通过。

## 5. 关键发现（体检结论）

1. **verifier 错误 vs 有效零分（实验分支的核心改进，已被本运行证实）**：H9 两分支同现 `fixture baseline: stdout maxBuffer exceeded`（solver 修改 57 文件、lockfile 巨大 diff 超出 judge 的 spawnSync maxBuffer）。main 旧 grader **静默记 0**；实验分支 grader 输出 `{"status":"verifier_error"}` 不计分。同一基础设施故障在 main 会污染均值，实验分支会触发调查——这正是 EXPERIMENT-main56.md 声称的效度修复。
2. **H23 评分互不兼容**：两分支的 H23 grader 各自只认本分支期望的声明形状，对方的满分答案被判 0。冻结前必须修复（否则历史答案重评分或跨版本比较会失真）。
3. **0.4 分簇是 grader 精确匹配所致，非能力问题**：H14–H19/M8–M11/S17 等 11 题 solver 产出可辩护但不同的 `dsh.client.inject` 重组时，触发 "static migration incomplete — capped at 40" 硬上限（两分支一致）。grader 期望唯一清单（如 M10 期望 `[ui-primitives, ui-slots]`），与技能卡片推导的替代方案冲突——建议 grader 接受等价重组或说明唯一性依据。
4. **H24 双侧 0 分**：backup-and-skip 修复使运行时把 sealed 文件 `broken.json` 重命名为 `.bak`，judge 判 "sealed files modified"。契约允许"字节保留在磁盘"，但 grader 的 sealed 判定与 salvage 机制的实际行为冲突（oracle 通过说明存在不触发重命名的解法）。
5. **静态题（S 系列）对提示词/评分改版敏感**：exp 提示取消卡片引用分后，同一答案在不同 grader 下波动最大（S4 −0.75、S1/S3 −0.40、S6 +0.50）； hands-on 题两分支评分高度一致。
6. H22（真实仓库迁移）两分支均 ~0.1，与历史（luna 0.08/0.11）一致；H24=0、H22≈0.1 为当前模型的稳定短板。

## 6. 提交规范与测试要求符合性

- 提交 `938ff23 feat(benchmark): isolate main-56 experimental grading and conditions` 符合仓库 conventional-commit 惯例（与 `docs(paper):`、`feat(benchmark):` 历史一致）；单 PR 单主题基本满足（评分隔离 + 条件材料 + 论文审计同属 main-56 主题）。
- EXPERIMENT-main56.md 要求"未经评审不得合并 main"——当前未合并，符合。
- 测试要求：`npm test`（含 verify/grading-validity/registry/contract/snapshots/paper/checkpoints/TOML/holdout 等全链）两分支通过；条件材料双校验和通过；oracle/nop 控制通过。修改运行时迁移事实还需 `npm run test:dsh`（Docker 隔离）——本次未跑（无相关 Skill 事实变更），PR 时若涉及需补。
- CONRIBUTING 要求 PR 描述列验证命令与未覆盖边界：本报告即验证证据。

## 7. 结论

实验分支的评分改版在本运行中表现良好：**对既有答案整体近乎中性（−0.028/题）**、**正确区分 verifier 错误与有效零分（H9 实证）**、静态题去掉引用分与提示词改版自洽。合并前必须解决：H23 两分支 grader 互判零分；建议评估 0.4 硬上限的精确匹配设计与 H24 sealed-file 判定。main 与实验分支的原始分数（41.05 vs 41.12）不可直接互换——分数应按 EXPERIMENT 文档保留各自协议版本。
