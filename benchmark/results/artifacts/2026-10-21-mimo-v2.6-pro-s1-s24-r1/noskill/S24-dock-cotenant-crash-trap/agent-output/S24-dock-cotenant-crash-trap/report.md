# S24 · The Dock That Vanished Together — Root-Cause Report

## 0. Summary

One component caused both symptoms. Plugin A (session-progress, `dsh-ui-progress`)
throws `TypeError: useSessionPendingInteraction is not a function` at its pending-state
call, because the alpha.2 standard kit **removed** that hook and replaced it with
`useSessionStatus`. The throw happens during render inside the **single, slot-wide
`DrawerErrorBoundary`** that wraps the entire `conversation.input.dock` entry list.
The boundary fallback is `null`, so **every** entry in that slot unmounts — including
plugin B's innocent chip rail. The attach button survives only because it lives in a
different slot (`conversation.input.left`) behind a different boundary.

---

## 1. Culprit attribution

### Who fails, and at exactly which call

- **Plugin**: plugin A, the session-progress plugin (`dsh-ui-progress`), component
  `SessionProgressBar` (bundle: `plugin://dsh-external/dsh-ui-progress/lib/client.js`,
  component at line 201, fault at **line 219, column 41**).
- **The call**: the attention-state selector call:

  ```tsx
  const pendingBySession = useSessionPendingInteraction(interactions => interactions)
  ```

- **Why it throws**: the console shows exactly one error —
  `Uncaught TypeError: useSessionPendingInteraction is not a function`, and the React
  stack names only `SessionProgressBar` (`at SessionProgressBar ... at DockEntry
  ... at DrawerErrorBoundary ... at InputDock`). On alpha.2 the prop is still
  destructured from the standard kit but the host no longer supplies it, so the name is
  `undefined`; the component calls it **unconditionally during render**, hence
  "is not a function". This is a pure render-phase crash (mountIndeterminateComponent),
  which is precisely the class of error React error boundaries can catch.

### Why now — the standard-kit reduction between the two contracts

Reading the sealed contracts (`host-types/slots-contract-alpha1.d.ts` vs
`slots-contract-alpha2.d.ts`), the alpha.2 standard kit for
`conversation.input.dock` changed as follows:

| Member | alpha.1 | alpha.2 |
|---|---|---|
| `useConversation`, `useSessions`, `useProjection`, `useInput`, `inputActions` | present | present (unchanged) |
| `useSessionPendingInteraction` (`ReadonlyMap<SessionId, SessionPendingInteraction>`) | present | **removed** |
| `useSessionStatus` (`ReadonlyMap<SessionId, SessionStatus>`, status = `running, completionUnread, pendingInteraction`) | — | **added** |
| `useSessionRetainInfo` | — | **added** (multi-instance refactor) |

So between the two sealed contracts the kit **reduced one seat and added two**:
`useSessionPendingInteraction` was folded into the new per-session status map
(`SessionStatus.pendingInteraction`) as part of the multi-instance refactor of
`@deepseek-ai/dsh-client-ui-session` (whose `GlobalStandardProps` are now merged into
every slot's standard props). Plugin A compiled against the alpha.1 contract and consumed
the old seat by name without feature detection. The moment the host stopped injecting that
name, the same code that worked "this morning" became a guaranteed render crash.

### Why the innocent co-tenant's dock entry disappears — the mechanism

**Mechanism: co-tenant crash through a shared, slot-level error boundary (slot blast
radius in a list slot).** From `host-types/dock-render-tree.md`:

- `conversation.input.dock` is a **list slot** (session scope). Its whole entry list is
  wrapped in **one** `<DrawerErrorBoundary name="input.dock">`.
- `DockEntry` itself "adds no boundary of its own" — there is **no per-entry isolation**.
- `DrawerErrorBoundary` is a standard React class boundary
  (`getDerivedStateFromError` → fallback `null`).

A React error boundary replaces its **entire wrapped subtree** with the fallback when any
descendant throws during render. `SessionProgressBar` (order 20) throws; the nearest
boundary — the one for the whole `input.dock` slot — catches, renders `null`, and both
entries unmount. The host log confirms it verbatim:

> `[dsh:slots] input.dock boundary fallback active (session s-7f3a); unmounted entries:
> dsh-paste-input-dock, progress`

That is why plugin B's chip rail (`dsh-paste-input-dock`, order 5) vanishes **together**
with the strip although B never threw: both are co-tenants of the same boundary, so one
tenant's crash is the whole slot's crash. (React even says so: "React will try to recreate
this component tree from scratch using the error boundary you provided,
`DrawerErrorBoundary`" — and since A crashes deterministically, the fallback stays until
the boundary resets on the next session switch.)

### Why the attach button survives while the chips do not

Per the render tree, the composer renders three sibling regions:

```
<InputLeft>  <DrawerErrorBoundary name="input.left"> <SlotEntry id="dsh-paste-input-button"/> </DrawerErrorBoundary> </InputLeft>
<InputDock>  <DrawerErrorBoundary name="input.dock"> <DockEntry id="dsh-paste-input-dock"/> <DockEntry id="progress"/> ... </DrawerErrorBoundary> </InputDock>
```

`AttachButton` (plugin B, `conversation.input.left`, order -100) sits under **its own**
boundary, `input.left`. Error boundaries do not propagate across sibling subtrees, so the
throw inside `input.dock` never touches `input.left`. That is exactly what the log shows:
`[dsh:slots] input.left: 1 entry mounted (dsh-paste-input-button)`.

The asymmetry is purely a boundary-granularity artifact: isolation in this shell is
**per-slot, not per-entry**. All `input.dock` entries share one fate (chips + strip die
together); `input.left` entries share another (button lives). Nothing about "which plugin
you are" decides survival — only which boundary you render under.

---

## 2. The experiment — the decisive evidence

### What the disable-experiment proves

Maintainer's key experiment (tried-notes.txt #3): disable plugin A → refresh → plugin B's
chips **come back immediately**; re-enable A → chips gone again. This is a controlled
single-variable experiment: only A's presence toggles; plugin B's installation, the host
version, the contracts, and the data are held fixed. It proves:

1. **Causation and direction.** Plugin A's rendering is *necessary* (and in this
   configuration *sufficient*) for the chips' disappearance. The co-tenant failure is
   *derived* from A's crash, not an independent defect.
2. **Plugin B's disappearance is not a B defect at all.** B recovers with *zero* changes
   to B — no reinstall, no reconfigure, no code edit. The shared-boundary mechanism
   predicts exactly this.
3. Together with the single console error (only `SessionProgressBar` in the stack), it
   closes the whole chain: **A throws → `input.dock` boundary falls back to `null` →
   all dock entries unmount**.

### What it does NOT prove

- **It does not prove plugin B is bug-free on alpha.2.** It only shows B's chip rail
  renders fine *while the shared boundary stays healthy*. B could still harbor latent
  problems the experiment never exercises (drop handling, chip `remove`/add paths across
  session switches, other hosts, other states). Separately — and this comes from code
  inspection, **not** from the experiment — B's `AttachmentChips` reads only its own
  injected state and uses **no standard-kit hooks at all**, so the alpha.2 kit reduction
  cannot have hit it. The experiment alone cannot distinguish "B is fine" from "B is
  broken but masked".
- **It does not prove the strip crash is the ONLY dock problem.** A boundary fallback
  hides the entire slot at once: "exactly one render error" is one error *visible per
  attempt*, and the fallback unmounts sibling entries before they can render and possibly
  fail themselves. With A disabled, other dock tenants' failure modes (and other code
  paths of A) were never exercised. Nor does it speak to non-dock slots beyond the one
  observed success (`input.left`).

### Why reinstalling plugin B could never have helped

The causal chain contains no state that reinstalling B can change:

- B's files were never corrupt: its registration succeeded (`dsh-paste-input-dock` was
  mounted — the log lists it as *unmounted by the boundary fallback*, not as failed to
  mount), and its own try/catch logged nothing.
- The crashing render is in **plugin A's** bundle (`dsh-ui-progress/lib/client.js:219`).
- The unmount decision is made by the **host's** `DrawerErrorBoundary`.

Reinstalling B from the mirror tag replaces B's bytes with equivalent bytes. The outcome
is invariant under that change — which is precisely why the maintainer observed "no
change". A reinstall of **A** (or A's fix) is what the mechanism points to; reinstalling B
was aimed at the wrong side of the dependency.

### What is wrong with the colleague's "both plugins were hit" theory

Theory: "alpha.2 changed slot props; both plugins use a removed prop; fix both
registrations." It fails on four counts:

1. **Code**: B's chips consume **no** standard-kit props (only `inject: sessionId =>
   ({ remove, add })`). A removed prop cannot hit a consumer that consumes none.
2. **Evidence**: exactly **one** render error, with only `<SessionProgressBar>` in the
   component stack. If both had been hit by the kit change, there would be two error
   sites (or one from B).
3. **Control experiment**: if B were independently broken, disabling A would not restore
   the chips. It does — instantly.
4. **Symptom shape**: the theory cannot explain the *asymmetry* — B's attach button (same
   plugin, different slot) survives while B's chips (same plugin, shared slot) die. Only
   the shared-boundary account explains that split; a per-plugin prop bug would not
   respect slot boundaries.

Worse, acting on the theory is not just wasted work: "fixing" B's registration (e.g.
dropping or rewriting its dock entry) could make the symptom *appear* resolved while
leaving the actual crash in A alive — and any future co-tenant would be blacked out again.
The correct change scope is exactly one component: plugin A's access to the pending seat.

---

## 3. The fix — graceful degradation for the removed seat

**Seats across the contracts:**

- alpha.2 supplies pending state via **`useSessionStatus`** →
  `status.get(sessionId)?.pendingInteraction` (per-session status map).
- alpha.1 supplied it via `useSessionPendingInteraction` (removed in alpha.2).
- A host that supplies **neither**: the strip must degrade, not throw.

**What degrades / what keeps working on a host with neither pending hook:**

- **Degrades (silently absent):** the *attention decoration* — the `data-pending`
  highlight and pending affordance, i.e. own pending interaction **and** the subagent
  subtree's pending approvals/questions (they are derived from the same pending map, which
  is empty). `pending` is simply always false.
- **Keeps working:** state text, fill bar (running state), todos percent, token chip,
  elapsed/eta — and the background state (subagent running count, which reads
  `useSessions`, present in both contracts), so the "must not read as done-green" behavior
  survives too.

**Why the degradation must be silent rather than throwing:** throwing during render is
*exactly* the failure mode this bug is made of — a throw trips the shared slot boundary
and unmounts innocent co-tenants. A removed *decorative* seat must never cost the entry,
and must never cost the slot. Silent degradation (at most a one-time dev-only warning)
also keeps consoles clean on hosts that legitimately lack the seat, and is the tenant-side
half of multi-tenant hygiene: **a slot entry's render must be total**.

### Corrected component

```tsx
/**
 * SessionProgressBar (corrected) — plugin A, tolerant of the alpha.2
 * standard-kit reduction (useSessionPendingInteraction removed).
 */
export type SessionProgressBarProps =
  import('@deepseek-ai/dsh-client-ui-slots').PropsRuntime<'conversation.input.dock'>
  & PropsLocale<'progress'>

type PendingLike = { kind?: string }
type PendingMapLike = ReadonlyMap<SessionId, PendingLike | undefined>

const EMPTY_PENDING: PendingMapLike = new Map()

/** Seat used when the host supplies neither pending hook: never throws. */
const useNoPendingInteraction = (): PendingMapLike => EMPTY_PENDING

/**
 * Accepts both kit shapes without knowing the host version:
 *  - alpha.1 SessionPendingInteraction entries (used as-is),
 *  - alpha.2 SessionStatus entries (read .pendingInteraction).
 */
function normalizePending(raw: unknown): PendingMapLike {
  const map = raw as PendingMapLike | undefined
  if (!map || typeof map.get !== 'function' || map.size === 0) return EMPTY_PENDING
  const first = map.values().next().value as Record<string, unknown> | undefined
  if (first && typeof first === 'object' && 'pendingInteraction' in first) {
    const out = new Map<SessionId, PendingLike | undefined>()
    for (const [id, status] of map) {
      out.set(id, (status as { pendingInteraction?: PendingLike })?.pendingInteraction)
    }
    return out
  }
  return map
}

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

  // Attention state: kit-tolerant pending seat, graceful degradation.
  //   alpha.2 -> useSessionStatus (SessionStatus.pendingInteraction)
  //   alpha.1 -> useSessionPendingInteraction
  //   neither -> silently no pending decoration (never throw).
  // The host's kit is fixed for the lifetime of a mount, so this branch — and
  // with it the hook call sequence — is constant across renders.
  const usePendingSeat =
    typeof useSessionStatus === 'function' ? useSessionStatus
      : typeof useSessionPendingInteraction === 'function' ? useSessionPendingInteraction
        : useNoPendingInteraction

  const pendingBySession = normalizePending(usePendingSeat(m => m))

  const ownPending = pendingKindOf(pendingBySession.get(sessionId)?.kind)
  const subPending = subagentPendingState(
    useSessions(s => s.byId), pendingBySession, sessionId)
  const pending = ownPending !== null || subPending.approvals > 0 || subPending.questions > 0

  // Background state: main conversation idle while descendant subagent
  // sessions keep executing - must not read as done-green. (unchanged)
  const subRunning = subagentRunningCount(useSessions(s => s.byId), sessionId)

  return (
    <div className={css.bar} data-pending={pending || undefined}>
      {/* state text, fill bar, todos percent, token chip, elapsed/eta —
          all keep rendering regardless of which seat (if any) exists */}
    </div>
  )
}
```

Notes on the shape of the fix:

- The crash site becomes unreachable: a non-function seat is never called
  (`typeof` guard), so `TypeError: ... is not a function` cannot occur again.
- On alpha.2 the **feature is restored**, not merely muted: pending state is read from
  `useSessionStatus(...).get(sessionId).pendingInteraction`.
- The fallback seat is a plain hook of stable identity (`useNoPendingInteraction`), so
  hook order is preserved even in the degraded case.

---

## 4. Multi-tenant hygiene

### What a dock tenant should do so its own crash cannot take down co-tenants

1. **Never call an optional standard-kit member unchecked.** Feature-detect with
   `typeof x === 'function'` (or optional call guards) for any member outside the
   guaranteed core, and degrade silently when it is absent.
2. **Make render total.** A slot entry's render path must not throw for any host in its
   supported range. Wrap risky work (fold scans, third-party parsing, network-shaped
   data) in try/catch — plugin B already does this — and keep thrown errors out of render.
3. **Belt and braces: give the entry its own tiny error boundary** (or render a
   placeholder on error) so that even an unforeseen throw collapses *only* that entry.
4. **Type against the sealed contracts.** Compile the client against both
   `slots-contract-alpha1.d.ts` and `slots-contract-alpha2.d.ts` (or declare a peer host
   range). Plugin A's own `PropsRuntime<'conversation.input.dock'>` typing would have
   flagged the removed seat at build time instead of at runtime in production.
5. **Treat decoration as decoration.** Optional visual affordances must fail soft; core
   duty (here: progress reporting) must survive any decoration failure.
6. **Keep entries independent.** No shared mutable module state between one's entries, no
   assumptions about sibling entries, no writes to shared DOM.

### What the HOST could change to isolate one entry's failure

1. **Per-entry error boundaries**: wrap each `SlotEntry`/`DockEntry` in its own boundary
   inside the list slot (the render tree notes that `DockEntry` "adds no boundary of its
   own" — that is the exact insertion point), keeping the slot-level boundary as a
   second line of defense.
2. **Surface failures**: emit telemetry when a boundary trips (the `[dsh:slots]` log
   already does) and optionally render a visible "entry failed" placeholder instead of
   `null`, so a crashed entry is diagnosable rather than invisible.
3. **Soften contract drift** (optional): for one release, ship removed members as
   deprecated aliases of their replacements (e.g. `useSessionPendingInteraction` as an
   alias over the new status seat), so old tenants degrade instead of crashing.

### The trade-off the host faces

**Containment granularity vs. overhead and failure visibility (blast radius vs. silent
partial degradation).** Per-entry boundaries add tree depth, one boundary instance per
entry, and reset-semantics bookkeeping; more importantly they **mask** failures — a broken
entry becomes a silent blank (or placeholder), so a dock can ship partially broken and
nobody notices without telemetry, and the composer may render "half a dock" (chips but no
strip), which reads as inconsistent. The whole-slot boundary, by contrast, is
all-or-nothing: a failure is loud and consistent but takes innocent co-tenants with it.
The host must choose between a wide blast radius and individually invisible failures —
and decide whether a failed entry should show a placeholder (debuggable, uglier) or vanish
cleanly (tidier, hides breakage).

---

## 5. Verification (restore BOTH dock entries, no host restart)

The fix lives in plugin A's client bundle; the host only needs to re-inject the entry
(`ctx.slots.register` on plugin reload) or the web client refreshed. **No host restart.**
Note the boundary's fallback "resets on the next session switch" — so after deploying the
fix, reload the client or switch sessions once to clear the stale fallback state.

1. **Mount check (same session):** React DevTools mount tree shows **both**
   `<DockEntry id="dsh-paste-input-dock">` (order 5) and `<DockEntry id="progress">`
   (order 20) under `DrawerErrorBoundary name="input.dock"`; the `[dsh:slots]` log shows
   `input.dock` with 2 entries mounted and **no** `boundary fallback active` line.
2. **Function check:** paste a file → chip rail renders; the strip shows state text, fill
   bar, todos percent, token chip, elapsed/eta **at the same time**.
3. **Console check:** zero errors during mount and during paste; the old
   `useSessionPendingInteraction is not a function` must not reappear.
4. **Feature check (the fix restores, not merely mutes):** trigger a real pending
   interaction (subagent approval/question) and confirm `data-pending` lights up via
   `useSessionStatus`; confirm a running subagent still prevents done-green via
   `useSessions`.
5. **Degradation check (RTL/unit):** render the component with (a) only
   `useSessionStatus`, (b) only `useSessionPendingInteraction`, (c) **neither** — (c)
   must render without `data-pending`, without throwing, with all core parts present.

### Regression the verification must cover for plugin B specifically

- **Chips pipeline:** paste **and drop** flows render the rail; per-chip `remove`/`add`
  injected actions work (B's own state path); behavior holds across session switches
  (boundary reset semantics) and with both orders present (chips at order 5, strip at 20).
- **Co-tenant isolation:** with plugin A enabled (the old crash scenario), B's
  `dsh-paste-input-dock` entry must stay mounted; if the host adopts per-entry
  boundaries, add a fault-injection test (an artificial dock entry that throws) proving B's
  entry survives a neighbor's crash — the exact regression this incident is about.
- **Cross-slot control:** the `input.left` attach button renders throughout.
- **Turn the maintainer's experiment into a permanent regression test:** toggling
  plugin A's dock entry must no longer flip plugin B's chips.

---

## run-stats

- toolcalls: 28 (8 top-level: 7 run_code + 1 send_message; 20 nested: 1 glob, 11 read, 8 write)
- token usage: n/a (not visible to this session)
- completed: 2026-10-21T16:07:42.451+08:00 (Asia/Shanghai)