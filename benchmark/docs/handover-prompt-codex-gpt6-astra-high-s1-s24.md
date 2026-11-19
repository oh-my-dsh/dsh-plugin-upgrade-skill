你要在本地仓库 E:/deepseek-harness/dsh-plugin-upgrade-skill（upstream: https://github.com/oh-my-dsh/dsh-plugin-upgrade-skill）中，用 Codex CLI + openai/gpt-6-astra（effort=high）跑 dsh-plugin-upgrade benchmark 的 S 系列全部 24 题（S1-static-scan 到 S24-dock-cotenant-crash-trap），产出每题得分与汇总报告。

先读交接文档 benchmark/docs/handover-codex-gpt6-astra-high-s1-s24.md——里面有全部背景。要点摘要：

1. S1–S24 共 24 题，全部是 BENCHMARK-AUTH-v1 只读任务（fixture 不许改，报告写到 /app/agent-output/）。
2. 判卷走宿主机 Codex 登录通道（零配置）：先 Harbor 关验证（或直接跑 solver）收集每题产物，再统一用 benchmark/report-judge/codex-judge.mjs --packet <task>/tests/packet.json --app <产物> --logs <评分输出> --model <判卷模型> --bin codex --effort high 判卷——复用 ~/.codex/auth.json，无需任何 API key。（仅当选择容器内 API 通道时才需 REPORT_JUDGE_* 三个环境变量。）判卷器故障记 evaluator failure 单列，绝不写成 0 分。
3. 上一次 Astra 完整跑分（2026-09-09 full56）用 xhigh，报告在 benchmark/results/validation-report-2026-09-09-codex-gpt-6-astra-xhigh-full56.md——本次是 high 档，不可与 xhigh 结果混表。
4. 执行参数沿用上一次：skill 只装 plugin-upgrade、bundled skills/plugins/apps/memories/web search 全关、agent/verifier 超时倍率 2/2、自动重试 0、最多 2 并发。

执行步骤：
① git fetch upstream && git checkout main && git merge --ff-only upstream/main，记录 git rev-parse HEAD。
② 确认 Docker 后端与 harbor CLI（≥0.22）可用、Codex 登录态正常。
③ 配置三个 REPORT_JUDGE_* 环境变量。
④ 先单题试跑 S1 验证链路：cd benchmark && harbor run tasks/S1-static-scan，检查 /logs/verifier/reward.txt。
⑤ 链路通后按 S2…S24 顺序批量跑（可写循环或用 Harbor 多任务编排）。
⑥ 汇总产出三件套到 benchmark/results/：validation-report-<今天日期>-codex-gpt-6-astra-high-s1-s24.{md,json,csv}。
⑦ 报告必须包含：commit SHA、Codex 版本、effort=high、判卷模型与协议版本、每题得分表、均分、满分题数、evaluator failure 单列。

注意：S 系列 fixture 里的诱导性注释是陷阱（照做=0 分）；判卷是独立 verifier 与被测模型分开；历史关键词分与语义分不可混用；不要重跑刷分（自动重试保持 0）。完成后把报告路径告诉我。