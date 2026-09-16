# 运行手册：GLM-5.3-Flash 统一两臂 64-trial 跑（workplan §5 中间组行）

对应 [workplan §5](../../paper/INVERTED-U-WORKPLAN.zh.md)：历史中间组 GLM-5.3-Flash，
no-skill / with-skill，16 题 × 2 臂 × 2 次 = 64 trials，统一评分。冻结产物见
`benchmark/results/artifacts/2026-09-15-glm-5.3-flash-unified-s16/`（含 PROVENANCE）。

## 0. 前置校验（每次开跑前）

```sh
git checkout experiment/glm53flash-unified-64
git rev-parse HEAD   # 必须是 PROVENANCE 记录的 commit
node benchmark/scripts/select-unified-sixteen.mjs --check
node benchmark/scripts/generate-unified-run-schedule.mjs --check
node --test benchmark/scripts/unified-run-kit.test.mjs
```

## 1. 端点身份核验（workplan 硬性要求）

GLM-5.3-Flash 经 Z.ai 的 Anthropic 兼容端点调用。开跑前先发一个探测请求，
把服务端返回的模型标识原样记入 PROVENANCE：

```sh
export ZAI_API_KEY=<用户的 ZAI API key>
curl -s "$ZAI_BASE_URL/v1/models" -H "Authorization: Bearer $ZAI_API_KEY" | jq '.data[].id'
# 以及一次最小 chat 调用，记录响应里的 served model 字段与时间
```

不能仅凭客户端别名认定模型身份（workplan §5）。

## 2. 生成本地凭据配置（不入库）

```sh
node benchmark/scripts/generate-unified-run-schedule.mjs --local
# 读取 ZAI_API_KEY / ANTHROPIC_AUTH_TOKEN / ZAI_BASE_URL(默认 https://api.z.ai/api/anthropic)
# 生成 harbor/*.config.local.json（已 gitignore）
```

## 3. 预演（不进正式统计）

```sh
harbor run --config benchmark/results/artifacts/2026-09-15-glm-5.3-flash-unified-s16/harbor/r1-noskill-a.config.local.json
harbor run --config benchmark/results/artifacts/2026-09-15-glm-5.3-flash-unified-s16/harbor/r1-withskill-a.config.local.json
```

检查：无 timeout 撞顶、吞吐/限流正常、with-skill 会话确实打开过 SKILL.md
（`audit-skill-activation.mjs`）。若预算策略需要调整：先以提交形式改
`task.toml` 超时（两臂同改），重新生成排程并 `--check`，然后**从头跑正式 64 格**
（预演的 16 格计入正式结果，前提是预算策略与正式一致）。

## 4. 正式跑（按 schedule.json 顺序）

```sh
for job in r1-noskill-a r1-withskill-a r1-noskill-b r1-withskill-b \
           r2-withskill-b r2-noskill-b r2-withskill-a r2-noskill-a; do
  harbor run --config ".../harbor/$job.config.local.json"
done
```

每格 1 次尝试，不重试；失败/异常格保留现场，stop reason 原样记录。

## 5. 收集报告

把每个 trial 的最终 `report.md` 放入：

```
.../2026-09-15-glm-5.3-flash-unified-s16/reports/<arm>/r<repeat>/<task-id>/report.md
```

## 6. 统一评分（两臂同一 judge，盲臂）

```sh
export REPORT_JUDGE_BASE_URL=... REPORT_JUDGE_MODEL=... REPORT_JUDGE_API_KEY=...
node benchmark/scripts/grade-unified-run.mjs      # 逐格评分 + aggregate.json
```

- 每格 staging 复刻任务 Dockerfile（fixture + git baseline + 单份 report）。
- judge 每次只看一份报告，天然盲臂。
- 基建类 judge 错误可重跑该格评分；不得重跑 solver。
- judge 家族与 solver 的关系、模型名如实记入 PROVENANCE（workplan：不让 GLM
  给自己的关键结果单独定分——若 judge 也是 GLM 家族，须在报告中披露该局限）。

## 7. 分析

```sh
node benchmark/scripts/analyze-unified-paired.mjs
```

输出 `paired-analysis.json/.md`：任务等权 Δ、bootstrap 95% CI、Wilcoxon、
饱和/地板任务数、与历史第一轮的并列参考（标注不可混合）。结论模板：

- 若 Δ 的区间明显大于 0 且与历史 +6.3pp 同量级 → "统一评分下中间组增益保留"。
- 若区间跨 0 或大幅缩水 → 如实报告衰减，不调标签、不挑任务。

## 8. 收尾提交

分阶段提交：冻结套件（本次）→ 端点核验记录 → 原始 reports → scores/aggregate
→ paired-analysis + 报告更新。每阶段 `--check` 保持绿色。

## 维护者复核说明

已提交 Harbor 配置是带 `<repo-root>` 占位符的便携模板；执行前须通过 `--local` 生成当前机器的挂载路径。
实际已完成的是 ZCode 宿主子会话运行，不是本页 Harbor 命令的执行记录；其 pilot 与预算差异以结果报告披露为准。
GLM-5.2 冻结 kit 的核查使用 `UNIFIED_RUN_DIR=2026-09-16-glm-5.2-unified-s16 UNIFIED_MODEL=GLM-5.2`（保持冻结的大小写）。
关键回答的非盲 AI 复核发现评分敏感性，见
[复核记录](../results/artifacts/2026-09-15-glm-5.3-flash-unified-s16/targeted-ai-review.zh.md)。
