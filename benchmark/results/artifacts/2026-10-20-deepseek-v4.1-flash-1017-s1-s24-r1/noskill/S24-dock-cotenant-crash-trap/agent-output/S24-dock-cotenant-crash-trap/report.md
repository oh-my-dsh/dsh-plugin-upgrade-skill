# S24 · The Dock That Vanished Together — post-mortem, fix and isolation plan

Scope: read-only analysis of the evidence pack under `fixture/`. Nothing in the fixture was modified; no
migration, install, network call, or git command was executed.

## 0. Verdict in one table

| Question | Answer |
| --- | --- |
| Which plugin fails | **Plugin A** — the session-progress plugin, component `SessionProgressBar` (bundle `plugin://dsh-external/dsh-ui-progress`, lib/client.js:219) |
| Exact failing call | `useSessionPendingInteraction(interactions => interactions)` — the local binding is `undefined`, so it is an invocation of `undefined` |
| Why now | alpha.2's standard kit **removed `useSessionPendingInteraction`** and replaced it with `useSessionStatus` (+ `useSessionRetainInfo`). A's prebuilt bundle was compiled against the alpha.1 .d.ts, so the prop is simply absent at runtime |
| Why B vanishes too | React error propagation + **boundary granularity**: `DockEntry` has no boundary of its own; the nearest one is `DrawerErrorBoundary name="input.dock"`, which wraps the **whole dock list**. A's throw is caught there and its fallback is `null` for the entire subtree — so B's `dsh-paste-input-dock` entry is unmounted as collateral |
| Why the attach button survives | It lives in a **different slot** (`conversation.input.left`) under a **different boundary instance** (`name="input.left"`). Slot partition = boundary partition |
| Actual number of bugs | **One** throw, two symptoms. "Exactly one render error" is first-error-wins artefact, not a bug census |

---

## 1. Culprit attribution

### 1.1 The failing plugin and the exact call

The console line is unambiguous about both the component and the frame:

- `Uncaught TypeError: useSessionPendingInteraction is not a function` at
  `SessionProgressBar (…/dsh-ui-progress/lib/client.js:219:41)`.
- The React component stack confirms the throwing owner is `<SessionProgressBar>` (frame 201), sitting under
  `DockEntry` → `DrawerErrorBoundary` → `InputDock` — i.e. plugin A's dock entry, slot id `progress`.

In the source excerpt the call is the `useSessionPendingInteraction` destructured from
`PropsRuntime<'conversation.input.dock'> & PropsLocale<'progress'>` and invoked in the "attention state"
block (excerpt line 24, compiled to 219:41):

~~~tsx
const pendingBySession = useSessionPendingInteraction(interactions => interactions)
const ownPending  = pendingKindOf(pendingBySession.get(sessionId)?.kind)
const subPending  = subagentPendingState(useSessions(s => s.byId), pendingBySession, sessionId)
~~~

It is a **bare call**, not an optional call and not feature-detected: `props.useSessionPendingInteraction` is
`undefined` on alpha.2, and `undefined(...)` raises `TypeError`. Note this happens **after**
`useConversation` / `useProjection` / `useSessions` have already run, which is why React classifies it as a
render error of the whole component rather than a hook-order warning.

### 1.2 Why *now* — the standard-kit reduction across the two contracts

Diffing the two sealed contract excerpts, `SessionStandardProps` for `conversation.input.dock`:

| Standard prop | alpha.1 | alpha.2 | note |
| --- | --- | --- | --- |
| `useConversation` | yes | yes | unchanged |
| `useSessions` | yes | yes | unchanged |
| `useSessionPendingInteraction` | yes (`Map<SessionId, SessionPendingInteraction>`) | **removed** | the prop A calls |
| `useSessionStatus` | no | **new** (`Map<SessionId, SessionStatus>`, carries `running / completionUnread / pendingInteraction`) | the designated successor for the pending signal |
| `useSessionRetainInfo` | no | new | reference counts (`retainedBy.mainView`); unrelated to this bug |
| `useProjection` / `useInput` / `inputActions` | yes | yes | unchanged |

The alpha.2 header also names the cause of the churn: the standard props are now the conversation slots
contract **merged with `GlobalStandardProps` after the multi-instance refactor**. The pending map was folded
into a broader per-session `SessionStatus` record; the old standalone hook did not survive the merge.

So the reduction is: *one removed prop, one added prop carrying a superset of the information.* A's failure
is the classic **prebuilt bundle vs. moved contract** mismatch: the plugin's client bundle was compiled (and
its types resolved) against alpha.1, so TypeScript's guarantee evaporated the moment the host stopped handing
the prop over. Nothing in the host "broke" A's code; the host stopped supplying a kit item A assumed was
permanent. Rebuilding A against the alpha.2 .d.ts would have turned this into a compile error at build
time — the real reason it shipped silently, since a junction-linked external plugin is not type-checked by
the host install.

### 1.3 Why the innocent co-tenant's entry disappears — the mechanism

Chain, in order:

1. A's `DockEntry order:20` renders `SessionProgressBar`; the component throws during render.
2. `DockEntry` **adds no boundary of its own** (render-tree note, last line). The throw therefore keeps
   unwinding past the co-tenant's `DockEntry` and past `InputDock`'s child list until it meets
   `DrawerErrorBoundary name="input.dock"`.
3. That boundary calls `getDerivedStateFromError` and renders its fallback, which is **`null`** — but the
   boundary encloses *the whole list*, not the offending entry. React discards the entire subtree under the
   boundary, including entries that had committed successfully.
4. Console confirms the scope explicitly: `[dsh:slots] input.dock boundary fallback active (session s-7f3a);`
   `unmounted entries: dsh-paste-input-dock, progress`.

So B never rendered, never threw, and never hit its own `try/catch` — it was **unmounted by an ancestor**,
which is exactly why its catch block logged nothing. The boundary also **latches** (it resets only on the
next session switch), so the dock stays empty for the rest of the session; that is why "the paste toast did
not reappear after the first attempt" — the dock subtree no longer exists to fail again.

**Name for the mechanism:** *co-tenant eviction by shared error-boundary scope* — one tenant's render fault
nulls the sibling list because isolation is per-slot, not per-entry. The blast radius is the slot, not the
component.

### 1.4 Why the attach button survives while the chips do not

From `dock-render-tree.md`:

- `InputLeft` wraps plugin B's `dsh-paste-input-button` **in its own** `DrawerErrorBoundary name="input.left"`.
- `InputDock` wraps B's `dsh-paste-input-dock` **and** A's `progress` inside the *same*
  `DrawerErrorBoundary name="input.dock"`.

Two consequences:

1. The button is in a different slot, therefore under a different boundary instance. A's throw never
   crosses `input.left`'s boundary, so the button is untouched — and the console shows it mounted:
   `[dsh:slots] input.left: 1 entry mounted (dsh-paste-input-button)`.
2. The chips are in the same slot as the failing entry, and the same boundary, so they die with it.

This is why the symptom looks like "two broken plugins": plugin B's two surfaces have different failure
domains. The button's survival is **not** evidence that B is healthy — only that `input.left` was not on the
throw path.

---

## 2. The experiment: what it proves, what it does not

The experiment: disable plugin A → refresh → B's chips come back immediately; re-enable A → chips gone.

### 2.1 What it proves

- **Necessity and sufficiency of A's presence.** With A mounted the dock list dies; with A removed it lives.
  Combined with the single `SessionProgressBar` stack, this is a clean A/B control: the variable is "plugin A
  is mounted in `conversation.input.dock`", the response is "the whole dock list is present or null".
- **That the fault is upstream of B.** B's chips restore without any change to B, so B's own code and
  registration are not on the critical path. This is the decisive correction to the "two plugins broke"
  reading.
- **That the mechanism is shared-scope eviction, not inter-plugin communication.** Disabling A does not
  repair B; it only removes the throw that nulled the common ancestor. Nothing "kills" B — B is simply
  inside the discarded subtree.
- It is *consistent* with the boundary diagnosis and inconsistent with any theory in which B throws (a
  B-side throw would null the same list even with A disabled — the chips would still be gone).

### 2.2 What it does not prove

1. **Not that plugin B is bug-free on alpha.2.** It proves only that B's dock entry renders once it is
   allowed to render. B escapes this particular contract change because its dock entry reads **no
   standard-kit hooks at all** — only its own `inject: sessionId => ({ remove, add })` state — so a removed
   prop is a non-event for it. That says nothing about B's other risks: ordering/placement in the new dock
   list, CSS/class churn, its `input.left` button under the merged kit, its paste-interception path, its own
   failure handling, or a *second* contract change not exercised by a single paste.
2. **Not that the strip crash is the only dock problem.** The evidence engine here is *first error wins*: the
   boundary nulls the whole list on the first throw, so entries ordered after `progress` (`order: 20`) are
   never mounted and **their latent errors cannot be logged**. "Exactly one render error" is therefore a
   property of the boundary, not a census. Likewise A's failure is only the *first* frame that throws:
   `session.running`, the `chat?.legacy` read and the projection shape are all still alpha.1-shaped
   assumptions that were never reached. A second error inside A is plausible and would surface only after
   the 219 fix.
3. It does not establish *why* — the maintainer's own note ("no idea why a progress bar can take down an
   attachment chip rail") is answered by the render tree, not by the experiment.

### 2.3 Why reinstalling plugin B could never have helped

- The failure is in **A's** render, against a **host** contract. Reinstalling B replaces B's bytes with the
  same bytes (same mirror tag) and re-links the same junction; neither the throw site nor the boundary
  scope changes. The observable is identical — and was.
- B was never unmounted for a B reason, so no B-side remediation — reinstall, rebuild, cache clear — can
  affect it. Even a *fixed* B would be nulled by A's boundary.
- Worse, the boundary **latches until a session switch**, so reinstall + refresh reproduces the same null
  list for a reason unrelated to B's install state.

### 2.4 What is wrong with the colleague's "both plugins were hit" theory

The colleague hypothesises: alpha.2 changed slot props → both plugins consume a removed prop → two
independent bugs → fix both registrations. Against the evidence:

- The diff removed **one** prop. Only A consumed it. B's dock entry consumes **zero** kit hooks, so there is
  no prop for B to lose; its registration is untouched by the contract change (`slots.register` shape is
  identical in both excerpts).
- "Two symptoms" is not "two faults": one error, one throw site, one component, one boundary. The chips'
  disappearance is *derived* from A's failure, as the disable experiment shows.
- If both were independently broken, disabling A would have restored nothing — B would still have thrown
  into the same boundary and the dock would still be null. The experiment falsifies the theory directly.
- Acting on it would mean editing B's registration for a contract it does not use: risk without benefit, and
  it would mask the real fix.

---

## 3. The fix — graceful degradation for the removed seat

Design rules applied: (a) never *call* a kit hook that may be absent; (b) resolve the capability from the
props themselves, not from a version string; (c) branch on a host-build constant **once** and give each
branch its own component so hook order is fixed per mount; (d) if neither pending source exists, render the
strip without the attention feature instead of throwing.

~~~tsx
// plugin-a/src/SessionProgressBar.tsx
// Rebuilt against @deepseek-ai/dsh-client-ui-slots 0.1.6-alpha.2 (post multi-instance refactor).
import type { PropsRuntime } from '@deepseek-ai/dsh-client-ui-slots'
import type { PropsLocale } from '@deepseek-ai/dsh-client-ui-locale'
import type {
  SessionId, SessionStatus, SessionPendingInteraction,
} from '@deepseek-ai/dsh-client-ui-session'

type DockKit = PropsRuntime<'conversation.input.dock'>
export type SessionProgressBarProps = DockKit & PropsLocale<'progress'>

type PendingMap = ReadonlyMap<SessionId, SessionPendingInteraction>
type StatusHook = (selector: (s: ReadonlyMap<SessionId, SessionStatus>) => unknown) => any
type LegacyPendingHook =
  (selector: (p: ReadonlyMap<SessionId, SessionPendingInteraction>) => unknown) => any

const EMPTY_PENDING: PendingMap = new Map()
const EMPTY_SUB = { approvals: 0, questions: 0 }

/**
 * Pure capability probe - NO hooks here. It runs from props once per mount, so it is
 * stable for the lifetime of a host build. A host with neither hook is a supported
 * configuration, not an error.
 */
function pendingSource(kit: DockKit): 'status' | 'legacy' | 'none' {
  const k = kit as Partial<DockKit> & Record<string, unknown>
  if (typeof k.useSessionStatus === 'function') return 'status'             // alpha.2+
  if (typeof k.useSessionPendingInteraction === 'function') return 'legacy' // alpha.1
  return 'none'                                                           // future / unknown host
}

/**
 * Entry component: dispatches on the probed capability. Each branch is a separate
 * component, so every branch calls a fixed number of hooks in a fixed order - no
 * conditional hook calls inside a single component.
 */
export function SessionProgressBar(props: SessionProgressBarProps) {
  switch (pendingSource(props)) {
    case 'status':
      return <StripWithStatus {...props}
        useStatus={(props as any).useSessionStatus as StatusHook} />
    case 'legacy':
      return <StripWithLegacyPending {...props}
        useLegacy={(props as any).useSessionPendingInteraction as LegacyPendingHook} />
    default:
      return <StripBody {...props} pendingBySession={EMPTY_PENDING} pendingDegraded />
  }
}

/** alpha.2 path: per-session SessionStatus carries pendingInteraction. */
function StripWithStatus({
  useStatus, ...props
}: SessionProgressBarProps & { useStatus: StatusHook }) {
  const status = useStatus(s => s) as ReadonlyMap<SessionId, SessionStatus> | undefined
  return <StripBody {...props} pendingBySession={toPendingMap(status)} />
}

/** alpha.1 path: kept only as a courtesy for a host that still hands the old hook over. */
function StripWithLegacyPending({
  useLegacy, ...props
}: SessionProgressBarProps & { useLegacy: LegacyPendingHook }) {
  const pending = useLegacy(p => p) as PendingMap | undefined
  return <StripBody {...props} pendingBySession={pending ?? EMPTY_PENDING} />
}

/** Flatten SessionStatus -> the pending map the strip's helpers expect. Tolerant of shape drift. */
function toPendingMap(
  status: ReadonlyMap<SessionId, SessionStatus> | undefined,
): PendingMap {
  const out = new Map<SessionId, SessionPendingInteraction>()
  if (!status) return out
  for (const [id, st] of status) {
    const p = (st as any)?.pendingInteraction
    if (!p) continue
    // A host may expose the flag rather than the record; normalise to { kind }.
    out.set(id, (typeof p === 'object' ? p : { kind: 'unknown' }) as SessionPendingInteraction)
  }
  return out
}

interface StripBodyProps extends SessionProgressBarProps {
  pendingBySession: PendingMap
  /** True only when the host supplies no pending source at all. */
  pendingDegraded?: boolean
}

function StripBody({
  session, sessionId, t, useConversation, useProjection, useSessions,
  pendingBySession, pendingDegraded = false,
}: StripBodyProps) {
  if (session === undefined || session === null) return null

  // Everything below is unconditional and present in every host build.
  const chat = useConversation(c => c.views.get('chat'))
  const legacy = chat?.legacy ?? EMPTY_LEGACY
  const todos = useProjection('todos')
  const byId = useSessions(s => s.byId)

  const running = session.running ?? false
  const toolName = runningTool(legacy)

  // Attention state: silent zero when the host cannot tell us; never a throw.
  const ownPending = pendingDegraded
    ? null
    : pendingKindOf(pendingBySession.get(sessionId)?.kind)
  const subPending = pendingDegraded
    ? EMPTY_SUB                                    // "unknown", rendered as "no badge"
    : subagentPendingState(byId, pendingBySession, sessionId)
  const pending = ownPending !== null || subPending.approvals > 0 || subPending.questions > 0

  // Background state still works: derived from the session index alone.
  const subRunning = subagentRunningCount(byId, sessionId)

  return (
    <div
      className={css.bar}
      data-pending={pending || undefined}
      data-pending-degraded={pendingDegraded || undefined}
    >
      {/* state text, fill bar, todos percent, token chip, elapsed/eta - unchanged */}
    </div>
  )
}

// Registration unchanged:
//   ctx.slots.inject('conversation.input.dock', () => ctx.slots.register(
//     { name: 'conversation.input.dock', id: 'progress', order: 20, locale: NS },
//     SessionProgressBar,
//   ))
~~~

### 3.1 Which hook supplies the pending state on alpha.2

**`useSessionStatus`** — the new `SnapshotSelectorHook<Map<SessionId, SessionStatus>>` in the alpha.2 kit.
Read `status.get(sessionId)?.pendingInteraction` for this session, and walk the same map for the
subagent-subtree ids obtained from `useSessions(s => s.byId)`. The old `useSessionPendingInteraction` map is
gone; `SessionStatus` is its superset (it also carries `running` and `completionUnread`, so the strip may in
future drop its reliance on the `session` prop for the running flag too). `useSessionRetainInfo` is *not* a
substitute — it is reference-count bookkeeping, not interaction state.

### 3.2 What degrades, and what keeps working, on a host that supplies neither hook

Degrades (silently, to "unknown / absent"):

- The **attention affordance**: the `data-pending` marker and its styling (highlight, pulse) — the "this
  session, or a subagent under it, is waiting on a human approval/question" cue.
- The **subagent pending surfacing** for approvals/questions counts. The strip exists partly to surface
  subagent rows the sidebar hides; on such a host it reports zero, which is honest about being unknown
  (hence the separate `data-pending-degraded` attribute rather than a fake "no pending" style).

Keeps working — the whole reason the strip is resident:

- running / idle state text and fill bar, the running tool name
- todos percent from `useProjection('todos')`
- token usage chip, elapsed / ETA
- background state when the main conversation is idle but subagent sessions keep executing (derived from
  `useSessions`, unchanged in both contracts)
- its own dock placement (`id: 'progress'`, `order: 20`), session switching, locale, unmount/remount

### 3.3 Why the degradation must be silent rather than throwing

Because the cost of being loud is paid by **other tenants**. A throw from this entry does not stop at this
entry: `DockEntry` has no boundary, so the error crosses into the slot-level
`DrawerErrorBoundary name="input.dock"`, whose `null` fallback removes *every* dock entry — today that is
precisely how B's chip rail disappeared. Add the latching behaviour (reset only on session switch) and one
throw costs the dock for the rest of the session.

Second, the information at stake is *non-essential*. "Is someone waiting for me?" is an enhancement on top
of a working strip; the correct failure semantics for an optional signal is "absent", not "abort the
subtree". Third, the host cannot attribute per-entry failures today, so a loud failure is indistinguishable
from a broken dock — the worst diagnostic outcome. If visibility is wanted, emit one dev-only
`console.warn` (guarded, once per mount) or a diagnostics counter — never a throw.

A one-line stopgap (`useSessionPendingInteraction = () => EMPTY_PENDING` in the destructuring) also silences
it, but leaves the strip permanently pending-blind on alpha.2: a hotfix, not the fix. The permanent guard is
to rebuild against the alpha.2 types, where the removed prop is a compile error.

---

## 4. Multi-tenant hygiene

### 4.1 What a dock tenant should do so its own crash cannot take down co-tenants

1. **Own your blast radius.** Wrap the entry's render in a local boundary (a small class component or a
   `SlotEntryBoundary` helper) that renders `null` / a one-line placeholder *inside your own entry*, so a
   throw is contained at your component and never reaches the slot boundary. Register the boundary as the
   entry, with the real component inside it.
2. **Feature-detect kit hooks, never assume them.** Probe the standard props once per mount
   (`typeof props.useX === 'function'`), keep the decision stable, and branch to a component that calls only
   the hooks that exist. Never call `props.useX()` on a prop you have not probed.
3. **Declare the host range you support** (peer range on `dsh-client-ui-slots` / `dsh-client-ui-session`) and
   treat a moved kit item as a capability change, not a host bug. Rebuild on every host minor bump; a
   junction-linked plugin is not type-checked by the host install, so make the build the gate.
4. **Fail open on optional signals, closed on data.** Missing pending/usage/retain info → render without it.
   Malformed selector output → default to an empty map, not a throw. Same for projections.
5. **No render-time side effects or unguarded I/O**; if you must parse (the chips' "fold scan"), catch, log
   once, and render the last good state.
6. **Report, don't explode**: emit a diagnostics/metric signal on degraded mode so the host can surface
   "entry X degraded" instead of an unexplained gap.

### 4.2 What the HOST could change so one entry's failure isolates to that entry

- **Wrap each `DockEntry` in its own boundary**, inside the list, keyed by entry id:
  a per-entry `DrawerErrorBoundary` whose `name` includes the id and whose reset key is
  `id + hostVersion`; keep the slot-level boundary as a last resort for failures in the list machinery
  itself.
- **Make the list resilient**: render the surviving entries, and report the failed id through the existing
  `[dsh:slots]` diagnostics channel — the same line that currently prints "unmounted entries" could print
  "entry X failed, others mounted".
- **Fix the reset semantics**: reset on entry-id / host-version change, not only on session switch, so one
  transient throw does not latch for the whole session.
- Optionally, **surface entries**: a visible "entry unavailable" affordance (small icon / slot placeholder)
  instead of a silent gap, and expose the `order`/`id` of failed entries to the plugin manager.
- Optionally, **capability shims**: the host could keep supplying removed kit hooks as deprecated no-op
  adapters for one minor version, with a dev-time warning. This converts a hard crash into a warning and
  gives external plugins a migration window.

### 4.3 The trade-off the host faces

Per-entry boundaries buy isolation and cost **observability, weight, and policy surface**:

- **Silent degradation vs. loud failure.** A per-entry `null` fallback turns "the dock is visibly broken"
  into "one entry is inexplicably missing". You trade a crash (obvious, reportable) for a gap (invisible,
  unreportable) unless you add failed-entry telemetry and a user-visible affordance. Isolation without
  reporting hides bugs.
- **Cost per entry.** Every boundary is an extra class component, an extra fiber and an error-handling path
  in a hot, frequently re-rendered slot; on a six-plugin dock that is small but not free, and it multiplies
  across list slots.
- **Reset/keying semantics.** Reset too eagerly and entries remount, losing local state (e.g. the chips'
  pending fold); too lazily and one transient error latches the entry for the session. The host must define
  reset keys per slot — a new contract surface to get right.
- **Error masking.** Per-entry boundaries can mask genuine plugin bugs during development, so pair them with
  a dev-mode rethrow / "show errors" toggle.
- **Deprecation shims** (the alternative) avoid the trade-off but add a compatibility matrix the host must
  maintain and eventually delete; the cost moves from runtime to maintenance.

---

## 5. Verification

### 5.1 Restoring both entries without a host restart

The host process (`@deepseek-ai/dsh` 0.1.6-alpha.2, npm global) does **not** need restarting: both plugins
are external client bundles, re-imported on plugin reload / page refresh, and the dock tree is rebuilt from
the slot registry on mount.

1. **Rebuild plugin A against alpha.2 types** (`pnpm build` in the plugin repo, or the dev watcher). The
   build must now *fail* if any alpha.1-only kit member is still referenced — that is the regression gate
   for this class of bug. Keep the pinned `.d.ts` in step with the installed host minor.
2. **Reload plugin A's client entry** through the plugin reload/HMR path (the junction link means the new
   `lib/client.js` is picked up without reinstalling and without restarting `dsh web`). If the reload path is
   unavailable, a browser hard refresh after the rebuild re-instantiates the bundles — still no host restart.
3. **Clear the latched fallback** if it was already tripped: switch session once (the `DrawerErrorBoundary`
   reset trigger), then switch back. Verify on the same session that the strip is visible.
4. **Console assertions** — the decisive ones, because they name the boundary rather than the symptom:
   - **absent**: `[dsh:slots] input.dock boundary fallback active …`
   - **absent**: `Uncaught TypeError: useSessionPendingInteraction is not a function`
   - **present**: `input.dock` with **both** entries mounted — `progress` (order 20) and
     `dsh-paste-input-dock` (order 5) — in that relative order; `input.left` still shows
     `dsh-paste-input-button`.
5. **DevTools component view**: `<Composer>` → `<InputDock>` → boundary → both `<DockEntry>` children
   present; the strip renders bar / text / todos / token chip. Then switch sessions twice more to confirm it
   does not re-latch.

### 5.2 The plugin-B regression the verification must cover

The trap in this incident is that a *B-passing* check can pass for the wrong reason. With **plugin A
enabled** and the strip live, verify:

1. **Chips render at all**: paste a file → the chip rail appears above the composer with one chip. This is
   the exact broken symptom and it must pass while A is mounted — the maintainer's disable-experiment must
   not become the acceptance criterion.
2. **Multi-file paste / drop** → N chips, correct order, remove-one works, clear-all works; the strip stays
   mounted throughout and no boundary-fallback line appears.
3. **Pending-interaction state**: while the session has a live approval/question (and separately, while a
   *subagent* under it is pending), paste a file. This is the only state that exercises the new
   `useSessionStatus` path and the `data-pending` marker — the strip must re-render with `data-pending` set
   **and** the chips must still be there. A "fix" that restores the strip by dropping the pending feature
   passes step 1 and fails here.
4. **Degradation path**: simulate a host with neither hook (stub the props in a unit test, or render the
   entry with the kit minus both hooks) → the strip still renders (bar, todos, token chip),
   `data-pending-degraded` is set, **no throw**, and a co-tenant entry rendered as a sibling in the same
   boundary stays mounted.
5. **Co-tenant isolation test**: force a throw inside `SessionProgressBar` (dev-only prop) and assert the
   dock list is **not** nulled — B's chips and any other entries survive, and the failed id is reported.
   This is the direct regression for the eviction mechanism and holds whether the host adopts per-entry
   boundaries or the tenant adds its own.
6. **Ordering / placement**: `dsh-paste-input-dock` (order 5) stays above `progress` (order 20), and neither
   entry re-registers or duplicates after a reload (double registration would show two chip rails).

---

## Appendix · Evidence trail (one line per claim)

| Claim | Evidence |
| --- | --- |
| Throw site and component | `console-excerpt.txt` frame 219:41 + component stack (201) |
| Bare call, no feature detection | `plugin-a/SessionProgressBar-excerpt.tsx` L10-13, L24 |
| Prop removed in alpha.2 | `host-types/slots-contract-alpha1.d.ts` L10 vs `slots-contract-alpha2.d.ts` L11-14 |
| `useSessionStatus` successor semantics | `slots-contract-alpha2.d.ts` L11-12 |
| Whole-list null fallback + latch | `host-types/dock-render-tree.md` L25-27; `console-excerpt.txt` "unmounted entries" |
| `DockEntry` has no own boundary | `dock-render-tree.md` L27 |
| Button in a different slot / boundary | `dock-render-tree.md` L9-13; `plugin-b/dock-entry-excerpt.md` L7-11 |
| B uses no kit hooks / never threw | `plugin-b/dock-entry-excerpt.md` L22-25 |
| Disable experiment outcome | `tried-notes.txt` section 3 |
| Reinstall failure | `tried-notes.txt` section 1; `symptom-report.md` |
| Colleague's theory | `tried-notes.txt` "Colleague's theory" |
