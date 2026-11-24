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
#### FILE: S24-dock-cotenant-crash-trap/report.md

# S24: shared dock crash diagnosis and proposed fix

## Scope and basis

Mode A, read-only diagnosis. Plan: compare the supplied console, control experiment and contracts; attribute the failure; propose component-only compatibility handling and isolation; provide a verification procedure. BENCHMARK-AUTH-v1 authorizes this report. No installation, migration, profile edit, host restart, verifier, or runtime test was executed. Fixture and skill are unchanged.

Read `skills/plugin-upgrade/SKILL.md`, the full `references/v0.1.6-alpha.2.md` corridor, the corridor index, pre-flight guidance, and relevant preceding-edge material. Primary evidence is the nine supplied fixture files. Applicable card: DSH-0.1.6-A2-02; DSH-0.1.6-A2-01 supplies a separate plugin-B regression to check; A2-03 qualifies link-install reload assumptions. The corridor is exactly 0.1.6-alpha.1 → 0.1.6-alpha.2, not the older 0.1.2 alpha corridor.

Installation identity: npm-global `@deepseek-ai/dsh`, Windows web profile, six junction-linked external plugins; host restart and hard refresh already reported. Plugin A is `dsh-ui-progress`; plugin B's entries are `dsh-paste-input-dock` and `dsh-paste-input-button`. Full source repositories, plugin versions, lockfiles, dependency cohorts, Node version and repository SHAs are not supplied and were not guessed. Only the UI/slot touchpoint is directly demonstrated; the evidence pack cannot support a fleet-wide compatibility audit.

## 1. Culprit and collateral damage

Plugin A fails in `SessionProgressBar` at this exact expression:

```tsx
useSessionPendingInteraction(interactions => interactions)
```

`console-excerpt.txt` identifies `TypeError: useSessionPendingInteraction is not a function` at `plugin://dsh-external/dsh-ui-progress/lib/client.js:219:41`. This is a render-time call to a missing standard-kit hook, not a failure of plugin B's registration or file-paste interception.

The alpha.1 contract supplies `useSessionPendingInteraction`, a selector over a map from session ID to pending interaction. The alpha.2 kit removes that seat and adds `useSessionStatus` and `useSessionRetainInfo`. The former supplies records containing `pendingInteraction`, `running` and `completionUnread`; the latter supplies reference counts, not pending interaction state. `useSessions`, `useConversation`, `useProjection`, `useInput`, and `inputActions` remain. `conversation.input.dock` remains a session-scoped list slot. A cast or dependency reinstall cannot make the host inject the removed seat.

The mechanism is shared React error-boundary containment with a boundary wider than an individual tenant. In `host-types/dock-render-tree.md`, both `DockEntry` children sit inside ONE `DrawerErrorBoundary name="input.dock"`. `DockEntry` adds no boundary. A's render throw reaches that shared boundary, whose fallback is `null`; React discards/unmounts the entire protected dock subtree, including B's earlier, order-5 entry as well as A's order-20 entry. Registration order does not provide failure isolation. The console explicitly reports both IDs unmounted.

The attach button is under `InputLeft` and its separate `DrawerErrorBoundary name="input.left"`, outside the failed dock boundary. Thus it remains mounted, as the console confirms. B's local try/catch around its own fold scan cannot catch a sibling's render failure or prevent the host from unmounting B. The missing chips are collateral damage, not evidence of a second thrown error.

## 2. What the experiment establishes

`tried-notes.txt` records a reversible control: disable A and refresh → B's chips immediately return; re-enable A → chips disappear again. Combined with the single error and explicit boundary log, this establishes A as the trigger for the observed shared-dock disappearance in this configuration, and demonstrates that B can render chips on alpha.2 when that trigger is removed.

It does NOT establish that B is bug-free on alpha.2, that every paste/drop/submit/session-switch path works, or that A's throw is the only possible dock defect. The null fallback can mask additional errors in children that no longer mount. Re-test after fixing the first crash.

Reinstalling the same B code could not repair A's unconditional call or narrow the host's boundary. B already registered and the supplied `AttachmentChips` path consumes its own injected state, not any standard-kit hook. A future changed B could have unrelated fixes, but that is not the attempted reinstall and does not address this cause. The colleague is right that the standard props changed, but the claim that both plugins consumed a removed prop contradicts B's supplied excerpt and the control experiment. Two missing surfaces do not imply two independent compatibility faults. No B slot-registration rewrite is justified by this evidence.

## 3. Corrected component excerpt

Use `useSessionStatus` on alpha.2 and normalize ALL sessions' `pendingInteraction` records into the map consumed by the existing own/subagent helpers. Reading only the current session would lose descendant approval/question indications. Retain the alpha.1 hook as an optional fallback and use a stable empty map when neither seat exists.

The following replaces the supplied component excerpt. Existing helpers, styling, locale types, derived metrics and visual markup remain from the actual plugin; these were omitted by the evidence pack and are not invented here. Local types are derived from the existing helper signature to avoid guessing the package that exports the pending-interaction type. Separate adapter components make hook order stable even if the available hook set changes: React remounts the selected adapter instead of conditionally changing hooks inside one component.

```tsx
import { useMemo } from 'react'

type DockProps =
  import('@deepseek-ai/dsh-client-ui-slots').PropsRuntime<'conversation.input.dock'>
  & PropsLocale<'progress'>

type PendingMap = Parameters<typeof subagentPendingState>[1]
type PendingValue = PendingMap extends ReadonlyMap<infer K, infer V> ? V : never
type SessionKey = DockProps['sessionId']
type SelectorHook<S> = <T>(selector: (snapshot: S) => T) => T
// Only the status field consumed here; host records may contain other fields.
type StatusMap = ReadonlyMap<SessionKey, {
  pendingInteraction?: PendingValue | null
}>

type CommonProps = Omit<DockProps,
  'useSessionPendingInteraction' | 'useSessionStatus'>
export type SessionProgressBarProps = CommonProps & {
  useSessionPendingInteraction?: SelectorHook<PendingMap>
  useSessionStatus?: SelectorHook<StatusMap>
}
const EMPTY_PENDING: PendingMap = new Map<SessionKey, PendingValue>()
const identityPending = (value: PendingMap) => value
const identityStatus = (value: StatusMap) => value

export function SessionProgressBar(props: SessionProgressBarProps) {
  // This wrapper calls no hooks, so entering/leaving an unbound session is safe.
  if (props.session == null) return null
  if (typeof props.useSessionStatus === 'function') {
    return <StatusProgress {...props} useStatus={props.useSessionStatus} />
  }
  if (typeof props.useSessionPendingInteraction === 'function') {
    return <LegacyProgress {...props}
      usePending={props.useSessionPendingInteraction} />
  }
  // Optional attention capability unavailable: no throw, toast or error UI.
  return <ProgressBody {...props} pendingBySession={EMPTY_PENDING} />
}

function StatusProgress(props: CommonProps & {
  useStatus: SelectorHook<StatusMap>
}) {
  const statuses = props.useStatus(identityStatus)
  // Normalize outside the store selector; do not allocate a fresh selected
  // snapshot on every getSnapshot call.
  const pendingBySession = useMemo<PendingMap>(() => {
    const pending = new Map<SessionKey, PendingValue>()
    for (const [id, status] of statuses) {
      if (status.pendingInteraction != null) {
        pending.set(id, status.pendingInteraction)
      }
    }
    return pending
  }, [statuses])
  return <ProgressBody {...props} pendingBySession={pendingBySession} />
}

function LegacyProgress(props: CommonProps & {
  usePending: SelectorHook<PendingMap>
}) {
  const pendingBySession = props.usePending(identityPending)
  return <ProgressBody {...props} pendingBySession={pendingBySession} />
}

function ProgressBody({
  session, sessionId, t, useConversation, useProjection, useSessions,
  pendingBySession,
}: CommonProps & { pendingBySession: PendingMap }) {
  const chat = useConversation(conversation => conversation.views.get('chat'))
  const todos = useProjection('todos')
  const sessionsById = useSessions(s => s.byId)
  // All hooks above execute consistently for this mounted body.
  if (session == null) return null
  const legacy = chat?.legacy ?? EMPTY_LEGACY
  const toolName = runningTool(legacy)
  const running = session.running
  const ownPending = pendingKindOf(pendingBySession.get(sessionId)?.kind)
  const subPending = subagentPendingState(
    sessionsById, pendingBySession, sessionId)
  const pending = ownPending !== null ||
    subPending.approvals > 0 || subPending.questions > 0
  const subRunning = subagentRunningCount(sessionsById, sessionId)
  // Existing percent / turn / elapsed / eta / usage derivation unchanged.
  // Continue using subRunning: an idle parent with active descendants is
  // background work, not a completed/done-green state.
  return (
    <div className={css.bar} data-pending={pending || undefined}>
      {/* Keep the original state text, fill bar, todos percent, token chip,
          elapsed/eta markup using the variables above. */}
    </div>
  )
}
```

This is an excerpt-level proposal, not a claimed compiled patch: the actual helper definitions and omitted presentation code are unavailable. Validate their concrete types when integrating. Standard kit presence normally stays fixed per host; the component split additionally avoids relying on that assumption for hook order. The normalization preserves the interaction values, including `kind`, rather than replacing records with booleans.

When both pending hooks are absent, only the attention feature degrades: own and descendant approval/question waiting indicators cannot be shown. Empty pending data means unavailable attention information, not proof that no real approval is pending. The strip itself, running/tool state, todos percentage, token usage, elapsed/ETA and descendant-running detection continue through the unchanged sources. No approval is granted or bypassed. Silent degradation is required here because an optional display capability must not throw a render exception that hides the strip and its co-tenants. Missing the old hook alone is normal on alpha.2 and should not show a warning toast. This fallback is not a catch-all that silently swallows arbitrary coding failures.

## 4. Tenant and host isolation

A dock tenant should feature-detect optional seats, use safe empty defaults for optional display data, preserve hook ordering, validate optional data, and wrap its entire registered implementation in a tenant-owned React error boundary with a safe fallback. The registered wrapper must render `<TenantBoundary><SessionProgressBar ... /></TenantBoundary>` so the throwing component is below the boundary. A boundary inside the throwing component's returned JSX cannot catch that component's own render failure, and ordinary try/catch around JSX does not catch descendant rendering. Keep boundary fallback code simple; log unexpected failures with tenant identity for diagnosis, and reset on session change/reload or explicit retry. Async/event-handler failures need their own handling since React render boundaries do not catch all such errors.

The HOST could place a keyed boundary around each `DockEntry`, including the entry's own render work, rather than only around the list, optionally retaining an outer catastrophic boundary. One failure would then replace only that entry. The trade-off is finer fault isolation and continued functionality versus additional boundaries/reset policies, diagnostics and partial/degraded UI whose failures may be less obvious. A list-wide boundary is simpler and has atomic fallback, but its blast radius spans unrelated plugins. Host isolation is an architectural recommendation; no core change is required or authorized in this read-only diagnosis.

## 5. Verification plan without restarting the host

These checks are proposed, not performed in the fixture-only task.

1. Integrate A's compatibility change in its real source; use its established build/typecheck process and ensure the junction's served client artifact contains that build. Keep B's code and both registration IDs/orders unchanged for attribution. With the same alpha.2 host process running, load the rebuilt client through the established client reload/HMR mechanism or a browser hard refresh, and inspect the actually served artifact. Do not infer success merely from a successful build or HTTP 200. Link-installed plugins need not be managed as bundles by the Plugins page; verify actual loading rather than trusting a toggle label.
2. Clear the shared boundary's latched fallback: after loading the fixed artifact, switch to another session and back (the supplied boundary explicitly resets on session switch), or remount the client via hard refresh. HMR alone need not reset a failed boundary. None of these requires a host process restart. If the replacement artifact cannot be loaded in the real deployment, record that limitation instead of claiming verification.
3. With A AND B enabled in the same session, inspect the mounted dock and visually confirm both `progress` and `dsh-paste-input-dock`, plus the surviving left attach button. Paste a NEW file and observe its actual chip; clear and repeat rather than trusting stale chips. Confirm no missing-hook exception and no `input.dock boundary fallback active` message. Switch sessions and repeat, then toggle/reload A if supported to check clean teardown without duplicate entries/listeners.
4. Exercise own approval/question pending and a descendant subagent pending while the parent has none. Verify attention appears and clears through alpha.2 `useSessionStatus`; verify parent-idle/child-running still shows background activity, plus ordinary todos/usage/time updates. Check alpha.1 via its legacy hook, and a controlled mount with neither hook: attention disappears silently while both tenants continue rendering. Test session bind/unbind to catch hook-order regressions. Unexpected errors revealed after recovery must be investigated separately.
5. For B specifically, verify the full paste/drop → chip → removal → submit/attachment path, not just mounting. Switch the main session from X to Y and paste/drop again: data must target Y, not stale X or an undefined session; with no open session, handle that case safely. Check add/remove and repeated paste/drop for duplicates or lost state. DSH-0.1.6-A2-01 separately removes `SessionListState.current`; an event-time B handler using it could still fail even though its slot renders. Inspect B's complete source for that pattern when available. If hit, use `ctx.uiSession.adapter.current.getSnapshot().key` (or alpha.2 `retainedBy.mainView`) and a subscription if caching. This is a regression to investigate, not a demonstrated second defect in the supplied B excerpt. Do not claim the recovered chip rail proves files were attached to the correct session or sent successfully.

## Completion and limits

- **Pre-existing:** baseline not collected; no full source/build environment provided. The reported render failure is evidence, not a newly executed test.
- **Completed:** source-backed attribution, contract comparison, compatible component proposal, isolation recommendations and verification plan; report written only under `agent-output/S24-dock-cotenant-crash-trap/`.
- **Skipped:** installations, migrations, package scripts, runtime verifier, live profile edits and host upgrades; unrelated corridor changes have no demonstrated hit in these excerpts.
- **Pending/residual risk:** actual compilation, helper type alignment, runtime restoration, B's complete event-time behavior and any errors masked by the original boundary. Full source and a running profile are needed for those checks; no blocker prevents completing this requested report.
- **Rollback:** no operational changes to undo. A later implementation should retain A's original source/bundle and restore only its owned paths if necessary; disabling A and resetting the boundary is the evidence-backed temporary mitigation for B. Do not change B or downgrade the host merely to address this render failure.
- **Recommendation:** implement A's optional-hook adapter and local isolation first; evaluate host per-entry boundaries separately.


## Required output (JSON only)
{"decisions":[{"id":"<criterion-id>","verdict":"pass|partial|fail|missing","reason":"short"}],"caps":[{"id":"<cap-id>","triggered":false,"reason":"short"}]}
Every criterion and cap exactly once. pass=full points, partial=half, fail/missing=0; a triggered cap caps the total.