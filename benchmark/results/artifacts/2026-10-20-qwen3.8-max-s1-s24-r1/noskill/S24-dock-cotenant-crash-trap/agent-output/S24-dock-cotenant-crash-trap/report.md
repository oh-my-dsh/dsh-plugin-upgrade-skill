# S24 · The Dock That Vanished Together — Diagnostic Report

**Incident**: dsh web (Windows, npm global) upgraded in place `@deepseek-ai/dsh` 0.1.6-alpha.1 → 0.1.6-alpha.2.
Two simultaneous symptoms: (1) the session-progress strip is entirely absent from the composer dock;
(2) the paste/attachment plugin's chip rail never renders, while its attach button (different slot) survives.
F12 shows **exactly one** render error. Evidence pack: `/app/fixture/` (read-only, unmodified).

---

## 1. Culprit attribution

### 1.1 Which plugin fails, and at which exact call

**Plugin A — the session-progress plugin (`dsh-ui-progress`)** is the only failing plugin. The single
console error is:

```
Uncaught TypeError: useSessionPendingInteraction is not a function
    at SessionProgressBar (plugin://dsh-external/dsh-ui-progress/lib/client.js:219:41)
    at renderWithHooks (react-dom)
    at mountIndeterminateComponent (react-dom)
```

The exact failing call is in `plugin-a/SessionProgressBar-excerpt.tsx`:

```ts
const pendingBySession = useSessionPendingInteraction(interactions => interactions)
```

`SessionProgressBar` destructures `useSessionPendingInteraction` out of the slot's standard-kit props.
On alpha.2 that prop **does not exist**, so destructuring yields `undefined` (JS destructuring of a
missing property is silent), and *calling* it throws a plain `TypeError` during the render phase
(`renderWithHooks` / `mountIndeterminateComponent` in the stack confirm the throw happens while React
is rendering the component — before any hook machinery is even involved). Compiled bundle coordinates
`client.js:219:41` (call site) under `client.js:201:3` (component) match this line.

### 1.2 Why now — what changed in the standard kit between the two contracts

Diffing the two sealed contract excerpts for `conversation.input.dock` standard props:

| alpha.1 `SessionStandardProps` | alpha.2 `SessionStandardProps` |
|---|---|
| `useConversation` | `useConversation` (unchanged) |
| `useSessions` | `useSessions` (unchanged) |
| **`useSessionPendingInteraction`** — `SnapshotSelectorHook<ReadonlyMap<SessionId, SessionPendingInteraction>>` | **REMOVED** |
| — | **NEW** `useSessionStatus` — `SnapshotSelectorHook<ReadonlyMap<SessionId, SessionStatus>>`; per the doc comment `SessionStatus` = { running, completionUnread, **pendingInteraction** } |
| — | **NEW** `useSessionRetainInfo` |
| `useProjection`, `useInput`, `inputActions` | unchanged |

This is a **standard-kit reduction**: the alpha.2 header states the kit is now "the session kit …
merged with the GlobalStandardProps that `@deepseek-ai/dsh-client-ui-session` adds to every slot
**after the multi-instance refactor**". In that refactor the dedicated pending-interaction map hook
was folded into a single per-session status hook (`pendingInteraction` became a field of
`SessionStatus`), and the standalone prop name disappeared.

Why it only bites at runtime: plugin A ships a **prebuilt bundle** (`lib/client.js`, junction-linked).
It was type-checked/compiled against the alpha.1 contract, where the prop existed. Nobody recompiled
it against alpha.2 types — had anyone done so, TypeScript would have flagged the missing prop at build
time. After the host upgrade, the bundle still destructures the removed name and gets `undefined`.
"Everything worked this morning on alpha.1" is fully consistent: same plugin bytes, different kit.

### 1.3 Why the innocent co-tenant's dock entry disappears with it

**Mechanism: a single shared React error boundary around the whole list slot, with a `null` fallback
that unmounts the entire subtree.**

From `host-types/dock-render-tree.md`, the alpha.2 mount tree is:

```
<InputDock>
  <DrawerErrorBoundary name="input.dock">      ← ONE boundary for the whole slot
    <DockEntry id="dsh-paste-input-dock" />    (plugin B, order 5)
    <DockEntry id="progress" />                (plugin A, order 20)
    ...
  </DrawerErrorBoundary>
</InputDock>
```

and: "`DrawerErrorBoundary` is a standard React class boundary (`getDerivedStateFromError` → renders
`null` as its fallback, resets on the next session switch). **`DockEntry` itself adds no boundary of
its own.**"

So the containment granularity is **per slot, not per entry**. When `SessionProgressBar` throws during
the render pass, the error propagates to the nearest boundary — the shared `DrawerErrorBoundary`
wrapping *all* of `input.dock` — which switches its whole subtree to `null`. Every mounted dock entry
is unmounted, guilty and innocent alike. The console proves it:

```
[dsh:slots] input.dock boundary fallback active (session s-7f3a); unmounted entries: dsh-paste-input-dock, progress
```

Plugin B's `AttachmentChips` never threw anything: in the same render pass it rendered fine (order 5
is processed before order 20; the only error names only `SessionProgressBar`), then got discarded when
the boundary bailed the subtree. Because the fallback persists **until the next session switch**, the
chips stay gone for the whole session — matching "the chips row *never* renders".

**Why the attach button survives**: it is registered in a **different slot**, `conversation.input.left`,
which lives in a different subtree with its **own** `DrawerErrorBoundary`:

```
<InputLeft>
  <DrawerErrorBoundary name="input.left">
    <SlotEntry id="dsh-paste-input-button" />
  </DrawerErrorBoundary>
</InputLeft>
```

The crash is contained to the `input.dock` boundary; `input.left` never sees it
(`[dsh:slots] input.left: 1 entry mounted (dsh-paste-input-button)`). Same plugin, two slots, two
isolation domains — one dies, one lives. This also explains the maintainer's confusion: plugin B's
non-dock surfaces (attach button, paste interception/toast) kept working, so B looked "half broken",
when in fact B was 100% fine and only its dock-side rail was collateral.

**One error, two symptoms**: symptom 1 (strip gone) is the crash itself; symptom 2 (chips gone) is the
shared-boundary `null` fallback evicting the co-tenant.

---

## 2. The experiment

### 2.1 What the disable-experiment proves

The maintainer disabled plugin A and refreshed → **B's chips came back immediately**; re-enabled A →
chips gone again. This is a clean controlled A/B toggle on the only variable that matters:

- It proves plugin A's presence is the **necessary and sufficient cause** of the dock failure: with A
  removed and *zero changes to B or the host*, B renders normally.
- It proves B's dock failure is **collateral, not intrinsic** — B's own code path is exonerated as the
  source of the throw (consistent with: exactly one console error, whose component stack names only
  `SessionProgressBar`; B's own try/catch logged nothing; B's registration renders fine).
- Combined with the render-tree note, it pins the mechanism: A's crash trips the shared
  `DrawerErrorBoundary`, whose `null` fallback evicts B's entry.

What the experiment alone does **not** give you is the *why* (the kit reduction) — that comes from the
console TypeError plus the two contract diffs. Experiment + contracts + render tree together form the
complete causal chain.

### 2.2 What it does NOT prove

**Does it prove plugin B is bug-free on alpha.2? No.** It proves B's dock entry mounts and renders
chips on the paste path while A is disabled — i.e., B does not *crash* on alpha.2 in the exercised
states. It says nothing about:
- non-crashing misbehavior of B under alpha.2 (layout/ordering/scope changes, chip actions, multi-file
  edge states, session-switch behavior) that the quick toggle didn't exercise;
- B's other surfaces beyond what the maintainer happened to try;
- future alpha releases. "Renders when the co-tenant is disabled" ≠ "fully correct on alpha.2".
(It does, however, strongly evidence that B uses no removed kit props — confirmed statically:
`AttachmentChips` reads only its own injected state and **no standard-kit hooks at all**, so a kit
reduction cannot even reach its render path.)

**Does it prove the strip crash is the ONLY dock problem? No.** Two masking effects:
- While the boundary is in fallback, the whole dock subtree is `null` — any *other* dock tenant's
  failure would be invisible (no render, no error). React aborts the render pass at the first throw,
  so entries ordered **after** A never rendered at all; their own alpha.2 incompatibilities (the "…"
  in the render tree) would only surface **after** A is fixed. One visible error ≠ one broken entry,
  in general.
- The toggle only tests "A present vs absent"; it cannot detect problems that don't throw (wrong data,
  stale state, degraded styling) in any tenant.
In *this* incident the console lists exactly two unmounted entries and one error, so A-only is the
well-supported reading — but fixing A must be followed by re-checking the dock mount log for every
entry, not assumed.

### 2.3 Why reinstalling plugin B could never have helped

Reinstalling B replaces B's bytes — but B's bytes were never the problem. The causal chain is:
host kit changed → **A** destructures a removed prop → **A** throws in render → **shared** boundary
nulls the whole `input.dock` subtree → B's (perfectly healthy, freshly installed) entry is unmounted
along with the crash site. A fresh copy of B lands in the same eviction zone and is discarded before
it can render anything. No possible change to B's *installation state* touches any link in that chain.
This is the classic trap of co-tenant collateral: the visible symptom sits on the innocent plugin, so
effort is spent on the wrong artifact.

### 2.4 What is wrong with the colleague's "both plugins were hit" theory

The colleague's premise — "alpha.2 probably changed slot props" — is **correct**. The conclusion —
"both plugins use a removed prop, you got hit twice, fix both registrations" — is contradicted by
every piece of evidence:

1. **Exactly one render error**, and its component stack names only `SessionProgressBar` (plugin A).
   If B were independently hit by a missing prop, there would be a second TypeError naming B (or at
   least B's own try/catch output — it logged nothing).
2. **B statically cannot be hit by a kit reduction**: `AttachmentChips` uses **no standard-kit hooks
   at all**; it reads only its own injected state (`inject: sessionId => ({ remove, add })`). There
   is no removed prop in B's code path to trip over.
3. **The toggle experiment falsifies it**: B healed *immediately* with **zero changes to B** when A
   was disabled. A plugin that had itself lost a required prop does not recover because a co-tenant
   was switched off.
4. The theory mis-models the event as two independent failures; the evidence shows **one failure plus
   one collateral eviction** via the shared boundary.

Acting on the theory ("fix both plugins' slot registrations") would burn effort rewriting working code
in B — risking real bugs in the one plugin that is currently innocent — while leaving the actual
culprit untouched. Correct scope: fix plugin A (graceful degradation), and separately consider the
host-side isolation gap (§4).

---

## 3. The fix — corrected component with graceful degradation

### 3.1 Facts the fix is built on

- **On alpha.2, pending state is supplied by `useSessionStatus`** — `SessionStatus` carries
  `pendingInteraction` per session id (alongside `running`, `completionUnread`). It is the
  successor of the removed `useSessionPendingInteraction`.
- **What degrades on a host that supplies neither pending hook**: only the strip's **attention /
  pending highlight** (`data-pending`) — i.e., the own-session pending-kind indicator and the
  subagent pending surfacing (approvals/questions counts). That is an enhancement, not the strip's
  reason to exist.
- **What keeps working regardless**: running state text and fill bar, todos percent (`useProjection`),
  token usage chip, elapsed/ETA and turn derivation (`session`, `legacy` via `useConversation`),
  and the subagent **running** count (`useSessions`) — all present in both contracts.
- **Why the degradation must be silent, not throwing**: a render-phase throw does not stay local — via
  the shared `DrawerErrorBoundary` it evicts **every co-tenant** in `input.dock` and the `null`
  fallback persists until the next session switch (exactly this incident: a missing optional prop cost
  two plugins' UI for a whole session). A missing *optional signal* must shrink the feature set, never
  the blast radius. At most emit a one-time `console.debug`; never a render throw, never an error
  storm per render.

### 3.2 Corrected code

```tsx
/**
 * SessionProgressBar (fixed) — compatible with alpha.1 and alpha.2 standard kits,
 * degrades silently on hosts that supply neither pending hook.
 *
 * alpha.1 kit: useSessionPendingInteraction(map: ReadonlyMap<SessionId, SessionPendingInteraction>)
 * alpha.2 kit: useSessionStatus(map: ReadonlyMap<SessionId, SessionStatus>)  // .pendingInteraction
 * neither    : pending/attention highlight is dropped; everything else keeps working.
 */

type PendingLike = { kind: string | null | undefined }
type PendingMap = ReadonlyMap<SessionId, PendingLike>
const EMPTY_PENDING: PendingMap = new Map()
const NO_SUB_PENDING = { approvals: 0, questions: 0 }

/** Normalize SessionStatus.pendingInteraction (shape may be kind-string or object) to a kind. */
function pendingKindFromStatus(status: SessionStatus | undefined): string | null {
  const p = (status as { pendingInteraction?: unknown } | undefined)?.pendingInteraction
  if (p == null || p === false) return null
  if (typeof p === 'string') return p
  if (typeof p === 'object' && 'kind' in (p as Record<string, unknown>)) {
    const k = (p as { kind?: unknown }).kind
    return typeof k === 'string' ? k : null
  }
  return p === true ? 'unknown' : null
}

export type SessionProgressBarProps =
  import('@deepseek-ai/dsh-client-ui-slots').PropsRuntime<'conversation.input.dock'>
  & PropsLocale<'progress'>
  & {
    // Optional across host versions — never assume presence:
    useSessionPendingInteraction?: SnapshotSelectorHook<PendingMap>
    useSessionStatus?: SnapshotSelectorHook<ReadonlyMap<SessionId, SessionStatus>>
  }

export function SessionProgressBar({
  session, sessionId, t, useConversation, useProjection, useSessions,
  useSessionPendingInteraction, useSessionStatus,
}: SessionProgressBarProps) {
  // ---- All hooks FIRST, unconditionally (stable hook order across renders; the
  // original excerpt's early-return-before-hooks was a latent rules-of-hooks bug
  // if `session` ever toggled null → defined).

  const chat = useConversation(conversation => conversation.views.get('chat'))
  const todos = useProjection('todos')
  const byId = useSessions(s => s.byId)

  // Feature-detect the pending source. The branch depends ONLY on which kit the
  // host supplies — invariant for the lifetime of the app instance — so the
  // hook sequence stays identical across every re-render on a given host.
  const hasLegacyPendingHook = typeof useSessionPendingInteraction === 'function'
  const hasStatusHook = typeof useSessionStatus === 'function'

  const legacyPending = hasLegacyPendingHook
    ? useSessionPendingInteraction!(interactions => interactions)
    : null
  const statusMap = !hasLegacyPendingHook && hasStatusHook
    ? useSessionStatus!(statuses => statuses)
    : null

  const pendingAvailable = legacyPending !== null || statusMap !== null

  // Normalize alpha.2's SessionStatus map into the alpha.1 pending-map shape so the
  // downstream subagent walk is unchanged.
  const pendingBySession: PendingMap = useMemo(() => {
    if (legacyPending) return legacyPending
    if (!statusMap) return EMPTY_PENDING
    const out = new Map<SessionId, PendingLike>()
    for (const [id, st] of statusMap) out.set(id, { kind: pendingKindFromStatus(st) })
    return out
  }, [legacyPending, statusMap])

  // One-time, non-fatal breadcrumb — silent to the UI, not silent to the developer.
  useEffect(() => {
    if (!pendingAvailable) {
      console.debug('[dsh-ui-progress] host supplies no pending hook; attention highlight disabled')
    }
  }, [pendingAvailable])

  // Guard AFTER hooks: render output may bail, hook order may not.
  if (session === undefined || session === null) return null

  const legacy = chat?.legacy ?? EMPTY_LEGACY
  const toolName = runningTool(legacy)
  const running = session.running
  // ... percent / turn / elapsed / eta derivation unchanged (they never touched the pending kit) ...

  // Attention state — the ONLY part that degrades:
  const ownPending = pendingAvailable
    ? pendingKindOf(pendingBySession.get(sessionId)?.kind)
    : null
  const subPending = pendingAvailable
    ? subagentPendingState(byId, pendingBySession, sessionId)
    : NO_SUB_PENDING
  const pending = ownPending !== null || subPending.approvals > 0 || subPending.questions > 0

  // Background state — unaffected: useSessions exists in both kits.
  const subRunning = subagentRunningCount(byId, sessionId)

  return (
    <div className={css.bar} data-pending={pending || undefined}>
      {/* state text, fill bar, todos percent, token chip, elapsed/eta — all unchanged */}
    </div>
  )
}
```

Plus tenant self-isolation at registration (see §4):

```tsx
/** Plugin-owned boundary: any future crash dies HERE, not at the shared dock boundary. */
class EntryErrorBoundary extends React.Component<
  { children: React.ReactNode }, { failed: boolean }
> {
  state = { failed: false }
  static getDerivedStateFromError() { return { failed: true } }
  componentDidCatch(err: unknown) {
    console.warn('[dsh-ui-progress] entry render failed; isolated', err)
  }
  render() { return this.state.failed ? null : this.props.children }
}

function ProgressDockEntry(props: SessionProgressBarProps) {
  return (
    <EntryErrorBoundary>
      <SessionProgressBar {...props} />
    </EntryErrorBoundary>
  )
}

// Registration (plugin A's index.ts) — unchanged slot, wrapped component:
//   ctx.slots.inject('conversation.input.dock', () => ctx.slots.register(
//     { name: 'conversation.input.dock', id: 'progress', order: 20, locale: NS },
//     ProgressDockEntry,
//   ))
```

Note: `pendingKindFromStatus` is deliberately defensive about the exact shape of
`SessionStatus.pendingInteraction` (the sealed excerpt documents the field's existence, not its
type); in the real repo, type it against the alpha.2 `SessionStatus` declaration and normalize once.

---

## 4. Multi-tenant hygiene

### 4.1 What a dock TENANT should do so its own crash cannot take down co-tenants

1. **Ship your own per-entry error boundary** (the `EntryErrorBoundary` above). Never rely on the
   host's slot-level boundary as your containment: its fallback granularity is the whole slot, so any
   uncaught throw of yours evicts every co-tenant. With your own boundary, your worst case is
   "my entry renders nothing + a console warning".
2. **Never throw during render; degrade instead.** Feature-detect every optional/evolving kit prop
   (`typeof hook === 'function'`) before calling it; treat "host may not supply X" as the normal
   case across host alphas and fall back to reduced UI or `null`.
3. **Fail at setup, not at render, when a *required* capability is missing**: validate the kit during
   `inject`/`register` time and skip registration (with a loud log) rather than registering a
   component that will explode in the render pass. A missing entry is recoverable UI; a render crash
   is a slot-wide outage.
4. **Keep hook order unconditional** — no early returns before hooks (the original excerpt had this
   latent violation); no runtime-state-dependent hook branching. Compat branches may only key off the
   host kit, which is invariant per app instance.
5. **Type-check against the host contract you actually ship against** — CI should compile the plugin
   against current host `.d.ts` (both supported versions if claiming a range), and the manifest
   should declare the supported host range. The prebuilt junction-linked bundle is precisely what let
   a removed prop reach production unnoticed; the compiler is the cheap early alarm.

### 4.2 What the HOST could change so one entry's failure isolates to that entry

- **Per-entry error boundaries inside list slots**: wrap each `DockEntry` in its own boundary
  (fallback `null`, log entry id + session), keeping the slot-level `DrawerErrorBoundary` only as
  the outer backstop. Then A's crash removes A's row; B's chips and every other tenant keep rendering.
  The host log should still name the evicted entry (it already does — "unmounted entries: …" — but
  today that list is slot-wide).
- **Standard-kit versioning / deprecation shims**: when a refactor folds one hook into another (here
  `useSessionPendingInteraction` → `useSessionStatus.pendingInteraction`), keep the old prop for a
  deprecation cycle as a thin adapter, and/or stamp the kit with a version marker tenants can probe;
  publish the kit diff + migration note with the release so prebuilt external plugins get a runway.
  Alpha-stage breaking changes are legitimate — shipping them *silently* to a six-plugin junction-linked
  ecosystem is what turned a one-line fix into a two-symptom mystery.

### 4.3 The trade-off the host faces

**Containment vs. visibility (fail-soft vs. fail-fast), plus overhead.** Per-entry boundaries and
compat shims make the shell resilient — one bad tenant can no longer black out the slot — but they
also *mask* failures: a broken entry silently disappears (users and plugin authors may never notice,
especially since the plugin's own logging, like B's try/catch here, sees nothing), and a partially
rendered dock (chips without progress strip) can look *more* confusing than an obviously broken one.
Compat shims similarly keep dead API surface alive, grow the kit, and delay cleanup. Boundaries also
add a wrapper component per entry — reconciliation/memory overhead and DevTools stack noise. The host
must choose where on the resilience↔loudness spectrum it sits; the sane default is isolate per entry
**and** compensate for the masking with loud, attributable host-side logging (entry id, error, session)
and short, documented deprecation windows for kit changes.

---

## 5. Verification (no host restart)

The host binary itself is unchanged — only plugin A's bundle changes, and plugins are **junction-linked
external client bundles loaded at page load**. So: rebuild plugin A's `lib/client.js` in place and
**hard-refresh the browser tab (Ctrl+F5)**. No npm/host process restart is needed (the restart in the
incident was for the host package upgrade, not for plugin byte changes; the disable-experiment already
demonstrated that a plain refresh re-evaluates the dock).

### 5.1 Verification checklist — both plugins' dock entries restored

1. **Console clean**: zero render errors; crucially **no** `[dsh:slots] input.dock boundary fallback
   active` line. Instead the slots log must show `input.dock` mounting **both** entries
   (`dsh-paste-input-dock`, `progress`) — and every other registered dock entry (the render tree's
   "…"): count mounted entries against registrations, since a masked third tenant would only surface
   now (§2.2).
2. **Strip restored**: the progress strip renders above the composer with running state, todos percent,
   token chip, elapsed/ETA.
3. **alpha.2 pending path works** (not just "no crash"): create a real pending interaction (e.g. a
   subagent approval/question) → the strip shows the attention state (`data-pending` present in DOM).
   This proves the `useSessionStatus` adapter supplies the pending state, i.e., the degraded feature
   is actually restored on alpha.2, not merely tolerated.
4. **Chips restored**: paste a file → chip rail renders above the composer; remove a chip → it
   disappears; attach button (`input.left`) still mounted and functional.
5. **Same session, no switch**: verify in the very session that had the fallback active (s-7f3a
   equivalent) on a fresh page load — do not let a session-switch boundary reset fake success.
6. **Degradation mode**: unit/story render of `SessionProgressBar` with a mocked kit lacking **both**
   pending hooks → core fields render, no `data-pending`, no throw, one debug log. Also a mock with
   only the alpha.1 hook and only the alpha.2 hook → pending works in both.
7. **Hook-order regression**: transition the slot through `session` null → defined (session switch) →
   no "Rendered more hooks than during the previous render" error (guards the moved early-return).

### 5.2 The regression the verification must cover for plugin B specifically

**Assert B's rendered output, not B's silence.** This incident's lesson is that B fails *silently* when
it is collateral: unmounted by the boundary, its own code runs nothing and logs nothing — "no errors
from B" was true at the exact moment B was completely broken. So the B-specific regression suite must
check, end-to-end and with **B's code untouched** (it must not be "fixed" or reinstalled — any diff to
B is out of scope and itself a red flag):

- the slots mount log lists `dsh-paste-input-dock` as **mounted** (positive assertion, every load);
- paste → chips **visibly render** (single file, multiple files), chip remove works, and the rail
  survives a session switch and switch-back (boundary reset path);
- chips render with plugin A both enabled and disabled (proves B's independence from the co-tenant,
  the inverse of the maintainer's experiment);
- optionally, as a containment drill: in a scratch build, re-break A (force the old direct call) and
  confirm the failure mode is understood and logged — with plugin A's new `EntryErrorBoundary` in
  place, B's chips must now **survive A's crash**, which is the direct regression test of the
  isolation fix itself.

---

## Summary (one paragraph)

Alpha.2's multi-instance refactor removed `useSessionPendingInteraction` from the
`conversation.input.dock` standard kit (pending state folded into the new `useSessionStatus`).
Plugin A's prebuilt `SessionProgressBar` still destructured and called the removed hook →
`TypeError` in render → the slot's single shared `DrawerErrorBoundary` (fallback `null`, per-slot
not per-entry) unmounted the whole dock, evicting innocent co-tenant plugin B's chip rail; B's attach
button survived because it lives in a different slot with a separate boundary. The disable-experiment
proves A is the necessary cause and B is collateral, but proves neither that B is bug-free on alpha.2
nor that A was the dock's only latent problem; reinstalling B was futile because B was never broken;
the colleague's "both were hit" theory contradicts the single A-named error, B's zero kit-hook usage,
and the instant recovery with B untouched. Fix: feature-detect the pending hook
(`useSessionPendingInteraction` → `useSessionStatus` → silent degradation of only the attention
highlight), never throw in render, wrap your own entry in a private error boundary; host-side, add
per-entry boundaries and version/deprecate kit changes — accepting the trade-off that isolation masks
failures unless paired with loud attributable logging. Verify by rebuilding A and hard-refreshing
(no host restart), asserting both entries mounted, pending highlight functional via `useSessionStatus`,
chips end-to-end in the same session — with positive render assertions for B, because B fails silently.
