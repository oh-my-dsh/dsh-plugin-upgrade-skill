# 交接文档：Codex + GPT-6 Astra (high) 跑 S1–S24 Benchmark

> 写给：在 Codex 里执行本次评测的 agent（或未来的你）。
> 仓库已在本地：`E:/deepseek-harness/dsh-plugin-upgrade-skill`（upstream: https://github.com/oh-my-dsh/dsh-plugin-upgrade-skill）。

## 一、本次任务是什么

在 **Codex CLI（0.153.x）+ openai/gpt-6-astra + effort=high** 下，把 dsh-plugin-upgrade-skill 仓库中的 **S 系列全部 24 题**（S1–S24，纯静态/文书类任务）各跑一次（with-skill 条件），产出 per-task 得分与汇总报告。

注意：上一次完整 Astra 跑分（2026-09-09, full56）用的是 **xhigh**；本次是 **high**，属于新的 effort 档位数据点，不可与 xhigh 结果混表比较。

## 二、S 系列关键事实（先记住这些）

1. **共 24 题**：`benchmark/tasks/S1-static-scan` … `S24-dock-cotenant-crash-trap`。全部是**只读/文书**类（BENCHMARK-AUTH-v1 契约：不改 fixture，只写报告到 `/app/agent-output/`）。
2. **判卷**：S1–S24 全部默认 **LLM-as-judge**（report-judge-v2 协议，task version 4.0.0/4.1.0）。判卷模型是**独立的 verifier**，与被测模型分开；判卷挂了=评测器故障，**绝不允许**回落到关键词计分。
3. **判卷有两条通道**（report-judge-pilot.md）：
   - **通道 A·宿主机 Codex 登录判卷（推荐，零配置）**：两段式——Harbor 关验证跑 solver 收集产物 → 宿主机 `node benchmark/report-judge/codex-judge.mjs --packet benchmark/tasks/<task>/tests/packet.json --app <产物目录> --logs <评分输出> --model <判卷模型> --bin codex --effort high`。复用 `~/.codex/auth.json` 登录态，**无需任何 API key 或环境变量**。
   - **通道 B·容器内 API 判卷**：`harbor run` 直接跑注册任务时，task.toml 的 `[verifier.env]` 透传 `REPORT_JUDGE_BASE_URL/MODEL/API_KEY`——三个都必须配好，缺一个 verifier 直接失败。仅当你有独立的判卷 API 端点时选这条。
4. **分数语义**：每题 0–100（Harbor reward 0–1 = score/100）。语义分（v4）**不可**与历史关键词分混用。
5. **陷阱设计**：fixture 里有诱导性注释（照做=死）、与升级无关的预存失败测试（考验诚实报告）。被测 agent 被误导/谎报都会扣分。

## 三、上一次 Astra xhigh 跑法（可复用的执行参数）

来源：`benchmark/results/validation-report-2026-09-09-codex-gpt-6-astra-xhigh-full56.md`

- Codex **0.153.4**，`openai/gpt-6-astra`，effort **xhigh**（本次改 high）
- Harbor **0.22.0** 管容器与原厂验证
- **skill 条件**：只装 `plugin-upgrade`；bundled skills/plugins/apps/memories/web search 全关
- 冻结任务/判卷源：commit `72267b6`（本次如无特殊理由，跑当前 main 即可，但报告中必须记录本次 commit SHA）
- Agent/verifier 超时倍率 2/2，setup 4，自动模型重试 0
- 并发：最多 2 个模型同时跑、6 GiB 预算
- H11 有 task-pinned skill snapshot；S 系列无 pin，用主 snapshot

## 四、执行步骤（建议顺序）

### 准备
1. `cd E:/deepseek-harness/dsh-plugin-upgrade-skill && git fetch upstream && git checkout main && git merge --ff-only upstream/main`，记录 `git rev-parse HEAD`。
2. 确认 Docker/容器后端可用（Harbor 需要容器环境；Windows 上通常是 Docker Desktop + WSL2）。
3. 确认 `harbor --version`（≥0.22）；Codex 登录态可用。
4. 配好三个 `REPORT_JUDGE_*` 环境变量（判卷模型建议与被测模型不同家族，避免自评偏置；上一次跑分用的判卷配置见 report-judge 文档）。

### 跑题
5. 单题试跑（先 S1 验证链路通）：
   ```
   cd benchmark
   harbor run tasks/S1-static-scan
   ```
   （具体 CLI 语法以 `harbor run --help` 为准；env 从 shell 继承。）
6. 链路通后，S2–S24 批量跑。可以写个循环脚本按序执行，或用 Harbor 的多任务能力（参考上一次跑分的 2-worker 编排）。
7. 每题结束检查 `/logs/verifier/reward.txt` 存在且 verifier 没报 evaluator failure。

### 汇总
8. 产出三件套（沿用 results/ 目录惯例）：
   - `validation-report-YYYY-MM-DD-codex-gpt-6-astra-high-s1-s24.md`
   - 同名 `.json`（per-task：task/score/reward/notes）
   - 同名 `.csv`
9. 报告必须包含：本次 commit SHA、Codex 版本、effort=high、判卷模型与协议版本、每题得分表、均分、满分题数、evaluator failure 单列（不顶替、不剔除分母，除非判卷器自身故障——那样也须如实报告）。
10. **不要**把 high 的均分与 xhigh/其他模型的小集合均分直接排名——历史 snapshot/判卷器不同。

## 五、坑位清单（前面跑分踩过的）

- **判卷器故障 ≠ 0 分**：如果 verifier 报 judge 相关错误，该题记 evaluator failure 并单列，不许写成 0 分混进均分。
- **H8 悬空符号链接**：那是 H 系列的坑，S 系列不涉及，但如果你扩展跑 H 系列要注意。
- **skill 注入**：with-skill 条件下 `plugin-upgrade` skill 必须真的装进 agent 环境（audit 脚本可查激活情况：`benchmark/scripts/audit-skill-activation.mjs`）。
- **自动重试 0**：上次配置就是 0，保持一致，避免「重跑刷分」污染数据。
- **S 系列是只读任务**：如果 agent 改了 fixture，该题直接 0 分（sealed fixture 校验会抓到）。
- **Windows 主机**：Harbor 容器在 Docker Desktop 里跑；路径挂载注意 E: 盘在 WSL2 里的可见性（必要时先 `git clone` 到 WSL 文件系统再跑）。

## 六、相关文件索引

| 文件 | 内容 |
|---|---|
| `benchmark/README.md` | benchmark 总览 + Harbor 格式说明 |
| `benchmark/docs/execution-contract.md` | BENCHMARK-AUTH-v1 契约（只读/动手边界） |
| `benchmark/docs/scoring.md` | 计分规则 + 每题 checkpoint 映射 |
| `benchmark/docs/report-judge-pilot.md` | 判卷协议 report-judge-v2 说明 |
| `benchmark/docs/diagnosis-rubrics.md` | 12 道事故题（4.1.0）判卷细则 |
| `benchmark/results/validation-report-2026-09-09-codex-gpt-6-astra-xhigh-full56.md` | 上一次 Astra xhigh 完整跑分报告（执行参数的权威来源） |
| `benchmark/scripts/audit-skill-activation.mjs` | skill 激活审计 |
| `benchmark/scripts/summarize-runs.mjs` | 结果汇总脚本 |
