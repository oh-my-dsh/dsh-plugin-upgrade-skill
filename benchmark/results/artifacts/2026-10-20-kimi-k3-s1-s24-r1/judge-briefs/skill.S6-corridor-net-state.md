# JUDGE BRIEF · skill.S6-corridor-net-state

## Criteria (sealed rubric)
- [corridor-net-state] (25pt) Explain alpha.1 removal followed by alpha.2 restoration of SessionEvent.ignorable retention, applying the final alpha.2 state to produceExternalEvent in src/events.ts. Correct version history is required; bare A1-02/A2-01 card names earn no credit, and equivalent history without card IDs is acceptable.
- [remove-marker-stripping] (25pt) Locate delete (event as any).ignorable and reject the comment prescribing continued stripping on alpha.2. Recommend removing that defense and correcting its obsolete rationale. Distinguish removing the stripping code from removing the marker itself. It is valid to note that the shown literal currently has no marker, so the delete is a no-op, while still rejecting the intended stripping policy.
- [informational-producer] (25pt) Explain that only informational events whose semantics old readers may omit without breaking reconstruction can carry ignorable:true; required events must not be made ignorable. Retention across persistence/reload is not a reader-side filtering instruction: marked events remain in the loaded log. Apply this to the third-party/informational producer while respecting the live append limitation.
- [public-append-gap] (25pt) Identify the public live Session.append capability gap: it has no supported ignorable parameter. Ordinary plugins must not fake an entry with a cast, invented argument or unsupported API. Explicitly defer the exact producer/persistence integration pending target API verification; naming an undocumented successor is not required. Proposed retention/required-event checks are valid but actual execution is not required.

## Caps (score ceilings; judge returns each with triggered true/false)
- CAP [keep-stripping-marker] ceiling=10 Trigger only when the final recommendation affirmatively keeps the alpha.1 defense or continues deleting the marker on alpha.2. Negating that recommendation, quoting the old code for diagnosis, or removing the delete statement does not trigger it. Read the entire sentence and conclusion, including double negation and later contradictions.

## Candidate report(s)
#### FILE: S6-corridor-net-state/S6-corridor-net-state-report.md

# S6 · Corridor Net-State Judgment — 迁移报告（只读分析）

- 分析对象：`fixture/src/events.ts` 中的 `produceExternalEvent()`（alpha.1 时代"防御代码"：写第三方持久事件前 `delete (event as any).ignorable`，注释声称"不删 marker 会被 reader 拒绝，迁移 alpha.2 时要保留"）
- 目标宿主：**alpha.2**
- 分析方式：只读；fixture 未做任何修改。证据来自 skill 卡片库（plugin-upgrade/references），逐卡核对而非采纳注释。

## 1. 防御代码的命运：删除（delete），不得保留

### 走廊完整历史（net state）

| 版本 | 卡片 | 语义 |
|---|---|---|
| alpha.1 | DSH-0.1.2-A1-02（v0.1.2-alpha.1.md） | `SessionEvent.ignorable` **临时移除**：alpha.1 无法在第三方 informational 事件上保留 `ignorable: true`，first-party reader 遇到未知持久事件时按 required 处理并拒绝 reload。卡片明确：若最终目标是 alpha.2+，应先读 A2-01 算走廊净态，不要"删了再加回"。 |
| alpha.2 | DSH-0.1.2-A2-01（v0.1.2-alpha.2.md，A1-02 的 revert） | **恢复** `ignorable` 的保留语义：envelope / persistence / reload / transport 全链路原样保留该字段；无 marker 的未知事件仍然 required-on-read（fail closed）。 |

净态结论：这是一个典型的 **remove-then-restore**（rollup-0.1.2.md 把 `ignorable` 列为该模式的 canonical 例子）。目标 alpha.2 已恢复字段，针对 alpha.1 空窗期写的临时防御**必须随迁移一并删除**，否则就是把中间版本的权宜之计固化进目标版本——正是 skill Mode C 第 2 步禁止的"删了又加/加了不删"。

### 注释本身也是错的（双重错误）

1. **语义颠倒**：reader 的拒绝规则是"未知事件**缺少** `ignorable: true` → 视为 required → 拒绝"。注释声称"不删 marker 会被拒绝"恰好与证据相反——删除 marker 才是导致拒绝的原因（A2-01 / API-05 均明确）。
2. **操作上是 no-op**：`event` 是就地构造的 `{ type, payload }`，从未有过 `ignorable` 属性，`delete` 一个不存在的键不改变任何行为。这段代码即使在 alpha.1 下也从未起过它所声称的作用。

## 2. 正确的生产者语义与 `Session.append(...)` 的现实

证据：API-05（api-migration-0.1.2-alpha.2.md）+ DSH-0.1.2-A2-01。

- **字段语义**：`ignorable: true` 只应写给"老 reader 省略其语义也能正确重建 Session"的辅助性 informational 事件；它不是消费端过滤指令，事件 reload 后仍保留在 loaded events 中。未知事件无 marker 依旧 fail closed。
- **公共 API 表面没有这个参数**（题面提示属实）：alpha.2 只恢复了 envelope 字段，公共 `Session.append()` 仍只接受 `type`、`data` 与 `SurfaceIntent`（后者仅 surface 事件可用），**不会为事件写入 `ignorable`**。用 cast / 解冻对象 / 手改 JSONL 伪造入口均不被支持。
- **普通插件经 `Session.append(...)` 应该做什么**：
  1. **不要**用自定义 `SessionEventMap` 增强 + `Session.append()` 持久化插件状态——live append 会静默成功，但事件无 marker，下次冷加载整个 Session 会以 `SessionFormatUnsupportedError` 被拒（silent write / loud read，一次 live 冒烟测不出来）；
  2. 改用 **插件自有的 sidecar/store**（按 Session id 键控）保存状态；
  3. 把"第三方持久事件生产者 seam"记为 **capability gap**，等上游发布受支持的 `append(..., { ignorable: true })` 或等价正式机制后再重新评估；仅注册事件名不够；
  4. 若复用已知事件，只能复用其真实相同语义，不得把插件状态伪装成核心/模型可见事件；
  5. persistence/transport 所有者必须端到端保留已有 marker。
- 因此对 fixture 代码的正确迁移不仅是"删掉那行 `delete`"：这个函数本身（第三方自定义类型 + 裸 `session.append`）在 alpha.2 上就是 API-05 点名的危险模式，应整体替换为 sidecar 方案，或标记 pending 等待上游机制。

## 3. 判定依据与未确认项

**依据（卡片级证据，均为 curated 卡）：**
- DSH-0.1.2-A1-02（alpha.1 临时移除，v0.1.2-alpha.1.md）
- DSH-0.1.2-A2-01（alpha.2 恢复保留语义，v0.1.2-alpha.2.md；A1-02 的 revert）
- API-05（api-migration-0.1.2-alpha.2.md：append 签名仍无 `ignorable` 参数；silent write / loud read；sidecar 建议）
- 走廊净态规则：rollup-0.1.2.md（remove-then-restore 的 canonical 例子即 `ignorable`）

**未确认（unconfirmed）：**
- 未在本容器内核对 alpha.1 / alpha.2 标签的宿主源码原件（`Session.append()` 实现、`SessionEvent` 类型、冷加载守卫的精确代码行）——结论基于上述卡片，卡片附有上游链接但未在本环境 fetch 验证；
- fixture 中 `session: any`、`payload: any` 的实际调用方与事件类型注册情况未知（fixture 仅此一个源文件，无 caller），故"该函数是否真实持久化"无法在 fixture 内证实，按防御性判断处理；
- alpha.2 之后版本（alpha.3+ 至 0.2.0）是否已补出受支持的第三方 append 机制：超出本任务目标版本范围，未核对。

## 结论

- **防御代码：删除。** alpha.2 已通过 DSH-0.1.2-A2-01 恢复 `ignorable` 保留语义（A1-02 的 revert），注释的"必须保留"主张与被"不删会被拒"的因果均被证据推翻，且该 `delete` 本来就是 no-op。
- **但迁移不止于删行**：该函数的"自定义事件 + 裸 `session.append`"写法在 alpha.2 上是已知陷阱（API-05），普通插件应改用插件自有 sidecar/store，并将第三方持久事件生产者 seam 记为 capability gap。


## Required output (JSON only)
{"decisions":[{"id":"<criterion-id>","verdict":"pass|partial|fail|missing","reason":"short"}],"caps":[{"id":"<cap-id>","triggered":false,"reason":"short"}]}
Every criterion and cap exactly once. pass=full points, partial=half, fail/missing=0; a triggered cap caps the total.