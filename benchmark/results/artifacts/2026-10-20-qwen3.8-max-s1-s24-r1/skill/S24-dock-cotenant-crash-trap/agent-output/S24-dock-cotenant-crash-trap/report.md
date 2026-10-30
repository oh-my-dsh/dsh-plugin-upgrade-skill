# S24 · The Dock That Vanished Together — Diagnosis Report

**Corridor**: dsh 0.1.6-alpha.1 → 0.1.6-alpha.2 (npm global, Windows web profile, six junction-linked external client plugins).
**Governing card**: DSH-0.1.6-A2-02 (GlobalStandardProps: `useSessionPendingInteraction` replaced by `useSessionStatus` + `useSessionRetainInfo`; `useSessions` stays). Secondary: DSH-0.1.6-A2-01 (`SessionListState.current` removed) for the plugin-B regression check.
**Evidence used**: `console-excerpt.txt`, both `slots-contract-alpha*.d.ts`, `dock-render-tree.md`, `SessionProgressBar-excerpt.tsx`, `dock-entry-excerpt.md`, `tried-notes.txt`, `symptom-report.md`.

---

## 1. Culprit attribution

### 1.1 Which plugin fails, at which exact call, and why now

**Plugin A (the session-progress plugin, `dsh-ui-progress`) is the only plugin that fails.** The single F12 error is unambiguous:

```
Uncaught TypeError: useSessionPendingInteraction is not a function
    at SessionProgressBar (plugin://dsh-external/dsh-ui-progress/lib/client.js:219:41)
    at renderWithHooks (react-dom)
```

The exact call is in `SessionProgressBar`'s render body:

```ts
const pendingBySession = useSessionPendingInteraction(interactions => interactions)
```

The component destructures `useSessionPendingInteraction` from its standard-kit props and calls it **unconditionally**.

**Why now — what changed in the standard kit between the two sealed contracts:**

| Standard-prop seat | alpha.1 contract | alpha.2 contract |
|---|---|---|
| `useConversation`, `useProjection`, `useInput`, `inputActions` | present | present (unchanged) |
| `useSessions` | present | present (snapshot loses `current`, see DSH-0.1.6-A2-01 — irrelevant to this component, it only reads `.byId`) |
| `useSessionPendingInteraction` | present — `SnapshotSelectorHook<ReadonlyMap<SessionId, SessionPendingInteraction>>` | **REMOVED** |
| `useSessionStatus` | absent | **ADDED** — `SnapshotSelectorHook<ReadonlyMap<SessionId, SessionStatus>>`; per card DSH-0.1.6-A2-02 the `SessionStatus` record carries `running`, `completionUnread`, `pendingInteraction` |
| `useSessionRetainInfo` | absent | added |

The removal comes from the alpha.2 multi-instance Session refactor: the pending-interaction map was folded into the unified per-session `SessionStatus`. Critically, the **`conversation.input.dock` slot contract itself did not change** (still `list` / scope `session`, same session kit) — what changed is the *global* standard props (`GlobalStandardProps` from `@deepseek-ai/dsh-client-ui-session`) merged into every slot's kit. On alpha.2 the destructured `useSessionPendingInteraction` is `undefined`; calling it throws a TypeError during `renderWithHooks`, i.e. during the very first render after the upgrade. This is deterministic, which is why "everything worked on alpha.1 this morning" and broke immediately after upgrade + restart + hard refresh.

### 1.2 Why the innocent co-tenant's dock entry disappears — the mechanism

**Mechanism: shared React error-boundary fallback at the slot level (blast radius = the whole boundary subtree, not the failing entry).**

From `dock-render-tree.md`, the alpha.2 mount tree is:

```
<InputDock>
  <DrawerErrorBoundary name="input.dock">     ← ONE boundary for the whole list slot
    <DockEntry id="dsh-paste-input-dock" />   (plugin B, order 5)
    <DockEntry id="progress" />               (plugin A, order 20)
  </DrawerErrorBoundary>
</InputDock>
```

and: "`DrawerErrorBoundary` is a standard React class boundary (`getDerivedStateFromError` → renders `null` as its fallback …). **`DockEntry` itself adds no boundary of its own.**"

The causal chain:

1. Plugin A's `SessionProgressBar` throws during render (the TypeError above).
2. React propagates the error up to the **nearest** error boundary. `DockEntry` has none, so it is `DrawerErrorBoundary name="input.dock"` — which wraps **all** entries of the dock list slot, including plugin B's.
3. The boundary's fallback is `null`: React unmounts the **entire** boundary subtree and renders nothing. Both `DockEntry`s die — the stack in the console shows exactly this (`SessionProgressBar → DockEntry → DrawerErrorBoundary → InputDock`, "React will try to recreate this component tree from scratch using the error boundary you provided, DrawerErrorBoundary").
4. The host even logs the collateral damage explicitly:
   `[dsh:slots] input.dock boundary fallback active (session s-7f3a); unmounted entries: dsh-paste-input-dock, progress`
   — **two** entries unmounted by **one** error.

Plugin B's `AttachmentChips` never executes a failing line: it "reads only its own injected state … uses NO standard-kit hooks at all", and its own try/catch logged nothing. It is a **co-tenant casualty of the shared fault domain**, not a second bug. The chips' state (paste interception) still works — only their *render seat* was unmounted.

### 1.3 Why the attach button survives while the chips do not

A React error boundary catches errors **only in its own subtree**. The attach button is registered into a **different slot**, `conversation.input.left`, which the render tree shows under its **own separate** `<DrawerErrorBoundary name="input.left">`:

```
<InputLeft>
  <DrawerErrorBoundary name="input.left">
    <SlotEntry id="dsh-paste-input-button" />   ← never sees plugin A's error
  </DrawerErrorBoundary>
</InputLeft>
```

Plugin A's throw happens inside the `input.dock` boundary subtree; the `input.left` boundary is a sibling, untouched, so the button stays mounted — corroborated by the console: `[dsh:slots] input.left: 1 entry mounted (dsh-paste-input-button)`. Same plugin B, two slots, two fault domains: one entry fell inside the crashed boundary (chips), the other sits outside it (button). This is the render-tree proof that the failure is boundary-scoped, not plugin-B-scoped.

---

## 2. The experiment: what the disable-test proves — and what it does not

The key experiment (`tried-notes.txt` #3): *disable plugin A → plugin B's chips came back immediately; re-enable A → chips gone again*, with only a browser refresh, no other change.

### 2.1 What it proves

- **Plugin A's entry is the sole active cause of the dock-boundary crash.** The symptom toggles perfectly with A's presence: A enabled → boundary fallback → chips gone; A disabled → no throw in the dock subtree → boundary renders normally → chips back. That is a controlled A/B on the only variable.
- **Plugin B's dock entry is *renderable* on alpha.2.** With A disabled, B's chips render immediately on the same alpha.2 host — so B's registration, its injected state, and the dock slot contract are all functional on alpha.2. B's absence was collateral, not intrinsic.
- **There is exactly one fault domain involved**: one error + one boundary flip explains both symptoms, matching "F12 shows exactly one render error".

### 2.2 What it does NOT prove

- **It does not prove plugin B is bug-free on alpha.2.** The experiment only exercises B's *render* path in the dock. B has other surfaces the experiment never touches — notably its **event-time** paste/drop handling. Card DSH-0.1.6-A2-01 records that alpha.2 removed `SessionListState.current`, and the first-hand fleet evidence names exactly this plugin class: a paste/drop attachment plugin that resolved the current session via `.current` silently no-op'd / raised an "open a session first" error on every paste after the upgrade. The symptom report's "a toast appeared once" after the paste attempt is an unresolved observation that must be checked (see §5) — it may be B's normal success toast, or an A2-01 rejection. The dock experiment cannot distinguish these.
- **It does not prove the strip crash is the ONLY dock problem.** Disabling A removes A's *entry*, it does not test a *fixed* A: the first throw aborts A's render at line 219, so any alpha.2 breakage **later** in A's render path (or in states not exercised, e.g. a live pending interaction, subagent subtree activity) was masked and remains untested. Likewise the experiment says nothing about the other four plugins' potential dock/slot issues, nor about latent problems that only appear in untested states. "Chips came back" proves *no other active blocker at that moment in that state* — nothing more.
- It also does not prove the boundary itself is healthy in general (e.g. its reset-on-session-switch behavior) — only that it renders children when nothing throws.

### 2.3 Why reinstalling plugin B could never have helped

The failure chain is: **host contract change (seat removed) → plugin A throws → shared boundary swaps its whole subtree for `null`**. No link in that chain involves plugin B's installed bytes:

- B's code never executes a failing statement (no standard-kit hooks; its own try/catch logged nothing);
- B's entry was unmounted by the *host's* boundary fallback, not by anything in B;
- the reinstall restored the same mirror-tag bits into the same junction — identical code against an identical, deterministic environmental cause.

Reinstalling B addresses "B's files are corrupt/wrong", but the defect lives in (a) the alpha.2 prop-kit reduction and (b) A's unconditional call of a now-optional seat, plus (c) the boundary granularity that turns A's crash into a slot-wide blackout. No amount of B-reinstallation changes any of the three.

### 2.4 What is wrong with the colleague's "both plugins were hit" theory

The colleague proposes: "alpha.2 changed slot props; maybe both plugins use a removed prop — fix both plugins' slot registrations." Each leg fails against the evidence:

1. **"Both use a removed prop"** — contradicted. There is exactly **one** render error, and its stack names only `SessionProgressBar`. Plugin B's dock component **uses no standard-kit hooks at all** (`dock-entry-excerpt.md`), so it cannot consume a removed prop; and B renders fine the moment A is disabled, on the same host with the same props.
2. **"Slot props changed"** — mislocated. The *dock slot contract* (`conversation.input.dock`: list, session scope, session kit) is identical on both tags; what changed is the **global** standard props merged into every slot. Registration metadata (`name/id/order`) is untouched — so "fix both plugins' slot **registrations**" would edit code that is not broken, in a place that did not change, and would leave the dock dead because the crash is in A's component *body*.
3. **"You got hit twice"** — the control experiment refutes two independent hits: an independent B defect would not vanish when A is disabled. One cause, one boundary, two symptoms.

Conceded nuance: B *may* have been independently hit by alpha.2 **elsewhere** (the A2-01 event-time `.current` removal — hence the toast check in §5), but that is a different surface, a different card, and it is **not** why the chips disappeared. The chips symptom is fully explained by co-tenant collateral.

---

## 3. The fix: corrected component with graceful degradation

Design per card DSH-0.1.6-A2-02's migration recipe: **pick the pending seat by which prop the host supplies** (the standard-props set is fixed per host, so the branch is render-stable and hook order never flips), and **degrade to an empty pending state when neither seat exists**. One build serves alpha.1 and alpha.2.

**Which hook supplies the pending state on alpha.2**: `useSessionStatus` — read `useSessionStatus(m => m.get(sessionId)?.pendingInteraction)`; the same map also serves the subagent-subtree walk (per-session `pendingInteraction` inside each `SessionStatus` record, which additionally carries `running` / `completionUnread`). On alpha.1 the seat remains `useSessionPendingInteraction`.

```tsx
/**
 * SessionProgressBar — fixed for the dsh 0.1.6-alpha.1 → alpha.2 corridor
 * (card DSH-0.1.6-A2-02: the standard kit's pending seat moved from
 * useSessionPendingInteraction to useSessionStatus.pendingInteraction).
 *
 * Both seats are treated as OPTIONAL. The strip never throws because a seat
 * is missing: it silently degrades the pending/attention feature instead.
 */
export type SessionProgressBarProps =
  import('@deepseek-ai/dsh-client-ui-slots').PropsRuntime<'conversation.input.dock'>
  & PropsLocale<'progress'>
  & Partial<PendingSeats>

// Locally declared minimal seat shapes so ONE build compiles against either
// host contract without importing version-specific standard-props types.
interface PendingSeats {
  /** alpha.1 seat — removed in alpha.2. */
  useSessionPendingInteraction?: SnapshotSelectorHook<
    ReadonlyMap<SessionId, SessionPendingInteraction>
  >
  /** alpha.2 seat — SessionStatus carries { running, completionUnread, pendingInteraction }. */
  useSessionStatus?: SnapshotSelectorHook<
    ReadonlyMap<SessionId, SessionStatus>
  >
}

const EMPTY_PENDING: ReadonlyMap<SessionId, SessionPendingInteraction> = new Map()

/** Normalize alpha.2's SessionStatus map into alpha.1's pending-map shape. */
function toPendingMap(
  status: ReadonlyMap<SessionId, SessionStatus>,
): ReadonlyMap<SessionId, SessionPendingInteraction> {
  const out = new Map<SessionId, SessionPendingInteraction>()
  for (const [id, s] of status) {
    const pi = s?.pendingInteraction
    if (pi !== undefined && pi !== null) out.set(id, pi)
  }
  return out
}

let seatWarned = false
/**
 * Seat adapter hook. The host's standard-props set is fixed for the page's
 * lifetime, so "which seat exists" never changes between renders — the
 * branch below is render-stable and the hook order stays constant.
 * If NEITHER seat exists, pending state degrades to the empty map.
 */
function usePendingBySession(
  props: PendingSeats,
): ReadonlyMap<SessionId, SessionPendingInteraction> {
  const hasLegacy = typeof props.useSessionPendingInteraction === 'function'
  const hasStatus = typeof props.useSessionStatus === 'function'

  const map = hasLegacy
    ? props.useSessionPendingInteraction!(interactions => interactions)
    : hasStatus
      ? toPendingMap(props.useSessionStatus!(status => status))
      : EMPTY_PENDING

  if (!hasLegacy && !hasStatus && !seatWarned) {
    seatWarned = true
    // Dev-visible, user-silent: never throw here (see report §3 rationale).
    console.warn('[dsh-ui-progress] no pending-interaction seat supplied by host; '
      + 'attention indicator degraded (running/todos/tokens/eta unaffected).')
  }
  return map
}

export function SessionProgressBar(props: SessionProgressBarProps) {
  const { session, sessionId, t, useConversation, useProjection, useSessions } = props
  if (session === undefined || session === null) return null
  const chat = useConversation(conversation => conversation.views.get('chat'))
  const legacy = chat?.legacy ?? EMPTY_LEGACY
  const todos = useProjection('todos')
  const toolName = runningTool(legacy)
  const running = session.running
  // ... percent / turn / elapsed / eta derivation unchanged ...

  // Attention state: this session's own pending waits plus the subagent
  // subtree's. Degrades to "never pending" on a host with no pending seat.
  const pendingBySession = usePendingBySession(props)
  const ownPending = pendingKindOf(pendingBySession.get(sessionId)?.kind)
  const subPending = subagentPendingState(
    useSessions(s => s.byId), pendingBySession, sessionId)
  const pending = ownPending !== null || subPending.approvals > 0 || subPending.questions > 0

  // Background state: main conversation idle while descendant subagent
  // sessions keep executing - must not read as done-green.
  // Uses useSessions(.byId) + per-session running: present on BOTH contracts.
  const subRunning = subagentRunningCount(useSessions(s => s.byId), sessionId)

  return (
    <div className={css.bar} data-pending={pending || undefined}>
      {/* state text, fill bar, todos percent, token chip, elapsed/eta */}
    </div>
  )
}
```

Plus the tenant-side blast-radius guard (see §4) at registration:

```tsx
class EntryBoundary extends React.Component<
  { id: string; children: React.ReactNode }, { failed: boolean }
> {
  state = { failed: false }
  static getDerivedStateFromError() { return { failed: true } }
  componentDidCatch(error: unknown, info: unknown) {
    // Fail loud to devs, invisible to users, contained to THIS entry.
    console.error(`[dsh-ui-progress] dock entry '${this.props.id}' crashed; isolated.`, error, info)
  }
  render() { return this.state.failed ? null : this.props.children }
}

const withEntryBoundary = <P extends object>(C: React.ComponentType<P>, id: string) =>
  function Guarded(props: P) {
    return <EntryBoundary id={id}><C {...props} /></EntryBoundary>
  }

// Registration (plugin A's index.ts):
//   ctx.slots.inject('conversation.input.dock', () => ctx.slots.register(
//     { name: 'conversation.input.dock', id: 'progress', order: 20, locale: NS },
//     withEntryBoundary(SessionProgressBar, 'progress'),
//   ))
```

**What degrades on a host that supplies neither pending hook**: only the **attention/pending feature** — the `data-pending` highlight, i.e. this session's own pending approval/question *and* the subagent-subtree pending surfacing (the strip's unique value-add, since the sidebar hides subagent rows). `ownPending` resolves to null and `subPending` counts are 0, so the strip simply never enters the pending state.

**What keeps working**: everything driven by seats present on both contracts — running/idle state text and fill bar (`session.running` via the slot Provider), todos percent (`useProjection('todos')`), token usage chip (`useProjection` usage), turn/elapsed/eta derivation (`useConversation` legacy view), and the background-subagents-running indicator (`useSessions(s => s.byId)` — `useSessions` stays on alpha.2 — plus per-session `running`).

**Why the degradation must be silent rather than throwing**: in this shell, a render-time throw from any dock entry is not local — it trips the slot-level `DrawerErrorBoundary`, whose fallback is `null`, so it deletes the **entire dock for every tenant** (exactly the outage being fixed), while showing the user *no* visible error at all. A missing optional seat is a feature-level absence, not a fatal condition: a strip without the pending dot is still useful; a strip that kills its co-tenants is worse than useless. Silent-to-user does not mean silent-to-developer: the one-time `console.warn` (and `componentDidCatch` logging in the entry boundary) keeps the degradation discoverable in F12 without mutating UI state or breaking the render.

---

## 4. Multi-tenant hygiene

### 4.1 What a dock tenant should do so its own crash cannot take down co-tenants

1. **Wrap its own registered component in a plugin-owned error boundary** (`withEntryBoundary` above). A boundary inside the entry catches the entry's render errors *before* they reach the shell's slot-level boundary, so the fallback (`null` for just this entry, or a minimal "widget unavailable" chip) is entry-scoped and co-tenants keep rendering. This is the single most effective tenant-side measure: it converts "I crash the dock" into "I crash myself".
2. **Treat every standard-kit seat as optional / feature-detect before calling** (`typeof seat === 'function'`), because the global kit is host-versioned and shrinks across releases (alpha.2 removed one; a future host may remove more). Degrade the *feature*, keep the *component*.
3. **Write total selectors**: selectors passed to host hooks must tolerate `undefined`/`null` snapshots and missing map entries (`m.get(id)?.x`), never assume a field exists because yesterday's contract had it (e.g. `SessionListState.current`, DSH-0.1.6-A2-01).
4. **Pin/declare the host cohort honestly and test against both ends of the corridor**: the plugin's `package.json` peer floor should state the DSH range it actually supports; CI should mount the component against both alpha.1 and alpha.2 kits (a type-level check against the sealed contracts would have failed the build at the destructuring line).
5. **Fail loud-to-dev, quiet-to-user**: one-time `console.warn/error` with the plugin tag and entry id, so a degraded or isolated entry is attributable in F12 without user-facing breakage.
6. Keep dispose/effect hygiene (listener/effect pairs) so unload/re-enable cycles don't leave fiber residue that could crash later renders.

### 4.2 What the HOST could change so one entry's failure isolates to that entry

Move the error boundary **inward, per entry**: have `DockEntry` (the shell's own wrapper — it "adds no boundary of its own" today) render each registered component inside an individual boundary, keeping the slot-level `DrawerErrorBoundary` only as a last-resort backstop for failures in the slot machinery itself. Then `progress` throwing unmounts `progress` alone; `dsh-paste-input-dock` never notices. The host should pair this with per-entry attribution logging (extend the existing `[dsh:slots]` line to say *which entry* crashed, not just which entries were unmounted) and a per-entry fallback policy (render `null`, or a small "plugin widget failed" placeholder).

### 4.3 The trade-off the host faces

**Isolation granularity vs. overhead and signal quality.** Per-entry boundaries mean one extra class-component instance (state, lifecycle, reconciliation cost) around *every* entry of *every* list slot — memory/render overhead paid fleet-wide, forever, to protect against rare crashes. Reset semantics get harder: today the slot boundary resets on session switch as one unit; per-entry boundaries must each decide when to reset (session switch? re-enable? HMR?) or a once-crashed entry stays blank for the session. And there is a UX/observability tension: fine-grained silent fallbacks make failures *less* visible (a single missing widget can look like "the plugin has no UI"), so the host must invest in console/dev-surface attribution — otherwise it trades a loud shared outage for quiet per-plugin ones. Coarse boundaries are cheap and make failure obvious (the whole dock vanishes → someone files a bug); fine boundaries are resilient but require deliberate telemetry to keep failures discoverable.

---

## 5. Verification (no host restart)

The plugins are junction-linked external client plugins, so the host serves plugin A's rebuilt client bundle straight from the install tree; per DSH-0.1.6-A2-03, composition/toggle changes apply immediately when HMR is enabled. No host process restart is needed — only a rebuild + browser hard-refresh.

**Steps**

1. Rebuild plugin A's client bundle in place (junction → host picks up the new `lib/client.js`); leave plugin A **enabled** (if it was toggled off in the experiment, re-enable its row — with HMR on, the toggle applies immediately; if this profile has no HMR, the enable can ride along with the browser reload of the client roster — still no host restart).
2. **Hard-refresh the browser (Ctrl+F5)** with F12 console open.
3. **Console gate**: zero render errors; no `input.dock boundary fallback active` line; the `[dsh:slots]` mount line for `input.dock` lists **both** entries mounted (`dsh-paste-input-dock` and `progress`).
4. **Visual gate — both dock entries**: the progress strip is visible above the composer (running state, todos %, token chip, elapsed/eta) **and simultaneously** plugin B's chip rail appears when a file is pasted. Co-tenancy is the point: verify them *together*, not one at a time.
5. **Pending-seat gate (the migrated code path on alpha.2)**: trigger a real pending interaction (e.g. an approval prompt or `ask_user_question`) in the open session → the strip shows `data-pending`; optionally start a subagent that asks a question → subagent pending also lights the strip. This proves the `useSessionStatus(... .pendingInteraction)` seat actually supplies data on alpha.2, not merely that no throw occurred.
6. **Boundary-isolation gate (optional but cheap)**: temporarily make A's component throw once (dev build) → with the new `EntryBoundary`, only the `progress` entry blanks and its `console.error` names it; B's chips keep rendering. Revert.
7. No host restart occurred at any step; if a step seemed to require one, that itself is a finding (bundle caching behavior), not something to paper over.

**Regression the verification must cover for plugin B specifically**

- **End-to-end paste actually attaches, not just renders**: paste a file with a session open and confirm the chip is created from the *paste event path* — and identify that one-time toast from the symptom report: is it B's normal success feedback, or an "open a session first"-style rejection? DSH-0.1.6-A2-01 (`SessionListState.current` removed) is a live risk for B's **event-time** session resolution that the dock-render experiment never exercised; if B reads `.current` anywhere in its paste/drop handlers it must migrate to `ctx.uiSession.adapter.current.getSnapshot()` (works on both tags) or the alpha.2 `retainedBy.mainView > 0` row. The disable-experiment only cleared B's *render* path; this check clears B's *input* path.
- **Chips under co-tenant re-render churn**: with A enabled and its strip live-updating (running → pending → done), paste multiple files, remove one chip, paste again — B's rail must survive A's re-renders and its own add/remove actions.
- **Session switch**: switch sessions (the boundary's reset trigger) and back — B's rail and A's strip both re-mount cleanly, no stale fallback, no duplicate entries.
- **Attach button unchanged**: `input.left` still shows exactly one entry and the button still opens the file picker (guards against the fix accidentally touching B's other slot).

---

## Summary

One removed standard-kit seat (`useSessionPendingInteraction`, alpha.2, card DSH-0.1.6-A2-02) + one unconditional call (plugin A) + one slot-wide error boundary with a `null` fallback = two vanished UIs and one error. Plugin B is a co-tenant casualty inside the `input.dock` boundary; its button survives because `input.left` is a separate boundary subtree. The disable-experiment pins causality to A and proves B renders on alpha.2, but clears neither B's event-time paths (A2-01) nor A's post-throw code. Fix: seat feature-detection with silent degradation to `useSessionStatus(...).pendingInteraction` + a plugin-owned entry boundary; host-side, per-entry boundaries trade overhead/visibility for isolation.
