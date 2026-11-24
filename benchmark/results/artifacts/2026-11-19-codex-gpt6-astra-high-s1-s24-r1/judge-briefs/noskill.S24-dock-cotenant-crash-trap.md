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

# S24 — Dock co-tenant crash diagnosis and repair plan

## Attribution and mechanism

Plugin A, the session-progress plugin (`dsh-ui-progress`), is the observed culprit. Its `SessionProgressBar` calls:

```tsx
const pendingBySession = useSessionPendingInteraction(interactions => interactions)
```

That exact call fails: the console records `TypeError: useSessionPendingInteraction is not a function` at `plugin://dsh-external/dsh-ui-progress/lib/client.js:219:41`. This is a render-time failure before the strip can return its UI, not a failed registration or intentional collapse.

The sealed contracts explain why the upgrade exposed it. Alpha.1's session standard kit supplied `useSessionPendingInteraction`, selecting a map of pending interactions keyed by session ID. Alpha.2 removes that seat; it supplies `useSessionStatus`, selecting a map of statuses that includes `pendingInteraction`, and adds `useSessionRetainInfo`. `useConversation`, `useSessions`, `useProjection`, `useInput`, and `inputActions` remain. The component still destructures and unconditionally invokes the old seat. Destructuring an absent property succeeds; invoking the resulting undefined value throws. Pending information has moved, so alpha.2 can retain the attention feature through `useSessionStatus` rather than discard it.

The second symptom is collateral unmounting through a shared React error boundary. The render-tree note places BOTH `dsh-paste-input-dock` (order 5) and `progress` (order 20) under ONE `DrawerErrorBoundary` named `input.dock`. Neither `DockEntry` supplies an individual boundary. When A throws, that shared boundary renders null for its whole subtree. The console explicitly confirms fallback activation and unmounting of both entries. Order 5 does not protect B from a later sibling's crash.

B's attach button (`dsh-paste-input-button`) instead lives in `conversation.input.left`, below a separate `input.left` boundary. It is outside the failed dock subtree and survives, as the console confirms. The boundary scope, not plugin identity, determines which surfaces disappear. B's local try/catch around its fold scan cannot catch A's sibling render exception.

## What the experiment establishes

Disabling A and refreshing immediately restores B's chips on alpha.2; re-enabling A makes them disappear again. Together with the stack and mount tree, this demonstrates that A's enabled, crashing dock entry causes the observed loss of B's rail through the shared fallback. B's rail can register and render on this host when that failure is removed.

It does NOT establish that B is bug-free on alpha.2, that every attachment workflow works, or that A's exception is the only possible dock problem. The fallback unmounts other entries and may hide later failures. The pack contains no complete plugin repositories or exhaustive runtime tests. One logged error is sufficient to explain both observed disappearances, but is not an exhaustive compatibility audit.

Reinstalling the same B version cannot repair A's missing hook call or change the host's shared boundary. It therefore could not resolve this demonstrated cause. Even remounting B alone would not clear the latched parent fallback. The colleague's two-independent-removed-props theory is unsupported and conflicts with the excerpt: B's chip renderer uses only its own injected state and NO standard-kit hooks. Both plugins lose a surface, but only A is shown to be incompatible with this removed seat. Neither registration needs speculative renaming or reordering.

## Corrected component excerpt

Use alpha.2's `useSessionStatus` first, extracting `status.pendingInteraction` into the same map shape consumed by the existing own/subagent helpers. Fall back to the legacy selector on older hosts, then to an empty map if neither capability exists. Test function availability, not version strings.

The following is a replacement for the supplied component excerpt, retaining its existing helpers, locale types, CSS and omitted UI calculations. The pack lacks those definitions and the full JSX, so this is not represented as a compiled full-repository patch. `PendingMap` derives the shape required by the existing subtree helper; no independent pending-kind vocabulary is invented.

Separate adapter components keep React hook order stable even if the available kit changes: changing the selected adapter remounts its subtree. The outer session guard also mounts/unmounts a child rather than conditionally skipping hooks within the same component.

```tsx
type DockProps =
  import('@deepseek-ai/dsh-client-ui-slots')
    .PropsRuntime<'conversation.input.dock'>
  & PropsLocale<'progress'>

type PendingMap = Parameters<typeof subagentPendingState>[1]
type PendingValue = PendingMap extends ReadonlyMap<infer K, infer V>
  ? V : never

type PendingSelectorHook = <T>(
  selector: (snapshot: PendingMap) => T
) => T

// Compile against alpha.2; explicitly model older/limited hosts at the edge.
type CompatProps = Omit<DockProps, 'useSessionStatus'> & {
  useSessionStatus?: DockProps['useSessionStatus']
  useSessionPendingInteraction?: PendingSelectorHook
}

type ActiveProps = Omit<CompatProps, 'session'> & {
  session: NonNullable<CompatProps['session']>
}

const EMPTY_PENDING: PendingMap =
  new Map<CompatProps['sessionId'], PendingValue>()

export function SessionProgressBar(props: CompatProps) {
  if (props.session == null) return null
  const active: ActiveProps = { ...props, session: props.session }

  if (typeof props.useSessionStatus === 'function') {
    return <StatusProgress
      {...active} useSessionStatus={props.useSessionStatus}
    />
  }
  if (typeof props.useSessionPendingInteraction === 'function') {
    return <LegacyProgress
      {...active}
      useSessionPendingInteraction={props.useSessionPendingInteraction}
    />
  }
  return <NoPendingProgress {...active} />
}

function StatusProgress(props: ActiveProps & {
  useSessionStatus: NonNullable<CompatProps['useSessionStatus']>
}) {
  const { useSessionStatus } = props
  const statuses = useSessionStatus(snapshot => snapshot)
  const pendingBySession =
    new Map<CompatProps['sessionId'], PendingValue>()
  for (const [id, status] of statuses) {
    if (status.pendingInteraction != null) {
      pendingBySession.set(id, status.pendingInteraction)
    }
  }
  return <ProgressBody {...props} pendingBySession={pendingBySession} />
}

function LegacyProgress(props: ActiveProps & {
  useSessionPendingInteraction: PendingSelectorHook
}) {
  const { useSessionPendingInteraction } = props
  const pendingBySession =
    useSessionPendingInteraction(interactions => interactions)
  return <ProgressBody {...props} pendingBySession={pendingBySession} />
}

function NoPendingProgress(props: ActiveProps) {
  return <ProgressBody {...props} pendingBySession={EMPTY_PENDING} />
}

function ProgressBody({
  session, sessionId, t, useConversation, useProjection, useSessions,
  pendingBySession,
}: ActiveProps & { pendingBySession: PendingMap }) {
  const chat = useConversation(conversation => conversation.views.get('chat'))
  const legacy = chat?.legacy ?? EMPTY_LEGACY
  const todos = useProjection('todos')
  const sessionsById = useSessions(s => s.byId)
  const toolName = runningTool(legacy)
  const running = session.running
  // Keep existing percent / turn / elapsed / eta / usage derivation here.

  const ownPending = pendingKindOf(pendingBySession.get(sessionId)?.kind)
  const subPending =
    subagentPendingState(sessionsById, pendingBySession, sessionId)
  const pending = ownPending !== null ||
    subPending.approvals > 0 || subPending.questions > 0
  const subRunning = subagentRunningCount(sessionsById, sessionId)

  return (
    <div className={css.bar} data-pending={pending || undefined}>
      {/* Keep existing state text, fill bar, todos percent, token chip,
          elapsed/eta, and descendant-running presentation here. */}
    </div>
  )
}
```

On alpha.2, map ALL statuses, not just the current session: the strip must still expose descendant-subagent approval/question waits. On alpha.1 the legacy map supplies this data. With neither hook, only pending-interaction attention detection degrades: own pending kind, descendant approval/question counts, and their attention styling/text are unavailable. An empty map means pending information is unavailable, not proof there are no real waits. Running/tool state, todos/progress, token usage, timing, and descendant-running detection continue through their existing inputs. In particular, keep `subagentRunningCount` so active descendants are not incorrectly presented as done-green.

This optional-capability degradation must be silent: no render throw, repeated toast, or blocking error for an absent pending hook. Throwing to announce missing optional information would reproduce the dock-wide outage and sacrifice unrelated features and co-tenants. The code assumes the remaining required kit and existing helpers behave as described; it does not blanket-catch arbitrary hook failures.

## Isolation hygiene

A dock tenant should validate optional capabilities before calling them and keep unsupported optional features nonfatal. It should also wrap its actual rendering component in a tenant-owned React error boundary whose fallback affects only that entry. The boundary must be ABOVE `SessionProgressBar`; placing a boundary only inside its returned JSX cannot catch errors in that component's own hook/render execution. Keep the boundary wrapper itself simple and nonthrowing. Ordinary try/catch around JSX construction does not catch descendant React render failures. Async/event failures need their own handling; render boundaries do not catch every category of failure.

The host can place a boundary around EACH `DockEntry`, inside the list, with an entry-local fallback and an appropriate reset key/retry mechanism. It may retain an outer boundary for failures of the list infrastructure itself. Per-entry isolation preserves healthy siblings at the cost of more boundaries, per-entry error/reset state, logging/retry policy, and decisions about partial or inconsistent UI versus the simpler all-or-nothing list fallback. Isolation is valuable here because entries belong to independent plugins, but it is an explicit resilience/complexity trade-off.

## Verification plan — no host process restart

These are proposed checks, not tests executed against a running host. No running host or complete buildable plugin source is included in the pack.

1. In the real plugin checkout, apply the change and build/type-check its client bundle against alpha.2. Deploy/reload the changed client through the project's supported plugin/frontend reload mechanism. If no hot reload is available, refreshing the web page after the rebuilt bundle is served can load it without restarting the host process. Confirm the browser actually loaded the new artifact.
2. Clear the old boundary failure state. The supplied `DrawerErrorBoundary` stays latched until a session switch; changing A's source alone is insufficient. Switch away from the failing session and back after loading the fix (a full page refresh also reconstructs the client tree). Keep both A and B enabled for the restoration check.
3. In the same session, confirm the progress strip renders and remains visible. Paste a fresh file and confirm B's chip rail also renders; check DevTools for BOTH `progress` and `dsh-paste-input-dock`, with no active dock fallback or missing-hook exception. The left attach button should also remain available, but seeing that button alone is not evidence of dock recovery.
4. Specifically regress B's actual paste/drop and attachment lifecycle: paste and drop supported files, verify chips and their names/count, remove a chip, add another file, and repeat the paste after the first attempt. Confirm the injected add/remove state and visible rail stay synchronized, including after switching sessions. This covers the observed rail failure and the first-paste-only toast observation; do not substitute a static mount check or toast check for real attachment rendering. Where the full product supports submission, verify the retained attachments are submitted correctly using a disposable test session.
5. Verify A on alpha.2 with an own-session pending wait and a descendant-subagent approval/question, then resolve them and confirm attention updates. Exercise normal running, descendant-only running, todos, token display and timing. Separately exercise a legacy-hook-only kit and a kit with neither pending hook: the latter must retain the basic strip and B's functioning rail without any throw. Test a null-to-present session transition and adapter changes to catch hook-order regressions.
6. If tenant/host boundaries are added, intentionally throw in a disposable test tenant and verify only that entry falls back while B still accepts and renders pasted attachments. Do not introduce such faults into the supplied fixture.

Evidence limits: all conclusions above are drawn from the provided evidence files and the solver instruction. The fixture was read only; no install, migration, source edit, host restart, network access, or runtime validation was performed. No skills, sibling cells, previous answers, tests, verifiers, scoring files, credentials, or memories were consulted. Full implementation and live validation require the real plugin checkout and a running host; these do not block this evidence-based report.



## Required output (JSON only)
{"decisions":[{"id":"<criterion-id>","verdict":"pass|partial|fail|missing","reason":"short"}],"caps":[{"id":"<cap-id>","triggered":false,"reason":"short"}]}
Every criterion and cap exactly once. pass=full points, partial=half, fail/missing=0; a triggered cap caps the total.