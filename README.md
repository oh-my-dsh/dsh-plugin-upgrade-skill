# DSH Plugin Upgrade Skill

**简体中文** | [English](README.en.md)

[![arXiv](https://img.shields.io/badge/arXiv-2609.30120-b31b1b.svg)](https://arxiv.org/abs/2609.30120) [![License: MIT](https://img.shields.io/badge/License-MIT-green.svg)](LICENSE) ![Skills](https://img.shields.io/badge/skills-11-blue) ![Upgrade cards](https://img.shields.io/badge/upgrade%20cards-198-blue) ![Benchmark](https://img.shields.io/badge/benchmark-63%20tasks-blue)

**教 AI 帮你升级 DSH 插件的 skill 集合**，社区共建。

[DSH（DeepSeek Harness）](https://github.com/deepseek-ai/deepseek-harness) 是一个"所有功能都以插件形式存在"的 AI 运行框架。麻烦在于：**DSH 每次发新版，老插件就可能启动不了**。本仓库把已知的坑整理成 AI 读得懂的升级手册，让 Claude Code、Codex、Gemini 等 agent 帮你把插件安全迁到新版本，并用一套公开的 benchmark 检验这件事到底有没有做对。

> 📄 **论文**：[Evaluating Agent Skills for Version-Specific Plugin Migration: A Retrospective Study](https://arxiv.org/abs/2609.30120)（arXiv:2609.30120）。评估方法与主要发现见[论文](#论文)一节。

## 这个仓库里有什么

- **198 张升级说明卡**：每张卡记录一个真实的坑——什么坏了、为什么坏、怎么修、信息来自哪个版本。按版本走廊排好序，覆盖 0.1.0-rc.8 → 0.2.0-rc.2（其中 0.1.7-rc.1 → 0.1.7-rc.2 一段尚未成卡），每条边的卡数与状态见下方[覆盖表](#升级卡覆盖到哪个版本了)。
- **13 条通用对策**：与具体版本无关的坑（先备份、新旧共存、启动卡死怎么办等），集中在一份清单里。
- **11 个 skill**：统一工作流负责选择与编排，另外九个分别负责查升级、写插件、测插件、发插件、对比两个版本、排查运行时故障、接入重依赖、宿主升级后巡检整批已装插件、把升级经验提取成考题；还有一个不含 DSH 专有知识的通用迁移方法论，用作对照实验的控制组。
- **63 道自动判分的考题（benchmark）**：22 道静态诊断、14 道混合、27 道实操，其中包含 dsh-web 与 dsh-data-agent 两次真实迁移。
- **一篇论文和完整的评估证据**：从原始回答、逐条评分到跨模型复评全部公开可复算，见下方[论文](#论文)。

## 快速开始

### 使用 skills CLI（推荐）

一条命令装到它支持的 agent：

```bash
npx skills add oh-my-dsh/dsh-plugin-upgrade-skill
```

### Claude Code

**Marketplace 安装**：

```bash
/plugin marketplace add oh-my-dsh/dsh-plugin-upgrade-skill
/plugin install dsh-plugin-upgrade-skill
```

> **SSH 错误？**如果没有配置 GitHub SSH 密钥，使用 HTTPS URL：
> ```bash
> /plugin marketplace add https://github.com/oh-my-dsh/dsh-plugin-upgrade-skill.git
> /plugin install dsh-plugin-upgrade-skill
> ```
**本地/开发模式**：

```bash
git clone https://github.com/oh-my-dsh/dsh-plugin-upgrade-skill.git
claude --plugin-dir /path/to/dsh-plugin-upgrade-skill
```

### Codex

先添加 marketplace，再在 Codex 的插件界面中安装/启用该插件：

```bash
# GitHub marketplace
codex plugin marketplace add oh-my-dsh/dsh-plugin-upgrade-skill

# 本地开发 marketplace
git clone https://github.com/oh-my-dsh/dsh-plugin-upgrade-skill.git
codex plugin marketplace add ./dsh-plugin-upgrade-skill
```

当前 Codex CLI 没有直接安装子命令；GitHub 与本地路径都通过 `plugin marketplace add` 注册。

### Gemini CLI

直接从仓库或本地克隆安装：

```bash
# 从仓库
gemini skills install https://github.com/oh-my-dsh/dsh-plugin-upgrade-skill.git --path skills

# 本地
git clone https://github.com/oh-my-dsh/dsh-plugin-upgrade-skill.git
gemini skills install ./dsh-plugin-upgrade-skill/skills/
```

### Cursor

将 `skills/` 复制到 `.cursor/skills/`：

```bash
git clone https://github.com/oh-my-dsh/dsh-plugin-upgrade-skill.git
cp -r dsh-plugin-upgrade-skill/skills/* .cursor/skills/
```

## 怎么用

Claude Code 中按名字调用 skill（插件安装后带命名空间）：

```
/plugin-workflow
/dsh-plugin-upgrade-skill:plugin-workflow
/plugin-upgrade 0.1.2
/dsh-plugin-upgrade-skill:plugin-upgrade 0.1.2
```

首次只调用统一入口、尚未说明目标流程时，它会先列出 9 个工作流程和 14 项可选能力，推荐只读
`health-check` 但不会自动执行。回复流程编号或名称，并按需增减能力后，它才会生成阶段账本并开始：

```text
选择 1
选择 compatibility-migration，加上 docker-smoke 和 browser-check
```

也可以直接在对话中提问（任意 agent），skill 按描述自动触发；只读检查直接给结果，升级或迁移会先出计划再等确认：

```
先检查这个 DSH 插件，让我选择要不要升级、测试、查云端命名或发布
我需要把插件从 0.1.1 升级到 0.1.2，有哪些破坏性变更？
帮我把 dsh-ads 这个插件升级到 dsh-v0.1.2-alpha.2
校验这个插件的命名并查询中央注册表；保留索引 URL 和 SHA-256，不要提交注册
```

`naming-registry` 默认执行离线命名校验和只读中央查询；中央注册仍是单独的外部发布步骤。
代理网络下使用 Node 24+ 的 `node --use-env-proxy` 运行查询，Node 20-23 不保证内置 `fetch`
自动读取代理环境变量。查询失败、索引超限或 v2 契约不合法都表示“未知/未检查”，不能解释为名称可用。

## 11 个 skill 各自管什么

| Skill | 干什么用 |
| --- | --- |
| [plugin-workflow](skills/plugin-workflow/) | 统一入口。运行前选择检查、升级、测试、命名注册、打包发布等功能，生成阶段账本并分别确认写入、运行和外部发布 |
| [plugin-upgrade](skills/plugin-upgrade/) | 主角。检查插件要不要升级、执行升级、把老插件适配到新 dsh 版本 |
| [plugin-write](skills/plugin-write/) | 写新插件，附命名规范和查重（避免和别人插件撞名） |
| [plugin-test](skills/plugin-test/) | 测插件改得对不对，含 docker 冒烟测试（装上 dsh 真启动一遍） |
| [plugin-release](skills/plugin-release/) | 打包发布插件，含发布前的自动检查 |
| [dsh-upgrade-audit](skills/dsh-upgrade-audit/) | 对比两个 dsh 版本到底改了什么，给升级卡提供证据 |
| [plugin-runtime-debug](skills/plugin-runtime-debug/) | 排查插件在宿主里的运行时故障（坐标/投影不匹配、版本滞后、幽灵条目等） |
| [plugin-fleet-sweep](skills/plugin-fleet-sweep/) | 宿主升级后对整批已安装插件做巡检：静态扫改名/删除的 API、真浏览器逐插件断言，并按插件逐个修复发布 |
| [plugin-heavy-dep](skills/plugin-heavy-dep/) | 给轻量插件接入重依赖（mermaid 这类），含懒加载接入清单 |
| [dsh-benchmark-case](skills/dsh-benchmark-case/) | 把某个插件的真实升级经验（或已有版本卡）提取成一条可自动判分的 benchmark 考题（fixture + instruction + judge + solution） |
| [generic-migration](skills/generic-migration/) | 框架无关的插件迁移方法论（盘点耦合面、通读版本走廊、分层验证），不含任何 DSH 专有事实；用作对照实验的控制组 |

## 升级卡覆盖到哪个版本了

| 版本区间 | 状态 | 说明卡 | 备注 |
| --- | --- | --- | --- |
| 0.1.0-rc.8 → 0.1.1-rc.1 | 📝 草稿 | [v0.1.1-rc.1.md](skills/plugin-upgrade/references/v0.1.1-rc.1.md) | 9 张草稿卡（vlln 插件迁移：repository 机制移除、strict inject、0812 服务改名等；走廊为 0810–0812 内测快照窗口的最近公开 tag 对齐，待上游复核） |
| 0.1.1-rc.1 → 0.1.1-rc.2 | ✅ 完成 | [v0.1.1-rc.2.md](skills/plugin-upgrade/references/v0.1.1-rc.2.md) | 3 张卡 |
| 0.1.1-rc.2 → 0.1.2-alpha.1 | ✅ 完成 | [v0.1.2-alpha.1.md](skills/plugin-upgrade/references/v0.1.2-alpha.1.md) | 28 张卡 |
| 0.1.2-alpha.1 → 0.1.2-alpha.2 | ✅ 完成 | [v0.1.2-alpha.2.md](skills/plugin-upgrade/references/v0.1.2-alpha.2.md) | 8 张卡 |
| 0.1.2-alpha.2 → 0.1.2-alpha.3 | ✅ 完成 | [v0.1.2-alpha.3.md](skills/plugin-upgrade/references/v0.1.2-alpha.3.md) | 2 张卡（A3-01 新增 `settings.plugin.item` keyed-slot 设置卡能力；A3-02 移除可选 SQLite Session 持久化后端，opt-in 部署需旧版导出） |
| 0.1.2-alpha.3 → 0.1.2-alpha.4 | ✅ 完成 | [v0.1.2-alpha.4.md](skills/plugin-upgrade/references/v0.1.2-alpha.4.md) | 6 张卡（`report` → `send_message`、Python 运行时包改名、`Session.events` 移除、seq 强类型、PTC `workflow` 与 base `web_fetch` 默认值；三台真宿主验证） |
| 0.1.2-alpha.4 → 0.1.2-alpha.5 | ✅ 完成 | [v0.1.2-alpha.5.md](skills/plugin-upgrade/references/v0.1.2-alpha.5.md) | 3 张卡（storage 域 `compatibleVersions` 读兼容与 `backup-and-skip` 兜底；旧家升级拒启/标题丢失修复；storage 层复现核对） |
| 0.1.2-alpha.5 → 0.1.2-rc.1 | ✅ 完成 | [v0.1.2-rc.1.md](skills/plugin-upgrade/references/v0.1.2-rc.1.md) | 0 张卡（纯版本 bump；含核对记录、macOS 真机验证与 release notes 覆盖矩阵） |
| 0.1.2-rc.1 → 0.1.3-alpha.1 | 📝 草稿 | [v0.1.3-alpha.1.md](skills/plugin-upgrade/references/v0.1.3-alpha.1.md) | 8 张草稿卡（session-log 走廊 A1-01/02 + Windows 安装 fs-ext 原生构建 A1-03 + host-plane/policy A1-04/05/06 + A1-07/08 未发布 cohort 源码宿主验证配方与 composer/read_image 运行时复核；release tarball 实测，tag 对齐待上游复核） |
| 0.1.3-alpha.1 → 0.1.3-alpha.2 | 📝 草稿 | [v0.1.3-alpha.2.md](skills/plugin-upgrade/references/v0.1.3-alpha.2.md) | 5 张草稿卡（persona 拆前缀/后缀、`SubprocessHandle.pid` 移除、base 移除 str-replace 编辑器默认行、launcher `runCli()`/`import.meta.main`、pi-ai 0.84.2→0.85.1） |
| 0.1.3-alpha.2 → 0.1.5-alpha.1 | 📝 草稿 | [v0.1.5-alpha.1.md](skills/plugin-upgrade/references/v0.1.5-alpha.1.md) | 20 张草稿卡（Session 格式 V3 + `EpochHeader.system` 移除、`ctx.agent` 移除、Inbox 类型化、会话事件校验收紧、PTC 改名、system prompt 入消息历史、CLI 拒 `desktop`、`--from-default-profile`、文件面新 API、Web Client `details`→`rightbar` 重构、右栏/资源扩展点、`tool-subagent` 契约、host SSH/指令发现 seam；版本号跳跃边 0.1.3-alpha.2 → 0.1.5-alpha.1） |
| 0.1.5-alpha.1 → 0.1.5-alpha.2 | 📝 草稿 | [v0.1.5-alpha.2.md](skills/plugin-upgrade/references/v0.1.5-alpha.2.md) | 24 张草稿卡（`workspaceFiles` 改查 `workspaceFileScope`、文件读取越出工作区根 + `maxFileBytes`、`conversation` 迁到根级 `main`、minimal profile 只剩持久 shell、两个不可忽略会话事件、pi-ai 配置变更、scope 感知工具指引、`present`/reveal、文档预览改名、新 `chunked-list`/`tool-present` 包、MCP 分页 cursor 拒绝、session-format-status 文档；客户端/打包面 12 张：`rightbar` 根级化 + layout 重写、`client-resources` 去 `reload`、`ui-primitives` 图标改名、`ui-dockkit` 漂移、消息反馈注入面、`ui-workspace` 导航、交付 turn tail、浏览器依赖迁 devDeps、`documentPreviews` 注册表、action 命令、feedback Remote、右栏默认页规则） |
| 0.1.5-alpha.2 → 0.1.5-rc.1 | 📝 草稿 | [v0.1.5-rc.1.md](skills/plugin-upgrade/references/v0.1.5-rc.1.md) | 5 张草稿卡（base 默认模型 id 改 `deepseek-flash`；适配器目录新增 V41 Flash（图片输入、历史系统提示词、不探测网关）；文档渲染器新增必填 `scrollportRef`；侧栏 guide 条目新增可选 `description`；含"未改动面"负面证据与 17 仓库舰队核对记录）。本边只有 17 个提交 |
| 0.1.5-rc.1 → 0.1.5-rc.2 | 📝 草稿 | [v0.1.5-rc.2.md](skills/plugin-upgrade/references/v0.1.5-rc.2.md) | 6 张草稿卡（反馈面注入契约去掉 `toggle`/`acknowledge`、`openDialog` 加必填 `rating`；点赞/点踩都改为弹窗确认、提交失败转 6s 警告 toast；`FileTypeIcon` 48 个代码分类换设计导出 artwork；回合尾动作条与文件区 20/16/20px 间距契约；`service-stability` 中英文文案改字；以及"宿主面零行为变更"的负面证据） |
| 跨版本通用对策 | ✅ 完成 | [rollup-0.1.2.md](skills/plugin-upgrade/references/rollup-0.1.2.md) | 13 条（新旧共存、先备份、启动卡死怎么办等） |
| 0.1.5-rc.2 → 0.1.6-alpha.1 | 📝 草稿 | [v0.1.6-alpha.1.md](skills/plugin-upgrade/references/v0.1.6-alpha.1.md) | 38 张草稿卡（目前最宽的一条边：800 个提交、4015 个改动文件。宿主面：`agent/session-start` 删除、`agent/created` 改串行可等待并携带 `source`/`signal`、`auditStartupEntries` 取代 `assertEntries*`、会话事件同步读取弃用、新增 `registerMessageProjection()` 与"无解释器即拒读"、session-log 默认上传；运行时：`codeRuntime`→`ptcRuntime` 且 `run` 拆成 `resolve`/`run`、`SandboxProvider.confine` 与 `ShellExecutor.start` 异步化、子进程 provider 新增 `terminalEnvironment()` 与可选控制通道、`workflow-ptc` 取代 worker-thread、MCP 升 2.0 SDK、新增 `ctx.mcpResources` 与 `ctx.ssh`；LLM：适配器改为上报 `IMAGE_OFFLOAD_REQUIRED`、`deepseek-official` 默认 Anthropic Messages 协议、图片进 v41 token 网格、投影 stateVersion 5、`AssistantProvenance`→`AssistantProviderMetadata`；客户端：provenance→producer/provider metadata、`CommandClaim.name` 必填、新增 `conversation.input.permission` 与 keyed guide slot、`reconnectLabel` 移除、diff 带上下文、`?fixture` 模式退役；打包面：base 行替换、默认挂载 `image-offload`（`image/offload` 必读事件）与 `mcp-resources`、默认关闭 `tool-ralph`、Web 包去掉 `code-runtime` 行、+22/−7 包账单、headless `--session-id`/`--json`、公共包清单重建、实验包改黑名单发布、原生依赖下限 `^0.1.4`→`^0.1.6`；并附"未改动面"负面证据） |
| 0.1.6-alpha.1 → 0.1.6-alpha.2 | 📝 草稿 | [v0.1.6-alpha.2.md](skills/plugin-upgrade/references/v0.1.6-alpha.2.md) | 4 张草稿卡（`SessionListState.current` 删除，主会话改经 `uiSession.adapter.current` 解析；全局标准 props 用 `useSessionStatus` + `useSessionRetainInfo` 取代 `useSessionPendingInteraction`，`useSessions` 保留；新增 Plugin Manager 管理 profile bundle 与 patch 行开关，link 安装的插件不在其管理范围；GitHub 发版后 npm 有 E404 窗口；三个外部插件已发修复版的一手证据） |
| 0.1.6-alpha.2 → 0.1.7-alpha.1 | 📝 草稿 | [v0.1.7-alpha.1.md](skills/plugin-upgrade/references/v0.1.7-alpha.1.md) | 11 张草稿卡（客户端图标集删除全部 `*16` 导出、`workspaceFiles` 读取统一到 `readBytes`、设置迁入 Profile 插件配置、bundle 声明 agent preset、session log V4、官方 DeepSeek 适配器只走 Messages API、多 patch bundle、容错 Profile 加载、按 locale 的插件元数据、自定义事件附件不再自动读取、新增设置页座位 `settings.launcher`/`settings.models.sign-in`；前一条边 0.1.6-alpha.1 → 0.1.6-alpha.2 单独成卡） |
| 0.1.7-alpha.1 → 0.1.7-alpha.2 | 📝 草稿 | [v0.1.7-alpha.2.md](skills/plugin-upgrade/references/v0.1.7-alpha.2.md) | 4 张草稿卡（`spill-policy` 改用 `maxInlineTokens`、vendored 依赖只锁同 minor 补丁、首次安装自动选 npm registry、客户端 bundle 启动时缓存且页面自动重连） |
| 0.1.7-alpha.2 → 0.1.7-rc.1 | 📝 草稿 | [v0.1.7-rc.1.md](skills/plugin-upgrade/references/v0.1.7-rc.1.md) | 5 张草稿卡（DSH peer 范围在安装和启动时强制校验、宿主 semver ≥ 7.8.3 下 `^0.1.7` 不接受 rc.1 的陷阱；toolview 三阶段；瞬态事件启动会话；工作详情四种模式；插件管理器限制静默 pnpm 运行） |
| 0.1.1 → 0.1.2 正式版 | 🔄 等官方发版 | — | dsh 0.1.2 还没发正式版（npm `latest` 仍是 rc.1；走廊已延伸到 0.2.0-rc.1，draft 卡），正式版发布后我们要复核一遍 |
| 0.1.7-rc.1 → 0.1.7-rc.2 | 📝 等社区认领 / 尚未成卡 | — | 346 个提交，含真实改动（Schedule 先进默认 Web 组合再被禁用、native-command Windows 适配器、auto-review、user-questions 限时等待、工具描述精简、插件管理器修复）；`plan-migration` 从 ≤0.1.7-rc.1 出发会报走廊缺口。想帮忙写卡？看 [贡献指南](CONTRIBUTING.md) |
| 0.1.7-rc.2 → 0.2.0-rc.1 | 📝 草稿 | [v0.2.0-rc.1.md](skills/plugin-upgrade/references/v0.2.0-rc.1.md) | 6 张草稿卡（宿主包跨到 0.2.0：所有 `^0.1.x` 下限的 DSH peer 被拒，`^0.2.0` 本身也不接受 rc 宿主——附实测范围表与一手证据；Web 工作详情默认改为 `detailed`、默认值移入客户端代码、`transcriptView` 变为可选；Schedule 行移出默认 web-app bundle，改由 `@deepseek-ai/dsh-experimental-schedule-bundle` 提供；bundle 组合新增遥测行；`fork` 新增 `onCreated`；Explorer 打开路径改为可见窗口，可撤掉本地 reveal 热修。两条 Desktop 0.2.0-rc.2 现场记录已折叠进下一条边卡集） |
| 0.2.0-rc.1 → 0.2.0-rc.2 | 📝 草稿 | [v0.2.0-rc.2.md](skills/plugin-upgrade/references/v0.2.0-rc.2.md) | 3 张草稿卡（桌面运行时面，实机 Desktop 0.2.0-rc.2 一手验证：Electron 壳经 `dsh-app://app` 转发渲染进程请求前删除 `host`/`origin`/`cookie`/`sec-fetch-site`、WS origin 改写为 Host authority——要求肯定性浏览器标记的插件 fence 全线 403，按平台围栏信任语义修正；原两条现场笔记折叠成卡：Desktop `ctx.sessions` 注册表为空（附上游 discussion 链接）、Windows 子进程 PATH 最小化；未归因现场笔记记录 `readSession` seeded 会话重放校验）。下一条边 0.2.1-alpha.1 另有在途认领 |

## 考题（benchmark）

[benchmark/](benchmark/) 目录下有 63 道升级考题和自动判分，采用 [Harbor](https://github.com/harbor-framework/harbor) 任务格式：每题一个自包含任务（自带 DSH 环境的容器 + 自动 verifier），`harbor run -p benchmark/tasks/<题号> -a <agent>` 即可得到 0~1 分。同一个 agent 装 skill 做一遍、不装做一遍，分差就是 skill 的实际效果。多个模型与 agent 的实测结果和完整报告列在 [benchmark/README.md](benchmark/README.md)，报告原文在 [benchmark/results/](benchmark/results/)。

## 论文

我们把这个 skill 的评估写成了一篇回顾性研究：[arXiv:2609.30120](https://arxiv.org/abs/2609.30120)。它关注的问题是：**分数提高了，是否说明迁移建议真的满足了目标版本的契约？**

- **分数提升**：在 16 道静态迁移诊断题、64 份回答上，挂载 skill 后平均得分从 93.83 升到 98.75（+4.92，95% 区间 [0.31, 10.86]）。提升集中在少数题目，8 组题两边都已满分。
- **契约层面的检查**：把 328 条评分决策逐条对到版本契约，并用可执行探针复核，发现了评分本身的问题，例如一个会放过父目录的路径守卫仍拿到满分。分数高不等于建议正确。
- **跨模型复评**：用另外两个模型家族（Claude Opus 5.5、GPT-5.5）在不知道分组、也看不到原分数的条件下重评全部 64 份回答，与原评审的一致率为 91.8% 和 95.7%，重算的提升为 +10.63 和 +6.09，方向一致、幅度随评审而变。
- **可复算**：原始回答、评分、复核、复评协议与脚本都在仓库里，入口见 [paper/](paper/)。

局限（单一框架、静态诊断、尚无独立人工标注与对照组）在论文中如实说明，后续工作也已列出。

## 参考资源

- [官方仓库](https://github.com/deepseek-ai/deepseek-harness) — DSH 主仓库
- [Discussion #5120](https://github.com/deepseek-ai/deepseek-harness/discussions/5120) — 社区迁移踩坑征集（本仓库的起点）
- [dsh-web 迁移实例](https://github.com/zhu1090093659/dsh-web) — @zhu1090093659 的完整迁移案例

## 项目里直接用

使用统一工作流时，把整个 `skills/` 目录复制到项目里，因为 `plugin-workflow` 会把每个阶段交给另外五个 owning Skill。只需要升级能力时，也可以单独复制 `skills/plugin-upgrade/`：

```text
<your-project>/.agents/skills/
├── plugin-workflow/
├── plugin-upgrade/
├── plugin-write/
├── plugin-test/
├── plugin-release/
└── dsh-upgrade-audit/
```

注意保留里面的 `SKILL.md` 和 `references/` 文件夹，别只复制一个文件。也可以让 DSH 本地的 skill 加载方式直接指向本仓库的 `skills/` 目录。

## 仓库目录

```text
skills/<skill-name>/
├── SKILL.md        # skill 的说明书（怎么触发、怎么干活）
├── references/     # 升级说明卡和详细资料
├── scripts/        # 可执行的小工具（含迁移规划器、工作流计划器和运行时验证器）
└── examples/       # 示例代码（只读，不要运行）
scripts/validate.mjs            # 仓库自检
scripts/validate-manifests.mjs  # 多 agent 清单自检
benchmark/                      # 63 道考题 + 判分 + 验证报告
```

## 想贡献？

CI 分层、工作流组合回归和真实模型对照评测入口见
[Skill CI 说明](benchmark/docs/skill-ci.md)。参考答案测试通过不代表模型已正确使用 Skill。

1. 按 [skills/README.md](skills/README.md) 的规范写；
2. 升级卡按 [卡片格式](skills/plugin-upgrade/references/README.md) 填；
3. 跑两条自检命令，全绿再提 PR：

```sh
node scripts/validate.mjs
node scripts/validate-manifests.mjs
```

## 引用

如果本仓库或论文对你的工作有帮助，请引用：

```bibtex
@misc{liu2026evaluating,
  title         = {Evaluating Agent Skills for Version-Specific Plugin Migration: A Retrospective Study},
  author        = {Liu, Beiming and Li, Haihao and Chen, Minjie and Chen, Ning and Wang, Yiran and Ye, Jiming and Zhang, Puzhao and Wang, Tongtao and Gao, Sheng and Jin, William and Mu, Weihao and Liu, Chengzhi and Xia, Yucheng and Wang, Guangren and Fan, Chaoyang and Huang, Changfeng and Lin, Xunming and Shen, Yuanjie},
  year          = {2026},
  eprint        = {2609.30120},
  archivePrefix = {arXiv},
  primaryClass  = {cs.SE},
  url           = {https://arxiv.org/abs/2609.30120}
}
```

## 致谢

论文作者与所有提交过 PR 的贡献者共同建设了本仓库，完整名单见 [Contributors](https://github.com/oh-my-dsh/dsh-plugin-upgrade-skill/graphs/contributors)。

- [@hikariming](https://github.com/hikariming) — 仓库维护与 dsh 技能检索站 [dshfind.com](https://dshfind.com)
- [@ccch1mneyyy](https://github.com/ccch1mneyyy) — issue #1 提案和 alpha 版本卡片
- [@zhu1090093659](https://github.com/zhu1090093659) — [dsh-web](https://github.com/zhu1090093659/dsh-web) 迁移实践与详细痛点记录
- [@huiliyi37](https://github.com/huiliyi37) — [dsh-tui](https://github.com/huiliyi37/dsh-tianshu-tui) 0.1.2-alpha.2 迁移实测
- [@tianyicui](https://github.com/tianyicui) — discussion #5120 发起和官方征集

## License

[MIT](LICENSE)
