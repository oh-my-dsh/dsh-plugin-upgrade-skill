# plugin-fast-adapt

**简体中文** | [English](README.en.md)

DSH 插件适配与破坏性变更核查。查官方最新版本，取该版本的官方升级指南，扫描本机插件代码，报出踩了哪些破坏性变更、官方给的修法是什么。

## 它和「升级卡片库」的区别

常见的做法是人工维护一份版本迁移知识库：每个版本区间手写几十张卡，写清什么坏了、怎么修。这种做法的宿命是**滞后**——DSH 上游一次跃迁可以改动数千个文件，卡片写完就已经过时，中间还会出现「走廊缺口」。

这个技能换了个思路：**不维护知识，只维护取知识的方法**。

破坏性变更的权威描述在 DeepSeek 官方仓库的 `docs/upgrade-guide/<版本>/<主题>/guide.md` 里。官方发版时同步更新，格式固定，有 `## Change`（什么变了）和 `## Migration`（怎么改）。版本信息在 npm registry 的 `dist-tags` 里。

两处都是官方源，所以**上游发新版的那一刻，这个技能就自动跟上了**。

## 四步流程

```sh
# 1. 看清本机环境：装的哪个版本、覆盖层有没有旧包、装了哪些插件
node scripts/env-doctor.mjs <插件目录>

# 2. 定目标版本：官方最新是什么、本机该不该跟
node scripts/guide-sync.mjs <本机版本>

# 3. 取该版本的官方升级指南（优先复用本机 clone，没有才拉取）
node scripts/guide-sync.mjs <本机版本> --clone

# 4. 查插件踩了哪些变更
node scripts/code-scan.mjs <插件目录> <upgrade-guide 目录> <本机版本> <目标版本>
```

覆盖层有旧包残留时先自愈（默认 dry-run）：

```sh
node scripts/env-heal.mjs           # 只报告
node scripts/env-heal.mjs --apply   # 移动到 ~/.dsh/.trash/<日期>/，不删除
```

## 依赖

零外部依赖。只用 Node 内置模块（`node:fs`、`node:path`、`node:os`、`node:child_process`），加 `git` 和 `npm` 命令。

没有 TypeScript、没有 AST 库、没有网络请求库。Node 18+ 即可运行（类型剥离是可选路径，默认关闭）。

## 扫描精度

初版用朴素正则，扫一个真实插件报了 12 处命中，逐一核对后**12 处全是误报**。现在的版本做了四层降噪，同一个插件的命中是 0。

规则和实测依据见 [references/heuristics.md](references/heuristics.md)，要点：

- 扫描器用状态机跳过注释和字符串，注释里的同名词不算命中
- 完整点链优先，丢掉 `ctx.tools` 这种过于通用的父链
- 通用词（`register`、`resolve`、`readFile`）和短名不进锚点表
- 识别「旧 → 新」替换对，插件用了新符号说明已适配，不再报
- 常量锚点只从 `Change` 段抽，`Migration` 段里的示例值不算
- 匹配时要求对象部分互为后缀，`engines.dsh` 不会撞 `result.dsh`

自检覆盖这些规则，33 项断言：

```sh
npm run test:fast-adapt
```

## 脚本

| 脚本 | 职责 |
| --- | --- |
| `scripts/env-doctor.mjs` | 探测本机 DSH 环境 |
| `scripts/env-heal.mjs` | 覆盖层旧包自愈（默认 dry-run） |
| `scripts/guide-sync.mjs` | 定目标版本 + 取官方升级指南 |
| `scripts/code-scan.mjs` | 扫描插件代码，匹配官方变更锚点 |
| `scripts/self-test.mjs` | 自检 |
| `scripts/lib/scanner.mjs` | 词法扫描器与版本比较 |
| `scripts/lib/guide-parser.mjs` | 官方指南解析与锚点抽取 |

## 安全姿态

- `env-doctor` 和 `code-scan` 完全只读
- `env-heal` 默认 dry-run，真动手也是移动不删除
- 不改 DSH 本体，不动 `~/.dsh` 下的配置和 profile 声明
- 不自动改插件代码，只报命中和官方修法
- 网络只在 `--clone` 时用，都有超时，失败明确报错

## 已知局限

官方升级指南不覆盖所有破坏性变更（包废弃一类实测查不到），那一类靠 `env-doctor` 的覆盖层巡检兜。同名符号仍可能撞车，只能靠人看上下文判断。这个技能只做静态匹配，不验证运行时行为。
