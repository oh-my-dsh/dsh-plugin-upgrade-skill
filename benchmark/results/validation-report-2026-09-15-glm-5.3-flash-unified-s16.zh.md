# GLM-5.3-Flash 统一两臂 64-trial 跑：结果报告（2026-09-16）

对应 [workplan §5](../../paper/INVERTED-U-WORKPLAN.zh.md) 中间组行：GLM-5.3-Flash（历史中间组），
**检查统一评分后较高增益是否保留**；no-skill / with-skill，16 题 × 2 臂 × 2 次 = 64 trials。
冻结套件、抽样与排程见 [PROVENANCE](artifacts/2026-09-15-glm-5.3-flash-unified-s16/PROVENANCE.md)；
逐格配对数值见 [paired-analysis](artifacts/2026-09-15-glm-5.3-flash-unified-s16/paired-analysis.md)。

## 结论（先说答案）

**方向保留、幅度同量级、构成不稳定：统一评分下 GLM-5.3-Flash 的 skill 增益仍然为正，均值 Δ = +4.92 分
（no-skill 93.83 → with-skill 98.75），95% bootstrap CI [0.31, 10.86] 不含 0；但 16 题中 8 题双臂满分
（天花板），Wilcoxon p = 0.080（n=8），且逐题增益构成与历史明显不同。** 这支持"所测配置在该池上有正增益"
的弱主张，不支持逐题增益模式的稳定性主张；按 workplan 决策点 2/3 的口径，应报告天花板压缩与任务构成漂移，
不应宣称逐题规律复现。

## 二次评分复核后的结论边界

维护者对 5 份关键回答进行非盲 AI 二次审阅（不是人工审核），发现 S11 with-skill r1 的
路径检查 helper 漏判父目录边界，建议该单格 90 → 80。原始评分保留不覆盖。
仅作该项替换时，平均增益为 **+4.61**，相同 bootstrap 的 95% 区间为 **[−0.23, 10.63]**。
因此开头的原始区间不跨零对评分分歧并不稳健；论文只能称探索性正向点估计，不能将其单独作为稳健正效应证据。
范围、逐项理由和复算见 [关键回答复核](artifacts/2026-09-15-glm-5.3-flash-unified-s16/targeted-ai-review.zh.md)。

## 主要数字

| 指标 | 统一评分新跑 | 历史第一轮参考（不可混合） |
| --- | ---: | ---: |
| 任务数 | 16（S1–S22 分层抽取） | 22（全池） |
| no-skill 均分 | 93.83 | 78.0%（1716/2200） |
| with-skill 均分 | 98.75 | 84.3%（1855/2200） |
| 均值 Δ | **+4.92** | **+6.3pp** |
| Δ 的 95% CI | [0.31, 10.86] | 未计算 |
| 双臂满分题对 | 8/16（50%） | 7/22 |
| Wilcoxon（双侧） | p = 0.080 | — |

历史参考列来自 2026-09-11 跑（commit f32175d、旧 rubric、12 个语义题 GLM 自评）；
与本跑的统一 report-judge-v2 评分不同代际，只作描述性对照，不做推断。

## 逐题结果（两次重复均值）

| 任务 | no-skill | with-skill | Δ（统一） | Δ（历史参考） |
| --- | ---: | ---: | ---: | ---: |
| S1-static-scan | 57.5 | 100 | **+42.5** | −25 |
| S17-external-ui-plugin-onboarding | 80 | 95 | +15 | +20 |
| S6-corridor-net-state | 87.5 | 100 | +12.5 | +25 |
| S2-negative-scan | 90 | 100 | +10 | 0 |
| S5-negative-naming | 93.75 | 100 | +6.25 | +12 |
| S20-msvc-flock-trap | 97.5 | 100 | +2.5 | +5 |
| S12/S13/S14/S15/S19/S21/S22/S9 | 100 | 100 | 0 | 0～+20 |
| S11-mermaid-lazyload-trap | 95 | 90 | −5 | +20 |
| S18-terminal-sprite-render-trap | 100 | 95 | −5 | −40 |

正增益题对 6、负增益题对 2、零增益（饱和）8。**均值 Δ 高度依赖 S1 一题（+42.5）**：
去掉 S1 后其余 15 题的平均增益为 **+2.42**（36.25/15），"中间组增益"在统一评分下集中在个别低基线题，
其余题大多已无提升空间或小幅波动。

## 三个值得注意的构成变化

1. **S1 反转**：历史上有 skill 反而 −25（卡片误映射），本次 with-skill 两次均 100 分，
   with-skill 会话明确按 skill 的 corridor folding 规则处理了 A1-02↔A2-01；no-skill 均分仅 57.5
   （存在卡片编号与内容映射错误；两份无 Skill 回答也识别了删除后恢复的净状态，不应把差距全部归为折叠失败）。这直接挑战历史"S1 是 skill 退步题"的个案叙事。
2. **天花板压缩是最直观的候选解释，但不是唯一解释**：8/16 题对双臂满分（S13 的历史 +20 增益消失；S9 历史第一轮本来就是 0 增益），
   当前模型在该池的 no-skill 基线已远高于历史轮（93.8 vs 78.0）。但本跑同时改变了评分体系
   （统一 report-judge-v2）、judge 与执行方式，"增益萎缩主要由天花板造成"在现有证据下无法与
   这些因素分离，只能作为待检验解释报告，不能下定论。
3. **小幅负增益出现**（S11 −5、S18 −5，各为一次重复 90 vs 100）：两次重复内部方差的量级，
   与历史 S18 −40 的深度退步不可同日而语；在 n=2 下不构成稳定退步证据。

## 协议摘要

- 冻结：selection.json / schedule.json / execution-order.json（种子 20260915，确定性 `--check` 通过）。
- 两臂：no-skill = 空目录挂载 + 与 with-skill 完全相同的提示词；with-skill 仅多 `skills/plugin-upgrade/`
  （63 文件，树哈希 2b2d5b36…）作为工作区目录技能。提示词模板相同，工作区路径因格而异；模板未显式提及技能。
- 执行：每格一个全新 GLM-5.3-Flash 求解器会话（干净工作区 = instruction + fixture + agent-output），
  批内 2+2 双臂交错，每格 1 次尝试不重试；64/64 格全部产出报告，0 缺失、0 求解器基础设施失败。
- 评分：密封 report-judge-v2（同一 SYSTEM、judgeInput、fixture 完整性门、prompt-echo 检测、
  确定性 scoreDecisions 聚合），LLM 调用换成 GLM-5.3-Flash 子代理（盲臂，judge 每次只见一份报告）。
  64 格全部 scored，无 judge_error。
- 判分证据：每格的原始判分输出（含逐条 criterion 的 verdict 与 reason）与确定性聚合明细已提交在
  `judge/<arm>/r<repeat>/<task>/{verdict.json,details.json}`；judge 输入可由已提交的 packet + report 重建，
  details.json 含输入 sha256。修正记录：首轮驱动的参数解析缺陷把 judgeModel 字段写成了 argv[0]（'apply'），
  现已按传输定义恢复为 GLM-5.3-Flash 并在每个评分记录中保留修正说明（judgeModelNote）。
- 资源：仅计执行日志中 64 条正式 solver 记录（排除 4 条 pilot）；`subagent_tokens` 是
  runner 报告的用量字段，未区分输入、输出、缓存及累计口径，不能解释为计费 token 或与历史 input token 直接比较。

  | 正式 solver | 格数 | subagent_tokens 合计 | 单格时长范围（秒） | 单格时长求和（秒） |
  | --- | ---: | ---: | ---: | ---: |
  | no-skill | 32 | 3,185,993 | 128–894 | 9,446 |
  | with-skill | 32 | 12,320,379 | 140–1,031 | 11,450 |

  该字段合计比为 **3.87×**，单格时长求和比为 **1.21×**；均为描述性资源统计，未做时长显著性检验。
  并发执行下的单格时长求和不是整个实验的墙钟耗时。日志未提供逐格 judge 用量/时长，
  因而不能从提交产物验证原稿中的“judge 43–294 秒”，也不能算含评分的总成本。
  历史“2.2×”不由本次记录验证，不再宣称复现该数值。原始字段见
  [execution-log](artifacts/2026-09-15-glm-5.3-flash-unified-s16/execution-log.jsonl)。

## 局限（全部如实披露）

1. **judge 与 solver 同族**（均为 GLM-5.3-Flash，用户指定全 GLM 方案）。workplan 明确不建议
   GLM 自评关键结果；本报告的逐格 judge 只能视为同一评分体系下的相对比较，绝对分值有同族偏置风险。
2. **模型身份仅到 harness 声明级**：solver/judge 均为 ZCode 会话报告的
   `builtin:bigmodel-coding-plan/GLM-5.3-Flash`（bigmodel 网关），无法独立探测服务端模型标识
   （OAuth 网关不暴露 /models；本机无独立 API key）。不符合 workplan"端点身份核验"的理想标准。
3. **无 Docker 隔离**：求解器为宿主上的子代理（指示只读工作区），隔离弱于 Harbor 容器；
   污染审计（64 份报告）未发现密封材料引用或判分语言泄漏。
4. **回顾性探索**：非预注册确认性检验；历史列为不同评分代际，不可混合；单配置两臂，
   不支持任何能力梯度结论。
5. 抽样盲选（只读元数据）但排除集含历史高增益题 S4/S16；抽样种子先于全部求解存在（见 git 历史），
   不存在按结果调样本的可能。

## 产物清单

| 产物 | 路径 |
| --- | --- |
| 冻结抽样 | `selection.json`（脚本 `benchmark/scripts/select-unified-sixteen.mjs`） |
| 排程/执行序 | `schedule.json` / `execution-order.json` |
| Harbor 配置（未使用，保留） | `harbor/*.config.json` |
| 原始报告（64） | `reports/<arm>/r<repeat>/<task>/report.md` |
| 逐格评分（64） | `scores/<task>__<arm>__r<repeat>.json` |
| 聚合/配对分析 | `aggregate.json` / `paired-analysis.json` / `paired-analysis.md` |
| 执行日志 | `execution-log.jsonl` |
| 预演（不进统计） | 本机 `~/.cache/dsh-unified-run-evidence/2026-09-15-glm-5.3-flash-unified-s16-trials/pilot/`（不进仓库；S4 87.5→100、S10 100/100） |
| 分析脚本 | `benchmark/scripts/analyze-unified-paired.mjs` 等 `*unified*` 系列 |
