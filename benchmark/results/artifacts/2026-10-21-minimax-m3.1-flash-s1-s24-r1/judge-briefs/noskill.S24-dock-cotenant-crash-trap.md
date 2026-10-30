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
#### FILE: S24-dock-cotenant-crash-trap/S24-dock-cotenant-crash-trap-report.md

# S24 - The Dock That Vanished Together: Culprit, Experiment, Fix, Hygiene, Verification

**Case:** dsh 0.1.6-alpha.1 -> 0.1.6-alpha.2 (npm global, Windows, web profile, six junction-linked external client plugins).
**Symptom pair:** session-progress strip gone from the composer dock **and** paste-attachment chip rail never renders, while plugin B's attach button (a different slot) still renders.
**Verdict in one line:** **plugin A (dsh-ui-progress) throws during render** because the alpha.2 standard kit removed the hook it calls; the throw is caught by the **slot-wide** DrawerErrorBoundary in InputDock, whose fallback is null, so React unmounts **every** entry of the conversation.input.dock slot - including plugin B's co-tenant chips rail. One fault, one boundary, two victims.

---

## 0. Evidence base and honesty markers

Read once, in full: fixture/README.md, symptom-report.md, console-excerpt.txt, tried-notes.txt, plugin-a/SessionProgressBar-excerpt.tsx, plugin-b/dock-entry-excerpt.md, host-types/slots-contract-alpha1.d.ts, host-types/slots-contract-alpha2.d.ts, host-types/dock-render-tree.md.

No live host was probed (the installed host is a different version and out of scope), nothing outside the cell was read, and the fixture was not modified. Claims that the fixture does not settle are marked **[unconfirmed]** in section 7 rather than guessed.

---

## 1. Culprit attribution

### 1.1 Which plugin fails, and at which exact call

**Plugin A (dsh-ui-progress) fails - exclusively.** The single console error is:

~~~text
Uncaught TypeError: useSessionPendingInteraction is not a function
    at SessionProgressBar (plugin://dsh-external/dsh-ui-progress/lib/client.js:219:41)
    at renderWithHooks (react-dom)
    at mountIndeterminateComponent (react-dom)
~~~

* The stack names dsh-ui-progress - plugin A's plugin URI - and SessionProgressBar, plugin A's component. No frame mentions AttachmentChips or dsh-paste-input-dock.
* renderWithHooks -> mountIndeterminateComponent means the throw happens on the **first mount** of the dock in the session, inside the component body - not in an effect, not in plugin B's code.
* The exact failing source line is plugin A's excerpt line 24 (compiled to lib/client.js:219:41):

~~~ts
const pendingBySession = useSessionPendingInteraction(interactions => interactions)
~~~

  Destructuring the prop is harmless; **calling** it is fatal. On alpha.2 the prop arrives as undefined, so the call is undefined(...) -> TypeError.

### 1.2 What changed in the standard kit between the two contracts

The standard kit the shell hands to every conversation.input.dock entry is SessionStandardProps:

| hook | alpha.1 | alpha.2 | change |
|---|---|---|---|
| useConversation | yes | yes | - |
| useSessions | yes | yes | - |
| useSessionPendingInteraction | yes - SnapshotSelectorHook<ReadonlyMap<SessionId, SessionPendingInteraction>> | **removed** | **REMOVED** |
| useSessionStatus | - | yes - SnapshotSelectorHook<ReadonlyMap<SessionId, SessionStatus>> | **added** (comment: "Per-session status: running, completionUnread, pendingInteraction") |
| useSessionRetainInfo | - | yes - UseSessionRetainInfo | added |
| useProjection | yes | yes | - |
| useInput | yes | yes | - |
| inputActions | yes | yes | - |

**This is a kit reduction, not a rename:** exactly **one** hook was dropped from the standard kit - useSessionPendingInteraction - and its content was **folded into the new per-session status map**: useSessionStatus hands back ReadonlyMap<SessionId, SessionStatus>, and SessionStatus carries pendingInteraction (plus running, completionUnread). The same data is still available on alpha.2, just behind a different prop with a different value shape.

**Why now:** the standard kit is delivered to a dock entry as *runtime props*, but plugin A ships a **pre-compiled bundle** (plugin://dsh-external/dsh-ui-progress/lib/client.js). Upgrading the host does not recompile the plugin against the new PropsRuntime<'conversation.input.dock'> type, so the type-level break (which tsc would have caught at plugin build time) never reached the build. At runtime the removed prop is simply undefined, and the first render calls it -> TypeError. The plugin was compiled against alpha.1's contract and is executing against alpha.2's kit.

### 1.3 Why the innocent co-tenant's dock entry disappears with it - the mechanism

The mechanism is **shared error-boundary blast radius** (sibling-collateral unmount), and the shell's isolation unit is the **slot**, not the entry and not the plugin.

From host-types/dock-render-tree.md:

~~~text
<Composer>
  <InputLeft>
    <DrawerErrorBoundary name="input.left">
      <SlotEntry id="dsh-paste-input-button" />   (plugin B, order -100)
    </DrawerErrorBoundary>
  </InputLeft>
  <InputDock>
    <DrawerErrorBoundary name="input.dock">      <-- ONE boundary for the whole list slot
      <DockEntry id="dsh-paste-input-dock" />     (plugin B, order 5)
      <DockEntry id="progress" />                 (plugin A, order 20)
      ...
    </DrawerErrorBoundary>
  </InputDock>
  <Textarea />
</Composer>
~~~

* DrawerErrorBoundary is a plain React class boundary: getDerivedStateFromError -> **renders null** as its fallback, and it resets only on the next session switch. DockEntry adds **no boundary of its own**.
* React's error-boundary semantics: when a descendant throws during render, React **unmounts the entire subtree below that boundary** and renders the boundary's fallback instead. Plugin A's throw therefore deletes the *sibling* DockEntry id="dsh-paste-input-dock" (plugin B's chips) even though plugin B's component never threw, never even ran the failing line.
* Mount order confirms the sequence: plugin B (order 5) mounts first, plugin A (order 20) mounts second and throws -> teardown of both.
* The host's own log states it verbatim:

  ~~~text
  [dsh:slots] input.dock boundary fallback active (session s-7f3a); unmounted entries: dsh-paste-input-dock, progress
  ~~~

  "boundary fallback active" + "unmounted entries: dsh-paste-input-dock, progress" = both entries torn down by **one** boundary-wide teardown, not two independent failures.
* Because the fallback is null (not an error box), the user sees **no error UI at all** - which is exactly why the maintainer wrote "Not collapsed, not errored - the whole strip is absent". The whole input.dock list renders nothing for the rest of the session (the boundary stays in fallback until a session switch).

**Why plugin B's attach button survives while its chips do not:** plugin B registers **two surfaces in two different slots** - the button in conversation.input.left, the chips rail in conversation.input.dock. Each slot has its **own** DrawerErrorBoundary (name="input.left" / name="input.dock"). The crash happened *under the input.dock boundary*; the input.left boundary never saw the error, so that subtree was never torn down. The console confirms: [dsh:slots] input.left: 1 entry mounted (dsh-paste-input-button).

So the isolation unit is the **slot**: co-tenants of the *same* slot are collateral damage; co-tenants of a *different* slot are safe. The button surviving is not evidence that plugin B is healthy - it is evidence that plugin B's chips share a failure domain with plugin A.

### 1.4 Ruling out plugin B directly

* Plugin B's AttachmentChips **uses no standard-kit hooks at all** - it reads only its own injected state (inject: sessionId => ({ remove, add })). It therefore *cannot* be affected by the removal of useSessionPendingInteraction: there is no call site in plugin B that could produce "... is not a function".
* Its render path threw nothing (its own try/catch around the fold scan logged nothing), and it is not in the error stack.
* The only "missing" thing about plugin B is the *slot* it lives in, and that was destroyed by plugin A's throw.

**Console-only error count:** F12 shows *exactly one* error. Two independent broken plugins would be expected to surface two distinct errors; a single error with two UI symptoms is the signature of one cause with two victims.

---

## 2. The experiment (the decisive evidence)

### 2.1 What the maintainer ran, and what it proves

> "disabled plugin A (the session-progress plugin) from the plugin list and refreshed -> plugin B's chips CAME BACK IMMEDIATELY. Re-enabled plugin A -> chips gone again."

This is a **reversible, single-variable A/B toggle** with a reproducible result in both directions, which is the strongest causal evidence available without a debugger. Combined with the console error and the type diff it establishes:

1. **Causality of presence:** plugin B's chips rail is rendered **iff** plugin A is disabled. Plugin A's *presence* is the cause of plugin B's chips disappearing - not a coincidence, not timing, not the upgrade's other side effects. (Re-enabling and reproducing the loss closes the loop against a "flaky refresh" explanation.)
2. **The crash, not plugin B, is the mechanism:** when plugin A is enabled its render throws, the shared input.dock boundary flips to its null fallback, and every entry in that slot is unmounted - which is precisely the host log line. Disabling plugin A removes the only thrower, the boundary stays healthy, and plugin B's entry mounts again.
3. **The defect is upstream of plugin B:** plugin B's code, its props, and its own slot registration are not the fault. Plugin B is a healthy co-tenant in an unhealthy failure domain.
4. **The isolation unit is the shared slot:** removing the co-tenant restores the survivor, which is only true if the two entries shared one boundary.

### 2.2 What the experiment does **not** prove

* **It does not prove plugin B is bug-free on alpha.2.** It proves plugin B is *not the cause of the boundary fallback*. It cannot prove plugin B has no latent alpha.2 issues of its own, and it cannot prove plugin B's chips render *correct content* in every path (add / remove / multiple files / drag-drop / re-paste). The maintainer's own notes flag one unverified path: "the paste toast did not reappear after the first attempt" - the experiment was not designed to exercise that path.
* **It does not prove the strip crash is the only dock problem.** The experiment is a *necessity* test for the co-tenant symptom, not an enumeration of all dock defects:
  * With plugin A **disabled** the strip is *absent*, not *working* - a disable-experiment can never validate the strip itself.
  * The experiment says nothing about the other external plugins (six in total; which of them occupy the dock is **[unconfirmed]** - the fixture only shows these two).
  * It says nothing about *further* alpha.2 incompatibilities inside plugin A. The excerpt shows only the hooks plugin A's excerpt uses, but plugin A's remaining source is not in the pack; the first removed-hook call is simply the first thing that throws. After fixing it, another removed API could surface - a fix that makes the strip render is not proof that plugin A is fully alpha.2-clean.
  * It does not establish *blame* (host bug vs. plugin bug) by itself; blame comes from the contract diff.
* **It does not prove the slot is otherwise healthy.** Removing the thrower removes the symptom; it cannot tell you whether the shell's slot rendering has its own latent problems.
* **It does not prove the fix will restore the strip.** The experiment is strictly about plugin B's chips, i.e. about the *victim*, never about the *culprit's own feature*.

### 2.3 Why reinstalling plugin B could never have helped

1. **The fault is not in plugin B's artifact.** Reinstalling re-installs byte-identical plugin B code against a host whose input.dock boundary falls back to null. Plugin B's code is never the thing that fails; the failure is plugin A's render throwing into a shared boundary.
2. **The removal is in the host kit, and no plugin-B version can patch it.** Alpha.2 no longer provides useSessionPendingInteraction to *any* dock entry. As long as plugin A is installed and its render throws, the slot's boundary is in fallback and *no* conversation.input.dock entry can be shown - including a hypothetical "newer" plugin B. A plugin-B-side change only becomes visible once the boundary is healthy, which requires the *culprit* to be fixed.
3. **The maintainer's observation matches:** reinstall -> "no change: chips still not rendering, strip still gone." Note what the reinstall **did** change: nothing. That is the expected result and should have been read as "the defect is not in the reinstallable artifact."
4. **Contrast:** a reinstall of **plugin A** *would* help **if** the reinstalled A were built against alpha.2 (or fixed). Reinstalling the co-tenant can never substitute for fixing the thrower.

### 2.4 Why the colleague's "both plugins were hit" theory is wrong

The colleague's theory: "alpha.2 probably changed slot props. Maybe both plugins use a prop that was removed, and you got hit twice. I'd fix both plugins' slot registrations."

It is refuted on five independent grounds:

1. **The count.** There is exactly **one** error in F12, and its stack names dsh-ui-progress / SessionProgressBar. Two hit plugins would be expected to produce two errors (or at least two failing frames). One error, two symptoms = one cause, two victims.
2. **Plugin B cannot be hit by that mechanism.** AttachmentChips uses **no standard-kit hooks at all** (its own injected state only). The removed prop is simply not in its code path - "both plugins use a prop that was removed" is factually false for plugin B.
3. **The contract diff shows exactly one removal.** Only useSessionPendingInteraction was dropped from SessionStandardProps; useConversation, useSessions, useProjection, useInput, inputActions survived. Plugin B depends on none of them.
4. **The experiment.** Plugin B's symptom is strictly conditional on plugin A's presence - a "both independently broken" theory cannot explain a symptom that appears and disappears with a third party.
5. **The host log.** "unmounted entries: dsh-paste-input-dock, progress" under a single "boundary fallback active" line is the fingerprint of one teardown, not two failures.

The half-truth that makes the theory look reasonable: the maintainer *observed* two missing UI surfaces. The correct model is not "two plugins were hit" but "**one plugin failed inside a shared boundary, and everything else in that boundary was collateral**". The theory also lands on the wrong remedy ("fix both plugins' slot registrations"): plugin B's registration is *correct* - same slot name, valid id, valid order. Rewriting it would change nothing and would risk the slot entry (e.g. a new id orphans the entry) while hiding the real defect. The one thing the theory gets right is the *category* - a kit change did cause this - but the attribution ("both") and the remedy ("both registrations") are both wrong.

---

## 3. The fix

### 3.1 Corrected component (graceful degradation for the removed seat)

**Which hook supplies the pending state on alpha.2:** useSessionStatus - SnapshotSelectorHook<ReadonlyMap<SessionId, SessionStatus>> - whose SessionStatus carries pendingInteraction. The alpha.1 source useSessionPendingInteraction is **gone**; the same information is reachable as useSessionStatus(s => s.get(sessionId))?.pendingInteraction, and for the subagent-subtree walk as useSessionStatus(s => s).get(subSessionId)?.pendingInteraction.

~~~tsx
/**
 * SessionProgressBar - corrected for the 0.1.6-alpha.2 standard kit.
 *
 * Contract drift (host-types/slots-contract-alpha{1,2}.d.ts):
 *   alpha.1: useSessionPendingInteraction : SnapshotSelectorHook<ReadonlyMap<SessionId, SessionPendingInteraction>>
 *   alpha.2: REMOVED. Its content was folded into the new
 *            useSessionStatus : SnapshotSelectorHook<ReadonlyMap<SessionId, SessionStatus>>,
 *            whose SessionStatus carries 'pendingInteraction'.
 *
 * The kit arrives as RUNTIME props, and the published plugin bundle is not
 * recompiled when the host kit changes, so a removed prop shows up as undefined.
 * Destructuring it is safe; CALLING it throws
 * "useSessionPendingInteraction is not a function" and, because the whole
 * 'conversation.input.dock' list sits under ONE shared DrawerErrorBoundary whose
 * fallback is null, that throw tears down every co-tenant entry in the slot.
 *
 * Rule applied below: every kit hook is feature-detected; a missing capability
 * degrades ONE feature instead of throwing.
 */

import { useMemo } from 'react'
import type { PropsRuntime } from '@deepseek-ai/dsh-client-ui-slots'
import type { PropsLocale } from '@deepseek-ai/dsh-client-ui-i18n'

type SessionId = string
type PendingInteraction = { kind?: string }
type SessionStatus = {
  running?: boolean
  completionUnread?: boolean
  pendingInteraction?: PendingInteraction | null
}
type PendingMap = ReadonlyMap<SessionId, PendingInteraction | null>

const NO_PENDING: PendingMap = new Map<SessionId, PendingInteraction | null>()

/* Selectors are module-level so their identity is stable across renders
   (snapshot selector hooks subscribe/compare by selector identity). */
const selectPendingMap = (m: PendingMap) => m
const selectStatusMap = (m: ReadonlyMap<SessionId, SessionStatus>) => m

/* Non-hook stand-ins: they keep the number of hook calls per render independent
   of which kit the host shipped. A hook is never skipped or swapped mid-mount. */
function noPendingSelector(
  _sel: (m: PendingMap) => PendingMap,
): undefined { return undefined }
function noStatusSelector(
  _sel: (m: ReadonlyMap<SessionId, SessionStatus>) => ReadonlyMap<SessionId, SessionStatus>,
): undefined { return undefined }

type KitProps = {
  /** alpha.1 kit - present only on <= 0.1.6-alpha.1 hosts. */
  useSessionPendingInteraction?:
    (sel: (m: PendingMap) => PendingMap) => PendingMap | undefined
  /** alpha.2 kit - per-session status; carries SessionStatus.pendingInteraction. */
  useSessionStatus?:
    (sel: (m: ReadonlyMap<SessionId, SessionStatus>) => ReadonlyMap<SessionId, SessionStatus>) => ReadonlyMap<SessionId, SessionStatus> | undefined
}

/**
 * Normalised "which sessions are waiting on a human", for BOTH kits.
 * Returns an EMPTY map when the host supplies neither pending hook, so the
 * caller degrades that one indicator and keeps rendering.
 */
function usePendingInteractions(props: KitProps): PendingMap {
  const usePending = props.useSessionPendingInteraction ?? noPendingSelector
  const useStatus = props.useSessionStatus ?? noStatusSelector

  // alpha.1 path - always invoked, always in the same position in the hook order.
  const legacyMap = usePending(selectPendingMap) as PendingMap | undefined
  // alpha.2 path - always invoked, always in the same position in the hook order.
  const statusMap = useStatus(selectStatusMap) as
    ReadonlyMap<SessionId, SessionStatus> | undefined

  // Fold alpha.2's per-session status into the pending shape the helpers expect.
  const folded = useMemo<PendingMap>(() => {
    if (!statusMap) return NO_PENDING
    const out = new Map<SessionId, PendingInteraction | null>()
    statusMap.forEach((status, id) => out.set(id, status?.pendingInteraction ?? null))
    return out
  }, [statusMap])

  if (folded !== NO_PENDING) return folded          // alpha.2 host
  return legacyMap ?? NO_PENDING                    // alpha.1 host, or neither
}

export type SessionProgressBarProps =
  import('@deepseek-ai/dsh-client-ui-slots').PropsRuntime<'conversation.input.dock'>
  & PropsLocale<'progress'>

export function SessionProgressBar(props: SessionProgressBarProps) {
  const { session, sessionId, t, useConversation, useProjection, useSessions } = props

  if (session === undefined || session === null) return null

  const chat = useConversation(conversation => conversation.views.get('chat'))
  const legacy = chat?.legacy ?? EMPTY_LEGACY
  const todos = useProjection('todos')
  const toolName = runningTool(legacy)
  const running = session.running

  // ---- the degraded seat: the attention/pending indicator -------------------
  // On alpha.2 this is fed by useSessionStatus -> SessionStatus.pendingInteraction.
  // On a host that supplies NEITHER pending hook the map is empty: ownPending is
  // null and the subtree counts are 0, so only this indicator degrades.
  const pendingBySession = usePendingInteractions(props as unknown as KitProps)
  const ownPending = pendingKindOf(pendingBySession.get(sessionId)?.kind)
  const subPending = subagentPendingState(
    useSessions(s => s.byId), pendingBySession, sessionId)
  const pending = ownPending !== null || subPending.approvals > 0 || subPending.questions > 0

  // Background state: main conversation idle while descendant subagent sessions
  // keep executing - must not read as done-green.
  const subRunning = subagentRunningCount(useSessions(s => s.byId), sessionId)

  return (
    <div
      className={css.bar}
      data-pending={pending || undefined}
      /* diagnosable without throwing: lets QA assert the degraded state */
      data-capability={pendingBySession === NO_PENDING ? 'no-pending-hook' : undefined}
    >
      {/* state text, fill bar, todos percent, token chip, elapsed/eta */}
    </div>
  )
}

// Registration (plugin A's index.ts) is UNCHANGED - same slot name, id 'progress',
// order 20, locale NS. Renaming the id or changing the order would silently
// drop/reorder the entry in the slot list.
~~~

> Optional, only if you want the alpha.2 kit to be the single source of truth: running can also be read from useSessionStatus(s => s.get(sessionId))?.running, keeping session.running as the fallback. Not required for the fix.

### 3.2 Degradation matrix - what breaks and what keeps working

| host kit | pending source used | attention / pending indicator | rest of the strip |
|---|---|---|---|
| alpha.1 (useSessionPendingInteraction present) | legacy map | **full**: own pending kind, subagent approvals/questions, data-pending | full |
| alpha.2 (useSessionStatus present) | SessionStatus.pendingInteraction folded per session | **full** (same semantics) | full |
| **neither** (hypothetical future host) | empty map (NO_PENDING) | **degraded**: data-pending omitted, no approval/question badge, subagent attention counts read 0 | **keeps working**: running state, fill bar, todos percent, token chip, elapsed/eta - these come from session.running, useProjection('todos'), useSessions(s => s.byId) and the session's usage projection, none of which are in the removed seat |

So the **removed seat is exactly one feature**: the *attention/pending* indicator (the data-pending state and the human-waiting signal, including the subagent-subtree approvals/questions it surfaces). The strip's other information - running state, fill bar, todos percent, token usage, elapsed/eta - is sourced from props and hooks that exist in **both** contracts and continues to render.

### 3.3 Why the degradation must be silent rather than throwing

1. **Blast radius.** A throw in a dock entry is not a local event: it propagates to the nearest boundary, which in this shell is the **slot-wide** DrawerErrorBoundary whose fallback is null. It therefore deletes the tenant's own strip **and** every co-tenant entry in that slot (plugin B's chips) - the exact incident in the report. A silent degradation keeps the failure inside one tenant and one feature.
2. **Semantics.** "The host no longer ships this optional capability" is an expected, normal condition after a kit reduction - not a programming error. Throwing converts *feature unavailable* into *slot dead*, which is a strictly larger and misleading state.
3. **Observability and diagnosability.** Throwing produces an uncaught error that also destroys the co-tenant UI and suppresses the shell's slot diagnostics, and it makes the *real* problem (which capability is missing) invisible. A silent degradation can still be **diagnosed** without throwing: the data-capability="no-pending-hook" marker above, plus an optional one-time dev-only console.warn (never in production builds, and never a throw).
4. **Forward compatibility.** Capability detection means the plugin keeps working on future kits that remove *other* optional hooks, instead of needing a release per host bump.

### 3.4 Secondary hardening (latent, **not** the cause of this incident)

Plugin A's excerpt returns null **before** calling any hook (line 14 vs. lines 15-24). If session can transition null -> defined within one mount, that is a Rules-of-Hooks violation ("rendered more hooks than during the previous render") and would produce a *second*, different class of failure. The fixture does not show such a transition, so this is **not** the observed cause. Either move the guard below all hook calls (and confirm the host's projection/selector hooks are null-session-safe), or guarantee the guard's value is stable across renders. Flagged for completeness, not part of the alpha.2 crash.

---

## 4. Multi-tenant hygiene

### 4.1 What a dock tenant must do so its own crash cannot take down co-tenants

1. **Treat every standard-kit prop as optional.** Feature-detect (typeof hook === 'function') before calling. A kit prop is a capability, not a guarantee.
2. **Degrade, never throw, for a missing capability.** A tenant's missing host feature must never escalate into a shared-boundary teardown. Render a reduced feature set instead of throwing (see section 3).
3. **Assume a shared boundary exists.** Do not rely on the host isolating your entry. Keep your own failure surface local: wrap derived computation in your own try/catch and render your own minimal fallback rather than throwing into the host's boundary.
4. **Support a kit *range*, not a kit *version*.** Detect capabilities (useSessionStatus vs useSessionPendingInteraction), never a version string; ship dual-path code so one build works on alpha.1 and alpha.2 (the plugin is junction-linked and may be used against different hosts).
5. **Minimise the standard-kit surface.** Every kit prop you consume is a future removal candidate. Prefer deriving from your own injected state where the host offers it.
6. **Test in isolation *and* in company.** (a) Load your plugin alone so a co-tenant crash is not mistaken for your own; (b) load it next to a deliberately-crashing sibling and assert your entry still renders. The incident shows that (b) is the test that would have caught this class of bug before the upgrade.
7. **Make the degraded state observable** (data-* marker / dev-only warning) so "the feature is unavailable on this host" is distinguishable from "the feature is broken".

### 4.2 What the HOST could change so one entry's failure isolates to that entry

**Primary host-side change: give each slot entry its own error boundary.** Wrap every DockEntry/SlotEntry in a per-entry DrawerErrorBoundary (or an internal EntryBoundary), so a throw unmounts only that entry and its siblings stay mounted; the slot-level boundary remains as a last-resort backstop. Equivalent variants: catch render errors per entry in the slot's entry-rendering path, or render entries in independent React roots (heavier, usually unnecessary).

**Supporting host-side changes:**
* **Deprecate-then-remove, with a compatibility shim.** Ship useSessionPendingInteraction as an alias implemented over useSessionStatus for one release. Cost: the kit carries two APIs and a shim; benefit: a minor host bump does not break third-party plugins that are compiled against the previous contract.
* **Expose a contract version** in the kit so plugins can branch deliberately, and **warn (not throw) when a plugin touches a removed prop**, turning silent runtime undefineds into an actionable message.
* **Prefer additive reductions.** Fold data into a *new* prop while keeping the old one for a deprecation window (exactly the useSessionStatus + useSessionPendingInteraction shape that broke plugin A here).

### 4.3 The trade-off the host faces

* **Blast radius vs. cost/instances.** Per-entry isolation means N boundary instances per slot (one per entry) instead of one - more React instances and error-state machines for a long dock, plus one more element in the tree per entry. The slot-level boundary is cheap and gives a clean, uniform "the dock is broken" signal.
* **Isolation vs. observability.** A slot-wide fallback is unmissable (the whole dock is empty). Per-entry isolation turns a loud failure into a **silent hole** inside an otherwise healthy dock - the failure is scoped but can be *harder* to notice, and QA may file it as "the plugin disappeared" rather than "the plugin threw". Mitigation: a per-entry placeholder/one-line inline error chip instead of nothing.
* **Generic vs. specific messaging.** The host cannot know a third-party entry's purpose, so any per-entry fallback message is generic ("unavailable") and may leak another vendor's plugin identity, or produce a row of identical red chips in a dock with several broken plugins.
* **Clean-all-or-nothing vs. partial UI.** Some hosts prefer the uniform empty slot as a feature ("the dock resets cleanly on session switch"); per-entry isolation gives up that uniformity, and the session-switch reset semantics (the current boundary "resets on the next session switch") become per-entry rather than per-slot.
* **Kit simplification vs. ecosystem breakage.** Keeping a deprecated alias forever leaves the kit carrying dead API; removing it immediately is what broke plugin A. The deprecation window is the price of a stable ecosystem.
* **Where the boundary is drawn.** Per-entry is not free of policy: is the boundary per *entry*, per *plugin* (all entries of one plugin isolated together), or per *slot*? Per-plugin would protect a multi-entry plugin's own entries from each other but would still not protect co-tenants; per-entry is the finest unit that satisfies "one entry's failure isolates to that entry".

---

## 5. Verification

### 5.1 Applying the fix without a host restart

The fix is **entirely client-side**: it adapts the plugin to the alpha.2 kit that the host already ships. Rebuild plugin A's client bundle (the artifact the console shows: plugin://dsh-external/dsh-ui-progress/lib/client.js; the exact build command is not in the fixture - **[unconfirmed]**), then **reload the web client** (hard refresh) or **switch session**. No host (node) restart is required: the host's contract is unchanged, and only the plugin's client bundle changed. Note that the DrawerErrorBoundary stays latched in its fallback for the current session (boundary fallback active (session s-7f3a)) and resets only on a session switch - so a plain refresh/session switch is mandatory before evaluating anything.

### 5.2 Evidence that BOTH plugins' dock entries are restored

| # | Check | Expected |
|---|---|---|
| 1 | F12 console after load | **No** "useSessionPendingInteraction is not a function"; **no** "The above error occurred in the <SessionProgressBar> component"; **no** "React will try to recreate this component tree from scratch ... DrawerErrorBoundary" |
| 2 | Host slot log | input.dock reports **2 entries mounted** (e.g. dsh-paste-input-dock, progress); **no** "input.dock boundary fallback active" line |
| 3 | React DevTools | DrawerErrorBoundary name="input.dock" is **not** in its error/fallback state; both DockEntry id="dsh-paste-input-dock" and DockEntry id="progress" are present in the tree |
| 4 | Visual - plugin A | the session-progress strip renders: running state, fill bar, todos %, token chip, elapsed/eta |
| 5 | Visual - plugin B | pasting a file renders the **chip rail** above the composer, and the **attach button** still renders in input.left |
| 6 | Paste flow | paste -> chip appears; paste a second file -> both chips; remove a chip -> removed; **the paste toast reappears** (the console noted it stopped after the first attempt - re-verify, see section 7) |
| 7 | Session switch | the dock renders on the next session too (the boundary reset path) |

### 5.3 The regression that must be covered **for plugin B specifically**

The headline "both plugins render" is **not sufficient** as a regression, because it can pass merely because the crash was removed - while the underlying *shared-boundary fragility* that destroyed plugin B is still there. The plugin-B regression must assert the **co-tenant survival property**:

1. **Co-tenant survival under a still-failing sibling (the core test).** Inject a test entry into conversation.input.dock that throws during render (or temporarily point plugin A at a deliberately throwing path), then assert that plugin B's dsh-paste-input-dock entry **still mounts and still renders its chips**. If the host has no per-entry boundary this test **fails** - which is the desired outcome: it documents the host-side gap (section 4.2) that the tenant-side fix cannot cover. The tenant-side half of the regression is then "plugin A must not throw for any host kit" (section 5.4).
2. **Plugin B's own chips behaviour must be re-verified end-to-end** (add / remove / multiple files / drag-drop / re-paste) - the incident showed plugin B's paste path only partially exercised (a single toast, then silence).
3. **Plugin B's registration must be untouched by the fix**: same slot name, same id (dsh-paste-input-dock), same order (5), still first in the dock; plugin A keeps id='progress', order=20. Changing ids/orders silently orphans or reorders entries in a list slot.
4. **The "no error" assertion must be per-session**, because the host's log line carries the session id (session s-7f3a): the dock must be healthy in **every** session, not just the first one after a refresh.
5. **Neighbouring tenants:** confirm the other external plugins' dock entries (if any - **[unconfirmed]** which of the six occupy the dock) still mount, i.e. the fix did not shift slot ordering or counts.

### 5.4 Regression matrix for plugin A (the culprit)

| host kit | plugin A enabled | expected |
|---|---|---|
| alpha.1 (useSessionPendingInteraction) | on | strip renders; pending indicator **live**; no error |
| alpha.2 (useSessionStatus) | on | strip renders; pending indicator **live**; no error; plugin B chips live |
| alpha.2 | off | plugin B chips live; dock healthy; no error |
| **neither pending hook** (simulated) | on | strip **still renders**, with only the attention indicator degraded (data-capability="no-pending-hook"); **no throw**; the shared boundary stays healthy so plugin B's chips **still render** |
| alpha.1 / alpha.2 | on | **false-green check:** drive a session into a pending human interaction (approval/question) and assert data-pending **is present** - the shim must not "pass" by always degrading to the empty map |

The false-green check is the one most easily forgotten: a fix that silently drops the pending feature everywhere would satisfy "no error, both entries render" while losing the feature. The degraded path must be proven reachable **only** when the capability is genuinely absent.

---

## 6. Summary of the causal chain

~~~text
alpha.2 standard kit removes useSessionPendingInteraction (folded into useSessionStatus)
        |
        v
plugin A's prebuilt bundle still calls it  ->  undefined(...)  ->  TypeError during first render
        |
        v
throw reaches the slot-wide DrawerErrorBoundary (name="input.dock"), fallback = null
        |
        v
React unmounts the whole input.dock subtree:
    "unmounted entries: dsh-paste-input-dock, progress"
        |
        +-- plugin A's progress strip  -> gone (its own victim, no error UI because fallback is null)
        +-- plugin B's chips rail    -> gone (collateral: never threw, shares the failure domain)

plugin B's attach button lives in conversation.input.left, behind its OWN DrawerErrorBoundary
        -> unaffected  (the isolation unit is the SLOT, not the plugin)
~~~

**The one-sentence fix:** plugin A must read its pending state from useSessionStatus(...).pendingInteraction on alpha.2, feature-detect every kit hook, and degrade the single attention/pending indicator **silently** when no pending hook is supplied - because a throw in a dock entry escalates to a shared-boundary teardown that deletes co-tenants' UI.

---

## 7. Open items / [unconfirmed]

1. **The paste toast that stopped appearing.** The console notes "the paste toast did not reappear after the first attempt". A coherent single-cause story: the first paste's toast rendered, the chips entry then mounted and threw, and the boundary fallback tore down the subtree that also anchored the toast; subsequent pastes found no toast anchor. The fixture's render-tree excerpt does **not** show where the toast is mounted, so this is **[unconfirmed]** - verify in section 5.2 check 6, and if the toast anchor is inside input.dock, note that the fix restores it as a side effect of the dock becoming healthy.
2. **Plugin A's full API surface.** Only an excerpt is available. The excerpt's other kit hooks all survive in alpha.2, but further removed APIs used elsewhere in plugin A (or in its helpers) cannot be ruled out. After the fix, re-run the console check to confirm no second removed-API error.
3. **The exact shape of SessionStatus.pendingInteraction.** Inferred from the alpha.2 type comment ("running, completionUnread, pendingInteraction") to be the same pending-interaction object as alpha.1's SessionPendingInteraction (with .kind, which plugin A's pendingKindOf(...) expects). If the real shape nests differently, adjust only the fold in usePendingInteractions.
4. **Whether session / sessionId / t (non-hook props) still exist in alpha.2.** The two contract excerpts cover only the hook portion of SessionStandardProps; there is no evidence of their removal, and the component's crash is unrelated to them. Unconfirmed from the fixture.
5. **Whether the other four external plugins occupy conversation.input.dock.** The fixture shows only plugin A and plugin B; the co-tenant population of the slot is unconfirmed, so section 5.3 check 5 is scoped accordingly.
6. **The plugin's build command** for regenerating lib/client.js is not in the fixture. Only the bundle path appears in the console stack.
7. **Whether the host kit can change without a page reload.** The shim relies on the kit being fixed for a mount's lifetime (a real hook is never swapped for a no-op between renders). In practice this requires a host restart + reload - consistent with the reported workflow - but the fixture does not state it.
8. **The exact alpha.1 -> alpha.2 deprecation policy** of the host (whether an alias was planned) is not in the fixture; section 4.2 recommends one.


## Required output (JSON only)
{"decisions":[{"id":"<criterion-id>","verdict":"pass|partial|fail|missing","reason":"short"}],"caps":[{"id":"<cap-id>","triggered":false,"reason":"short"}]}
Every criterion and cap exactly once. pass=full points, partial=half, fail/missing=0; a triggered cap caps the total.