# S23 · The Compat Guard That Passed — silent field removal, attribution, and a one-build dual-host fix

**Mode**: read-only diagnosis (plugin-upgrade skill mode A: inspect/explain, no host or plugin write).
**Corridor**: `dsh-v0.1.6-alpha.1 → dsh-v0.1.6-alpha.2` (npm global, Windows web profile, six junction-linked external client plugins).
**Evidence**: only the attached pack (`fixture/`). The plugin repository, the host tree, and `compat.ts` / `history.ts` are **not** available, so everything below is derived from the attached source + the two session-controller type excerpts + the ui-session service excerpt, cross-checked against skill card **DSH-0.1.6-A2-01** (key points only, not reproduced).
**Verdict**: the plugin reads `sessions.list.getSnapshot().current` on every keystroke. That field was removed in alpha.2 (its snapshot value is now a catalog/state record). The read yields `undefined`, which the plugin's own empty-state guard treats as "no session open", so it returns before touching `sessions.scope`. Nothing throws; the compat guard only checked that four *service members* exist, and all four still exist.

---

## 1. Silent-failure attribution

### 1.1 The per-keystroke resolution path, step by step

| # | Step (`plugin/src-client-index.ts`) | alpha.1 | alpha.2 |
|---|---|---|---|
| 1 | Activation registers the capture listener: `ctx.effect(... window.addEventListener('keydown', onKeyDown, true) ...)` (:67–70) | ok | **ok** — listener is installed, and the symptom proves it fires (see 1.4) |
| 2 | `onKeyDown` chord/target filters (:50–54): Ctrl, no Alt/Meta, `ArrowUp/Down`, not composing, composer target | pass | **pass** — the composer's own multi-line cursor movement still works, so the chord reaches us |
| 3 | `const id = sessions.list.getSnapshot().current` (:34) | `SessionId` | **`undefined` — this is the failing read** |
| 4 | `if (id === undefined) return null` (:35) | only when truly no session | **always** |
| 5 | `sessions.scope(id)` (:41) | reached | **never reached** (trap: this member still exists) |
| 6 | `actx.get('conversation')` (:43), `uiConversation.binding(id)` (:45), `input.for(actx)` (:47) | reached | **never reached** |
| 7 | `if (step.text === null) return` then `e.preventDefault()` / `stopPropagation()` / `setDraft` (:60–64) | fires on a hit | **never fires**: the handler bails at :56, before :61, so the event is *not* swallowed and the composer keeps its default cursor movement |

The exact read that now fails is **`sessions.list.getSnapshot().current`** — a field of the *value produced by* the list observable, not a member of the `sessions` service. Everything downstream of it — `sessions.scope`, the per-session `conversation`, `uiConversation.binding`, `conversation.input.for` — is unreachable, so its health is unproven and untested by this failure.

### 1.2 Why the compat guard passes

The guard (:83–88) supplies four probes — `sessions.list`, `sessions.scope`, `sessions.sessionOf`, `uiConversation.binding` — and asserts their truthiness via optional chaining. On alpha.2:

- `ctx.sessions.list` is a still-present observable object → truthy;
- `ctx.sessions.scope` still exists on `ISessions` at alpha.2 (the alpha.2 excerpt says so explicitly at :24–26, it is merely omitted for brevity) → truthy;
- `sessions.sessionOf` and `ctx.uiConversation.binding` are untouched by this refactor → truthy.

All four probes test the **container**, one level above the thing that broke: the guard asks "does the `sessions` service still expose a list observable?", while the plugin's actual dependency is "does the object returned by `list.getSnapshot()` still carry `current`?". A presence check cannot express that question, so a field-level removal is structurally invisible to it. The guard's second probe (`sessions.scope`) is an especially effective decoy here: it is *true*, yet the code path to it is dead.

### 1.3 Why nothing surfaces: no console error, and a silent no-op rather than a throw

1. **No exception is possible.** `getSnapshot()` returns a plain snapshot record; reading an absent key from a plain object yields `undefined`. There is no getter, no Proxy `get` trap, no `in`/shape assertion — so the removed field degrades to a value, not a `TypeError`.
2. **`undefined` is the pre-existing legitimate sentinel.** On alpha.1 the field was typed `current: SessionId | undefined` ("no main session"). The plugin's line-35 branch is the *correct* handling for that sentinel. At alpha.2 the "field does not exist" state and the "no session open" state are indistinguishable by construction, so the plugin takes its normal empty-state exit and no diagnostic branch exists to take instead.
3. **Activation never touches the field.** The compat wrapper only surrounds `applyBody(ctx)` at activation, and activation only registers a listener. The failing read happens *inside an event callback*, outside any guard, outside any promise/catch, and outside render — so even a wrapper that caught exceptions would have seen nothing.
4. **The failure path skips the two "visible" calls.** `e.preventDefault()` / `stopPropagation()` run only after a successful resolution (:61–62). Bailing earlier is exactly why the chord is not swallowed and the composer keeps working: the observable behaviour is "the shortcut does nothing", the mildest possible failure, with no broken UI to attract attention and no unhandled rejection in the console.
5. **The compiler could have said it, but was pointed at the old cohort.** Against alpha.2 declarations, `getSnapshot().current` is a hard TS error ("Property 'current' does not exist on type 'SessionListSnapshot'"). The plugin's `devDependencies` still pin the alpha.1 declarations, so CI stays green. The breakage is **types-visible and runtime-silent** — the worst combination, because every check the maintainer actually ran (build, guard, console, boot log) is a check that cannot see it.

### 1.4 Which earlier suspicion this settles — and which it does not

**Settles already-tried item #6** (and, as a consequence, explains #1 and #2): the capture listener *is* installed and *does* fire on every press; the bail is data-dependent, inside `resolve()`. No competing handler exists, and the fact that removing the plugin's junction changed nothing is consistent — with the listener present, the handler is ours and it exits at the empty-state branch. It also confirms #3 and #4 as non-causes (the module loads and registers; other plugins are not involved), and #5 as orthogonal: the plugin is genuinely at its latest published version and that version was written against alpha.1 — a version-chip problem is not a compatibility problem.

**Does not settle** the colleague's hypothesis ("multi-instance → re-register the slot / add `uiSession` to `inject`"). `uiSession` is the right service to add, but injecting it alone changes nothing: the failing operation is a *field read on another service's snapshot*, and the current-session identity has to be re-derived, not re-injected. `uiSession` is also not new in alpha.2 (it is registered on both tags), so "re-declare inject" is not the repair. It also leaves open whether the rest of the path (`scope(id)` → per-session `conversation` → `uiConversation.binding(id)`) still behaves on alpha.2 once an id is finally supplied — that is what §5 must prove.

---

## 2. Evidence mapping

### 2.1 What changed about the snapshot

| | alpha.1 (`host-types/session-list-alpha1.d.ts`) | alpha.2 (`host-types/session-list-alpha2.d.ts`) |
|---|---|---|
| Observable | `sessions.list: ObservableSnapshot<SessionListState>` | `sessions.list: ObservableSnapshot<SessionListSnapshot>` |
| Value | `{ byId: Record<SessionId, SessionSummary>, current: SessionId \| undefined }` | `{ items: readonly SessionListEntry[], state: 'idle' \| 'loading' \| 'error', phase: SessionListPhase, error: RemoteFailure \| null, subagentsByParent, jobsBySession }` |
| Session identity channel | `current` field | **none at the list level**; identity moves to a *binding/reference* (`retain(target, options): SessionReference`) and to `uiSession.adapter.current` |

Precisely: **the list snapshot stopped being an index-plus-pointer and became a catalog-plus-loading-state record; the `current` pointer is gone.** The alpha.1 contract used a single global "the main view is bound to this id"; the multi-instance refactor makes main-view occupancy a property of one *session reference* (reference counts, per the card's note that a main-view row is the one whose `retainedBy.mainView` is positive), which a global list snapshot can no longer express. The card records this as the breaking change (DSH-0.1.6-A2-01: `SessionListState.current` removed, resolve via `uiSession.adapter.current`), with the same plugin class — keyboard helpers doing event-time resolution — called out as the hit set.

**What the plugin now receives on every keystroke**: `undefined`, deterministically and unconditionally — in every session state, with any number of sessions open, on the first press after boot and after any switch. No runtime condition can make it non-undefined, because there is no such field. Consequences on the plugin's state machine: `lastSessionId` never becomes defined, so the "session switch → `browse = IDLE`" reset (:36–40) is dead code; `extractHistory` is never called; the draft is never read; `setDraft` is never called. The history state machine is frozen at `IDLE` forever.

Two accuracy notes:

- **`sessions.scope(id)` is *not* the failing read.** The alpha.2 excerpt explicitly says it still exists on `ISessions` (omitted only for brevity). Trusting the "scope was removed" reading would send the fix in the wrong direction.
- **Discrepancy to flag (local observation vs card).** Card DSH-0.1.6-A2-01 mentions deriving the main session from "the row with `retainedBy.mainView > 0` in `sessions.list.getSnapshot().byId`". The attached alpha.2 excerpt exposes `items: readonly SessionListEntry[]` and no `byId`. Recorded both; the catalog route is treated as card-level guidance that needs source verification against the real alpha.2 package, and is **not** used as the primary migration path below. The adapter read, by contrast, is directly attested by `ui-session-service-alpha2.d.ts`.

### 2.2 The canonical replacement read (from `ui-session-service-alpha2.d.ts`)

- **Service**: `UiSession` (class extends `Service`), exported by the client bundle of `@deepseek-ai/dsh-client-ui-session`, inject name **`uiSession`**.
- **Observable**: **`uiSession.adapter.current`**, declared `adapter: { current: ObservableSnapshot<SessionBindingValue>; bindingSource(target): BindingSource }` — "binding source of the main view's current session". It is an observable, so it can be read per press with `getSnapshot()` and subscribed to with `subscribe(listener)`.
- **Value shape**: `SessionBindingValue`
  - `key: SessionId` — the bound session's id; **`undefined` for the absent binding** (the file's closing note: `SessionBindingValue.key` of the absent binding is undefined, and the service publishes that absent value while no main session is retained);
  - `ctx: Context` — **the session-scoped context: services registered under this session resolve here**;
  - `hooks: Record<string, unknown>`, `keyedHooks: Record<string, Record<string, unknown>>`, `props: Record<string, unknown>` — per-binding standard contributions (not needed by this plugin);
  - `sourceFor(owner: SessionBinding | SessionId): BindingSource` for a specific binding; `provide(descriptor)` to publish one's own per-session hooks (not needed here).
- **The field that replaces `sessions.scope(id)` for session-scoped service resolution**: **`binding.ctx`** (`SessionBindingValue.ctx`). The per-session `conversation` service is looked up on that context — `binding.ctx.get('conversation')` — and the same context is what the input facade is minted against (`conversation.input.for(binding.ctx)`). Reading `conversation` off the *root* client context instead is the second half of the multi-instance change: with several sessions co-existing there is no single global conversation service to read.
- **Card corroboration (points only)**: DSH-0.1.6-A2-01 says `uiSession` is registered on both tags, that the private `currentBinding`/`current` fields are **not** the public path, that `adapter.current.getSnapshot()` yields a binding whose `key` is the main session id (`undefined` with no session) and which carries the session `ctx`, and that plugins should subscribe via `adapter.current.subscribe` when they cache the id.

---

## 3. Migration recipe

### 3.1 `inject` declaration

Change: **add `'uiSession'`**; keep `'sessions'` (the alpha.1 legacy channel and the list service) and `'uiConversation'` (the chat nodes read). Remove `'conversation'` from the root inject list: after the multi-instance refactor the conversation service is resolved *inside the session scope* (`binding.ctx.get('conversation')`), and a root `conversation` requirement either pins the plugin to a root provider that may no longer exist (activation then stays pending rather than running — a different, louder failure) or silently gives the wrong instance when several sessions are open. If a root provider is confirmed to still exist on both hosts, keeping it is harmless but redundant; verify via the boot log's "no pending entries" check (a required service that never resolves leaves the plugin inactive).

```ts
export const inject = ['sessions', 'uiSession', 'uiConversation']
```

### 3.2 The corrected resolution function (one build, both hosts)

```ts
import type { Context as ClientContext } from '@deepseek-ai/cordis'
import type { ISessions } from '@deepseek-ai/dsh-api-session-controller/client'
import type { UiSession, SessionBindingValue } from '@deepseek-ai/dsh-client-ui-session/client'
import type {
  ConversationNode, IConversation, SessionInput,
} from '@deepseek-ai/dsh-client-ui-conversation/client'

export const name = 'dsh-input-history'
export const inject = ['sessions', 'uiSession', 'uiConversation']

interface ResolvedSession {
  readonly input: SessionInput
  readonly nodes: readonly ConversationNode[]
}

/** A context that can resolve services (root context or a session scope). */
type SessionCtx = ClientContext & { get(name: string): unknown }

/** The session the composer is bound to, plus the scope its services resolve in. */
interface MainBinding {
  readonly id: string
  readonly ctx: SessionCtx
}

const EMPTY_NODES: readonly ConversationNode[] = []

function applyBody(ctx: ClientContext): void {
  let browse: HistoryBrowse = IDLE
  let lastSessionId: string | undefined

  const sessions: ISessions = ctx.sessions

  /**
   * alpha.2 canonical: ctx.uiSession.adapter.current is an observable of
   * SessionBindingValue { key, ctx, hooks, keyedHooks, props }.
   * alpha.1 legacy:    sessions.list snapshot carried { byId, current }, and
   *                    sessions.scope(id) was the session-scope resolver.
   * Same build, both hosts; branch 1 wins whenever the adapter is present,
   * branch 2 is the fallback for hosts without it.
   */
  const currentMainBinding = (): MainBinding | null => {
    const ui = (ctx as ClientContext & { uiSession?: UiSession }).uiSession

    // --- alpha.2 path (also valid on alpha.1: the adapter exists on both tags) ---
    const binding = (ui?.adapter.current.getSnapshot() as unknown) as
      | Partial<SessionBindingValue>
      | undefined
    if (binding?.key !== undefined) {
      const scope = (binding.ctx ?? sessions.scope(binding.key)) as SessionCtx | undefined
      if (scope === undefined) return null
      // SessionBindingValue.ctx is the session scope that replaces sessions.scope(id).
      return { id: binding.key, ctx: scope }
    }

    // --- alpha.1 path: the removed field still exists there; undefined on alpha.2 ---
    const legacy = sessions.list.getSnapshot() as unknown as { readonly current?: string }
    const id = legacy.current
    if (id === undefined) return null
    const scope = sessions.scope(id) as SessionCtx | undefined
    return scope === undefined ? null : { id, ctx: scope }
  }

  const resolve = (): ResolvedSession | null => {
    const session = currentMainBinding()
    if (session === null) return null

    if (session.id !== lastSessionId) {
      // Session switch: recall must start fresh on the new session.
      browse = IDLE
      lastSessionId = session.id
    }

    // The conversation service is registered in the session scope, not at the root.
    const conversation = session.ctx.get('conversation') as IConversation | undefined
    if (conversation === undefined) return null

    const chat = ctx.uiConversation.binding(session.id).snapshot.getSnapshot().views.get('chat')
    const nodes = chat === undefined ? EMPTY_NODES : chat.legacy.nodes
    return { input: conversation.input.for(session.ctx as never), nodes }
  }

  const onKeyDown = (e: KeyboardEvent): void => {
    if (!e.ctrlKey || e.altKey || e.metaKey) return
    if (e.key !== 'ArrowUp' && e.key !== 'ArrowDown') return
    if (e.isComposing) return
    if (!isComposerTarget(e.target)) return
    const resolved = resolve()
    if (resolved === null) return
    const history = extractHistory(resolved.nodes)
    const draft = resolved.input.state.getSnapshot().draft
    const step = e.key === 'ArrowUp' ? up(history, draft, browse) : down(history, browse)
    if (step.text === null) return
    e.preventDefault()
    e.stopPropagation()
    browse = step.browse
    resolved.input.setDraft(step.text)
  }

  ctx.effect(() => {
    window.addEventListener('keydown', onKeyDown, true)
    return () => { window.removeEventListener('keydown', onKeyDown, true) }
  }, 'dsh-input-history: composer keyboard capture')
}
```

Notes on the code:

- The two mismatched shapes are absorbed by one local cast per branch (`sessions.list.getSnapshot() as { current?: string }`, and the `SessionBindingValue` partial read). Everything else stays typed against the *current* cohort; do not widen the whole `sessions` service to `any`, or the next field removal becomes invisible again.
- Branch 1 is attempted first on **both** hosts: the public adapter exists on alpha.1 as well (per DSH-0.1.6-A2-01), and it is the only path that also carries the session `ctx` on alpha.2. Branch 2 is the alpha.1-only safety net; on alpha.2 it is dead code by design (`current` is `undefined`), which is exactly the behaviour that keeps the ladder total.
- No caching is introduced, so no subscription is required — `currentMainBinding()` is evaluated per press and is therefore always fresh. If a future revision caches the id, subscribe through `ui.adapter.current.subscribe(listener)` inside the same `ctx.effect` and dispose it there.
- The absent-binding case is handled by `binding.key === undefined` (not by "the snapshot is undefined"), matching `SessionBindingValue`'s documented absent value; both are tolerated.
- `conversation.input.for(session.ctx)` is the same call as before, but the context is now the binding's session scope on alpha.2 — that is how the session-scoped `conversation` instance reaches the input facade.

---

## 4. Guard hardening

### 4.1 The class of breakage presence-checks cannot catch

Checks like the shipped four (`['sessions.list', ctx.sessions.list]` …) are **service-level presence probes**. They fail only when a *named member of a service object disappears*. They cannot see:

- **field-level removal inside a value**: the service, method, arity and truthiness all stay identical, while the object *returned at call time* no longer carries a field. `ctx.sessions.list` truthy says nothing about `list.getSnapshot().current`.
- **sentinel collision**: the removed field degrades to `undefined` — a value the plugin already treats as a legitimate empty state — so the break is indistinguishable from normal "no session".
- **semantic drift**: the same member keeps its name but changes meaning/shape (a snapshot that used to be a pointer+index becomes a catalog; a method that used to return a scope returns a reference). Method presence is stable; the contract is not.
- **lifecycle drift**: a member that exists at activation but is empty at activation and meaningful only later, or vice versa — the check is a single point-in-time sample of *structure*, taken before any event-time data exists.
- **anything below the abstraction the plugin actually consumes**: the guard stands at the service boundary, the break happens at the terminal data boundary (draft, nodes, per-session conversation).

This is exactly the alpha.2 failure mode: name-compatible services, incompatible *values*.

### 4.2 What the hardened guard should probe instead

Probe the **produced value and the terminal capability**, not the service roster:

1. **Value shape of the read the plugin depends on.** Call the read path and assert *own fields on the value*: `uiSession.adapter.current.getSnapshot()` must expose both `key` and `ctx` (they exist even on the absent binding, so this is checkable before any session is retained). A field-level probe at the level that actually broke.
2. **Terminal capability, one level further down.** When a binding exists (`key !== undefined`), assert `ctx.get('conversation')` is an object with `input.for` and `input.setDraft` / `input.state.getSnapshot` — and that `uiConversation.binding(key).snapshot.getSnapshot().views` is a Map-like with `get`. These are the four things the keystroke path truly consumes.
3. **Both channels, ORed — mirroring the resolution ladder.** The probe must accept *either* `uiSession.adapter.current` (alpha.2) *or* a list snapshot that contains `'current' in value` (alpha.1), and fail only when **neither** can yield a session scope. Never assert on one host's channel: that converts a legitimate cohort difference into a false incompatibility banner.
4. **(Compile-time guard)** Type the probe against the target cohort's declarations (`skipLibCheck: false`, declare the consumed packages directly). A guard made of strings can never fail for a field that still exists; a typecheck against alpha.2 would have rejected `.current` outright.

Sketch:

```ts
type Probe = { ok: boolean; missing: readonly string[] }

function probeHost(ctx: ClientContext, sessions: ISessions): Probe {
  const missing: string[] = []
  const ui = (ctx as ClientContext & { uiSession?: UiSession }).uiSession

  // (1) value shape, not service presence — valid even with no session retained
  const binding = (ui?.adapter.current.getSnapshot() as unknown) as
    | { readonly key?: string; readonly ctx?: unknown }
    | undefined
  const hasAdapterShape = binding !== undefined && 'key' in binding && 'ctx' in binding
  if (ui !== undefined && !hasAdapterShape) missing.push('uiSession.adapter.current -> { key, ctx }')

  // (2) terminal capability, once a real session is bound
  if (binding?.key !== undefined) {
    const scope = (binding.ctx ?? sessions.scope(binding.key)) as SessionCtx | undefined
    const conversation = scope?.get('conversation') as IConversation | undefined
    if (conversation === undefined) missing.push(`binding.ctx.get('conversation')`)
    else if (typeof conversation.input?.for !== 'function') missing.push('conversation.input.for')
    else if (typeof conversation.input?.setDraft !== 'function') missing.push('conversation.input.setDraft')
  }

  // (3) alpha.1 channel accepted as an alternative
  const legacy = 'current' in (sessions.list.getSnapshot() as object)
  if (!hasAdapterShape && !legacy) missing.push('uiSession.adapter.current OR list snapshot .current')

  return { ok: missing.length === 0, missing }
}

// first-use self-check: a known-open session that resolves to null is an incompatibility,
// not an empty state.
const knownOpen = ui?.adapter.current.getSnapshot()?.key !== undefined
if (resolved === null && knownOpen) reportIncompatibleOnce(missingHint)
```

### 4.3 When the probe must run (two points, both required)

- **At activation**, immediately after injection resolution and **before** installing the capture listener: a structural/value-shape probe only (items 1 and 3). This catches "the field this plugin reads is gone" at the same lifecycle moment the old guard ran, so a remedial banner appears instead of a dead listener. It cannot use item 2, because at activation the host may legitimately still be restoring the main session.
- **At the first event-time resolution — and re-checked on each session switch**: the behavioural probe (item 2 plus the "`knownOpen` but resolved `null`" cross-check). This is the only point where a session provably exists, so it is the only point that can decide "this host cannot give me a session scope" rather than "no session is open yet". The first press is also where the alpha.2 break becomes observable at all; a guard that only runs at activation can never see it.

Reporting rule: a failed probe renders the existing remediation banner and logs once (deduplicated by key); it must never silently `return null` — that is precisely how this bug stayed invisible for a day.

---

## 5. Verification and prevention

### 5.1 Verifying the fix on both hosts, without a full migration

1. **Dual-cohort static check (cheapest, decisive).** Two typecheck projects over the same source: one against the alpha.1 declaration cohort, one against alpha.2 (`skipLibCheck: false`; declare `@deepseek-ai/cordis`, the session-controller client types, `dsh-client-ui-session`, `dsh-client-ui-conversation` directly). Expected: the old `.current` line fails on the alpha.2 project; the new ladder passes on both. No host, no install, no browser.
2. **Pure-logic test of the ladder (no host).** Drive `currentMainBinding()` with two fake contexts — `{ list: { getSnapshot: () => ({ byId, current: 's1' }) }, scope: () => scopeS1, uiSession: undefined }` and `{ list: { getSnapshot: () => ({ items: [], state: 'idle' }) }, scope, uiSession: { adapter: { current: { getSnapshot: () => ({ key: 's2', ctx: scopeS2 }) } } } }` — and assert: alpha.1 → `s1`/legacy, alpha.2 → `s2`/adapter, absent binding (`key: undefined`) → `null`, no throw in any case. This is the "both hosts from one build" proof that does not require either host.
3. **Real-host smoke on both tags, same artifact.** Keep an alpha.1 install (or a second profile pinned to `@deepseek-ai/dsh@0.1.6-alpha.1` with its own `DSH_HOME`) and the existing alpha.2 host; junction the *same built* client bundle into both. Because the change lands in the client half, a browser hard refresh is enough — no host restart (migration-hygiene item 3), though a restart is the clean baseline. Acceptance, matching DSH-0.1.6-A2-01's verification clause: one session open → Ctrl+Up fills the composer with the last sent message, and the event is *default-prevented* (the composer cursor does not move); Ctrl+Down walks back; switching the main-view session resets recall to `IDLE`; with no session open the resolution returns `null` without a throw and without a banner; the boot log still prints "no pending entries" (proves the `inject` change resolves on both hosts); the client artifact is actually requested and mounted (registration proven, not a bare 200).
4. **Guard regression.** Force the failure artificially on alpha.2 (temporarily rename `uiSession` off the context / return an absent binding) and confirm the hardened probe produces the banner at activation and the first-press diagnostic instead of a silent no-op.
5. **Grep the rest of the plugin for the same read.** `getSnapshot().current` is a fleet-wide pattern for event-time resolution (the card records the same break in a paste/drop plugin); fix and guard every occurrence, not just `resolve()`.

### 5.2 The single host-side change that would have made this loud at activation

Publish an **explicit runtime compatibility marker on the client session surface and declare it required in the types** — for example `ISessions.clientApi: { sessionList: 1 | 2 }` (equivalently, a required `shape: 'catalog-v1' | 'catalog-v2'` discriminant on the snapshot value itself). A guard then compares the marker at activation, so a *field-level* removal becomes a failed activation probe — before any listener installs — with an actionable banner, and a plugin built against the new cohort cannot even typecheck without acknowledging the boundary. Types alone cannot do this: a type-level deletion is invisible at runtime, because activation never reads the deleted field.

Complementary, not equivalent: leave a **tombstone accessor** on the alpha.2 snapshot value,

```ts
get current(): never {
  throw new Error('SessionListState.current was removed in dsh-0.1.6-alpha.2; read uiSession.adapter.current.key')
}
```

which converts every stale read into a loud, specific exception at first use (and into a banner if the compat wrapper covers that read). It is a genuine improvement over silent `undefined` — but it fires at event time, not activation, for the same reason the original bug did not throw: nothing reads the field during activation. That is why the marker, not the tombstone, is the change that satisfies "loud at plugin activation".

---

## Appendix · scope, evidence, and residual risk

**Evidence used**: `fixture/symptom-report.md`, `fixture/plugin/src-client-index.ts` (:34–47 the resolution path, :67–70 listener, :78–90 guard), `fixture/host-types/session-list-alpha1.d.ts`, `fixture/host-types/session-list-alpha2.d.ts`, `fixture/host-types/ui-session-service-alpha2.d.ts`, `fixture/upgrade-notes.txt` (boot log shows the plugin loaded, no pending entries, no duplicate loader ids — the plugin *is* active, which corroborates that activation succeeds and the failure is event-time).
**Cards**: DSH-0.1.6-A2-01 (this exact break: `current` removed, resolve via `uiSession.adapter.current`, both-tag availability, verification criteria); DSH-0.1.6-A2-02 (same *class* — a fielded prop removal that also survives service-level guards — but a different read; not applicable to this plugin's path); DSH-0.1.6-A2-04 (npm lag, irrelevant to the diagnosis). Card text is deliberately paraphrased to points + IDs.

**Skipped / not applicable**: package-manager or lockfile migration (this is a diagnosis of an in-place host upgrade, not a dependency move); slot re-registration (no slot is used by this plugin — it is a document-level keydown capture); Plugin Manager adoption (A2-03, informational); Windows junction repair (A2-03/§5: the plugin loads, so the link is sound).

**Residual risk / unverified**: the plugin repository is absent, so `applyWithCompat`'s exact catch scope, `history.ts`'s state machine, and any other `.current` reads in the same plugin are unknown; `sessions.scope` was never executed on alpha.2, so its alpha.2 behaviour is taken from the type excerpt, not observed; whether a root-level `conversation` provider still exists on alpha.2 is not determinable from the pack (the `inject` recommendation includes the pending-service check that settles it); the catalog-derivation alternative (`retainedBy.mainView`) conflicts with the excerpt's `items` shape and is left unverified; and no host is available in this read-only session, so §5's runtime steps are a plan with explicit pass criteria, not executed results.
