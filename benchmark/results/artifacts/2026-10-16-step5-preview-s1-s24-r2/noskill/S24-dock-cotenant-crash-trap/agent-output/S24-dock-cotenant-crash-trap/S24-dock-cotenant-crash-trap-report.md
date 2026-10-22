# S24 · The Dock That Vanished Together — Diagnosis & Fix

**Case**: dsh web, Windows, npm-global in-place upgrade
`@deepseek-ai/dsh` `0.1.6-alpha.1` → `0.1.6-alpha.2`, six junction-linked external
client plugins. Two symptoms at once: the session-progress strip is gone **and** the
paste plugin's chip rail no longer renders (its attach button, in a different slot, still
renders). One render error in F12.

**Verdict (one sentence)**: this is **one fault, not two**. Plugin A (the session-progress
plugin) calls a hook that the alpha.2 standard kit no longer hands to
`conversation.input.dock` entries; the resulting `TypeError` is caught by the
**slot-level** `DrawerErrorBoundary name="input.dock"`, whose `null` fallback unmounts
**every** entry in that slot — including plugin B's chip rail — while plugin B's
`conversation.input.left` entry survives under its own, separate boundary. Plugin B is
collateral damage, not a second victim.

---

## 0. Evidence used

| File | What it establishes |
|---|---|
| `symptom-report.md` | Two symptoms, one error, everything else healthy |
| `console-excerpt.txt` | The exact throw, its stack, and the host's own slot accounting after it |
| `tried-notes.txt` | The disable-experiment (the decisive control) and the colleague's theory |
| `plugin-a/SessionProgressBar-excerpt.tsx` | The failing component and the exact call |
| `plugin-b/dock-entry-excerpt.md` | Plugin B's two registrations and its hook usage (none) |
| `host-types/slots-contract-alpha1.d.ts` | The alpha.1 session kit (has the pending seat) |
| `host-types/slots-contract-alpha2.d.ts` | The alpha.2 session kit (seat removed, relocated) |
| `host-types/dock-render-tree.md` | The mount tree and where the boundaries sit |

---

## 1. Culprit attribution

### 1.1 Which plugin fails, and at which exact call

**Plugin A — the session-progress plugin (dock entry id `progress`, slot
`conversation.input.dock`, `order: 20`).**

The failing statement is in `plugin-a/SessionProgressBar-excerpt.tsx`:

```tsx
const pendingBySession = useSessionPendingInteraction(interactions => interactions)
```

Note the precision: the **destructuring does not throw**. `useSessionPendingInteraction`
is simply not in the props object the host now passes, so the binding is `undefined`. The
throw happens at the **invocation**, one line later — the moment the component treats the
missing seat as a callable. In the shipped bundle that is
`lib/client.js:219:41`, which is exactly the column range of the call expression above.

The console stack confirms the whole path:

```
Uncaught TypeError: useSessionPendingInteraction is not a function
    at SessionProgressBar (plugin://dsh-external/dsh-ui-progress/lib/client.js:219:41)
    at renderWithHooks (react-dom)
    at mountIndeterminateComponent (react-dom)
The above error occurred in the <SessionProgressBar> component:
    at SessionProgressBar (plugin://dsh-external/dsh-ui-progress/lib/client.js:201:3)
    at DockEntry (dsh-client-ui-conversation)
    at DrawerErrorBoundary (dsh-client-ui-conversation)
    at InputDock (dsh-client-ui-conversation)
```

Read it bottom-up: the throw originates **inside plugin A's component**, during React's
render phase (`renderWithHooks` → `mountIndeterminateComponent`), inside plugin A's own
`DockEntry`, and it is **not** caught by anything plugin-local. The nearest enclosing
class boundary is the host's `DrawerErrorBoundary`, one level above `DockEntry` — which is
the whole point of §1.3.

### 1.2 Why *now*: what the standard kit lost between the two contracts

Diffing the two sealed contracts, seat by seat:

| Seat | alpha.1 | alpha.2 |
|---|---|---|
| `useConversation` | present | present |
| `useSessions` (`SessionListState`, byId index) | present | present |
| `useSessionPendingInteraction` | **present** — `SnapshotSelectorHook<ReadonlyMap<SessionId, SessionPendingInteraction>>` | **REMOVED** |
| `useSessionStatus` | absent | **added** — `SnapshotSelectorHook<ReadonlyMap<SessionId, SessionStatus>>`, `SessionStatus = { running, completionUnread, pendingInteraction }` |
| `useSessionRetainInfo` | absent | **added** (reference counts, e.g. `retainedBy.mainView`) |
| `useProjection`, `useInput`, `inputActions` | present | present |

The alpha.2 header states the reason outright: the session kit is now *"the conversation
slots contract, merged with the `GlobalStandardProps` that
`@deepseek-ai/dsh-client-ui-session` adds to every slot after the multi-instance
refactor."* The multi-instance refactor **consolidated** the per-session seats: the
dedicated pending-interaction map was folded into a per-session **status** record, and a
retention/reference-count seat was added.

So this is a **seat relocation, not an information removal**. The pending state still
exists on alpha.2 — it is `SessionStatus.pendingInteraction`, reachable through
`useSessionStatus`. Plugin A reads it from an address that no longer exists.

**Why it compiled and shipped.** Plugin A types its props as
`PropsRuntime<'conversation.input.dock'>`, resolved against the host types **at the
plugin's own build/publish time** — alpha.1. The contract the plugin was sealed against
still declared the hook, so it type-checked clean; the shipped artifact is compiled JS
(`lib/client.js`), so nothing re-checked the seat at install or at host upgrade. The
contract is a *compile-time snapshot*; the host moved underneath it. Classic
sealed-contract skew, and the reason a **feature-detect at runtime** is mandatory rather
than optional polish.

### 1.3 Why the innocent co-tenant's dock entry disappears with it

**Mechanism: coarse-grained, slot-scoped React error-boundary propagation with a `null`
fallback — an all-or-nothing blast radius per slot.**

`host-types/dock-render-tree.md` gives the exact tree:

```text
<InputDock>
  <DrawerErrorBoundary name="input.dock">      <-- ONE boundary for the WHOLE list slot
    <DockEntry id="dsh-paste-input-dock" />    (plugin B, order 5)
    <DockEntry id="progress" />                (plugin A, order 20)
    ...
  </DrawerErrorBoundary>
</InputDock>
```

and states: *"`DrawerErrorBoundary` is a standard React class boundary
(`getDerivedStateFromError` → renders `null` as its fallback …). `DockEntry` itself adds no
boundary of its own."*

Consequences, in order:

1. A render-phase throw inside **any** child unwinds to the **nearest enclosing class
   boundary** — here, the boundary that wraps the entire `input.dock` list, not the
   throwing entry.
2. `getDerivedStateFromError` returns `null`, so the boundary's fallback replaces the
   **whole list** with nothing. React's own message says it: *"React will try to recreate
   this component tree from scratch using the error boundary you provided."*
3. Every entry inside that boundary is **unmounted, including ones that rendered
   perfectly**. Note the ordering nuance: plugin B's entry (`order 5`) is mounted *before*
   plugin A's (`order 20`) — B's chips may well have rendered successfully in that same
   commit and were then **torn down and discarded** when A threw. From the user's seat the
   difference is invisible: the chips never appear on screen.
4. Co-tenant state is destroyed too. Anything the other entries held (plugin B's
   paste→chips subscription is the obvious candidate) dies with the unmount, so the
   breakage outlives the render that caused it.

The host's own accounting in the console excerpt is the receipt, and it names both
victims:

```
[dsh:slots] input.dock boundary fallback active (session s-7f3a); unmounted entries:
            dsh-paste-input-dock, progress
```

**The isolation unit is the SLOT, not the PLUGIN.** Plugin B is a single plugin with two
entries in two different slots; one dies and one lives, purely because of where each is
mounted.

### 1.4 Why the attach button survives while the chips do not

Straight from the render tree:

```text
<Composer>
  <InputLeft>
    <DrawerErrorBoundary name="input.left">      <-- a DIFFERENT boundary instance
      <SlotEntry id="dsh-paste-input-button" />  (plugin B, order -100)
    </DrawerErrorBoundary>
  </InputLeft>
  <InputDock>
    <DrawerErrorBoundary name="input.dock">      <-- the one that fell back
      ...
    </DrawerErrorBoundary>
  </InputDock>
  <Textarea />
</Composer>
```

Plugin B registers two surfaces (`plugin-b/dock-entry-excerpt.md`):

- the attach button in `conversation.input.left` (`order: -100`);
- the chip rail in `conversation.input.dock` (`order: 5`).

React error boundaries are **per-subtree**. The throw occurred under the
`input.dock` boundary, so the `input.left` subtree — a sibling, guarded by its own
`DrawerErrorBoundary name="input.left"` — is never unwound. The host log confirms the
post-mortem state:

```
[dsh:slots] input.left: 1 entry mounted (dsh-paste-input-button)
```

So the asymmetry the maintainer reported ("button yes, chips no") is not evidence that
*part of plugin B* broke. It is the signature of a **slot-scoped** failure boundary: same
plugin, same bundle, same session — different boundary.

Also worth flagging for later: the boundary *"resets on the next session switch"*, so the
fallback is **session-scoped** (here `s-7f3a`). A maintainer who switches sessions will
watch the dock reappear and may conclude the bug is intermittent. It is not; it is
per-session.

### 1.5 Secondary latent defect found in the same component

While writing the fix I noticed the original guards the null session **before** calling any
hook:

```tsx
if (session === undefined || session === null) return null   // <-- early return
const chat = useConversation(...)                            // <-- hooks start here
```

That is a Rules-of-Hooks violation whose trigger is exactly the event the host performs
constantly — a **session switch re-props the mounted entry**, so `session` can go from
defined to `null` without a remount, and the hook count changes under React's feet
("Rendered more hooks than during the previous render"). It did not fire here only because
`session` was defined for `s-7f3a`. The corrected code in §3 moves all hooks above the
guard. **This belongs in the regression suite** (§5).

---

## 2. The experiment

The maintainer disabled plugin A and refreshed; plugin B's chips came back immediately.
Re-enabling A made them vanish again. `tried-notes.txt` calls this "plugin A kills plugin
B somehow" — right conclusion, no mechanism. Here is exactly what it does and does not buy.

### 2.1 What it proves

1. **The two symptoms are one fault.** A single toggle flips both. They are not two
   independent regressions that happened to land in the same release.
2. **The dependency runs A → B, not B → A, and not "both broke".** Clean on/off control
   with B held constant. If B had its own defect, disabling A could not have repaired it.
3. **B's disappearance is collateral, not a defect.** Nothing about B changed across the
   toggle, yet B's visibility did. The cause is therefore *external to B*.
4. **The coupling is structural (mount tree), not behavioural.** B uses no standard-kit
   hooks and no cross-plugin API is in evidence, so A cannot be reaching into B's state.
   The only shared surface left is the tree they are both mounted into — which is what
   §1.3 identifies.
5. **Removing the thrower removes the co-tenant outage.** It establishes the fix target:
   stop the throw, and the dock comes back.

### 2.2 What it does *not* prove

**It does not prove plugin B is bug-free on alpha.2.** It proves B's dock entry renders
when the enclosing boundary is not in fallback — on **this** session, after **this** paste,
with **this** host build. Three reasons that is not a clean bill of health:

- While A was enabled, B's dock entry was **never rendered at all** — the boundary
  replaced the list with `null`. "B didn't throw" is therefore not a measurement of B in
  that condition; it is a measurement of a component that never ran. The experiment shows
  B *survives* the crash, not that B *works* on alpha.2.
- B is immune to *this particular* reduction **by construction, not by correctness**: it
  reads only its own injected state and "uses NO standard-kit hooks at all". That is luck
  of implementation. The experiment says nothing about B against any *other* alpha.2
  change, in any other slot, on any other session.
- B's non-render paths are untested. The symptom report lists paste interception, and the
  console notes the toast fired once and never again. That is consistent with the
  paste→chips subscription having died in the unmount (a plausible inference, **not**
  proven by this pack), and it is exactly the kind of thing a passing toggle does not
  cover.

Absence of evidence is not evidence of absence: the correct claim is "no defect
*demonstrated* in B", not "B is correct".

**It does not prove the strip crash is the ONLY dock problem.**

- It only ever verified **one** co-tenant (B's chips). The render tree's `...` says the
  `input.dock` list holds further entries, and the boundary fallback unmounted **all** of
  them. The other four plugins' dock entries were down for the whole experiment and were
  never checked.
- It does not prove the strip is *correct* once it stops throwing. Fixing the hook restores
  mounting, not fidelity: the todos-percent, token-chip and elapsed/ETA derivations, the
  `data-pending` semantics, and the subagent-subtree aggregation all still need eyes on
  them. A second latent break in A (see §1.5) would look identical from the outside.
- It does not prove the failure is universal. The observation is scoped to session
  `s-7f3a`, and the boundary resets on session switch — so "always reproducible" was
  never established.
- It does not identify the *cause*. Attribution comes from the console error plus the
  contract diff (§1.1–§1.2), not from the toggle.

**It does prove one thing the maintainer missed**: because B uses no standard-kit hooks,
B *cannot* have been hit by a standard-kit change. That single fact is what kills the
colleague's theory (§2.4).

### 2.3 Why reinstalling plugin B could never have helped

Four independent reasons, any one of which is sufficient:

1. **The fault is not in B's bytes.** B's code is unchanged-compatible (it consumes no
   standard-kit seat) and contains no throwing render path — its own `try/catch` around
   the fold scan logged nothing. Replacing B's files replaces code that was never wrong.
2. **B was never even mounted.** While A throws, React has already replaced the entire
   `input.dock` list with `null`. B's absence is a **mount-time** casualty of its
   co-tenant, not a render-time defect of its own. No version of B's code can execute
   inside a subtree that has been unmounted.
3. **The reinstall cannot touch either variable that governs B's visibility.** Those are
   (a) whether A throws, and (b) the host's boundary granularity. Neither lives in B's
   installable surface. A reinstall of B leaves the throw in place and leaves the
   boundary wrapping the whole list in place.
4. **It was a no-op experiment.** Reinstalling the *same* bundle is not a test — it
   re-executes identical code. Its null result is still mildly informative (it argues
   against a corrupted bundle or a broken junction link), but it could not possibly have
   changed the outcome, and it consumed a cycle that the disable-experiment would have
   answered in one step.

The diagnostic moral: **reinstall is a valid probe for "my plugin's code is bad" and a
useless probe for "my plugin is being unmounted by something else."**

### 2.4 What is wrong with the colleague's "both plugins were hit" theory

The theory — *"alpha.2 probably changed slot props. Maybe both plugins use a prop that was
removed, and you got hit twice. I'd fix both plugins' slot registrations."* — is falsified
five ways over:

1. **One error, one stack.** F12 shows *exactly one* render error, and its frames are
   entirely inside plugin A's `SessionProgressBar` (`client.js:219` → `:201`). There is
   no second error from B anywhere in the excerpt.
2. **B has no seat to lose.** The alpha.2 change is a change to the **standard kit**.
   `plugin-b/dock-entry-excerpt.md` states B's dock entry *"reads only its own injected
   state … it uses NO standard-kit hooks at all."* You cannot remove a prop from a
   component that never reads one.
3. **The control experiment contradicts it.** If both plugins had been hit independently,
   disabling A would leave B broken. It restored B instantly and repeatably.
4. **B is partially alive.** B's attach button renders in `input.left` and the host logs
   `input.left: 1 entry mounted`. The bundle loaded, registered both surfaces, and
   renders. Only its dock-slot entry is missing — the signature of a slot-scoped
   unmount, not of a plugin-wide failure.
5. **It prescribes the wrong fix.** "Fix both plugins' slot registrations" would edit B's
   registration, which is already correct and already compatible. That is a no-op that
   leaves the real defects — A's call to a removed seat, and a host boundary that couples
   independent tenants — fully intact. The outage would persist, and the next alpha bump
   would reproduce it on the next plugin that assumed a seat.

The theory's deeper error is **mislocating the fault**: B was not "hit" by the host change
at all. B was hit by its co-tenant. One plugin's regression, amplified by a host isolation
gap.

---

## 3. The fix

### 3.1 Which hook supplies the pending state on alpha.2

**`useSessionStatus`** — `SnapshotSelectorHook<ReadonlyMap<SessionId, SessionStatus>>`,
where `SessionStatus` carries `pendingInteraction`. It is global in scope (keyed by
session id), so it covers subagent sessions as well as the main one.

The subagent-subtree walk still uses **`useSessions(s => s.byId)`** to enumerate
descendants — that seat survives **unchanged in both contracts**, so the tree walk is
untouched. Only the *source of the pending field* moves: for each descendant id, read
`statusById.get(id)?.pendingInteraction` instead of `pendingById.get(id)`.

### 3.2 Corrected component

```tsx
/**
 * SessionProgressBar — 'conversation.input.dock' entry (id 'progress', order 20)
 * of the session-progress plugin (plugin A). Corrected for the alpha.1 -> alpha.2
 * standard-kit reduction, and hardened for hosts that supply NEITHER pending seat.
 *
 * Contract history of this slot's session kit:
 *   alpha.1  useSessionPendingInteraction: Selector<ReadonlyMap<SessionId, SessionPendingInteraction>>
 *   alpha.2  useSessionStatus:              Selector<ReadonlyMap<SessionId, SessionStatus>>
 *              SessionStatus = { running, completionUnread, pendingInteraction }
 *            (+ useSessionRetainInfo)
 * The dedicated pending-map seat was REMOVED when the conversation slots contract was
 * merged with @deepseek-ai/dsh-client-ui-session's GlobalStandardProps in the
 * multi-instance refactor. The INFORMATION survives (as SessionStatus.pendingInteraction);
 * the SEAT does not. Destructuring a removed seat yields undefined and calling it throws
 * TypeError, which under a slot-level error boundary blanks the whole dock.
 */
import { useMemo } from 'react'
import type { PropsRuntime, SnapshotSelectorHook } from '@deepseek-ai/dsh-client-ui-slots'

type SessionId = string
type PendingKind = string

interface SessionPendingInteraction { kind?: PendingKind | null }
interface SessionStatus {
  running?: boolean
  completionUnread?: boolean
  pendingInteraction?: SessionPendingInteraction | null
}
interface SessionRow { parentId?: SessionId | null; running?: boolean }

export type SessionProgressBarProps =
  PropsRuntime<'conversation.input.dock'> &
  PropsLocale<'progress'> & {
    /** alpha.1 seat. Removed from the alpha.2 standard kit. */
    useSessionPendingInteraction?: SnapshotSelectorHook<
      ReadonlyMap<SessionId, SessionPendingInteraction>
    >
    /** alpha.2 seat. Absent on alpha.1. */
    useSessionStatus?: SnapshotSelectorHook<ReadonlyMap<SessionId, SessionStatus>>
  }

const EMPTY_PENDING: ReadonlyMap<SessionId, SessionPendingInteraction> = new Map()
const EMPTY_STATUS: ReadonlyMap<SessionId, SessionStatus> = new Map()
const EMPTY_ROWS: ReadonlyMap<SessionId, SessionRow> = new Map()

/** Project the alpha.2 status map back into the shape the strip already consumes.
 *  Plain function — no hook — so the hook count below stays identical per branch. */
function projectPending(
  statusById: ReadonlyMap<SessionId, SessionStatus>,
): ReadonlyMap<SessionId, SessionPendingInteraction> {
  const out = new Map<SessionId, SessionPendingInteraction>()
  for (const [id, status] of statusById) {
    const pending = status?.pendingInteraction
    if (pending) out.set(id, pending)
  }
  return out
}

/**
 * "Pending human interaction, by session id", resolved from whichever seat the running
 * host actually provides. Returns null when the host provides NEITHER — the caller then
 * degrades the attention feature instead of throwing.
 *
 * Hook discipline: exactly two hooks per render, in the same order, in every branch.
 * The branch is chosen from a memoised feature-detect whose inputs are the injected
 * hook identities; those are fixed by the host build and cannot change under a live
 * mount (a contract change reloads the plugin bundle and remounts the entry), so the
 * hook list is stable for the component's lifetime. The 'none' branch still spends one
 * hook so the count matches the other branches exactly.
 */
function usePendingBySession(
  props: SessionProgressBarProps,
): ReadonlyMap<SessionId, SessionPendingInteraction> | null {
  const { useSessionStatus, useSessionPendingInteraction } = props

  // 1) Feature detection. Never call a seat we have not proven callable.
  const variant = useMemo<'status' | 'legacy' | 'none'>(
    () =>
      typeof useSessionStatus === 'function'
        ? 'status'
        : typeof useSessionPendingInteraction === 'function'
          ? 'legacy'
          : 'none',
    [useSessionStatus, useSessionPendingInteraction],
  )

  // 2) Read from the live seat — exactly one of these runs per render.
  if (variant === 'status') {
    const statusById = useSessionStatus!((s: any) => s) ?? EMPTY_STATUS
    return projectPending(statusById)
  }

  if (variant === 'legacy') {
    return useSessionPendingInteraction!((m: any) => m) ?? EMPTY_PENDING
  }

  // 3) Neither seat available on this host: report "unavailable", do not throw.
  return useMemo<null>(() => null, [])
}

/** Session ids in the subtree rooted at `rootId`. The sidebar hides subagent rows;
 *  this strip surfaces their pending state. (Field name taken from SessionListState —
 *  see "Assumptions" in the report.) */
function descendantIds(
  byId: ReadonlyMap<SessionId, SessionRow>,
  rootId: SessionId,
): SessionId[] {
  const children = new Map<SessionId | undefined, SessionId[]>()
  for (const [id, row] of byId) {
    const parent = row?.parentId ?? undefined
    const bucket = children.get(parent)
    if (bucket) bucket.push(id)
    else children.set(parent, [id])
  }
  const out: SessionId[] = []
  const stack = [...(children.get(rootId) ?? [])]
  while (stack.length > 0) {
    const id = stack.pop()!
    out.push(id)
    for (const child of children.get(id) ?? []) stack.push(child)
  }
  return out
}

/** UNCHANGED from the original: consumes a pending map + the byId index. */
function subagentPendingState(
  byId: ReadonlyMap<SessionId, SessionRow>,
  pendingBySession: ReadonlyMap<SessionId, SessionPendingInteraction>,
  sessionId: SessionId,
): { approvals: number; questions: number } {
  let approvals = 0
  let questions = 0
  for (const id of descendantIds(byId, sessionId)) {
    const kind = pendingBySession.get(id)?.kind
    if (kind === 'approval') approvals += 1
    else if (kind === 'question') questions += 1
  }
  return { approvals, questions }
}

/** UNCHANGED: main conversation idle while descendants keep executing. */
function subagentRunningCount(
  byId: ReadonlyMap<SessionId, SessionRow>,
  sessionId: SessionId,
): number {
  let n = 0
  for (const id of descendantIds(byId, sessionId)) {
    if (byId.get(id)?.running) n += 1
  }
  return n
}

export function SessionProgressBar(props: SessionProgressBarProps) {
  const {
    session, sessionId, t,
    useConversation, useProjection, useSessions,
  } = props

  // ---- hooks first, unconditionally ----
  // The original returned null for a null `session` BEFORE any hook, making the hook
  // count depend on a prop that changes on session switch (Rules of Hooks violation).
  // All hooks now run first; the null-session guard gates only the JSX.
  const chat = useConversation((conversation: any) => conversation.views.get('chat'))
  const legacy = chat?.legacy ?? EMPTY_LEGACY
  const todos = useProjection('todos')
  const byId = useSessions((s: any) => s.byId) ?? EMPTY_ROWS

  // Attention state — contract-tolerant, never throws.
  const pendingBySession = usePendingBySession(props)
  const attention = useMemo(() => {
    if (pendingBySession === null) return null // feature unavailable on this host
    const own = pendingBySession.get(sessionId)
    const sub = subagentPendingState(byId, pendingBySession, sessionId)
    return {
      kind: own?.kind ?? null,
      pending: own !== undefined || sub.approvals > 0 || sub.questions > 0,
      approvals: sub.approvals,
      questions: sub.questions,
    }
  }, [pendingBySession, byId, sessionId])

  // Background state — uses only seats present in BOTH contracts, so it always works.
  const subRunning = useMemo(
    () => subagentRunningCount(byId, sessionId),
    [byId, sessionId],
  )

  // ---- derivations (unchanged) ----
  const running = session?.running ?? false
  const toolName = runningTool(legacy)
  // ... percent / turn / elapsed / eta derivation unchanged ...

  // ---- null-session guard, AFTER the hooks ----
  if (session === undefined || session === null) return null

  return (
    <div className={css.bar} data-pending={attention?.pending || undefined}>
      {/* state text, fill bar, todos percent, token chip, elapsed/eta — all unchanged */}

      {/* Attention affordance. Rendered ONLY when the host gave us a pending seat.
          Never asserted when the seat is missing: "unknown" must not read as "clear". */}
      {attention?.pending ? (
        <span className={css.attention} data-kind={attention.kind ?? undefined}>
          {t('progress.attention', { approvals: attention.approvals, questions: attention.questions })}
        </span>
      ) : null}

      {/* Background subagent activity — independent of the pending seat. */}
      {subRunning > 0 ? <span className={css.subagents}>{t('progress.subagents', { n: subRunning })}</span> : null}
    </div>
  )
}

// Registration (unchanged):
//   ctx.slots.inject('conversation.input.dock', () => ctx.slots.register(
//     { name: 'conversation.input.dock', id: 'progress', order: 20, locale: NS },
//     SessionProgressBar,
//   ))
```

*(The `EMPTY_LEGACY`, `runningTool`, `css` and `t`/locale helpers are unchanged from the
original and elided here; the `any` casts stand in for the real selector parameter types,
which the excerpt does not include.)*

### 3.3 What degrades, what keeps working, and why silently

On a host that supplies **neither** `useSessionStatus` nor
`useSessionPendingInteraction`:

**Degrades (the attention/pending feature):**

- the `data-pending` attribute on the strip's root element;
- the "waiting on you" affordance — the approval and question counts for **this** session;
- the subagent-subtree pending aggregation (`subagentPendingState`), i.e. the whole point
  of surfacing rows the sidebar hides.

**Keeps working (everything derived from seats present in both contracts):**

- running / not-running state (`session.running`);
- the fill bar and percent/turn derivation (`useConversation` → `chat.legacy`);
- todos percent (`useProjection('todos')`);
- the token-usage chip;
- elapsed / ETA;
- the background-subagent indicator (`subagentRunningCount`), which reads `useSessions`
  only — **and this matters**: on a host with no pending seat, the strip must still be able
  to say "descendants still executing" rather than reading as done-green. Only the
  *pending* feature is lost, not the *liveness* feature.

One deliberate design rule in the code above: when the pending seat is unavailable the
strip renders **no attention affordance at all** rather than `data-pending` absent-as-in-
"nothing is waiting". "Unknown" must never be rendered as "all clear" — a strip that
silently asserts *no approvals outstanding* because it could not ask is a lie that costs
the user a stalled session. Omit, do not negate.

**Why the degradation must be silent rather than throwing:**

1. **A throw here is not a private failure.** Under a slot-level boundary it unmounts
   every co-tenant in `conversation.input.dock` — the exact outage being diagnosed. The
   blast radius of this component's exception is the whole dock, so "fail loudly" is not
   an available option; it is the bug.
2. **This is version skew, not a user-actionable error.** A missing seat is a host build
   fact. There is nothing the user can do, and nothing the plugin should escalate.
3. **The rest of the strip is still correct and useful.** Discarding accurate
   running/todos/token/ETA information because one optional seat vanished trades a lot of
   signal for no safety.
4. **A render-phase throw cannot be contained by the plugin's own `try/catch`.** It
   unwinds `renderWithHooks`; the fiber is abandoned and the enclosing boundary decides
   the outcome. The plugin's own `try/catch` (the one around the fold scan) is a
   *non-render* path and is irrelevant here.
5. **It would recur on every session switch.** The boundary resets per session, so a
   throwing entry re-throws on each new session — one outage becomes N, plus N console
   errors that bury the real signal.

"Silent" means **no throw and no render failure** — not "no diagnostics". The plugin should
still emit exactly **one** log line at mount naming the missing seat and the host contract
version, through its own diagnostic channel:

```tsx
// once, at mount:
if (variant === 'none') {
  ctx.log.warn(
    'progress: no pending-interaction seat on this host ' +
    '(expected useSessionStatus [alpha.2] or useSessionPendingInteraction [alpha.1]); ' +
    'attention indicators disabled, running/todos/token/ETA unaffected.'
  )
}
```

One warning, actionable, naming the seat and the consequence. Not a throw, and not a
per-render spam.

---

## 4. Multi-tenant hygiene

### 4.1 What a dock tenant should do

1. **Treat every standard-kit seat as optional.** Feature-detect before calling
   (`typeof hook === 'function'`); never destructure-and-call in one step. The destructure
   is what makes a removed seat look like a value; the call is what makes it a crash.
2. **Make the entry's render non-throwing by construction.** `?.` everywhere, defaults for
   every derived value, no invariant that a host change can invalidate. A throw in a list
   slot is a shared-boundary event, so "my component might throw" is a statement about
   your neighbours' uptime, not just your own.
3. **Assert the contract at activation, not at render.** When the plugin injects, check the
   seat set it needs and log once. A reduction is then caught at plugin load with a clear
   message, instead of at the next paste with a `TypeError`.
4. **Pin and re-verify the host contract.** Type props against the host types at build
   time **and** verify at runtime; the compile-time snapshot is exactly what went stale
   here. Consider refusing to register (with a clear reason) rather than registering an
   entry that cannot render.
5. **Wrap the *optional* part in your own inner boundary.** A small local boundary around
   the risky sub-feature turns "entry gone" into "feature gone". It cannot protect
   co-tenants (§4.2), but it converts a slot-wide outage into a per-feature one.
6. **Keep render pure and cheap.** No side effects, no blocking scans in the render path —
   the boundary is the last line of defence, not the first.
7. **Never depend on host internals outside the sealed contract.** The contract is the only
   compatibility surface; anything else can move without notice.

### 4.2 What the host could change

The host's own log line already frames the problem — `input.dock boundary fallback active …
unmounted entries: dsh-paste-input-dock, progress` — it knows it unmounted a bystander.

1. **Give every dock entry its own error boundary.** Move `DrawerErrorBoundary` *inside*
   `DockEntry` (one boundary per registered entry) instead of wrapping the whole list.
   A throw then unmounts only the thrower.
2. **Fall back to a named placeholder, not `null`.** Render a minimal, visibly-degraded
   stub that carries the entry id (e.g. `progress` unavailable). The dock's layout and
   ordering stay intact, and the maintainer immediately sees *which* entry failed —
   which is precisely the information this bug report lacked at first glance.
3. **Keep the slot-level boundary as a backstop**, for failures in the list machinery
   itself (ordering, injection, the slot's own render) where there is no per-entry unit to
   isolate to.
4. **Surface per-entry health in the slot log** — a counter of entries currently in
   fallback — so "one entry degraded" is observable rather than silent.

### 4.3 The trade-off the host faces

**Isolation versus blast-radius visibility.**

- A **coarse** boundary (today) makes failure **loud and well-localised in the log**: one
  error, one fallback, and the host can name every entry it took down. But it couples
  independent tenants, destroys healthy co-tenants' state, and turns a one-plugin
  regression into a feature outage for unrelated plugins — this case exactly.
- A **fine** (per-entry) boundary preserves co-tenants and their state, but each failure
  becomes **individually quiet**: the UI looks broadly healthy while a feature is simply
  missing. Add enough plugins and a systemic regression — like a removed seat — hides
  behind N separately-invisible holes, so detection is *slower* even though the *damage*
  is smaller.

Secondary costs of going fine-grained: more boundary instances to reconcile; an entry that
dies mid-interaction leaves host state partially applied, which the coarse boundary at
least reset wholesale; and placeholder stubs must be designed so they don't masquerade as
real UI. The pragmatic resolution is **both**: per-entry boundaries with named
placeholders plus a slot-level health signal, so isolation is fine but observability is
not lost.

---

## 5. Verification

### 5.1 Restoring both dock entries without a host restart

The host process is not restarted — the client plugins are junction-linked external
client plugins, so the client-side reload path is what applies:

1. **Reload plugin A's client bundle** through the client-plugin HMR receiver (rebuild the
   plugin's client bundle in place, or bump its version and let the client re-link). No
   host restart, no `npm -g` reinstall.
2. **Reload the web profile** (hard refresh). This is a client reload, not a host restart.
3. **Assert the mount state**, either from the DevTools component tree or from the host's
   slot log — the log is the cheapest oracle:
   - `[dsh:slots] input.dock` shows **both** entries mounted: `dsh-paste-input-dock`
     (`order 5`) **and** `progress` (`order 20`);
   - **no** `boundary fallback active` line for `input.dock`;
   - `input.left: 1 entry mounted (dsh-paste-input-button)` unchanged.
4. **Assert zero errors**: F12 console clean — no `TypeError`, no "The above error occurred
   in", no new React warnings.
5. **Exercise both restored surfaces in one pass**: paste a file → the chip rail renders
   above the composer, the attach button still renders, and the progress strip renders
   with its running state, fill bar, todos percent and token chip.
6. **Toggle the control back**: disable A → B's chips still render (now because the
   boundary never trips, not because it recovered); re-enable A → both still render. The
   two symptoms must no longer be coupled.

### 5.2 Regression coverage required — plugin B specifically

Plugin B is the innocent bystander, so the regression suite must prove it stays innocent
under stress rather than merely "works today":

1. **Co-tenant crash isolation.** Deliberately make a third `conversation.input.dock`
   entry throw (a test entry that calls a missing hook) and assert that B's chips **still
   render**. This is the test that was missing and it is the whole point of the case.
2. **Regression on the exact original trigger.** Re-run the original failure mode — an
   entry that destructures-and-calls a removed seat — and assert B survives, so a future
   contract reduction cannot reintroduce the coupling.
3. **Contract-matrix test for B.** Mount B's dock entry against a synthetic host that
   supplies **neither** pending hook, and assert it renders. B currently uses no
   standard-kit hooks; the test must *pin* that property so a future refactor of B that
   starts consuming a seat does not silently become crash-prone.
4. **Full lifecycle across a session switch.** Add chips, switch session, switch back,
   remove chips — the boundary resets on session switch, and B's subscription is exactly
   what died in the unmount. Assert the paste→chips subscription is re-established and the
   toast/paste interception still fires on every paste, not just the first.
5. **Both of B's surfaces, both slots.** Assert `input.left` and `input.dock` entries
   mount together, and that a failure in one slot does not affect the other.
6. **Plugin A's own regressions** (the strip that was fixed):
   - renders on **alpha.1** (legacy seat), **alpha.2** (status seat), and a host with
     **neither** (degraded, silent, one warning);
   - `data-pending` present when a pending interaction exists, absent when none does —
     including the **subagent subtree** case, on the alpha.2 seat;
   - todos percent / token chip / elapsed-ETA unchanged;
   - `subRunning` still renders on a host with no pending seat (liveness must not be
     confused with attention);
   - the **null-session guard after hooks** (§1.5): re-prop the entry with
     `session = null` and back, asserting no "Rendered more hooks than during the
     previous render" error — this is the latent defect the original code carried;
   - the attention affordance is **omitted**, not rendered as "clear", when the seat is
     missing.

---

## Appendix — assumptions and gaps in the evidence pack

Stated plainly rather than guessed around:

- **`SessionListState` shape.** The pack does not include the session-list type, so
  `descendantIds` assumes a `parentId` field on each row for the subtree walk. The
  original excerpt already called `subagentPendingState(useSessions(s => s.byId), …)`, so a
  byId-indexed, parent-linked list is the established shape; confirm the field name
  against the sealed contract before shipping.
- **`pendingKindOf` / `subagentPendingState` signatures.** The excerpt calls them but
  does not define them. The fix keeps their contract (pending map + byId index) so they
  need no change; only the *source* of the map moved.
- **Only an excerpt of plugin A is available.** The fix corrects the excerpted component;
  plugin A may consume the removed seat elsewhere (other components, non-render paths).
  Grep the full plugin for `useSessionPendingInteraction` before declaring it fixed.
- **The paste toast.** "Toast appeared once, then not again" is consistent with the
  paste→chips subscription dying in the unmount, but the pack does not prove it. Treat it
  as a verification item (§5.2.4), not a finding.
- **The other four plugins' dock entries.** The render tree's `...` implies more entries;
  none were checked. §5.1.3 should be run as a full slot census, not a two-entry check.
- **No host-side fix was applied or specified beyond §4.2** — the host is out of scope for
  this plugin-side report, and the boundary granularity change is a host decision with the
  trade-off in §4.3.
