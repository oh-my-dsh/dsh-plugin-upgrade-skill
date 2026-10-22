# S24 · The Dock That Vanished Together — Diagnosis & Fix

Corridor: `dsh-v0.1.6-alpha.1 → dsh-v0.1.6-alpha.2` (npm global, Windows, web profile).
Evidence: `symptom-report.md`, `console-excerpt.txt`, `tried-notes.txt`,
`plugin-a/SessionProgressBar-excerpt.tsx`, `plugin-b/dock-entry-excerpt.md`,
`host-types/slots-contract-alpha{1,2}.d.ts`, `host-types/dock-render-tree.md`.

---

## 1. Culprit attribution

**The failing plugin is plugin A** — the session-progress plugin (`dsh-ui-progress`),
whose `SessionProgressBar` registers into the `conversation.input.dock` slot as id
`progress` (order 20).

**Exact call that throws**: `SessionProgressBar` destructures
`useSessionPendingInteraction` out of the dock slot's standard props and calls it
unconditionally:

```ts
const pendingBySession = useSessionPendingInteraction(interactions => interactions)
```

On alpha.2 that prop no longer exists in the slot kit, so the destructured value is
`undefined`, and invoking `undefined(...)` raises
`Uncaught TypeError: useSessionPendingInteraction is not a function`
(`console-excerpt.txt` line 1, thrown at `client.js:219:41` inside
`SessionProgressBar`).

**Why now — the standard-kit reduction**: between the two contracts the
`GlobalStandardProps` that `@deepseek-ai/dsh-client-ui-session` merges into every slot
(including `conversation.input.dock`) swapped `useSessionPendingInteraction` out and
put `useSessionStatus` + `useSessionRetainInfo` in; `useSessions` stays. The two
type excerpts show exactly this:

- alpha.1 declares `useSessionPendingInteraction: SnapshotSelectorHook<ReadonlyMap<SessionId, SessionPendingInteraction>>`;
- alpha.2 replaces it with `useSessionStatus: SnapshotSelectorHook<ReadonlyMap<SessionId, SessionStatus>>` and adds `useSessionRetainInfo: UseSessionRetainInfo`.

(Key point + card: `useSessionPendingInteraction` removed, `useSessionStatus`/
`useSessionRetainInfo` added, `useSessions` unchanged — **DSH-0.1.6-A2-02**.)

**Why the innocent co-tenant disappears with it — the mechanism**: a single shared React
error boundary. `conversation.input.dock` is a *list* slot; every entry (each wrapped in
`DockEntry`) is mounted under one `DrawerErrorBoundary name="input.dock"`. When plugin
A's component throws during render, the error bubbles to that nearest boundary. Its
fallback is `null`, and `DockEntry` adds no boundary of its own — so the **entire**
`input.dock` list unmounts, including plugin B's `dsh-paste-input-dock` entry. The
console trace is direct evidence of this:
`[dsh:slots] input.dock boundary fallback active … unmounted entries: dsh-paste-input-dock, progress`.

**Why the attach button survives while the chips do not**: plugin B's attach button is
registered in a *different* slot, `conversation.input.left` (id
`dsh-paste-input-button`, order -100). That slot is a sibling subtree `<InputLeft>` with
its *own* `DrawerErrorBoundary name="input.left"`. A React error boundary only catches
errors from its own subtree; the throw inside `<InputDock>` never reaches `<InputLeft>`,
so the button keeps rendering. The chips, however, share `input.dock` with the crashing
strip, so they are unmounted as collateral.

---

## 2. The experiment

**What it proves**: plugin A's render throw is the **single root cause of both symptoms**.
Disabling A removes the throw → the `input.dock` boundary never trips → B's chips render
again. Re-enabling A → the throw returns → the boundary nulls the whole dock → B's chips
vanish again. It is decisive evidence that B's disappearance is collateral damage, not an
independent defect, and that there is exactly one render error.

**What it does NOT prove**:

- It does **not** prove plugin B is bug-free on alpha.2. It only proves B's dock entry
  renders in isolation under the current `input.dock` slot. B's `AttachmentChips` uses
  **zero** standard-kit hooks (only `inject: sessionId => ({ remove, add })`), so this
  experiment exercises none of B's code against any alpha.2 API change. In particular it
  says nothing about B's **non-slot** paths — e.g. the paste/drop handler that may resolve
  the "current" session through the removed `SessionListState.current`
  (key point + card: `SessionListState.current` removed; resolve the main Session via
  `ctx.uiSession.adapter.current.getSnapshot()` or the `retainedBy.mainView` marker —
  **DSH-0.1.6-A2-01**). That latent breakage only surfaces when the paste path runs, and the
  disable-experiment never exercised it.
- It does **not** prove the strip crash is the *only* dock problem. It proves the strip
  crash fully explains the currently observed symptoms; it cannot rule out other latent
  incompatibilities that would surface only on other code paths (e.g. the same A2-01 in B's
  paste handler). "No other problem visible right now" ≠ "no other problem exists."

**Why reinstalling plugin B could never help**: B was never the faulty plugin, and the
crash is not in B's code at all — it is in A calling a host hook that alpha.2 removed.
Reinstalling the identical B from its mirror tag changes nothing about A's throw and
nothing about the host-supplied props. Wrong plugin, wrong remedy.

**What's wrong with the "both plugins were hit" theory**: it assumes two independent
removals. But B's chips touch no standard-kit prop, so the prop removal cannot "hit" B's
render. The experiment falsifies the theory directly: if both were independently broken,
disabling A would not restore B. The parsimonious explanation — one throw, one shared
boundary, two visible symptoms — fits every piece of evidence.

---

## 3. The fix

**Hook that supplies pending state on alpha.2**: `useSessionStatus` — read it as
`useSessionStatus(s => s.get(sessionId)?.pendingInteraction)` (its `SessionStatus`
record also carries `running` and `completionUnread`).

**Which feature degrades**: the pending-attention highlight (`data-pending`) — surfacing
this session's own pending waits plus the subagent subtree's approvals/questions. That is
the only feature that depended on the removed hook.

**Which parts keep working**: running state, the fill bar, todos percent, the token chip,
elapsed/eta, and the subagent-running background ("not done-green") state — all derived
from `session`, `useConversation`, `useProjection`, and `useSessions`, all of which
survive on both hosts.

**Why degradation must be silent rather than throwing**: a throw from render is exactly
what took the dock down in the first place. If the degraded branch re-threw, it would
re-trigger `DrawerErrorBoundary` and once again null the whole `input.dock` list,
re-inflicting the co-tenant collateral. A missing optional seat is non-fatal: render the
strip without the pending highlight, never crash the shared slot.

```tsx
export type SessionProgressBarProps =
  import('@deepseek-ai/dsh-client-ui-slots').PropsRuntime<'conversation.input.dock'>
  & PropsLocale<'progress'>

// alpha.2 nests the pending interaction one level deeper inside SessionStatus
// than alpha.1's bare SessionPendingInteraction entry.
const pendingInteractionOf = (entry) =>
  entry != null && 'pendingInteraction' in entry ? entry.pendingInteraction : entry

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
  // ... percent / turn / elapsed / eta derivation unchanged ...
  const sessionsById = useSessions(s => s.byId)

  // Pending-attention state. alpha.1 supplied useSessionPendingInteraction;
  // alpha.2 replaced it with useSessionStatus. The prop set is fixed per host,
  // so this branch is stable across renders. A host that supplies NEITHER hook
  // degrades silently (no pending highlight) instead of throwing and taking the
  // shared input.dock boundary down with it.
  const pendingBySession = typeof useSessionStatus === 'function'
    ? useSessionStatus(status => status)                           // alpha.2
    : typeof useSessionPendingInteraction === 'function'
      ? useSessionPendingInteraction(interactions => interactions) // alpha.1
      : undefined                                                  // degraded

  const ownPending = pendingBySession == null
    ? null
    : pendingKindOf(pendingInteractionOf(pendingBySession.get(sessionId))?.kind)
  const subPending = pendingBySession == null
    ? EMPTY_SUBPENDING
    : subagentPendingState(sessionsById, pendingBySession, sessionId)
  const pending = ownPending !== null || subPending.approvals > 0 || subPending.questions > 0

  // Background state: main conversation idle while descendant subagent
  // sessions keep executing - must not read as done-green.
  const subRunning = subagentRunningCount(sessionsById, sessionId)

  return (
    <div className={css.bar} data-pending={pending || undefined}>
      {/* state text, fill bar, todos percent, token chip, elapsed/eta */}
    </div>
  )
}
```

Note: `subagentPendingState` must unwrap entries through the same
`pendingInteractionOf` accessor when it walks the map (its inputs differ by host shape),
so it never reads `.kind` straight off a `SessionStatus` record.

---

## 4. Multi-tenant hygiene

**What a dock tenant should do** so its own crash cannot take down co-tenants:

- Treat the slot standard-kit as **optional**: feature-detect each hook prop
  (`typeof hook === 'function'`) before calling it, and degrade to a fallback when absent
  — never call a destructured hook unconditionally.
- Wrap its own render in a **local error boundary** (or otherwise avoid throwing from
  render); return `null`/a reduced UI for a missing optional capability instead of
  raising, so a failure stays inside the entry.

**What the host could change** to isolate one entry's failure to that entry:

- Give each `DockEntry` its **own error boundary** (per-entry isolation), so a throw
  unmounts only that entry rather than the entire list slot. (Today there is a single
  `DrawerErrorBoundary` around the whole list, and `DockEntry` adds none.)

**The trade-off the host faces**: blast-radius containment vs. failure observability and
overhead. Per-entry boundaries keep co-tenants alive, but they turn "the dock disappears"
into "one entry silently goes blank", which can hide real breakage from the user and the
developer (no console spillover, no obvious symptom) and adds a wrapper boundary per entry
(extra React layers, per-entry reset/state subtleties, more complexity).

---

## 5. Verification

**Verify both entries return without a host restart** (the fix is a client-bundle change;
the host process is not restarted):

1. Rebuild the client bundle (the HMR watcher reloads it automatically if running;
   otherwise rebuild) and **hard-refresh** the browser — the client bundle is re-served on
   each refresh.
2. Console is clean: no `useSessionPendingInteraction is not a function` and no
   `[dsh:slots] input.dock boundary fallback active`.
3. Plugin A's strip is back: the `progress` entry is mounted and shows running state,
   todos percent, and the token chip.
4. Paste a file: plugin B's chip rail renders again (the `dsh-paste-input-dock` entry is
   mounted alongside `progress` under `input.dock`), and the attach button
   (`dsh-paste-input-button` under `input.left`) is still present.

**Regression to cover for plugin B specifically**: exercise the full paste flow to rule out
the independent alpha.2 breakage the disable-experiment could not reach —
`SessionListState.current` removal (**DSH-0.1.6-A2-01**):

- With a session open, paste a file → the chip appears **and** the attachment is attributed
  to the *current* session.
- Switch the main-view session and paste again → the attachment follows the newly current
  session.
- With no session open → clean toast/graceful no-op, no throw.

This closes the gap the disable-experiment left open: it proved B's slot *render* is fine,
but not that B's event-time session resolution survived alpha.2.
