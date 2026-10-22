# S24 · The Dock That Vanished Together — 诊断报告（skill 臂）

- 场景：Windows web profile，npm global 原地升级 `@deepseek-ai/dsh` 0.1.6-alpha.1 → 0.1.6-alpha.2，六个 junction-linked 外部客户端插件；升级+重启后同时出现两个症状：会话进度条（session-progress strip）从 composer dock 整体消失；粘贴/附件插件（plugin B）的 chip rail 不再渲染（但其 attach button 仍在）。
- 证据：`fixture/` 只读证据包（symptom-report.md / console-excerpt.txt / tried-notes.txt / plugin-a 组件摘录 / plugin-b 注册摘录 / 两份 slots 契约 .d.ts / dock-render-tree.md）。
- 关键版本卡片：**DSH-0.1.6-A2-02**（0.1.6-alpha.1→alpha.2 边）：`GlobalStandardProps` 中 `useSessionPendingInteraction` 被 `useSessionStatus`（+ 新增 `useSessionRetainInfo`）替换，`useSessions` 保留；dock slot 本身未变。相关：DSH-0.1.6-A2-01（`SessionListState.current` 移除）。技能库：plugin-upgrade SKILL.md、references/v0.1.6-alpha.2.md、references/migration-hygiene.md（第 3 条 client/host 平面规则）。
- 结论一句话：**崩的是 plugin A（dsh-ui-progress）的 `SessionProgressBar`，它无条件调用了 alpha.2 已从标准 kit 中删除的 `useSessionPendingInteraction`；plugin B 的 chip rail 是与它共用同一个 `DrawerErrorBoundary` 的 dock 同邻条目（co-tenant），被同一场崩溃连带卸载——B 本身没有坏。**

---

## 1. Culprit attribution（归因）

**要点结论：出错的插件是 plugin A（dsh-ui-progress）的 `SessionProgressBar`，失败点是它对标准 kit prop `useSessionPendingInteraction` 的无条件调用；plugin B 的 dock 条目是被共享错误边界连带卸载的同邻受害者，B 的代码路径没有抛任何错。**

### 1.1 谁在哪个确切调用上失败

F12 唯一的错误精确点名了符号与位置：

```
Uncaught TypeError: useSessionPendingInteraction is not a function
    at SessionProgressBar (plugin://dsh-external/dsh-ui-progress/lib/client.js:219:41)
    at DockEntry (dsh-client-ui-conversation)
    at DrawerErrorBoundary (dsh-client-ui-conversation)
    at InputDock (dsh-client-ui-conversation)
```

对应 plugin-a 摘录中的这一行（render 主体内、无条件执行）：

```tsx
const pendingBySession = useSessionPendingInteraction(interactions => interactions)
```

在 alpha.2 主机上传入的这个 prop 是 `undefined`，调用即抛 `TypeError`。注意抛点之前的所有代码（`session` 判空、`useConversation`、`useProjection`、`useSessions`）都正常——错误发生在第一次触碰被删座位时，所以 strip 是"整体消失"而不是"局部错乱"。

### 1.2 为什么是现在：两个密封契约之间的标准 kit 减法

对比两份 host 契约摘录（即卡片 DSH-0.1.6-A2-02 的一手证据）：

| 标准 kit prop | alpha.1（slots-contract-alpha1.d.ts） | alpha.2（slots-contract-alpha2.d.ts） |
|---|---|---|
| `useConversation` | 有 | 有（未变） |
| `useSessions` | 有 | 有（未变，快照内容变了，见 A2-01） |
| `useSessionPendingInteraction` | **有**（"Pending human interactions by session id"） | **已删除** |
| `useSessionStatus` | 无 | **新增**（"Per-session status: running, completionUnread, pendingInteraction"） |
| `useSessionRetainInfo` | 无 | **新增**（引用计数，如 `retainedBy.mainView`） |
| `useProjection` / `useInput` / `inputActions` | 有 | 有（未变） |

alpha.2 的注释还点明了机制：标准 kit = conversation slots 契约的 session kit **合并** `@deepseek-ai/dsh-client-ui-session` 在多实例 Session 引用重构后附加到每个 slot 的 `GlobalStandardProps`。卡片 DSH-0.1.6-A2-02 的原文结论：dock slot 本身（`'conversation.input.dock': { kind: 'list'; scope: 'session' }`）和 session kit `useConversation`/`useInput`/`inputActions` 在两个 tag 上声明一致——**被换掉的只有 GlobalStandardProps 里的 pending 座位**。因此 plugin A 的注册、props 类型、slot 坐标全都"通过"了兼容检查，直到运行时第一次调用才炸：这正是 required-if-hit 型 breaking change 的典型形态。

### 1.3 为什么无辜同邻的 dock 条目随之消失：共享边界机制

机制名：**单一边界承载整个列表 slot——co-tenant crash by shared error boundary（共享错误边界的同邻连带）**。

由 dock-render-tree.md：

```
<InputDock>
  <DrawerErrorBoundary name="input.dock">
    <DockEntry id="dsh-paste-input-dock" />   (plugin B, order 5)
    <DockEntry id="progress" />               (plugin A, order 20)
  </DrawerErrorBoundary>
</InputDock>
```

- `conversation.input.dock` 是**一个列表 slot**，所有条目作为兄弟挂在**同一个** `DrawerErrorBoundary`（name="input.dock"）之下；`DockEntry` 自身**不加**边界。
- React 遇到 render throw 会向最近的边界卸载整棵子树：A 的 throw 命中这个共享边界，边界的 `getDerivedStateFromError` 渲染 `null` 兜底——于是**整个 dock 列表**（B 的 chips 条目 + A 的 progress 条目 + 其他条目）一起消失，直到下次切换 session 边界才 reset。
- 这与主机日志逐字吻合：`[dsh:slots] input.dock boundary fallback active (session s-7f3a); unmounted entries: dsh-paste-input-dock, progress`。即：不是"A 把 B 弄坏了"，而是"A 的崩溃经过共享边界把包含 B 的整棵 dock 子树卸载了"。

### 1.4 为什么另一个 slot 里的 attach button 活了下来

B 注册了两个面：chips 在 `conversation.input.dock`（与 A 同一个 slot、同一个边界内），button 在 `conversation.input.left`（**另一个 slot**）。dock-render-tree.md 显示 `InputLeft` 有**自己独立的** `DrawerErrorBoundary name="input.left"`：

```
<InputLeft>
  <DrawerErrorBoundary name="input.left">
    <SlotEntry id="dsh-paste-input-button" />   (plugin B, order -100)
  </DrawerErrorBoundary>
</InputLeft>
```

dock 边界的兜底只覆盖它自己的子树，够不到 input.left 的边界——所以同一个插件的 button 幸存、chips 殉难。主机日志同样佐证：`[dsh:slots] input.left: 1 entry mounted (dsh-paste-input-button)`。**隔离单位是"每个 slot 一个边界"，不是"每个插件"**：同一插件跨两个 slot 注册时，两个面拥有不同的故障命运。console 里"粘贴 toast 第一次出现后再未出现"也与此一致——B 的粘贴处理管线（在别的面/事件路径上）仍在跑，只是 dock 内的渲染面没了。

---

## 2. The experiment（对照实验能证明什么、不能证明什么）

**要点结论：禁用 A → B 的 chips 立刻恢复，证明"A 的渲染崩溃"对 dock 全黑既是必要的又是充分的，并把故障定位在 dock 子树内；但它不能证明 B 在 alpha.2 上无 bug，也不能证明 strip 崩溃是 dock 唯一的问题。**

### 2.1 它证明了什么

- **必要性（necessity）**：A 不在时，dock slot 机器、B 的注册与渲染路径在 alpha.2 上工作正常——chips 回来，说明 dock 列表机制本身没坏。
- **充分性（sufficiency）**：重新启用 A，症状复现——A 的一次 render throw 足以让整个 dock 列表黑屏。
- **定位（localization）**：结合唯一的 console 错误（点名 plugin A 的 bundle 与 `useSessionPendingInteraction`）与主机卸载日志（同时列出两个条目），故障被夹在"dock 子树内的共享边界 + A 的渲染路径"这一隅。实验把"两个症状"收敛为"一个崩溃 + 一个边界"。

### 2.2 它不能证明什么

- **不能证明 plugin B 在 alpha.2 上无 bug**：实验只检验了"A 缺席时的 B"。要判定 B 干净，需要检验 B 自身对 alpha.2 标准 kit 的使用——那不在实验覆盖范围内。证据包里独立的代码证据（B 的 dock 条目只读自己的 inject 状态、不用任何标准 kit hook、自己的 try/catch 无日志）提示 B 大概率无事，但这是**读代码得出的假设，不是实验结论**；尤其卡片 DSH-0.1.6-A2-01 记载 alpha.2 移除 `SessionListState.current` 后，一批插件"兼容检查通过但静默 no-op"，一手案例里中招的恰好好一个粘贴/drop 插件（每次粘贴报"请先打开一个会话"）——这类 bug 在本实验里根本不会被触发到，必须在修复后真实粘贴一遍才能排除（见第 5 节）。
- **不能证明 strip 崩溃是 dock 唯一的问题**：A 禁用后只演练了 B 一个条目；六个插件 profile 里其余 dock 租户未被检验，A 自身抛点之后的渲染路径也从未跑完。实验证明的是"一个充分原因"，不是"完整原因集合"。
- **顺带**：实验也不解释机制（为什么进度条能带走附件栏）——机制来自契约 diff + 渲染树，不来自实验。

### 2.3 为什么重装 B 不可能有用

失败不在 B 的代码、B 的 bundle 或 B 的注册里：B 的渲染路径不抛错（它自己的 try/catch 无日志），黑屏是共享边界对 **A 的 throw** 的反应。重装 B 只是把同一个 `dsh-paste-input-dock` 条目重新注册进同一个列表 slot，仍然挂在同一个 `DrawerErrorBoundary` 之下——A 和边界都没变，结果自然不变。重装只对"B 自身 bundle 损坏/注册失效"类缺陷有意义，而证据显示两类都不成立。

### 2.4 同事的"两个插件都被打到"理论错在哪

1. **错误数量与来源**：F12 只有**一个**错误，且点名 plugin A 的 bundle（`plugin://dsh-external/dsh-ui-progress`）与被删符号；B 的路径无错、无日志。
2. **对照实验直接 falsify**：若两插件各自独立损坏，禁用 A 后 B 的 chips 应仍然缺失；实测 B 完全恢复——说明 B 的症状是果，A 的崩溃是因。
3. **契约 diff 反证"各中一枪"**：被删的座位（`useSessionPendingInteraction`）在证据包里只有 A 的组件消费；B 的注册不用任何标准 kit hook。"把两个插件的 slot 注册都修一遍"既修错了对象（B 的注册本来就是好的，dock entry registers fine），也会漏掉真正的缺陷（A 渲染主体里的一次无条件调用）。


## 3. The fix（修正代码与降级语义）

**要点结论：按"主机实际给了哪个 prop"来选择 pending 座位——alpha.2 上由 `useSessionStatus` 供给 pending 状态；两个座位都没有的主机上，strip 的"待关注"提示静默降级，其余功能照常。**

### 3.1 alpha.2 上由哪个 hook 供给 pending 状态

`useSessionStatus`（卡片 DSH-0.1.6-A2-02 的迁移配方）：

- alpha.1：`useSessionPendingInteraction(snapshot => snapshot.get(sessionId))` → `ReadonlyMap<SessionId, SessionPendingInteraction>`
- alpha.2：`useSessionStatus(snapshot => snapshot.get(sessionId)?.pendingInteraction)`，`SessionStatus` 记录同时携带 `running` 与 `completionUnread`
- `useSessions` 两个 tag 上都在（用于 subagent 子树遍历）；`useSessionRetainInfo` 是新增的引用计数公开读法（本组件不需要）

### 3.2 修正后的组件代码（双主机、优雅降级）

```tsx
/**
 * SessionProgressBar (fixed excerpt): dual-host pending seat.
 * alpha.1 supplies useSessionPendingInteraction; alpha.2 supplies
 * useSessionStatus (card DSH-0.1.6-A2-02). Pick the seat by which prop
 * the host actually hands us: the standard-kit prop set is fixed per
 * host, so the branch is stable across renders (identical hook order
 * on every render of a given host - the rules-of-hooks precondition
 * holds per host, not per render). A host supplying NEITHER seat
 * degrades the attention cue silently instead of throwing into the
 * shared dock error boundary.
 */
export type SessionProgressBarProps =
  import('@deepseek-ai/dsh-client-ui-slots').PropsRuntime<'conversation.input.dock'>
  & PropsLocale<'progress'>
  & {
      // Optional seats: present per host, never assumed present.
      useSessionPendingInteraction?: SnapshotSelectorHook<
        ReadonlyMap<SessionId, SessionPendingInteraction>>
      useSessionStatus?: SnapshotSelectorHook<
        ReadonlyMap<SessionId, SessionStatus>>
    }

const EMPTY_PENDING: ReadonlyMap<SessionId, SessionPendingInteraction> = new Map()

/** SessionId -> this session's pending interaction, on either host. */
function usePendingBySession(
  props: SessionProgressBarProps,
): ReadonlyMap<SessionId, SessionPendingInteraction> {
  if (typeof props.useSessionStatus === 'function') {
    // alpha.2 seat: the unified status record carries pendingInteraction
    return props.useSessionStatus(snapshot => {
      const out = new Map<SessionId, SessionPendingInteraction>()
      snapshot.forEach((status, id) => {
        if (status.pendingInteraction) out.set(id, status.pendingInteraction)
      })
      return out as ReadonlyMap<SessionId, SessionPendingInteraction>
    })
  }
  if (typeof props.useSessionPendingInteraction === 'function') {
    // alpha.1 seat
    return props.useSessionPendingInteraction(interactions => interactions)
  }
  // Neither seat on this host: the attention cue degrades; the strip
  // itself keeps rendering. No throw, no console error.
  return EMPTY_PENDING
}

export function SessionProgressBar(props: SessionProgressBarProps) {
  const {
    session, sessionId, t,
    useConversation, useProjection, useSessions,
  } = props
  if (session === undefined || session === null) return null
  const chat = useConversation(conversation => conversation.views.get('chat'))
  const legacy = chat?.legacy ?? EMPTY_LEGACY
  const todos = useProjection('todos')
  const toolName = runningTool(legacy)
  const running = session.running
  // ... percent / turn / elapsed / eta derivation unchanged ...

  // Attention state (this session's own pending waits plus the subagent
  // subtree's), now resolved through whichever seat the host supplies.
  const pendingBySession = usePendingBySession(props)
  const ownPending = pendingKindOf(pendingBySession.get(sessionId)?.kind)
  const subPending = subagentPendingState(
    useSessions(s => s.byId), pendingBySession, sessionId)
  const pending = ownPending !== null || subPending.approvals > 0 || subPending.questions > 0

  // Background state: unchanged - useSessions survived the edge.
  const subRunning = subagentRunningCount(useSessions(s => s.byId), sessionId)

  return (
    <div className={css.bar} data-pending={pending || undefined}>
      {/* state text, fill bar, todos percent, token chip, elapsed/eta */}
    </div>
  )
}
```

要点：

- **座位探测用 `typeof … === 'function'`**，不用 try/catch 包调用——前者把"主机没有这个座位"变成可判定的静态事实（每台主机的 prop 集合固定，分支跨渲染稳定），后者只在下一次 throw 之后才兜底，且会把类型错误和缺座位混为一谈。
- 条件分支的 hook 顺序在同一主机上恒定（卡片 DSH-0.1.6-A2-02 明确认可此模式："pick the hook by which prop the host supplies — the set of props is fixed per host, so the branch is stable across renders"）。
- 双主机单包：alpha.1 走旧座位、alpha.2 走新座位，无需按主机版本发两包。
- 兜底再加一层：把条目本体包进一个**条目级**错误边界（见第 4 节），未来任何未知 throw 都闷死在自己的边界里。

### 3.3 两种主机上的降级/保持矩阵

| 功能 | alpha.1（旧座位） | alpha.2（新座位） | 两个座位都没有的主机 |
|---|---|---|---|
| running 工具名/状态、进度填充 | 正常 | 正常 | **正常**（来自 `session` prop 与 `useConversation`/`useProjection`/`useSessions`，这些都没被删） |
| todos 百分比、token 用量 chip、elapsed/eta | 正常 | 正常 | **正常** |
| 待关注提示（`data-pending`：本会话 own pending + subagent 子树的 approvals/questions） | 正常 | 正常（经 `useSessionStatus(...).pendingInteraction`） | **静默降级**：`pending` 恒为 false，strip 失去"需要注意"的高亮cue，其余渲染不变 |

即：**降级的只有"注意力/待办提醒"这一个咨询性特性；strip 的主体信息（运行态、进度、todos、token、耗时）在任何主机上都保持工作。**

### 3.4 为什么降级必须静默而不能抛

- dock 条目里一次 throw 的后果不是"这个特性没了"，而是**整棵 dock 子树被共享 `DrawerErrorBoundary` 卸载**——那正是 S24 本身。对一个咨询性高亮来说，正确的失败模式是"少一个 cue 的静态 strip"，而不是"连坐掉整个 composer 停靠区（含同邻插件）"。
- 静默（渲染继续、无 console 错误、无 boundary fallback 日志）同时保住**故障可归属性**：一旦将来真有回归，日志里出现的边界 fallback 仍然是一条强信号，不会被日常降级噪声淹没。
- 这也符合卡片对可选座位的收尾口径："degrade to an empty state when neither is present"。


## 4. Multi-tenant hygiene（租户卫生与主机隔离）

**要点结论：租户侧要做到"座位探测 + 自己的条目级边界"，让自己的崩溃闷死在自己里面；主机侧应把"每 slot 一边界"改成"每条目一边界"，让单个条目的失败只卸载它自己——代价是失败变得更安静、可归属性更依赖主机日志。**

### 4.1 dock 租户应该做什么（plugin A/B 双方都适用）

1. **不无条件调用标准 kit 的任何 prop**：跨版本可能被换/被删的座位（本边就是 GlobalStandardProps 的 pending 座位被换、`SessionListState.current` 被删，DSH-0.1.6-A2-01/02），调用前 `typeof === 'function'` 探测，并为咨询性特性保留静默降级路径。优先依赖**slot 自身契约**里声明的 prop（`useConversation`/`useInput`/`inputActions`——这条边上两个 tag 一致），把对 GlobalStandardProps 的依赖降到最低。
2. **自备条目级错误边界**：把渲染主体包进一个自己的小边界（throw → 渲染 null/占位），这样即使未来再踩未知座位，崩溃也到不了共享 dock 边界。注册期的 try/catch（B 已经有）只保护激活路径，保护不了 render——两者都要有。
3. **注册与渲染分离的失败观**：注册成功 ≠ 渲染安全；本案例中 A 的注册、props 类型、slot 坐标全部"通过"，唯一炸点在一次 render 调用。

### 4.2 主机可以改什么

- 把 `InputDock` 的**一个 `DrawerErrorBoundary` 包整个列表**改为**每个 `DockEntry` 各自一个边界**（或把列表每个 child 经一道边界渲染），单条目 throw 只卸载该条目，其余条目原样存活；主机继续记录失败条目 id（现有 `unmounted entries: …` 日志已是很好的归因信号，可升级为 per-entry 的 fallback 日志）。
- 可选增强：给被隔离条目一个轻量占位（而不是裸 null），让"死条目"在 UI 上可辨识。

### 4.3 主机面对的 trade-off

- **共享单边界（现状）**：便宜、失败响亮（整个 dock 消失 + 一条 fallback 日志，想忽视都难），但把每个租户的可用性耦合到**最脆弱的那个租户**——S24 正是这个耦合的账单。
- **每条目边界**：爆炸半径收缩到一个条目，可用性解耦；但失败变安静（死条目和"没注册"长得一样，特性丢失可能长期无人察觉），且每个边界带来额外的挂载/重置语义与状态丢失成本；可归属性从"UI 整体消失"转移到"主机日志是否尽责"。
- 中间路线：每条目边界 + 主机侧占位/遥测，用一点 UI 噪音换回可归属性——这也是本案例之后 dock slot 值得演进的方向。

---

## 5. Verification（验证方案）

**要点结论：修复落在 client 半（`lib/client.js`），重建 plugin A 的客户端 bundle 后浏览器硬刷新即可生效，无需重启主机；验证必须同时覆盖"两个 dock 条目都回来了"和 plugin B 的粘贴→chips 回归（含同邻崩溃隔离）。**

### 5.1 不停主机重启生效的路径

- 依据 migration-hygiene 第 3 条（client/host 平面规则）：改在 `lib/client.js`（client 半）的代码**浏览器硬刷新即生效**；只有改到 `lib/index.js`（host 半）才需要重启 dsh。本修复纯 client 半（组件渲染），所以：重建 plugin A 客户端 bundle（junction-linked，profile 的 `node_modules` 即时可见）→ 浏览器硬刷新。
- 双保险：dock 的 `DrawerErrorBoundary` 在**下次切换 session 时 reset**（dock-render-tree.md），刷新后做一次 session 切换可强制干净重挂；若 profile 开了 HMR，插件重载亦可即时生效（不开则重启或硬刷新）。

### 5.2 修复生效的判据（两插件均启用）

1. Console：零错误；不再出现 `[dsh:slots] input.dock boundary fallback active`。
2. 主机 slot 日志：`input.dock` 同时挂载 **两个**条目（`dsh-paste-input-dock` + `progress`）；`input.left` 仍有 1 个条目（`dsh-paste-input-button`）。
3. strip 渲染：running 工具/状态、todos 百分比、token chip、elapsed/eta 均在。
4. pending 座位：在会话（及其 subagent 会话）里制造一次待审批/待提问 → alpha.2 上 strip 的 `data-pending` 经 `useSessionStatus` 亮起；在 alpha.1 主机上同法经 `useSessionPendingInteraction` 亮起（卡片 DSH-0.1.6-A2-02 的验证口径）。

### 5.3 必须覆盖的 plugin B 回归

- **原始症状路径**：粘贴文件 → 首次 toast + chips rail 在 composer 上方渲染；多文件粘贴 → 全部 chips 呈现；经 B 自己的 inject 状态（`remove`/`add`）增删 chip 正常；全程无 console 错误。
- **双面俱在**：dock 条目与 input.left 按钮分别挂载（跨 2 个 slot、2 个边界）。
- **同邻崩溃隔离（最能抓住 S24 的回归）**：在 B 启用时人为让某个 dock 同邻抛错（如临时注入一个抛错的测试条目）→ **B 的 chips 必须保持渲染**。这一条在修复前必红、修复后（配合第 4 节条目级边界）必须为绿。
- **session 切换**：切换 session 再切回，两个条目均干净重挂（覆盖边界 reset 路径）。
- **B 的 alpha.2 兼容性本身**：真实粘贴一遍以排除 A2-01 类"注册通过但静默 no-op"（该卡片一手中招案例正是粘贴/drop 插件）——本证据包只含 B 的 dock 注册摘录，其事件路径（粘贴拦截）未见，不能免检。

---

## 附：读取文件 / 运行命令 / 报告路径

### 读取过的文件（只读）

1. `skills/plugin-upgrade/SKILL.md`（技能主卡；模式/安全边界/验证报告结构）
2. `skills/plugin-upgrade/references/v0.1.6-alpha.2.md`（卡片 DSH-0.1.6-A2-01…04；本案例核心为 A2-02，兼引 A2-01）
3. `skills/plugin-upgrade/references/migration-hygiene.md`（第 3 条 client 硬刷新 vs host 重启平面规则）
4. `skills/plugin-upgrade/references/troubleshooting.md`（检索，无直接命中条目）
5. `fixture/README.md`、`fixture/symptom-report.md`、`fixture/console-excerpt.txt`、`fixture/tried-notes.txt`
6. `fixture/plugin-a/SessionProgressBar-excerpt.tsx`、`fixture/plugin-b/dock-entry-excerpt.md`
7. `fixture/host-types/slots-contract-alpha1.d.ts`、`fixture/host-types/slots-contract-alpha2.d.ts`、`fixture/host-types/dock-render-tree.md`

（以上 fixture/ 与技能目录文件均未改动；引用卡片仅摘要点与卡片 ID。）

### 运行过的命令（全部只读）

1. `Get-ChildItem -Recurse`（格目录 + 技能目录文件清单）
2. `read` × 12（上述全部证据与参考文件）
3. `grep` × 2（troubleshooting.md / migration-hygiene.md 检索 boundary/co-tenant/isolat 关键词，后者无命中）
4. `write` × 1 + `edit` × 3（仅写本报告至 agent-output/ 下）

### 报告路径

`E:\deepseek-harness\dsh-plugin-upgrade-skill\benchmark\results\artifacts\2026-10-16-step5-preview-s1-s24-r3\skill\S24-dock-cotenant-crash-trap\agent-output\S24-dock-cotenant-crash-trap\report.md`

