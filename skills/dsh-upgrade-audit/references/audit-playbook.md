# Audit Playbook（审计手册）

侦察派发模板、六面目标清单、报告骨架的参考文档。SKILL.md 负责阶段顺序，需要哪节读哪节。

## 六个标准侦察面

按区间规模合并或拆分（SKILL.md Phase 0）。目标是快路径；`files.txt` 或 `manifest-diff.txt` 显示清单没覆盖的面时，侦察应自行扩展。

| # | 侦察面 | 目标（源码模式） | 目标（npm 模式） |
|---|---|---|---|
| 1 | Core API | `packages/core/**`（session、agent、agent-loop、tools、system-prompt、scope）、`packages/util/**` 的 src：导出增删改名、签名变化、事件 map、工具 schema、系统提示词结构 | `dsh-session`、`dsh-agent*`、`dsh-tools`、`dsh-system-prompt` 等包的 `lib/types/*.d.ts`（类型面）+ `lib/*.js`（运行时常量）+ package.json |
| 2 | SDK & 线上协议 | `packages/sdk/**`、`packages/api/remotes`、`subagent-dsh-sdk`、`bundle/sdk-app`、`bundle/sdk-minimal`：JSON-RPC 方法、payload 字段（新增必填 = 线上破坏；删除 = 客户端破坏）、通知、协议常量、bundle 组成 | 对应 `dsh-sdk-*`、`dsh-api-remotes`、`dsh-subagent-dsh-sdk` 包的已发布 lib + 两棵树里 `dsh-headless`/`dsh-base` 等的 `cordis.patch.yml` |
| 3 | CLI & 配置 | `apps/cli`、`packages/boot/**`、`packages/bundle/**`、`packages/settings/**`、`packages/credentials/**`、`packages/preset/**`、`docs/config-catalog.md`、`.github/workflows/release.yml`：命令/flag/环境变量、schemastery 键（删改名 = 配置作者破坏）、默认值、preset 名册、发布流程 | `dsh` 包（bin、lib 内 commander 定义与 --help）、各 bundle 包 `cordis.patch.yml` diff、`dsh-settings`/`dsh-agent-presets` 的 lib、GitHub 富化的 release 相关 commit |
| 4 | Remote / BFF | `packages/api/gateway`、`packages/api/*-controller`、`packages/client/connection`、`packages/host/webserver`：流/journal/snapshot 事件、错误码词汇、HTTP 路由、连接状态机、鉴权流 | `dsh-api-gateway`、`dsh-api-*-controller`、`dsh-client-connection` 的已发布 lib：错误码常量、心跳默认值、事件名 |
| 5 | 会话数据 | `packages/session/**`、`packages/session-query/**`、`packages/core/session`、`session-format-guard.expected.e2e.ts`：两个格式守卫、迁移还是拒绝（读守卫代码，不读 README）、JSONL 编码、投影/查询/导出面 | `dsh-session` + 补充包 `dsh-session-persistence-sqlite` 的 lib 常量与 `resources/sql/`、`dsh-session-query*`、`dsh-session-log-export` |
| 6 | 回滚清查 | 全树：`git diff --name-status` 的 D/R（跳过测试/notes/i18n）、所有变更 `src/index.ts` 的导出删除、删掉的 CLI flag/配置键/preset/docs 章节；逐条归类「迁移了」还是「没了」 | `reverts.txt`（富化）+ `manifest-diff.txt` 全量过一遍：只在一棵树出现的包、exports/files/bin 收窄的包 |

## 侦察派发模板

一批并行发出。每个 prompt 都带 Phase 2 共享事实（格式守卫、回滚清单、Python 行）、本契约、及其侦察面目标。

```
# Goal
Audit external-compatibility changes between <from> and <to> in <repo/mode>. External = observable by consumers outside the repo.

# Constraints
- READ-ONLY. 源码模式用 `git diff <from>..<to> -- <paths>` 和 `git show <tag>:<path>`；npm 模式只读 `a/`、`b/` 两棵已发布树。不 build、不 test、不 lint。
- 每条发现分类：ADDED / REMOVED / CHANGED（before → after）/ RENAMED。REMOVED 放最前。
- 每条带 包/路径、符号或字段、变化类型、影响面类别（SDK 消费者 / CLI 用户 / 配置作者 / 会话数据 / 模型可见 / 协议对端 / web UI / npm 安装者）。
- 内部无关重构（私有 helper、测试、文档措辞）：聚合成一个计数，不逐条列。
- 不确定就说不确定；没读过的不要猜。

# Output
Markdown：`## <facade>` → `### REMOVED` / `### CHANGED` / `### ADDED`，结尾一行判定："External-compat delta: <low/medium/high> — <一句话>"。
```

## 核验规则（Phase 4）

侦察输出是线索，不是发现。进入报告前：

1. **存在性主张**：两个树上分别 `git ls-tree <tag> --name-only <dir>` 或 ls 两棵已发布树。报"新增"的包/导出必须在 `from` 侧不存在。
2. **删除主张**：`git show <to>:<path>` 或 `b/node_modules/...` 里不得再有该符号；找到替代品并点名，找不到就写「没了」。
3. **取值主张**（默认值、常量、schema 版本）：在两侧树里读常量本身。
4. **线上主张**（错误码、字段、路由）：diff 声明它的文件，不看 changelog。
5. 核验不了的删掉，或保留为 `[INFERENCE]` 并写明缺什么证据。

## UPGRADE-ADAPTATION.md 骨架

报告语言跟随用户；骨架如下（英文标题与 [examples/ 实例报告](../examples/0.1.2alpha1-to-0.1.2alpha2/UPGRADE-ADAPTATION.md) 一致）。

```markdown
# Upgrade Adaptation: <to> ← <from>

<一句话受众说明。工件清单。>

Range: `<from>` (<date>) → `<to>` (<date>). Release commit: `<sha>`. <N> commits total (<n> non-merge). <files> files changed, +<ins> / −<del>.
[npm 模式加一行：Mode: npm packages (resolved <va> -> <vb>), GitHub enrichment <status>]

History is merge-base-pure: `git merge-base <from> <to>` = <sha> = <from> itself. [不纯：停下解释漂移，不要继续。]

## Verdict
<直接回答比较性问题：破坏更多吗？有真回滚吗？与上一区间的密度对比。点名 1-3 个最重要事实。>

## 1. Reverts (rollbacks relative to <from>)
<每条 revert 一个编号项：sha、subject、方向变化、波及面。没有也要写"未发现"并说明查找方式。>

## 2..N. 破坏分节（按消费者影响排序）
<每面：REMOVED 在前，**BREAKING** + 消费者类别，before → after，替代品，**Adapt:** 行。确认安全的面各一行。>

## Confirmed unchanged (compatibility holds)
<成立的互操作：协议、CLI、JSONL 日志、模型可见契约。每行带证据。>

## Boundary-signature table
| API surface | <from> | <to> | changed? |
|---|---|---|---|
| package.json exports/files/bin/main maps | ... | ... | ... |
| SESSION_FORMAT_VERSION | ... | ... | ... |
| SQLite SCHEMA_VERSION | ... | ... | ... |
| SDK JSON-RPC wire | ... | ... | ... |
| Gateway/BFF error codes | ... | ... | ... |
| HTTP routes | ... | ... | ... |
| dsh CLI commands/flags | ... | ... | ... |
| Model-visible tool contracts | ... | ... | ... |
| Known session event vocabulary | ... | ... | ... |

## Adaptation checklist
<编号、祈使句、一条一个动作——上面点名的每类消费者一张迁移卡。>
```

## 报告约定

- "回滚"是方向性的：`from` 中存在、区间内被 revert 撤回的行为。修复性地恢复旧行为算；纯内部在途重构的 revert 不算，除非波及面跨出了某个侦察面。
- 影响面类别是报告的索引方案：每条破坏都要点名谁会破（SDK 消费者 / CLI 用户 / 配置作者 / 会话数据 / 模型可见 / 协议对端 / web UI / npm 安装者）。
- 边界签名表是记录摘要；正文分节是它的证据。表行与正文矛盾 = 报告有 bug。
- 密度对比：`tmp/<prev-pair>/commits.txt` 存在时，在 Verdict 里并排报两个区间的非合并 commit 数与破坏数；**按时间序**取紧邻前一对。npm 模式的历史报告可能只有 `manifest-diff.txt` 可比，如实说明。
- npm 模式富化的 `commits.txt` 受 GitHub compare API 限制：commit 列表最多 250 条（stats 里 `truncated: true`），大区间的回滚清单可能不全——报告须写明覆盖率；需要完整历史时改用源码模式，或按区间切片多次调用 compare。
- 与 `plugin-upgrade` 的版本变更卡片衔接：报告的边界签名表与 §1 回滚可直接作为卡片素材；给卡片补「实战批注」时引用报告目录路径，不凭记忆转述。
