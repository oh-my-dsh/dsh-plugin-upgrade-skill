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
#### FILE: S24-dock-cotenant-crash-trap-report.md

# S24 · The Dock That Vanished Together — Analysis Report

## 1. Culprit attribution

**The actual failure is plugin A** (`dsh-ui-progress`, the session-progress strip), at this
exact call in `SessionProgressBar`:

```ts
const pendingBySession = useSessionPendingInteraction(interactions => interactions)
```

The console error is unambiguous: `Uncaught TypeError: useSessionPendingInteraction is not a function`
at `SessionProgressBar (plugin://dsh-external/dsh-ui-progress/lib/client.js:219:41)`.
The function is `undefined` because the alpha.2 standard kit **removed**
`useSessionPendingInteraction` from `SessionStandardProps` for `conversation.input.dock`:

- alpha.1 (`slots-contract-alpha1.d.ts`): includes `useSessionPendingInteraction:
  SnapshotSelectorHook<ReadonlyMap<SessionId, SessionPendingInteraction>>`.
- alpha.2 (`slots-contract-alpha2.d.ts`): replaces it with **`useSessionStatus`**
  ("Per-session status: running, completionUnread, pendingInteraction") and adds
  `useSessionRetainInfo`. The pending-interaction data was folded into the per-session
  `SessionStatus` map after the multi-instance refactor; the standalone hook is gone.

Plugin A destructures the removed prop and calls it unconditionally → TypeError on first render.

**Why the innocent co-tenant (plugin B's chips) disappears too — the mechanism:**
per `host-types/dock-render-tree.md`, both dock entries mount inside **one shared**
`<DrawerErrorBoundary name="input.dock">`, and `DockEntry` adds no per-entry boundary.
When plugin A's entry throws, the boundary's `getDerivedStateFromError` renders `null`
for the **entire subtree** — the whole `InputDock` contents. The console confirms:
`[dsh:slots] input.dock boundary fallback active … unmounted entries: dsh-paste-input-dock, progress`.
So plugin B's chip rail (`id: dsh-paste-input-dock`, order 5) is unmounted as collateral,
even though its code never ran or threw.

**Why the attach button survives:** plugin B's `AttachButton` is registered into a
**different slot**, `conversation.input.left`, which has its **own**
`<DrawerErrorBoundary name="input.left">`. The console line
`[dsh:slots] input.left: 1 entry mounted (dsh-paste-input-button)` shows that boundary never
tripped. Isolation exists at slot granularity, not entry granularity — same slot, same fate;
different slot, unaffected.

## 2. The experiment

The disable-experiment (disable plugin A → chips return; re-enable → chips vanish) **proves**:

- The chip-rail loss is **caused by plugin A's crash**, not by anything in plugin B's own
  code path. It is a clean A/B control on a single variable.
- Combined with the console (only one error, from plugin A; plugin B's own try/catch logged
  nothing), it proves plugin B's chips were unmounted by the shared boundary fallback.

It does **NOT** prove:

- That plugin B is bug-free on alpha.2 in general — only that its dock entry's disappearance
  here was collateral. (Its chips use no standard-kit hooks, so the removed prop cannot hit
  it, but the experiment alone doesn't certify the whole plugin.)
- That the strip crash is the **only** dock problem. It shows plugin A's crash is the
  cause of the observed chip loss; it cannot exclude an independent, currently masked
  alpha.2 issue in plugin B that would only surface once the boundary stops falling back.
  Final verification (§5) must re-check plugin B after A is fixed.

**Why reinstalling plugin B could never help:** plugin B was never broken — its registration
succeeds, its render path throws nothing. The failure lives in plugin A's call to a removed
hook, and the disappearance is a host-side boundary unmount. Reinstalling B changes none of
those three facts.

**The colleague's "both plugins were hit" theory is wrong** because:
- There is exactly **one** error in the console, and its stack is 100% inside plugin A.
- Plugin B uses **no standard-kit hooks at all** (reads only its own injected state), so no
  slot-prop change can throw inside it.
- If both were independently broken, disabling A would not have restored B's chips — but it
  did, immediately. That control result falsifies the two-independent-bugs theory.

## 3. The fix

On alpha.2 the pending state comes from **`useSessionStatus`**
(`ReadonlyMap<SessionId, SessionStatus>`, whose entries carry `pendingInteraction`).
The corrected component degrades gracefully when neither pending hook is present:

```tsx
export function SessionProgressBar({
  session, sessionId, t, useConversation, useProjection, useSessions,
  useSessionPendingInteraction,   // alpha.1 only — may be undefined on alpha.2
  useSessionStatus,               // alpha.2 — may be undefined on alpha.1
}: SessionProgressBarProps) {
  if (session === undefined || session === null) return null
  const chat = useConversation(c => c.views.get('chat'))
  const legacy = chat?.legacy ?? EMPTY_LEGACY
  const todos = useProjection('todos')
  const toolName = runningTool(legacy)
  const running = session.running

  // Pending state: prefer alpha.2's useSessionStatus, fall back to alpha.1's
  // useSessionPendingInteraction, degrade silently to "no pending" if neither exists.
  const pendingBySession =
    typeof useSessionStatus === 'function'
      ? mapStatusToPending(useSessionStatus(s => s))            // SessionStatus.pendingInteraction
      : typeof useSessionPendingInteraction === 'function'
        ? useSessionPendingInteraction(interactions => interactions)
        : EMPTY_PENDING_MAP                                      // graceful degradation
  const ownPending = pendingKindOf(pendingBySession.get(sessionId)?.kind)
  const subPending = subagentPendingState(useSessions(s => s.byId), pendingBySession, sessionId)
  const pending = ownPending !== null || subPending.approvals > 0 || subPending.questions > 0

  const subRunning = subagentRunningCount(useSessions(s => s.byId), sessionId)

  return (
    <div className={css.bar} data-pending={pending || undefined}>
      {/* state text, fill bar, todos percent, token chip, elapsed/eta */}
    </div>
  )
}
```

- **Hook supplying pending state on alpha.2:** `useSessionStatus` (the `pendingInteraction`
  field of each `SessionStatus` entry).
- **What degrades** on a host supplying neither pending hook: only the *attention/pending
  indicator* — the `data-pending` attribute (amber/attention styling and any pending-derived
  badge). **What keeps working:** running state, tool name, fill bar, todos percent, token
  chip, elapsed/eta, and the subagent-running "not done-green" logic (that derives from
  `useSessions`, which exists in both contracts).
- **Why silent degradation, not a throw:** this component is a co-tenant in a shared error
  boundary. Throwing unmounts the entire `input.dock` slot — every other plugin's dock entry
  (here, plugin B's chips). A missing cosmetic signal must never be escalated into a
  slot-wide outage; the strip must render its core and simply omit the pending flourish.

## 4. Multi-tenant hygiene

**Tenant-side:** a dock tenant should (a) defensively guard every standard-kit prop it
consumes (`typeof x === 'function'` checks / optional chaining with fallbacks), especially
across host version ranges; (b) degrade cosmetic features silently instead of throwing;
(c) where feasible, wrap its own render in its own error boundary so even an unexpected
internal throw isolates to its own entry; (d) declare/test against the host contracts it
supports rather than assuming prop stability across minor versions.

**Host-side:** the shell can mount **one `DrawerErrorBoundary` per `DockEntry`** instead of
one per slot, so a failing entry's fallback is just that entry rendered as `null`, and it can
log/flag the failed entry id. **Trade-off:** per-entry boundaries add one class component and
its state/reset machinery around every entry in every list slot (more React nodes, more
boundary resets to coordinate — the current boundary resets on session switch; per-entry
boundaries must each decide when to retry, e.g. on next render pass vs. next session, or a
crashed entry stays hidden indefinitely). It also slightly fragments UX: with a slot-level
boundary the whole dock area fails consistently; per-entry isolation can leave a dock with a
hole where one entry silently vanished, which is better for robustness but can be more
confusing to notice/debug.

## 5. Verification

Without a host restart, client-plugin changes hot-reload via the HMR receiver **only while
`pnpm run dev:web` is running**; otherwise rebuild the plugin bundle and hard-refresh the page.

Steps:
1. Patch plugin A as in §3, rebuild its client bundle, reload the page (same session is fine).
2. Confirm in F12: no `useSessionPendingInteraction is not a function` error, and no
   `[dsh:slots] input.dock boundary fallback active` line.
3. Confirm plugin A: the progress strip renders (state text, fill, todos %, token chip), and
   the pending indicator still lights up when an approval/question is pending (proving the
   `useSessionStatus` path works).
4. Confirm plugin B (co-tenant restored): paste a file — the chip rail appears above the
   composer and chips are removable. This verifies the boundary no longer falls back and B's
   entry remounts.
5. **Regression required for plugin B specifically:** the disable-experiment only proved B's
   chip loss was collateral; it did not certify B on alpha.2. So after A is fixed, exercise
   plugin B's full dock surface on alpha.2: paste, drag-drop, chip removal, multi-file paste,
   and confirm the attach button plus chips together. This closes the gap the experiment left
   open — that no independent alpha.2 issue in B was masked behind the boundary fallback.
6. Negative check: temporarily force plugin A to throw (or test on a host build with neither
   pending hook) and confirm the strip still renders minus the pending indicator, and plugin
   B's chips remain — proving the degradation is silent.


## Required output (JSON only)
{"decisions":[{"id":"<criterion-id>","verdict":"pass|partial|fail|missing","reason":"short"}],"caps":[{"id":"<cap-id>","triggered":false,"reason":"short"}]}
Every criterion and cap exactly once. pass=full points, partial=half, fail/missing=0; a triggered cap caps the total.