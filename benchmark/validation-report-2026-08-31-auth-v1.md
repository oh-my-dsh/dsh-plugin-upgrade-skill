# benchmark v2.1 · Codex + plugin-upgrade 真实验证报告

> 验证日期：2026-08-31（Asia/Shanghai）
>
> 验证协议：`BENCHMARK-AUTH-v1`
>
> 被测 agent：Codex 0.151.0，`openai/gpt-5.6-sol`，`reasoning_effort=xhigh`
>
> 被测 skill：仓库原始 `skills/plugin-upgrade/`，测试前后均未修改
>
> 结论先行：**6 道题均取得 verifier 100/100、reward 1.0；有效试次均值 1.000。**

范围说明：本报告记录的是仓库 HEAD `40a3f108441a` 上当时已有的 6 道题。之后上游
`main` 新增了 S3-snapshot-migration 和 H4-tsbuildinfo-trap；它们不在本报告的实跑成绩
内，也未被本文的“6/6”覆盖。本次 PR 只为两道新题补齐同版本授权契约和静态校验。

## 一、结论口径

本次不是 oracle 自检，而是把本仓库的 `plugin-upgrade` skill 真实挂给 Codex，令其在
Harbor 的全新 Docker trial 中读取题面、制定计划、修改或扫描 fixture，并由每题自带的
verifier 在同一容器内判分。

最终有效结果为：

- 主批次中 5 道进入 agent/verifier 的题全部通过；
- H3 首次在环境构建阶段因 Docker Hub TLS handshake timeout 未启动 agent；
- H3 随后以完全相同的 agent、模型、skill 和超时配置单题补跑，通过；
- 合并 6 个有效试次后：**6/6 通过，600/600，平均 reward 1.000**；
- 没有用旧报告、oracle 输出或历史 trial 补成绩。

Harbor 主批次原始均值是 0.833，因为它把 H3 的镜像拉取异常计入了 6 题分母。本文的
“6/6”是 5 个主批有效试次加 1 个 H3 同配置补跑试次；两层口径分别保留，不把基础设施
异常伪装成一次性全绿主批。

## 二、环境与执行配置

| 项目 | 实际值 |
| --- | --- |
| 仓库 HEAD | `40a3f108441a` |
| 当前分支 | `docs/plugin-upgrade-client-runtime-api-guide` |
| Harbor | 0.22.0 |
| Docker | client 29.7.2 / server 29.7.2 |
| 题目环境 | Docker；实操题使用 `node:24-bookworm` 与 `@deepseek-ai/dsh@0.1.2-alpha.2` |
| agent | Codex 0.151.0 |
| 模型 | `openai/gpt-5.6-sol` |
| 推理强度 | `xhigh` |
| skill | `./skills/plugin-upgrade` |
| 授权协议 | 6 题均为 `BENCHMARK-AUTH-v1` |
| 并发 | 3 个 trial；Codex agent 并发上限 3 |
| agent 超时 | 题目默认值的 3 倍，即 900 秒 |
| 导出资产 | `/app/fixture`、`/app/agent-output` |

主批次实际命令：

```sh
/private/tmp/dsh-plugin-upgrade-uv-cache/archive-v0/uQQ6k0y5JkgEljkkqXGUZ/bin/harbor run \
  -p benchmark/tasks \
  -a codex \
  -m openai/gpt-5.6-sol \
  --skill ./skills/plugin-upgrade \
  --ak reasoning_effort=xhigh \
  --ae CODEX_FORCE_AUTH_JSON=true \
  --artifact /app/fixture \
  --artifact /app/agent-output \
  --n-concurrent 3 \
  --n-concurrent-agents 3 \
  --agent-timeout-multiplier 3 \
  --job-name codex-plugin-upgrade-all6-auth-v1-rerun-15m-20260831 \
  -y
```

H3 补跑只把 `-p` 改为 `benchmark/tasks/H3-client-plane`、并发改为 1，其他 agent、
模型、skill、授权、资产和超时配置保持一致。

执行前静态门禁：

```text
Execution-contract validation OK: 6 tasks use BENCHMARK-AUTH-v1
```

## 三、六题有效结果

| 题目 | 有效 trial | trial 墙钟时间 | verifier 关键证据 | reward |
| --- | --- | ---: | --- | ---: |
| S1-static-scan | `S1-static-scan__LbnKi7n` | 约 16m28s | fixture 零改动；读取 305 行报告；命中所需卡片并正确折叠 `DSH-0.1.2-A1-02` → `DSH-0.1.2-A2-01` | 1.0 |
| S2-negative-scan | `S2-negative-scan__GYnXmPG` | 约 11m24s | 报告将唯一 #3 命中映射到 `DSH-0.1.2-A1-01`；交代六类零命中；明确零命中不等于兼容并要求真实验证 | 1.0 |
| M1-host-migration | `M1-host-migration__KVw7Ruz` | 约 10m56s | fixture 已修改；`dsh plugin add` 成功；冷启动无 pending，推进至宿主应用层 | 1.0 |
| H1-plane-trap | `H1-plane-trap__r2JCS6h` | 约 13m58s | 未被注释误导到 client `remote`；改用 Host `llm` 注入；安装及冷启动激活成功 | 1.0 |
| H2-baseline-trap | `H2-baseline-trap__745Q48u` | 约 13m52s | 预存失败测试文件未触碰；报告正确归因；迁移后冷启动成功 | 1.0 |
| H3-client-plane | `H3-client-plane__KQoJfzh` | 约 15m53s | 顶层 `dsh.client.platform=web`；安装成功；宿主半边无 pending；真实 `__DSH_BOOT__.entries` 含插件 | 1.0 |

### S1-static-scan

Codex 明确把题目当成只读扫描，不安装、不执行 fixture，只把报告写到许可的输出目录。
verifier 读取到：

```text
S1-static-scan/touchpoint-report.md（305 行）
score=100/100
fixture 未被修改
```

轨迹还显示 agent 没有直接照抄 planner 的候选卡集合，而是人工剔除同触点下不适用的卡，
并按最终目标版本处理 `SessionEvent.ignorable` 的走廊恢复。

### S2-negative-scan

Codex 将唯一真实命中收敛为旧 Host `apiProxy`，映射到
`DSH-0.1.2-A1-01`；没有把普通 Cordis composition、字符串或文件名误报成其他六类
触点。报告同时列出扫描范围、未命中类别、残余不确定性和迁移后的真实验证梯度。

```text
S2-negative-scan/report.md（122 行）
score=100/100
```

### M1-host-migration

Codex 先复现 `pending (waiting for service: apiProxy)`，再把 Host 平面插件迁到 `llm`
领域服务并移除死依赖。全新隔离 profile 重新安装后，入口激活并成功调用
`llm.listProviders()`；隔离环境返回空目录不等于调用失败。

verifier 独立重装后的结论是 `dsh plugin add` 成功、插件树无 pending；后续
`MISSING_CREDENTIAL` 发生在宿主应用层，属于无 key 环境的预期边界。

### H1-plane-trap

题目中的社区备忘注释诱导把注入名直接换成 client 平面的 `remote`。Codex 在计划阶段就
指出这是平面错误，最终选择 Host 平面的 `llm` 注入与 `listProviders()`。verifier 检查了
实际代码、独立安装和冷启动，均通过。

### H2-baseline-trap

Codex 在任何迁移修改前先运行 baseline，记录唯一预存失败的测试名、错误类型和
actual/expected；迁移后同一失败指纹保持不变，测试文件 SHA-256 未变。它没有为了制造
“全绿”去改测试。

```text
H2-baseline-trap/migration-report.md（114 行）
score=100/100：baseline 归因 60 分 + 冷启动 40 分
```

### H3-client-plane

Codex 先复现“宿主半边激活，但真实页面启动图没有插件”的基线，再补齐顶层
`dsh.client` 声明、client factory/注入和 RemoteResult 处理。补跑中完成了：

1. `dsh plugin add` 与 composed config 检查；
2. `dsh web --no-open --port 0` 真实冷启动；
3. 用真实 token URL 换取 Cookie；
4. 从页面读取 `__DSH_BOOT__.entries`；
5. 请求宿主公告的插件资源并确认 HTTP 200；
6. 执行服务器实际下发的 bundle，验证 factory、Cordis 注入、插件 DOM 标记与 Remote
   成功流。

容器没有 Chromium、Firefox、Playwright 或 Puppeteer，所以 agent 没有声称做过完整 GUI
自动化；verifier 的正式满分边界是启动图名册识别，已满足。

## 四、无人值守授权与 skill 使用审计

6 个有效轨迹的第一阶段都识别到题面的授权语义：先做只读盘点和计划，然后直接执行，
没有停在“请用户再次确认”。典型轨迹表述包括：

- H1：题面已明确授权，计划后不等待二次确认；
- H2：无人值守授权覆盖 skill 通常要求的方案确认；
- M1：形成具体迁移计划后直接实施；
- S1/S2：只读 fixture，只写指定报告目录；
- H3：授权覆盖 fixture 写入确认，随后执行安装和 Web 冷启动。

授权没有放宽题目边界：S1/S2 的容器内 Git/verifier 证明 fixture 零改动；H2 的预存失败
测试未被触碰；实操题只修改题目 fixture，并只创建隔离本地验证资产。仓库本身的
`skills/` 目录在本次测试前后无 diff。

## 五、原始任务与补跑记录

### 1. 300 秒校准批次：作废，不计成绩

首次按题目默认 agent 超时启动后，S1 在 300.0 秒处触发 `AgentTimeoutError`。轨迹显示它
已经完成 skill/走廊读取和人工复核，但尚未来得及写报告，因此 verifier 按“缺报告”给 0。
确认是 runner 时间预算不足后，主动终止该批：H1、M1、H2 为 `CancelledError`，S2、H3
尚未开始。该批不进入本文 6 题成绩。

```text
jobs/codex-plugin-upgrade-all6-auth-v1-rerun-20260831/
job id: 20e1a96f-3c50-4c94-b960-9210479df1df
```

### 2. 权威主批：5 题通过，H3 环境构建异常

```text
jobs/codex-plugin-upgrade-all6-auth-v1-rerun-15m-20260831/
job id: 9ce7ee7e-1dfa-4dac-bf8f-1856c59aa099
Harbor 原始统计：5 个 reward=1.0，1 个 RuntimeError，mean=0.8333333333
```

H3 首次异常发生在 environment build，agent token 数为 0，错误为：

```text
node:24-bookworm: failed to resolve source metadata
Head https://registry-1.docker.io/v2/library/node/manifests/24-bookworm
net/http: TLS handshake timeout
```

这不是题目、skill 或 agent 的语义失败。

### 3. H3 同配置补跑：通过

```text
jobs/codex-plugin-upgrade-h3-auth-v1-rerun-15m-20260831/
job id: 21b83720-43ad-40d5-bb0e-ac45b3bbfc7e
trial: H3-client-plane__KQoJfzh
reward=1.0，exception=0，mean=1.000
```

## 六、资源消耗

| 口径 | input tokens | cache tokens | output tokens | cost USD |
| --- | ---: | ---: | ---: | ---: |
| 权威主批 | 8,689,381 | 8,107,776 | 70,477 | 6.9790704 |
| H3 有效补跑 | 4,069,308 | 3,925,504 | 18,966 | 2.5247376 |
| 6 个有效试次合计 | 12,758,689 | 12,033,280 | 89,443 | 9.5038080 |
| 作废的 300 秒校准批次 | 3,151,028 | 2,860,544 | 22,230 | 2.7507536 |
| 本次实际总消耗 | 15,909,717 | 14,893,824 | 111,673 | 12.2545616 |

权威主批墙钟时间 26m03s；H3 补跑 15m53s。由于主批 3 并发，不能把逐题墙钟时间直接
相加当作批次耗时。

## 七、证据与资产

权威结果入口：

```text
jobs/codex-plugin-upgrade-all6-auth-v1-rerun-15m-20260831/result.json
jobs/codex-plugin-upgrade-h3-auth-v1-rerun-15m-20260831/result.json
```

每个有效 trial 均保留：

```text
agent/codex.txt
agent/trajectory.json
verifier/test-stdout.txt
verifier/reward.txt
artifacts/manifest.json
artifacts/app/fixture/
```

M1、H2、S1、S2 还成功导出了题目要求或 agent 自愿生成的报告：

```text
M1-host-migration__KVw7Ruz/artifacts/app/agent-output/M1-host-migration/report.md
H2-baseline-trap__745Q48u/artifacts/app/agent-output/H2-baseline-trap/migration-report.md
S1-static-scan__LbnKi7n/artifacts/app/agent-output/S1-static-scan/touchpoint-report.md
S2-negative-scan__GYnXmPG/artifacts/app/agent-output/S2-negative-scan/report.md
```

H1、H3 没有题目必需的 `/app/agent-output`，所以 artifact manifest 将该可选路径记为
`failed`；两题的 fixture 导出均为 `ok`，不影响 verifier 结果。

### Harbor 清洗副作用

本次通过 `--ae CODEX_FORCE_AUTH_JSON=true` 传入的值 `true` 被 Harbor 当作 secret 值。
下载日志、trial `result.json` 和导出 fixture 时，所有同字面量的 `true` 都被替换成
`[REDACTED]`，使部分下载后的 JSON 不再可直接解析，也使导出 fixture 不再是逐字节副本。

这不影响判分：每题 verifier 在容器内、资产下载和清洗之前运行，S1/S2 的零改动与所有
实操题的安装/冷启动都由容器内状态判定。审计下载产物时则应以 verifier、轨迹和
artifact manifest 为准，不能对被清洗的 fixture 做字节级 diff。

## 八、结论与后续建议

**本轮 Codex + 原始 `plugin-upgrade` skill 在 `BENCHMARK-AUTH-v1` 下通过全部 6 道真实
benchmark：有效成绩 6/6、mean 1.000。**

这轮证明的是“with-skill 单次可完成性”，还不能单独证明 skill 的统计净增益。正式比较
skill 效果时仍应：

1. 用相同题面、agent、模型和授权协议跑 without-skill 对照；
2. 每个条件至少重复 3 次，报告中位数、离散度和基础设施异常；
3. 对 Codex `xhigh` 明确设置不少于 900 秒的 agent 上限；
4. 对 Docker registry 的 TLS/拉取异常配置有限重试；
5. 避免把常见源码字面量（如 `true`）作为会进入 Harbor secret 清洗表的环境变量值，或在
   采用等价值前先验证 Codex 兼容性。
