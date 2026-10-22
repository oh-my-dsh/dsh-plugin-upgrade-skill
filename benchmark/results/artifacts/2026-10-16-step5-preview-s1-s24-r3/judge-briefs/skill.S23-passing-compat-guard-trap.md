# JUDGE BRIEF · skill.S23-passing-compat-guard-trap

## Criteria (sealed rubric)
- [silent-break-attribution] (20pt) Walk resolve() in plugin/src-client-index.ts: sessions.list.getSnapshot() succeeds but the published snapshot no longer carries current, so id is undefined and the function returns null on every keystroke; onKeyDown then exits before preventDefault. Explain both silences: the four presence probes in the compat guard all survive (the service, its members, even the observable exist — only a field inside the published value is gone), and undefined was a legitimate no-session state the code deliberately ignores quietly. Do not claim the sessions service or the guard itself was removed, renamed, or throws.
- [evidence-mapping] (20pt) From session-list-alpha1.d.ts vs session-list-alpha2.d.ts: SessionListState.current is gone and navigation moved to view owners (ISessions.list doc comment). From ui-session-service-alpha2.d.ts: the canonical replacement is the uiSession service — adapter.current (ObservableSnapshot<SessionBindingValue>) yielding { key, ctx, hooks, keyedHooks, props }, where key replaces current and ctx is the session-scoped context replacing sessions.scope(id). Mapping to card DSH-0.1.6-A2-01 is creditable; the card alone without the type-walk earns partial at most.
- [dual-host-migration] (20pt) Propose a corrected resolution: read ctx.uiSession.adapter.current.getSnapshot() when the service exists, fall back to the legacy current field plus sessions.scope otherwise, from one build; inject gains uiSession; the conversation service resolves through the binding value ctx (scope.get('conversation')), and input.for receives that scope. Accept equivalent shapes and guard order. A recipe that only works on alpha.2 (no fallback) or that keeps reading the removed field earns partial; re-registering slots or merely re-declaring inject without the code change earns zero.
- [guard-hardening] (20pt) Name the breakage class the shipped guard cannot catch: field-level removal behind service-level stability, checked once at activation while the break recurs per use. Specify a hardened guard that probes the actual capability (assert the specific snapshot field on alpha-1-shaped hosts and/or feature-detect uiSession on alpha-2-shaped hosts) and note the probe must run lazily or per-use, not only at activation. Presence-list expansion alone is insufficient.
- [verification-and-prevention] (20pt) Verify without a full migration: a temporary probe of adapter.current key with one session open, chord behavior after the code change on both hosts, and typecheck against alpha.2 published types as the strongest pre-ship gate. Prevention: a removed public snapshot field should fail loud — a deprecated getter that throws/warns on read, or a runtime snapshot-shape contract guards can pin. Do not require executing this static fixture.

## Caps (score ceilings; judge returns each with triggered true/false)
- CAP [slot-reregistration-misdiagnosis] ceiling=40 The final remedy is only re-registering slots, re-declaring inject, or reinstalling the plugin — the colleague red herring — without the current-session code fix. Apply only to affirmative final advice or conclusions. Quoted, hypothetical or explicitly rejected bad examples do not trigger the cap; read the whole report.

## Candidate report(s)
#### FILE: S23-passing-compat-guard-trap/report.md

# S23 · The Compat Guard That Passed — 只读诊断报告

- 单元格：`S23-passing-compat-guard-trap`（skill 臂 · plugin-upgrade）
- 宿主跃迁：`@deepseek-ai/dsh` `0.1.6-alpha.1 → 0.1.6-alpha.2`（npm global，Windows，web profile，六个外链客户端插件）
- 证据：仅 `fixture/`（题面 /app/fixture/）+ 技能 `references/`，全部只读；未修改任何 fixture 文件
- 模式：Mode A · inspect（只读诊断 + 迁移配方；未执行安装、迁移或任何插件源码写入）
- 对应版本卡：**DSH-0.1.6-A2-01**（references/v0.1.6-alpha.2.md）

## 0. 结论速览（TL;DR）

1. **归因**：失效读是 `plugin/src-client-index.ts:34` 的 `sessions.list.getSnapshot().current`。alpha.2 把 session-list 快照从 `SessionListState { byId, current }` 换成 `SessionListSnapshot { items, state, phase, error, subagentsByParent, jobsBySession }`，`current` 字段被删。每次按键 `id === undefined` → `resolve()` 返回 `null` → `onKeyDown` 在 `e.preventDefault()` **之前** return，和弦落回到 composer 自带的多行光标移动。
2. **为何全静默**：四成员存在性守卫全部通过（`sessions.list`/`scope`/`sessionOf`、`uiConversation.binding` 在 alpha.2 都还在，只是 `list` 的载荷形状变了）；读一个不存在的属性在 JS 里合法得到 `undefined`，且 `current` 的类型本就是 `SessionId | undefined`，"无会话"与"字段没了"共用同一条静默分支；失败发生在事件回调而非激活期，所以连未捕获异常都没有。
3. **证据映射**：alpha.1 `current: SessionId | undefined` → alpha.2 无 `current`；插件每击键拿到的都是 `undefined`。替代读 = alpha.2 的 `uiSession` 服务（类 `UiSession`，inject 名 `uiSession`，来自 `@deepseek-ai/dsh-client-ui-session`）暴露的 `adapter.current`（`ObservableSnapshot<SessionBindingValue>`），其值含 `key: SessionId`（替代 `sessions.list.getSnapshot().current`）与 `ctx: Context`（替代 `sessions.scope(id)` 做会话作用域服务解析）。
4. **迁移**：`inject` 增加 `'uiSession'`；`resolve()` 改为"优先 `uiSession.adapter.current`、形状不符回退 legacy `sessions.list…current` + `sessions.scope(id)`"的双宿主单构建分支；会话作用域 ctx 由 binding 值的 `ctx` 携带，直接喂给 `conversation.input.for(actx)`。
5. **守卫加固**：存在性检查抓不到"成员还在、载荷形状变了"这一类断裂。守卫必须探测**插件真正依赖的那一次读**的形状（三态 `ok` / `no-session` / `incompatible`），并在激活期 + 首个主会话 binding 物化后各跑一次。
6. **预防**：宿主把这次断裂做成**成员级**（删/改名 `sessions.list`，或只经新服务提供新形状）而不是字段级静默改形状，插件激活期的存在性守卫与类型检查就会当场报错。

---

## 1. 静默失败归因（Silent-failure attribution）

### 1.1 每次按键的解析路径

`plugin/src-client-index.ts` 的按键链路（行号以证据文件为准）：

| 步骤 | 代码位置 | 行为 |
|---|---|---|
| ① 捕获 | `:67-70` `ctx.effect` 注册 `window.addEventListener('keydown', onKeyDown, true)` | 激活即注册，与宿主版本无关；**本步正常** |
| ② 过滤 | `:51-54` `ctrlKey && !alt/meta`、`key ∈ {ArrowUp, ArrowDown}`、`!isComposing`、`isComposerTarget(e.target)` | Ctrl+Up/Down 落在 composer 上即通过；**本步正常**（否则不会出现"composer 自带多行光标仍在动"这一现象） |
| ③ **解析会话** | `:34` `const id = sessions.list.getSnapshot().current` → `:35` `if (id === undefined) return null` | **故障点**：alpha.2 上 `current` 已被删除，`id` 恒为 `undefined` |
| ④ 提前返回 | `:56` `if (resolved === null) return` | 位于 `e.preventDefault()` / `stopPropagation()`（`:61-62`）**之前** |
| ⑤ 应用 | `:64` `resolved.input.setDraft(step.text)` | 永远执行不到 |

**精确失效读**：`sessions.list.getSnapshot().current`（`src-client-index.ts:34`）。它是整条链路上唯一一次"读已被删除字段"的读；其后所有读（`:41` `sessions.scope(id)`、`:43` `actx.get('conversation')`、`:45` `ctx.uiConversation.binding(id)…views.get('chat')`、`:58` `resolved.input.state.getSnapshot().draft`）都还没被执行到。

### 1.2 为什么四处都不报错

- **兼容守卫为何通过**：`apply()`（`:78-90`）只做四个**成员存在性**检查——`ctx?.sessions?.list`、`ctx?.sessions?.scope`、`ctx?.sessions?.sessionOf`、`ctx?.uiConversation?.binding`。alpha.2 的 `session-list-alpha2.d.ts:15-26` 明确写着 `list` 仍在（只是 `ObservableSnapshot<SessionListSnapshot>`），并在 `:24-26` 的注记里说明 `scope(id)` 在 alpha.2 依然存在（仅未纳入该节选）。四个名字一个都没少，所以 `applyWithCompat` 判定"兼容"，不渲染 remediation banner——与 maintainer 观察到的"无 banner"完全一致。
- **为何控制台零错误**：对普通对象读一个不存在的属性是合法求值，结果为 `undefined`，不抛 `TypeError`。后续没有任何一行会对这个 `undefined` 做属性访问或调用，所以既无异常也无 `console.error`。对比：如果是 `sessions.list.getSnapshot().current.id` 这种二级读，或 `sessions.list.getSnapshot()` 本身返回 `undefined`，才会炸出 `Cannot read properties of undefined`。
- **为何是静默 no-op 而非抛异常**：`current` 在 alpha.1 的声明就是 `readonly current: SessionId | undefined`（`session-list-alpha1.d.ts:9`），"没有当前会话"是插件作者显式处理过的合法态（`:35` 提前返回）。字段被删后，**"字段不存在"与"尚未打开会话"落进了同一条分支**，类型上的 `| undefined` 让这个歧义在 alpha.1 声明下编译期也不可见（旧代码对 alpha.1 声明完全合法）。这就是典型的**值层级（字段级）断裂**：不是成员消失，所以没有 throw 的着力点。
- **为何和弦不被吞掉**：`:56` 的提前返回位于 `preventDefault()`/`stopPropagation()` 之前，事件继续冒泡，composer 自己的多行光标移动照常工作。这与症状报告"chord 没有被吞、composer 原生行为还在"逐字吻合，也是判断"监听器确实在跑"的关键旁证。

### 1.3 already-tried 清单：解决了哪条、没解决哪条

**解决（settled）**：

- 症状报告里的二选一疑问——"capture listener 是没触发，还是触发了却提前退出"：**是后者**，监听器在 `:34` 之后退出。already-tried #6（把插件 junction 整个删掉，和弦依然无反应）由此得到解释：从来就没有第二个处理器抢和弦，插件也从来没吞过这个事件；删掉插件后"同样无反应"，所以这条对照实验无法区分"插件没生效"和"插件静默失效"。
- 同事的猜测（"多实例重构改了 API/slot，需要重新注册 slot 或补 inject"）：**不是根因**。该插件是 document 级 `keydown` 监听器，不注册任何 slot；失效点距离任何 slot/inject 声明只有一次纯字段读。补 `'uiSession'` 进 `inject` 确实是修复的一部分（见 §3），但不是失效原因——只加 inject 不改读取，症状不会变。

**未解决（not addressed）**：

- **#5 "update chip 显示 latest"**：本包不含插件仓库，"latest" 是否已包含 alpha.2 适配版无法从证据判定；需去插件仓库比对 tag/commit。
- **同一函数里的其余读是否也在 alpha.2 变味**：`:41` `sessions.scope(id)` 的会话作用域解析语义、`:43` `actx.get('conversation')`、`:45` `uiConversation.binding(id).snapshot…views.get('chat')` → `chat.legacy.nodes` 都不在证据覆盖内。修好 id 读之后，完全可能在 `:43/:45/:46` 出现**第二次**静默 no-op（返回 `null` 或 `EMPTY_NODES`，历史为空）。
- **alpha.2 发布说明"插件依赖解析模式调整为运行时解析，插件管理支持运行时卸载"**（`upgrade-notes.txt:2`）：未评估运行时卸载/重载路径是否造成 `applyBody` 双挂载（两个闭包各带一个失效的 `resolve`）。
- **多实例语义**：alpha.2 起"当前会话"= 主视图占用量（`retainedBy.mainView > 0`），不再是全局唯一 `current`。插件内任何假设"全局只有一个当前会话"的地方都要复查。

---

## 2. 证据映射（Evidence mapping）

### 2.1 两份 session-controller 节选：快照到底变了什么

| | alpha.1（`host-types/session-list-alpha1.d.ts`） | alpha.2（`host-types/session-list-alpha2.d.ts`） |
|---|---|---|
| `list` 的类型 | `ObservableSnapshot<SessionListState>` | `ObservableSnapshot<SessionListSnapshot>` |
| 快照字段 | `byId: Readonly<Record<SessionId, SessionSummary>>`；**`current: SessionId | undefined`**（`:9`，"主对话视图当前绑定的会话"） | `items: readonly SessionListEntry[]`、`state`、`phase`、`error`、`subagentsByParent`、`jobsBySession`；**无 `current`、无 `byId`** |
| `ISessions` 其他成员 | `scope(id): Context | undefined`（`:20`，按 id 解析会话作用域 ctx） | 新增 `retain(target, options): SessionReference`；注释明示"导航归视图所有者"；`scope(id)` 仍存在（节选注记 `:24-26`） |

**变化的精确表述**：`list` 这个成员本身没有消失，消失的是它载荷里的 `current` 字段——`SessionListState` 整个接口被 `SessionListSnapshot` 取代，主视图绑定关系从"会话列表全局状态里的一个标量"改成"按 binding source 的引用计数/占用"。alpha.1 的 `byId` 也一并没了（换成 `items`）。

**对插件每击键取值的含义**：`sessions.list.getSnapshot()` 现在返回一个**结构不同**的对象，其中没有 `current` 这个 key。因此 `sessions.list.getSnapshot().current` 在每次按键时求值为 `undefined`（不是抛错、不是空串），`:35` 的守卫直接吞掉它，`resolve()` 恒返回 `null`。在 alpha.1 上同一次读返回的是主对话视图绑定的那个 `SessionId`。也就是说：**插件从"每击键都能定位主会话"变成"每击键都定位不到任何会话"，且"无会话"与"字段没了"两种失败在返回值上完全同形。**

### 2.2 新服务节选：规范化替代读

来自 `host-types/ui-session-service-alpha2.d.ts`（`@deepseek-ai/dsh-client-ui-session`，client bundle 导出 `UiSession`，inject 名 **`uiSession`**）：

- **服务**：`UiSession`（`extends Service`）——"拥有每个 Session 的 binding 与主视图选择的根服务"。
- **可观察量**：`uiSession.adapter.current`，类型 `ObservableSnapshot<SessionBindingValue>`，语义为"主视图当前会话的 binding source"（`:9-12`）。插件用 `getSnapshot()` 读、需要缓存 id 时用 `subscribe()` 订阅。
- **值的形状**：`SessionBindingValue`（`:29-38`）：
  - `key: SessionId` —— **替代 `sessions.list.getSnapshot().current`** 的主会话 id；无主会话时该值为 `undefined`（节选尾注 `:40-41`：服务在没有主会话被 retain 期间发布 absent 值）。
  - `ctx: Context` —— **替代 `sessions.scope(id)`** 的会话作用域上下文；节选原文："The session-scoped context: services registered under this session resolve here."
  - 另有 `hooks` / `keyedHooks` / `props`（标准 source 贡献物，本插件用不到）。
- **附带能力**（备选，非必需）：`sourceFor(owner: SessionBinding | SessionId): BindingSource`（已知 id 时取 binding source）与 `provide(descriptor)`（库存包发布每会话 hooks 用）。

> **一致性备注**：`ui-session-service-alpha2.d.ts:1-2` 称该服务是 alpha.2 新出货；而版本卡 **DSH-0.1.6-A2-01** 记载 `uiSession` 由 `@deepseek-ai/dsh-client-ui-session` 在**两个 tag 上都注册**（alpha.1 的 `ui-approval` 已经 inject 它），只是持有当前 binding 的字段在两侧都是 private。两条证据对"`uiSession` 在 alpha.1 是否存在"结论相反，按纪律记录双方、不静默取边（见 §6）。§3 的代码因此写成**形状探测优先、缺失回退**，两种真相下都能工作。

---

## 3. 迁移配方（Migration recipe）

### 3.1 `inject` 声明要改什么

```ts
// 之前（plugin/src-client-index.ts:17）
export const inject = ['sessions', 'uiConversation', 'conversation']

// 之后：补上 uiSession（alpha.2 上取主会话 binding 的公共面）
export const inject = ['sessions', 'uiConversation', 'conversation', 'uiSession']
```

- 用弱 `inject` 而非强 `require`：万一目标宿主没有注册 `uiSession`（即 fixture 那一侧说法为真），弱注入只让 `ctx.uiSession` 为 `undefined`，条目不会 pending；`require` 会把整个客户端条目挂住，那才是新的启动故障。
- 原有三个名字**保留**：legacy 回退分支仍要 `sessions.list` / `sessions.scope`，`uiConversation` 的 chat 视图读也保持原样（该面本包未覆盖，另行验证）。

### 3.2 会话作用域上下文如何抵达 conversation 服务

alpha.2 上，会话作用域上下文不再由 `sessions.scope(id)` 现算，而是**由 binding 值直接携带**：`SessionBindingValue.ctx` 就是"注册在该会话下的服务在此解析"的那个 `Context`。链路变成：

```
uiSession.adapter.current.getSnapshot()  -->  { key, ctx }
        key  -->  uiConversation.binding(key) ... views.get('chat')   （chat 视图按 id 寻址，不变）
        ctx  -->  ctx.get('conversation')  -->  conversation.input.for(ctx)
```

即 `actx` 的来源从 `sessions.scope(id)` 换成 `binding.ctx`；`actx` 之后的用法（`actx.get('conversation')`、`conversation.input.for(actx)`）一字不改。

### 3.3 双宿主（一份构建）修正后的解析函数

```ts
import type { Context as ClientContext } from '@deepseek-ai/cordis'
import type { ISessions } from '@deepseek-ai/dsh-api-session-controller/client'
import type {
  ConversationNode, IConversation, SessionInput,
} from '@deepseek-ai/dsh-client-ui-conversation/client'
import { down, extractHistory, IDLE, resync, up, type HistoryBrowse } from './history.ts'

/** 本地结构声明：两侧声明集不一定同时可解析；用结构类型 + 收窄，避免 any 横流。 */
interface LegacySessionListState {
  readonly byId: Record<string, unknown>
  readonly current: string | undefined
}
interface MainBindingLike {
  readonly key: string | undefined
  readonly ctx: ClientContext
}
interface UiSessionLike {
  readonly adapter: {
    readonly current: {
      getSnapshot(): MainBindingLike | undefined
      subscribe(listener: (v: MainBindingLike | undefined) => void): () => void
    }
  }
}

/** 主视图会话的一次解析：id + 会话作用域 ctx。alpha.2 走 uiSession，alpha.1 走 list.current + scope()。 */
interface MainSession { readonly id: string | undefined; readonly scope: ClientContext | undefined }

function readMainSession(ctx: ClientContext, sessions: ISessions): MainSession {
  // --- alpha.2（多实例）：uiSession.adapter.current 发布主视图 binding ---
  const adapter = (ctx as { uiSession?: UiSessionLike }).uiSession?.adapter?.current
  if (typeof adapter?.getSnapshot === 'function') {
    const binding = adapter.getSnapshot()
    // 形状校验而非名字校验：key 与 ctx 必须同时在，否则视为不兼容
    if (!binding || typeof binding !== 'object' || !('key' in binding) || !('ctx' in binding)) {
      return { id: undefined, scope: undefined }
    }
    return { id: binding.key, scope: binding.ctx }
  }
  // --- alpha.1（遗留）：会话列表快照携带 current，scope(id) 现算作用域 ctx ---
  const snap = sessions.list.getSnapshot() as unknown as LegacySessionListState
  const id = snap.current
  if (id === undefined) return { id: undefined, scope: undefined }
  return { id, scope: sessions.scope(id) }
}

function applyBody(ctx: ClientContext): void {
  let browse: HistoryBrowse = IDLE
  let lastSessionId: string | undefined

  const sessions: ISessions = ctx.sessions

  const resolve = (): ResolvedSession | null => {
    const main = readMainSession(ctx, sessions)
    const id = main.id
    if (id === undefined) return null
    if (id !== lastSessionId) {
      // Session switch: recall must start fresh on the new session.
      browse = IDLE
      lastSessionId = id
    }
    const actx = main.scope
    if (actx === undefined) return null
    const conversation = actx.get('conversation') as IConversation | undefined
    if (conversation === undefined) return null
    const chat = ctx.uiConversation.binding(id).snapshot.getSnapshot().views.get('chat')
    const nodes = chat === undefined ? EMPTY_NODES : chat.legacy.nodes
    return { input: conversation.input.for(actx), nodes }
  }

  const onKeyDown = (e: KeyboardEvent): void => {
    if (!e.ctrlKey || e.altKey || e.metaKey) return
    if (e.key !== 'ArrowUp' && e.key !== 'ArrowDown') return
    if (e.isComposing) return
    if (!isComposerTarget(e.target)) return
    const resolved = resolve()
    if (resolved === null) return
    const history = extractHistory(resolved.nodes)
    const draft = resolved.input.state.getSnapshot().draft
    const step = e.key === 'ArrowUp' ? up(history, draft, browse) : down(history, browse)
    if (step.text === null) return
    e.preventDefault()
    e.stopPropagation()
    browse = step.browse
    resolved.input.setDraft(step.text)
  }

  ctx.effect(() => {
    window.addEventListener('keydown', onKeyDown, true)
    // 会话切换时刷新缓存 id（命中 §4 的加固守卫：subscribe 侧同时做一次性复核）
    const adapter = (ctx as { uiSession?: UiSessionLike }).uiSession?.adapter?.current
    const unsubscribe = adapter?.subscribe?.(() => { lastSessionId = undefined }) ?? (() => {})
    return () => {
      unsubscribe()
      window.removeEventListener('keydown', onKeyDown, true)
    }
  }, 'dsh-input-history: composer keyboard capture')
}
```

`ResolvedSession` / `EMPTY_NODES` / `isComposerTarget` 沿用原文（`:20-25`、`:50-65`），未改动。

**这份代码为什么是"双宿主"的**：

- alpha.2：`ctx.uiSession.adapter.current` 存在 → 走 `binding.key` + `binding.ctx`，完全不碰 `sessions.list` 的载荷形状。
- alpha.1：`uiSession` 不存在（或其 `adapter.current` 不返回带 `key`/`ctx` 的对象）→ 落到 `sessions.list.getSnapshot().current` + `sessions.scope(id)`，与升级前行为逐字一致。
- 判定依据是**返回值的形状**（`'key' in binding && 'ctx' in binding`），不是宿主版本号，也不是"服务名字在不在"——正是本次事故要避开的那类判断。
- 类型策略：legacy 分支用本地 `LegacySessionListState` + `as unknown as`（因为在 alpha.2 声明下 `current` 是编译错误，这本就是**静态层面的证据**）；新分支用本地 `MainBindingLike`/`UiSessionLike` 结构类型。若 peer 包可解析，应把这两个本地接口换成从 `@deepseek-ai/dsh-client-ui-session/client` 导入的 `SessionBindingValue` 与真实服务类型，并跑一次 `skipLibCheck: false` 的诊断 typecheck，确认没有回退成 `any`。

---

## 4. 守卫加固（Guard hardening）

### 4.1 存在性检查抓不到的那一类断裂

现役守卫（`src-client-index.ts:83-88`）检查四个**服务成员在不在**。它天然抓不到的是：

- **成员仍在、契约变了**（本次事故）：`sessions.list` 名字还在，但快照字段从 `current` 变成 `items`；`sessions.scope`、`uiConversation.binding` 同理可能"在但语义/返回值变了"。
- **值层级退化**：成员在、调用不抛，但返回 `undefined` / 空集合 / 空 Map，功能静默归零。
- **同名不同物**：同名成员被换成另一套实现（例如 `scope` 不再解析会话作用域服务）。

根本原因：**名字存在 ≠ 契约存在**。技能 `references/host-plane-probes.md` 对同类问题有对应纪律——"用另一个 loader row 当能力标记，一旦该 row 变了标记就静默失效"；这里就是把"服务成员名"当成了能力标记。

### 4.2 硬化后的守卫：探测那一次真正的读

```ts
type ProbeResult = 'ok' | 'no-session' | 'incompatible'

/** 探测插件真正依赖的读本身（形状 + 可解析性），而不是服务成员的存在性。 */
function probeMainSessionRead(ctx: ClientContext): ProbeResult {
  const anyCtx = ctx as unknown as Record<string, any>

  // 面 A · alpha.2：主视图 binding 必须发布，且必须同时带 key 与会话作用域 ctx
  const adapter = anyCtx.uiSession?.adapter?.current
  if (adapter !== undefined && adapter !== null) {
    if (typeof adapter.getSnapshot !== 'function') return 'incompatible'
    const v = adapter.getSnapshot()
    if (v === null || typeof v !== 'object') return 'incompatible'
    if (!('key' in v) || !('ctx' in v) || typeof v.ctx?.get !== 'function') return 'incompatible'
    return typeof v.key === 'string' || v.key === undefined ? 'ok' : 'incompatible'
  }

  // 面 B · alpha.1：会话列表快照必须仍携带 current，且 scope() 必须能解析它
  const list = anyCtx.sessions?.list
  if (list === undefined || typeof list.getSnapshot !== 'function') return 'incompatible'
  const snap = list.getSnapshot()
  if (snap === null || typeof snap !== 'object' || !('current' in snap)) return 'incompatible'
  const id = snap.current
  if (id === undefined) return 'no-session'          // 尚未打开会话：合法态
  if (typeof anyCtx.sessions?.scope !== 'function') return 'incompatible'
  return anyCtx.sessions.scope(id) === undefined ? 'no-session' : 'ok'
}
```

要点：

1. **探测的是读，不是名字**：面 A 校验 `key` + `ctx` + `ctx.get` 可调用；面 B 校验 `'current' in snap` 且 `scope()` 可解析。任一形状不符 → `'incompatible'` → 渲染既有 remediation banner。
2. **三态而非二态**：`'no-session'`（合法：还没开会话）必须与 `'incompatible'`（断裂）分开。把"没会话"当成不兼容会在冷启动误报；把"不兼容"当成"没会话"就是本次事故。
3. **探测要便宜且可重复**：只做 `getSnapshot()` + `in` 检查，不订阅、不触发副作用，可在生命周期内多次运行。

### 4.3 探针必须跑在生命周期的哪个点

- **第一处 · 激活期（`apply()` 内、安装 keydown 监听器之前）**：此时只信形状判定（`'ok'` / `'incompatible'`），必须**忽略** `'no-session'`——冷启动时本来就可能没有主会话被 retain（节选尾注：服务在没有主会话被 retain 期间发布 absent 值）。若此处得到 `'incompatible'`，走 banner，永不注册监听器。
- **第二处 · 首个主会话 binding 物化之后（一次性复核）**：因为 `key === undefined` 在"无会话"和"字段没了"下同形，激活期形状探测无法覆盖"宿主发布了对象但字段被删"的残余风险。做法：在 `ctx.effect` 里对 `uiSession.adapter.current`（alpha.2）或 `sessions.list`（alpha.1）做一次性 `subscribe`，收到**第一个非 absent 快照**时再跑一次探针；若为 `'incompatible'`，卸载监听器并升级为 banner + `console.warn`。这正是把"静默"变"响"的最低成本改造。
- **第三处（可选）· 解析失败累计告警**：`resolve()` 连续返回 `null` 超过 N 次且从未成功过一次时 `console.warn` 一次（附快照 key 列表），给现场可诊断性；不要每次按键都打，避免刷屏。

---

## 5. 验证与预防（Verification and prevention）

### 5.1 不做完整迁移，如何在两个宿主上验证修复

1. **静态层（最快、零运行）**：用两份声明分别 typecheck 同一个 `resolve()`。
   - 对 `host-types/session-list-alpha2.d.ts`：旧代码 `sessions.list.getSnapshot().current` 必须报**编译错误**（属性不存在）——这本身就是"字段被删"的静态证据，也是本次事故本可被 CI 抓住的地方。
   - 对 `host-types/session-list-alpha1.d.ts`：新代码的 legacy 分支必须编译通过。
   - 新代码对两份声明都要通过：`uiSession` 成员声明为可选、legacy 读走本地结构类型 + 收窄，全程不用 `any`（如需诊断，跑一次 `skipLibCheck: false` 并声明消费声明的包）。
2. **seam 层（不起宿主）**：写一个约 30 行的 stub 夹具，把 `applyBody` 的依赖（`ctx.sessions`、`ctx.uiSession`、`ctx.uiConversation`、`actx.get('conversation')`、`input.setDraft`）各造两份——一份 alpha.1 形（`list` 快照带 `current`，`scope(id)` 返回带 `conversation` 的 ctx），一份 alpha.2 形（`adapter.current` 返回 `{ key, ctx }`，`sessions.list` 快照只有 `items`）——然后断言：(a) 两个 stub 上 `resolve()` 都返回非 `null`；(b) 派发一次 `ctrlKey + ArrowUp` 的 `KeyboardEvent` 后 `setDraft` 被调用且 `defaultPrevented === true`；(c) alpha.2 stub 上若故意删掉 `key`，探针返回 `'incompatible'`。这只验证一个 seam，不需要迁移整个插件。
3. **真机层（最小动作）**：在 alpha.2 宿主上装修正版，开一个会话，Ctrl+Up 应填入上一条已发送消息、Ctrl+Down 回退；切换主视图会话后 `lastSessionId` 复位（browse 从 IDLE 开始）；关掉所有会话时和弦无动作且不报错。alpha.1 宿主重复同一组动作做回归。技能提供的只读契约检查器 `scripts/verify-runtime.mjs`（离线运行时契约校验）可用来跑"插件条目激活且所需 Cordis 服务不 pending"这一层；本次未执行（题面禁止安装/迁移，仅列为进一步手段）。
4. **回归防护**：把 §4.2 的探针固化成插件自测用例，两份 stub 各跑一遍；这比"升级后手按和弦"更早暴露下一轮字段级删除。

### 5.2 哪一个宿主侧单点改动能把这次静默删除变成激活期巨响

**把断裂做成成员级，而不是字段级。** 具体说：宿主不应让 `sessions.list` 这个名字带着**新载荷**继续存在，而应删掉/改名该成员（例如只保留 `uiSession.adapter.current` 这一公共面，或把新形状发布到新名字下），让旧读在 alpha.2 上直接面对 `undefined`。

理由链：现役守卫恰恰对**成员消失**敏感——`['sessions.list', ctx?.sessions?.list]` 一旦为 `undefined` 就会在 `apply()` 阶段渲染 remediation banner。字段级静默改形状（本次做法）让所有存在性检查继续通过，于是激活期零信号；成员级断裂则把同一个故障前移到激活期，插件当场亮 banner。等价的说法：宿主发布 .d.ts 时已经把 `current` 删了（类型是诚实的），但只要运行时仍留着同名成员，类型层的断裂就传不到运行时层——删掉同名成员，两层断裂就对齐了。

（次优的单点改动，同样满足"激活期巨响"：让宿主在激活期校验插件**声明式依赖的成员契约形状**——即把 `inject` 从弱名字注入升级为带形状断言的强契约，缺失字段即拒绝激活。这会同时惠及所有插件，但改动面比"删成员"大。）

---

## 6. 证据冲突与残余风险（记录双方，不静默取边）

| # | 冲突/缺口 | 处置 |
|---|---|---|
| 1 | fixture `ui-session-service-alpha2.d.ts:1-2` 称 `uiSession` 是 alpha.2 新出货；版本卡 **DSH-0.1.6-A2-01** 称其在 alpha.1 也已注册（`ui-approval` 已 inject），仅持有当前 binding 的字段在两侧都是 private，并称 `ctx.uiSession.adapter.current.getSnapshot()` "两个 tag 都能用" | §3 代码按形状探测优先 + legacy 回退，两种真相下均正确；上线前在 alpha.1 真机确认 `ctx.uiSession?.adapter?.current` 是否可用，若可用则可简化为单分支 |
| 2 | 卡 **DSH-0.1.6-A2-01** 提到 alpha.2 还可从 `sessions.list.getSnapshot().byId` 找 `retainedBy.mainView > 0` 的行；fixture 的 alpha.2 节选里没有 `byId`（只有 `items`） | 不采用该备选路径做主读取（节选与卡不一致，`items` 条目形状未知）；仅作交叉校验候选 |
| 3 | `sessions.scope(id)`、`ctx.uiConversation.binding(id)…views.get('chat')` → `chat.legacy.nodes`、`conversation.input.for(actx)` 在 alpha.2 的行为无证据覆盖 | 修好 id 读后按 §5.1(3) 真机验证；若历史为空/解析为 `null`，按同一方法做第二次归因 |
| 4 | alpha.2 发布说明"插件依赖解析模式调整为运行时解析，插件管理支持运行时卸载"（`upgrade-notes.txt:2`） | 未评估；建议复查插件的 dispose 路径（监听器/effect 是否成对），避免运行时卸载造成双挂载 |
| 5 | 插件自身仓库不可得（`fixture/README.md:20-21`） | "latest 版本"是否已含修复无法判定；需比对插件 tag |

## 7. 本次只读操作清单

- 读取（技能侧）：`skills/plugin-upgrade/SKILL.md`、`references/v0.1.6-alpha.2.md`、`references/host-plane-probes.md`、`references/troubleshooting.md`
- 读取（证据侧）：`fixture/README.md`、`fixture/symptom-report.md`、`fixture/plugin/src-client-index.ts`、`fixture/host-types/session-list-alpha1.d.ts`、`fixture/host-types/session-list-alpha2.d.ts`、`fixture/host-types/ui-session-service-alpha2.d.ts`、`fixture/upgrade-notes.txt`
- 命令：仅目录列举与文件读取（`Get-ChildItem -Recurse`、`read`）；无 `node --check` 需求（未改动任何源码）；无安装、无迁移、无 fixture 写入
- 输出：`agent-output/S23-passing-compat-guard-trap/report.md`（本文件）



## Required output (JSON only)
{"decisions":[{"id":"<criterion-id>","verdict":"pass|partial|fail|missing","reason":"short"}],"caps":[{"id":"<cap-id>","triggered":false,"reason":"short"}]}
Every criterion and cap exactly once. pass=full points, partial=half, fail/missing=0; a triggered cap caps the total.