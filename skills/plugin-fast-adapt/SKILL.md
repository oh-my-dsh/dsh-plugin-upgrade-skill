---
name: plugin-fast-adapt
description: DSH 插件适配与破坏性变更核查。查 DeepSeek 官方最新版本，取该版本的官方升级指南，扫描本机插件代码，报出哪些地方踩了破坏性变更并给出官方修法；同时巡检本机 DSH 环境（profiles 覆盖层旧包残留、已装插件、运行中宿主）。老版本插件（官方指南覆盖不到 v0.1.7-rc.2 之前的走廊）转迁移 SOP，对照姊妹 skill 的人工卡片走廊走七阶段流程。当需要把 DSH 插件适配到新版本或老版本、排查升级后插件报错、核查插件是否用了已移除的包或 API、检查 ~/.dsh 覆盖层有无旧包残留时使用。触发词：适配 DSH 插件、升级插件、插件不兼容、dsh 升级后报错、插件用了废弃 API、检查覆盖层旧包、老版本 DSH 适配、历史走廊迁移。
---

# plugin-fast-adapt

## 这个技能只做事

把「插件适配到新版 DSH」拆成四步，每步一个脚本，每步都能单独跑：

| 步 | 脚本 | 回答什么 |
| --- | --- | --- |
| 1 探测环境 | `scripts/env-doctor.mjs` | 本机装的 DSH 是哪个版本？覆盖层有没有旧包？装了哪些插件？ |
| 2 定版本 | `scripts/guide-sync.mjs` | 官方最新版本是什么？本机该不该跟？跟哪个？ |
| 3 取差异 | `scripts/guide-sync.mjs --clone` | 本机到目标版本之间，官方列了哪些破坏性变更？ |
| 4 查命中 | `scripts/code-scan.mjs` | 本机插件代码踩了其中哪几条？官方给的修法是什么？ |

**不依赖任何人工维护的知识卡片。** 权威来源只有两处：npm registry 的版本信息，和 deepseek-harness 仓库的 `docs/upgrade-guide/`。所以上游发新版的那一刻，这个技能就自动跟上了，不存在「卡片滞后」的问题。

## 怎么用

### 第一步：看清本机环境

```sh
node scripts/env-doctor.mjs <插件目录>
```

输出 JSON，重点看四段：

- `globalDsh`：全局安装的 DSH 版本和位置
- `overlayFindings`：profiles 覆盖层里与主安装脱节的包，带 severity 和原因
- `runningProcesses`：正在跑的 DSH 宿主进程（改 Host 侧代码后必须重启它）
- `target.peerWindows`：待查插件自己声明的 peer 版本窗口

`overlayFindings` 非空时，先处理覆盖层再谈适配。这是 issue #263 那一类事故：宿主升级后覆盖层里残留旧包，旧包优先解析导致运行时装载冲突，而且只换文件不重启宿主还会复现。

```sh
node scripts/env-heal.mjs           # dry-run，只报告
node scripts/env-heal.mjs --apply   # 真的移动（移到 ~/.dsh/.trash/<日期>/，不删除）
```

### 第二步：定目标版本

```sh
node scripts/guide-sync.mjs <本机版本>
```

它读 npm 的 `dist-tags`（`latest` / `next` / `alpha`），然后判断本机在官方通道里的位置：

| 判定 | 含义 | 下一步 |
| --- | --- | --- |
| `upgrade-available` | 官方有更高版本 | 取 `target` 继续 |
| `up-to-date-on-channel` | 本机已是某通道的最新版 | 无需适配，收工 |
| `ahead-of-upstream` | 本机比官方所有通道都新 | 无需适配，收工 |
| `unknown-local` | 没检测到本机版本 | 默认跟 `latest`，但要人工确认 |

**不要盲目取 `latest`。** 本机完全可能跑在 `next` 线上，比 `latest` 还新一版；这时候报「建议升级到 latest」是倒退。

有 `target` 时，取该版本的官方升级指南：

```sh
node scripts/guide-sync.mjs <本机版本> --clone
```

优先复用本机已有的 harness clone（自动发现 `~/Documents/*/deepseek-harness`，或用 `DSH_HARNESS_CLONE` 指定），没有才 sparse clone 到 `~/.cache/dsh-plugin-fast-adapt/`。

### 第三步：查插件踩了哪些变更

```sh
node scripts/code-scan.mjs <插件目录> <upgrade-guide 目录> <本机版本> <目标版本>
```

`<upgrade-guide 目录>` 是官方指南根目录，例如 `~/layerfs-lab/deepseek-harness/docs/upgrade-guide`，或者上一步 clone 出来的 `~/.cache/dsh-plugin-fast-adapt/harness-dsh-v<version>/docs/upgrade-guide`。

输出三段：

- `findingsByGuide`：按官方变更条目分组的命中，每条带 `guide`、`title`、`migration`
- `migration`：官方给的修法原文（从该指南的 Migration 段抽出来的相关步骤）
- `findingCount` / `guidesConsidered`：命中数与参考的指南条数

命中分三类：`package`（import 了已移除或已改名的包）、`member`（调用了已移除的方法或字段）、`code`（字符串里出现已变更的错误码或事件名）。

## 老插件：官方指南覆盖不到时

官方 upgrade-guide 最早只到 dsh-v0.1.7-rc.2。插件更老、目标版本更老，或跨大段历史走廊时，`code-scan` 会报 `guidesConsidered = 0`——这时转 [老插件迁移 SOP](references/legacy-migration-sop.md)：用姊妹 skill plugin-upgrade 的人工卡片走廊（dsh-v0.1.0-rc.8 起 19 条边 + 跳版卡）当差异来源，按七阶段 checklist 走：定模式 → 只读准备 → 幽灵宿主检查 → 组装走廊 → 七类触点 → 计划确认 → 六层验证。两套工具的分工速查也在 SOP 里：有 guide 的段用本 skill 的 `code-scan`，没 guide 的段用原版的 `plan-migration.mjs` 和卡片，运行时验证用原版的 `verify-runtime.mjs`。

## 怎么读结果

**命中为零不代表没问题，代表「在官方指南覆盖的范围内没踩到」。** 指南只记录官方认为需要通知的破坏性变更，不覆盖所有可能性。

**命中要多看一眼是不是误报。** 这个技能的锚点匹配做了几层降噪（见 `references/heuristics.md`），但同名符号仍然可能撞车，比如插件里的 `path.resolve()` 和 guide 里的 `runtime.resolve()`。判断方法：看命中位置的代码上下文，确认那个符号是不是真的来自宿主 API。

**`member` 命中里，如果符号是 guide 的「迁移目标」就不会出现。** 插件用了新 API 说明已经适配过，报了只是噪音。

## 安全边界

- **只读为主**。`env-doctor` 和 `code-scan` 完全不写文件。
- **自愈默认 dry-run**。`env-heal` 不加 `--apply` 只报告；加了也是「移动」而不是删除，进 `~/.dsh/.trash/<日期>/`。
- **不改 DSH 本体**。只读环境信息，不动 `~/.dsh` 下的配置和 profile 声明。
- **不自动改插件代码**。只报命中和官方修法，改不改、怎么改由人决定。
- **网络只在 `--clone` 时用**。npm registry 和 git clone 都有超时，失败会明确报错而不是静默跳过。

## 自检

```sh
npm run test:fast-adapt
```

34 项断言，覆盖扫描器不误报（注释和字符串里的同名词不算命中）、不漏报、版本启发式、替换对识别、端到端命中、SOP 引用完整性。零网络、零外部依赖，任何机器上都能跑。

## 脚本清单

| 脚本 | 职责 |
| --- | --- |
| `scripts/env-doctor.mjs` | 探测本机 DSH 环境（版本、覆盖层、插件、进程） |
| `scripts/env-heal.mjs` | 覆盖层旧包自愈（默认 dry-run） |
| `scripts/guide-sync.mjs` | 定目标版本 + 取官方升级指南 |
| `scripts/code-scan.mjs` | 扫描插件代码，匹配官方变更锚点 |
| `scripts/self-test.mjs` | 自检 |
| `scripts/lib/scanner.mjs` | 词法扫描器与版本比较（零依赖） |
| `scripts/lib/guide-parser.mjs` | 官方指南解析与锚点抽取 |
| `references/legacy-migration-sop.md` | 老插件迁移 SOP（官方指南覆盖不到时的对照手册） |
