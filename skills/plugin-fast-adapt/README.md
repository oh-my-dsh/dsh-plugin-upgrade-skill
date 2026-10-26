# plugin-fast-adapt

**简体中文** | [English](README.en.md)

[![CI](https://github.com/taxueseek/plugin-fast-adapt/actions/workflows/ci.yml/badge.svg)](https://github.com/taxueseek/plugin-fast-adapt/actions/workflows/ci.yml) [![License: MIT](https://img.shields.io/badge/license-MIT-green.svg)](LICENSE) [![Node](https://img.shields.io/badge/node-%3E%3D22.13-blue.svg)](package.json) [![外部依赖](https://img.shields.io/badge/外部依赖-0-blue.svg)](#依赖与自检) [![自检](https://img.shields.io/badge/自检-129%20项零网络-brightgreen.svg)](#依赖与自检)

> **DSH 每次发新版，老插件就可能启动不了。** 这个技能直连 DeepSeek 官方升级指南，扫你的插件代码，报出踩了哪几条破坏性变更、官方给的修法是什么；还能一条命令从零造出可冒烟的插件骨架。

## 速览

| | |
| --- | --- |
| 上游发新版 | 无需任何改动，直接可用（直连官方源，不维护知识卡片） |
| 扫描误报 | 12 处 → 0（四层降噪） |
| 验证一次改动 | 3600 秒真宿主冷启动 → 毫秒级内存冒烟 |
| 自检 | 129 项断言，零网络，任何机器能跑 |
| 外部依赖 | 0（只用 Node 内置模块 + `git`/`npm` 命令） |
| 造插件 | 一条命令出五形态可冒烟骨架，写完再过体检门 |

## 它解决什么

DSH（DeepSeek Harness）是一个「所有功能都以插件形式存在」的 AI 运行框架，麻烦在于每次发新版，老插件就可能启动不了。常见的应对是手写升级卡片：每个版本区间写几十张卡，记清什么坏了、怎么修。这条路有三个绕不过去的问题：

1. **卡片写完就过时**。上游一次跃迁能改动数千个文件，卡片之间还有覆盖不到的「走廊缺口」。
2. **大知识库挤占推理空间**。论文实测，弱模型（qwen3.8-27b）带全套卡片库答题，56 题等权差 -3.07 pp（7 题改善、18 题退化、31 题持平）。
3. **验证太贵**。改一次验一次要等真宿主冷启动，实测有过 3600 秒超时；宿主升级后 profiles 覆盖层残留旧包，还会导致插件装载冲突。

本项目的取舍是：**不维护知识，只维护取知识的方法。** 破坏性变更的权威描述在 DeepSeek 官方仓库的 `docs/upgrade-guide/<版本>/<主题>/guide.md`，官方发版时同步更新，格式固定（`## Change` 讲什么变了，`## Migration` 讲怎么改）；版本信息在 npm registry 的 `dist-tags`。两处都是官方源，所以上游发新版的那一刻，这个技能就自动跟上了。

### 优势

- **自动跟上新版**：直连官方 `docs/upgrade-guide/` 与 npm `dist-tags`，上游发版即生效，没有卡片滞后也没有走廊缺口
- **误报清零**：四层降噪把真实插件的命中从 12 处误报降到 0，每条命中带 `severity`、`evidence` 和直达官方指南的出处锚点
- **验证便宜**：内存级 Cordis 冒烟毫秒到秒级出结果，不用真宿主冷启动；需要真证据时 `--real-smoke` 再补干净 profile 真装真启档
- **零外部依赖**：只用 Node 内置模块加 `git`/`npm` 命令，没有 TypeScript、没有 AST 库、没有网络请求库
- **可复现**：129 项自检零网络，任何机器能跑；CI 在 push 和 PR 上自动跑
- **不止适配**：`scaffold.mjs` 一条命令生成五形态可冒烟骨架，`write-gate.mjs` 写完出「出生证」
- **边界诚实**：冒烟通过不等于宿主兼容，这句话写在工具输出里；体检的软指标只透传，不替用户说「合格」

## 安装

用 skills CLI（推荐，一条命令装到它支持的 agent）：

```sh
npx skills add taxueseek/plugin-fast-adapt
```

Claude Code marketplace：

```sh
/plugin marketplace add taxueseek/plugin-fast-adapt
/plugin install plugin-fast-adapt
```

npm（带 `plugin-fast-adapt` 命令，转发到一键编排）：

```sh
npx plugin-fast-adapt <插件目录>
```

手动安装：

```sh
git clone https://github.com/taxueseek/plugin-fast-adapt.git
# 把仓库根目录（SKILL.md 所在处）作为 skill 目录接入你的 agent
# Cursor 用户：cp -r plugin-fast-adapt/* .cursor/skills/plugin-fast-adapt/
```

## 流程

一条命令跑完全链（推荐），每次运行自动写本地日志：

```sh
node scripts/run.mjs <插件目录>          # 环境→定版→指南→扫描→体检→冒烟→typecheck
node scripts/run.mjs <插件目录> --real-smoke   # 再补一档：干净 profile 真装真启（桥接原仓库 verify-runtime）
node scripts/run-log.mjs list           # 回看历史运行（含工具版本@commit）
node scripts/run-log.mjs doctor         # 运行日志 × 宿主启动日志交叉核对（插件报错先跑它）
node scripts/run-log.mjs sanitize --latest --out share.json   # 脱敏后才可外发
```

也可以按步单跑（六步主干保留，run.mjs 就是把下面这些串起来，可选步按需加）：

```sh
# 1. 看清本机环境：装的哪个版本、覆盖层有没有旧包、装了哪些插件、启用就绪度
node scripts/env-doctor.mjs <插件目录>

# 2. 定目标版本：官方最新是什么、本机该不该跟
node scripts/guide-sync.mjs <本机版本>

# 2b. 上游盯梢（可直接接 cron/agent 轮询）：1=有新版（顺手预取指南），0=无需动作
node scripts/guide-sync.mjs --check

# 3. 取该版本的官方升级指南（优先复用本机 clone，没有才拉取）
node scripts/guide-sync.mjs <本机版本> --clone

# 4. 查插件踩了哪些变更
node scripts/code-scan.mjs <插件目录> <upgrade-guide 目录> <本机版本> <目标版本>

# 4b. 接缝查询：某个包/API 在官方指南与本机宿主里的双源结论
#     （指南说没说 × 宿主 node_modules 实测在不在，双源一致才下「已移除」）
node scripts/seams.mjs dsh-settings
```

覆盖层有旧包残留时先自愈（默认 dry-run）：

```sh
node scripts/env-heal.mjs           # 只报告
node scripts/env-heal.mjs --apply   # 移动到 ~/.dsh/.trash/<日期>/，不删除
```

两个可选步骤补全「造完即验、升级顺带优化」：

```sh
# 5. 修完秒验：内存级 Cordis 冒烟，验证模块加载、apply 契约、工具注册
#    未声明 inject 的宿主服务访问会被拦（真 Cordis 同形契约错）
node scripts/quick-smoke.mjs <插件目录>

# 6. 升级时顺带做四维体检：性能、弹性、上下文预算、生命周期
node scripts/plugin-audit.mjs <插件目录>
node scripts/plugin-audit.mjs <插件目录> --guide <guide-root> <本机版本> <目标版本>
node scripts/plugin-audit.mjs <插件目录> --guide <guide-root> <本机版本> <目标版本> --peer-patch  # 打印已验证的 peer 修补

# 7. 宿主启动失败一键诊断：StartupError / 端口占用 / 未声明 inject / 客户端入口死链
node scripts/log-doctor.mjs --pattern '^startup-' --limit 5

# 8. 把技能面同步到下游技能目录（--check 只查漂移）
node scripts/sync-skill.mjs --dest <下游技能目录> --check
```

## 扫描精度：从 12 处误报到 0

初版用朴素正则，扫一个真实插件报了 12 处命中，逐一核对后**12 处全是误报**。现在的版本做了四层降噪，同一个插件的命中是 0：

- 扫描器用状态机跳过注释和字符串，注释里的同名词不算命中
- 完整点链优先，丢掉 `ctx.tools` 这种过于通用的父链
- 通用词（`register`、`resolve`、`readFile`）和短名不进锚点表；识别「旧 → 新」替换对，插件用了新符号说明已适配，不再报
- 常量锚点只从 `Change` 段抽；匹配时要求对象部分互为后缀，`engines.dsh` 不会撞 `result.dsh`
- 包名词义门：包名只在与移除/改名动词同句时才成为锚点，语境引用（「The mode fields of X accept only …」讲字段取值）不算——实测 dsh-files 的 3 处 critical 全是这类误报，加门后归零

命中带 `severity`（package=critical、member=high、code=medium，先修排前面的）、`evidence`（命中行原文，核对误报不用开文件）和出处锚点（`guideFile`/`guideLine`，直达官方指南原文位置）。规则与实测依据见 [references/heuristics.md](references/heuristics.md)。扫描根取源码根并集（`src` 与同级 `client`/`web`/`ui`），`lib`/`dist` 构建产物不重复扫。冒烟验证会披露 Mock 兜底：输出里的 `mockFallbacks` 列出插件摸到但 Mock 没提供的属性，这个列表越长，冒烟结果可信度越低——**冒烟通过 ≠ 宿主兼容**，这句话写在输出里，不只写在文档里。冒烟还按真 Cordis 契约拦未声明 `inject` 的宿主服务访问（`inject_contract` 阶段），不再让「装载即崩」的代码静默通过。要真宿主证据时用 `run.mjs --real-smoke`：桥接原仓库 plugin-upgrade 的 `verify-runtime.mjs`，干净 profile 安装→启动→四类归因（脚本不在本机时诚实跳过给补法）。

## 从零造一个插件

```sh
node scripts/scaffold.mjs taxueseek/my-tool --form tool|hook|service|config|llm-adapter [--out <目录>] [--harness <版本>]
```

一条命令生成可冒烟骨架：package.json（免构建纯 ESM 不变量）、按形态的最小可跑入口、`cordis.patch.yml` 挂载条目、`dsh-plugin.naming.json` 命名投影（collision-resistant 规则全量推导，生成物已过上游 validate-names 的 `--strict` 校验）。tool/hook 两形态零依赖当场冒烟（生成即验证注册）；service/config/llm-adapter 依赖宿主 `@deepseek-ai/*` 基类，诚实跳过并标注装包后手动跑。目标目录非空即拒绝，非法 coordinate 在写盘前拒绝。

骨架只保证结构与命名合规，能力实现仍以 [plugin-write](https://github.com/oh-my-dsh/dsh-plugin-upgrade-skill/tree/main/skills/plugin-write) 的五份 form reference 为契约真源。写完能力后一条命令过体检门：

```sh
node scripts/write-gate.mjs <插件目录>   # 出生证：硬门禁自动判，软指标透传待裁量
```

硬门禁仅三条（入口产物存在、冒烟通过、对官方指南 critical 零命中），fail 即退出码 1；audit 分数、high/medium 命中、mockFallbacks、未挂载 profile 全部进 discretion 区标「人工裁量」，不替用户说「合格」。指南自动发现走 guide-sync 缓存（零网络），新插件核查面是全部历史走廊；刚 scaffold 完加 `--skip-smoke` 免重复冒烟。

## 依赖与自检

零外部依赖。只用 Node 内置模块（`node:fs`、`node:path`、`node:os`、`node:child_process`），加 `git` 和 `npm` 命令。

没有 TypeScript、没有 AST 库、没有网络请求库。Node 22.13+ 可运行（`import.meta.dirname` 需 20.11+，可选的类型剥离需 22.13+；类型剥离默认关闭）。

自检：

```sh
npm test   # node scripts/self-test.mjs，129 项断言
```

开发者建议启用提交前门禁（一次性）：`git config core.hooksPath .githooks`——commit 时自动跑自检，改完真源忘了 sync-skill 在这一刻被拦。

覆盖扫描器不误报（注释和字符串里的同义词不算命中）、不漏报、版本启发式、替换对识别、端到端命中（含官方指南文件＋行号出处锚点）、接缝查询双源结论（一致已移除/宿主仍在报分歧/无记录如实说）、运行日志×宿主日志交叉核对、--real-smoke 桥接档位（fail→退出码 2、失败指路）、上游盯梢退出码、同步提交命令建议（只 add 同步路径防夹带）、SOP 引用完整性、dist-tags 缓存三态、冒烟验证（含未声明 inject 契约拦截）、四维审计（含 peer 修补）、启用诊断、创作脚手架（五形态生成、命名投影语法、冒烟闭环、挂载层可识别、非法输入与非空目录拒绝）、创作体检门（硬门禁拦截、软指标不越权判红、跳过语义、scaffold 衔接）、日志诊断、下游同步漂移检查＋真机零漂移拦截、self-test 体积门禁、扫描性能回归门。零网络、零外部依赖，任何机器上都能跑。

给插件自己的仓库加提交时门禁（冒烟/typecheck 硬门＋体检软门），见 [references/ci-snippet.md](references/ci-snippet.md)。

## 脚本

| 脚本 | 职责 |
| --- | --- |
| `scripts/cli.mjs` | npm 入口（`npx plugin-fast-adapt`），转发到 run.mjs |
| `scripts/run.mjs` | 一键编排全流程（环境→定版→指南→扫描→体检→冒烟→typecheck），出统一报告并写本地运行日志；`--real-smoke` 桥接原仓库 verify-runtime 补真冷启动档 |
| `scripts/run-log.mjs` | 运行日志查看（list/show）、交叉核对（doctor：运行日志×宿主启动日志）与脱敏导出（sanitize） |
| `scripts/seams.mjs` | 接缝查询：一个包名/API 符号在官方指南锚点表与本机宿主里的双源结论 |
| `scripts/scaffold.mjs` | 从零造插件：一条命令生成五形态可冒烟骨架（package.json 不变量＋形态入口＋挂载层＋命名投影），生成即验证 |
| `scripts/write-gate.mjs` | 造完即验：编排冒烟＋启用就绪＋四维体检＋官方指南核查出「出生证」；硬门禁仅三条自动判，软指标只透传不拍板 |
| `scripts/env-doctor.mjs` | 探测本机 DSH 环境（版本、覆盖层、插件、进程、启用就绪度） |
| `scripts/env-heal.mjs` | 覆盖层旧包自愈（默认 dry-run） |
| `scripts/guide-sync.mjs` | 定目标版本 + 取官方升级指南（dist-tags 带 1 小时缓存，失败降级旧缓存） |
| `scripts/code-scan.mjs` | 扫描插件代码，匹配官方变更锚点 |
| `scripts/quick-smoke.mjs` | 修完秒验（内存级 Cordis 冒烟，含 Mock 兜底披露） |
| `scripts/plugin-audit.mjs` | 四维性能架构体检，可叠加官方指南交叉；`--peer-patch` 打印已验证的 peer 修补建议 |
| `scripts/log-doctor.mjs` | 一键解析 `~/.dsh/logs/` 的宿主故障（startup 头部/失败插件/等待服务/信号汇总） |
| `scripts/sync-skill.mjs` | 把技能面同步到下游技能目录，`--check` 查漂移 |
| `scripts/self-test.mjs` | 自检 |
| `scripts/lib/scanner.mjs` | 词法扫描器、版本比较与 semver 范围判定（零依赖） |
| `scripts/lib/guide-parser.mjs` | 官方指南解析与锚点抽取（含移除动词语义门） |
| `scripts/lib/runlog.mjs` | 运行日志写入、索引与脱敏 |
| `references/legacy-migration-sop.md` | 老插件迁移 SOP（官方指南覆盖不到时的对照手册） |
| `references/heuristics.md` | 扫描降噪规则与实测依据 |
| `references/ci-snippet.md` | 插件仓 CI 门禁模板（冒烟/typecheck 硬门＋体检软门） |

## 安全姿态

- `env-doctor`、`code-scan`、`plugin-audit`、`log-doctor`、`seams`、`run-log` 完全只读
- `env-heal` 默认 dry-run，真动手也是移动不删除（进 `~/.dsh/.trash/<日期>/`）
- `sync-skill` 显式写下游技能目录，只复制固定技能面（`SKILL.md`/`README*`/`references`/`scripts`），`--check`/`--dry-run` 供先确认
- 不改 DSH 本体，不动 `~/.dsh` 下的配置和 profile 声明
- 不自动改插件代码，只报命中和官方修法；`--peer-patch` 也只打印建议
- 网络只在 `--clone` 时用，都有超时，失败明确报错而不是静默跳过

## 老插件怎么办

官方升级指南最早只到 dsh-v0.1.7-rc.2，更老的插件走 [老插件迁移 SOP](references/legacy-migration-sop.md)：用原项目 [plugin-upgrade skill](https://github.com/oh-my-dsh/dsh-plugin-upgrade-skill/tree/main/skills/plugin-upgrade) 的人工卡片走廊（dsh-v0.1.0-rc.8 起）当差异来源，七阶段 checklist 对照执行（定模式 → 只读准备 → 幽灵宿主检查 → 组装走廊 → 七类触点 → 计划确认 → 六层验证）。文档只做引用不复制，卡片改名会被自检的死链断言拦住。

## 已知局限

- 官方升级指南不覆盖所有破坏性变更（包废弃一类实测查不到），那一类靠 `env-doctor` 的覆盖层巡检兜
- 同名符号仍可能撞车（插件里的 `path.resolve()` 和 guide 里的 `runtime.resolve()`），只能靠人看上下文判断
- 只做静态匹配，不验证运行时行为；冒烟的 Mock 只覆盖常见宿主面

## 上游溯源与分工

本项目从 [oh-my-dsh/dsh-plugin-upgrade-skill](https://github.com/oh-my-dsh/dsh-plugin-upgrade-skill)（教 AI 升级 DSH 插件的 skill 集合，附 [arXiv 论文](https://arxiv.org/abs/2609.30120)）用 git subtree 拆分为独立仓库、独立演进。原项目沉淀了 195 张人工维护的升级卡、11 个 skill 和 63 道自动判分的 benchmark。

两个项目互补而非替代：

| 环节 | 上游 | 本项目 |
| --- | --- | --- |
| 差异来源 | 人工维护的升级卡片库 | 官方 `docs/upgrade-guide/` + npm `dist-tags`，随上游自动更新 |
| 新版本发布 | 等卡片补齐，存在走廊缺口 | 无需任何改动，直接可用 |
| 验证一次改动 | 真宿主冷启动，实测可达 3600 秒 | 内存级 Cordis 冒烟，毫秒到秒级 |
| 覆盖层旧包残留 | 靠人肉排障 | `env-doctor` 巡检 + `env-heal` 自愈（默认 dry-run） |
| 弱模型表现 | 全套卡片进上下文，-3.07 pp | 六个独立脚本，每步只产出一份小输出 |
| 代码级扫描 | 无 | 锚点匹配 + 四层降噪 |
| 批量巡检 | `plugin-fleet-sweep` 管广度 | 六步流水线管深度 |

宿主升级后的整批插件巡检走上游的 [plugin-fleet-sweep](https://github.com/oh-my-dsh/dsh-plugin-upgrade-skill/tree/main/skills/plugin-fleet-sweep)（批量管广度），筛出的个体回到本项目六步流水线深查（本 skill 管深度）。官方指南覆盖不到的历史走廊（v0.1.7-rc.2 之前），本项目的 SOP 引用原项目的卡片和脚本——有 guide 的段用本项目的 `code-scan`，没 guide 的段用原项目的 `plan-migration.mjs` 和卡片，运行时验证用原项目的 `verify-runtime.mjs`（本项目 `run.mjs --real-smoke` 已可直接桥接它）。
