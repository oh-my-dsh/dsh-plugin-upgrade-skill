# 老插件迁移 SOP（官方指南覆盖不到时的对照手册）

四步流水线（env-doctor → guide-sync → code-scan）依赖官方 upgrade-guide，而官方指南最早只到
dsh-v0.1.7-rc.2。插件或目标版本更老时，本 skill 的扫描器没有原料可查，改走这份 SOP：
把原仓库（[oh-my-dsh/dsh-plugin-upgrade-skill](https://github.com/oh-my-dsh/dsh-plugin-upgrade-skill)）plugin-upgrade skill 的人工卡片走廊当差异来源，流程纪律沿用其全流程手册，
这里只保留快速对照需要的最小集。细节一律引用原文，不复制，避免双源漂移。

## 什么时候转 SOP

满足任一条：

- `guide-sync` 定出的 target 早于 v0.1.7-rc.2，或 `code-scan` 报 `guidesConsidered = 0`；
- 插件要跨大段历史走廊（如 dsh-v0.1.1-rc.1 → v0.2.x）；
- 升级后报错，但官方 guide 里查不到对应变更（包废弃类最典型，如 `@deepseek-ai/dsh-client-runtime` 的移除）。

## 红线：先分清两件事

**升级 DSH 宿主本体**和**插件迁移**是两类任务，混在一起是结构性事故之源：

- 在 DSH 会话内执行宿主升级是致命的：会话本身就是宿主进程，npm 会拆掉它正在执行的
  包树，宿主死在安装中途，中断的安装留下没有 shim 的残包，`dsh` 命令直接消失。
  宿主升级必须：停净所有 dsh 进程 → 外部终端跑 pinned 安装
  `npm install -g @deepseek-ai/dsh@<精确版本>`（裸包名解析到 `latest` 可能静默降级）→
  重启并验证。
- 本 SOP 只做插件侧的适配与核查，不改 DSH 本体来掩盖插件不兼容。

## 差异来源对照表

| 版本段 | 来源 | 用法 |
| --- | --- | --- |
| dsh-v0.1.7-rc.2 → 最新 | 官方 upgrade-guide | 走 SKILL.md 四步，`code-scan` 自动核查 |
| dsh-v0.1.0-rc.8 → dsh-v0.2.0-rc.1 | plugin-upgrade 卡片走廊（19 条边 + rollup + 1 套跳版卡 34 张） | 按阶段 3 组装走廊，对照卡片 |
| dsh-v0.1.7-rc.1 → dsh-v0.1.7-rc.2 | 无卡片（346 commits，corridor gap） | 标记 gap，从精确 tag 源码推导 |
| ≤ dsh-v0.1.0-rc.8 | 无 | unsupported gap，同样从 tag 源码推导 |
| dsh-v0.2.0-rc.2 → v0.2.1.x | 官方 guide 已有；上游卡片在陆续补 | 优先官方 guide；上游 `references/README.md` 用前先看有没有新边 |

卡片走廊总表（含每条边的 from/to 与卡数）：
[`skills/plugin-upgrade/references/README.md`](https://github.com/oh-my-dsh/dsh-plugin-upgrade-skill/tree/main/skills/plugin-upgrade/references/README.md)
上游在持续补新边，动手前先拉最新 main 再读这张表。

## 阶段 0 · 定模式

| 模式 | 用户意图 | 默认动作 |
| --- | --- | --- |
| A · 检查 | 看有没有更新、评估某版 DSH 的影响 | 只读调查并报告，然后停 |
| B · 更新 | 把已安装插件升到明确版本 | 出计划，确认后才动组合或依赖 |
| C · 迁移 | 插件作者的源仓库适配新版 DSH 宿主 | baseline → 组装走廊 → 计划确认 → 实施 |

意图不明先确认模式；「帮我看看有没有更新」不许滑成装依赖或改代码。

## 阶段 1 · 只读准备

- 读目标仓库的 AGENTS.md / CLAUDE.md；查分支、HEAD、工作树、子模块。有陌生的改动或
  未跟踪文件就停下报告，不自动 stash/reset/clean/checkout。
- 源身份与安装身份分开记录：registry 包、Git checkout、workspace/junction、复制安装各是
  一种 track；记下源仓库 URL、Git SHA、实际包名、插件自身版本、声明的 DSH peer 区间、
  当前 DSH/Node 版本。插件的发布版本号不是 DSH 宿主走廊，GitHub owner/repo 与
  registry scope/package 是两套独立坐标，不许互推。
- 文件所有权四类，改动按路径打点、不动未知字段：`package.json`/lockfile（包与依赖）、
  `dsh-plugin.json`（社区标准清单）、`cordis.patch.yml`/`agent.cordis.yml`（profile 组合）、
  解析后的配置（只用于验证，绝不整对象写回）。
- 记录回滚基线：当前 HEAD 与包版本、lockfile、可能变更的配置的哈希/路径。
- 本机环境巡检用 `node scripts/env-doctor.mjs <插件目录>`：覆盖层旧包、全局版本、运行中
  宿主、peer 窗口一次出齐。`overlayFindings` 非空先处理覆盖层再谈适配（issue #263 类事故）。

## 阶段 2 · 幽灵宿主检查

in-place 升级过源码 checkout（`git pull` / 切 tag）之后，已运行的宿主还在内存里跑旧代码，
而 `git describe`、`package.json`、目录名全都报告新版本。按磁盘定 `from` 会把整条走廊
错挂一代：静态核查读的是新代码，结论却套在旧进程上——鉴权与兼容性判定会整体反转。
实测案例：同一台机器同一 checkout，升级前启动的宿主对未鉴权的
`POST /api/agentPreset.list` 答 `ok:true`（旧代），升级后启动的答 401（新代），
两边的 `git describe` 完全相同。

两个检查 + 一个探针，任何触点扫描之前做：

1. 问进程不问磁盘：`ps -o lstart= -p <hostPid>` 对比 checkout 最后一次提交时间，
   进程早于该时间即是幽灵；
2. 探针不读版本号：向目标宿主发一个已知两代行为分歧的请求，按回复分类
   （上面的 `agentPreset.list` ok/401 分叉就是现成探针）；
3. 现成脚本：原仓库的 `skills/plugin-upgrade/scripts/ghost-host-check.mjs`
   （先 `git clone https://github.com/oh-my-dsh/dsh-plugin-upgrade-skill`），
   `node <原仓库>/skills/plugin-upgrade/scripts/ghost-host-check.mjs <hostPid> <checkoutDir> [port]`，
   exit 1 = 幽灵，可直接做 shell 门禁。

确认幽灵后：重启宿主重跑核查，或把走廊 `from` 显式钉到进程真实代际并写进报告。

## 阶段 3 · 组装走廊并算净状态

1. 用精确 tag/commit 定 from/to，不用 `latest`，不凭记忆；
2. 按 [原仓库卡片走廊总表](https://github.com/oh-my-dsh/dsh-plugin-upgrade-skill/tree/main/skills/plugin-upgrade/references/README.md)
   的 `from → to` 有向边连接走廊——永远不用文件名字典序（字典序下 `alpha.10` 排在
   `alpha.2` 前面）；
3. 先读完整走廊，折叠净变化：字段在 alpha.1 删除、alpha.2 恢复的，不要删了再加；
4. 某条边没有卡片时标记 unsupported gap，从精确 tag 的源码、类型与测试推导，
   不凭记忆改插件。跨大段历史优先看跳版卡
   [`jump-0.1.5-rc.2-to-0.1.7-rc.1.md`](https://github.com/oh-my-dsh/dsh-plugin-upgrade-skill/tree/main/skills/plugin-upgrade/references/jump-0.1.5-rc.2-to-0.1.7-rc.1.md)
   （34 张，0.1.5-rc.2 → 0.1.7-rc.1 的净变化视图），再下钻单边卡补细节。

## 阶段 4 · 七类触点自查

对每个触点类做一遍源码扫描，命中记文件与行号、对应卡片、置信度备注。
`rg` 模板与逐类展开见
[`pre-flight.md`](https://github.com/oh-my-dsh/dsh-plugin-upgrade-skill/tree/main/skills/plugin-upgrade/references/pre-flight.md)，
扫描模板的真源是同目录的 `pre-flight-patterns.json`：

| # | 触点类 | 一句要点 |
| --- | --- | --- |
| 1 | 源码补丁 / monkey patch | 记目标路径与替换意图；目标 tag 无对应属主模块就标待确认，不猜路径 |
| 2 | 内部事件名与持久事件 | 分清 producer、持久化、重载、传输、纯观察者角色 |
| 3 | 内部 service 探测 / Remote | 记调用所在的 face（Host / Web Client / 普通插件）与包入口 |
| 4 | 宿主目录直读直写 | 命中路径构造后追数据流；不打印配置、token、`.npmrc`、会话日志 |
| 5 | 内部 UI / 命令 / 工具注册 | 分清公共接缝与内部路径；capability 卡只是建议，永不自动采纳 |
| 6 | 自定义 HTTP / WS / RPC / DOM / CSS 通道 | 查鉴权、Host/Origin、端口生命周期、teardown；「只听 loopback」不是免鉴权理由 |
| 7 | 子进程 / stdout / stderr 解析 | 记 argv、cwd、env、取消、退出码、输出归属；进程能启动不等于验证过 |

零命中只表示「当前模式没探到」，仍要查依赖与配置、跑构建、真挂载、跑功能冒烟。

## 阶段 5 · 计划与确认

- 只保留与命中触点和实际 face 相交的卡片；卡片是精选清单不是完整 API diff，
  走廊边缘或 API 坐标缺失就标 pending，不凭记忆补。
- 出迁移计划：按 Host / Web Client 接缝分组，列命中文件、卡片、目标行为、测试。
- 任何写盘、装依赖、跑包脚本之前拿明确确认，即使已知无破坏性变更。
- 专用分支/worktree 里做最小改动；`package.json` 与 lockfile 里的 DSH peer 保持精确一致，
  装成功但 peer 新旧混杂不叫迁移完成。

## 阶段 6 · 实施

- Mode C 先跑 baseline：在仓库自己的依赖状态（不钉目标版本）下跑机械套件
  （build / typecheck / tests），把既有失败记成豁免清单。迁移不许新增或加重失败；
  详见 [原仓库 `rollup-0.1.2.md`](https://github.com/oh-my-dsh/dsh-plugin-upgrade-skill/tree/main/skills/plugin-upgrade/references/rollup-0.1.2.md) 的 R-06。
- 只动本任务拥有的路径；配置按路径打点，保留未知字段。
- 兼容性改动通过后，插件自己的 SemVer 单独决定，不许顺手把宿主版本号当成插件版本发出去。
- 静态精查（peer 下限、运行时组成 vs 类型声明、locale 配对、通道鉴权与协议保持）用
  [原仓库 `precision-checklist.md`](https://github.com/oh-my-dsh/dsh-plugin-upgrade-skill/tree/main/skills/plugin-upgrade/references/precision-checklist.md)。

## 阶段 7 · 六层验证与报告

至少跑适用层：

1. 依赖解析：包管理器、lockfile、依赖图只按预期变化；全量扫 lockfile 里的旧 DSH 区间
   与已移除包，不只看顶层依赖；
2. 启用解析：目标 profile 的组合确实解析到目标包，无旧源、无重复行；
3. 静态：build、typecheck、插件测试；
4. 运行时：真宿主冷启动一个隔离 profile，验证入口激活、required/provided Cordis 服务
   不挂 pending——原版 `verify-runtime.mjs` 端到端跑这一层并给失败归因
   （插件代码 / 依赖解析 / profile 配置 / DSH 运行时）；
5. 行为：执行一条核心插件路径；宿主迁移至少走通一条 消息 → 工具 → 响应 流；
6. wrapper：exit code、stdout、stderr、取消、teardown。

报告六段：pre-existing（baseline 豁免清单）/ Completed（版本、文件、卡片、验证）/
Skipped（未命中项及证据）/ Pending 与残余风险 / Rollback（基线与可恢复路径）/ Recommendations。

## 工具分工速查

| 阶段 | 用什么 |
| --- | --- |
| 环境巡检、覆盖层旧包、启用就绪度 | 本 skill `env-doctor.mjs` / `env-heal.mjs` |
| 定目标版本与通道位置 | 本 skill `guide-sync.mjs` |
| 有官方 guide 的版本段 | 本 skill `code-scan.mjs`（自动锚点核查） |
| 改完秒验（模块加载 / apply / 工具注册） | 本 skill `quick-smoke.mjs` |
| 升级时顺带做插件性能与架构体检 | 本 skill `plugin-audit.mjs`（可叠加 `--guide` 交叉） |
| 无 guide 的老版本段 | 原版 `plan-migration.mjs`（读卡片走廊出候选，结果仍是启发式） |
| 幽灵宿主判定 | 原版 `ghost-host-check.mjs` |
| 运行时验证 | 原版 `verify-runtime.mjs`（quick-smoke 只保「不崩」，真宿主验证用这个） |
| 残留 / peer 复查 | 原版 `inject-lint.mjs` |

## 底线

- 只读为主；写盘、装依赖、切版本、跑包脚本前必须确认。
- 不自动 stash/reset/clean/force-update，不覆盖用户或其他 agent 的工作。
- 不暴露凭证；诊断只报「是否配置了」与非敏感版本。
- 未知 `gateway/internal` 错误默认不重试。
- 一手来源与本地观察冲突时并列记录、复现、上报，不静默挑一边。
- 本 SOP 不把给当前任务做的一次性上游调研变成给本仓库补卡的隐式副作用。
