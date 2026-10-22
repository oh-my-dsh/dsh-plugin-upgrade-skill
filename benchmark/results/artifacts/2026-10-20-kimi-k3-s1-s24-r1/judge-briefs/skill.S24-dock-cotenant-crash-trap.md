# JUDGE BRIEF · skill.S24-dock-cotenant-crash-trap

## Criteria (sealed rubric)
- [culprit-attribution] (20pt) Use console-excerpt.txt plus the two slots-contract excerpts: plugin A (the progress strip) is the only crash; its unconditional useSessionPendingInteraction(...) call throws TypeError at render because alpha.2 standard props dropped useSessionPendingInteraction (replaced by useSessionStatus; useSessions stays). Do not require claiming useSessions was removed. Plugin B renders no standard-kit hooks and throws nothing. Do not credit answers blaming plugin B or treating the two symptoms as independent breakages.
- [cotenant-mechanism] (20pt) Explain the co-tenant damage via dock-render-tree.md: the input dock is one list slot whose entries mount under ONE shared DrawerErrorBoundary; a child render throw unmounts the whole boundary subtree, so B chips vanish with A strip. The attach button survives because conversation.input.left is a different slot under a different boundary. Cite the console follow-up or render-tree note; a generic error-boundary mention without the shared-subtree linkage earns partial.
- [experiment-reading] (20pt) Interpret tried-notes.txt: disabling A restoring B chips proves A caused the unmount (render-crash coupling) and B can render once freed; it does NOT prove B is fully alpha.2-compatible elsewhere, nor that A crash is the only dock defect. Reinstalling B could never help because B was never broken. The colleague theory that both plugins use a removed prop is false — B uses no standard-kit hooks.
- [degradation-fix] (20pt) Propose corrected component code: read pending state through useSessionStatus(...)?.pendingInteraction on alpha.2 (or pick whichever pending hook the host supplies) and never call a missing seat — optional chaining with stable empty fallbacks — so at worst only the pending indicators hide while running/todos/token/ETA keep working. Explain why degradation must be silent: a throwing dock tenant unmounts co-tenants, so a missing indicator is cosmetic while a throw is a multi-plugin outage. Guarding useSessions too is harmless but not required.
- [verification-and-hygiene] (20pt) Verify without host restart (plugin client bundles re-fetch on refresh): both entries render together; B regression covers paste/remove/re-paste with A enabled. Hygiene: tenants destructure defensively and may wrap their own entry in a local boundary; host could mount per-entry boundaries trading nesting/layout complexity for blast-radius isolation. Do not require executing this static fixture.

## Caps (score ceilings; judge returns each with triggered true/false)
- CAP [innocent-plugin-fix] ceiling=40 The final remedy fixes, rewrites, or reinstalls only plugin B (the attachment plugin), or asserts the two breakages are independent plugin-level bugs requiring two parallel fixes. Apply only to affirmative final advice or conclusions. Quoted, hypothetical or explicitly rejected bad examples do not trigger the cap; read the whole report.

## Candidate report(s)
#### FILE: S24-dock-cotenant-crash-trap/S24-report.md

# S24 · The Dock That Vanished Together — 诊断报告

证据包：fixture/（symptom-report / console-excerpt / tried-notes / plugin-a / plugin-b / host-types 三件套）。
技能卡片引用：DSH-0.1.6-A2-01、DSH-0.1.6-A2-02、DSH-0.1.6-A2-03（references/v0.1.6-alpha.2.md，仅引要点）。

---

## 1. Culprit attribution — 真正崩溃的是谁、在哪一行、为什么现在才崩

**肇事者是插件 A（dsh-ui-progress 的 `SessionProgressBar`），不是插件 B。**

- **确切的失败调用**：`SessionProgressBar-excerpt.tsx` 第 24 行
  `const pendingBySession = useSessionPendingInteraction(interactions => interactions)`。
  控制台唯一错误：`Uncaught TypeError: useSessionPendingInteraction is not a function
  at SessionProgressBar (plugin://dsh-external/dsh-ui-progress/lib/client.js:219:41)`，
  发生在 render 阶段（renderWithHooks → mountIndeterminateComponent）。
- **为什么现在才崩（标准套件在两份契约之间的变化）**：对照
  `slots-contract-alpha1.d.ts` 与 `slots-contract-alpha2.d.ts` —— alpha.1 的
  `SessionStandardProps` 含 `useSessionPendingInteraction`；alpha.2 把它**移除**，
  换成 `useSessionStatus` 并新增 `useSessionRetainInfo`，`useSessions` 保留。
  这正是技能卡片 **DSH-0.1.6-A2-02**（要点：GlobalStandardProps 中
  `useSessionPendingInteraction` → `useSessionStatus` + `useSessionRetainInfo`，
  dock slot 本身与 session kit 其余部分不变）。于是 alpha.2 上组件从 props 解构出的
  `useSessionPendingInteraction` 是 `undefined`，调用 `undefined(...)` 在渲染期抛
  TypeError。插件 A 代码一字未改，是宿主标准套件减了一个座位。

**无辜同居者为何一起消失 —— 机制名称：共享错误边界（per-slot 而非 per-entry 的边界粒度）导致的"边界连坐"。**
按 `dock-render-tree.md`：`conversation.input.dock` 是 list slot，**整个条目的列表**
被同一个 `<DrawerErrorBoundary name="input.dock">` 包住，`DockEntry` 自身**不加边界**；
该边界是标准 React class boundary，`getDerivedStateFromError` 后 fallback 渲染 `null`，
且只在会话切换时重置。插件 A 在渲染期抛出 → 整棵 input.dock 子树被卸载 → 同槽位的
插件 B chips 条目（`dsh-paste-input-dock`）陪葬。控制台日志直接证实：
`input.dock boundary fallback active … unmounted entries: dsh-paste-input-dock, progress`。

**为什么 attach 按钮幸存而 chips 不幸存**：按钮注册在**另一个槽位**
`conversation.input.left`，它有自己**独立的** `DrawerErrorBoundary name="input.left"`，
不在崩溃子树内（日志：`input.left: 1 entry mounted (dsh-paste-input-button)`）。
chips 与进度条同居 input.dock 这一个边界内，所以同生共死。

## 2. 实验 —— 禁用实验证明了什么、没证明什么

**证明了**：
- 插件 B chips 的消失完全由插件 A 的渲染抛出经共享边界传染所致（禁用 A → chips 立即恢复；
  重新启用 → 再次消失）。因果关系成立，方向是 A→(host boundary)→B。
- 插件 B 的注册与注入链路本身是通的：一旦边界不再被炸，它的条目能正常挂载渲染。
- B 不是抛出者：全程只有**一个**错误，且堆栈在 A 的组件里。

**没有证明**：
- **不证明 B 在 alpha.2 上无 bug**。B 还可能被 **DSH-0.1.6-A2-01** 静默命中
  （`SessionListState.current` 被移除：事件时解析当前会话得到 `undefined`，不抛错、
  静默 no-op；卡片第一手证据正是一个 paste/drop 附件插件升级后每次粘贴都弹
  "请先打开一个会话"）。fixture 里"paste toast 只出现过一次，之后不再出现"与这一
  类静默失效高度吻合——渲染恢复 ≠ 粘贴链路恢复。
- **不证明 strip 崩溃是 dock 唯一的问题**。它只证明这是唯一**抛错**的问题；
  静默型失效（返回 undefined、no-op）不会在控制台留下任何痕迹。
- 也不证明 B 在所有状态下渲染正确（多文件、移除 chip、切换会话等）。

**为什么重装 B 永远无用**：失败调用不在 B 的任何文件里——B 的 `AttachmentChips`
只用自己注入的 state（`inject: sessionId => ({ remove, add })`），**零标准套件 hook**，
自己的 try/catch 也没记录任何抛出。chips 消失是宿主边界把它的条目卸载了。
重装换回的是同样无错的代码，病灶（A 的抛出 + 边界的粒度）丝毫未动。

**同事"两个插件都被改了后的 slot props 命中"理论错在哪**：
1) 控制台**只有一个**错误，且在 A；若 B 也调用了被删 prop，应有第二个错误或 B 栈帧。
2) B 根本不用任何标准套件 hook，`useSessionPendingInteraction` 的删除在原理上
   碰不到 B 的渲染路径。
3) 禁用实验已给出反证：A 一停，B 立即恢复——B 的症状是边界连坐，
   不需要也无法用"修 B 的 slot 注册"解释。该理论还预言"修两个插件"才有效，
   而实际只需修 A（必要时另查 B 的 A2-01 静默回归）。

## 3. 修复 —— 优雅降级的组件代码

alpha.2 上 pending 状态由 **`useSessionStatus`** 供应（选择器
`snapshot.get(sessionId)?.pendingInteraction`；`SessionStatus` 还携带 `running`、
`completionUnread`）。按 DSH-0.1.6-A2-02 的迁移配方：按宿主实际供应的 prop 选 hook
（prop 集合随宿主构建固定，分支跨渲染稳定）；两者皆无则降级为空状态。

```tsx
/**
 * SessionProgressBar — 双宿主构建（0.1.6-alpha.1 / 0.1.6-alpha.2）。
 * DSH-0.1.6-A2-02：GlobalStandardProps 以 useSessionStatus（+useSessionRetainInfo）
 * 替换 useSessionPendingInteraction；useSessions 两边都在。
 * 标准套件 prop 集合随宿主构建固定，因此按 prop 存在性选 hook
 * 在本组件实例的整个生命周期内分支恒定，hook 顺序稳定。
 */
export type SessionProgressBarProps =
  import('@deepseek-ai/dsh-client-ui-slots').PropsRuntime<'conversation.input.dock'>
  & PropsLocale<'progress'>

type PendingMap = ReadonlyMap<SessionId, SessionPendingInteraction>

const EMPTY_PENDING: PendingMap = new Map()

export function SessionProgressBar({
  session, sessionId, t, useConversation, useProjection, useSessions,
  useSessionPendingInteraction, // alpha.1 座位 —— alpha.2 上为 undefined
  useSessionStatus,             // alpha.2 座位 —— alpha.1 上为 undefined
}: SessionProgressBarProps) {
  if (session === undefined || session === null) return null
  const chat = useConversation(conversation => conversation.views.get('chat'))
  const legacy = chat?.legacy ?? EMPTY_LEGACY
  const todos = useProjection('todos')
  const toolName = runningTool(legacy)
  const running = session.running
  // ... percent / turn / elapsed / eta 推导不变 ...

  // Pending 状态：双宿主 + 静默降级。
  //   alpha.2: useSessionStatus(...).get(id)?.pendingInteraction
  //   alpha.1: useSessionPendingInteraction(...)（原样是 ReadonlyMap）
  //   都没有:  空 Map —— 仅注意力标记降级，绝不抛出。
  const pendingBySession: PendingMap = useSessionStatus
    ? useSessionStatus(statuses => {
        const m = new Map<SessionId, SessionPendingInteraction>()
        for (const [id, st] of statuses) {
          if (st.pendingInteraction) m.set(id, st.pendingInteraction)
        }
        return m
      })
    : useSessionPendingInteraction
      ? useSessionPendingInteraction(interactions => interactions)
      : EMPTY_PENDING

  const ownPending = pendingKindOf(pendingBySession.get(sessionId)?.kind)
  const subPending = subagentPendingState(
    useSessions(s => s.byId), pendingBySession, sessionId)
  const pending = ownPending !== null || subPending.approvals > 0 || subPending.questions > 0

  // 后台状态：useSessions 两个版本都在，子代理运行计数不变。
  const subRunning = subagentRunningCount(useSessions(s => s.byId), sessionId)

  return (
    <div className={css.bar} data-pending={pending || undefined}>
      {/* state text, fill bar, todos percent, token chip, elapsed/eta */}
    </div>
  )
}
```

- **两者皆无的宿主上降级的是哪个 feature**：仅"注意力/pending"功能 —— 本会话自身的
  pending 种类与**子代理子树的 pending 汇总**（sidebar 隐藏子代理行，strip 负责露出）
  以及 `data-pending` 高亮。此时 `pending` 恒为 false。
- **继续工作的部分**：运行状态文本与填充条、todos 百分比、token chip、elapsed/eta、
  以及"主会话空闲但子代理仍在跑"的 `subRunning` 判定（依赖 `useSessions`，
  该 hook 在两个版本间未动）。
- **为什么必须静默降级而不是抛出**：本组件的任何抛出都会卸载整个共享的
  input.dock `DrawerErrorBoundary` 子树 —— 正是本次事故本身，无辜同居条目（B 的
  chips）会陪葬，且边界只在会话切换时重置，错误会长时间钉死 dock。丢一个装饰性
  注意力标记是可恢复的小损失；dock 整体消失是不可接受的大损失。
  （可选：开发模式下一次性 `console.warn`，生产保持沉默。）

## 4. Multi-tenant hygiene —— 租户自律与宿主隔离

**dock 租户应做的**：
- 调用任何标准套件 prop 前做存在性检测（feature-detect），缺失则静默降级，绝不裸调
  可能为 `undefined` 的座位；标准套件按宿主版本出契约，按双契约构建与测试。
- **在自己条目内部再包一层自己的错误边界**：若插件 A 的组件树自带边界，抛错会被
  自己捕获、只自己渲染 null，父级共享边界根本看不到这次失败 —— 同居者免疫。
- 注册期校验注入形状；风险读取放进不抛出的 selector；保留 try/catch 日志便于归因。

**宿主可改的**：把边界粒度从 per-slot 改为 **per-entry** —— 在渲染 list slot 的循环里
给每个 `DockEntry` 单独套边界（或让 `DockEntry` 自身成为边界），一个条目崩溃只卸载
该条目并带条目 id 记日志；可对反复崩溃的条目做退避/隔离。

**宿主面对的 trade-off**：**故障隔离粒度 vs. 故障可见性/诊断响度**（外加每条目额外的
React 节点开销）。per-entry 边界下，一次系统性的契约破坏会表现为许多"安静渲染 null"
的条目 —— 控制台若无强制逐条日志，看上去"没报错"反而更难察觉；重试/重置语义也更复杂
（何时给条目第二次机会：会话切换？props 变化？需要防崩溃循环的退避）。一个响亮的
整体失败虽然粗暴，但不可否认地醒目；隔离越好，越要配套强制的逐条目错误上报。

## 5. Verification —— 不重启宿主验证两个条目都回来 + B 的回归覆盖

**不重启宿主的做法**：六个插件均为 junction 链接的外部客户端插件。按 **DSH-0.1.6-A2-03**
要点：链接安装的插件不在 plugin-manager 的 bundle 管理内，改动在启用 HMR 时即时生效
（否则需重启）；此处只重建**客户端 bundle**，宿主进程无需动 —— 重新构建插件 A 的
client.js 后**硬刷新页面**（Ctrl+F5），客户端重新请求工件、槽位重新注入即可验证。

**验证步骤**：
1. 重建插件 A → 硬刷新。F12 控制台**零错误**：不再有
   `useSessionPendingInteraction is not a function`，也不再有
   `[dsh:slots] input.dock boundary fallback active`；槽位日志应显示 input.dock 两个
   条目（`dsh-paste-input-dock`、`progress`）均挂载，input.left 条目仍在。
2. 进度条可见且运行态/todos/token 正常；制造一次 pending approval → 注意力态经
   `useSessionStatus` 出现（alpha.2 路径）。
3. 粘贴文件 → chips rail 渲染；chip 移除可用；attach 按钮不受影响。
4. 同一构建拿到 alpha.1 宿主上复验：pending 经 `useSessionPendingInteraction` 工作
   （双宿主回归）。

**必须专门为 B 覆盖的回归**：**DSH-0.1.6-A2-01**（`SessionListState.current` 移除）。
禁用实验只证明 B 的渲染恢复，**完全不覆盖** B 的事件时当前会话解析 —— 若 B 经
`sessions.list.getSnapshot().current` 解析会话，alpha.2 上静默得到 `undefined`
（卡片第一手证据：paste/drop 插件每次粘贴弹"请先打开一个会话"；fixture 里 toast
只出现一次后消失正是此类静默失效的烟枪）。因此必须实测：粘贴确实落入**当前打开的
会话**、切换会话后粘贴目标跟随、无会话时优雅提示而非假成功。若命中 A2-01，B 需另行
迁移到 `ctx.uiSession.adapter.current.getSnapshot()`（两个标签均可用）—— 这超出本次
A 的修复范围，但验证清单必须包含它，否则"两个症状都好了"的结论不成立。

---

### 结论速览

| 问题 | 答案 |
|---|---|
| 谁崩了 | 插件 A `SessionProgressBar`，第 24 行裸调已被 alpha.2 移除的 `useSessionPendingInteraction`（DSH-0.1.6-A2-02） |
| B 为何陪葬 | input.dock 整列表共用一个 `DrawerErrorBoundary`，fallback=null → 边界连坐；按钮在 input.left 的独立边界内幸存 |
| 禁用实验证明 | B 的症状纯由 A 经共享边界传染；不证明 B 无 bug（A2-01 静默回归需另测），不证明 dock 无其他静默问题 |
| 修复 | A 按 prop 存在性选 `useSessionStatus`/`useSessionPendingInteraction`，皆无则空 Map 静默降级；仅注意力标记降级，其余功能保留 |
| 卫生 | 租户：feature-detect + 自带边界；宿主：per-entry 边界，换取隔离但牺牲诊断响度、需逐条目上报与退避 |
| 验证 | 重建 A → 硬刷新（无需重启宿主）；控制台零错误 + 两条目挂载 + pending 行为 + 双宿主复验；另测 B 的 A2-01 粘贴回归 |


## Required output (JSON only)
{"decisions":[{"id":"<criterion-id>","verdict":"pass|partial|fail|missing","reason":"short"}],"caps":[{"id":"<cap-id>","triggered":false,"reason":"short"}]}
Every criterion and cap exactly once. pass=full points, partial=half, fail/missing=0; a triggered cap caps the total.