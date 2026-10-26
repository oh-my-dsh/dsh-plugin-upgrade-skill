---
name: plugin-fast-adapt
description: DSH 插件适配与破坏性变更核查，兼造插件脚手架与性能架构审计。run.mjs 一键编排全流程并把每次运行写进本地日志（list 回看、doctor 交叉核对宿主日志、sanitize 脱敏后才能外发）；查 DeepSeek 官方最新版本，取该版本的官方升级指南，扫描本机插件代码（package 命中自动到目标宿主 node_modules 实测核查），报出哪些地方踩了破坏性变更并给出官方修法；seams 接缝查询一个包名/API 符号在指南与本机宿主里的双源结论（还在不在、哪个版本移除的）；scaffold 一条命令生成五形态可冒烟的插件骨架（package.json 不变量＋形态入口＋挂载层＋命名投影，生成即验证）；同时巡检本机 DSH 环境（profiles 覆盖层旧包残留、共享 node_modules 农场悬空软链、两层 patch（各 profile 层＋全局 ~/.dsh/cordis.patch.yml）、已装插件、运行中宿主、宿主半与客户端半双面启用就绪度——dsh.client 声明/产物/注入名册死链，web 端与桌面端一视同仁）。修完可秒级冒烟验证，--real-smoke 再补干净 profile 真装真启档（桥接原仓库 verify-runtime），升级时可顺带做插件性能与架构审计。老版本插件（官方指南覆盖不到 v0.1.7-rc.2 之前的走廊）转迁移 SOP，对照原仓库 plugin-upgrade 的人工卡片走廊走七阶段流程。当需要把 DSH 插件适配到新版本或老版本、从零创建 DSH 插件、给新插件生成起步骨架、排查升级后插件报错、核查插件是否用了已移除的包或 API、查某个包/API 在目标宿主还在不在、检查 ~/.dsh 覆盖层有无旧包残留、给插件做性能与架构体检、诊断宿主启动失败日志（端口占用/未声明 inject/客户端入口死链）、把独立仓的技能面同步到下游技能目录时使用。触发词：适配 DSH 插件、升级插件、插件不兼容、dsh 升级后报错、插件用了废弃 API、接缝查询、这个 API 还在不在、检查覆盖层旧包、客户端卡 loading、entry did not activate、web boot 失败、注入死链、老版本 DSH 适配、历史走廊迁移、创建 DSH 插件、写 DSH 插件、插件脚手架、插件冒烟测试、插件性能审计、插件装了没生效、宿主启动失败、StartupError、EADDRINUSE、日志诊断、下游同步、技能漂移。
---

# plugin-fast-adapt

## 这个技能只做事

把「插件适配到新版 DSH」拆成四步，每步一个脚本，每步都能单独跑；另有两个可选步骤补全「造完即验、升级顺带优化」：

| 步 | 脚本 | 回答什么 |
| --- | --- | --- |
| ★ 一键全链（推荐入口） | `scripts/run.mjs` | 环境→定版→指南→扫描→体检→冒烟→typecheck 一条命令跑完，出统一报告并写本地运行日志 |
| 0 造骨架（可选） | `scripts/scaffold.mjs` | 从零造插件：一条命令出五形态可冒烟骨架，生成即验证 |
| 1 探测环境 | `scripts/env-doctor.mjs` | 本机装的 DSH 是哪个版本？覆盖层有没有旧包？共享农场有没有悬空软链？两层 patch 都读到了吗？装了哪些插件？插件启用就绪吗？ |
| 2 定版本 | `scripts/guide-sync.mjs` | 官方最新版本是什么？本机该不该跟？跟哪个？ |
| 3 取差异 | `scripts/guide-sync.mjs --clone` | 本机到目标版本之间，官方列了哪些破坏性变更？ |
| 4 查命中 | `scripts/code-scan.mjs` | 本机插件代码踩了其中哪几条？官方给的修法是什么？ |
| ★ 接缝查询 | `scripts/seams.mjs` | 某个包/API 符号在官方指南与本机宿主里的双源结论（双源一致才下「已移除」） |
| 5 秒验（可选） | `scripts/quick-smoke.mjs` | 改完之后插件还能加载、apply、注册工具吗？未声明 inject 的宿主服务访问会被拦吗？ |
| 6 体检（可选） | `scripts/plugin-audit.mjs` | 插件性能、弹性、上下文预算、生命周期得分如何？按新版本该做哪些优化？peer 该怎么改？ |
| ★ 日志诊断 | `scripts/log-doctor.mjs` | `~/.dsh/logs/` 里宿主启动失败（端口占用/未声明 inject/客户端入口死链）的根因是什么？ |
| ★ 下游同步 | `scripts/sync-skill.mjs` | 独立仓的技能面与下游技能目录有没有漂移？ |

**不依赖任何人工维护的知识卡片。** 权威来源只有两处：npm registry 的版本信息，和 deepseek-harness 仓库的 `docs/upgrade-guide/`。所以上游发新版的那一刻，这个技能就自动跟上了，不存在「卡片滞后」的问题。也不镜像官方全量文档、不建人工维护的问题库——那类知识快照必滞后（上游预发布节奏 1.7-2.8 天一个），且关键判定（某包还在不在）用宿主 node_modules 实测更硬。

## 怎么用

### 第一步：看清本机环境

```sh
node scripts/env-doctor.mjs <插件目录>
```

输出 JSON，重点看六段：

- `globalDsh`：全局安装的 DSH 版本和位置
- `overlayFindings`：profiles 覆盖层里与主安装脱节的包，带 severity 和原因
- `sharedFarmFindings`：共享 node_modules 农场（`~/.dsh/profiles/node_modules`）的悬空软链，带 `brokenCount`／`hostBackedBroken`（指向宿主安装树的是「宿主升级后包被移除」那一类，标 critical）
- `runningProcesses`：正在跑的 DSH 宿主进程（改 Host 侧代码后必须重启它）
- `target.peerWindows`：待查插件自己声明的 peer 版本窗口
- `activation`：插件启用就绪度——构建产物在不在、各 profile 挂没挂载、声明的 inject 服务在该 profile 有没有提供方特征（Cordis 静默 pending 风险）；目标不是插件形态（package.json 无 `dsh` 命名空间、无 `@deepseek-ai/*` 依赖）时记 `N/A` 不检查——按插件规则跑纯工具仓会把「无 main 入口」误报成 ERROR（2026-10-25 自审实录）。入口解析按 Node 语义（`exports['.']` 优先于 `main`），无 `main` 但入口写在 `exports` 的包不会再被误报 ERROR（2026-10-26 实测 `@local/dsh-env-sweeper`）
- `activation.client`：客户端半（dsh.client）三层判定——声明形状（合成器 boot 即 throw）、./client 产物（报 client bundles not found）、inject 目标名册死链（entry 卡 loading，整次 web boot 失败）。web profile 与桌面 APP 共用同一套 platform:web 前端，两端一视同仁。名册证据分强弱：宿主内置/bundles 列名/overlay 挂载行为强证据直过；包在依赖里但无行证据报 info 弱档让人确认（宿主是否自动挂载，静态分析判不了）。2026-10-25 实录：宿主半冒烟全绿、桌面 APP 起不来，真凶就是客户端半死注入

`overlayFindings` 非空时，先处理覆盖层再谈适配。这是 issue #263 那一类事故：宿主升级后覆盖层里残留旧包，旧包优先解析导致运行时装载冲突，而且只换文件不重启宿主还会复现。上游已移除的包若被 overlay 显式补挂（`- insert:` 行）则降级 info——那是刻意保留的兼容垫片不是意外残留，直接拆会弄断还 require 它的旧插件（确认全部消费方改净后再清）。

**`overlayFindings` 只看各 profile 自己的覆盖层目录，共享农场是另一层。** `~/.dsh/profiles/node_modules` 是指向宿主安装的软链农场（`@deepseek-ai/*` 加 react-dom/express 等传递依赖），宿主升级后包被移除就留下悬空软链，任何 require 它的插件都以 `ERR_MODULE_NOT_FOUND` 收场（2026-10-26 实测 209 条，宿主启动日志里 `client-runtime`／`orca-agent-hooks` 两行装载失败，而 `overlayFindings` 报 0 处）。这一层 `env-heal` 不处理，需手工清。

**两层 patch 都要看。** 除了各 profile 自己的 `cordis.patch.yml`，还有全局 `~/.dsh/cordis.patch.yml`——`dsh --dump-config` 显示它拼在每个 profile 的最后一层。只读前者会把它整个漏掉：本机全局层由 Orca 写入 `orca-agent-hooks` 行，引用的 `@deepseek-ai/dsh-hooks-claude-code` 没装，每次启动都报 `1 entry did not activate`，而工具报 0 处（2026-10-26 实测）。`installedPlugins[].patchEntries` 已把两层合并，`registered`／`disabled` 判定对两层都生效。

```sh
node scripts/env-heal.mjs           # dry-run，只报告
node scripts/env-heal.mjs --apply   # 真的移动（移到 ~/.dsh/.trash/<日期>/，不删除）
```

### 第二步：定目标版本

```sh
node scripts/guide-sync.mjs <本机版本>
```

**上游盯梢（--check）**：`node scripts/guide-sync.mjs --check` 零参数可直接接 cron/launchd/agent 轮询——自动探测本机宿主版本，退出码语义化（1=上游有新版，0=无需动作，2=判定失败），有新版时顺手把该版官方指南预取进缓存（下次 run.mjs 零等待）。工具不自带定时器，接线方式由用户定。

它读 npm 的 `dist-tags`（`latest` / `next` / `alpha`），然后判断本机在官方通道里的位置：

| 判定 | 含义 | 下一步 |
| --- | --- | --- |
| `upgrade-available` | 有通道版本高于本机 | 取 `target`（官方所有通道的最高版本）继续 |
| `up-to-date-on-channel` | 本机已是某通道的最新版 | 无需适配，收工 |
| `ahead-of-upstream` | 本机比官方所有通道都新 | 无需适配，收工 |
| `unknown-local` | 没检测到本机版本 | 默认跟 `latest`，但要人工确认 |

**不要盲目取 `latest`。** 本机完全可能跑在 `next` 线上，比 `latest` 还新一版；这时候报「建议升级到 latest」是倒退。

有 `target` 时，取该版本的官方升级指南：

```sh
node scripts/guide-sync.mjs <本机版本> --clone
```

优先复用本机已有的 harness clone（自动发现 `~/Documents/*/deepseek-harness`，或用 `DSH_HARNESS_CLONE` 指定），没有才 sparse clone 到 `~/.cache/dsh-plugin-fast-adapt/`。

**取版锚点（2026-10-25 实测复盘）**：本机已是官方通道最新版时 `resolution.target` 为 `null`，旧实现因此拿不到指南语料、`run.mjs` 的 scan 阶段静默跳过（扫描走廊 `(peerFloor, hostVersion]` 明明有内容却报「无指南根或无窗口」）。现在取版锚点退回本机版本（`target || localVersion || dist-tags.latest`），走廊照常扫。

**窗口起点只认宿主包（2026-10-25 dsh-image-gen 实录）**：起点取插件在宿主包（`@deepseek-ai/dsh` 及 `dsh-*` 套件子包）上声明的 peer 下限；同 scope 的 `@deepseek-ai/cordis`（4.x）、`@deepseek-ai/schemastery`（3.x）是独立版本线的库，不算宿主包——混入会把起点顶到 3.18.4 一类高位，窗口倒挂后扫描静默跳过。现在倒挂（起点 > 终点）会回退宿主版本并在 `window.fallback` 留痕、`window.source` 记起点来源（flag/peer/host），stderr 汇总同步告警，不再静默。

### 第三步：查插件踩了哪些变更

```sh
node scripts/code-scan.mjs <插件目录> <upgrade-guide 目录> <本机版本> <目标版本>
```

`<upgrade-guide 目录>` 是官方指南根目录，例如 `~/layerfs-lab/deepseek-harness/docs/upgrade-guide`，或者上一步 clone 出来的 `~/.cache/dsh-plugin-fast-adapt/harness-dsh-v<version>/docs/upgrade-guide`。

输出三段：

- `findingsByGuide`：按官方变更条目分组的命中，每条带 `guide`、`title`、`migration`
- `migration`：官方给的修法原文（从该指南的 Migration 段抽出来的相关步骤）
- `findingCount` / `guidesConsidered`：命中数与参考的指南条数

每条命中带出处锚点 `guideFile`/`guideLine`（指南内相对路径＋标题行号），结论可回溯到官方原文位置，不用在指南目录里再搜标题。

命中分三类并带 `severity`：`package`（import 了已移除或已改名的包，critical，装载必炸）、`member`（调用了已移除的方法或字段，high，运行时炸）、`code`（字符串里出现已变更的错误码或事件名，medium，最可能撞同名）。findings 先按 severity 排再按文件行号；每条带 `evidence`（命中行原文）。包名锚点有语义门：只在与移除/改名动词同句时才成为锚点，语境引用不算。

**扫描根（2026-10-25 实测复盘）**：`pickScanRoots` 取源码根并集——`src`（client/web 常嵌在 src 内部）与同级的 `client`/`web`/`ui` 一并扫；`lib`/`dist` 是构建产物、与 src 同义，只在没有任何源码根时才退回，否则同一处命中会按两份文件重复报。

### 接缝查询（seams）

```sh
node scripts/seams.mjs <包名或符号> [--guide <guide-root>] [--host <版本>]
```

回答「这个接缝在我的目标宿主还在不在」，双源合成：指南源（锚点表全走廊，哪个版本声称移除/改名了它、原文在哪一行、官方修法）× 宿主源（包看 node_modules 实测，符号看宿主套件源码文本命中——弱证据，如实标注）。裸 `dsh-*` 名自动归一到 `@deepseek-ai/` scope 再查。诚实三态：双源都说没有才下「已移除」；指南说没有但宿主里有，报分歧不替人拍板；双源都无记录时明说「指南未提及不代表 API 不存在」。默认零网络（指南根走缓存）。

### 一键编排与运行日志（run.mjs）

```sh
node scripts/run.mjs <插件目录> [--target <版本>] [--from <版本>] [--no-clone] [--no-smoke] [--no-typecheck] [--no-log] [--real-smoke]
```

按上面的流程依次跑环境、定版、指南、扫描、体检、冒烟、typecheck（执行插件自有的 typecheck script，与冒烟同信任级），输出一份统一 JSON 报告；扫描窗口自动取「插件在宿主包上声明的 peer 下限 → 宿主版本」的走廊（`--from`/`--target` 可覆盖，倒挂自动回退并留痕）。`--real-smoke` 默认关，显式启用后桥接原仓库 plugin-upgrade 的 `verify-runtime.mjs`：干净 profile 安装→启动→四类归因（插件代码/依赖解析/profile 配置/宿主运行时），fail 计入退出码 2，脚本不在本机（探测兄弟仓 `dsh-plugin-upgrade-skill`，或 `PFA_VERIFY_RUNTIME` 指路径）时诚实跳过给补法，Windows 按 POSIX-only 声明跳过。退出码：0 干净，2 有 critical/high 命中、typecheck 红或真冷启动失败。

每次运行写本地日志（`~/.cache/dsh-plugin-fast-adapt/runs/`，一次一个自包含 JSON + index.jsonl 一行摘要），记录工具版本与 commit——2026-10-25 实测教训：跑了一份滞后拷贝产出 4 个本已修复的误报，没有日志这类「跑的是哪版工具」完全不可观测。索引摘要带 `phases` 三态（scan/smoke/typecheck/realSmoke 各 ok|skipped|fail|error）与 `toolDirty` 星标（工具仓当时有未提交改动，版本号与 commit 可能拆对）——扫描没跑不再与「体检满分」在同一行里混淆（dsh-image-gen 实录：scan skipped、auditScore 照记 100）。运行日志保留 90 天，写入时惰性清理过期文件与对应索引行。

```sh
node scripts/run-log.mjs list [--limit 20]              # 最近运行一览（含工具版本@commit）
node scripts/run-log.mjs show <id|--latest>             # 单次全文
node scripts/run-log.mjs sanitize <id|--latest> [--out 文件]   # 脱敏后才可外发
node scripts/run-log.mjs doctor [--logs <目录>]         # 运行日志 × 宿主启动日志交叉核对
```

**doctor 交叉核对**（插件报错/装了没生效的第一站）：运行日志说代码侧状态（phases/命中/体检），宿主 startup 日志的 failedPlugins/waitingForServices 说装载侧状态，一条命令两边证据并排。三态判定：宿主日志干净 → 状态一致；宿主报了它、最近一次扫描干净 → 嫌疑在装载/挂载/环境侧（转 env-doctor 看 activation 双半）；两边都有问题 → 先按 run 的命中清代码。

日志不出本机；对外反馈前必须先 `sanitize`（home 前缀→~、用户名→<user>、机器名→<host>、邮箱→<email>，目录结构保留）。`--offline` 跳过 guide-sync（自检零网络用）。

### 第五步（可选）：修完秒验

```sh
node scripts/quick-smoke.mjs <插件目录>
```

纯内存模拟 Cordis 上下文，动态载入插件入口，毫秒到秒级验证：模块能加载、`apply` 契约能执行、工具能注册。改完代码后先跑它，挂了立刻回改，不用等真宿主冷启动。

**边界**：冒烟通过 ≠ 宿主兼容。Mock 只覆盖 logger/tools/effect/on 等常见面；输出里的 `mockFallbacks` 列出了插件摸到但 Mock 没提供的属性（含内建 mixin 里 Mock 未全真实现的面）——这个列表越长，本次结果可信度越低。

**契约校验（2026-10-25 实测复盘）**：此前 Mock 对任何未知属性都返回兜底代理，于是插件访问**未声明 `inject`** 的宿主服务（真 Cordis 直接抛 `cannot get property "X" without inject`，装载即崩）时冒烟静默通过——历史 startup 日志里 `failed to register /llm-verifier rpc fallback: cannot get property "webServer" without inject` 就是这一类。现在按真契约判：

- 声明了 `inject` 的服务 Mock 没提供 → 兜底并披露（Mock 缺口，不是插件的错）；
- 未声明的非内建属性 → 抛 `inject_contract` 阶段错（与真宿主同形）。

判据取自 `cordis/lib/index.js` 的 ReflectService 构造与 LoggerService 装配，不是臆造。真冷启动验证仍用原仓库 plugin-upgrade 的 `verify-runtime.mjs`。

### 第六步（可选）：升级时顺带做性能与架构体检

```sh
node scripts/plugin-audit.mjs <插件目录>                                # 纯四维审计
node scripts/plugin-audit.mjs <插件目录> --guide <guide-root> <本机版本> <目标版本>   # 叠加官方指南交叉
```

四个维度从 100 分扣：性能（同步 I/O、无上限读取）、弹性（强依赖已移除包）、上下文预算（工具 Schema 体积）、生命周期（监听器与定时器清理）。检测走 scanner 状态机，注释和字符串里的同名词不算命中。报告带 `targetForm`（plugin/tool）：目标是不是 DSH 插件看生态信号（package.json 的 `dsh` 命名空间、`@deepseek-ai/*` 依赖），工具仓跳过生命周期维度——对普通 Node 脚本建议 `ctx.effect` 是形态错配的噪音（2026-10-25 自审实录）。三条 INFO 级提示不扣分：import type 引用已移除包（编译期风险非运行时）、peer 窗口按严格 semver 不含目标宿主（本生态 bundle 安装不强制 peer，是声明性约定；建议先经 satisfiesRange 自验证再输出）、工具描述里的宿主路径约定在宿主代码零命中（可能旧版约定已消亡，如 .dsh-filess，需人工确认）。

带 `--guide` 时与 code-scan 同源交叉：package 命中先经宿主实测核查（包仍在目标宿主 → 降级 info 证伪；确实不存在 → HIGH 扣分附官方修法），命中清零前不建议先做性能优化。新版本引入的接缝（弱依赖 `ctx.get()` 替代强 import、peer 范围写法）就是「按新依赖做架构调整」的依据。

**peer 修补建议**：对不含目标宿主的 peer 范围，`peerPatch` 给「与目标同三元组的 caret 线」替换写法，且每条都先用 `satisfiesRange` 自验证覆盖目标（验证不过的写法不给）。只对 `@deepseek-ai/dsh` 及其 `dsh-*` 套件子包生成——同 scope 的库（`@deepseek-ai/schemastery`、`@deepseek-ai/cordis`）有自己的版本线，拿宿主版本套它们的 peer 会给出错到离谱的建议。**只生成不自动改包**：改用户 `package.json` 是不可逆写，`--peer-patch` 打印后人工确认再落。

## 宿主日志一键诊断（log-doctor）

```sh
node scripts/log-doctor.mjs [--logs <目录>] [--limit 5] [--pattern '^startup-']
```

宿主启动失败（`StartupError`、端口占用、未声明 inject、客户端入口死链）此前要人工逐个 grep `~/.dsh/logs/startup-*.log`，再从 300 多行的 JS 字面量里抠 `failedPlugins` 与 `waitingForServices`。本脚本把这条排障路径固化：解析每份 startup 日志的头部元信息与多行 error 块、消息数组（容忍宿主的 `[length]: N` 伪数组标记），抽取预置信号，汇总成按根因分组的诊断并给可执行动作。

输出：`runs`（每份日志的 meta/failedPlugins/waitingForServices/signals）、`signalSummary`（按出现次数排序的信号 + 动作）、`verdict`（`clean`/`warnings`/`host-failure`）。非 startup 日志（maintain/env-sweeper/web-restart）只按全文扫信号。**边界**：日志是宿主写的 JS 字面量（非 JSON），只做行级启发式解析，解析不到的字段留 `null` 不猜；信号是文本命中，动作是「怎么确认/怎么修」的第一步，不替用户拍板。

## 下游技能同步（sync-skill）

```sh
node scripts/sync-skill.mjs --dest <下游技能目录> --check   # 只查漂移（退出码 1 = 有漂移）
node scripts/sync-skill.mjs --dest <下游技能目录>            # 同步
```

独立仓拆分后，`dsh-plugin-upgrade-skill/skills/plugin-fast-adapt` 留了一份静态副本；两份都是真文件时下游会静默滞后（2026-10-25 实测：主仓已加客户端半三层判定，下游还缺 `lib/client-graph.mjs`、`SKILL.md` 也旧），滞后副本被误跑时查不出新问题。同步面固定为技能读者真正会用的文件：`SKILL.md`、`README.md`、`README.en.md`、`references/**`、`scripts/**`（`package.json` 不入技能面）。`--check` 报缺失与内容漂移，`--dry-run` 只打印不落盘。同步完成后打印建议的镜像仓提交命令（只 add 同步路径防夹带、commit 主题带真源短 commit；两侧路径先 realpath，防 macOS /var 软链前缀错位），不自动提交。

## 造插件：从零开始

第一步用本 skill 的 scaffold 一条命令出可冒烟骨架：

```sh
node scripts/scaffold.mjs <namespace>/<name> --form tool|hook|service|config|llm-adapter [--out <目录>] [--harness <版本>] [--no-smoke]
```

它只做确定性的事，不碰裁量：

- **五件套生成**：package.json（免构建纯 ESM 不变量：`type: module`、main 与 exports 双指 `lib/index.js`、files 含挂载层）、按形态的最小可跑入口（tool 用 raw JSON Schema 注册、hook 走 waterfall 并显式 `next()`、service/config/llm-adapter 用宿主基类形态）、`cordis.patch.yml` 最小挂载条目（没有它装了不生效，env-doctor 的 activation 查的就是这层）、`dsh-plugin.naming.json`、README＋.gitignore
- **命名投影**：loader id／service／tool／command／skill／event／route 全部按上游 naming-conventions 的 collision-resistant 规则从 coordinate 推导，生成物已过上游 validate-names 的 `--strict` 校验（0 错误 0 警告）
- **当场验证**：tool/hook 两形态零依赖直接冒烟（生成即验证注册）；service/config/llm-adapter 依赖宿主 `@deepseek-ai/*` 基类，诚实跳过冒烟并标注装包后手动跑；llm-adapter 的基类 import 来源上游文档没有钉死，骨架里是 TODO 占位，生成后必须对照目标宿主 checkout 核名

目标目录非空即拒绝（不动用户文件）；非法 coordinate 在写盘前拒绝。骨架只保证结构与命名合规，能力实现仍以真源文档为准：

| 需求 | 去 where |
| --- | --- |
| 五形态完整契约（execute 义务、waterfall 语义、Schema 规则、协议义务清单） | [原仓库 plugin-write skill](https://github.com/oh-my-dsh/dsh-plugin-upgrade-skill/tree/main/skills/plugin-write) 的五份 form reference |
| 公共命名规范与注册表冲突检查 | plugin-write 的 naming-conventions 与 registry-check reference（validate-names / query-registry 两脚本） |
| Cordis 教程、API、cookbook | 官方仓库 `deepseek-harness/docs/` 的 cordis-tutorial、cordis-api、cookbook |
| 造完之后 | 一条命令过体检门：`node scripts/write-gate.mjs <插件目录>` —— 冒烟＋启用就绪＋四维体检＋官方指南核查出「出生证」报告（也可拆开单跑：quick-smoke 秒验 → env-doctor 看启用就绪 → plugin-audit 体检 → code-scan 对目标版本核查） |

### 体检门的判定分层（write-gate）

硬门禁只有三条，fail 即退出码 1：入口产物存在、冒烟通过、对官方指南 critical 零命中。其余全部只透传不拍板——audit 四维分数与 MEDIUM 清单、scan 的 high/medium 命中（带 evidence）、mockFallbacks、尚未挂载 profile 的事实，全部进 discretion 区标「人工裁量」，因为 plugin-audit 的诚实保留信号（如宿主契约下同步是唯一合法写法）和 env-doctor 的未决语义 WARN 替用户判「合格」就是把裁量题伪装成判定题。指南自动发现：显式 `--guide` 优先，否则用本机宿主版本查 guide-sync 缓存（零网络），都没有就诚实跳过并给补法。新插件核查面是全部历史走廊（localVersion=null 窗口放行全部指南）：新代码不该 import 任何已被移除的包，不管哪个版本移除的。刚 scaffold 完加 `--skip-smoke` 免重复冒烟。

## 批量场景：整批已装插件的宿主升级巡检

本 skill 一次深查一个插件。宿主刚升级、要把整批已装插件全量过一遍时，先用原仓库 [plugin-fleet-sweep](https://github.com/oh-my-dsh/dsh-plugin-upgrade-skill/tree/main/skills/plugin-fleet-sweep) 做批量筛查，筛出有问题的插件再逐个回到本 skill 的六步流水线深查——批量管广度，本 skill 管深度。

## 老插件：官方指南覆盖不到时

官方 upgrade-guide 最早只到 dsh-v0.1.7-rc.2。插件更老、目标版本更老，或跨大段历史走廊时，`code-scan` 会报 `guidesConsidered = 0`——这时转 [老插件迁移 SOP](references/legacy-migration-sop.md)：用原仓库 [plugin-upgrade skill](https://github.com/oh-my-dsh/dsh-plugin-upgrade-skill/tree/main/skills/plugin-upgrade) 的人工卡片走廊（dsh-v0.1.0-rc.8 起 19 条边 + 跳版卡）当差异来源，按七阶段 checklist 走：定模式 → 只读准备 → 幽灵宿主检查 → 组装走廊 → 七类触点 → 计划确认 → 六层验证。两套工具的分工速查也在 SOP 里：有 guide 的段用本 skill 的 `code-scan`，没 guide 的段用原版的 `plan-migration.mjs` 和卡片，运行时验证用原版的 `verify-runtime.mjs`。

## 怎么读结果

**命中为零不代表没问题，代表「在官方指南覆盖的范围内没踩到」。** 指南只记录官方认为需要通知的破坏性变更，不覆盖所有可能性。

**命中要多看一眼是不是误报。** 这个技能的锚点匹配做了几层降噪（见 `references/heuristics.md`），但同名符号仍然可能撞车，比如插件里的 `path.resolve()` 和 guide 里的 `runtime.resolve()`。判断方法：看命中位置的代码上下文，确认那个符号是不是真的来自宿主 API。

**`member` 命中里，如果符号是 guide 的「迁移目标」就不会出现。** 插件用了新 API 说明已经适配过，报了只是噪音。

## 安全边界

- **只读为主**。`env-doctor`、`code-scan`、`plugin-audit` 完全不写文件。
- **`quick-smoke` 会执行插件代码**（动态 import 入口模块）。它只用于你自己的插件或审过的代码，不要对来路不明的目录跑。执行面限于 Node 进程内，但插件代码理论上能做任何 Node 能做的事。
- **自愈默认 dry-run**。`env-heal` 不加 `--apply` 只报告；加了也是「移动」而不是删除，进 `~/.dsh/.trash/<日期>/`。
- **不改 DSH 本体**。只读环境信息，不动 `~/.dsh` 下的配置和 profile 声明。
- **不自动改插件代码**。只报命中和官方修法，改不改、怎么改由人决定；`plugin-audit --peer-patch` 也只打印建议不写 `package.json`。
- **`sync-skill` 显式写下游目录**，只复制固定技能面（`SKILL.md`/`README*`/`references`/`scripts`），`--check`/`--dry-run` 供先确认；改的是下游副本，不动主仓。
- **网络只在 `--clone` 时用**。npm registry 和 git clone 都有超时，失败会明确报错而不是静默跳过；dist-tags 有 1 小时缓存，网络失败时降级用旧缓存并标 stale。
- **日志只落本机**。run.mjs 的运行日志写在 `~/.cache/dsh-plugin-fast-adapt/runs/`，含本地路径与用户名，外发前必须 `run-log.mjs sanitize`。

## 自检

```sh
npm test
```

129 项断言，覆盖扫描器不误报（注释和字符串里的同名词不算命中）、不漏报、真实 semver 范围判定（prerelease tuple 规则，本轮与宿主自带 semver 对拍的 30 例锚点回归）、扫描窗口计算（宿主包 peer 精确匹配、cordis/schemastery 版本线不混入、倒挂守卫回退留痕）、目标形态判定（dsh 命名空间/生态依赖证据、非插件 N/A、工具仓跳过 Cordis 生命周期）、import type 区分、宿主实测核查分级、描述漂移检测、指南出处锚点（guideFile/guideLine 落盘往返）、接缝查询双源结论（一致已移除/宿主仍在报分歧/无记录如实说/探不到宿主不伪造）、运行日志×宿主日志交叉核对、--real-smoke 桥接档位（fail→退出码 2、tail 归因透传、失败指路）、一键编排与运行日志（写入/索引/脱敏往返、phases 三态、dirty 标记、90 天保留清理）、上游盯梢退出码（upgrade-available→1 其余→0）、同步提交命令建议（git 仓给只 add 同步路径的命令、非 git 静默跳过）、版本启发式、替换对识别、端到端命中、SOP 引用完整性、dist-tags 缓存三态、冒烟验证（含未声明 inject 契约拦截与 Mock 缺口披露）、四维审计（含 peer 修补建议）、启用诊断（宿主半 Silent Pending＋客户端半三层判定：声明/产物/注入名册死链）、环境层盲区三处（共享 node_modules 农场悬空软链的 critical/info 分级、全局 patch 层对所有 profile 生效且 disabled 也参与判定、入口解析按 exports 优先于 main 防无 main 包被误报 ERROR）、创作脚手架（五形态生成与冒烟闭环、命名投影语法、挂载层可识别、非法输入与非空目录拒绝）、创作体检门（硬门禁拦截、软指标不越权判红、跳过语义、scaffold 衔接）、日志诊断（startup 头部/失败插件/等待服务/信号/跨文件汇总）、下游同步漂移检查＋真机零漂移拦截、self-test 体积门禁（超 2200 行即红）、跨平台模拟（Windows 根探测与缓存隔离）、文档断言数防漂移、扫描性能回归门。零网络、零外部依赖，任何机器上都能跑（Windows 分支已做模拟验证，真机待验）。

提交前门禁：`git config core.hooksPath .githooks`（一次性）启用 pre-commit 钩子，commit 时自动跑本自检——改完真源忘了 sync-skill 在这一刻被拦，不用等有人跑 npm test。

## 脚本清单

| 脚本 | 职责 |
| --- | --- |
| `scripts/run.mjs` | 一键编排全流程 + 写本地运行日志 |
| `scripts/run-log.mjs` | 运行日志查看（list/show）与脱敏导出（sanitize） |
| `scripts/env-doctor.mjs` | 探测本机 DSH 环境（版本、覆盖层、共享农场悬空软链、两层 patch、插件、进程、宿主半＋客户端半启用就绪度） |
| `scripts/env-heal.mjs` | 覆盖层旧包自愈（默认 dry-run） |
| `scripts/guide-sync.mjs` | 定目标版本 + 取官方升级指南（dist-tags 带 1 小时缓存，失败降级旧缓存） |
| `scripts/code-scan.mjs` | 扫描插件代码，匹配官方变更锚点（findings 带指南文件＋行号出处） |
| `scripts/seams.mjs` | 接缝查询：一个包名/API 符号在指南锚点表与本机宿主里的双源结论 |
| `scripts/quick-smoke.mjs` | 修完秒验（内存级 Cordis 冒烟，含 Mock 兜底披露） |
| `scripts/plugin-audit.mjs` | 四维性能架构体检，可叠加官方指南交叉；`--peer-patch` 打印已验证的 peer 修补建议 |
| `scripts/log-doctor.mjs` | 一键解析 `~/.dsh/logs/` 的宿主故障（startup 头部/失败插件/等待服务/信号汇总） |
| `scripts/sync-skill.mjs` | 把技能面同步到下游技能目录，`--check` 查漂移 |
| `scripts/self-test.mjs` | 自检 |
| `scripts/lib/scanner.mjs` | 词法扫描器与版本比较（零依赖） |
| `scripts/lib/guide-parser.mjs` | 官方指南解析与锚点抽取（含移除动词语义门） |
| `scripts/lib/runlog.mjs` | 运行日志写入、索引与脱敏 |
| `scripts/lib/client-graph.mjs` | 客户端半三层判定：dsh.client 声明校验、./client 产物解析、注入名册死链（强弱证据分档） |
| `references/legacy-migration-sop.md` | 老插件迁移 SOP（官方指南覆盖不到时的对照手册） |
| `references/ci-snippet.md` | 插件仓 CI 门禁模板（把「升级后插件报错」提前到提交时：冒烟/typecheck 硬门＋体检软门） |
