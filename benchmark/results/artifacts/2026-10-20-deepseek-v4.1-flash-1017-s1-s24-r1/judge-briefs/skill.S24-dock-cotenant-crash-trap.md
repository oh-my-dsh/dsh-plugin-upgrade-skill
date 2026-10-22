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
#### FILE: S24-dock-cotenant-crash-trap/REPORT.md

# S24 · The Dock That Vanished Together

**Verdict (one line):** plugin A (session-progress) calls a standard-kit prop that
0.1.6-alpha.2 no longer supplies, throws during render, and the dock list's *single
shared* error boundary blanks the whole `conversation.input.dock` subtree — which is
why the innocent co-tenant (plugin B's chip rail) died with it, while plugin B's
attach button, mounted in the sibling `conversation.input.left` slot behind its own
boundary, survived.

| Symptom | Real cause | Not the cause |
|---|---|---|
| Progress strip absent from the dock | plugin A throws (`TypeError` at its first pending-seat call) | a missing plugin row, disabled toggle, collapsed CSS |
| Paste chips never render; attach button fine | A's throw unmounted the **whole** dock list, B's entry included | plugin B's code, plugin B's install, alpha.2 slot registration |
| Exactly one F12 error | one throwing entry; the boundary nulls the rest, so no second error can even print | "two plugins were hit twice" |

Read-only task: `/app/fixture/` was inspected, nothing under it was modified, no
migration, install, or host command was run.

---

## 1. Culprit attribution

### 1.1 Which plugin fails, at which exact call

**Plugin A — the session-progress plugin (`dsh-ui-progress`), entry id `progress`,
`order: 20`, in slot `conversation.input.dock`.**

The failing call is the strip's pending-interaction read:

- source: `plugin-a/SessionProgressBar-excerpt.tsx:24` —
  `useSessionPendingInteraction(interactions => interactions)`;
- the prop is taken from the standard kit by destructuring at
  `SessionProgressBar-excerpt.tsx:11-12`;
- at runtime that binding is `undefined`, so the call site is literally
  "invoke `undefined` as a function": `console-excerpt.txt:3-4`,
  `Uncaught TypeError: useSessionPendingInteraction is not a function at
  SessionProgressBar (.../lib/client.js:219:41)`.

This is a **render-phase throw**, not a rejected promise, not a caught error, and not
a registration error. `SessionProgressBar-excerpt.tsx:41-44` shows the registration
is the ordinary `inject` + `register` form with `{ name, id, order, locale }`,
identical on both host tags — so the entry *registers* correctly and then dies while
rendering. That distinction matters for section 2: nothing about A's registration is
wrong, its *render* is.

Note also what the error is **not**: not "module not found", not a React hook-order
warning, not a slot-undeclared error. The prop exists in the component's contract,
the host just stopped handing it over — hence a plain `TypeError` instead of a
build/activation failure.

### 1.2 Why now — what changed in the standard kit

Compare the two sealed contracts:

- `host-types/slots-contract-alpha1.d.ts:10` — alpha.1 handed every dock entry
  `useSessionPendingInteraction: SnapshotSelectorHook<ReadonlyMap<SessionId,
  SessionPendingInteraction>>`.
- `host-types/slots-contract-alpha2.d.ts:12` — alpha.2 hands
  `useSessionStatus: SnapshotSelectorHook<ReadonlyMap<SessionId, SessionStatus>>`
  ("running, completionUnread, pendingInteraction") plus a **new**
  `useSessionRetainInfo` (:14). The old pending hook is **gone**.
- Everything else in the kit is unchanged across the two files: `useConversation`,
  `useSessions`, `useProjection`, `useInput`, `inputActions` all still exist.

So the *data* did not disappear; it **moved one level down**. The alpha.1 design kept
a standalone map of pending interactions; alpha.2 folds that fact into a per-session
status record, read as
`useSessionStatus(s => s.get(sessionId)?.pendingInteraction)`. The change shipped
with the multi-instance Session-reference rework (the same release removed
`SessionListState.current`), so "per-session facts" were consolidated into one
status object rather than several parallel maps.

This is a **carded** break, not an unknown: **DSH-0.1.6-A2-02** (global standard
props: `useSessionPendingInteraction` → `useSessionStatus` +
`useSessionRetainInfo`, `useSessions` stays) in the `0.1.6-alpha.1 →
0.1.6-alpha.2` card set, with the resident progress strip in
`conversation.input.dock` named as first-hand evidence.
The neighbouring card **DSH-0.1.6-A2-01** (multi-instance Session references,
`current` removed) is the *other* alpha.2 trap for this class of plugin and is
relevant to plugin B — see §2 and §5.

Why nothing stopped it earlier, honestly stated:

- A is **junction-linked** and ships a prebuilt `lib/client.js`; no typecheck of
  that bundle ever runs against the alpha.2 declarations, so the type error the
  contract change would have produced at build time never happened.
- `0.1.6-alpha.2` has **no install/startup peer-range enforcement** (that gate
  arrives later in the corridor, per the 0.1.7-rc.1 card set), and link-installed
  plugins also stay outside the new plugin-manager's bundle management
  (**DSH-0.1.6-A2-03**). The stale build was simply loaded.

### 1.3 Why the innocent co-tenant disappears with it

Mechanism: **one error boundary per slot *list*, not per entry.**

`host-types/dock-render-tree.md:14-20` shows the mount tree: a single
`<DrawerErrorBoundary name="input.dock">` wraps **all** `DockEntry` children of the
list slot (`dsh-paste-input-dock` at `order: 5`, `progress` at `order: 20`, …), and
lines 25-27 state the two decisive facts: `DockEntry` adds **no boundary of its own**,
and `DrawerErrorBoundary` is a standard class boundary whose
`getDerivedStateFromError` fallback renders `null`.

So the blast radius of any single entry's render throw is the entire list:

1. A's entry throws while the list renders (React aborts the render pass and discards
   the whole subtree, including siblings that had already produced output — B sorted
   first, but a failed list render cannot be partially committed);
2. the nearest boundary is the shared one, so it catches, and its fallback is `null`;
3. `null` replaces the *container*, not just A's slot: every entry in
   `input.dock` is unmounted. The host says so itself —
   `console-excerpt.txt:16-17`: `input.dock boundary fallback active (session
   s-7f3a); unmounted entries: dsh-paste-input-dock, progress`. The victim is listed
   by name, next to the culprit, as *unmounted*, not *errored*.

This is **collateral unmount, not contamination**: plugin B never throws, never
receives a bad prop, and its own `try/catch` correctly logs nothing
(`plugin-b/dock-entry-excerpt.md:22-25` — `AttachmentChips` reads only its own
injected `{ remove, add }` state and uses **no** standard-kit hooks at all, so alpha.2
has nothing to take away from it). It simply has no container left to render into.

Two consequences worth recording, because they shape the maintainer's observations:

- **The failure latches.** The boundary resets only on the next session switch
  (`dock-render-tree.md:25-27`), so once it falls back to `null` the dock stays blank
  for that session; later pastes update B's state but have nowhere to paint. That
  explains `console-excerpt.txt:20`: no further errors, and the paste toast did not
  reappear on the second attempt — the paste still worked, the rail could not appear.
- **It is a remount crash, not a one-off.** Every refresh or session switch recreates
  the tree, A throws again, the list is nulled again. It looks permanent because it
  *is* permanent while A is loaded, not because anything was persisted.

### 1.4 Why the attach button survives while the chips do not

Because it lives in a **different slot with a different boundary**:
`dock-entry-excerpt.md:6-11` registers the button into `conversation.input.left`
(`order: -100`), and `dock-render-tree.md:8-13` shows it under its own
`<DrawerErrorBoundary name="input.left">` inside `<InputLeft>`, a sibling of
`<InputDock>`. A throw inside `InputDock`'s boundary cannot reach a boundary in
`InputLeft`; React boundaries only catch what is below them. Confirmed by
`console-excerpt.txt:18`: `input.left: 1 entry mounted (dsh-paste-input-button)` —
one entry, still mounted, in the same console dump that reports the dock list gone.

The chips rail differs in exactly one respect: it is a **co-tenant of the same list
slot**, so it shares A's boundary. Same plugin, same page, same user action — two
different survival outcomes, decided purely by which boundary owns the slot. That is
the whole "why does a progress bar kill an attachment chip rail" answer: it does not
kill the plugin, it kills the container they share.

The rest of the page (whale title bar, file-trace panel, input-recall chords) is
unaffected for the same structural reason: separate subtrees, separate boundaries.

---

## 2. The experiment: what it proves, what it does not

The experiment (`tried-notes.txt:8-10`): disable plugin A, refresh → plugin B's chips
return immediately; re-enable A → chips gone again. Two-way, repeatable, single
variable. That is a good control, and it is decisive for a narrow claim.

### It proves

1. **Causal dependency, not coincidence.** B's rail renders **iff** A's entry is
   absent. The only changed variable is A's presence in the composition, so A is the
   sole thrower among the two, and B's failure is a consequence of A's.
2. **The fault is not on B's side of the seam at all** — not B's bundle, not B's
   install artifact, not B's registration, not the paste pipeline, not the registry or
   the mirror tag, not a corrupted profile. With A removed, B produced chips on the
   *same* alpha.2 host with *no* other change. That is a positive control for B's dock
   render path.
3. **The mechanism is a shared container, not shared code.** If A's crash damaged B's
   *data* (state, injected actions), B would not recover by simply re-rendering in a
   fresh tree. It recovers fully and immediately, which fits "the parent boundary was
   nulling my container" and misfits any state-corruption story.
4. **It falsifies the colleague's theory in its stated form.** If both plugins had
   independently called a removed prop, disabling A would leave B still throwing from
   its own call site. B does not. Two independent breaks cannot produce a one-way
   dependency.

It also quietly explains the two failed remedies: reinstalling B changed nothing
because B was never broken (see below), and reading B's registration found nothing
because the registration is fine.

### It does not prove

1. **It does not prove plugin B is bug-free on alpha.2.** It proves one thing: B's
   chip rail renders when it is the only dock tenant, on the code path exercised
   (mount → chips for one pasted file). Untested: B's button beyond "it is mounted",
   its paste/upload/remove flows, multi-file and drag-drop paths, and — importantly —
   its **event-time session resolution**. That is a second, independent alpha.2 break
   class: `SessionListState.current` was removed in the same release
   (**DSH-0.1.6-A2-01**), and the card's first-hand evidence is a paste/drop
   attachment plugin that started refusing every paste. B's excerpt says it uses no
   standard-kit hooks, but that says nothing about what it does *inside a paste event
   handler* (a plain service read, not a slot prop). The single unreproduced toast
   (`symptom-report.md:13`, `console-excerpt.txt:20`) is not explained by A alone and
   is the natural fingerprint of that second class. So: B's **dock entry** is proven
   functional; B's **plugin** is not proven compatible.
2. **It does not prove the strip crash is the only dock problem.** "Exactly one error
   in F12" measures what the boundary let through, not what is wrong:
   - the shared boundary nulls the list, so a second entry that fails *after* A's
     throw, or only under different conditions (a pending approval, a streaming turn,
     no session, a session switch), has no chance to print anything;
   - entries may also be failing *silently* — returning `null`, rendering an empty
     fragment, dropping content — which never reaches a console at all;
   - the experiment toggles A globally, so it also cannot separate A's *dock entry*
     from anything else A contributes at the host/registration plane. A finer probe
     (remove only A's dock row, or mount a throwaway probe entry) would be needed to
     close that;
   - only B was used as the controlled co-tenant; the other four plugins were never
     individually exercised with A off, so their dock state on alpha.2 is simply
     unmeasured.

Stated compactly: the experiment gives **one strong causal edge (A → B's dock entry)**
and **one clean control (B renders on alpha.2)**, and nothing else. Treat it as an
attribution tool, not a compatibility certificate for either plugin.

### Why reinstalling plugin B could never have helped

Reinstalling replaces B's files. Every candidate cause in the real chain lies outside
them:

- the throwing call belongs to **another composition row** (A's bundle);
- the failing object is a **host-supplied prop**, not something B or its installer
  ships;
- the destructive step is **host-side rendering machinery** — a shared boundary owned
  by `dsh-client-ui-conversation` — which no package content of B can influence;
- B's own code path had already been proven complete: registration resolved, entry
  mounted, no throw, own `try/catch` silent (`tried-notes.txt:5-7`,
  `dock-entry-excerpt.md:22-25`).

Worse, a reinstall is **not free**: it changes the artifact under triage (B now has a
different build/hash than the one that was reported), it consumes the maintainer's
confidence in "clean reinstall ⇒ plugin is fine" — a false negative that costs hours —
and it produced the misleading "chips still not rendering, strip still gone" datapoint
that made an install problem look plausible. The correct read of "reinstall changed
nothing" is not "B is subtly broken"; it is "B is not in the causal chain".

### What is wrong with the colleague's theory

The theory (`tried-notes.txt:16-17`: "alpha.2 changed slot props, maybe both plugins
use a removed prop, fix both plugins' slot registrations") makes three separate
mistakes:

1. **It mislocates the seam.** What changed is the *standard prop kit* handed to a
   dock entry, not the *registration* API. `inject` + `register({ name, id, order,
   locale })` is identical on both tags (`slots-contract-alpha1.d.ts` vs
   `alpha2.d.ts`; `SessionProgressBar-excerpt.tsx:41-44` runs unchanged on alpha.2 —
   it is the entry that throws, not the entry that fails to register). "Fix both
   registrations" would edit correct code and leave the `TypeError` untouched: the
   chips would vanish exactly as before.
2. **It ignores that B cannot have that class of bug.** `dock-entry-excerpt.md:22-25`
   states `AttachmentChips` uses no standard-kit hooks at all. A plugin that reads
   none of the kit has nothing to lose when the kit changes.
3. **It reads a one-way dependency as two independent hits.** Two independent breaks
   would be additive (disabling A leaves B broken); the observed two-way toggle is
   multiplicative/dependent. And the evidence for "two hits" is one error with one
   stack — the second "hit" is not an error at all, it is an *unmount*, and unmounts
   are what a boundary produces, not what a bad prop produces.

The grain of truth worth keeping: B **is** affected, and the fix belongs in the slot
contract's blast radius rather than in B's paste logic — but as a *victim* to be
protected (§4), not as a *culprit* to be patched.

---

## 3. The fix

### 3.1 Corrected component

Requirements the code below meets: the removed seat is optional, never called blind;
the alpha.2 seat is `useSessionStatus` with pending read at `.pendingInteraction`;
one build serves alpha.1 and alpha.2; a host with **neither** seat yields a working
strip with only the attention feature missing; nothing throws, so the shared boundary
is never entered.

```tsx
/**
 * SessionProgressBar — 'conversation.input.dock' entry (id 'progress', order 20).
 * One build serves dsh 0.1.6-alpha.1 (pending seat: useSessionPendingInteraction)
 * and 0.1.6-alpha.2+ (pending seat: useSessionStatus(...).pendingInteraction).
 *
 * The pending seat is OPTIONAL to this strip: it is a resident hint bar, so losing
 * the pending signal may cost the signal — never the entry, and never the dock.
 */
import { useEffect } from 'react'
import type { PropsRuntime, PropsLocale } from '@deepseek-ai/dsh-client-ui-slots'
import type {
  SessionId, SessionStatus, SessionPendingInteraction,
} from '@deepseek-ai/dsh-client-ui-session'

export type SessionProgressBarProps =
  PropsRuntime<'conversation.input.dock'> & PropsLocale<'progress'>

/** Optional standard props, typed as possibly-absent so one build checks on both tags. */
interface OptionalPendingSeats {
  /** alpha.2+ seat. */
  useSessionStatus?: (
    selector: (state: ReadonlyMap<SessionId, SessionStatus>) => unknown,
  ) => unknown
  /** alpha.1 seat (removed in alpha.2). */
  useSessionPendingInteraction?: (
    selector: (state: ReadonlyMap<SessionId, SessionPendingInteraction>) => unknown,
  ) => unknown
}

type PendingSeat = 'status' | 'legacy' | 'none'

/** What the strip needs to know about pending waits; known:false means "host told us nothing". */
interface PendingFacts {
  own: PendingKind | null
  subApprovals: number
  subQuestions: number
  known: boolean
}

const UNKNOWN_PENDING: PendingFacts = {
  own: null, subApprovals: 0, subQuestions: 0, known: false,
}

/**
 * Seat selection is a CAPABILITY PROBE, not state: a given host build always hands
 * the same prop set, so this answer is constant for the life of the mount and the
 * hook branch it gates keeps a stable order across renders.
 */
function pendingSeatOf(props: SessionProgressBarProps): PendingSeat {
  const seats = props as unknown as OptionalPendingSeats
  if (typeof seats.useSessionStatus === 'function') return 'status'             // alpha.2+
  if (typeof seats.useSessionPendingInteraction === 'function') return 'legacy' // <= alpha.1
  return 'none'
}

let warnedNoPendingSeat = false

/** Always called. Returns UNKNOWN_PENDING when the host supplies no pending seat. */
function usePendingFacts(props: SessionProgressBarProps): PendingFacts {
  const { sessionId } = props
  const seat = pendingSeatOf(props)
  const seats = props as unknown as OptionalPendingSeats
  // useSessions exists on both tags (only its snapshot's current field moved).
  const byId = props.useSessions(state => state.byId)

  useEffect(() => {
    if (seat !== 'none' || warnedNoPendingSeat) return
    warnedNoPendingSeat = true
    // Once per page, never per frame: visible to a developer, invisible to the user.
    console.warn(
      '[dsh-ui-progress] host exposes no pending seat (useSessionStatus / ' +
      'useSessionPendingInteraction); attention badge disabled, strip stays up',
    )
  }, [seat])

  if (seat === 'status') {
    const statuses = seats.useSessionStatus!(state => state) as
      ReadonlyMap<SessionId, SessionStatus>
    const own = pendingKindOf(statuses.get(sessionId)?.pendingInteraction?.kind)
    const sub = subagentPendingFromStatus(statuses, byId, sessionId)
    return { own, subApprovals: sub.approvals, subQuestions: sub.questions, known: true }
  }

  if (seat === 'legacy') {
    const pendingBySession = seats.useSessionPendingInteraction!(state => state) as
      ReadonlyMap<SessionId, SessionPendingInteraction>
    const own = pendingKindOf(pendingBySession.get(sessionId)?.kind)
    const sub = subagentPendingState(byId, pendingBySession, sessionId)
    return { own, subApprovals: sub.approvals, subQuestions: sub.questions, known: true }
  }

  // Host supplies neither seat: degrade, do not throw, do not guess "all clear".
  return UNKNOWN_PENDING
}

export function SessionProgressBar(props: SessionProgressBarProps) {
  const { session, sessionId, t } = props

  // Hook block first — the session guard must NOT precede the hooks, otherwise a
  // rendered-then-lost session would change the hook count between renders.
  const chat = props.useConversation(conversation => conversation.views.get('chat'))
  const legacy = chat?.legacy ?? EMPTY_LEGACY
  const todos = props.useProjection('todos')
  const pending = usePendingFacts(props) // may be UNKNOWN_PENDING — still valid
  const toolName = runningTool(legacy)
  const subRunning = subagentRunningCount(props.useSessions(s => s.byId), sessionId)

  if (session === undefined || session === null) return null

  const running = session.running
  // Attention: real pending waits, or nothing we can honestly claim.
  const attention = pending.own !== null || pending.subApprovals > 0 || pending.subQuestions > 0

  return (
    <div
      className={css.bar}
      data-pending={attention || undefined}
      // Lets CSS render a neutral badge instead of a green "nothing pending"
      // when the host gave us no pending seat at all.
      data-pending-known={pending.known || undefined}
    >
      {/* state text · fill bar · todos percent · token chip · elapsed/eta — all unchanged */}
    </div>
  )
}

// Registration is unchanged and stays as-is (it was never the problem):
//   ctx.slots.inject('conversation.input.dock', () => ctx.slots.register(
//     { name: 'conversation.input.dock', id: 'progress', order: 20, locale: NS },
//     SessionProgressBar,
//   ))
```

Supporting helpers are mechanical and small: `pendingKindOf(kind | undefined)` maps
`'approval' | 'question'` to the strip's `PendingKind` (already present in A),
`subagentPendingFromStatus` is the alpha.2 sibling of `subagentPendingState` reading
`statuses.get(id)?.pendingInteraction` over the same `byId` subtree walk, and
`EMPTY_LEGACY` / `subagentRunningCount` / `runningTool` are untouched.

### 3.2 Which hook supplies the pending state on alpha.2

`useSessionStatus`, read as
`useSessionStatus(state => state.get(sessionId)?.pendingInteraction)` for a single
session — or, as above, select the whole `ReadonlyMap<SessionId, SessionStatus>` once
when the subagent-subtree walk also needs it. `SessionStatus` carries `running`,
`completionUnread` and `pendingInteraction`, so the same record could later replace
`session.running` too; the fix keeps that for a separate change. If only the own
session's badge is needed, the narrower selector avoids re-rendering on every other
session's status change.

### 3.3 What degrades, and what keeps working

On a host that supplies **neither** pending seat:

**Degrades (one feature, the attention signal):**
- the `data-pending` attention state for this session's own pending approval/question;
- the subagent-subtree **pending** counts (pending approvals/questions aggregated over
  descendant sessions), so a subagent blocked on a question no longer raises the
  badge.

**Keeps working (everything else the strip exists for):**
- the entry itself — present, ordered, styled, resident above the composer;
- running/paused state text and the fill bar (`session.running`, unchanged on both
  tags);
- todos percent (`useProjection('todos')`, unchanged);
- the token-usage chip (`useProjection`, unchanged);
- elapsed / ETA / turn derivation from `chat.legacy`;
- the **subagent still-running** signal, because that comes from
  `useSessions(s => s.byId)` — and `useSessions` survives both tags. This is the
  precise seam of the degradation: "descendant is *running*" keeps working,
  "descendant is *waiting on a human*" does not.

### 3.4 Why the degradation must be silent rather than throwing

1. **Because throwing here is not a local failure — it is a dock-wide outage.**
   `DockEntry` has no boundary (`dock-render-tree.md:25-27`); the only boundary is
   the list's. One throw deletes every co-tenant entry. A plugin that throws to signal
   "I lost an optional prop" is choosing to convert a cosmetic loss into other
   people's data loss — exactly the incident under investigation.
2. **Because a resident entry has no recovery path.** The strip mounts on every
   session open and stays mounted; `DrawerErrorBoundary` renders `null` and resets
   only on session switch, so a throw is a latched blank plus a re-throw at every
   remount. "Fail fast" is a server-side virtue; in a permanently-mounted UI it means
   "fail permanently, and take the neighbours".
3. **Because the missing capability is genuinely optional.** A hint badge is
   non-essential; the todos/token/running facts are not. Proportional degradation
   (lose the badge, keep the bar) is strictly better than proportional escalation
   (lose everything, log once).
4. **Because throwing does not even buy diagnosability.** The observed error names a
   hook, not the damage — it took this whole analysis to connect it to a chip rail in
   another plugin. A single `console.warn` naming the missing seat and the disabled
   feature is *more* informative to a maintainer, and costs no co-tenant anything.
   "Silent" here means: no throw, no user-visible error surface, no boundary entry —
   not "no diagnostics". One warn per page, at most.

---

## 4. Multi-tenant hygiene

### 4.1 What a dock tenant should do so its own crash cannot take down co-tenants

1. **Treat every standard-kit prop as optional until proven present.** Feature-detect
   with `typeof prop === 'function'` at the point of use, decide the branch from the
   host's fixed prop set, and never invoke a destructured prop blind. A destructuring
   pattern is a *contract claim*, not a runtime guarantee — the compiler cannot see a
   host that stopped supplying a field, and a prebuilt bundle has no compile step left
   to fail.
2. **Degrade to a defined state, not to an exception.** Pick an explicit
   "unknown/absent" value (`UNKNOWN_PENDING` above) and render a neutral surface.
   Distinguish "no pending" from "we cannot know" so the degraded UI does not lie.
3. **Keep the entry's render total.** No throwing from the component body, no
   `assert`/`invariant` helpers in render, no unguarded `.get()` on possibly-absent
   props, no dependent hook calls that can change order between renders. Guard the
   narrowest unit: put risky *sub*-renders behind a small local boundary (a tiny class
   boundary around the optional badge, keyed by feature), so a future contract break
   loses the badge and not the bar.
4. **Assume the host boundary is not yours.** Never design so that "if this throws,
   the host will show an error" — you do not own the boundary's scope, and today it is
   wider than you think.
5. **Declare the compatibility you actually verified, and bump the plugin version.**
   Keep the peer range honest for the corridor you tested (and note that on
   `0.1.6-alpha.2` the host will not enforce it — that gate arrives later in the
   corridor), plus a capability probe for the seats you *can* survive without. The
   plugin version bump is what lets a user tell the broken build from the fixed one.
6. **Verify by cold mount, not by typecheck alone.** A dual-host build must be
   rendered on each host (the card's own recipe: branch on the supplied prop, degrade
   when neither exists). Junction-linked prebuilt bundles get no typecheck from the
   host upgrade; the only gate that fires is a real mount.

### 4.2 What the host could change so one entry's failure isolates to that entry

Move the boundary from the **list** to the **entry**: wrap each
`<DockEntry id=…>` in its own `SlotEntryBoundary` carrying `{ slot, entryId, pluginId }`,
keep the list container mounted, and let the failed entry alone render `null` (or an
inline "this entry failed" chip). Concretely:

- per-entry boundary with a stable `key` (slot + entry id + session) so a crash in one
  entry does not reset or remount the others;
- attribution in the existing `[dsh:slots]` channel: `entry "progress" failed and
  was isolated; 5 entries still mounted` — naming the culprit and proving the
  survivors, instead of a bulk "unmounted entries: …" list that hides who threw;
- a per-entry latch/disable for the session, so a deterministic crash does not
  re-throw on every remount while still being reported once;
- registration-time guard as well: catching errors at *mount* time (outside React's
  reach) and normalizing the standard kit per entry, so a missing prop becomes a typed
  "entry could not mount" event rather than a `TypeError` deep in a plugin bundle;
- boundaries do **not** catch event handlers, timers, or subscription callbacks, so
  the host should pair this with a service/event-level error channel if it wants a
  full isolation claim.

### 4.3 The trade-off the host faces

Isolation costs **uniformity and visibility**, and it is not free at runtime:

- **Isolation vs. one coherent list.** One boundary per entry means N extra components
  and N error states in a layout-sensitive list slot. A nulled child changes the flex
  geometry, so the dock silently re-flows and entries "jump" when a neighbour dies;
  the host must decide whether gaps are acceptable or whether a failed entry should
  hold its slot with a placeholder.
- **Containment vs. attribution.** The wider boundary is brutally effective at hiding
  bugs: today a third-party crash blanks the dock and looks like a host bug. Narrow
  boundaries contain it — and then it becomes *invisible*: a permanently blank entry
  in production with no console line a normal user will ever see. Isolation is only
  worth it if the host also accepts the reporting duty (structured, per-entry error
  events, ideally surfaced to the plugin author / plugin-manager page). Otherwise the
  host trades a loud outage for a silent one.
- **Availability vs. honesty.** A per-entry fallback (error chip, "entry disabled")
  tells the truth but adds permanent UI noise for every broken third party; a silent
  `null` keeps the composer clean but hides breakage. There is no setting that gives
  both, and the choice is product policy, not engineering.
- **Isolation vs. guarantee.** React boundaries only cover render/lifecycle. A
  per-entry boundary creates an *impression* of full isolation while event-handler and
  async failures still escape to the console (or to nowhere). The host should state the
  guarantee it actually provides rather than imply more than React can deliver.

The pragmatic split: **per-entry boundary + per-entry attributed reporting + entry
stays mounted with a neutral placeholder** — and the plugin-side discipline in §4.1,
because the host cannot be expected to survive a tenant that throws on an optional
field. The host fix contains the blast radius; only the plugin fix removes the blast.

---

## 5. Verification

### 5.1 Restoring both entries without a host restart

The fix is **client-half only** — A's `lib/client.js`, no host registration, no
composition row, no dependency change — so no `dsh` restart is required:

1. Rebuild plugin A in its repository, pinning the DSH client packages to the alpha.2
   cohort for the typecheck (`skipLibCheck: false`, and declare the packages that own
   the consumed declarations), so the alpha.2 seat is checked against real alpha.2
   types; keep a second typecheck against alpha.1 declarations to prove the legacy
   branch still compiles.
2. Because the install is a **junction**, the repo tree *is* the served tree: no copy
   into `node_modules` (and no rename-aside — that is what destroys source files in
   link installs).
3. Hard-refresh the browser page (Ctrl+Shift+R). On this corridor the client bundle is
   re-fetched per page load; the host process keeps serving. Verify in the Network
   panel that `plugin://dsh-external/dsh-ui-progress/lib/client.js` returns the new
   bytes (new hash/size, 200, no stale cache), and that the old call site at
   `client.js:219` is gone.
4. Confirm both dock entries in one pass, in the same console dump:
   - no `Uncaught TypeError`, no `[dsh:slots] input.dock boundary fallback active` line;
   - the React tree shows **both** `DockEntry id="dsh-paste-input-dock"` (order 5) and
     `DockEntry id="progress"` (order 20) under the same `DrawerErrorBoundary
     name="input.dock"`, i.e. two mounted entries under one boundary — coexistence, not
     alternation;
   - `[dsh:slots] input.dock: 2 entries mounted` and `input.left: 1 entry mounted` as
     before.
5. If HMR is enabled, also verify the toggle path (disable/enable A's row applies
   without a restart); without HMR, a row toggle needs a restart, which is why the
   refresh-only path in step 3 is the one to demonstrate.

### 5.2 Proving the alpha.2 seat is actually wired (not merely non-throwing)

- Create a pending approval or question in this session (and, separately, in a
  descendant subagent) → the strip's attention state / `data-pending` must appear,
  and the co-tenant chips must still be rendered at that moment.
- Resolve it → the badge clears; no re-render error.
- Toggle the third branch by pointing the same build at a kit without the seat (unit
  render with both optional props stripped) → strip renders state text, fill bar,
  todos %, token chip, elapsed/ETA; attention absent; exactly one `console.warn`; no
  boundary entry; co-tenant chips unaffected. This is the degradation regression, and
  it is the only way to exercise "neither seat".

### 5.3 The regression the verification must cover for plugin B specifically

B must be exercised **while the fixed strip is mounted** — "chips come back when A is
removed" is already known and would also pass if the fix had simply deleted A's entry:

1. **Coexistence:** with both entries mounted, paste one file → the chip rail appears
   in `conversation.input.dock` *and* the strip is still visible above it (two tenants,
   one list, one render pass). This is the exact path that was broken.
2. **First-paste-after-refresh**, the precise scenario that produced the one-off toast
   (`symptom-report.md:13`, `console-excerpt.txt:20`): refresh, paste immediately, chip
   appears. If it still fails here while the strip is healthy, B has the *second*
   alpha.2 problem and must be triaged separately — check whether its paste handler
   resolves the session through `SessionListState.current` (**DSH-0.1.6-A2-01**) and
   move it to `uiSession.adapter.current` / the `retainedBy.mainView` marker.
3. **Full chip lifecycle:** paste two or more files (multi-chip), remove one chip via
   B's injected `remove`, remove the last one (rail collapses cleanly, no empty
   container left behind), and drag-and-drop as a second input path if B supports it.
4. **Button path untouched:** `conversation.input.left` still opens the picker and a
   picked file produces a chip — proving the fix did not "restore" the rail by moving
   or reordering B's surfaces (`order: -100` / `order: 5` must be unchanged).
5. **Artifact identity:** B was reinstalled during triage, so confirm the served bundle
   is the build under test — repo `package.json` version, the junction target, and the
   served `lib/client.js` hash must agree; otherwise a "pass" may be measuring a
   different pinned tag than the bug report.
6. **Ordering independence:** temporarily reorder A (`order: 20` → `1`) or B
   (`order: 5` → `30`) in a scratch profile and confirm the chips still render. The
   original "B rendered first and still vanished" observation is the reason order must
   not be load-bearing; a real fix must not depend on render order.
7. **Isolation, not alternation (host-level, optional but decisive):** mount a
   deliberately throwing probe entry in the same dock list. Under the *current* host
   contract it blanks the list again; after the §4.2 host change it must isolate to
   the probe while B's chips and A's strip both survive. This is the only test that
   distinguishes "we fixed the culprit" from "we made the class of failure impossible".

---

## Appendix · evidence index and residual risk

**Evidence used (all read-only, `/app/fixture/`)**

| File | Contribution |
|---|---|
| `console-excerpt.txt:3-4` | the single throwing call and its frame |
| `console-excerpt.txt:8-12` | the mount stack: `SessionProgressBar` → `DockEntry` → one `DrawerErrorBoundary` → `InputDock` |
| `console-excerpt.txt:16-18` | both dock entries "unmounted", `input.left` still 1 mounted |
| `console-excerpt.txt:20` | no further errors / toast did not reappear → latched fallback |
| `plugin-a/SessionProgressBar-excerpt.tsx:11-12,24` | destructured prop, called unconditionally |
| `plugin-a/SessionProgressBar-excerpt.tsx:41-44` | registration is the normal, still-valid form |
| `plugin-b/dock-entry-excerpt.md:6-20` | button in `input.left`, chips in `input.dock` |
| `plugin-b/dock-entry-excerpt.md:22-25` | chips use no standard-kit hooks; own try/catch silent |
| `host-types/slots-contract-alpha1.d.ts:10` | alpha.1 pending hook exists |
| `host-types/slots-contract-alpha2.d.ts:12-14` | seat swapped to `useSessionStatus` (+ retain info) |
| `host-types/dock-render-tree.md:8-27` | per-slot boundaries, list-wide dock boundary, `null` fallback, reset on session switch |
| `tried-notes.txt:3-10,16-17` | reinstall, B's registration, the disable experiment, the colleague theory |

**Cards consulted (points only):** DSH-0.1.6-A2-02 (the removed pending seat and its
alpha.2 replacement — the direct hit); DSH-0.1.6-A2-01 (`SessionListState.current`
removal; the likely second, independent trap for B's paste handler); DSH-0.1.6-A2-03
(link-installed plugins sit outside plugin-manager management, so no re-resolve
happened); plus the corridor note that peer-range enforcement at install/startup only
arrives later (0.1.7-rc.1 card set), which is why a stale alpha.1 bundle loaded silently.

**Residual risk / not proven here**

- The one-off paste toast is unexplained by A alone; treat it as an open second-class
  lead for plugin B (A2-01 candidate) until §5.3.2 passes.
- Only two of six plugins were controlled; the other four dock tenants are unmeasured
  on alpha.2, and a silent (non-throwing) degradation would leave no console trace.
- A's remaining kit usage (`useConversation(...).views.get('chat')`, `chat.legacy`
  projection, `useProjection('todos')`) is unchanged across the two contracts, but
  later corridor edges do reshape projections — re-run the contract diff on the next
  host upgrade rather than assuming this fix is the last one.
- Host-side per-entry isolation (§4.2) is a recommendation for a host release; until
  it lands, every dock tenant remains able to blank the dock, so §4.1 discipline is the
  only defence available to a plugin author.
- No host process was started, no install/migration was run, and `/app/fixture/` was
  not modified (read-only verification task).


## Required output (JSON only)
{"decisions":[{"id":"<criterion-id>","verdict":"pass|partial|fail|missing","reason":"short"}],"caps":[{"id":"<cap-id>","triggered":false,"reason":"short"}]}
Every criterion and cap exactly once. pass=full points, partial=half, fail/missing=0; a triggered cap caps the total.