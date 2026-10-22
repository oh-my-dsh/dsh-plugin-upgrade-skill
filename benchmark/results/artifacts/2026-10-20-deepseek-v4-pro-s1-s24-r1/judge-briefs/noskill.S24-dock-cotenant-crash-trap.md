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

# S24 · The Dock That Vanished Together — Analysis & Fix

## 1. Culprit attribution

**The failing plugin is plugin A** (the session-progress plugin, whose built
bundle is `dsh-external/dsh-ui-progress`), in its `SessionProgressBar`
component. Plugin B (the paste/attachment plugin) is the innocent co-tenant.

**Exact call.** The single F12 error is:

```
Uncaught TypeError: useSessionPendingInteraction is not a function
    at SessionProgressBar (plugin://dsh-external/dsh-ui-progress/lib/client.js:219:41)
```

That maps to the first line of the attention-state block in
`SessionProgressBar-excerpt.tsx`:

```ts
const pendingBySession = useSessionPendingInteraction(interactions => interactions)
```

Because `useSessionPendingInteraction` was destructured from the slot's
standard-kit props but no longer exists, it is `undefined`, and calling it
throws `TypeError: ... is not a function`.

**Why now.** Between the two sealed contracts the standard kit for
`conversation.input.dock` entries was reduced. In
`slots-contract-alpha1.d.ts` the kit exposed
`useSessionPendingInteraction: SnapshotSelectorHook<ReadonlyMap<SessionId, SessionPendingInteraction>>`.
In `slots-contract-alpha2.d.ts` that prop is gone — it was replaced, after the
multi-instance refactor, by
`useSessionStatus: SnapshotSelectorHook<ReadonlyMap<SessionId, SessionStatus>>`
(whose `SessionStatus` carries `running`, `completionUnread`, and
`pendingInteraction`), and by `useSessionRetainInfo`. Plugin A was written
against alpha.1 and was never updated, so on alpha.2 it reads a prop the host no
longer supplies.

**Why the innocent co-tenant's dock entry disappears with it — the mechanism.**
Both surfaces are registered into the *same* `conversation.input.dock` slot
(plugin B's `AttachmentChips` at order 5, plugin A's `progress` at order 20).
`dock-render-tree.md` shows that this slot is one list wrapped by a single
error boundary:

```
<InputDock>
  <DrawerErrorBoundary name="input.dock">
    <DockEntry id="dsh-paste-input-dock" />   (plugin B)
    <DockEntry id="progress" />               (plugin A)
    ...
  </DrawerErrorBoundary>
</InputDock>
```

`DrawerErrorBoundary` is a standard React class boundary whose
`getDerivedStateFromError` renders `null` as its fallback. React boundaries
contain the *entire subtree* beneath them: when `SessionProgressBar` throws
during render, the nearest boundary is the shared `input.dock` boundary, so its
`null` fallback unmounts **every** entry in the slot — including plugin B's
chips. The console confirms it:

```
[dsh:slots] input.dock boundary fallback active (session s-7f3a); unmounted
            entries: dsh-paste-input-dock, progress
[dsh:slots] input.left: 1 entry mounted (dsh-paste-input-button)
```

**Why the attach button survives.** The attach button lives in a *different*
slot, `conversation.input.left`, which has its own `DrawerErrorBoundary
name="input.left"` wrapping a separate `SlotEntry id="dsh-paste-input-button"`.
It is a sibling subtree outside the `input.dock` boundary, so the error never
propagates there and the button keeps rendering.

## 2. The experiment (the decisive control)

The maintainer disabled plugin A and refreshed: plugin B's chips came back
immediately; re-enabling A removed them again.

**What it proves.** It is a clean control isolating the single causal variable —
plugin A's presence. It proves plugin A's failing render is the **sole root
cause** of the *observed* two-symptom breakage: plugin B's dock entry is a
collateral casualty of A's crash under the shared `input.dock` boundary, not an
independent failure. When A is removed, the boundary never trips, so B's
`AttachmentChips` mount normally.

**What it does not prove.**
- It does **not** prove plugin B is "bug-free" on alpha.2 in general — only that
  B's chips render when A is absent. (That said, B is in fact compatible here: per
  `dock-entry-excerpt.md`, `AttachmentChips` reads only its own injected
  state and uses **no** standard-kit hooks, so it could not have been hit by the
  prop removal.)
- It does **not** prove the strip crash is the ONLY dock problem. Disabling A
  tests B in isolation but exercises A not at all, so it cannot reveal any
  further fault in A or in other dock tenants. It only proves the *B symptom* is
  collateral.

**Why reinstalling plugin B could never help.** B was never broken. Reinstalling
B swaps B's code, but A still throws the same `useSessionPendingInteraction is
not a function` on alpha.2, the shared boundary still falls back to `null`,
and B's entry is still unmounted. The fault is in A; no amount of B redeployment
touches it.

**What is wrong with the colleague's "both plugins were hit" theory.** It
confuses one failure surfacing in two places with two failures. The two plugins
do not share a removed prop: only A destructures `useSessionPendingInteraction`.
B uses no standard-kit hooks at all. And the control refutes it directly — if
both plugins had been independently broken by the upgrade, disabling A could not
have restored B. The decisive experiment shows B is a single-fault casualty, not
a second victim.

## 3. The fix (graceful degradation for the removed seat)

On alpha.2 the pending state is supplied by **`useSessionStatus`** (per-session
status whose `SessionStatus` includes `pendingInteraction`), replacing the
removed `useSessionPendingInteraction`.

The feature that degrades on a host supplying **neither** pending hook is the
**pending-attention indicator** — the strip's surfacing of the session's own
pending waits plus the subagent subtree's approvals/questions (the "sidebar hides
subagent rows — this strip surfaces them" behavior). The parts that keep working
are everything built on the hooks that still exist on alpha.2
(`useConversation`, `useProjection`, `useSessions`): running-state text,
fill bar, todos percent, token chip, and elapsed/eta.

The degradation must be **silent** (render without the pending indicator, never
throw) because this entry sits inside the *shared* `input.dock` boundary: any
throw from one tenant unmounts the whole slot and takes down every co-tenant —
exactly the failure this task is about.

```tsx
/**
 * SessionProgressBar (corrected): resilient to the alpha.1 -> alpha.2
 * standard-kit reduction in the 'conversation.input.dock' slot.
 *   alpha.1 -> useSessionPendingInteraction
 *   alpha.2 -> useSessionStatus (SessionStatus.pendingInteraction)
 */
export type SessionProgressBarProps =
  import('@deepseek-ai/dsh-client-ui-slots').PropsRuntime<'conversation.input.dock'>
  & PropsLocale<'progress'>

const EMPTY_STATUS: ReadonlyMap<SessionId, SessionStatus> = new Map()
const EMPTY_PENDING: ReadonlyMap<SessionId, SessionPendingInteraction> = new Map()

export function SessionProgressBar(props: SessionProgressBarProps) {
  const {
    session, sessionId, t,
    useConversation, useProjection, useSessions,
    useSessionStatus,             // alpha.2 kit (replaces the removed hook)
    useSessionPendingInteraction, // alpha.1 kit (removed on alpha.2)
  } = props

  if (session === undefined || session === null) return null

  const chat = useConversation(c => c.views.get('chat'))
  const legacy = chat?.legacy ?? EMPTY_LEGACY
  const todos = useProjection('todos')
  const toolName = runningTool(legacy)
  const running = session.running
  // ... percent / turn / elapsed / eta derivation unchanged ...

  // Pending-attention state (degradable). Read whichever hook the host
  // supplies and fall back to an empty map when neither exists. The slot kit is
  // stable for the life of the entry, so this selection never flips between
  // renders and hook order is preserved. A missing hook MUST degrade silently:
  // throwing here would trip the shared input.dock boundary and unmount every
  // co-tenant (this is exactly how the paste chips disappeared).
  const status = useSessionStatus ? useSessionStatus(s => s) : EMPTY_STATUS
  const pendingInteractions = useSessionPendingInteraction
    ? useSessionPendingInteraction(i => i)
    : EMPTY_PENDING

  const ownPending = useSessionStatus
    ? pendingKindOf(status.get(sessionId)?.pendingInteraction?.kind)
    : pendingKindOf(pendingInteractions.get(sessionId)?.kind)

  // subagentPendingState widened to accept the alpha.2 status map (reads
  // entry.pendingInteraction for descendant subagent approvals/questions).
  const subPending = useSessionStatus
    ? subagentPendingState(useSessions(s => s.byId), status, sessionId)
    : subagentPendingState(useSessions(s => s.byId), pendingInteractions, sessionId)

  const pending =
    ownPending !== null || subPending.approvals > 0 || subPending.questions > 0

  // Background state (unchanged; useSessions still exists on alpha.2).
  const subRunning = subagentRunningCount(useSessions(s => s.byId), sessionId)

  return (
    <div className={css.bar} data-pending={pending || undefined}>
      {/* state text, fill bar, todos percent, token chip, elapsed/eta */}
    </div>
  )
}
```

## 4. Multi-tenant hygiene

**What a dock tenant should do.** A tenant must never let its own render throw
into a shared boundary. Two complementary steps: (a) feature-detect every
optional standard-kit prop and degrade silently instead of assuming it exists
(as in §3); and (b) wrap its own entry content in a local error boundary (or a
self-guarded render) so that even an unexpected throw is contained to that entry
rather than bubbling to the slot-level boundary. Treat every hook from the slot
kit as optional and removable across host versions.

**What the host could change.** Move isolation from the slot level to the entry
level: give **each `DockEntry` its own `DrawerErrorBoundary`** (or an
equivalent per-entry boundary) instead of one boundary around the whole list.
Then one entry's failure renders `null` for that entry only and the remaining
entries — the co-tenants — stay mounted.

**The trade-off the host faces.** A single slot-level boundary is loud and cheap:
one failure is immediately visible (the fallback log lists every unmounted
entry). Per-entry boundaries buy isolation but each broken entry now fails
*silently* (a lone missing chip/strip with no aggregated signal), so the host
must add per-entry fallback/telemetry and per-entry reset to keep failures
observable and debuggable. The host therefore trades central observability and
simplicity for availability/isolation — and must pay for it with extra
instrumentation so "isolated" does not become "hidden".

## 5. Verification

Client plugin code reloads without restarting the dsh host process (HMR for the
external plugin bundles). After applying the §3 fix to plugin A's
`SessionProgressBar`, save the module; the dev watcher recompiles and the
client applies the update in place (no host restart, no reinstall).

Then, in the same running session, confirm both dock entries are mounted and
healthy:

1. F12 console shows **no** `useSessionPendingInteraction is not a function`
   error and **no** `input.dock boundary fallback active` line; instead
   `[dsh:slots] input.dock` reports both `progress` and
   `dsh-paste-input-dock` mounted.
2. The session-progress strip renders (running state, todos percent, token chip,
   elapsed/eta) — confirming A itself is back.
3. Paste a file: the chip rail renders above the composer, and the attach button
   in `input.left` is still present.

**Regression that must specifically cover plugin B.** Re-verify B with A
enabled *and active*, not just disabled: paste one file, then a second, and
confirm the chips render and add/remove correctly through B's own injected state
(`add` / `remove`) while A's strip sits in the same `input.dock` slot
beside it — i.e. B's entry survives A's presence now that A no longer throws.
Also confirm a pending subagent approval/question (the state that exercises A's
degraded indicator path on alpha.2) does not remove B's chips, and that B's
attach button remains mounted in `input.left`. This closes the exact
collateral-crash path from the original symptom.


## Required output (JSON only)
{"decisions":[{"id":"<criterion-id>","verdict":"pass|partial|fail|missing","reason":"short"}],"caps":[{"id":"<cap-id>","triggered":false,"reason":"short"}]}
Every criterion and cap exactly once. pass=full points, partial=half, fail/missing=0; a triggered cap caps the total.