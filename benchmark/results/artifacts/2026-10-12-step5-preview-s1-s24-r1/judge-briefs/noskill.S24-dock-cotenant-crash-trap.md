# JUDGE BRIEF · noskill.S24-dock-cotenant-crash-trap

## Criteria (sealed rubric)
- [culprit-attribution] (20pt) Use console-excerpt.txt plus the two slots-contract excerpts: plugin A (the progress strip) is the only crash; its unconditional useSessionPendingInteraction(...) call throws TypeError at render because alpha.2 standard props dropped useSessionPendingInteraction (replaced by useSessionStatus; useSessions stays). Do not require claiming useSessions was removed. Plugin B renders no standard-kit hooks and throws nothing. Do not credit answers blaming plugin B or treating the two symptoms as independent breakages.
- [cotenant-mechanism] (20pt) Explain the co-tenant damage via dock-render-tree.md: the input dock is one list slot whose entries mount under ONE shared DrawerErrorBoundary; a child render throw unmounts the whole boundary subtree, so B chips vanish with A strip. The attach button survives because conversation.input.left is a different slot under a different boundary. Cite the console follow-up or render-tree note; a generic error-boundary mention without the shared-subtree linkage earns partial.
- [experiment-reading] (20pt) Interpret tried-notes.txt: disabling A restoring B chips proves A caused the unmount (render-crash coupling) and B can render once freed; it does NOT prove B is fully alpha.2-compatible elsewhere, nor that A crash is the only dock defect. Reinstalling B could never help because B was never broken. The colleague theory that both plugins use a removed prop is false — B uses no standard-kit hooks.
- [degradation-fix] (20pt) Propose corrected component code: read pending state through useSessionStatus(...)?.pendingInteraction on alpha.2 (or pick whichever pending hook the host supplies) and never call a missing seat — optional chaining with stable empty fallbacks — so at worst only the pending indicators hide while running/todos/token/ETA keep working. Explain why degradation must be silent: a throwing dock tenant unmounts co-tenants, so a missing indicator is cosmetic while a throw is a multi-plugin outage. Guarding useSessions too is harmless but not required.
- [verification-and-hygiene] (20pt) Verify without host restart (plugin client bundles re-fetch on refresh): both entries render together; B regression covers paste/remove/re-paste with A enabled. Hygiene: tenants destructure defensively and may wrap their own entry in a local boundary; host could mount per-entry boundaries trading nesting/layout complexity for blast-radius isolation. Do not require executing this static fixture.

## Caps (score ceilings; judge returns each with triggered true/false)
- CAP [innocent-plugin-fix] ceiling=40 The final remedy fixes, rewrites, or reinstalls only plugin B (the attachment plugin), or asserts the two breakages are independent plugin-level bugs requiring two parallel fixes. Apply only to affirmative final advice or conclusions. Quoted, hypothetical or explicitly rejected bad examples do not trigger the cap; read the whole report.

## Candidate report(s)
#### FILE: S24-dock-cotenant-crash-trap/report.md

# S24 — The Dock That Vanished Together: co-tenant crash trap report

**Scope:** read-only analysis of the fixture evidence pack. Fixture untouched. One error, two symptoms, one boundary.

---

## 1. Culprit attribution

**Which plugin fails, at which exact call.** Plugin A — the session-progress plugin
(`dsh-ui-progress`, dock entry id `progress`, order 20). The failure is in
`SessionProgressBar` at the call site recorded in the console excerpt:

```
Uncaught TypeError: useSessionPendingInteraction is not a function
    at SessionProgressBar (plugin://dsh-external/dsh-ui-progress/lib/client.js:219:41)
```

which corresponds to line 24 of `plugin-a/SessionProgressBar-excerpt.tsx`:

```tsx
const pendingBySession = useSessionPendingInteraction(interactions => interactions)
```

The component destructures `useSessionPendingInteraction` from its props (the standard
kit) and calls it unguarded during `renderWithHooks` → `mountIndeterminateComponent`,
i.e. on the dock entry's first render. On alpha.2 that destructured member is
`undefined`, so the call throws `TypeError`. Nothing in plugin A changed; the ground
under it changed.

**Why now — the standard-kit reduction between the two contracts.** Diffing the sealed
contracts:

| alpha.1 `SessionStandardProps` (input.dock kit) | alpha.2 |
|---|---|
| `useConversation` | `useConversation` (unchanged) |
| `useSessions` | `useSessions` (unchanged) |
| **`useSessionPendingInteraction`** | **REMOVED** — split/reshaped |
| `useProjection` | `useProjection` (unchanged) |
| — | `useSessionStatus` (ADDED: `SessionStatus` = running, completionUnread, **`pendingInteraction`**) |
| — | `useSessionRetainInfo` (ADDED) |
| `useInput` / `inputActions` | unchanged |

The alpha.2 header states the reason: after the multi-instance refactor, the session
kit is *merged with* the `GlobalStandardProps` from `@deepseek-ai/dsh-client-ui-session`,
and in that merge `useSessionPendingInteraction` was removed from the kit — the
per-session pending-interaction view now rides inside `useSessionStatus`
(`ReadonlyMap<SessionId, SessionStatus>`, each status carrying `pendingInteraction`).
So the pending data still exists; the *access hook* was reduced out. Plugin A was built
against alpha.1 and still calls the reduced hook by name. Registration never validated
the kit, so the fault surfaced only at first dock render — exactly what the maintainer
saw after the upgrade + restart.

**Why the innocent co-tenant's dock entry disappears with it — the mechanism.**
The mechanism is **shared-boundary unwinding (per-slot error-boundary contamination,
not per-entry fault isolation)**. From `host-types/dock-render-tree.md`:

- Both entries — `dsh-paste-input-dock` (plugin B, order 5) and `progress`
  (plugin A, order 20) — are **children of the same** `<DrawerErrorBoundary
  name="input.dock">` wrapping the whole `InputDock` slot.
- "`DockEntry` itself adds no boundary of its own."

React error-boundary semantics: an exception during any child's render unmounts the
**entire subtree below that boundary** and renders its fallback (`null`). So when
`SessionProgressBar` threw, the boundary switched to fallback and unmounted *every*
entry in `input.dock` — including plugin B's chips, which never ran, never threw, and
have no bug. The host log is explicit (console-excerpt.txt):

```
[dsh:slots] input.dock boundary fallback active (session s-7f3a); unmounted
            entries: dsh-paste-input-dock, progress
```

The fault domain of a throw is the nearest enclosing boundary — here the *slot*, one
level too coarse. The strip's crash did not "target" plugin B; it took the whole dock
subtree down with it, and B's unmount was accidental collateral.

**Why the attach button in a different slot survives while the chips do not.**
The render tree shows the composer slots under **separate** boundaries:

```
<InputLeft><DrawerErrorBoundary name="input.left">
    <SlotEntry id="dsh-paste-input-button" />     ← plugin B, SURVIVED
  </DrawerErrorBoundary></InputLeft>
<InputDock><DrawerErrorBoundary name="input.dock">
    <DockEntry id="dsh-paste-input-dock" />       ← plugin B chips, UNMOUNTED
    <DockEntry id="progress" />                   ← plugin A, CRASHED
  </DrawerErrorBoundary></InputDock>
```

Plugin B registers two surfaces into two slots: the attach button in
`conversation.input.left` and the chips rail in `conversation.input.dock`. The chips
(unmountee) live under the boundary that caught the throw; the button lives under a
*sibling* boundary. A boundary failure is scoped strictly to its own subtree — it
cannot reach across and unmount a neighbouring boundary. Confirmed by
`[dsh:slots] input.left: 1 entry mounted (dsh-paste-input-button)`. Same plugin, two
slots, two opposite fates — proof that the blast radius was the boundary topology,
not the plugin.

## 2. The experiment

**What it proves.** Disabling plugin A and refreshing made B's chips return
immediately; re-enabling A took them away again. A single clean *toggle* with a
controlled, reproducible on/off relationship to the symptom:

1. The trigger of B's disappearance is **plugin A's dock entry being mounted at all**,
   not anything about plugin B.
2. Plugin B's chips rail is *individually healthy* on alpha.2 — given a dock without
   the crasher, it renders.
3. The causality is A's *render crash* (already pinned to the exact call by the
   console) propagating via the shared boundary; A-to-B is trigger, not target.

**What it does NOT prove.**

- **It does not prove plugin B is bug-free on alpha.2.** It proves only that in that
  one configuration (A disabled) B's chips render. B has other movable parts the
  experiment never exercised: its injected add/remove state paths, multi-file pastes,
  drops, and its `input.left` surface. "Renders fine here" ≠ "correct everywhere";
  absence of errors ≠ absence of latent incompatibilities.
- **It does not prove the strip crash is the ONLY dock problem.** While the boundary
  fallback is active, **no** `input.dock` entry renders — A's own strip included. Any
  second latent fault in another dock tenant of the six plugins is *masked* by that
  same fallback and cannot be observed until A is disabled. Likewise "no further
  errors" is confounded: after the boundary unmounts A, A never re-renders, so it
  cannot re-throw — the quiet console proves continuation, not cleanliness. And the
  experiment toggles one plugin, so it says nothing about dock tenants besides A and B.

**Why reinstalling plugin B could never have helped.** Three independent reasons:

1. **Wrong layer.** The failure is a co-tenant casualty: B's entry is unmounted by the
   *host's* slot-level `DrawerErrorBoundary` (in `dsh-client-ui-conversation`) when A
   throws. Reinstalling B replaces B's artifacts — the boundary that eats B's subtree
   is not part of plugin B and is not touched by a B reinstall.
2. **Wrong fault.** B's registration resolved fine, its code path threw nothing, its
   own try/catch logged nothing (tried-notes #2), and the single console error is
   inside A's component. There is no B-side defect to repair.
3. **No state change.** Even with a fresh B build, the running session `s-7f3a`'s
   boundary sits in fallback (it resets only on the next session switch, per the
   render-tree note). Mount outcome is unchanged until the *cause* is removed.

The symptom is caused by (A's throw × shared boundary). A reinstall of B zeroes out
neither factor.

**What is wrong with the colleague's "both plugins were hit" theory.**

- The console shows **exactly one** error and it is A's `TypeError`. "Hit twice"
  requires a second, independent failure in B — there is no B error to find.
- Mechanically impossible for this fault: B's dock entry **uses no standard-kit hooks
  at all** (dock-entry-excerpt.md). The kit reduction removed a kit member; a tenant
  that never touches the kit cannot be hit by a kit reduction.
- The toggle experiment contradicts it: if both had been independently broken by the
  upgrade, disabling A would not restore B (B's own hypothetical break would survive).
  B's failure is 100% derivative of A's crash — remove A, remove B's symptom, change
  nothing about B.
- The plan "fix both plugins' slot registrations" therefore ships effort on the wrong
  target, and worse, it can *mask* the real defect: the actual fixes are (a) make A
  degrade gracefully on the reduced kit and (b) make the dock isolate per entry — both
  of which "fix registrations on both plugins" does neither.

## 3. The fix

**Which hook supplies the pending state on alpha.2:** `useSessionStatus`
(`SnapshotSelectorHook<ReadonlyMap<SessionId, SessionStatus>>`) — per the alpha.2
contract, `SessionStatus.pendingInteraction` is the pending interaction formerly served
by the removed `useSessionPendingInteraction` map. The fix selects alpha.2's shape when
present, falls back to alpha.1's hook when present, and degrades silently otherwise.
The dispatcher wrapper keeps every hook branch fixed per mounted instance (and is keyed
on the detected source) so React's hook-order rules are never at risk:

```tsx
/**
 * SessionProgressBar (corrected): tolerant of the alpha.1 → alpha.2
 * standard-kit reduction. On alpha.2 the pending view is read from
 * useSessionStatus().pendingInteraction; on alpha.1 from
 * useSessionPendingInteraction(); on a host supplying neither, the strip
 * degrades silently — the dock's DrawerErrorBoundary is per-slot, so one
 * throwing entry unmounts every co-tenant entry with it.
 */

export type SessionProgressBarProps =
  import('@deepseek-ai/dsh-client-ui-slots').PropsRuntime<'conversation.input.dock'>
  & PropsLocale<'progress'>

type PendingSource = 'status' | 'legacy' | 'none'

function detectPendingSource(
  props: SessionProgressBarProps,
): PendingSource {
  if (typeof props.useSessionStatus === 'function') return 'status'
  if (typeof props.useSessionPendingInteraction === 'function') return 'legacy'
  return 'none'
}

export function SessionProgressBar(props: SessionProgressBarProps) {
  if (props.session === undefined || props.session === null) return null
  switch (detectPendingSource(props)) {
    case 'status':
      return <StripFromStatus key="src-status" {...props} />
    case 'legacy':
      return <StripFromLegacyPending key="src-legacy" {...props} />
    default:
      return <StripWithoutPending key="src-none" {...props} />
  }
}

// alpha.2 kit: pending interactions arrive per-session on the status map.
function toPendingIndex(
  statuses: ReadonlyMap<SessionId, SessionStatus>,
): ReadonlyMap<SessionId, SessionPendingInteraction> {
  const index = new Map<SessionId, SessionPendingInteraction>()
  for (const [sessionId, status] of statuses) {
    if (status && status.pendingInteraction != null) {
      index.set(sessionId, status.pendingInteraction)
    }
  }
  return index
}

function StripFromStatus(props: SessionProgressBarProps) {
  const basics = useStripBasics(props)
  const statuses = props.useSessionStatus!(statuses => statuses)
  const pendingBySession = toPendingIndex(statuses)
  const pending = attentionState(props.sessionId, pendingBySession).attention
  return <StripBody basics={basics} pending={pending} />
}

// alpha.1 kit (and any host still serving the old member): original source.
function StripFromLegacyPending(props: SessionProgressBarProps) {
  const basics = useStripBasics(props)
  const pendingBySession = props.useSessionPendingInteraction!(
    interactions => interactions,
  )
  const pending = attentionState(props.sessionId, pendingBySession).attention
  return <StripBody basics={basics} pending={pending} />
}

// Host supplies neither pending hook: attention indicator is silently absent.
// Running state, todos percent, token chip and elapsed/eta all keep working.
function StripWithoutPending(props: SessionProgressBarProps) {
  const basics = useStripBasics(props)
  return <StripBody basics={basics} pending={false} />
}

// Shared by all three variants: only unchanged kit members are touched here.
function useStripBasics(props: SessionProgressBarProps) {
  const { session, sessionId, t, useConversation, useProjection, useSessions } = props
  const chat = useConversation(conversation => conversation.views.get('chat'))
  const legacy = chat?.legacy ?? EMPTY_LEGACY
  const todos = useProjection('todos')
  const byId = useSessions(s => s.byId)
  return {
    toolName: runningTool(legacy),
    running: session.running,
    subRunning: subagentRunningCount(byId, sessionId),
    todos,
    t,
  }
}

function attentionState(
  sessionId: SessionId,
  pendingBySession: ReadonlyMap<SessionId, SessionPendingInteraction>,
) {
  const ownPending = pendingKindOf(pendingBySession.get(sessionId)?.kind)
  const subPending = subagentPendingState(pendingBySession, sessionId)
  const attention =
    ownPending !== null || subPending.approvals > 0 || subPending.questions > 0
  return { attention }
}

function StripBody({
  basics,
  pending,
}: {
  basics: ReturnType<typeof useStripBasics>
  pending: boolean
}) {
  return (
    <div className={css.bar} data-pending={pending || undefined}>
      {/* state text, fill bar, todos percent, token chip, elapsed/eta */}
    </div>
  )
}

// Recommended companion, plugin A's index.ts (activation-time diagnostic,
// one-shot — never per-render): if
//   typeof ctx.slots.kit('conversation.input.dock').useSessionPendingInteraction
//     !== 'function' &&
//   typeof ctx.slots.kit('conversation.input.dock').useSessionStatus !== 'function'
// log once: "progress strip: no pending-interaction hook in host kit; attention
// indicator disabled for this host version."
```

**What degrades and what keeps working.** On a host supplying *neither* pending hook:

- **Degrades:** the strip's **attention state** — the `data-pending` indicator for the
  session's own pending waits, and the subagent-subtree surfacing of pending
  approvals/questions (the sidebar hides subagent rows; this strip was surfacing them).
  That is the only consumer of the reduced hook.
- **Keeps working:** everything sourced from kit members that survived the reduction —
  running state, todos percent, token usage chip, elapsed/ETA derivation — because
  `session`, `useConversation`, `useProjection`, and `useSessions` are all still in the
  alpha.2 kit. The strip still shows meaningful, correct session progress — just
  without the attention flag.

**Why the degradation must be silent rather than throwing.**

1. **Blast radius.** This is literally the observed disaster. A throw here cannot be
   contained by the entry (`DockEntry` adds no boundary) — it reaches the slot-level
   `DrawerErrorBoundary`, which unmounts *every* `input.dock` tenant, innocent
   co-tenants included. The cost of throwing is the entire composer dock; the cost of
   degrading is one missing flag on one strip. Availability dominates cosmetics in a
   composer surface.
2. **Contract churn is normal here, not exceptional.** alpha.1 → alpha.2 already
   reshaped the kit once (pending moved from a dedicated hook onto the status map). A
   resident dock tenant must assume further reductions/renames across alphas. A
   component that treats every kit member as mandatory is a loaded gun for every other
   plugin in the slot.
3. **Semantics.** A missing optional indicator is a *capability*, not an error — the
   user is not blocked and no action of theirs failed. Error UI or console noise would
   claim an incident where there is none (the one-shot activation diagnostic above is
   the acceptable, developer-facing compromise — no per-render noise, nothing shown to
   the end user).

## 4. Multi-tenant hygiene

**What a dock tenant should do so its own crash cannot take down co-tenants.**

1. **Bring its own boundary.** Since `DockEntry` adds none, each entry component should
   render through its own local error boundary (class boundary or a guarded wrapper
   rendering `null` on error) around its subtree. Then A's throw would have unmounted
   *A's fallback only* — B's chips would have survived. Rent your own mattress: never
   rely on the host's boundary for your containment, because the host's granularity is
   the slot, and every crashing entry in the slot charges the rent to everybody.
2. **Feature-detect the kit, degrade per feature.** Treat every kit member as optional
   at render: `typeof hook === 'function'` checks, chosen branch per mounted instance
   (keep hook order fixed — a small dispatcher plus keyed variants, as in the fix).
   Never destructure-and-call a kit hook unguarded.
3. **Validate at activation, not at render.** On `onInit`/registration, assert the kit
   members the entry actually needs and log a *named* diagnostic (which member, which
   host version) the moment a mismatch exists — turning the next "vanished dock" into a
   one-line log instead of an archaeology exercise.
4. **Use the narrowest surface that does the job.** B's dock entry uses no kit hooks
   and paid no upgrade tax at all. Minimize kit coupling per entry; prefer kit members
   whose shape was stable across the versions you support; declare a peer/dependency
   range on the host packages you compile against.
5. **Assume remounts.** The dock boundary resets per session; entries must survive
   clean unmount/remount cycles (plugin A's strip, being resident, is mounted for every
   session and must render safely from a cold start every time).

**What the host could change so one entry's failure isolates to that entry.**

- **Per-entry boundary granularity.** Move the boundary one level down: give each
  `DockEntry` its own `DrawerErrorBoundary` (fallback: that entry renders `null`, or a
  per-entry error affordance), instead of one boundary per slot list. A throw in A then
  unmounts only A's fallback; the co-tenants — B's chips included — stay mounted. This
  is exactly the topology that already saved the `input.left` button, which sat under
  its own boundary.
- Alternative shapes of the same idea: render each entry in its own error-catching
  wrapper during the entry map, or suspend entries individually (e.g. react-error-boundary
  around each `SlotEntry`/`DockEntry`); both convert the fault domain from "the slot"
  to "the entry".

**The trade-off the host faces.** Finer boundaries trade *coherence and systemic
detection* for *availability*:

- The current per-slot boundary gives a single, consistent, all-or-nothing fallback for
  the whole dock and a guaranteed clean slate (reset on session switch) — if slot-wide
  state is corrupted or a shared provider misbehaves, nothing half-renders.
- With per-entry boundaries, siblings keep rendering against whatever shared state
  remains, so a systemic fault can present as a *silently inconsistent partial dock*
  (some entries alive, some dead, no single signal) instead of one loud "dock offline"
  — masking root causes and producing confusing partial UI, exactly the class of
  confusion this whole incident is.
- Plus small steady costs: N boundaries instead of 1 (more component instances, more
  fallback-content decisions — should a dead dock entry show null or an error chip?),
  per-entry reset bookkeeping on session switch, and residual blind spots per-entry
  boundaries cannot fix (errors thrown above the entries — in `InputDock` itself or in
  shared providers — still take the whole slot no matter how the entries are wrapped).

The host's call: a composer dock is resident and user-critical, so availability favors
per-entry isolation, ideally with a *degraded-dock signal* (e.g. a quiet per-entry error
chip) so the coherence loss is visible rather than silent.

## 5. Verification

**Restoring BOTH dock entries without a host restart** (no `dsh` process restart; the
boundary resets on the next session switch per the render-tree note):

1. Install/point the fixed plugin A build (junction re-point or the plugin mirror),
   then reload its scope (or disable→enable plugin A in the plugin list — the
   mechanism the maintainer's own experiment established).
2. Switch to a new session (e.g. leave `s-7f3a`); the new session id forces the dock
   boundary to remount its entries — the fallback is left behind.
3. Confirm, in this order:
   - Console is clean of the `useSessionPendingInteraction` TypeError; no
     `[dsh:slots] ... boundary fallback active` line.
   - `[dsh:slots] input.dock` reports both `dsh-paste-input-dock` and `progress`
     mounted; React DevTools shows both `DockEntry` children under
     `DrawerErrorBoundary name="input.dock"`; `input.left` still mounts
     `dsh-paste-input-button`.
   - Both behaviors are back together in the same session: paste a file → B's **chips
     rail renders** and the **strip renders** (running state, todos percent, token
     chip) — the co-incidence of the two symptoms must reverse co-incidentally, in the
     same dock, without disabling anything.
   - Behavioral check of the alpha.2 pending path itself: with a session that has a
     real pending interaction (and ideally a descendant subagent awaiting
     approval/question), the strip sets `data-pending` — proving `useSessionStatus`
     selection, not just absence-of-crash.

**The regression the verification must cover for plugin B specifically.** B's chips were
only ever observed *downstream* of A's crash — every prior "B works" observation was
made with A disabled. So the B regression must exercise the co-tenant topology that was
missing before:

- **B enabled together with a dock co-tenant** (fixed A present, both in
  `input.dock`): paste, multi-file paste, drop, and its injected `remove`/`add` state
  paths — the chips must render and stay mounted across a session switch (boundary
  reset). A suite that tests B alone can never catch this class of bug.
- **Fault-injection case:** with B's chips rail mounted, throw from a co-tenant entry
  (deliberately, e.g. a test entry that throws on render) and assert B's chips remain
  mounted and functional — the isolation guarantee, not just the one known bug's
  absence.
- **Kit-shape matrix:** run B's dock entry against alpha.1-kit, alpha.2-kit, and a
  reduced "neither pending hook" kit; B must be unaffected in all three, and the strip
  must degrade silently in the third.

**Evidence limits (stated for the record):** only the excerpts in this pack were
available — no full plugin-A/B repositories, no host source. The exact failing call is
pinned by the console stack (`client.js:219:41` ↔ excerpt line 24); the kit reduction is
read from the two sealed contracts; the boundary topology is read from the host's own
render-tree note and its slot logs. Everything else stated above follows from those.


## Required output (JSON only)
{"decisions":[{"id":"<criterion-id>","verdict":"pass|partial|fail|missing","reason":"short"}],"caps":[{"id":"<cap-id>","triggered":false,"reason":"short"}]}
Every criterion and cap exactly once. pass=full points, partial=half, fail/missing=0; a triggered cap caps the total.