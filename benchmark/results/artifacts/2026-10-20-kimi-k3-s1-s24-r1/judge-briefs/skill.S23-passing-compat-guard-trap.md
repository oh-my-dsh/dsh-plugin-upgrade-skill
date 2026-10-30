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
#### FILE: S23-passing-compat-guard-trap/S23-report.md

# S23 · The Compat Guard That Passed — 诊断报告

**Scenario**: dsh npm-global in-place upgrade `0.1.6-alpha.1 → 0.1.6-alpha.2` (Windows, web profile, six junction-linked client plugins); the `dsh-input-history` plugin's Ctrl+Up/Ctrl+Down recall silently dies; its four-check compat guard passes; no console output.

**Skill card hit**: `DSH-0.1.6-A2-01` — "Multi-instance Session references: `SessionListState.current` is removed; resolve the main Session through `uiSession.adapter.current`"（要点：alpha.1 的 `SessionListState` 携带 `current: SessionId | undefined`；alpha.2 多实例重构把 "current" 改为按 source 引用计数 + 主视图占用语义，快照接口整体换成 `SessionListSnapshot`，`current` 字段消失；守卫查的是服务存在性所以照常通过，事件时解析静默 no-op；公开双宿主路径是注入 `uiSession` 并读 `ctx.uiSession.adapter.current.getSnapshot()`，其 `key` 即主会话 id、`ctx` 即会话作用域 Context；卡片还记录了一手证据——正是一个 composer input-recall 插件在宿主升级后 Ctrl+Up/Down 完全失效）。

---

## 1. Silent-failure attribution（静默失败归因）

### 每次按键的解析路径（plugin/src-client-index.ts）

`onKeyDown`（capture 阶段挂在 window 上，插件行 50–65）通过修饰键/键名/输入法/composer 目标四道过滤后调用 `resolve()`（行 33–48），路径为：

1. `const id = sessions.list.getSnapshot().current`（行 34）— 读全局会话列表快照的 `current` 字段；
2. `if (id === undefined) return null`（行 35）— 无当前会话即放弃；
3. `const actx = sessions.scope(id)`（行 41）→ `actx.get('conversation')`（行 43）→ `ctx.uiConversation.binding(id)…`（行 45）— 依次取会话作用域、conversation 服务、chat 节点；
4. 返回 `{ input, nodes }` 后 `onKeyDown` 才推进历史状态机并 `setDraft`。

### 现在失败的确切读取

**就是第 1 步：`sessions.list.getSnapshot().current`**。在 alpha.2 上，`sessions.list` 快照的接口从 `SessionListState`（含 `current`）换成了 `SessionListSnapshot`（`items/state/phase/error/subagentsByParent/jobsBySession`，无 `current`）。插件是按 alpha.1 的 `.d.ts` 编译的，但宿主是运行时动态注入的服务对象——JS 读一个不存在的属性不抛异常，只得到 `undefined`。

于是每一次 Ctrl+Up / Ctrl+Down：

- `id === undefined` → `resolve()` 返回 `null` → `onKeyDown` 在行 56 `return`；
- `e.preventDefault()` / `e.stopPropagation()`（行 61–62）**永不执行**，按键事件继续冒泡，composer 自带的多行光标移动照常工作——与症状报告"the chord is not swallowed either"完全吻合；
- `browse`/`lastSessionId` 永不更新，`setDraft` 永不调用。**每个按键都是一次静默 no-op**。

### 为什么没有任何地方报错

- **守卫为什么通过**：`applyWithCompat` 的四个探针（行 84–87）是 `sessions.list`、`sessions.scope`、`sessions.sessionOf`、`uiConversation.binding`——全部是**服务/方法存在性**检查。alpha.2 中 `sessions` 服务在、`list` ObservableSnapshot 在、`scope(id)` 方法在（alpha.2 摘录的 NOTE 明确 `scope(id)` 仍存在）、`uiConversation.binding` 也在。被删的是**快照值的字段** `current`，比守卫的探测粒度低一层，存在性守卫在结构上看不见字段级移除。
- **为什么没有 console error**：路径上没有任何 throw。`undefined.current` 并不会发生——读的是 `snapshot.current`，snapshot 对象本身存在；每一步都有 `=== undefined → return null` 的防御分支，把失败优雅地吞掉了。防御性 early-return 本是好的容错，却同时抹掉了所有可观测信号。
- **为什么是 no-op 而不是异常**：类型层面的移除（接口少一个字段）在运行时表现为"属性不存在 → `undefined`"，而插件对 `undefined` 的语义解释恰好是合法的"当前没有会话"。语义上的歧义（"没有当前会话" vs "字段不存在了"）让这个失败与正常空闲状态无法区分。

### 对 already-tried 清单的裁决

- **被本归因终结的怀疑**：同事注记与清单第 2 条隐含的"**守卫是可信的兼容性证明**"。守卫通过 ≠ 兼容，本案例就是反例：四个检查全真，插件照样死。同事怀疑的"re-register slot / re-declare inject"方向也不对——问题不在 slot 注册，也不在已有 inject 缺失（`sessions`/`uiConversation` 都注入了）；正确修法确实要往 inject 里**加** `uiSession`，但原因是需要它的 `adapter.current` 来替代被删的 `list…current`，而不是"注册声明错了"。
- **本归因不处理的怀疑**：清单 3（junction 重链/硬刷新）、4（禁用其他插件）、5（插件版本芯片）——这些假设的是加载/拓扑/版本问题，boot 日志显示 combo 57 条、无 pending、无重复 loader id，且本归因是纯运行时字段缺失，与加载链无关；它们既不证实也不证伪，只是不相关。清单 6（拔掉插件后按键仍无人处理）与本归因一致：按键本来就没有别的宿主。

---

## 2. Evidence mapping（证据映射）

### 两个 session-controller 类型摘录：快照发生了什么变化

| | alpha.1 `SessionListState` | alpha.2 `SessionListSnapshot` |
|---|---|---|
| 当前会话 | `current: SessionId | undefined` —— 主视图绑定的会话 id | **字段不存在** |
| 会话集合 | `byId: Record<SessionId, SessionSummary>` | `items: readonly SessionListEntry[]`（另有 `state/phase/error/subagentsByParent/jobsBySession`） |

多实例重构后，"current" 不再是列表状态里的一个字段，而是"主视图占用"这一引用事实（卡片要点：`retainedBy.mainView > 0` 的那一行）。**含义：插件每次按键从 `snapshot.current` 读到的恒为 `undefined`**——不是偶发、不是时序问题，是确定性、永久性的 `undefined`，因为该属性在新对象形状上根本不存在。

### 新服务摘录：权威替代读取

- **服务**：`UiSession`（client bundle `@deepseek-ai/dsh-client-ui-session` 导出，inject 名 `uiSession`）。注意卡片指出它并非 alpha.2 新增——alpha.1 上同包已注册该服务，这正是双宿主单构建可行的基础。
- **Observable**：`uiSession.adapter.current` —— `ObservableSnapshot<SessionBindingValue>`，"Binding source of the main view's current session"。
- **值的形状**（`SessionBindingValue`）：
  - `key: SessionId` —— 绑定会话的 id；**无主会话时服务发布"absent value"，`key` 为 `undefined`**（摘录尾注）；
  - `ctx: Context` —— **会话作用域 context，替代 `sessions.scope(id)` 的字段**："services registered under this session resolve here"，原来 `actx.get('conversation')` 的 `actx` 现在直接从这里来；
  - `hooks / keyedHooks / props` —— `provide()` 贡献的标准源内容（本插件不需要）。

---

## 3. Migration recipe（迁移配方）

### inject 声明的改动

```ts
export const inject = ['sessions', 'uiConversation', 'conversation', 'uiSession']
```

新增 `'uiSession'`。因为 `uiSession` 在两个标签上都由 `dsh-client-ui-session` 注册， Cordis 注入在 alpha.1 与 alpha.2 上都能解析，不会把旧宿主挡在门外。守卫也应相应加入 `['uiSession.adapter', ctx?.uiSession?.adapter]`。

### 会话作用域 context 如何到达 conversation 服务

不再调 `sessions.scope(id)`：从 `uiSession.adapter.current.getSnapshot()` 得到的 `SessionBindingValue.ctx` **就是**会话作用域 context，直接 `binding.ctx.get('conversation')`。alpha.1 分支继续走旧路 `sessions.scope(id)`。

### 双宿主解析函数（单构建，两段宿主都工作）

```ts
function makeResolve(
  ctx: ClientContext,
  sessions: ISessions,
  onSessionSwitch: (id: string) => void,
): () => ResolvedSession | null {
  let lastSessionId: string | undefined

  return (): ResolvedSession | null => {
    // alpha.2 权威路径：uiSession.adapter.current（alpha.1 上同一服务也在，
    // adapter.current 同样可用；优先走它对两个宿主都正确）。
    const uiSession = (ctx as any).uiSession
    const binding = uiSession?.adapter?.current?.getSnapshot?.()

    let id: string | undefined
    let actx: import('@deepseek-ai/cordis').Context | undefined

    if (binding !== undefined && binding !== null) {
      // alpha.2（以及提供该 adapter 的 alpha.1）：key = 主会话 id，ctx = 会话作用域
      id = binding.key
      actx = binding.ctx
    } else {
      // 纯 alpha.1 回退：旧字段 + 旧 scope(id)
      id = (sessions.list.getSnapshot() as { current?: string }).current
      if (id !== undefined) actx = sessions.scope(id)
    }

    if (id === undefined || actx === undefined) return null
    if (id !== lastSessionId) {
      onSessionSwitch(id)              // 会话切换：browse = IDLE
      lastSessionId = id
    }
    const conversation = actx.get('conversation') as IConversation | undefined
    if (conversation === undefined) return null
    const chat = ctx.uiConversation.binding(id).snapshot.getSnapshot().views.get('chat')
    const nodes = chat === undefined ? EMPTY_NODES : chat.legacy.nodes
    return { input: conversation.input.for(actx), nodes }
  }
}
```

要点：分支条件是**值的存在性**（`adapter.current` 是否产出 binding）而非宿主版本号，因此一份产物无需版本探测即可覆盖两个宿主；`uiConversation.binding(id)` 与 `conversation.input.for(actx)` 两段后续路径在两个宿主上保持不变。

---

## 4. Guard hardening（守卫加固）

### 存在性检查抓不住的破坏类别

**"容器在、内容变"这一类**：服务存在、方法存在、快照对象存在，但**快照值的形状**变了（字段被删/改名/换语义）。同类的还有：方法签名收窄、返回值的判别联合少了一个分支、枚举值改名。存在性探针的粒度是"属性路径可解析到非空引用"，而破坏发生在引用指向的**数据契约**上——类型级移除在运行时不产生任何可探测的缺失。

### 加固后的守卫应该探什么、何时探

- **探"一次真实的解析往返"而不是服务存在**：在激活期实际执行一遍插件最关键的事件时解析路径的只读版本——调 `sessions.list.getSnapshot()` 并断言返回对象**确实持有插件要读的字段**（本例：`'current' in snapshot || uiSession?.adapter?.current?.getSnapshot?.()?.key !== undefined` 的等价判定），并对 `actx.get('conversation')`、`uiConversation.binding(id)` 的返回形状做最小结构断言（duck-typing：`typeof conversation?.input?.for === 'function'`）。空会话是合法结果（`undefined`），"字段不存在"才是守卫要抓的——所以探测应区分"值合法为空"与"形状不符合契约"，后者才触发 banner。
- **探测时机：必须在 `apply` 激活期、在 `applyBody` 安装键盘监听之前运行**，而不是首次按键时。本失败模式的特征恰恰是"事件时永远静默 no-op"——如果探测推迟到第一个 Ctrl+Up，用户感知到的仍然是"插件死了且无 banner"；激活期探测才能把"字段级移除"在插件加载那一刻变成可见的 remediation banner。对会话相关的探测，无打开会话时应标记为"待复测"并在首次 `adapter.current` 产出非 absent 值时补测一次，而不是直接放行。

---

## 5. Verification and prevention（验证与预防）

### 不做完整迁移，如何在两个宿主上验证修复

1. **静态层**：在插件仓库对 alpha.1 与 alpha.2 两份 `.d.ts` 各跑一次 typecheck（双 `tsconfig` 或 `skipLibCheck: false` 的诊断轮），确认新 `resolve` 对两个类型表面都通过；
2. **运行时层（真实宿主冷启动，无迁移）**：分别在两台/两个全局安装的宿主（一台 pin `0.1.6-alpha.1`、一台 pin `0.1.6-alpha.2`，均用外部终端执行 pinned 安装后重启 `dsh web`）上以同一 junction 加载新构建，开一个会话发两条消息：
   - alpha.2：守卫不再误放行（若无会话时应不报 banner），Ctrl+Up 回填最后一条消息、Ctrl+Down 回退、切换主会话后历史重置；
   - alpha.1：旧回退路径同样行为；
   - DevTools console 断言 `ctx.uiSession.adapter.current.getSnapshot().key` 在两宿主上都等于当前会话 id（或 alpha.1 回退下 `sessions.list.getSnapshot().current`）；
3. **行为层**：无会话打开时按 Ctrl+Up/Down 必须是安静 no-op（不抛、不抢键），证明 `undefined` 语义未被破坏；composer 自带光标移动在插件未拦截时仍工作。

### 本可让这次静默移除变成激活期巨响的单一宿主侧改动

**让 `sessions.list` 在 alpha.2 继续发布一个 `current` 访问器，但它不再是数据字段，而是一个 fail-fast 的 throwing getter（或开发期 Proxy）**：任何插件按旧契约读 `snapshot.current` 时立即抛出带迁移指引的异常（"SessionListState.current removed in 0.1.6-alpha.2, use ctx.uiSession.adapter.current — DSH-0.1.6-A2-01"）。异常发生在 `resolve()` 的第一步——而 `resolve()` 在激活期就可被一次自检调用触发——于是破坏从"每次按键静默 no-op"变成"激活期/首次解析时的具名异常"，守卫或插件作者都能立刻看到。等价替代：在类型上保留 `current` 并标 `@deprecated` 一个过渡版本（配合运行时 deprecation warning），给插件一个迁移窗口，而不是在同一版本里类型删除 + 运行时静默同时发生。

---

## 附：证据索引

- fixture: `plugin/src-client-index.ts`（resolve 行 33–48；守卫行 78–91）、`host-types/session-list-alpha1.d.ts`（`current` 字段）、`host-types/session-list-alpha2.d.ts`（`SessionListSnapshot` 无 `current`，`scope(id)` 仍在的 NOTE）、`host-types/ui-session-service-alpha2.d.ts`（`UiSession`/`adapter.current`/`SessionBindingValue.{key,ctx}`）、`upgrade-notes.txt`（boot log 正常 + already-tried + 同事注记）。
- 技能参考卡：**DSH-0.1.6-A2-01**（本案例的对应卡片，含双宿主迁移路径与一手舰队证据）；DSH-0.1.6-A2-02（同为字段/属性级移除但表现是 render throw，可作对照——A2-01 是静默 no-op，A2-02 是巨响崩溃，差异恰在于读取点是否有防御分支）。


## Required output (JSON only)
{"decisions":[{"id":"<criterion-id>","verdict":"pass|partial|fail|missing","reason":"short"}],"caps":[{"id":"<cap-id>","triggered":false,"reason":"short"}]}
Every criterion and cap exactly once. pass=full points, partial=half, fail/missing=0; a triggered cap caps the total.