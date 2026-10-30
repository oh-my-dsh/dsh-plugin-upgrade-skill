
# S24 · The Dock That Vanished Together — 归因、修复与验证报告

- 版本走廊：dsh-v0.1.6-alpha.1 → dsh-v0.1.6-alpha.2（npm global，Windows，web profile，六个 junction 链接的外部客户端插件）
- 诊断方式：plugin-upgrade 技能 · Mode A（inspect，全程只读）+ 迁移配方卡片；fixture 逐字节未改动，无安装/无迁移执行
- 引用卡片：DSH-0.1.6-A2-02（references/v0.1.6-alpha.2.md，GlobalStandardProps 换 hook）；DSH-0.1.6-A2-01（SessionListState.current 移除，仅作多实例背景）；DSH-0.1.7-A1（React #130 整槽消失的同族现象，仅作对照）

---

## 1. Culprit attribution（肇事者归因）

### 1.1 真正失败的插件与精确调用点

**肇事者是 plugin A（`dsh-ui-progress`，session-progress 插件），不是 plugin B。**

- 失败组件：`SessionProgressBar`（plugin A 注册进 `conversation.input.dock` 的 `id: 'progress'`，order 20）
- 精确调用点：`plugin://dsh-external/dsh-ui-progress/lib/client.js:219:41` —— 组件体（`client.js:201:3`）内对
  `useSessionPendingInteraction(interactions => interactions)` 的调用
- 错误：`Uncaught TypeError: useSessionPendingInteraction is not a function`

即：plugin A 从 props 解构了 `useSessionPendingInteraction` 并**无条件调用**它；在 alpha.2 的标准套件里这个 prop 根本不存在（值为 `undefined`），于是 render 期抛 TypeError。调用处在组件 render 主路径上，因此**每次带 session 挂载都必炸**——这解释了“一升级 + 重启就坏”，也解释了为什么 F12 只有一条 error（同一挂载只报一次，之后边界已 fallback，不再有新的 render）。

### 1.2 为什么是现在：两个契约之间的标准套件变化（sealed contracts 对比）

| 成员 | alpha.1（slots-contract-alpha1.d.ts） | alpha.2（slots-contract-alpha2.d.ts） |
|---|---|---|
| `useConversation` | 有 | 有（不变） |
| `useSessions` | 有 | 有（**保留**，但快照缺 `current`，见 DSH-0.1.6-A2-01） |
| `useSessionPendingInteraction` | **有**（`ReadonlyMap<SessionId, SessionPendingInteraction>`） | **被删除** |
| `useSessionStatus` | 无 | **新增**（`ReadonlyMap<SessionId, SessionStatus>`：running / completionUnread / pendingInteraction） |
| `useSessionRetainInfo` | 无 | **新增**（引用计数，如 `retainedBy.mainView`） |
| `useProjection` / `useInput` / `inputActions` | 有 | 有（不变） |

也就是说 alpha.2 做的是一次**标准套件缩减 + 改形**：旧的 pending hook 被移除，pending 状态并入新的 `useSessionStatus`（multi-instance Session 重构的一部分）。卡片 DSH-0.1.6-A2-02 的要点：
- GlobalStandardProps 用 `useSessionStatus`(+`useSessionRetainInfo`) 替换 `useSessionPendingInteraction`，`useSessions` 不变；
- dock slot 契约本身（`'conversation.input.dock'`：list / scope: session）与 session kit（`useConversation`/`useInput`/`inputActions`）**两代一致** —— 所以这不是“slot 契约变了”，而是**注入给每个 slot 的 GlobalStandardProps 变了**；
- 迁移配方：alpha.1 `useSessionPendingInteraction(s => s.get(sessionId))` → alpha.2 `useSessionStatus(s => s.get(sessionId)?.pendingInteraction)`；
- 症状记载与本案逐字吻合：“a component that calls the missing prop throws at render and takes the whole dock subtree down … a co-tenant dock entry's chips stopped rendering with it”。

plugin A 显然从未按新契约重建（junction 链接的外部插件，host 原地升级后它的 `lib/client.js` 还是 alpha.1 时代的产物），于是它对已删除 hook 的调用在第一次 render 就炸。

### 1.3 无辜同租户（plugin B 的 chips）为什么一起消失：**共享错误边界的爆炸半径（co-tenant blast radius / slot-level error boundary）**

按 `host-types/dock-render-tree.md`：`conversation.input.dock` 是 **list slot**，shell 把**整个 entry 列表**包在**同一个** `DrawerErrorBoundary name="input.dock"` 里，而 `DockEntry` 自身**不再加任何边界**。`DrawerErrorBoundary` 是标准 React class 边界（`getDerivedStateFromError` → fallback 渲染 `null`，下次会话切换才 reset）。

React 错误边界的隔离单位是**它自己的子树**：
1. plugin A 的 `progress` entry 在 render 中 throw；
2. 唯一的那个 `input.dock` 边界捕获它，把**整个边界子树**降级为 `null`；
3. 于是同一边界下的**所有 entry 一起被卸载** —— console 里那行就是爆炸半径的名单：`input.dock boundary fallback active … unmounted entries: dsh-paste-input-dock, progress`。

plugin B 的 `AttachmentChips`（`dsh-paste-input-dock`，order 5，同一槽位）**从未出错**：它不用任何 standard-kit hook（deck 明确“uses NO standard-kit hooks at all”），自身 try/catch 也没打日志——它是被 A 的崩溃“陪葬”的。并且边界 fallback 只渲染 `null` 且要到**下次会话切换**才重置，所以在这之前 chips 与 strip 一起持续缺失。

### 1.4 为什么 attach button 活下来：另一个槽位 = 另一个边界实例

`conversation.input.left` 是**不同的 slot**，有**自己独立的** `DrawerErrorBoundary name="input.left"`（console：`input.left: 1 entry mounted (dsh-paste-input-button)`）。错误边界只捕获自己子树内的 throw，兄弟边界子树完全不受影响；崩溃被限制在 `input.dock` 那一个边界实例里。所以同一个 plugin B：它在 `input.left` 的按钮完好，在 `input.dock` 的 chips 消失——**两个 entry 命运不同，只因分属两个边界**。这也反证了：既不是整个 Composer 崩了，也不是 B 的注册或代码坏了。

---

## 2. The experiment（决定性证据）

**实验**（tried-notes.txt 第 3 条）：禁用 plugin A → 刷新 → **B 的 chips 立刻回来**；重新启用 A → chips 再次消失。

### 2.1 它证明了什么

- 这是干净的**单变量控制实验**：唯一变化 = 那个会在共享边界内 render-throw 的 entry 是否存在于 `input.dock` 槽位；B 自身代码、host、kit 全都没变。
- 因果链被完整闭合：**A 在 → 边界 fallback → 整槽卸载 → B 的 chips 消失；A 不在 → 边界不触发 → B 立刻正常**。
- 因此 B 的症状**由 A 的渲染崩溃导致（经共享错误边界传导）**，而非 B 的注册、渲染路径或安装损坏。“plugin A kills plugin B somehow”观察方向正确，但机制不是插件之间的相互作用，而是 **host 槽位边界的隔离失败**。
- 反过来也证明了 B 的注册本身在 alpha.2 上是好的（entry 注册成功、能渲染、能响应注入状态）。

### 2.2 它不证明什么

- **不证明 plugin B 在 alpha.2 上无 bug**。A 启用时 B 的 entry 在边界 fallback 时被整体卸载，B 的完整渲染路径在 alpha.2 上并未被完整观察；实验证明的是“B 的消失不需要 B 有 bug”。“B 基本没问题”是**另一份证据**（B 不消费任何 standard-kit hook，A2-02 的删减打不到它；其 try/catch 无日志）支持的，不是实验本身证明的。
- **不证明 strip 崩溃是 dock 上唯一的问题**。共六个外部插件；其他 dock entry 可能还有各自的 alpha.2 不兼容，只是眼下被同一个边界一起吞掉、无从观察，修好 A 之后才会显形。实验只覆盖被报告的两个症状，且只观察了 B 的 chips。
- 也不证明 strip 在 alpha.2 上除 pending 之外的方面健康——它只证明“移除 A 即可恢复槽位”。

### 2.3 为什么重装 plugin B 永远不可能有用

console 堆栈指向 `dsh-ui-progress/lib/client.js:219`，坏掉的字节是 **A 的 bundle**（与新 host kit 的组合）。重装 B 既不改 A 的代码，也不改 host 的标准套件 → A 一挂载仍在同一调用点 throw → 边界照样 fallback → chips 照样消失。重装只修复“被重装插件自身产物损坏/安装脏了”这类问题，而 B 从未损坏——修错了对象。这也符合技能纪律：先归因再动手，重装/重试不是诊断手段。

### 2.4 同事“both plugins were hit”理论错在哪

- 只有**一条** render error，且它点名 A 的组件与**具体被删的那个 hook**；若两个插件都被删减的 prop 打中，会出现第二次 throw 或 B 自己的堆栈（实际没有）。
- B **不消费任何 standard-kit hook**（deck 明确），被删的 prop 根本打不到它；它也不解构任何被改的 slot prop。
- 禁用实验是干净的单变量对照，把 B 的症状**完全**归因到 A 的崩溃——“hit twice”预测不出这个结果。
- 按该理论“修两个插件的 slot 注册”会：改动本来能工作的 B 代码（引入新 bug 的风险），并且**真正的缺陷（A 无条件调用被移除 hook）原封不动**——修完 B，chips 仍会消失。
- 理论唯一说对的部分：alpha.2 确实改了 standard props。但改动只在**消费方解构/调用被删 hook 的那一处**生效；波及面来自**共享错误边界**，不是“两次独立命中”。归因模型应当是“一个肇事者 + 一个放大器（共享边界）”，不是“两个肇事者”。

---

## 3. The fix（graceful degradation）

要点先说清：

- **alpha.2 上由 `useSessionStatus` 供给 pending 状态**（`SessionStatus.pendingInteraction`；同一条记录还带 `running`、`completionUnread`）。alpha.1 回退 `useSessionPendingInteraction`。两者都没有 → 降级。
- **降级的内容**：注意力/等待态特性 —— `data-pending` 高亮、把子代理子树的 approvals/questions 以等待态呈现。
  **继续工作**：running 状态、todos 百分比、token chip、elapsed/eta、填充条 —— 它们全部来自两代契约**都没变**的 `useConversation` / `useProjection` / `useSessions` / `session`。
- **为什么必须静默**：在共享 list slot 里，任何一个 entry 在 render 抛错都会让**整个 `input.dock` 槽位（含无辜同租户）**被 `DrawerErrorBoundary` 卸载并渲染 `null`，且无用户可见诊断。可选能力缺失是跨版本的**正常状态**而非错误条件——它绝不能毁掉必需功能和邻居。原则：**宁可少一个高亮，不要整条 dock 消失**。同时注意 React Rules of Hooks：不能在 render 里随意条件调用 hook，所以用“按 host 套件选择一个 adapter 子组件”的方式把 hook 数量固定下来（选择在一次挂载内恒定，因为标准套件按 host 固定）。

### 3.1 修正后的组件代码

```tsx
/**
 * SessionProgressBar (corrected) — dsh-ui-progress
 * slot: 'conversation.input.dock', entry id: 'progress', order: 20
 *
 * dsh-v0.1.6-alpha.1 -> 0.1.6-alpha.2 (DSH-0.1.6-A2-02): the standard kit
 * replaces `useSessionPendingInteraction` with `useSessionStatus`
 * (+ `useSessionRetainInfo`); `useSessions` stays. The pending/attention
 * feature is OPTIONAL and must degrade SILENTLY: a render throw from any dock
 * entry unmounts the whole shared 'conversation.input.dock' list through the
 * shell's single DrawerErrorBoundary and takes innocent co-tenant entries
 * (e.g. the paste chip rail) down with it.
 */
import type { SnapshotSelectorHook } from '@deepseek-ai/dsh-client-ui-session'
// ...existing imports (css, EMPTY_LEGACY, runningTool, pendingKindOf,
//     subagentPendingState, subagentRunningCount, PropsLocale)...

type SessionId = string

/** One build serves both hosts: the generation-specific kit is declared as
 *  OPTIONAL probe fields. Never call one of these without checking it exists. */
export type SessionProgressBarProps =
  import('@deepseek-ai/dsh-client-ui-slots').PropsRuntime<'conversation.input.dock'>
  & PropsLocale<'progress'>
  & {
      /** alpha.2+ */
      useSessionStatus?: SnapshotSelectorHook<ReadonlyMap<SessionId, SessionStatus>>
      /** alpha.1 only (removed in alpha.2) */
      useSessionPendingInteraction?: SnapshotSelectorHook<ReadonlyMap<SessionId, SessionPendingInteraction>>
    }

interface Attention {
  available: boolean // false => host supplies no pending source: degraded mode
  ownPending: string | null
  subPending: { approvals: number; questions: number }
}

const DEGRADED_ATTENTION: Attention = {
  available: false,
  ownPending: null,
  subPending: { approvals: 0, questions: 0 },
}

type AttentionChild = (attention: Attention) => React.ReactNode

// ---------------------------------------------------------------------------
// Attention adapters: exactly ONE mounts per host, chosen from the kit the host
// supplies. Each adapter has a constant hook count (Rules of Hooks), and the
// choice is stable for the lifetime of the mount because the standard kit is
// fixed per host.
// ---------------------------------------------------------------------------

/** alpha.2+: pending state lives in useSessionStatus(...).pendingInteraction */
function AttentionFromStatus({
  useSessionStatus, useSessions, sessionId, children,
}: {
  useSessionStatus: NonNullable<SessionProgressBarProps['useSessionStatus']>
  useSessions: SessionProgressBarProps['useSessions']
  sessionId: SessionId
  children: AttentionChild
}) {
  const statusBySession = useSessionStatus(status => status)
  const byId = useSessions(s => s.byId)
  // Normalize to the legacy `{kind}` shape so the subagent walkers stay unchanged.
  const pendingBySession = new Map<SessionId, { kind?: string }>()
  for (const [id, st] of statusBySession) {
    pendingBySession.set(id, { kind: st?.pendingInteraction?.kind })
  }
  return children(computeAttention(byId, pendingBySession, sessionId))
}

/** alpha.1: the hook that alpha.2 removed — still used on an old host. */
function AttentionFromPending({
  useSessionPendingInteraction, useSessions, sessionId, children,
}: {
  useSessionPendingInteraction: NonNullable<SessionProgressBarProps['useSessionPendingInteraction']>
  useSessions: SessionProgressBarProps['useSessions']
  sessionId: SessionId
  children: AttentionChild
}) {
  const pendingBySession = useSessionPendingInteraction(interactions => interactions)
  const byId = useSessions(s => s.byId)
  return children(computeAttention(byId, pendingBySession, sessionId))
}

/** Neither hook exists: degrade SILENTLY to "no known waits". No throw. */
function AttentionNone({ children }: { children: AttentionChild }) {
  return children(DEGRADED_ATTENTION)
}

/** Unchanged derivation, shared by both adapters. */
function computeAttention(
  byId: ById,
  pendingBySession: ReadonlyMap<SessionId, { kind?: string }>,
  sessionId: SessionId,
): Attention {
  const ownPending = pendingKindOf(pendingBySession.get(sessionId)?.kind)
  const subPending = subagentPendingState(byId, pendingBySession, sessionId)
  return {
    available: true,
    ownPending,
    subPending,
  }
}

export function SessionProgressBar(props: SessionProgressBarProps) {
  const { useSessionStatus, useSessionPendingInteraction } = props

  // Pick the attention adapter ONCE per host. Probe, never call blindly.
  const Attention =
    typeof useSessionStatus === 'function' ? AttentionFromStatus
    : typeof useSessionPendingInteraction === 'function' ? AttentionFromPending
    : AttentionNone

  return (
    <Attention {...(props as any)}>
      {attention => <StripBody {...props} attention={attention} />}
    </Attention>
  )
}

function StripBody({
  session, useConversation, useProjection, useSessions, sessionId, attention,
}: SessionProgressBarProps & { attention: Attention }) {
  // Hooks first, unconditionally; the null-session guard renders BELOW them so
  // the hook count can never change between renders.
  const chat = useConversation(conversation => conversation.views.get('chat'))
  const todos = useProjection('todos')
  const byId = useSessions(s => s.byId)

  if (session === undefined || session === null) return null

  const legacy = chat?.legacy ?? EMPTY_LEGACY
  const toolName = runningTool(legacy)
  const running = session.running
  // ... percent / turn / elapsed / eta derivation unchanged ...

  // Background state: main conversation idle while descendant subagent
  // sessions keep executing - must not read as done-green.
  const subRunning = subagentRunningCount(byId, sessionId)

  // Degraded mode (attention.available === false): render exactly as usual,
  // without attention highlighting. Silent by design.
  const pending =
    attention.available &&
    (attention.ownPending !== null ||
      attention.subPending.approvals > 0 ||
      attention.subPending.questions > 0)

  return (
    <div className={css.bar} data-pending={pending || undefined}
         data-degraded={attention.available ? undefined : 'true'}>
      {/* state text, fill bar, todos percent, token chip, elapsed/eta */}
    </div>
  )
}

// Registration (plugin A's index.ts) — unchanged:
//   ctx.slots.inject('conversation.input.dock', () => ctx.slots.register(
//     { name: 'conversation.input.dock', id: 'progress', order: 20, locale: NS },
//     SessionProgressBar,
//   ))
```

补充：
- `useSessionRetainInfo`（alpha.2 新增）只在需要引用计数（`retainedBy.mainView`）时才用；pending 特性不需要它。
- 原代码的 `if (session == null) return null` 写在 hook 调用之前，本身就是 Rules of Hooks 隐患；修正版把它移到 hook 之后。
- 可再加一个廉价的注册期防护：inject/register 时做 kit 能力检测，缺 hook 就注册降级版或一次性告警，把不兼容从“渲染期崩溃”提前到“注册期可知”。

---

## 4. Multi-tenant hygiene（多租户卫生）

### 4.1 dock tenant（entry 作者）应做什么，使自己的崩溃打不到同租户

1. **把 standard kit 当作可选、按版本协商的表面**：`typeof hook === 'function'` 探测，缺失即降级；永远不要无条件调用（本次事故的直接起因）。一个构建服务多代 host 时，用“按 host 套件选择 adapter”的模式保持 hook 数量恒定。
2. **render 保持纯且“总计（total）”**：任何可选能力/数据缺失都走降级分支而不是 throw；不在 render 与 Effect 里抛错。
3. **给自己的 entry 包一层自己的错误边界**（把 boundary 包在注册的组件外层，per-entry），自家崩溃只卸载自家 entry；fallback 至少渲染占位 + 一次性日志，不要无声 `null`。
4. **把不兼容前移到注册期**：inject/register 时刻做能力检测与版本适配，让“不兼容”表现为“降级注册 / 注册失败 + 一次性日志”，而不是渲染期崩溃。
5. **防御式消费注入状态**：`inject: sessionId => ({remove, add})` 之类要对多实例 Session（DSH-0.1.6-A2-01：`SessionListState.current` 已移除）与会话切换对齐，不串会话。
6. **升级 host 后按技能的验证清单做冷启动挂载验证**（Runtime/Behavior 层），不要等用户报“东西消失了”。
7. 不要把“内部 try/catch”当作主防护：render 抛错需要边界兜底，try/catch 只能保护同步业务逻辑。

### 4.2 HOST 应改什么

- **把错误边界粒度从“每个 list slot 一个”下沉到“每个 SlotEntry 一个”**：某 entry 的 `getDerivedStateFromError` 只卸载该 entry（渲染 `null` 或占位），其余 entry 保持挂载。slot 级边界保留为最后防线，但其触发应视为 host 级事件并上报。
- 失败要**可见且可归因**：console/遥测一次性记录 entry id + 组件名 + 错误；可选“entry failed”指示与手动重试 / 会话切换重置。
- 把 standard kit 做成**可协商的能力面**（capabilities/版本标记），entry 在注册时即可知道自己拿到哪一代 kit，而不是靠运行时炸出来。

### 4.3 host 面临的取舍（trade-off）

**隔离度 vs 显性失败（fail-loudness / 可观测性）**，外加重试语义与复杂度：
- per-entry 边界把爆炸半径限制在单个 entry，但代价是槽位可能**半坏着静默运行**——用户只看到“strip 没了”却没有任何信号，故障被掩盖、修复被拖慢（若本次是 per-entry 隔离，症状会从“整条 dock 消失”降级为“strip 静默缺失”，B 完好但 A 的问题更隐蔽）；当前的“整槽失败”反而是**响亮的**信号，逼着维护者立刻修。
- 每 entry 一个 class boundary 的实例数、生命周期与 reset 策略复杂化；错误重试若设计不当会形成无限“崩溃-重挂”循环（React #130 类故障的典型陷阱）。
- 边界只覆盖 render/生命周期错误，事件处理器与异步错误仍需各自处理；共享状态损坏仍可能跨 entry 耦合。
- host 必须在“最小波及”和“快速暴露”之间选边，或用“per-entry 隔离 + 显式失败指示”两头兼顾（复杂度上升）。这是隔离性与可观测性的经典权衡。

---

## 5. Verification（验证：无需 host 重启）

前提：修的是 plugin A（junction 链接的外部插件）的客户端产物；host 不需要重装/重启。重编 A 的 `lib/client.js` 后 **hard refresh 浏览器**（Ctrl+Shift+R）即可重新拉取 client bundle 并重注册插件（0.1.6-alpha.2 走廊内 client 产物按页面加载取用；注意 0.1.7-alpha.2 起才有“client bundles cached at host boot”的行为——本次不适用，但要用 bundle 标记/错误行号确认新产物确实加载）。

### 5.1 同时恢复两个 dock entry 的检查单

1. **挂载面**：F12 无 render error；`[dsh:slots] input.dock` 的 mounted entries **同时包含** `dsh-paste-input-dock` 与 `progress`；`input.left` 仍有 `dsh-paste-input-button`。
2. **strip 功能**：running 状态、todos 百分比、token chip、elapsed/eta 正常渲染；出现 pending approval / question（含子代理子树）时 `data-pending` 高亮出现 —— 证明 alpha.2 的 `useSessionStatus` 路径真正接上了（不是永远 degraded）。
3. **会话维度**：切换会话后再次检查两处都渲染（`DrawerErrorBoundary` “resets on the next session switch”，且 A2-01 后 Session 多实例），且 strip 归属正确会话。

### 5.2 plugin B 必须专门覆盖的回归

B 从未在“A 正常工作”的 alpha.2 状态下被验证过——现在它才第一次跑完整渲染路径，必须覆盖：

1. **粘贴/拖放主路径**：粘贴文件 → chips 行渲染、chip 数量正确、单个 chip 可移除（`remove`）；拖放路径同样验证（`add` / fold 扫描）；attach button（`input.left`）仍工作。
2. **会话归属回归**：多会话 / 切换会话后 chips 归属正确的 `sessionId`（B 的 `inject: sessionId => ({remove, add})` 在多实例 Session 重构下不得串会话）；存在子代理会话时 chips 不被误清。
3. **共存回归**：A 启用且修复后，B 的 chips 与 A 的 strip **同时**渲染、互不影响。
4. **隔离残余（如实记录）**：模拟另一个 dock entry 再次崩溃（临时注入一个 throw 的 entry），确认在 host 未做 per-entry 隔离之前 B 仍会被连带卸载——这条残余耦合要写进已知问题，直到 host 改边界粒度。

### 5.3 修复本身（plugin A）的降级回归

- 单测/夹具传入“两个 pending hook 都没有”的 kit：断言**不抛错**、`data-degraded` 生效、其余指标照常渲染。
- 分别传 alpha.1 kit（`useSessionPendingInteraction`）与 alpha.2 kit（`useSessionStatus`）各跑一次：断言 pending 检测各自生效（对应卡片 DSH-0.1.6-A2-02 的 Verification 条目：两个 host 都无 dock 子树 throw）。
- 会话为 `undefined/null` 时返回 `null` 且 hook 数量不变（不触发 Rules of Hooks 告警）。

### 5.4 残余风险

- 六个外部插件的其余 dock entry 未逐一审查；修好 A 后它们的独立不兼容才会显形。
- 边界仍是 slot 级：未来任何 entry 崩溃仍会连带同租户，直到 host 落地 per-entry 隔离。
- 本次为只读诊断（Mode A），未执行任何构建/安装；上述验证需在维护者环境落地。

---

## run-stats

- toolcalls 总数：19（run_code 调度 10 次；嵌套工具调用：read 11、write 4、glob 1、grep 2、send_message 1）
- token 用量：n/a
- 完成时间：2026-10-21T16:16:20.336+08:00（Asia/Shanghai）
