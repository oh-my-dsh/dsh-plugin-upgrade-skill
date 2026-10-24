# 启发式规则与降噪依据

这个技能不做精确语义分析，也不引入 AST 依赖。它用一组启发式规则从官方指南里抽锚点，再扫插件代码做匹配。规则不多，但每一条都对应一类实测误报。

## 一、锚点从哪来

官方 upgrade-guide 的格式是固定的：

```
---
kind: upgrade-guide
description: "..."
---

# 标题
## Change      —— 什么变了
## Migration   —— 怎么改
```

从这个格式里抽三类锚点：

| 类型 | 抽法 | 用途 |
| --- | --- | --- |
| `packages` | `@deepseek-ai/*` 全匹配 | 插件 import 了已移除或已改名的包 |
| `members` | 完整点链（`ctx.tools.presentAs`）+ 裸调用（`installBundle(`） | 插件调用了已移除的方法或字段 |
| `codes` | Change 段里的连字符字符串 | 插件字符串里出现已变更的错误码或事件名 |

## 二、四条降噪规则

初版用朴素正则，扫 session-digger 插件报了 **12 处命中，逐一核对后 12 处全是误报**。下面四条规则就是这次复盘的结果。

### 规则 1：扫描器跳过注释和字符串，但单独收集字符串内容

注释里写 `@deepseek-ai/dsh-settings` 只是说明文字，不是代码调用。字符串里写 `mode: 'read-only'` 是示例值，不是变更项。

实现上不是「用正则排除」，而是先用状态机给每个字符打上 `code` / `comment` / `string` 标记，注释区替换成空格（保持长度），字符串原地保留。这样：

- 注释里的同名词不会被匹配
- 字符串内容单独收进 `strings` 字段，供错误码一类锚点使用
- 匹配到的下标和原文对得上，行号不会错位

**实测**：三行注释/字符串，初版报 3 处「源码契约冲突」，现在 0 处。

### 规则 2：完整点链优先，父链丢弃

抽 `ctx.tools.presentAs` 而不是 `ctx.tools` 加 `tools.presentAs`。前者精确，后者里的 `ctx.tools` 在几乎任何插件里都会出现。

过滤规则：如果锚点 `m` 是另一个锚点的前缀（`other.startsWith(m + '.')`），丢掉 `m`。

裸名不参与这条规则。`installBundle` 是 `import` 进来的函数，插件里往往就是裸调，不能因为存在 `pluginManager.installBundle` 就丢掉它。

### 规则 3：通用词和短名不进锚点表

`register`、`resolve`、`readFile` 这类词在任何插件里都会出现，拿它们匹配只会制造噪音。

- 裸名最小长度 8
- 带点锚点看末段，最小长度 6
- 维护一份通用词表（`GENERIC_MEMBERS`），含 `register`、`resolve`、`readFile`、`stringify`、`initialize`、`configure` 等

**实测**：`resolve` 是 Node 的 `path.resolve()`，guide 说的是 `runtime.resolve()`，纯同名撞车。

### 规则 4：迁移目标不算问题

guide 的 Migration 说的是「把 A 改成 B」。A 是问题，B 是解决方案。插件如果已经用了 B，说明适配过了，报了只是噪音。

识别替换对的两条路：

1. 严格配对：`Replace X with Y`、`X → Y`、`X becomes Y`
2. 宽松兜底：`with` / `using` / `by` 后面的符号一律视为新符号

第二条是必要的，因为真实 guide 常写成 `Replace A or B with C.`，严格配对会漏掉 C。

**实测**：argo 插件报了 `startActivation` 命中，而 guide 说 `startActivation` 正是迁移目标，插件已经适配过了。

## 三、常量锚点只从 Change 段抽

`read-only`、`max-tokens` 这类连字符字符串在 Migration 段里往往是示例值（`Its default mode is 'read-only'`），不是变更项。

Change 段描述的是「什么变了」，里面的连字符字符串才是真正的错误码或事件名（`fails with 'sandbox-unavailable'`）。

**实测**：argo 插件报的 6 处命中里，4 处是 `read-only`、1 处是 `max-tokens`，全是 Migration 段里的示例值。

## 四、匹配规则：对象后缀

锚点 `a.b` 匹配插件里的 `x.y`，要同时满足：

1. 末段相同：`a` 的最后一段等于 `y`
2. 末段长度 ≥ 6
3. 对象部分互为后缀：`x === a_obj`，或 `x` 以 `.a_obj` 结尾，或 `a_obj` 以 `.x` 结尾

第 3 条解决两类问题：

- **防误报**：`engines.dsh` 不匹配 `result.dsh`（对象不同，纯末段相同会撞车）
- **保召回**：`sessionTitle.register` 匹配 `ctx.sessionTitle.register`（长对象以短对象结尾）

## 五、版本启发式

不盲目取 `latest`。本机完全可能跑在 `next` 或 `alpha` 线上，比 `latest` 还新。

读 npm 的 `dist-tags`，然后判断本机在官方通道里的位置：

| 判定 | 条件 | 动作 |
| --- | --- | --- |
| `up-to-date-on-channel` | 本机版本等于某通道版本 | 无目标版本，收工 |
| `ahead-of-upstream` | 本机高于所有通道 | 无目标版本，收工 |
| `upgrade-available` | 有通道版本高于本机 | 取最低的那个高版本 |
| `unknown-local` | 没检测到本机版本 | 退回 `latest`，标注需人工确认 |

取「最低的那个高版本」而不是最新版，是为了不跨大版本盲升。

prerelease 比较要正确处理：`0.2.1-rc.3 > 0.2.1-rc.2`，但 `0.2.1-rc.3 < 0.2.1`（正式版高于同名预发布版）。

## 六、已知局限

- **官方指南不覆盖所有破坏性变更**。它记录的是官方认为需要通知的变更。包废弃（如 `@deepseek-ai/dsh-client-runtime`）在实测的指南里查不到，那一类要靠 `env-doctor` 的覆盖层巡检兜。
- **同名符号仍可能撞车**。规则 3 和第四节能挡掉大部分，但 `path.resolve()` 和 `runtime.resolve()` 这种只能靠人看上下文判断。
- **不验证运行时行为**。这个技能只做静态匹配，不加载插件、不跑沙箱。要验证「改完能不能跑」，需要真宿主冷启动。
- **`--clone` 需要网络**。npm registry 和 git clone 都有超时，失败会明确报错。
