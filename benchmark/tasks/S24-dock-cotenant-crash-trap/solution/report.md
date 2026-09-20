# S24 · Reference Answer · The Dock That Vanished Together

## 1. Culprit attribution

**Plugin A (the session-progress strip) is the only crashing plugin.** The console
error names it precisely:

```
TypeError: useSessionPendingInteraction is not a function
    at SessionProgressBar (plugin://dsh-external/dsh-ui-progress/...)
```

Why now: the dock's standard kit was reduced between the two contracts. alpha.1's
`SessionStandardProps` carried `useSessions` and `useSessionPendingInteraction`;
alpha.2's carries only `useConversation`, `useInput`, `inputActions`. Plugin A's
component destructures the two removed seats and calls them unconditionally:

```ts
const pendingBySession = useSessionPendingInteraction(interactions => interactions)  // throws
const subPending = subagentPendingState(useSessions(s => s.byId), ...)
const subRunning = subagentRunningCount(useSessions(s => s.byId), sessionId)
```

The first call throws `TypeError: undefined is not a function` during render.

**Why plugin B's chips vanish too**: the dock is a list slot whose entries all mount
under ONE shared `DrawerErrorBoundary` (see `dock-render-tree.md`). React error-boundary
semantics unmount the entire boundary subtree on any child's render throw — so the
crashing strip takes the innocent `dsh-paste-input-dock` entry down with it. The attach
button survives because it lives in `conversation.input.left`, a DIFFERENT slot mounted
under a different boundary: same plugin, different subtree.

## 2. The experiment

The disable-experiment (disable A → B's chips return; enable A → chips gone) proves:

- the chips' absence is caused by A's presence — a render-crash coupling, not a
  registration/dependency problem in B;
- B's own render path is functional enough to display once the boundary stops
  unmounting.

It does NOT prove:

- that B is fully alpha.2-compatible (B could have other, non-render issues — e.g.
  event-time session resolution — that this experiment cannot see);
- that A's crash is the only dock problem (a second, non-throwing defect in A or B
  would survive this experiment).

**Why reinstalling B could never help**: B was never broken. Its registration is
intact, its render uses no standard-kit hooks, and nothing it does throws. Reinstalling
replaces code that is not the fault.

**The colleague's theory is half right for the wrong reason**: the kit did change, but
only ONE plugin was hit. "Both plugins use a removed prop" is false — B uses no
standard-kit hooks at all. The correct reading is "one plugin was hit; the shared
boundary multiplied the symptom".

## 3. The fix (graceful degradation)

```ts
// Module-level stable fallbacks (reference identity must never move):
const EMPTY_BY_ID: Record<SessionId, SessionSummary> = {}
const EMPTY_INTERACTIONS: ReadonlyMap<SessionId, SessionPendingInteraction> = new Map()

export function SessionProgressBar({
  session, sessionId, t, useConversation, useProjection, useSessions,
  useSessionPendingInteraction,
}: SessionProgressBarProps) {
  if (session === undefined || session === null) return null
  // ... chat/todos/running/percent/elapsed derivation unchanged ...
  const chat = useConversation(conversation => conversation.views.get('chat'))
  const todos = useProjection('todos')
  const running = session.running

  // alpha.2: both seats removed from the standard kit - degrade instead of throw.
  const pendingBySession =
    useSessionPendingInteraction?.(interactions => interactions) ?? EMPTY_INTERACTIONS
  const sessionsById = useSessions?.(s => s.byId) ?? EMPTY_BY_ID
  const ownPending = pendingKindOf(pendingBySession.get(sessionId)?.kind)
  const subPending = subagentPendingState(sessionsById, pendingBySession, sessionId)
  const subRunning = subagentRunningCount(sessionsById, sessionId)
  // ... render unchanged ...
}
```

**What degrades**: the amber "pending human interaction" attention state and the
subagent pending/running indicators (own pending label, subtree waits, background
counter) — they read as absent. **What keeps working**: running/thinking state, todos
percent, tool name, elapsed/ETA, token usage, interrupted state — everything derived
from `session`, `useConversation`, and `useProjection`, which all survive.

**Why silent**: a dock tenant that throws does not just lose its own strip — it unmounts
every co-tenant. A missing indicator is a cosmetic degradation; a throw is a
multi-plugin outage. Degradation must therefore never escalate to a throw.

**Full function later**: subagent pending/running state now lives in the `uiSession`
service's status domain (`sourceFor(owner)` / the `PendingInteractionDomain`); the
plugin re-adds detection by integrating with that service (its own fiber, not the dock
standard kit).

## 4. Multi-tenant hygiene

**Tenant-side**: destructure defensively (optional chaining + stable empty fallbacks)
so a missing seat degrades instead of throwing — the pattern above. A tenant may also
wrap its own subtree in a local error boundary so that even a genuine bug unmounts only
its own entry, not the shared list.

**Host-side**: mount each dock entry under its OWN error boundary (per-entry isolation),
rendering a small "entry failed" placeholder for the crashed one. Trade-off: per-entry
boundaries add nesting and make cross-entry layout coordination (the dock is one visual
row) slightly harder, and a half-rendered dock row may look worse than an empty one —
which is presumably why alpha.2 kept one shared boundary. The isolation fix shifts the
blast radius from "everyone" to "the culprit", which is the right default for a
multi-tenant slot.

## 5. Verification

- Rebuild plugin A, reload the page (no host restart needed — the plugin's client
  bundle is fetched per boot-combo revision; a refresh pulls the new combo): BOTH the
  strip and paste chips must render together.
- Regression for plugin B specifically: paste one file → the chip rail shows the chip;
  remove it from the chip → the dock stays mounted; paste a second file → a numbered
  chip appears. B's flow must not depend on A's presence anymore (the original
  experiment's inverse: with A ENABLED, B works).
- For A: verify the degraded indicators are merely absent (no console errors), and the
  surviving features (running state, todos percent, token chip) still update live.
