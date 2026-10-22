# S24 - The Dock That Vanished Together - read-only analysis

**Mode**: A - inspect (read-only). Nothing under the fixture was modified, no host was restarted, no runtime introspection was executed, no migration or install was run.
**Corridor**: dsh-v0.1.6-alpha.1 -> dsh-v0.1.6-alpha.2 (card set DSH-0.1.6-A2, 4 cards).
**Host face**: Web Client, `conversation.input.dock` slot (list slot, scope `session`, owner `InputZone`), Windows + npm-global, six junction-linked external client plugins.

**One-line answer**: plugin A (`dsh-ui-progress`) throws inside the shared `conversation.input.dock` subtree because alpha.2 removed the `useSessionPendingInteraction` standard prop; the host's **per-SLOT** React error boundary replaces its whole subtree with `null`, so plugin B's already-mounted dock entry is torn down as collateral. Plugin B is the victim, not a second casualty.

---

## 0. Evidence inventory - what each artefact establishes

| Artefact | What it proves | Weight |
|---|---|---|
| `console-excerpt.txt` | Exactly one render error, thrown **inside `SessionProgressBar`** (`dsh-ui-progress/lib/client.js:219:41`): `TypeError: useSessionPendingInteraction is not a function`. The React component stack is `SessionProgressBar` -> `DockEntry` -> `DrawerErrorBoundary` -> `InputDock`. | Decisive for attribution |
| `console-excerpt.txt` (host slot log) | `[dsh:slots] input.dock boundary fallback active (session s-7f3a); unmounted entries: dsh-paste-input-dock, progress` - the host says BOTH dock entries were **unmounted**, and `[dsh:slots] input.left: 1 entry mounted (dsh-paste-input-button)`. | Decisive for the mechanism |
| `host-types/slots-contract-alpha1.d.ts` | alpha.1 `SessionStandardProps` carried `useSessionPendingInteraction: SnapshotSelectorHook<ReadonlyMap<SessionId, SessionPendingInteraction>>`. | Contract before |
| `host-types/slots-contract-alpha2.d.ts` | alpha.2 `SessionStandardProps` carries `useSessionStatus` + `useSessionRetainInfo` instead; `useSessions`, `useConversation`, `useProjection`, `useInput`, `inputActions` unchanged. The comment names the merged `GlobalStandardProps` of `@deepseek-ai/dsh-client-ui-session`. | Contract after |
| `host-types/dock-render-tree.md` | Mount tree: `InputDock` wraps **all** dock entries in ONE `DrawerErrorBoundary`; the boundary's fallback is `null`; `DockEntry` adds **no** boundary of its own. `InputLeft` has its own separate boundary. | Decisive for the blast radius |
| `plugin-a/SessionProgressBar-excerpt.tsx` | Plugin A destructures `useSessionPendingInteraction` from the slot runtime's standard kit and calls it **unconditionally**. | Decisive for the exact call |
| `plugin-b/dock-entry-excerpt.md` | Plugin B registers the attach button in `conversation.input.left` and the chips rail in `conversation.input.dock`; `AttachmentChips` uses **NO standard-kit hooks at all**; its own try/catch logged nothing. | Establishes B's innocence |
| `tried-notes.txt` | Reinstall of B = no change; the disable-A experiment = B's chips return immediately, and go away again when A is re-enabled. | The control experiment |
| `symptom-report.md` | Two symptoms after the in-place upgrade; everything else (title bar, file-trace panel, input recall) still works. | Scope of the blast |

**Facts I could not confirm from the pack** (both plugins' full repositories are absent): the exact shape of `SessionStatus` on alpha.2 beyond the three fields named by the card; whether plugin B resolves the current session through `sessions.list.getSnapshot().current` (an *independent* alpha.2 exposure, see 2.2); the internals of plugin A's `subagentPendingState` / `subagentRunningCount` helpers. Everything below marks such points **UNCONFIRMED** rather than guessing.

---

## 1. Culprit attribution

### 1.1 Which plugin fails, and at which exact call

**Plugin A - `dsh-ui-progress` (the session-progress strip) - is the only plugin that fails.** The failing call is the single line in `SessionProgressBar`:

```tsx
// plugin-a/SessionProgressBar-excerpt.tsx
const pendingBySession = useSessionPendingInteraction(interactions => interactions)
```

That is the frame at `lib/client.js:219:41` in the console stack. The throw is `TypeError: useSessionPendingInteraction is not a function` - i.e. the *identifier was resolved but is not callable*, which in React terms means the value was `undefined` at render time.

Why it is `undefined`: plugin A destructures the hook **out of the slot runtime's standard kit** (`SessionProgressBarProps = PropsRuntime<'conversation.input.dock'> & PropsLocale<'progress'>`). On alpha.2 the host no longer hands that seat to the dock entry, so the destructured binding is `undefined`, and calling it throws *during render*.

Note the shape of the error: this is **not** a missing module, a failed registration, a network error or a host boot problem. It is a *prop contract* violation, thrown from plugin code at render time, in a component the host mounted. The component stack (`SessionProgressBar` -> `DockEntry` -> `DrawerErrorBoundary` -> `InputDock`) says the host mounted plugin A's entry correctly and plugin A's own body is what blew up.

### 1.2 What changed in the standard kit between the two contracts

The reduction is one removed seat plus two added seats, in the **global standard props** that `@deepseek-ai/dsh-client-ui-session` merges into *every* slot's standard props (card DSH-0.1.6-A2-02):

| Standard prop | alpha.1 | alpha.2 | Note |
|---|---|---|---|
| `useConversation` | present | present | conversation assembly selector; unchanged |
| `useSessions` | present | present | **stays**; only its snapshot loses `current` (DSH-0.1.6-A2-01) |
| `useSessionPendingInteraction` | present | **REMOVED** | the seat plugin A calls unconditionally |
| `useSessionStatus` | - | **ADDED** | per-session status: `running`, `completionUnread`, `pendingInteraction` |
| `useSessionRetainInfo` | - | **ADDED** | reference counts, e.g. `retainedBy.mainView` |
| `useProjection` | present | present | named projections (todos, usage) |
| `useInput` | present | present | session input machine |
| `inputActions` | present | present | public input actions |

So the *slot* did not change: `conversation.input.dock` is still `{ kind: 'list', scope: 'session', owner: InputZone }` and the session kit (`useConversation` / `useInput` / `inputActions`) is declared identically on both tags. What changed is the **merged global half** of the standard kit, and it changed *silently*: the prop is simply absent, not deprecated, not renamed, and not typed away on the plugin's side until the plugin re-types itself against the alpha.2 declarations.

Consequence for plugin A: exactly **one** of its standard-kit uses is fatal (`useSessionPendingInteraction`). Its other uses - `useConversation`, `useProjection`, `useSessions(s => s.byId)` - are all still valid on alpha.2, and `useSessions`'s `byId` index is not affected by the `SessionListState.current` removal (DSH-0.1.6-A2-01; plugin A never reads `.current`). That is why "the progress strip is gone" is a *seat* problem, not a plugin-wide incompatibility.

### 1.3 Why the innocent co-tenant's dock entry disappears with it

**Mechanism: a React error boundary whose fallback replaces the whole subtree, mounted at SLOT granularity - so a throw by one entry unmounts every already-mounted sibling entry in that slot.**

The render tree (`host-types/dock-render-tree.md`) is the whole story:

```
<Composer>
  <InputLeft>
    <DrawerErrorBoundary name="input.left">      <- boundary #1 (different slot)
      <SlotEntry id="dsh-paste-input-button" />   (plugin B, order -100)
    </DrawerErrorBoundary>
  </InputLeft>
  <InputDock>
    <DrawerErrorBoundary name="input.dock">       <- boundary #2 (the shared slot)
      <DockEntry id="dsh-paste-input-dock" />       (plugin B, order 5)
      <DockEntry id="progress" />                   (plugin A, order 20)
      ...
    </DrawerErrorBoundary>
  </InputDock>
  <Textarea />
</Composer>
```

Step by step:

1. React renders `InputDock`'s children in `order`. Plugin B's entry (`order 5`) mounts fine - it reads only its own injected state and uses no standard-kit hooks.
2. Plugin A's entry (`order 20`) renders and calls `useSessionPendingInteraction` -> `undefined` -> **TypeError during render**.
3. The error propagates up to the nearest boundary: `DrawerErrorBoundary name="input.dock"`. A React error boundary's contract is: on catching, it **renders its fallback instead of its children**. The fallback is `null`, so the boundary's entire subtree - the `InputDock` wrapper *and every entry inside it*, including plugin B's healthy, already-mounted entry - is **unmounted**.
4. React then re-creates the tree from scratch inside the boundary. The first child it re-renders is plugin A's `progress` entry, which throws again. The boundary catches again and falls back to `null` again. The failure is *stable*: the strip never comes back, and plugin B never comes back, for as long as plugin A is enabled.

Two independent confirmations of steps 3-4 are in the console excerpt:

* React's own words: *"The above error occurred in the <SessionProgressBar> component ... React will try to recreate this component tree from scratch using the error boundary you provided, DrawerErrorBoundary."* - and the recreation re-triggers the same throw.
* The host's slot instrumentation: *"[dsh:slots] input.dock boundary fallback active (session s-7f3a); unmounted entries: dsh-paste-input-dock, progress"*. The host distinguishes **unmounted** from **crashed**: plugin B is listed as *unmounted*, i.e. destroyed as collateral. It never crashed - it had nothing to crash on.

Note the boundary reset semantics from the render-tree note (the boundary "resets on the next session switch"): a session switch re-renders the dock, which re-mounts plugin A, which throws again. The boundary reset therefore cannot rescue the dock; it only reproduces the same teardown. That is why the symptom reads as "the whole strip is absent - not collapsed, not errored" rather than as a visibly broken widget.

**Isolation granularity is the bug surface:** the host isolates *slots* from each other (`input.left` vs `input.dock`), but it does **not** isolate *entries* from each other inside one slot (`DockEntry` itself adds no boundary of its own). Six third-party plugins on one composer therefore share one failure domain per slot.

### 1.4 Why the attach button in a different slot survives while the chips do not

Plugin B registers **two** surfaces (`plugin-b/dock-entry-excerpt.md`):

* `dsh-paste-input-button` -> `conversation.input.left` (order -100) - the attach button;
* `dsh-paste-input-dock` -> `conversation.input.dock` (order 5) - the chips rail.

The two seats are wrapped by **different** boundaries (`DrawerErrorBoundary name="input.left"` vs `name="input.dock"`). React error boundaries contain a throw: the `input.dock` boundary catches it and no error ever crosses the `InputLeft` subtree. The host confirms this with two separate log lines - `input.dock` shows a boundary fallback with unmounted entries, while `input.left` shows *"1 entry mounted (dsh-paste-input-button)"*, i.e. that boundary never fell back.

So the asymmetry is purely a **slot-boundary** asymmetry, not a plugin asymmetry:

| Surface | Slot | Boundary | Outcome |
|---|---|---|---|
| Attach button | `conversation.input.left` | `input.left` (separate) | survives - renders |
| Chips rail | `conversation.input.dock` | `input.dock` (shared with plugin A) | unmounted with plugin A's entry |

One more nuance about "the chips never render": the chips rail only has content while files are pending, but the *DockEntry* itself is mounted by the host regardless of content. Since the boundary fallback unmounts the **entry** (not just its children), the rail is not merely empty - it is not in the DOM at all. And the paste itself still works because the paste interception and the injected file state live **outside** the dock (the toast appeared), so the host-level paste path is intact; only the *rendering seat* for the chips is gone.

### 1.5 Attribution summary

| Party | Role | Evidence |
|---|---|---|
| Plugin A (`dsh-ui-progress`) | **Culprit** - throws at render on `useSessionPendingInteraction` | single console error inside its component; unconditional call in its excerpt; removed seat in the alpha.2 contract |
| Plugin B (`dsh-paste-input`) | **Victim** - innocent co-tenant, unmounted by the shared boundary | host log lists it as *unmounted*; uses no standard-kit hooks; own try/catch logged nothing; chips return when A is disabled, with B unchanged |
| Host alpha.2 standard kit | **Trigger** - removed `useSessionPendingInteraction`, added `useSessionStatus` | card DSH-0.1.6-A2-02 + the two contract excerpts |
| Host `InputDock` boundary granularity | **Amplifier** - one boundary for the whole slot, no per-entry boundary | `host-types/dock-render-tree.md` |

---

## 2. The experiment (and the two dead ends)

### 2.1 What the disable-experiment proves

The maintainer's step 3 is a proper **single-variable control**: same host build, same session, same plugin B build, same page - only plugin A's enabled/disabled state changed, and the symptom tracked it exactly (chips return immediately when A is disabled; they disappear again the moment A is re-enabled). Together with the single console error, this closes the attribution:

* **Necessary**: with A enabled, B's chips are absent - A's presence is required for the symptom.
* **Sufficient**: with A enabled and B unchanged, the symptom appears every time.
* **Directional**: disabling A restores B *without touching B at all*, so the information flows A -> B, not B -> A. A cannot be a victim of B here.
* **Mechanism-confirming**: the recovery is instantaneous on the same slot, which is exactly what "the shared `input.dock` boundary re-rendered cleanly once the throwing entry was gone" predicts. If B had its own defect, removing an unrelated plugin from a different seat would not have cured it.

Because the two runs differ in exactly one variable, the experiment is the decisive evidence for *attribution* - stronger than the console error alone, which shows where the throw came from but not that A's throw is what removes B.

### 2.2 What the experiment does **not** prove

1. **It does not prove plugin B is bug-free on alpha.2.** It proves only that B's *dock entry* is not the cause of *this* symptom. B may carry an **independent** alpha.2 exposure, and there is a specific one on the table: card DSH-0.1.6-A2-01 removed `SessionListState.current`, and the card's own first-hand evidence names a paste/drop attachment plugin that started failing to resolve the current session on alpha.2 (raising a "please open a session first" error on every paste). If plugin B's paste handler resolves the session through `sessions.list.getSnapshot().current`, then B has a second, independent alpha.2 bug that this dock crash was **masking** - and the experiment cannot see it, because with A disabled the chips come back while the underlying session resolution may still be broken. Whether B does this is **UNCONFIRMED** (B's full source is not in the pack) and must be checked separately - see 5.3(c).
2. **It does not prove the strip crash is the ONLY dock problem.** It establishes one causal chain (A's render throw -> dock boundary fallback -> B unmounted). It says nothing about *other* alpha.2 exposures in A (A's own excerpt shows A consumes the standard kit in three other places, which happen to survive) or in the other four plugins of the fleet, and it says nothing about the host's *own* dock defects. The correct statement is "this experiment explains the co-tenant symptom", not "the dock is now clean".
3. **It does not prove the strip's features work on alpha.2** once the crash is fixed. The experiment only removes A. The migrated component must be verified separately: the pending/attention state, the subagent pending surfacing, todos, tokens, ETA.
4. **It does not license "keep A disabled".** Disabling A removes the feature; the correct resolution is to migrate A (and the upstream project did exactly that: card DSH-0.1.6-A2-02's first-hand note records `dsh-ui-progress` v0.10.2 shipping "the optional-seat fix").
5. **It does not generalise to the other five plugins.** The experiment is a point measurement on A. The generalisation is a *source scan*: every fleet plugin that destructures a standard-kit seat must be checked for the removed one, because the same code pattern anywhere in a shared slot is the same latent co-tenant bomb. Recommend: grep the six plugins' client sources for `useSessionPendingInteraction` (and for `useSessionStatus` / `useSessionRetainInfo` awareness) and treat each hit as a required-if-hit item.

### 2.3 Why reinstalling plugin B could never have helped

1. **The defect is not in B's code.** B's component uses no standard-kit hooks; its render path throws nothing and its own try/catch logged nothing. The host log classifies B as *unmounted*, not *crashed*.
2. **The defect is in the HOST<->PLUGIN A contract.** The host changed what it hands a dock entry. Reinstalling B from its mirror tag reinstalls the *same* bytes that worked on alpha.1 - the thing that changed is the host, not B. The reinstall restored the exact build that was already present and, unsurprisingly, changed nothing.
3. **The reinstall touched the wrong axis.** The failure axis is "which host standard kit is in effect". B's build identity is a constant in the experiment; only A's presence and the host's contract moved.
4. **The install track made it a no-op anyway.** These six plugins are junction/link-installed into the profile's `node_modules` (per the symptom report and card DSH-0.1.6-A2-03, link-installed plugins stay outside the Plugin Manager's bundle management). For a junction install the repository tree *is* the installed tree: "reinstalling" a link-installed plugin cannot change what is served, and the Plugins page does not manage such rows.
5. **The diagnostic cost was the real damage.** The reinstall was a reasonable first guess, but it consumed time on a hypothesis the single console error had already ruled out, and it pushed attention toward B instead of A.

### 2.4 What is wrong with the colleague's "both plugins were hit" theory

The theory has one true half and several wrong ones.

* **Right class, wrong instance.** Alpha.2 *did* change the props the shell hands to slot entries (DSH-0.1.6-A2-02) - the class of the diagnosis is correct.
* **Wrong count.** "You got hit twice" predicts two independent missing-prop calls and, in a shared-slot situation, two render errors. The console shows **exactly one** error, one missing symbol, one component in the stack. The host's slot log lists both entries as *unmounted* - one was unmounted *because of* the other.
* **Wrong victim.** The theory says plugin B also uses a removed prop. It does not: `AttachmentChips` "uses NO standard-kit hooks at all" and reads only its own injected state (`plugin-b/dock-entry-excerpt.md`). B is *structurally incapable* of hitting a removed standard prop.
* **Wrong remedy.** "Fix both plugins' slot registrations" would have rewritten plugin B's *correct* registration. B's registration (slot name, id, order, injection wrapper) is fine and must not be touched: changing the id, the order, or the injection wrapper would have *added* a second defect (registration ids are also what the host's slot log names, so renaming an id degrades diagnosability) while leaving the real crash untouched.
* **Directly falsified by the experiment.** The theory predicts B's symptom is independent of A. The experiment shows B's symptom toggles with A, with B byte-identical in both runs. A theory that is falsified by the one controlled experiment in the pack cannot stand.
* **Correct diagnosis of the *mechanism* the colleague missed**: it is not "two plugins broke", it is "one plugin broke and the slot's shared error boundary converted that into a slot-wide outage". The second symptom is a *host isolation property*, not a second plugin defect.

---

## 3. The fix - graceful degradation for the removed seat

### 3.1 The migration in one line

Replace the alpha.1 read `useSessionPendingInteraction(map => map.get(sessionId))` with the alpha.2 read `useSessionStatus(map => map.get(sessionId)?.pendingInteraction)`, and **select the hook by which prop the host actually supplies** - the prop set is fixed per host build, so the branch is stable across renders - and **degrade to an empty pending state when neither prop is present** (card DSH-0.1.6-A2-02).

### 3.2 Corrected component

```tsx
/**
 * SessionProgressBar - dsh-v0.1.6-alpha.2 compatible.
 *
 * Card DSH-0.1.6-A2-02 (0.1.6-alpha.1 -> 0.1.6-alpha.2):
 *   the global standard props that @deepseek-ai/dsh-client-ui-session merges into
 *   EVERY slot's standard props dropped useSessionPendingInteraction and added
 *   useSessionStatus (+ useSessionRetainInfo). useSessions stays; the dock slot
 *   declaration itself is unchanged.
 *
 * Failure this file removes:
 *   on alpha.2 the host no longer hands a dock entry useSessionPendingInteraction,
 *   so destructuring it yields undefined and calling it throws
 *     TypeError: useSessionPendingInteraction is not a function
 *   during render. That throw propagates to the HOST's per-SLOT error boundary
 *   (DrawerErrorBoundary name="input.dock", fallback null), which unmounts every
 *   co-tenant of the slot - the exact incident that took the paste/attachment chips
 *   rail down with the progress strip.
 *
 * Rule applied here: a missing standard-kit capability is a DEGRADED FEATURE, never a
 * thrown error. The host supplies a fixed prop set per build, so the capability check
 * below is stable for the lifetime of the page; it is evaluated BEFORE any hook call
 * so every branch keeps a valid, deterministic hook order.
 */
import type { PropsLocale } from '@deepseek-ai/dsh-client-locale'
import type {
  SessionId,
  SessionPendingInteraction,
  SessionStatus,
} from '@deepseek-ai/dsh-client-ui-session'
import type { SnapshotSelectorHook } from '@deepseek-ai/dsh-client-store'

type DockRuntimeProps =
  import('@deepseek-ai/dsh-client-ui-slots').PropsRuntime<'conversation.input.dock'>

export type SessionProgressBarProps = DockRuntimeProps
  & PropsLocale<'progress'>
  & {
    /**
     * alpha.1 seat. REMOVED from the host standard kit on alpha.2, so it is OPTIONAL
     * here: a build typed against alpha.2 does not declare it at all, and the plugin
     * must still compile against alpha.1. Never call it without a typeof check.
     */
    readonly useSessionPendingInteraction?: SnapshotSelectorHook<
      ReadonlyMap<SessionId, SessionPendingInteraction>
    >
    /**
     * alpha.2 seat. Absent on alpha.1, so it is OPTIONAL here as well.
     */
    readonly useSessionStatus?: SnapshotSelectorHook<
      ReadonlyMap<SessionId, SessionStatus>
    >
  }

/**
 * Dispatcher. No hooks are called here; each branch renders a leaf component whose
 * hook set is fixed. This is what keeps the Rules of Hooks intact in all three
 * branches (a conditional hook call would be a second, subtler bug).
 */
export function SessionProgressBar(props: SessionProgressBarProps) {
  if (props.session === undefined || props.session === null) return null

  if (typeof props.useSessionPendingInteraction === 'function') {
    return (
      <StripOnAlpha1
        {...props}
        useSessionPendingInteraction={props.useSessionPendingInteraction}
      />
    )
  }
  if (typeof props.useSessionStatus === 'function') {
    return <StripOnAlpha2 {...props} useSessionStatus={props.useSessionStatus} />
  }
  return <StripWithoutPendingSeat {...props} />
}

/** Everything the strip needs that BOTH hosts still supply. */
function useStripCore(props: SessionProgressBarProps) {
  const { session, sessionId, t, useConversation, useProjection, useSessions } = props
  const chat = useConversation(conversation => conversation.views.get('chat'))
  const legacy = chat?.legacy ?? EMPTY_LEGACY
  const todos = useProjection('todos')
  const toolName = runningTool(legacy)
  const running = session.running
  const sessionRows = useSessions(s => s.byId)
  // Background state: main conversation idle while descendant subagent sessions
  // keep executing - must not read as done-green. useSessions survives alpha.2.
  const subRunning = subagentRunningCount(sessionRows, sessionId)
  return { t, running, toolName, todos, subRunning, sessionRows }
}

/** alpha.1 host: the pending-interaction map is still a standard prop. */
function StripOnAlpha1(
  props: SessionProgressBarProps & {
    useSessionPendingInteraction: NonNullable<
      SessionProgressBarProps['useSessionPendingInteraction']
    >
  },
) {
  const core = useStripCore(props)
  const pendingBySession = props.useSessionPendingInteraction(interactions => interactions)
  const ownPending = pendingKindOf(pendingBySession.get(props.sessionId)?.kind)
  const subPending = subagentPendingState(
    core.sessionRows,
    pendingBySession,
    props.sessionId,
  )
  const pending = ownPending !== null || subPending.approvals > 0 || subPending.questions > 0

  return <ProgressBarView {...core} pending={pending} ownPending={ownPending} />
}

/** alpha.2 host: the map is gone; every session carries its own pendingInteraction. */
function StripOnAlpha2(
  props: SessionProgressBarProps & {
    useSessionStatus: NonNullable<SessionProgressBarProps['useSessionStatus']>
  },
) {
  const core = useStripCore(props)
  // alpha.1  pendingMap.get(sessionId)
  // alpha.2  status.get(sessionId)?.pendingInteraction      (card DSH-0.1.6-A2-02)
  // The status map is still keyed by session id, so the whole-map read is kept
  // narrow-on-purpose below and widened only for the subtree walk below it.
  const statusBySession = props.useSessionStatus(status => status)
  const ownStatus = statusBySession.get(props.sessionId)
  const ownPending = pendingKindOf(ownStatus?.pendingInteraction?.kind)

  // The subagent-subtree walk used to consume the whole pending map. On alpha.2 the
  // pending state is distributed across the per-session status rows, so the same walk
  // is re-expressed over the status rows. (Whether the plugin's own
  // subagentPendingState helper needs a signature change to consume this shape is
  // UNCONFIRMED from the pack - it is plugin-local code and is not in the evidence.)
  const pendingBySession = pendingInteractionsFromStatus(statusBySession)
  const subPending = subagentPendingState(
    core.sessionRows,
    pendingBySession,
    props.sessionId,
  )
  const pending = ownPending !== null || subPending.approvals > 0 || subPending.questions > 0

  return <ProgressBarView {...core} pending={pending} ownPending={ownPending} />
}

/**
 * A host that supplies NEITHER pending seat: the strip still renders, with its
 * attention state degraded to "not pending". It must NOT throw - see report 3.3.
 */
function StripWithoutPendingSeat(props: SessionProgressBarProps) {
  const core = useStripCore(props)
  // DEGRADED, SILENTLY: the attention/pending badge is the only feature that cannot
  // be served. Running state, tool name, fill bar, todos percent, token usage and
  // elapsed/eta all keep working, because their props are present on every host.
  const pending = false
  const ownPending = null
  return <ProgressBarView {...core} pending={pending} ownPending={ownPending} />
}

/** Rebuild the alpha.1 pending map from the alpha.2 per-session status rows. */
function pendingInteractionsFromStatus(
  statusBySession: ReadonlyMap<SessionId, SessionStatus>,
): ReadonlyMap<SessionId, SessionPendingInteraction> {
  const out = new Map<SessionId, SessionPendingInteraction>()
  for (const [id, row] of statusBySession) {
    if (row.pendingInteraction) out.set(id, row.pendingInteraction)
  }
  return out
}

function ProgressBarView({
  t,
  running,
  toolName,
  todos,
  subRunning,
  pending,
  ownPending,
}: {
  t: SessionProgressBarProps['t']
  running: boolean
  toolName: string | undefined
  todos: unknown
  subRunning: number
  pending: boolean
  ownPending: string | null
}) {
  // ... percent / turn / elapsed / eta derivation unchanged ...
  return (
    <div className={css.bar} data-pending={pending || undefined}>
      {/* state text, fill bar, todos percent, token chip, elapsed/eta */}
    </div>
  )
}

/**
 * OPTIONAL but recommended tenant-side blast-radius guard (report 4.1).
 *
 * The host's boundary is per SLOT, not per ENTRY, and DockEntry adds no boundary of
 * its own, so an error escaping this component unmounts every co-tenant of
 * conversation.input.dock. The plugin therefore brings its OWN boundary and degrades
 * to a placeholder for THIS entry only.
 *
 * withEntryBoundary and reportSlotEntryCrash are PLUGIN-LOCAL helpers to be
 * implemented in the plugin repository (a small React class component with
 * getDerivedStateFromError plus a reporter). They are NOT host APIs - the host does
 * not export a boundary for slot entries.
 */
export const SessionProgressBarEntry = withEntryBoundary(SessionProgressBar, {
  fallback: () => <div className={css.barUnavailable} aria-hidden />,
  onError: (error) => reportSlotEntryCrash('progress', error),
})
```

**Registration stays exactly as it was** - the colleague's "fix both registrations" remedy would have changed a correct registration:

```ts
// plugin A's index.ts - UNCHANGED except for the component reference
ctx.slots.inject('conversation.input.dock', () => ctx.slots.register(
  { name: 'conversation.input.dock', id: 'progress', order: 20, locale: NS },
  SessionProgressBarEntry,   // the boundary-wrapped variant, or SessionProgressBar
))
```

### 3.3 What the fix does, and why the degradation must be silent

* **Which hook supplies the pending state on alpha.2:** `useSessionStatus` - the per-session status map (`SnapshotSelectorHook<ReadonlyMap<SessionId, SessionStatus>>`) that replaced the pending-interaction map; the pending state of one session is `status.get(sessionId)?.pendingInteraction`, and the status rows of the other sessions remain addressable by id (each carries its own `pendingInteraction`), which is what the subagent-subtree walk needs.
* **Which feature degrades on a host that supplies neither pending hook:** the *attention / pending* state of the strip - the own-session pending kind and the subagent approvals/questions surfacing - collapses to "not pending", so the `data-pending` attribute is omitted and the bar never shows the attention styling. Everything else keeps working: the running/idle state and tool name, the fill bar (including the "descendant subagents still running" background state, which rides on `useSessions` and therefore survives), the todos percentage, the token chip, and elapsed/ETA.
* **Why the degradation must be silent rather than throwing:**
  1. *It would be a co-tenant denial of service.* The dock is a shared list slot with ONE boundary whose fallback is `null`. A throw from this entry - even a well-intentioned "the host did not give me my hook" throw - unmounts every other tenant of the slot. That is precisely how a missing capability became a two-plugin outage. Silent degradation bounds the damage to the one feature that actually needs the missing capability; throwing expands it to the whole slot.
  2. *A missing capability is not a program error.* The host legitimately narrowed the kit across a version boundary. Refusing to render is not "fail fast", it is "fail loudly at the worst possible blast radius".
  3. *Silent is not invisible.* The right pattern is: degrade the feature, and (in dev builds only) log once which seat was missing, so the author sees it and the user does not. It should not be a modal or a toast either - a toast from a dock tenant is noise for a user who did nothing wrong.
  4. *The fallback must be total, not partial.* No `undefined` dereference, no optional chaining that leaves `ownPending` as a wrong type: the degraded branch is a first-class branch, not an error path.

---

## 4. Multi-tenant hygiene

### 4.1 What a dock tenant must do so its own crash cannot take down co-tenants

1. **Treat the standard kit as an optional-capability surface.** Feature-detect every host-provided hook before calling it (`typeof prop === 'function'`); never destructure-and-call a seat you have not verified exists on the host you target.
2. **Be total.** A missing capability must yield a reduced view, never an exception. Every branch of the component must be a valid, renderable state.
3. **Bring your own error boundary.** This is the decisive tenant-side rule: the host's boundary granularity is the slot, and `DockEntry` adds none of its own, so the only way a tenant can keep its own crash to itself is to catch it *inside* its own component tree (the `withEntryBoundary` wrapper above). The tenant's fallback should be a neutral placeholder, and the crash should be reported to the plugin's own log/telemetry - never to a slot-wide surface.
4. **Keep the branch stable and hook-order-safe.** Select the capability branch before any hook call, on a value that cannot change during the page's lifetime (the host's prop set is fixed per build). Never call a hook conditionally.
5. **Isolate the compatibility shim.** Put the version-dependent reads in one audited module (for example a `standardKit.ts` exposing `readPendingInteractions(props)`) instead of scattering raw destructuring of standard props across components - one place to re-audit on the next host upgrade.
6. **Test the contract shapes, not just your own code.** Keep one props fixture per supported host shape (alpha.1 props, alpha.2 props, and a **"neither"** props fixture) and assert that each renders without throwing. A "neither" fixture is the one that would have caught this incident.
7. **Publish and pin what you support.** State the supported host range in the plugin README and package peer range, and re-check the standard kit on every host upgrade - this class of breakage is exactly what the corridor cards are for.

### 4.2 What the host could change so one entry's failure isolates to that entry

1. **Move the boundary from the slot to the entry.** Wrap each `DockEntry` in its own boundary (or give `DockEntry` an internal per-entry boundary) whose fallback is an empty fragment or a small "unavailable" placeholder for that entry only, with a per-entry log record naming the entry id and the error. Keep the slot-level boundary as a last-resort net for systemic failures.
2. **Publish the standard kit as a negotiated / capability surface.** Give plugins a `hostVersion` / `capabilities` object, or a `getStandardProp(name)` accessor with a documented "removed in x.y.z" list, so a removed seat is *detectable* at runtime rather than silently `undefined`. A dev-time warning when a plugin requests a removed prop turns a silent vanish into an attributable line in the console.
3. **Deprecate before removing.** Announce a seat's removal one release ahead with a runtime warning, so the fleet has a release window to migrate instead of a same-day break.
4. **Keep, and sharpen, the slot instrumentation.** The host's line "[dsh:slots] input.dock boundary fallback active ... unmounted entries: ..." is what made this incident diagnosable at all. Per-entry records of the same kind ("slot entry crashed: <id>") are strictly better, because they name the guilty entry instead of the collective casualty list.

### 4.3 The trade-off the host faces

**Isolation granularity vs. atomicity, overhead and diagnosability.**

* *Atomicity (what is lost).* Today the slot has one all-or-nothing fallback: either the dock renders as a whole or it is blank. That is clean for systemic failures - one broken host renders one blank surface, which reads as "the dock is broken" rather than "three plugins are subtly broken". Per-entry boundaries invert this: a systemic failure now shows as N half-rendered entries, and the surface can be partially alive with inconsistent state (e.g. chips visible but the strip missing), which is harder for a user - and for the next debugger - to interpret.
* *Overhead (what is paid).* One extra error-boundary fiber per entry, plus a re-render of the subtree on catch. Dock entries are few, so the runtime cost is small, but it is paid on every list slot in the composer, and the host pays it for plugins that will never crash.
* *Diagnosability (what must be bought back).* A per-entry boundary that silently renders nothing reproduces the *user-visible* class of this incident ("a feature just does not appear") while making the *machine-visible* class worse (many small failures instead of one loud one). So isolation is only acceptable if each entry also leaves a trace: a host log record with the entry id, a console warning, and a telemetry event. Without that, the host trades a visible outage for an invisible one.
* *Verification cost (the downstream price).* With per-entry isolation, "no console error" is no longer a sufficient acceptance check - you must assert the entry's DOM marker is present. The host's own verification guidance already says this (card DSH-0.1.7-A1-01: a single "CSS loaded, no errors" check has false negatives; assert the DOM marker, zero crash records, and the expected side effects).
* *The middle option (recommended).* Keep the slot boundary as a net **and** add per-entry boundaries: a single bad entry fails soft (its own placeholder, its own log line) while a host-wide failure still blanks the whole slot and stays obvious. The net stays, the granularity improves.

---

## 5. Verification

### 5.1 The fix is client-half only - no host restart

The whole change lives in plugin A's **client** bundle (`lib/client.js`). Per the skill's plane rule (client half => a browser **hard refresh** picks it up; host half => `dsh web` must be restarted), the fix needs **no host restart**. Rebuild and refresh:

1. In plugin A's repository: `pnpm run clean && pnpm run build && pnpm run typecheck && pnpm run test` (the `clean` step first: incremental build caches produce false-positive and missed errors), then publish/deploy the rebuilt client bundle into the profile's `node_modules` (for a junction install, the repo tree *is* the served tree - no copy step; do not copy over a junction).
2. In the browser: **hard refresh** (Ctrl+Shift+R). Then confirm the *served* bytes changed (fetch the client combo URL and check the served bundle no longer calls the removed seat unconditionally) - a refresh-only check can otherwise report stale content. (Forward-planning caveat: from host 0.1.7-alpha.2 on, client bundles are cached at host boot and a refresh alone will serve stale bytes; that is not the case on the alpha.2 host in this incident.)

### 5.2 The acceptance matrix (both plugins, one refresh, no restart)

| # | Check | Expected |
|---|---|---|
| 1 | Hard refresh; the progress strip's DOM marker is present | present (it is absent today) |
| 2 | Console: `useSessionPendingInteraction is not a function` | **zero** occurrences |
| 3 | Console: "The above error occurred in the <SessionProgressBar> component" | **zero** occurrences |
| 4 | Console/host log: "[dsh:slots] input.dock boundary fallback active" and "unmounted entries: dsh-paste-input-dock, progress" | **both absent** - this was the decisive failure line |
| 5 | React DevTools tree of `InputDock` | the `input.dock` boundary contains **both** `DockEntry id="dsh-paste-input-dock"` **and** `DockEntry id="progress"` at the same time |
| 6 | Console/host log: "[dsh:slots] input.left: 1 entry mounted (dsh-paste-input-button)" | unchanged - the attach button is unaffected (regression guard for the other slot) |
| 7 | Paste a file | the toast appears **and** the chip rail renders with the file's chip; the chip can be removed |
| 8 | Switch to another session and back | the strip and the chip rail still render (the boundary resets on session switch, so this re-exercises the crash path that used to re-tear the dock) |
| 9 | Trigger a pending approval/question in the session | the strip's attention state appears (`data-pending` set) - proves the alpha.2 pending path (`useSessionStatus`) actually works, not just that nothing throws |
| 10 | On an alpha.1 host (if the plugin claims both) | the same pending state appears through `useSessionPendingInteraction`, and the dock renders with no throw |

Note on 4/5: "no console error" alone is a false-negative-prone check (as the host's own verification guidance warns). The strong assertions are 4 (the host's own fallback/unmount record) and 5 (both entries simultaneously mounted). Run them together.

### 5.3 The regression that must be covered for plugin B specifically

Plugin B is the co-tenant, so "B renders" alone is not enough - the regression is about B's independence, and it has three parts:

**(a) Co-tenant presence with the guilty tenant enabled.** Verify 5/7 **with plugin A enabled and fixed**. The failing configuration (A disabled) is the *experiment*, not the fix; a verification suite that passes only with A disabled would certify nothing. Assert that B's `DockEntry` is mounted and its chips render *while* A's entry is in the same boundary.

**(b) Blast-radius regression (the generalisable one).** Fault-injection test: temporarily register a test dock tenant that throws during render, and assert that B's chips and A's strip both survive. On the current host this test **fails by design**, because the host's boundary granularity is the slot and `DockEntry` adds no boundary of its own. Two honest resolutions: (i) ship the tenant-side guard (`withEntryBoundary`) so a throwing tenant can no longer take the slot down, in which case the test passes for A's tenant; or (ii) record the residual risk explicitly and route it to the host as the per-entry-isolation change of 4.2. Do **not** mark the verification green on "no errors" alone while this regression is outstanding.

**(c) Plugin B's own alpha.2 exposure, independent of the dock.** The dock fix does not test B. Card DSH-0.1.6-A2-01 removed `SessionListState.current`, and its first-hand evidence names a paste/drop attachment plugin that broke on alpha.2 for exactly that reason. So, with A fixed and the dock healthy: paste a file and assert that (i) the toast names the **open** session, (ii) the chip identity matches the pasted file, and (iii) no "please open a session first"-class error appears. If B resolves the current session via `sessions.list.getSnapshot().current`, apply the card's recipe - `ctx.uiSession.adapter.current.getSnapshot()` (works on both tags) or the `retainedBy.mainView > 0` row of `sessions.list.getSnapshot().byId`. Whether B does this today is **UNCONFIRMED** (B's source is not in the pack) and must be checked; this is exactly the class of problem the disable-experiment cannot see.

**(d) Fleet sweep (beyond plugin B).** Grep all six plugins' client sources for `useSessionPendingInteraction` (and for any other destructured standard-kit seat) and treat every hit as a required-if-hit item: any plugin that calls a removed seat unconditionally is a latent co-tenant bomb of the same class, whether or not it renders into `conversation.input.dock` today.

### 5.4 Layered validation (skill discipline)

Dependency resolution -> enablement resolution -> static (`clean + build + typecheck + tests`) -> runtime (real profile mount; the plugin's client entry registers and mounts its dock entry) -> behaviour (5.2 #1-#10) -> wrapper (exit code / stdout / teardown of the build). Do not let a green build substitute for the browser checks: the defect is purely a runtime prop-contract fault and compiles fine against alpha.1 types.

---

## 6. Residual risks and open items

1. **Plugin B may carry an independent alpha.2 defect** (5.3(c)) - UNCONFIRMED from the pack; check `sessions.list.getSnapshot().current` usage in B's paste handler.
2. **The other four fleet plugins are unexamined** for the same removed seat (5.3(d)). The incident proves the pattern is live in this fleet's stack, not only in plugin A.
3. **The alpha.2 `SessionStatus` record shape** is known only as `running` / `completionUnread` / `pendingInteraction` (card + contract excerpt); the exact `pendingInteraction` sub-shape (the `.kind` used by `pendingKindOf`) is UNCONFIRMED from the pack and must be checked against the host declarations before the alpha.2 branch is trusted.
4. **Plugin A's own helper `subagentPendingState`** may need a signature change to consume the status-derived map - UNCONFIRMED (plugin-local code, not in the pack). If the subtree approvals/questions surface is the one feature that cannot be preserved on alpha.2, that is a *documented* degradation, not a crash.
5. **The host-level blast radius is unchanged by this fix.** After the fix plugin A no longer throws - but the next plugin that throws in `conversation.input.dock` will again take plugin B down. The per-entry boundary change (4.2) is the structural fix; the plugin-side boundary wrapper is the mitigation available to tenants today. Until the host changes, this class of outage remains possible for any tenant in any shared slot.
6. **No host restart was needed or performed** for this analysis; nothing in the fixture was modified.

---

## Appendix - card and reference citations (key points only)

* **DSH-0.1.6-A2-01** (references/v0.1.6-alpha.2.md) - `SessionListState.current` removed with multi-instance sessions; resolve the main session through `ctx.uiSession.adapter.current.getSnapshot()` or the `retainedBy.mainView` marker; `useSessions` survives without `.current`; the card's first-hand evidence names a paste/drop attachment plugin breaking on alpha.2.
* **DSH-0.1.6-A2-02** (references/v0.1.6-alpha.2.md) - the global standard props swap `useSessionPendingInteraction` for `useSessionStatus` (+ `useSessionRetainInfo`); `useSessions` stays; the dock slot itself is unchanged; the recipe is "pick the hook by which prop the host supplies - the set is fixed per host, so the branch is stable - and degrade to an empty state when neither is present"; first-hand note: the progress strip vanished and a co-tenant's chips stopped rendering with it; upstream `dsh-ui-progress` v0.10.2 shipped the optional-seat fix.
* **DSH-0.1.6-A2-03** - the new Plugin Manager manages profile bundles; link/junction installed plugins stay outside its bundle management (relevant to why "reinstalling" a junction-installed plugin is a no-op).
* **DSH-0.1.7-A1-01** (references/v0.1.7-alpha.1.md) - a slot contribution that renders an invalid element crashes the slot-level boundary, which unmounts the WHOLE slot entry; verification must assert the DOM marker, zero crash records and the expected side effects, because a "no errors" check has false negatives.
* **DSH-0.1.7-A2-04** - from 0.1.7-alpha.2 on, client bundles are cached at host boot: editing a served `lib/client.js` needs a host restart to be served (not the case on the alpha.2 host in this incident).
* **references/migration-hygiene.md** - `clean` before build (incremental caches give false results); client half => hard refresh, host half => host restart; the `clean && build && typecheck && test` chain.
* **references/troubleshooting.md** - symptom-to-card lookup rows used for triage (dock entries vanishing, slot registration wrapping, junction-install copy hazards).
