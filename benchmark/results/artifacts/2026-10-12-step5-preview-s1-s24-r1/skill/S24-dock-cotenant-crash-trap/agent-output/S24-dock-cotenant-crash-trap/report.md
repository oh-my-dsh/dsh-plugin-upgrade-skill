# S24 · The Dock That Vanished Together — diagnosis report (read-only evidence pack)

**Scope note**: analysis performed strictly read-only against
`fixture/` (symptom-report.md, console-excerpt.txt, tried-notes.txt,
plugin-a/SessionProgressBar-excerpt.tsx, plugin-b/dock-entry-excerpt.md,
host-types/slots-contract-alpha1.d.ts, host-types/slots-contract-alpha2.d.ts,
host-types/dock-render-tree.md) and the read-only skill reference
(`skills/plugin-upgrade/`, card **DSH-0.1.6-A2-02**). The fixture was not
modified; no migration, install, or host change executed.

**Verdict in one line**: Plugin A (`dsh-ui-progress`, id `progress`) throws on
its first render because the alpha.2 standard kit removed
`useSessionPendingInteraction`; the shared `DrawerErrorBoundary` around the
whole `conversation.input.dock` list then evicts co-tenant plugin B's chips
entry as collateral. Plugin B is the victim, not a second culprit.

---

## 1. Culprit attribution

**Who fails, at which call.** Plugin A's `SessionProgressBar` throws at
`SessionProgressBar-excerpt.tsx:24`:

```tsx
const pendingBySession = useSessionPendingInteraction(interactions => interactions)
```

`useSessionPendingInteraction` arrives as an undefined standard-kit prop, so the
call raises `Uncaught TypeError: useSessionPendingInteraction is not a function`
(console: `at SessionProgressBar (plugin://dsh-external/dsh-ui-progress/lib/client.js:219:41)`).
The call is unconditional and inside render, so it throws on the strip's very
first render after the upgrade — the strip was never rendered once on alpha.2.

**Why now — the standard-kit reduction between the two contracts.** Comparing
`host-types/slots-contract-alpha1.d.ts` with `slots-contract-alpha2.d.ts`, the
session standard kit (the `GlobalStandardProps` that
`@deepseek-ai/dsh-client-ui-session` merges into every slot's standard props)
changed, not the dock slot:

- **Unchanged in both**: `useConversation`, `useSessions`, `useProjection`,
  `useInput`, `inputActions`, and the slot itself
  (`conversation.input.dock`: list slot, session scope).
- **Removed**: `useSessionPendingInteraction:
  SnapshotSelectorHook<ReadonlyMap<SessionId, SessionPendingInteraction>>`.
- **Added**: `useSessionStatus:
  SnapshotSelectorHook<ReadonlyMap<SessionId, SessionStatus>>` (the
  `SessionStatus` record carries `running`, `completionUnread`, and
  `pendingInteraction`) plus `useSessionRetainInfo`.

This matches card DSH-0.1.6-A2-02 verbatim: the multi-instance session-reference
refactor swapped the dedicated pending-interaction hook for the unified status
hook. Plugin A compiled against alpha.1 types never saw this coming and kept
calling the removed seat.

**Why the innocent co-tenant vanishes with it — the mechanism.**
`conversation.input.dock` is a **list slot**: per
`host-types/dock-render-tree.md`, the shell mounts *all* entries under a
*single* shared `DrawerErrorBoundary name="input.dock"` inside `<InputDock>`,
and `DockEntry` adds **no boundary of its own**. When plugin A's entry throws
during render, React unmounts the boundary's entire subtree and renders its
fallback (`null`). Both `DockEntry` children — plugin B's
`dsh-paste-input-dock` (order 5) *and* `progress` (order 20) — are unmounted as
co-tenants of the throwing entry. This is **co-tenant contamination through the
slot's list-level error boundary**: the blast radius of one tenant's crash is
the whole slot, not the crashing entry. The console log states exactly this:

```
[dsh:slots] input.dock boundary fallback active (session s-7f3a); unmounted
            entries: dsh-paste-input-dock, progress
```

The boundary resets only on the next session switch, so the eviction is sticky.
Plugin B's own code never executed against anything broken — it simply never
got to render at all.

**Why the attach button survives while the chips do not.** Plugin B's attach
button is registered into a *different* slot, `conversation.input.left`, which
mounts under a *different* boundary instance
(`DrawerErrorBoundary name="input.left"` inside `<InputLeft>`), entirely outside
`<InputDock>`. React error boundaries isolate only their own subtree, so the
`input.left` boundary is untouched by the dock crash. The console confirms it:
`[dsh:slots] input.left: 1 entry mounted (dsh-paste-input-button)`. The chips
live in `conversation.input.dock` — the same slot and the same single boundary
as the thrower — so they die with it. The slot identity of a surface, not the
plugin's overall health, decides survival: same boundary, evicted; different
boundary, unscathed. (Consistent with the DSH-0.1.7-A1 card: one throw
"vanishes the whole slot entry".)

---

## 2. The experiment (tried-notes.txt item 3)

Disabling plugin A from the plugin list and refreshing → plugin B's chips
returned immediately; re-enabling A → chips vanished again.

**What it proves.** Removing the only throwing entry stops the shared boundary
from tripping, and the dock recovers instantly. Plugin B's dock entry therefore
has no independent defect on alpha.2 in the observed path: it renders fine the
moment the thrower is gone. Combined with the console (exactly one error, stack
wholly inside `SessionProgressBar`) and B's own silent try/catch, the experiment
localizes the fault to plugin A and identifies the propagation channel as the
shared `input.dock` boundary, not as anything in B's render path.

**What it does not prove.**

- **It does not prove plugin B is bug-free on alpha.2.** It only exercises the
  configuration *with A absent*. It says nothing about B's other alpha.2
  touchpoints — notably event-time session resolution: card DSH-0.1.6-A2-01
  removed `SessionListState.current`, and a paste/drop plugin's handlers are the
  first-hand victim class of that removal (upstream fixed exactly this in
  `dsh-paste-input v0.1.27`). The experiment never touches B's handlers.
  "Not the observed fault" ≠ defect-free.
- **It does not prove the strip crash is the only dock problem.** One
  controlled variable (A present/absent) can only isolate one failure mode. It
  covers neither the other entries in the dock list (the render tree shows
  `...` — six plugins are installed) nor latent non-throwing breakage inside the
  strip itself. A missing `current` field (A2-01) is a *silent* no-op — no
  throw, invisible to this experiment.

**Why reinstalling B could never have helped.** A reinstall replaces B's bundle
with an identical copy from its mirror. But B's code is not the defect: the
single throw is in A, B's try/catch logged nothing, and with A still enabled the
dock boundary trips on A's first render and evicts B's dock entry regardless of
B's build. You cannot cure a co-tenant's eviction by reinstalling the victim;
the poison entry stays mounted either way.

**What is wrong with the colleague's "both plugins were hit" theory.**
Three independent refutations:

1. The console shows exactly **one** error, and its stack is entirely inside
   `SessionProgressBar`. If two plugins threw, there would be a second stack in
   `AttachmentChips`; there is none.
2. B's dock entry uses **no standard-kit hooks at all** — it reads only its own
   injected state (`dock-entry-excerpt.md`). The removed prop cannot hit code
   that never destructured it.
3. The experiment refutes it directly: if B were independently broken by the
   removal, disabling A would leave the chips missing (B's *own* failure would
   still trip the same boundary). The chips came back instantly, which is only
   possible if there was exactly one fault (A) plus one propagation mechanism
   (the shared boundary). "Fix both plugins' registrations" would have wasted
   time on B and missed the real defect in A.

---

## 3. The fix — graceful degradation for the removed seat

```tsx
/**
 * SessionProgressBar (excerpt): the session-progress strip registered into the
 * 'conversation.input.dock' slot by the session-progress plugin (plugin A).
 * Dock entry props arrive as the slot runtime's standard kit.
 *
 * DSH-0.1.6-A2-02: the alpha.2 session standard kit removes
 * useSessionPendingInteraction and supplies useSessionStatus instead
 * (SessionStatus carries running / completionUnread / pendingInteraction).
 * The pending read is therefore resolved from whichever hook the host actually
 * supplies; when neither is present the attention signal degrades to "nothing
 * pending" instead of throwing.
 */
export type SessionProgressBarProps =
  import('@deepseek-ai/dsh-client-ui-slots').PropsRuntime<'conversation.input.dock'>
  & PropsLocale<'progress'>

const EMPTY_PENDING: ReadonlyMap<SessionId, SessionPendingInteraction> = new Map()

export function SessionProgressBar({
  session, sessionId, t, useConversation, useProjection, useSessions,
  useSessionPendingInteraction,
  useSessionStatus,
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
  const pendingBySession = usePendingBySession({
    useSessionPendingInteraction,
    useSessionStatus,
  })
  const ownPending = pendingKindOf(pendingBySession.get(sessionId)?.kind)
  const subPending = subagentPendingState(
    useSessions(s => s.byId), pendingBySession, sessionId)
  const pending = ownPending !== null || subPending.approvals > 0 || subPending.questions > 0

  // Background state: main conversation idle while descendant subagent
  // sessions keep executing - must not read as done-green.
  const subRunning = subagentRunningCount(useSessions(s => s.byId), sessionId)

  return (
    <div className={css.bar} data-pending={pending || undefined}>
      {/* state text, fill bar, todos percent, token chip, elapsed/eta */}
    </div>
  )
}

/**
 * Pending-interaction map, folded from whichever hook the host supplies:
 *   alpha.1: useSessionPendingInteraction
 *            -> ReadonlyMap<SessionId, SessionPendingInteraction> (used as-is)
 *   alpha.2: useSessionStatus
 *            -> ReadonlyMap<SessionId, SessionStatus>; the kind is folded out
 *               of status.pendingInteraction into the shape the strip already
 *               consumes. For a single-session read the direct form is
 *               useSessionStatus(s => s.get(sessionId)?.pendingInteraction).
 *   neither: empty map — nothing is ever reported as pending.
 *
 * The set of standard-kit props is fixed per host build, so the branch below
 * is stable across renders and hook order never flips mid-session. Selection
 * happens by capability (typeof), never by parsing a version string.
 */
function usePendingBySession({
  useSessionPendingInteraction,
  useSessionStatus,
}: {
  useSessionPendingInteraction?: SnapshotSelectorHook<ReadonlyMap<SessionId, SessionPendingInteraction>>
  useSessionStatus?: SnapshotSelectorHook<ReadonlyMap<SessionId, SessionStatus>>
}): ReadonlyMap<SessionId, SessionPendingInteraction> {
  if (typeof useSessionPendingInteraction === 'function') {
    return useSessionPendingInteraction(interactions => interactions)
  }
  if (typeof useSessionStatus === 'function') {
    const statuses = useSessionStatus(statuses => statuses)
    const folded = new Map<SessionId, SessionPendingInteraction>()
    for (const [id, status] of statuses) {
      const kind = status?.pendingInteraction?.kind
      if (kind !== undefined) folded.set(id, { kind })
    }
    return folded
  }
  return EMPTY_PENDING
}
```

- **Which hook supplies the pending state on alpha.2**: `useSessionStatus` —
  `session.pendingInteraction` on the `SessionStatus` record
  (`useSessionStatus(s => s.get(sessionId)?.pendingInteraction)`), with the
  whole-map fold used here because the strip's subagent walk (matching card
  DSH-0.1.6-A2-02's recipe) needs pending info for descendant sessions too.
- **What degrades on a host supplying neither pending hook**: only the
  *attention signal* — `data-pending` never lights, `ownPending` stays `null`,
  and `subPending.approvals/questions` stay `0`; the strip reads "nothing
  pending" even when waits exist. **What keeps working**: the session guard
  (`session == null → null`), running state (`session.running`), the tool
  name/`legacy` via `useConversation`, todos percent via `useProjection`, the
  token chip, elapsed/eta, and the subagent-running count via `useSessions` —
  every one of those hooks/props is unchanged in both contracts. The strip
  degrades to a "run state + todos + usage bar" without the attention
  highlight; it does not vanish.
- **Why silent degradation, not throwing**: this is a *resident* dock entry
  under a *shared* list-level boundary — the exact production evidence shows
  that one throw unmounts the entire dock (co-tenants included) and stays
  unmounted until the next session switch. A silent degradation confines the
  loss to the one optional feature, keeps plugin B's chips mounted next to it,
  and leaves the rest of the strip functional. A missing pending hook is a
  recoverable capability gap in an evolving standard kit; taking the dock (and
  six other plugins' surfaces) hostage over one indicator is strictly worse.
  The `typeof` guards also make the fix a single build that serves alpha.1,
  alpha.2, and hosts that supply neither — exactly the "pick the hook by which
  prop the host supplies … degrade to an empty state when neither is present"
  recipe from the card.

---

## 4. Multi-tenant hygiene

**What the dock tenant should do (plugin author side):**

1. **Treat the standard kit as a capability-checked contract, not a fixed
   schema.** Feature-detect every kit member you use (`typeof x === 'function'`
   or `in` before destructure/use) and degrade missing ones. Props removed
   between host tags come through as `undefined` and only blow up on call —
   detection turns that into a code path.
2. **Compile against the contract of the host you actually run on** — against
   the alpha.2 `dsh-client-ui-slots` types, `useSessionPendingInteraction` in the
   destructure is a *compile error*, so the reduction can never ship silently.
   For one build serving multiple hosts, type the moved props as optional and
   branch on availability (the branch is stable because the prop set is fixed
   per host).
3. **Wrap your entry in your own local error boundary** (a small class
   component rendering `null`/minimal fallback around your registered
   component, or a try/catch for the non-hook logic). The host's list-level
   boundary is a last resort; a tenant-local boundary contains your own defect
   to your own entry.
4. **Keep hook order stable across renders** for any capability branches, and
   never call a standard-kit hook conditionally on a value that can flip
   mid-process.
5. Keep event-time session resolution (A2-01 family: no `sessions.current`) on
   the token/adapter path, with guards — silent no-ops are the other failure
   class this upgrade introduced.

**What the host could change (host side):** move isolation *inward* — give
each `DockEntry` its own error boundary (one boundary per entry, inside
`DockEntry`, as the render tree shows is possible: `input.left` already gets a
dedicated instance) instead of one boundary per slot list, so one entry's
failure unmounts *only that entry* (optionally rendering a lightweight
placeholder), with the other entries of the same slot untouched.

**The trade-off the host faces:** per-entry isolation converts "one bad entry
blanks the whole dock" (loud, painful, but impossible to miss) into "one entry
is silently blank" (graceful for every co-tenant, but a dead entry looks like a
plugin that rendered nothing — failures become easy for users *and maintainers*
to overlook, so the host owes per-entry diagnostics/logging in exchange, plus a
fallback policy decision: `null` vs placeholder vs retry, and new per-entry
reset semantics to replace the current slot-wide "reset on next session
switch"). A secondary, sharper cost: with the boundary even a *crash-looping*
entry re-throws on every parent re-render, so a shared boundary makes one
poison pill repeatedly blank the whole dock on any state change; per-entry
boundaries bound that retry surface to the offender's own subtree. Isolation
and fail-loudness trade against each other; the host picks which one it sells.

---

## 5. Verification

**Restoring BOTH dock entries without a host restart.** The fix is a
client-plane change (`lib/client.js` for plugin A), so per migration-hygiene
rule 3 it takes effect on a **browser hard refresh** — no host restart. The
plugins are junction/link-installed (six external plugins), and
disable/enable from the plugin list re-triggers registration; the dock boundary
also resets on the next session switch. Sequence:

1. With both plugins enabled, rebuild/link the fixed plugin A and hard-refresh
   the web client (no `dsh web` restart).
2. Console must show **no** `useSessionPendingInteraction is not a function`
   and **no** `[dsh:slots] input.dock boundary fallback active` line.
3. The composer mount tree must show `DockEntry id="dsh-paste-input-dock"` **and**
   `DockEntry id="progress"` side by side under the single `input.dock`
   boundary.
4. Paste one *and then several* files: the chip rail renders above the composer,
   chip add/remove works, the `input.left` attach button remains mounted.
5. The strip renders run state / todos percent / token chip; and to prove the
   alpha.2 read is wired: create a pending approval in the session and confirm
   `data-pending` lights via `useSessionStatus` (on an alpha.1 host the same
   build must light it via `useSessionPendingInteraction`; on a host supplying
   neither, the strip renders with the attention feature silently absent).
6. Switch sessions (the boundary reset point) and confirm both entries
   remount — no fallback, no console error.

**Regression coverage required for plugin B specifically.** B's verification
must run **with plugin A enabled** — the maintainer's passing observation was
taken in the wrong control (A disabled). Concretely: the chip-rail render path
must be re-tested in the exact configuration that failed (A enabled and
resident), covering (a) a *first* paste and *subsequent* pastes — previously the
second paste produced no toast at all, because the dead dock broke the paste
flow; (b) chip add and chip remove lifecycle through B's own injected state;
(c) B's attachment button staying mounted in `input.left` even while the dock
has entries mounted/shared; (d) both of B's surfaces registered — `input.left`
*and* `input.dock` — mounted in the same tree; and (e) remount of B's dock
entry across a session switch with A enabled, since the slot reset is the exact
moment a regression would reappear. In short: B's regression test is
**co-tenant coexistence** — healthy dock *plus* healthy neighbor — not merely
"chips render after disabling the other plugin".

---

### Appendix · evidence map

| Claim | Evidence |
|---|---|
| Single fault, in plugin A | console-excerpt.txt (one stack, `SessionProgressBar` only) |
| Removed standard-kit prop | slots-contract-alpha1.d.ts:10 vs slots-contract-alpha2.d.ts:11-13; card DSH-0.1.6-A2-02 |
| Co-tenant eviction mechanism | dock-render-tree.md (shared `DrawerErrorBoundary` per list slot, `DockEntry` has no own boundary) + console `input.dock boundary fallback active … unmounted entries: dsh-paste-input-dock, progress` |
| Attach-button survival | dock-render-tree.md (`input.left` boundary outside `InputDock`) + console `input.left: 1 entry mounted` |
| Experiment interpretation | tried-notes.txt items 1-4 |
| B reads no kit hooks | plugin-b/dock-entry-excerpt.md |
| Fix + degradation recipe | card DSH-0.1.6-A2-02 migration recipe; examples/04 dual-cohort pattern (capability branch, not version parsing) |
