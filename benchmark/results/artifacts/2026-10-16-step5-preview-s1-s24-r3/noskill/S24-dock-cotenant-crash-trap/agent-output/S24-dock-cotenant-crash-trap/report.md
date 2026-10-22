# S24 · The Dock That Vanished Together — 诊断报告(noskill 臂)

**环境**:dsh web / Windows / npm global,`@deepseek-ai/dsh` 0.1.6-alpha.1 → 0.1.6-alpha.2 就地升级 + 重启,6 个 junction-linked 外部客户端插件。

**一句话结论**:两个症状是**同一个根因**。plugin A(`dsh-ui-progress`)的 `SessionProgressBar` 在 alpha.2 上调用了已被标准套件(standard kit)移除的 `useSessionPendingInteraction`——该 prop 现为 `undefined`,调用即抛 `TypeError`;而 `conversation.input.dock` 这个 list slot 的**所有条目共用同一个 `DrawerErrorBoundary`**,一个条目在渲染期抛出,整个 slot 子树被卸载,同槽的 plugin B chips rail 因此陪葬。plugin B 自身代码无缺陷;它的 attach button 在另一个 slot(`conversation.input.left`,独立 boundary)所以幸存。

---

## 1. Culprit attribution(责任归属)

**结论:真正的故障插件是 plugin A(session-progress,`dsh-ui-progress`);plugin B 是无辜的同槽邻居,被同一个 error boundary 连带卸载。**

### 1.1 故障点:哪一个插件、哪一次调用

- 失败的插件是 **plugin A**,组件 `SessionProgressBar`(注册 id `progress`,注入 `conversation.input.dock`,order 20)。
- **精确调用点**:组件体第 24 行(构建产物 `client.js:219:41`):

  ```tsx
  const pendingBySession = useSessionPendingInteraction(interactions => interactions)
  ```

- 机制:第 10–13 行的解构 `useSessionPendingInteraction` 从 slot 运行时下发的标准 props 中取值;alpha.2 上该 prop 已不存在,绑定为 `undefined`,于是**调用**它时抛出 `Uncaught TypeError: useSessionPendingInteraction is not a function`。错误栈 `renderWithHooks → mountIndeterminateComponent` 表明这是**渲染期(挂载期)抛出**,不是 effect、不是事件处理——这一点决定了后面 boundary 的行为。
- 控制台**只有一个错误**,且栈帧指向 plugin A 的包(`plugin://dsh-external/dsh-ui-progress/lib/client.js`);没有任何一帧指向 plugin B。错误之后 React 的说明 "React will try to recreate this component tree from scratch using the error boundary you provided, DrawerErrorBoundary" 与随后两行 slot 日志对上了。

### 1.2 为什么是现在:两份契约之间标准套件被裁剪

对比 `slots-contract-alpha1.d.ts` 与 `slots-contract-alpha2.d.ts` 的 `SessionStandardProps`(host 下发给每个 `conversation.input.dock` 条目的标准 kit):

| 条目 | alpha.1 | alpha.2 |
| --- | --- | --- |
| `useConversation` | ✅ | ✅ |
| `useSessions` | ✅ | ✅ |
| `useSessionPendingInteraction` | ✅(`ReadonlyMap<SessionId, SessionPendingInteraction>`) | ❌ **已移除** |
| `useSessionStatus` | — | ✅ **新增**(每 session 状态:`running` / `completionUnread` / `pendingInteraction`) |
| `useSessionRetainInfo` | — | ✅ **新增** |
| `useProjection` / `useInput` / `inputActions` | ✅ | ✅ |

alpha.2 契约头部的注释解释了原因:multi-instance refactor 之后,`@deepseek-ai/dsh-client-ui-session` 把 `GlobalStandardProps` 合并进每个 slot,session 级的标准 props 被重组——**pending 交互数据没有消失,而是被折叠进每-session 状态 hook `useSessionStatus`**(其 `SessionStatus.pendingInteraction` 字段就是原来的 `SessionPendingInteraction`)。plugin A 仍按 alpha.1 的座位名解构并调用,拿到 `undefined` 即崩。所以这不是"host 坏了",而是**插件把标准套件的一次重命名/裁剪当成了稳定 API**。

### 1.3 无辜同槽邻居为什么一起消失:共享 boundary 的连带卸载

机制名称:**slot 级共享 error boundary 的连带卸载(blast radius = 整个 slot)**。依据 `dock-render-tree.md`:

```
<InputDock>
  <DrawerErrorBoundary name="input.dock">   ← boundary 在整个 slot 列表之外
    <DockEntry id="dsh-paste-input-dock" />  (plugin B, order 5)
    <DockEntry id="progress" />              (plugin A, order 20)
  </DrawerErrorBoundary>
</InputDock>
```

- `SessionProgressBar` 在渲染期抛出,React 向上找**最近的** error boundary——即包裹整个 `input.dock` 列表的 `DrawerErrorBoundary`。`DockEntry` 自身**不加** boundary。
- 该 boundary 的 `getDerivedStateFromError` 渲染 `null` 作为 fallback,于是**整个 `InputDock` 子树被卸载**,同槽所有条目一起消失——slot 日志正是如此:`[dsh:slots] input.dock boundary fallback active (session s-7f3a); unmounted entries: dsh-paste-input-dock, progress`。plugin B 的 chips 条目(order 5,排在 progress 之前)并非自己崩,而是被父 boundary 的 fallback 一并卸载。
- 补充两个细节:(a) progress 是**常驻**条目(session 一进 composer 就挂载),chips 只在粘贴后渲染——所以第一次 dock 挂载时 progress 先抛,boundary 进入 fallback,chips 永远没机会渲染;(b) boundary "resets on the next session switch",在重置前 React 不会重渲已倒下的子树,这与"no further errors"以及"粘贴 toast 不再出现"一致——粘贴管线本身是通的,缺的只是 chips 这一视觉层。

### 1.4 为什么另一个 slot 里的 attach button 幸存

同样依据 `dock-render-tree.md`:plugin B 的 attach button 注册在 **`conversation.input.left`**,那是一个**独立的 `DrawerErrorBoundary name="input.left"`**。error boundary 按槽隔离:崩溃发生在 `input.dock` 的 boundary 内,`input.left` 的 boundary 完全看不到这个错误,其条目保持挂载——日志确认:`[dsh:slots] input.left: 1 entry mounted (dsh-paste-input-button)`。

**关键结论:隔离单位是 slot(槽),不是 entry(条目)。** 同一 slot 内的多个条目共享一条 boundary,一损俱损;不同 slot 之间互不影响。这正解释了"chips 没了、button 还在":两者是同一个插件的两个注册面,只是落在了隔离边界的两侧。

## 2. The experiment(对照实验:禁用一个插件)

**结论:禁用实验证明了"plugin A 在场"是 plugin B dock 症状的因果原因、且耦合路径是共享的 `input.dock` boundary;但它既不能证明 plugin B 在 alpha.2 上完全无缺陷,也不能证明 strip 崩溃是 dock 唯一的问题。**

### 2.1 实验证明了什么

维护者的操作:从插件列表**禁用 plugin A** 并刷新 → plugin B 的 chips **立即恢复**;重新启用 A → chips 再次消失。这个反事实实验证明三件事:

1. **因果归因**:plugin B 的 dock 症状是由 plugin A 的在场引起的,不是 B 自身的问题,也不是 host 升级把 slot 管道弄坏了。
2. **耦合路径**:恢复 B 的唯一操作是"移走崩溃者",说明传播路径就是第 1.3 节的共享 boundary——A 一抛,整个 `input.dock` 子树陪葬;A 不在,边界不再倒,B 的条目正常挂载。
3. **host 的 slot 机制在 alpha.2 上是健康的**:A 禁用后 B 的条目能正常注册并挂载,说明 alpha.2 的 slot 管道本身没坏,坏的是插件对已裁剪契约的假设。

### 2.2 实验没有证明什么

- **没有证明 plugin B 在 alpha.2 上无缺陷**。实验只覆盖了"A 被禁用"这一个配置下 B 的表现。B 可能带着未被触发的 alpha.2 隐患(拖放路径、fold 扫描、多文件、多 session、chips 的增删)。"B 不使用任何标准 kit hook"这一事实来自 **B 的注册摘录(静态证据)**,不是这个实验的结论。实验最多洗清了 B 是**触发者**,没有给 B 签发 alpha.2 合格证。
- **没有证明 strip 崩溃是 dock 唯一的问题**。三点理由:(a) boundary 处于 fallback 期间,**所有** dock 条目都被卸载,任何其他 dock 租户(6 个插件中未被检查的其余条目)的问题都被掩盖了——实验只重新揭示了 B,没有审计其余租户;(b) React 在**第一个** throw 处就停止渲染,A 的第一个崩溃背后可能还藏着第二个 alpha.2 不兼容点,而实验是把 A 整个禁掉,永远不会走到那里;(c)实验更没有回答"修好 hook 之后 strip 的 pending 状态是否正确"。
- **没有证明 host 的设计没问题**:共享 boundary 把单条目崩溃放大成双症状 outage,这正是 host 侧要改进的点,实验对此完全沉默。

### 2.3 为什么重装 plugin B 不可能有用

1. **故障不在 B 的文件里**:抛错的是 A 的包(`plugin://dsh-external/dsh-ui-progress/lib/client.js`);B 的 chips 是被**父 boundary 的 fallback** 卸载的,不是被 B 自己的代码弄崩的(维护者笔记第 2 条已经确认 B 的代码路径不抛错)。
2. **重装只替换 B 的文件**:A 的崩溃会在下一次 dock 渲染时再次触发共享 boundary,无论 B 是什么版本,chips 都会再次被连带卸载。修错了层。
3. 维护者自己的控制台证据(唯一错误的栈帧全是 A 的组件)已经排除了 B;重装是在没有证据指向 B 的情况下采取的行动。

### 2.4 同事的"两个插件都被打到"理论错在哪

同事猜测"两个插件都用了被移除的 prop,被打中两次,应该修两个插件的 slot 注册"。该理论被三份证据同时否证:

1. **控制台只有 1 个错误**,在 `SessionProgressBar`,零个错误指向 `AttachmentChips`。
2. **B 的注册摘录显示 `AttachmentChips` 不使用任何标准 kit hook**——它只读自己 inject 的状态,prop 被移除在语法上就不可能让它抛错。
3. **禁用实验直接反证**:如果是 B 独立被某个被移除的 prop 打中,禁掉 A 不可能让 B 恢复。

此外"修两个插件的 slot 注册"修错了层:两个注册本身都是好的(crash 者不在时条目都能挂载,slot 日志显示注册/挂载机制正常),失败发生在 A **渲染期的 hook 调用**,不在注册期。改 B 的注册至多是空操作,更可能把一份好注册改坏。同事把"两个症状"Pattern-match 成"两个原因",而证据显示的是:**两个症状、一个原因,共享 boundary 是传播路径**。

## 3. The fix(修复:优雅降级)

**结论:alpha.2 上 pending 状态由 `useSessionStatus` 供给(每-session 状态里的 `pendingInteraction` 字段);修复方式是对标准套件做特性探测 + 双形态取值 + 无声降级——两个座位都没有时只丢"注意力提示"这一个特性,strip 其余功能照常工作。**

### 3.1 修复后的组件代码

```tsx
/**
 * SessionProgressBar (fixed): the session-progress strip registered into the
 * 'conversation.input.dock' slot by the session-progress plugin (plugin A).
 *
 * alpha.2 removed the 'useSessionPendingInteraction' seat from the standard kit
 * and folded pending interactions into the per-session 'useSessionStatus' hook
 * (status.pendingInteraction). This version feature-detects the kit instead of
 * assuming a seat, and degrades silently when neither seat is supplied.
 */
export type SessionProgressBarProps =
  import('@deepseek-ai/dsh-client-ui-slots').PropsRuntime<'conversation.input.dock'>
  & PropsLocale<'progress'>

const EMPTY_PENDING_MAP: ReadonlyMap<SessionId, unknown> = new Map()

/**
 * Pending-wait kind for one map entry, tolerating both contract shapes:
 *   alpha.1: the value IS the pending interaction   -> entry.kind
 *   alpha.2: the value is a SessionStatus           -> entry.pendingInteraction.kind
 */
function pendingKindOf(entry: unknown): string | null {
  if (entry === undefined || entry === null) return null
  const direct = (entry as { kind?: unknown }).kind
  if (typeof direct === 'string') return direct
  const nested = (entry as { pendingInteraction?: { kind?: unknown } }).pendingInteraction
  const kind = nested?.kind
  return typeof kind === 'string' ? kind : null
}

export function SessionProgressBar({
  session, sessionId, t, useConversation, useProjection, useSessions,
  useSessionPendingInteraction, // alpha.1 seat (absent on alpha.2)
  useSessionStatus,             // alpha.2 seat (absent on alpha.1)
}: SessionProgressBarProps) {
  if (session === undefined || session === null) return null
  const chat = useConversation(conversation => conversation.views.get('chat'))
  const legacy = chat?.legacy ?? EMPTY_LEGACY
  const todos = useProjection('todos')
  const toolName = runningTool(legacy)
  const running = session.running
  // ... percent / turn / elapsed / eta derivation unchanged ...

  // Attention state: this session's own pending waits plus the subagent
  // subtree's (the sidebar hides subagent rows - this strip surfaces them).
  // Probe the standard kit before calling; the seat set is fixed for a given
  // host version, so this selection is stable across renders of the entry.
  const pendingBySession: ReadonlyMap<SessionId, unknown> =
    typeof useSessionPendingInteraction === 'function'
      ? useSessionPendingInteraction(interactions => interactions)
      : typeof useSessionStatus === 'function'
        ? useSessionStatus(statuses => statuses)
        : EMPTY_PENDING_MAP
  const sessionsById = useSessions(s => s.byId)
  const ownPending = pendingKindOf(pendingBySession.get(sessionId))
  const subPending = subagentPendingState(
    sessionsById, pendingBySession, sessionId, pendingKindOf)
  const pending = ownPending !== null || subPending.approvals > 0 || subPending.questions > 0

  // Background state: main conversation idle while descendant subagent
  // sessions keep executing - must not read as done-green.
  const subRunning = subagentRunningCount(sessionsById, sessionId)

  return (
    <div className={css.bar} data-pending={pending || undefined}>
      {/* state text, fill bar, todos percent, token chip, elapsed/eta */}
    </div>
  )
}
```

要点:

1. **不再假设座位存在**:调用任何标准 kit hook 之前先 `typeof hook === 'function'` 探测。alpha.1 上走 `useSessionPendingInteraction`(原逻辑,行为不变);alpha.2 上走 `useSessionStatus`;两者都没有时退回空 map。由于 host 版本在运行期内固定,该选择对同一次挂载是稳定的(条件调用 hook 在此场景下安全;若要更严格,可把探测提升到模块级能力标记)。
2. **双形态取值**:`pendingKindOf` 同时兼容 alpha.1 形态(map 值即交互对象,读 `.kind`)与 alpha.2 形态(map 值是 `SessionStatus`,读 `.pendingInteraction.kind`);`subagentPendingState` 改为接收取值器参数,避免把任一契约的形状写死。
3. **alpha.2 上谁供给 pending 状态**:`useSessionStatus`(契约注释:"Per-session status: running, completionUnread, pendingInteraction")。pending 数据没有消失,只是从独立 selector 折叠进每-session 状态;顺带一提,该 hook 还带 `running`/`completionUnread`,将来可一并从 kit 取用,但本次修复不需要动 `session.running`。

### 3.2 降级边界:丢什么、留什么

- **在"两个 pending hook 都不供给"的 host 上退化的特性**:注意力提示——`data-pending` 属性及其背后的 pending 判定(`ownPending` 恒为 `null`,subagent 的 approvals/questions 计数恒为 0,`pending` 恒 `false`)。即 strip 不再高亮"有人在等待确认/提问"。
- **保持工作的部分**:session 空值保护、`useConversation`(chat 视图)、`useProjection('todos')`、`useSessions`(byId,同时供 `subRunning` 与 subagent 遍历)、running 工具名、percent/turn/elapsed/eta 推导、todos 百分比、token 芯片。strip 仍然挂载并展示正常进度。

### 3.3 为什么必须无声降级而不是抛错

1. **抛出正是本事故的成因**:strip 是 `input.dock` 共享 boundary 内的常驻条目,一次渲染期 throw 会卸载整个 slot——包括 plugin B 的 chips。代价完全不对称:无声丢一个属性 vs. 整个 dock 熄灭。
2. **boundary 只在切换 session 时重置**;会抛的 strip 会在每次会话切换后重新杀死 dock,把偶发故障变成"dock 永久黑暗",直到插件被修好为止。
3. 抛错还会造成卸载/重挂 churn,且 boundary fallback 渲染 `null`,真实故障被藏在"看起来只是没渲染"的背后,反而更难排查。
4. 注意力提示是锦上添花;优雅降级的原则是**逐个特性地放弃无法满足的数据源**,而不是让整个组件(及其同槽邻居)为它陪葬。

## 4. Multi-tenant hygiene(多租户卫生)

**结论:租户侧要自备最后一道防线(entry 内 boundary + 标准 kit 特性探测 + 逐特性降级);host 侧应把 boundary 从"每 slot 一道"下沉到"每 entry 一道"并配套 per-entry 健康遥测——host 的权衡是"隔离粒度 vs. 简单性与可观测性"。**

### 4.1 dock 租户应该做什么(让自己的崩溃不带走邻居)

1. **自备 error boundary**:既然 `DockEntry` 本身不加 boundary(见 render-tree),租户就应在自己注册的组件内部再包一层 boundary,fallback 渲染 `null`——这样自己的 throw 只卸载自己,同槽邻居原封不动。这是"不信任共享边界"的最后一道防线。
2. **调用标准 kit 前先探测**:任何 `useXxx` 都先 `typeof === 'function'` 再调用;在 manifest 里声明所需契约版本区间,让 host 在注册期就能标记不匹配,而不是等到渲染期 crash。
3. **逐特性降级、保持渲染纯净**:数据源缺失时放弃对应特性(如 3.2 的注意力提示),I/O 放 effect 并 try/catch,不在 render 路径做可能抛错的事。
4. 注册时若探测到 host kit 版本超出自己支持范围,宁可**拒绝挂载或显示降级占位**,也不要带着错误的契约假设渲染。

### 4.2 host 应该改什么(让单个 entry 的失败只隔离到它自己)

1. **把 boundary 下沉到 entry 级**:现在 `DrawerErrorBoundary name="input.dock"` 包裹整个 slot 列表(见 render-tree);应改为每个 `DockEntry` 各自包一层 boundary,某个条目抛出时只渲染该条目自己的 fallback(`null` 或一个小占位),兄弟条目保持挂载。本事故的两个症状会退化成"strip 不显示"这一个症状。
2. **per-entry 遥测**:`[dsh:slots]` 日志已经会列出 unmounted entries(本次是靠它定位的),应保留并扩展为"哪个 entry 抛了什么"的结构化记录,最好在 UI 上给出可发现的降级指示,而不是静默 `null`。
3. **契约协商**:标准 kit 版本化 + alpha 周期的弃用警告;注册期比对插件声明的契约区间与 host 实际供给,提前告警。

### 4.3 host 面临的权衡(trade-off)

**隔离粒度 vs. 简单性与可观测性**。每 slot 一道 boundary:简单、便宜、fallback 语义明确("该槽整体不可用"),但把同槽租户耦合在一起——正是本事故的放大机制。每 entry 一道 boundary:爆炸半径降到单条目,但 (a) 单条目 `null` fallback 会在布局里留下一个"安静的洞",看起来像渲染 bug,需要占位/遥测来弥补;(b) 被静默隔离的条目可能"坏而不见",host 必须补健康面,否则优雅降级退化成无声腐烂;(c) boundary 是有状态类组件,条目反复崩溃会带来卸载/重挂 churn;(d) boundary 只能捕 render/lifecycle 错误,事件回调和异步路径仍要靠租户自律——host boundary 永远不可能是唯一的安全网。本事故的教训是:**共享 list slot 至少应做到 entry 级隔离,并配套 per-entry 健康遥测**。

## 5. Verification(验证)

**结论:故障全在客户端(渲染期),修 plugin A 后重建/热重载客户端 bundle 即可恢复,无需重启 host;验证的关键是"plugin A 启用状态下,input.dock 里两个条目同时挂载 + 粘贴 chips 正常",回归必须专门覆盖 plugin B 在 A 启用时的完整 chips 流程。**

### 5.1 如何在不重启 host 的前提下验证两个 dock 条目都恢复

故障链全在客户端:错误栈是 `react-dom` / `dsh-client-ui-conversation` / `plugin://.../client.js`,`[dsh:slots]` 是客户端 slot 运行时日志——没有任何一帧在 host 服务端。因此**不需要重启 host 进程**:

1. 修改 plugin A 源码 → 重建该外部插件 bundle(junction-linked,客户端构建)或触发 client-plugin 热重载,硬刷新 web 页面。
2. 进入同一 session(s-7f3a 或任意 session),确认:
   - progress strip 正常渲染(running 状态、todos 百分比、token 芯片、elapsed/eta);
   - 控制台**无** `TypeError`;
   - 不再出现 `[dsh:slots] input.dock boundary fallback active`,改为 `input.dock` 中 `dsh-paste-input-dock` 与 `progress` **同时挂载**。
3. 粘贴一个文件:确认 chips rail 渲染(`dsh-paste-input-dock` mounted),同时 `[dsh:slots] input.left: 1 entry mounted (dsh-paste-input-button)` 不变(对照组)。
4. 打开一个带真实 pending 交互(approval/question)的 session:确认 strip 上 `data-pending` 生效——这一步专门验证 alpha.2 的 `useSessionStatus.pendingInteraction` 取值路径。
5. boundary 只在切换 session 时重置,所以再切换一次 session 并切回,确认 strip 在新 boundary 上挂载不抛。

### 5.2 验证必须覆盖的 plugin B 回归

1. **精确复现条件的反转**:plugin A **启用** + 粘贴文件 → chips 渲染。修复不能只是"把错误吞掉但兄弟条目仍被卸载"——若 strip 改在 effect 或异步路径里抛,boundary 照样会抓到并带走 B,所以必须在 A 启用的压力下验证 B。
2. **B 的完整 chips 流程(A 启用)**:多文件粘贴、删除 chip、再添加、不同文件类型(fold 扫描)、跨 session 切换。
3. **抗同槽抖动**:A 重渲染/pending 状态反复翻转时,B 的 chips 不得闪烁或卸载——A 残留的任何抛错路径(含降级分支)都会再次触发共享 boundary。
4. **降级路径也要覆盖**:在"两个 pending hook 都不供给"的 host 上,strip 应渲染(仅缺注意力提示)且 B 的 chips 照常工作。
5. **对照断言**:attach button(`input.left`)始终不受影响——它本就不该被波及,作为对照项锁定,防止未来 host 改动把两个槽的边界意外合并。

## 证据索引(读取清单)

**证据包 `fixture/`(只读,未改动)读取清单:**

| 文件 | 用在哪里 |
| --- | --- |
| `fixture/README.md` | 证据包地图、双症状描述、契约文件用途 |
| `fixture/symptom-report.md` | 两症状(条带消失 + chips 不渲染、button 仍在)、"alpha.1 早晨还正常" |
| `fixture/console-excerpt.txt` | 唯一错误 `useSessionPendingInteraction is not a function`(A 的包)、boundary fallback 日志(`unmounted entries: dsh-paste-input-dock, progress`)、`input.left: 1 entry mounted` |
| `fixture/tried-notes.txt` | 重装 B 无效、B 代码路径不抛错、**禁用 A 实验**(关键证据)、同事理论 |
| `fixture/plugin-a/SessionProgressBar-excerpt.tsx` | 精确故障调用点(第 24 行)、alpha.1 座位解构、注册 id `progress` |
| `fixture/plugin-b/dock-entry-excerpt.md` | B 的两个注册面(`input.left` button vs `input.dock` chips)、**不使用任何标准 kit hook** |
| `fixture/host-types/slots-contract-alpha1.d.ts` | alpha.1 标准 kit:`useSessionPendingInteraction` 存在 |
| `fixture/host-types/slots-contract-alpha2.d.ts` | alpha.2 标准 kit:该座位被移除,新增 `useSessionStatus`(含 `pendingInteraction`)/`useSessionRetainInfo`,multi-instance refactor 合并 `GlobalStandardProps` |
| `fixture/host-types/dock-render-tree.md` | 共享 `input.dock` boundary vs 独立 `input.left` boundary;`DockEntry` 无自有 boundary;boundary fallback 为 `null`、session 切换时重置 |

**本地运行(只读校验,无安装/迁移):** `node check-degradation.js`(临时文件写在 `agent-output/` 内)——验证修复的取值逻辑:alpha.1 形态 → `approval`;alpha.2 形态 → `question`;两座位皆无 → `null` + 空 map(无声降级);缺失 key → `null`;旧代码在 alpha.2 kit 上复现 `TypeError: useSessionPendingInteraction is not a function`。

**边界遵守**:fixture/ 全程只读未改动;未读取 skills/、tests/、solution/ 或仓库其他目录;临时文件仅写在格目录 `agent-output/` 下。
