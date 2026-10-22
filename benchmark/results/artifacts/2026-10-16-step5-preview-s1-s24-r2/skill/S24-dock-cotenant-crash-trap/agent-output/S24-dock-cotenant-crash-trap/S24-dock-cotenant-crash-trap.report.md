# S24 · The Dock That Vanished Together — diagnosis & fix

**Host corridor:** `dsh 0.1.6-alpha.1 → 0.1.6-alpha.2` (npm global, Windows, web profile, six
junction/link-installed client plugins).
**Authoritative change card:** `DSH-0.1.6-A2-02` (skills/plugin-upgrade/references/v0.1.6-alpha.2.md) —
*"Global standard props: `useSessionPendingInteraction` is replaced by `useSessionStatus` (plus the
new `useSessionRetainInfo`); `useSessions` stays."*

## TL;DR

There is **one** fault, in **plugin A** (the session-progress strip, dock id `progress`), not two.
On alpha.2 the standard-props kit **removed** `useSessionPendingInteraction`, so plugin A's
`useSessionPendingInteraction(...)` call is `undefined(...)` and throws
`TypeError: useSessionPendingInteraction is not a function` during render. That throw is caught by
the **single** `DrawerErrorBoundary name="input.dock"` that wraps the **entire** dock list, so React
unmounts **every** dock entry — including plugin B's innocent chips rail (`dsh-paste-input-dock`).
Plugin B's other surface (the attach button) lives in a **different** slot (`conversation.input.left`)
behind a **different** boundary, so it survives. The two symptoms are one crash with a shared blast
radius, not two independent hits.

---

## 1. Culprit attribution

**Which plugin actually fails, at which exact call.**
Plugin A — the session-progress plugin (`dsh-ui-progress`, dock entry id `progress`, `order: 20`).
The exact call is in `plugin-a/SessionProgressBar-excerpt.tsx:24`:

```tsx
const pendingBySession = useSessionPendingInteraction(interactions => interactions)
```

The compiled frame is `client.js:219:41`. On alpha.2 the destructured prop
`useSessionPendingInteraction` is `undefined`; calling it throws
`Uncaught TypeError: useSessionPendingInteraction is not a function` — exactly the single F12 error.

**Why now — what changed in the standard kit between the two contracts.**
Diffing the two sealed contracts (`host-types/slots-contract-alpha1.d.ts` vs `-alpha2.d.ts`):

- alpha.1 `SessionStandardProps` carried
  `useSessionPendingInteraction: SnapshotSelectorHook<ReadonlyMap<SessionId, SessionPendingInteraction>>`.
- alpha.2 `SessionStandardProps` **drops** `useSessionPendingInteraction` and instead carries
  `useSessionStatus: SnapshotSelectorHook<ReadonlyMap<SessionId, SessionStatus>>` (with
  `SessionStatus = { running, completionUnread, pendingInteraction }`) plus the new
  `useSessionRetainInfo`. `useSessions`, `useConversation`, `useProjection`, `useInput`,
  `inputActions` are all unchanged.

The alpha.2 header states the cause: this is the session kit merged with the `GlobalStandardProps`
that `@deepseek-ai/dsh-client-ui-session` adds to **every** slot after the **multi-instance refactor**.
The pending-interaction **seat** plugin A reads was removed and its content **folded into
`useSessionStatus`**. Plugin A never feature-detected the seat, so on the new host it received
`undefined` and called it. This is precisely `DSH-0.1.6-A2-02`, whose first-hand evidence is this
very strip "called it unconditionally" and "throws at render and takes the whole dock subtree down."

**Why the innocent co-tenant's dock entry disappears with it — the mechanism.**
The mechanism is a **React error boundary unmounting its entire subtree**, and the boundary is scoped
**per-slot, not per-entry**. The console stack and the slot log make this explicit:

```
at SessionProgressBar
at DockEntry
at DrawerErrorBoundary        ← name="input.dock", wraps the WHOLE list
at InputDock
[dsh:slots] input.dock boundary fallback active; unmounted entries: dsh-paste-input-dock, progress
```

`host-types/dock-render-tree.md` shows `dsh-paste-input-dock` (plugin B, order 5) and `progress`
(plugin A, order 20) are **siblings inside one** `<DrawerErrorBoundary name="input.dock">`. When
plugin A throws, that boundary catches it and renders its fallback (`null`) — unmounting **all** of
its children. Plugin B's chips entry never threw; it is **collateral**, torn down because it shares the
crashing boundary with plugin A. "React will try to recreate this component tree from scratch using the
error boundary … DrawerErrorBoundary" = the whole dock list is replaced by the fallback.

**Why the attach button in a different slot survives while the chips do not.**
Plugin B registered **two** surfaces (`plugin-b/dock-entry-excerpt.md`): the chips rail in
`conversation.input.dock`, and the attach button in `conversation.input.left`. The render tree puts
these behind **two different boundaries**:

```
<InputLeft><DrawerErrorBoundary name="input.left">  <SlotEntry id="dsh-paste-input-button"/> </…></InputLeft>
<InputDock><DrawerErrorBoundary name="input.dock">   <DockEntry id="dsh-paste-input-dock"/>  <DockEntry id="progress"/> … </…></InputDock>
```

The crash poisoned only the `input.dock` boundary, so only the dock list unmounted
(`input.dock … unmounted entries: dsh-paste-input-dock, progress`). The `input.left` boundary is a
separate, un-poisoned boundary, so `input.left: 1 entry mounted (dsh-paste-input-button)`. The
isolation line is the **error boundary**, and the button and the chips happen to sit on opposite sides
of it.

---

## 2. The experiment (tried-notes.txt #3)

The decisive control: **disable plugin A → plugin B's chips came back immediately; re-enable plugin A →
chips gone again.**

**What it proves.**
- Plugin A's presence is a **necessary cause** of the dock-list teardown. Removing the `progress`
  entry removes the only throwing child, so the `input.dock` boundary stops firing its fallback and
  renders normally — and plugin B's `dsh-paste-input-dock` (order 5) mounts and shows its chips. This
  is a clean necessary-condition control that pins the crash to plugin A.
- It proves the **two symptoms share ONE root cause**: the same disabling of A that restores the strip
  also restores the chips, with no change to plugin B.

**What it does NOT prove.**
- **It does not prove plugin B is bug-free on alpha.2.** It only shows B *renders* when the shared
  boundary isn't poisoned. On its own it says nothing about B's compatibility; it is the static facts
  (`AttachmentChips` "uses NO standard-kit hooks at all", "its own try/catch … logged nothing", the
  dock entry "registers fine") that exonerate B for *this* fault — the experiment just confirms B can
  mount once A is out of the way.
- **It does not prove the strip crash is the ONLY dock problem.** The dock list has `…` — other
  entries. Disabling A removes exactly one throwing entry; it does not audit the remaining dock
  entries (the other plugins) against the alpha.2 contract, and it does not exercise paths not taken
  in that state — most importantly the **session-switch / boundary-reset re-mount**, where the boundary
  "resets on the next session switch" and **re-mounts every entry at once**. A latent throw in another
  entry would surface there, not on the plain refresh the maintainer did. So the experiment bounds the
  *observed* teardown to plugin A; it does not certify the dock is otherwise healthy on alpha.2.
- Minor process caveat (`DSH-0.1.6-A2-03`): for link-installed plugins a Plugins-page toggle "applies
  immediately only with HMR enabled, otherwise at restart." The fact that the chips returned *is* the
  proof the disable actually took effect — a valid control — but the maintainer should not assume every
  such toggle is live without that confirmation.

**Why reinstalling plugin B could never have helped.**
Plugin B is the **victim, not the culprit**. Its chips vanish because the *shared* `input.dock`
boundary unmounts the whole list when plugin A throws; B's own code and registration are fine and never
touched the removed hook. Reinstalling B re-delivers the same B code against the same host — it changes
nothing about plugin A's throw or about the boundary that wraps both. You reinstalled the bystander; the
defect lives in plugin A's use of a removed seat (and, structurally, in the host's per-slot boundary).

**What is wrong with the colleague's "both plugins were hit" theory.**
- It is contradicted by the evidence: there is **exactly one** error, naming **one** hook from **one**
  component (plugin A). Plugin B uses no standard-kit hooks, so it cannot have "used a removed prop";
  its try/catch logged nothing.
- Its testable prediction fails: if B were independently broken by the swap, disabling A would fix the
  strip but B's chips would **stay** broken. Instead the chips **returned** the instant A was disabled —
  proof of a single cause with shared blast radius, not a double hit.
- It mis-reads the surviving attach button: if B's *registration* had broken, B's other surface would
  break too — but the button renders fine. B's dock entry registers fine and renders the moment the
  boundary isn't poisoned, so "fix both plugins' slot registrations" would waste effort editing B while
  leaving the real defect (A) in place. The colleague conflated "two visible symptoms" with "two
  independent faults" and missed the shared-boundary mechanism.

---

## 3. The fix (graceful degradation for the removed seat)

Feature-detect the seat the host actually supplies and **never call an undefined hook**; when neither
pending seat is present, degrade to "not pending" instead of throwing. This is the `DSH-0.1.6-A2-02`
recipe: *"pick the hook by which prop the host supplies — the set of props is fixed per host, so the
branch is stable across renders — and degrade to an empty state when neither is present."*

```tsx
/**
 * SessionProgressBar (corrected for dsh 0.1.6-alpha.2): the session-progress strip
 * registered into 'conversation.input.dock' by the session-progress plugin
 * (plugin A, id 'progress', order 20).
 *
 * WHY (DSH-0.1.6-A2-02): the alpha.1 -> alpha.2 multi-instance refactor REMOVED
 * 'useSessionPendingInteraction' from the standard-props kit and folded the
 * per-session pending state into 'useSessionStatus'
 * ({ running, completionUnread, pendingInteraction }); 'useSessions' stayed.
 * The old unconditional call threw and took the whole input.dock boundary down
 * (plugin B's chips included). We now feature-detect the seat and degrade
 * SILENTLY, so this entry can never again poison its co-tenants.
 */

type PendingKind = ReturnType<typeof pendingKindOf>

export type SessionProgressBarProps =
  import('@deepseek-ai/dsh-client-ui-slots').PropsRuntime<'conversation.input.dock'>
  & PropsLocale<'progress'>

export function SessionProgressBar({
  session, sessionId, t, useConversation, useProjection, useSessions,
  useSessionStatus, useSessionPendingInteraction,
}: SessionProgressBarProps) {
  if (session === undefined || session === null) return null

  const chat = useConversation(conversation => conversation.views.get('chat'))
  const legacy = chat?.legacy ?? EMPTY_LEGACY
  const todos = useProjection('todos')
  const toolName = runningTool(legacy)
  const running = session.running
  const byId = useSessions(s => s.byId)

  // ---- pick the pending seat THIS host supplies ---------------------------------
  // The standard-props set is fixed for a given host, so this branch is stable for
  // the whole mount and the hook call order never changes on a running host.
  // NEVER call a hook that isn't a function.
  let seat:
    | { kind: 'status'; read: SnapshotSelectorHook<ReadonlyMap<SessionId, SessionStatus>> }
    | { kind: 'legacy'; read: SnapshotSelectorHook<ReadonlyMap<SessionId, SessionPendingInteraction>> }
    | { kind: 'none' } = { kind: 'none' }
  if (typeof useSessionStatus === 'function') {                 // alpha.2+
    // eslint-disable-next-line react-hooks/rules-of-hooks -- fixed per host
    seat = { kind: 'status', read: useSessionStatus(s => s) }
  } else if (typeof useSessionPendingInteraction === 'function') { // alpha.1
    // eslint-disable-next-line react-hooks/rules-of-hooks -- fixed per host
    seat = { kind: 'legacy', read: useSessionPendingInteraction(i => i) }
  }

  // Normalise every shape (and the absent case) into ONE lookup:
  // "is session <id> waiting on a human, and of what kind?". 'none' => always null.
  const pendingKindFor = (id: SessionId): PendingKind | null => {
    if (seat.kind === 'status') {
      const pending = seat.read.get(id)?.pendingInteraction as SessionPendingInteraction | undefined
      return pending ? pendingKindOf(pending.kind) : null
    }
    if (seat.kind === 'legacy') {
      const pending = seat.read.get(id)
      return pending ? pendingKindOf(pending.kind) : null
    }
    return null // host supplies neither pending seat -> degrade, do not throw
  }

  // Attention state: this session's own pending waits plus the subagent subtree's
  // (the sidebar hides subagent rows - this strip surfaces them).
  const ownPending = pendingKindFor(sessionId)
  const subPending = subagentPendingState(byId, pendingKindFor, sessionId)
  const pending = ownPending !== null || subPending.approvals > 0 || subPending.questions > 0

  // Background state: main conversation idle while descendant subagent sessions
  // keep executing - must not read as done-green. (Unchanged; uses useSessions.)
  const subRunning = subagentRunningCount(byId, sessionId)

  return (
    <div className={css.bar} data-pending={pending || undefined}>
      {/* state text, fill bar, todos percent, token chip, elapsed/eta — all keep
          working even with no pending seat; only the data-pending attention
          highlight degrades to "not pending". */}
    </div>
  )
}

// Registration (plugin A's index.ts) is UNCHANGED:
//   ctx.slots.inject('conversation.input.dock', () => ctx.slots.register(
//     { name: 'conversation.input.dock', id: 'progress', order: 20, locale: NS },
//     SessionProgressBar,
//   ))

// Adapted helper: the alpha.1 version took the raw pending map; it now takes the
// normalised per-session lookup so it works against useSessionStatus (alpha.2),
// useSessionPendingInteraction (alpha.1), or neither.
function subagentPendingState(
  byId: ReadonlyMap<SessionId, SessionSummary>,
  pendingKindFor: (id: SessionId) => PendingKind | null,
  rootId: SessionId,
): { approvals: number; questions: number } {
  let approvals = 0
  let questions = 0
  for (const id of descendantSessionIds(byId, rootId)) {
    const kind = pendingKindFor(id)
    if (kind === 'approval') approvals++
    else if (kind === 'question') questions++
  }
  return { approvals, questions }
}
```

**Which hook supplies the pending state on alpha.2.**
`useSessionStatus` — read the whole map with `useSessionStatus(s => s)` (needed for the subagent
walk) and take `.get(id)?.pendingInteraction`; its `.kind` feeds `pendingKindOf`, exactly as
`.get(id)?.kind` did on alpha.1. (`useSessionRetainInfo` is the *separate* new seat for reference
counts like `retainedBy.mainView`; the strip does not need it.)

**Which feature degrades on a host that supplies neither pending hook.**
The **attention / pending indicator**: `data-pending` and the surfaced subagent approval/question
counts. With no pending seat, `pendingKindFor` returns `null` for every id, so `pending` is false —
the strip simply stops asserting "waiting on a human." It degrades to an empty (never-pending) state.

**Which parts keep working.**
Everything that doesn't touch the pending seat: the running state (`session.running`,
`runningTool(legacy)`), todos percent (`useProjection('todos')`), the token-usage chip, elapsed/eta,
and the bar/fill render. Only the pending highlight is lost.

**Why the degradation must be silent rather than throwing.**
Because a throw here is the bug: it re-trips the shared `input.dock` `DrawerErrorBoundary`, which
unmounts the **whole** dock list and takes plugin B's chips (and every other dock entry) down with it.
A decorative strip losing its "pending" highlight is strictly cheaper than blanking the composer dock
for every tenant. Silent degradation (no throw, no boundary trip — optionally a one-time dev-only
`console.warn`) keeps this entry mounted and the boundary clean, so co-tenants survive.

---

## 4. Multi-tenant hygiene

**What a dock tenant should do so its own crash cannot take down co-tenants.**
1. **Never call an optional standard-kit hook unconditionally.** Feature-detect
   (`typeof hook === 'function'`) and degrade to an empty state when the seat is absent — the exact
   fix above. Treat the standard props as a *versioned, possibly-reduced* kit, not a guaranteed
   surface.
2. **Wrap the entry in its OWN error boundary** (per-entry `getDerivedStateFromError` → render a
   small inline fallback / `null`). This is defense-in-depth for seats you don't yet know will be
   removed: any future unexpected throw is contained to *this* entry and never reaches the slot-level
   boundary that would unmount everyone.
3. Keep render defensive: guard null/undefined inputs, never throw during render, defer risky/async
   work out of the render path, and don't rely on sibling `order` for safety.
4. Target the contract version and code to the intersection of supported hosts; add a compat test that
   mounts the entry against **both** contract shapes.

**What the HOST could change so one entry's failure isolates to that entry.**
- **Move the error boundary down from per-slot to per-entry:** wrap *each* `DockEntry` in its own
  `DrawerErrorBoundary` instead of one boundary around the whole `input.dock` list. Then a throw in
  `progress` unmounts only `progress` (fallback `null` or a small "this entry failed" placeholder)
  and `dsh-paste-input-dock` + siblings stay mounted.
- **Fail fast at load/registration:** when a plugin's code references a removed kit hook, flag it at
  plugin load with a clear "plugin A reads removed hook `useSessionPendingInteraction`" message
  (optionally per-entry telemetry) rather than letting it explode at render inside a shared boundary.

**The trade-off the host faces.**
**Fault isolation vs. uniform, atomic dock semantics.** Per-entry boundaries shrink the blast radius to
one entry and keep the dock up (resilient tenancy), but they produce *heterogeneous, half-rendered*
dock states that look broken to users, make "is the dock broken?" harder to reason about, can *silently
mask* a host-wide contract break (many entries blank quietly instead of failing loudly once), and
change the reset story (today one boundary "resets on the next session switch"). A single per-slot
boundary gives a clean all-or-nothing dock with one loud signal and a simple reset, at the cost of the
blast radius seen here. The host is choosing **blast radius + failure visibility** against **coherent
dock behavior** — and, if it moves to per-entry boundaries, it must also decide what a failed entry
shows (`null` vs. a visible placeholder) so silent vanishings like this one don't recur.

---

## 5. Verification

**Restore BOTH plugins' dock entries without a host restart.**
The fix is in plugin A's *client bundle*, so only the client side needs to reload — client-plugin HMR
(if the dev rebuild watcher is running, saving plugin A re-bundles and re-mounts the dock) or a
client-side plugin re-link + browser hard-refresh. You do **not** restart the `dsh web` host process.
Confirm the bundle actually reloaded (version marker), then check, with **both** plugins enabled:

1. Console shows **no** `useSessionPendingInteraction is not a function` and **no**
   `input.dock boundary fallback active` line.
2. `input.dock` mounts **both** `dsh-paste-input-dock` and `progress`.
3. The progress strip renders above the composer again.
4. Paste a file → the chip rail renders again (chips appear above the composer).
5. The attach button in `input.left` still renders (no regression there either).

**The regression the verification must cover for plugin B specifically.**
The **session-switch / boundary-reset re-mount.** The `DrawerErrorBoundary` "resets on the next
session switch," which **re-mounts every dock entry at once** — the exact path the maintainer's
disable-experiment did *not* test (it tested a fresh mount with A absent). So after the fix: **switch
sessions** and re-confirm both entries mount and the chips render, with **zero** console throws on the
re-mount. Also:
- **Re-enable plugin A** (undo the experiment) and confirm the chips stay — the fix must work *with A
  present*, not by keeping A disabled.
- Exercise plugin B end-to-end: paste → chip appears → chip remove/add works (B reads its own injected
  state).
- Hold the single-error budget: **zero** render errors on both first mount and session switch.

---

## Evidence map

- Single error + boundary chain + slot log: `console-excerpt.txt`
- Two symptoms, what still works: `symptom-report.md`
- Reinstall (futile), the disable/re-enable control, colleague's theory: `tried-notes.txt`
- The failing call (line 24) + registration: `plugin-a/SessionProgressBar-excerpt.tsx`
- B's two surfaces + "no standard-kit hooks / no throw": `plugin-b/dock-entry-excerpt.md`
- The removed seat (alpha.1) vs the folded seat (alpha.2): `host-types/slots-contract-alpha1.d.ts`,
  `host-types/slots-contract-alpha2.d.ts`
- Per-slot (not per-entry) boundary; button vs chips on opposite sides: `host-types/dock-render-tree.md`
- Root-cause card + migration recipe + verification: `DSH-0.1.6-A2-02`
  (skills/plugin-upgrade/references/v0.1.6-alpha.2.md); link-install/HMR caveat: `DSH-0.1.6-A2-03`.
