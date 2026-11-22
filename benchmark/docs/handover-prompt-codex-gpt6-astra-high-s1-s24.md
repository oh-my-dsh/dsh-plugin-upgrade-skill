你要在本地仓库 E:/deepseek-harness/dsh-plugin-upgrade-skill（upstream: https://github.com/oh-my-dsh/dsh-plugin-upgrade-skill）中，用 Codex + openai/gpt-6-astra（effort=high）执行 dsh-plugin-upgrade benchmark S 系列全部 24 题的 **solver 部分**——只收集产物，不做任何评分。

背景：这个 benchmark 是两段式的。Codex 这边只负责第一段（解题），评分（判卷）回到另一个 DSH 会话完成。所以你完全不需要 REPORT_JUDGE_* 环境变量、判卷 API、codex-judge.mjs——不要去碰评分相关的任何东西。

你的任务：
① git fetch upstream && git checkout main && git merge --ff-only upstream/main，记录 git rev-parse HEAD。
② 逐题（S1-static-scan 到 S24-dock-cotenant-crash-trap，共 24 题）读每题的 instruction.md，按 BENCHMARK-AUTH-v1 契约执行：只读任务不许改 fixture，报告写到指定的 agent-output/ 路径。
③ 产物按固定目录结构归档（参照 benchmark/results/artifacts/2026-10-12-step5-preview-s1-s24-r1/ 的布局）：
   benchmark/results/artifacts/<日期>-codex-gpt6-astra-high-s1-s24-r1/skill/<任务名>/fixture/     ← 原始 fixture 拷贝
   benchmark/results/artifacts/<日期>-codex-gpt6-astra-high-s1-s24-r1/skill/<任务名>/agent-output/ ← 你的报告产物
④ 写一个 run-manifest.json（参照 2026-10-12 那次的格式）：记录模型 ID、effort=high、Codex 版本、commit SHA、每题执行状态，judge_status 填 "NOT JUDGED — solvers only; judging deferred to DSH session"。
⑤ 注意：每题的 instruction.md 里的诱导性注释是陷阱（照做=死局），按自己的判断走；skill 条件 = 装了 plugin-upgrade skill 的环境（如果你无法注入 skill，如实记录在 manifest 的 notes 里）。
⑥ 完成后告诉我产物目录路径。不要尝试评分、不要运行 verifier、不要配置任何判卷环境变量。

关键参考文件：
- benchmark/docs/execution-contract.md — 任务契约（只读/产物边界）
- benchmark/results/artifacts/2026-10-12-step5-preview-s1-s24-r1/run-manifest.json — manifest 格式范例