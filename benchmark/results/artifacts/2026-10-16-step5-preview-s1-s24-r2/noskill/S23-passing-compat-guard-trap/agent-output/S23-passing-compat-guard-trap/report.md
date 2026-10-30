# S23 · The Compat Guard That Passed — analysis

**Subject**: `@dsh-external/dsh-input-history` (client half) silently stops recalling composer
input after `@deepseek-ai/dsh` `0.1.6-alpha.1 → 0.1.6-alpha.2` (npm global, Windows, web profile).

**Evidence used** (all read-only, all inside the fixture pack):
[README.md](../fixture/README.md), [symptom-report.md](../fixture/symptom-report.md),
[plugin/src-client-index.ts](../fixture/plugin/src-client-index.ts),
[host-types/session-list-alpha1.d.ts](../fixture/host-types/session-list-alpha1.d.ts),
[host-types/session-list-alpha2.d.ts](../fixture/host-types/session-list-alpha2.d.ts),
[host-types/ui-session-service-alpha2.d.ts](../fixture/host-types/ui-session-service-alpha2.d.ts),
[upgrade-notes.txt](../fixture/upgrade-notes.txt).

**One-line verdict**: the multi-instance Session refactor in alpha.2 removed the
`current` field from the snapshot published by `sessions.list`. The plugin's very first
read on every keystroke — `sessions.list.getSnapshot().current` at
[src-client-index.ts:34](../fixture/plugin/src-client-index.ts#L34) — now evaluates to
`undefined`, so `resolve()` returns `null`, `onKeyDown` returns before `preventDefault()`,
and the chord does nothing. Nothing throws, nothing logs, and the shipped guard probes
service *members* (all still present) rather than the *snapshot shape* it dereferences.

---

## 1. Silent-failure attribution

### 1.1 The per-keystroke resolution path

Activation: `apply()` → `applyWithCompat(...)` → guard passes → `applyBody(ctx)` →
`ctx.effect(...)` registers a **capture-phase** `keydown` listener on `window`
([src-client-index.ts:67-70](../fixture/plugin/src-client-index.ts#L67-L70)). The listener
is registered unconditionally and never re-registered, so it is live on both hosts.

Per chord, in order:

| # | Step | Source | Failure behaviour on alpha.2 |
|---|------|--------|------------------------------|
| 1 | chord filter (`ctrlKey`, `ArrowUp/Down`, `isComposing`, `isComposerTarget`) | [:50-54](../fixture/plugin/src-client-index.ts#L50-L54) | passes — the chord *is* seen |
| 2 | **`const id = sessions.list.getSnapshot().current`** | **[:34](../fixture/plugin/src-client-index.ts#L34)** | **`current` no longer exists → `undefined`** |
| 3 | `if (id === undefined) return null` | [:35](../fixture/plugin/src-client-index.ts#L35) | taken → bail |
| 4 | session-switch reset (`browse = IDLE`) | [:36-40](../fixture/plugin/src-client-index.ts#L36-L40) | never reached |
| 5 | `sessions.scope(id)` | [:41-42](../fixture/plugin/src-client-index.ts#L41-L42) | never reached |
| 6 | `actx.get('conversation')` | [:43-44](../fixture/plugin/src-client-index.ts#L43-L44) | never reached |
| 7 | `ctx.uiConversation.binding(id).snapshot…views.get('chat')` | [:45-46](../fixture/plugin/src-client-index.ts#L45-L46) | never reached |
| 8 | `up()/down()` state machine, `setDraft()` | [:57-64](../fixture/plugin/src-client-index.ts#L57-L64) | never reached |
| 9 | `e.preventDefault(); e.stopPropagation()` | [:61-62](../fixture/plugin/src-client-index.ts#L61-L62) | never reached |

### 1.2 The exact read that now fails

```ts
// plugin/src-client-index.ts:33-35
const resolve = (): ResolvedSession | null => {
  const id = sessions.list.getSnapshot().current   // ← THE broken read
  if (id === undefined) return null
```

`ISessions.list` is typed `ObservableSnapshot<SessionListState>` at alpha.1 and
`ObservableSnapshot<SessionListSnapshot>` at alpha.2
([session-list-alpha1.d.ts:13-14](../fixture/host-types/session-list-alpha1.d.ts#L13-L14) vs
[session-list-alpha2.d.ts:17](../fixture/host-types/session-list-alpha2.d.ts#L17)).
`SessionListState` carried `current`; `SessionListSnapshot` does not. Reading a property
that is not on the object yields `undefined` — not an exception — so step 3 fires on
**every** keystroke, forever, with no session ever being "not current".

### 1.3 Why nothing surfaces anywhere

**(a) Why the compat guard passes.** `applyWithCompat` is handed four *member-presence*
probes — `sessions.list`, `sessions.scope`, `sessions.sessionOf`, `uiConversation.binding`
([src-client-index.ts:84-87](../fixture/plugin/src-client-index.ts#L84-L87)). All four are
still members of their services at alpha.2: the alpha.2 excerpt explicitly notes that
"`scope(id)` still exists on `ISessions` at alpha.2"
([session-list-alpha2.d.ts:24-26](../fixture/host-types/session-list-alpha2.d.ts#L24-L26)),
`list` is still there (its *type parameter* changed, not its existence), and
`uiConversation.binding` is untouched. The refactor was **non-additive in the data and
additive-neutral in the service surface** — exactly the shape a member check cannot see.
Two further reasons the guard is useless here:

- It checks the *service objects*, never the *payload* the hot path dereferences
  (`snapshot.current`, `snapshot.views`, `scope()`'s return value).
- The three members it does check beyond `list` (`scope`, `sessionOf`, `binding`) are
  never reached at all — the bail happens one line before the first of them. A guard that
  passes and a code path that dies before touching any guarded member are perfectly
  compatible.

**(b) Why there is no console error.** Nothing on the path throws or warns. A missing
property read is `undefined`, not a `TypeError`; `resolve()`'s contract is
`ResolvedSession | null`; the caller treats `null` as "nothing to do" and returns
([:55-56](../fixture/plugin/src-client-index.ts#L55-L56)). There is no `console.error`, no
`console.warn`, no `throw`, no rejected promise — the only observable is "no text appears".
The boot log corroborates that activation itself succeeded: the client entry is assembled
in the combo and "host up" ([upgrade-notes.txt:10-19](../fixture/upgrade-notes.txt#L10-L19)),
so the plugin is loaded, its guard passed, and its effect is registered.

**(c) Why it is a silent no-op rather than a thrown exception.** The plugin's error
strategy is *graceful degradation by design*: `applyWithCompat` renders a banner instead of
letting activation throw, and the hot path collapses every failure mode into one
indistinguishable `null`. "No current session", "session scope not active", "no
conversation service", "no chat view" and "the field I read was deleted from the host" all
return the same value, and the caller handles all of them identically — by doing nothing.
Silence is not an accident of this bug; it is the shape of the code.

### 1.4 What this settles from the already-tried list, and what it does not

**Settled:**

- **Item 6 / "the chord is not taken by anything else"** — and the maintainer's open
  question "the capture listener is either not firing or firing and bailing out".
  It is **firing and bailing out**. The listener is registered unconditionally at
  activation (which the boot log proves happened), and the bail is at
  [:35](../fixture/plugin/src-client-index.ts#L35) — *before* `preventDefault()`. That is
  precisely why "the chord is not swallowed either" and why "the composer's own multi-line
  cursor movement still works": the event is neither cancelled nor stopped, so the
  composer's own handler runs normally. A non-firing listener could not produce that
  signature in combination with a passed guard.
- **Item 1 / "F12 console clean"** — explained: there is no throw, no warn, no reject on
  this path at all.
- **Item 2 / "compat banner not showing"** — explained: presence-only probes on four
  members that all survived the refactor.
- **Item 4 / "disabled every other plugin"** — consistent with the finding: the failing
  read is *host data shape*, not interference from a sibling plugin.

**Not addressed by this reading:**

- **Item 5 / "update chip says latest version"** — a *distribution* question. The type
  evidence tells us what the host changed; it says nothing about whether the registry's
  "latest" build contains the alpha.2 read. A published "latest" build can still ship the
  alpha.1 read (and does, per this analysis). Only inspecting the published artifact /
  registry metadata settles this.
- **Item 3 / "re-pasted the junction and hard-refreshed"** — a *build-freshness* question.
  It proves the running bundle is the current source, not that the bundle was **compiled
  against alpha.2 types**. It wasn't — and that is exactly why the code type-checked while
  failing at runtime: the plugin's only type dependency
  (`import type { ISessions } from '@deepseek-ai/dsh-api-session-controller/client'`,
  [:7](../fixture/plugin/src-client-index.ts#L7)) is erased at compile time, so a build made
  against alpha.1 types is a valid alpha.2 bundle as far as the loader is concerned.
  Re-linking a junction cannot fix a source-level API change.
- **Item 4, partially** — disabling other *plugins* does not rule out the host's own stock
  client packages (`ui-chat`, `ui-conversation`, `ui-session`) owning or moving the
  session scope, which is in fact what happened.

**The colleague's hypothesis** ("add `uiSession` to the inject list") is *necessary but not
sufficient*: adding `uiSession` to `inject` while leaving `resolve()` reading
`sessions.list…current` changes nothing, because the broken read is line 34, not the inject
list. Worse, adding it naively on a host that lacks the service (alpha.1) risks an
unresolved-dependency activation failure — see §3.2.

---

## 2. Evidence mapping

### 2.1 What changed about the snapshot the plugin reads

| | alpha.1 `SessionListState` ([.d.ts:5-10](../fixture/host-types/session-list-alpha1.d.ts#L5-L10)) | alpha.2 `SessionListSnapshot` ([.d.ts:5-13](../fixture/host-types/session-list-alpha2.d.ts#L5-L13)) |
|---|---|---|
| `byId` | `Readonly<Record<SessionId, SessionSummary>>` | **removed** |
| `current` | `SessionId \| undefined` — "the session the main conversation view is currently bound to" | **removed** |
| `items` | — | `readonly SessionListEntry[]` |
| `state` / `phase` / `error` | — | `'idle' \| 'loading' \| 'error'` / `SessionListPhase` / `RemoteFailure \| null` |
| `subagentsByParent` / `jobsBySession` | — | new per-session catalogs |

The host comment on `ISessions.list` at alpha.2 is the design statement:
"**Host catalog and local reference-source counts; navigation belongs to view owners**"
([session-list-alpha2.d.ts:16](../fixture/host-types/session-list-alpha2.d.ts#L16)). The
session list stopped being the owner of "which session am I on"; it is now a pure catalog
plus reference counts. The multi-instance refactor (release note: "客户端 Session 会话支持
多实例共存，相关 API 及 slot 有变化",
[upgrade-notes.txt:5](../fixture/upgrade-notes.txt#L5)) makes this necessary — with several
live sessions there is no single global "current".

**Implication for the value the plugin now receives on every keystroke:**
`sessions.list.getSnapshot()` still returns an object, so the call succeeds and no error is
raised — but that object has no `current` (and no `byId`). `id` is therefore `undefined`
*always*, not "sometimes". Consequences:

- `resolve()` returns `null` at [:35](../fixture/plugin/src-client-index.ts#L35) on every
  chord — 100 % of keystrokes, in every session, regardless of how many sessions exist.
- `lastSessionId` is never assigned and `browse` is never reset, so the history state
  machine is permanently frozen at `IDLE`.
- Steps 4-9 above are dead code on alpha.2.
- Note the trap: `current === undefined` is *also* the legitimate "no session selected"
  value at alpha.1, so the plugin's own null-check cannot distinguish "no session" from
  "field deleted". That is why the bug is invisible from inside the plugin.

### 2.2 The canonical replacement read (alpha.2)

From [ui-session-service-alpha2.d.ts](../fixture/host-types/ui-session-service-alpha2.d.ts):

- **Service**: `UiSession`, shipped in the `@deepseek-ai/dsh-client-ui-session` client
  bundle, **inject name `uiSession`** ([:1-5](../fixture/host-types/ui-session-service-alpha2.d.ts#L1-L5)).
  It is the "root service owning per-Session bindings and the main-view selection".
- **Observable**: `uiSession.adapter.current` — `ObservableSnapshot<SessionBindingValue>`,
  documented as "binding source of the main view's current session"
  ([:9-13](../fixture/host-types/ui-session-service-alpha2.d.ts#L9-L13)). This is the
  successor to `SessionListState.current`. (For a *specific* session rather than the main
  view, the same service exposes `sourceFor(owner: SessionBinding | SessionId)` and
  `adapter.bindingSource(target)`, [:19](../fixture/host-types/ui-session-service-alpha2.d.ts#L19),
  [:12](../fixture/host-types/ui-session-service-alpha2.d.ts#L12).)
- **Shape of the yielded value** — `SessionBindingValue`
  ([:29-38](../fixture/host-types/ui-session-service-alpha2.d.ts#L29-L38)):
  - `key: SessionId` — the bound session's id → **replaces `sessions.list…current` as the
    session-id source**;
  - **`ctx: Context`** — "the session-scoped context: services registered under this
    session resolve here" → **this is the field that replaces `sessions.scope(id)`** for
    session-scoped service resolution;
  - `hooks`, `keyedHooks`, `props` — standard-source data contributed by `provide()`
    descriptors (the slot-contribution surface that also changed).
- **Absent-binding semantics** ([:40-41](../fixture/host-types/ui-session-service-alpha2.d.ts#L40-L41)):
  "`SessionBindingValue.key` of the absent binding is `undefined`; the service publishes the
  absent value while no main session is retained." So the alpha.2 equivalent of
  `current === undefined` is `uiSession.adapter.current.getSnapshot().key === undefined` —
  an explicit, *distinguishable* absent state, unlike the alpha.1 overload of `undefined`.

**How the session-scoped context reaches the conversation service.** In alpha.1 the plugin
called `sessions.scope(id)` to obtain the session-scoped `Context` and then
`actx.get('conversation')` + `conversation.input.for(actx)`
([:41-47](../fixture/plugin/src-client-index.ts#L41-L47)). In alpha.2 that `Context` is
handed to the plugin as `SessionBindingValue.ctx` — the plugin no longer *asks* for a scope,
it *receives* one with the binding. The chain becomes
`uiSession.adapter.current.getSnapshot().ctx.get('conversation').input.for(that same ctx)`.

---

## 3. Migration recipe

### 3.1 The corrected dual-host resolution function

One build, both hosts: alpha.2 through `uiSession`, alpha.1 through the legacy field. The
discriminator is the presence of the `uiSession` service (with the snapshot shape as a
secondary check, since `current === undefined` alone is ambiguous — see §2.1).

```ts
import type { Context as ClientContext } from '@deepseek-ai/cordis'
import type { ISessions } from '@deepseek-ai/dsh-api-session-controller/client'
import type { UiSession, SessionBindingValue } from '@deepseek-ai/dsh-client-ui-session/client'
import type {
  ConversationNode, IConversation, SessionInput,
} from '@deepseek-ai/dsh-client-ui-conversation/client'

/** The per-press session resolution: current session, its scope, input facade and chat nodes. */
interface ResolvedSession {
  readonly sessionId: string
  /** Session-scoped context. Replaces sessions.scope(id) on alpha.2. */
  readonly actx: Context
  readonly input: SessionInput
  readonly nodes: readonly ConversationNode[]
}

const EMPTY_NODES: readonly ConversationNode[] = []

/**
 * Resolve "the session the main view is bound to" + its session-scoped context,
 * on BOTH hosts from one build:
 *   alpha.2  -> uiSession.adapter.current  (canonical; selection moved to the view owner)
 *   alpha.1  -> sessions.list…current + sessions.scope(id)  (legacy)
 *
 * Discriminator: the uiSession service only exists at alpha.2. `current === undefined`
 * alone is NOT a valid discriminator — it also means "no session selected" on alpha.1.
 */
function resolveCurrentScope(ctx: ClientContext): { id: string; actx: Context } | null {
  const ui = (ctx as { uiSession?: UiSession }).uiSession

  if (ui !== undefined) {
    // ---- alpha.2 path -------------------------------------------------------
    const binding: SessionBindingValue | undefined = ui.adapter.current.getSnapshot()
    if (binding === undefined) return null
    const id = binding.key                    // undefined == no main session retained
    if (id === undefined) return null
    return { id, actx: binding.ctx }          // ctx IS the session scope
  }

  // ---- alpha.1 path (legacy field + legacy scope call) ----------------------
  const snapshot = (ctx.sessions as ISessions).list.getSnapshot() as
    | { current?: string; byId?: unknown }
    | undefined
  if (snapshot === undefined) return null
  if (snapshot.current === undefined && snapshot.byId === undefined) {
    // Neither the legacy field nor the legacy catalog: unknown host shape.
    // Report it (see §4) instead of silently returning null.
    console.error('[dsh-input-history] unrecognised sessions.list snapshot shape',
      Object.keys(snapshot))
    return null
  }
  const id = snapshot.current
  if (id === undefined) return null                 // genuinely no session selected
  const actx = ctx.sessions.scope(id)
  if (actx === undefined) return null
  return { id, actx }
}

function applyBody(ctx: ClientContext): void {
  let browse: HistoryBrowse = IDLE
  let lastSessionId: string | undefined

  const resolve = (): ResolvedSession | null => {
    const scope = resolveCurrentScope(ctx)
    if (scope === null) return null
    const { id, actx } = scope
    if (id !== lastSessionId) {
      // Session switch: recall must start fresh on the new session.
      browse = IDLE
      lastSessionId = id
    }
    const conversation = actx.get('conversation') as IConversation | undefined
    if (conversation === undefined) return null
    const chat = ctx.uiConversation.binding(id).snapshot.getSnapshot().views.get('chat')
    const nodes = chat === undefined ? EMPTY_NODES : chat.legacy.nodes
    return { sessionId: id, actx, input: conversation.input.for(actx), nodes }
  }

  // onKeyDown / ctx.effect(...) unchanged from the original entry.
}
```

What changed relative to the shipped source:

1. `id` now comes from `uiSession.adapter.current.getSnapshot().key` on alpha.2 (and from
   the legacy `current` on alpha.1), instead of from the deleted `current` field.
2. `actx` comes from `SessionBindingValue.ctx` instead of `sessions.scope(id)`.
3. The session id is carried in `ResolvedSession` so `uiConversation.binding(id)` and the
   switch-detection still work unchanged.
4. An unrecognised snapshot shape is reported rather than silently swallowed (see §4).

### 3.2 What must change in `inject`

Shipped: `export const inject = ['sessions', 'uiConversation', 'conversation']`
([src-client-index.ts:17](../fixture/plugin/src-client-index.ts#L17)).

The alpha.2 read is only reachable if the plugin can name the `uiSession` service, so
**`uiSession` must enter the dependency declaration**. Two ways to do it, and the choice is
what makes "one build" work:

- **Preferred for a single dual-host build**: keep the static `inject` list host-neutral and
  read the optional service through a typed accessor with a runtime presence probe, exactly
  as in `resolveCurrentScope` above (`(ctx as { uiSession?: UiSession }).uiSession`). This
  keeps the bundle activatable on alpha.1, where no `uiSession` service exists and a hard
  `inject` entry would be an unsatisfiable dependency. This is viable on alpha.2 because of
  the alpha.2 change "插件依赖解析模式调整为运行时解析"
  ([upgrade-notes.txt:3](../fixture/upgrade-notes.txt#L3)) — dependency resolution is
  runtime-resolved, so a declared-but-absent dependency is tolerated rather than fatal.
- **If the host requires a static declaration** (or you split builds): declare
  `inject = ['sessions', 'uiConversation', 'conversation', 'uiSession']` for the alpha.2+
  build and keep the legacy list for the alpha.1 build. Do **not** add `uiSession` to the
  shared static list without first confirming alpha.1 tolerates an unsatisfiable inject —
  that would convert today's silent no-op into a loud activation failure on alpha.1, which
  is the opposite of the goal.

Either way, the `inject` change alone fixes nothing: the read at line 34 must change too.
Also note that the declared `'conversation'` in `inject` is *not* what feeds the hot path —
the hot path resolves it from the session scope (`actx.get('conversation')`), which is why
the guard's silence about `conversation` went unnoticed.

### 3.3 How the session-scoped context reaches the conversation service

- **alpha.1 (legacy)**: `sessions.scope(id)` → `Context` → `actx.get('conversation')` →
  `conversation.input.for(actx)`.
- **alpha.2 (canonical)**: `uiSession.adapter.current.getSnapshot()` → `SessionBindingValue`
  → `.ctx` is that same session-scoped `Context` ("services registered under this session
  resolve here", [:32-33](../fixture/host-types/ui-session-service-alpha2.d.ts#L32-L33)) →
  `.ctx.get('conversation')` → `.input.for(.ctx)`.

The plugin stops *constructing* a scope and starts *consuming* the one the binding carries.
Nothing else in the chain changes shape: `IConversation.input.for(ctx)` still takes the
session-scoped context, so only the *provenance* of `actx` changes.

### 3.4 Open risk this evidence pack cannot close

The pack contains **no alpha.2 excerpt for `@deepseek-ai/dsh-client-ui-conversation`**, so
the third read in `resolve()` —
`ctx.uiConversation.binding(id).snapshot.getSnapshot().views.get('chat')`
([:45-46](../fixture/plugin/src-client-index.ts#L45-L46)) — is **unverified against alpha.2**.
The release note says session APIs *and slots* changed
([upgrade-notes.txt:5](../fixture/upgrade-notes.txt#L5)) and `SessionBindingValue` now
carries `hooks` / `keyedHooks` / `props`
([:34-37](../fixture/host-types/ui-session-service-alpha2.d.ts#L34-L37)), so on alpha.2 the
chat nodes may need to come from the binding's contributed hooks rather than
`uiConversation.binding(id)…views`. Treat the §3.1 function as the fix for the *attributed*
failure; re-verify the `uiConversation` leg against the alpha.2 conversation bundle before
declaring the plugin fully ported.

---

## 4. Guard hardening

### 4.1 The class of breakage presence-checks cannot catch

The shipped guard answers one question: *"does the service object still have these
members?"* It is blind to every change **beneath** the member boundary:

1. **Payload-shape removal** — a member that survives while the *value it returns* loses a
   field. `sessions.list` survived; `SessionListState.current` did not. This is the present
   bug.
2. **Contract drift on surviving names** — `list` kept its name and changed its type
   parameter and its meaning (catalog vs. catalog-plus-selection).
3. **Return-value contract changes** — `scope(id)` still exists but may return `undefined`
   for a session that is live, or resolve against a different scope identity.
4. **Lifecycle/timing changes** — the guard runs once at activation, before any session is
   bound, so it cannot see anything that only exists once a binding is published.
5. **Over-declared probes** — the guard checks `sessions.sessionOf`, which the plugin never
   calls, and never checks anything the hot path actually dereferences (`snapshot.current`,
   `snapshot.views`, `scope()`'s result). A guard that probes the wrong surface passes
   forever.

In short: **presence checks detect additive API removal at the service boundary; they cannot
detect field-level removal, semantic drift, or contract changes inside published values.**
A plugin can be 100 % "compatible" by that test and 100 % dead.

### 4.2 The hardened guard

Probe the **data the hot path dereferences**, not the services it hangs off, and probe it
where that data exists.

```ts
/** Structural probe: does the host still publish the exact fields resolve() reads? */
function probeApiShape(ctx: ClientContext): string[] {
  const problems: string[] = []
  const ui = (ctx as { uiSession?: UiSession }).uiSession

  if (ui !== undefined) {
    const b = ui.adapter.current.getSnapshot()
    if (b === undefined || typeof b !== 'object') {
      problems.push('uiSession.adapter.current did not publish a binding value')
    } else {
      if (!('key' in b)) problems.push('SessionBindingValue.key missing (replaced sessions.list…current)')
      if (b.ctx === undefined || typeof (b.ctx as Context).get !== 'function') {
        problems.push('SessionBindingValue.ctx missing (replaced sessions.scope(id))')
      }
    }
  } else {
    const s = ctx.sessions.list.getSnapshot() as { current?: unknown; byId?: unknown }
    if (s === undefined || (s.current === undefined && s.byId === undefined)) {
      problems.push('sessions.list snapshot has neither current nor byId — unknown host shape')
    }
  }
  return problems
}

/** Live probe: one real, read-only round trip through the hot path. */
function probeLive(ctx: ClientContext): string | null {
  const resolved = resolve()                       // the very function the chord uses
  if (resolved !== null) return null               // healthy
  const ui = (ctx as { uiSession?: UiSession }).uiSession
  const hasSession = ui !== undefined
    ? ui.adapter.current.getSnapshot()?.key !== undefined
    : ctx.sessions.list.getSnapshot().current !== undefined
  return hasSession ? 'a session is bound but resolution returned null' : null
}
```

**What it probes instead of service presence:**
the concrete field paths — `snapshot.key`, `snapshot.ctx` (with `typeof ctx.get ===
'function'`), or on the legacy host `snapshot.current` / `snapshot.byId` — plus one live,
read-only round trip through the real `resolve()`.

**Where in the lifecycle it must run:**

1. **At activation, immediately after the services are live** (the current guard's slot):
   run `probeApiShape`. This is a pure shape check and needs no session, so it catches a
   removed field at cold start — the multi-instance refactor would have failed the banner
   here on the very first launch after the upgrade.
2. **On every emission of the current-binding observable, and on first real use**: run
   `probeLive`. At cold activation no main session may be retained yet — the host publishes
   the *absent* binding value while nothing is retained
   ([ui-session-service-alpha2.d.ts:40-41](../fixture/host-types/ui-session-service-alpha2.d.ts#L40-L41))
   — so a live probe at load time can only produce a false negative. Subscribe to
   `uiSession.adapter.current` (or `sessions.list` on alpha.1) inside `ctx.effect` and
   re-probe on change; also probe lazily on the first chord.
3. **Distinguish "no session" from "broken"**: `probeLive` only reports a problem when a
   session *is* visibly bound but resolution still returns `null`. Without that distinction
   the hardened guard would cry wolf on every cold start.
4. **Fail loudly in the hot path**: `resolve()` must not swallow an unrecognised shape —
   `console.error` once (with the snapshot's keys) and surface the remediation banner,
   instead of returning the same `null` as "no session selected".

**Complementary (compile-time) hardening**: pin the API packages the plugin type-imports
(`@deepseek-ai/dsh-api-session-controller`, `@deepseek-ai/dsh-client-ui-session`) as
peer/dependency ranges and build against the *host's* types. Against alpha.2 types,
`sessions.list.getSnapshot().current` is a **compile error** — the bug is catchable before
it ever ships, which the current setup (erased `import type`, built against alpha.1 types)
is structurally unable to do.

---

## 5. Verification and prevention

### 5.1 Verifying the fix on both hosts without a full migration

The dual-host resolver is a **pure function of two context shapes**, so most of the
verification needs no host at all:

1. **Fixture-driven unit tests of `resolveCurrentScope`** (no host, no migration). Two fake
   contexts:
   - *alpha.1 fake*: `sessions.list.getSnapshot() → { byId: {…}, current: 's1' }`,
     `sessions.scope('s1') → fakeActx` with `get('conversation') → fakeConversation`.
   - *alpha.2 fake*: `uiSession.adapter.current.getSnapshot()
     → { key: 's1', ctx: fakeActx, hooks: {}, keyedHooks: {}, props: {} }`, and
     `sessions.list.getSnapshot() → { items: [], state: 'idle', phase: …, error: null,
     subagentsByParent: {}, jobsBySession: {} }` (no `current`, no `byId`).
   Assert both fakes yield the **same** `{ id: 's1', actx: fakeActx }`, and that the rest of
   `resolve()` then produces identical `nodes`/`input`. Add a negative fake with an
   unrecognised snapshot shape and assert it is *reported*, not silently null.
2. **Branch instrumentation** — one `console.debug('[dsh-input-history] scope source:
   uiSession|legacy')` per session. This is what lets you prove each host took the intended
   branch rather than both falling through to the legacy code (which would pass a
   "does it work" test on alpha.1 and silently regress on alpha.2).
3. **Smoke test on alpha.2** (the broken host): open a session, send two messages, press
   Ctrl+Up → expect the last sent message in the composer; Ctrl+Up again → the one before;
   Ctrl+Down → walk back; switch session and press Ctrl+Up → expect a *fresh* (IDLE) browse
   on the new session, proving the `lastSessionId` reset still fires.
4. **Smoke test on alpha.1** (a second profile/junction pinned to alpha.1): repeat the same
   steps, confirm the `legacy` branch was logged, the chord is swallowed, and no remediation
   banner appears.
5. **Negative control**: on alpha.2 with the *unfixed* build, the hardened guard must now
   report the shape problem (banner + console error). If the control passes silently, the
   test cannot detect the break and proves nothing.
6. **Guard regression**: feed the guard a fake context whose snapshot lacks `key`/`ctx` and
   assert the banner renders — i.e. the guard fails closed on the *fields*, not just on
   missing services.

### 5.2 The single host-side change that would have made this loud

**Make the published data contract versioned and enforce it, instead of silently
re-shaping the payload.** Concretely, in `@deepseek-ai/dsh-api-session-controller`: have
`sessions.list` publish a contract/schema version alongside the snapshot (e.g.
`{ schema: 2, … }` on `SessionListSnapshot`), and have the host's plugin-compatibility check
validate the **contract version a plugin declares** (or, equivalently, the field paths it
reads) rather than the presence of service members. A plugin declaring a dependency on the
`sessions@1` contract — `current`/`byId` present — would then fail dependency resolution
**at activation** on alpha.2, with the same remediation banner path it already has, instead
of loading cleanly and dying on the first keystroke.

The minimal variant of the same idea, entirely inside the service: keep `current` on the
alpha.2 snapshot as a **deprecated accessor that emits a one-time `console.warn`**
("`SessionListSnapshot.current` was removed in alpha.2; use
`uiSession.adapter.current.getSnapshot().key`"). That single change would have turned the
maintainer's item 1 — "F12 console across several minutes: zero errors, zero warnings" —
into an immediate pointer at the exact broken read, on the very first chord.

Why a *types-only* change is not sufficient: the plugin's dependency on
`ISessions` is an `import type` ([src-client-index.ts:7](../fixture/plugin/src-client-index.ts#L7)),
erased at compile time, and the shipped bundle was built against alpha.1 types. Removing
the field from the `.d.ts` (which the host did) only breaks builds that are recompiled
against the new types; it produces no runtime signal for an already-built bundle. The
removal has to be enforced **at the service boundary at load time** to be loud.

---

## Summary

| Question | Answer |
|---|---|
| Exact failing read | `sessions.list.getSnapshot().current` — [src-client-index.ts:34](../fixture/plugin/src-client-index.ts#L34) |
| Root cause | alpha.2's multi-instance Session refactor removed `current` (and `byId`) from the snapshot published by `sessions.list`; selection moved to the view owner |
| Why the guard passes | it probes four service *members*, all still present; the bail happens before any of them is exercised |
| Why no console error | reading an absent property yields `undefined`; every failure mode collapses to `null` and the caller returns silently |
| Why silent no-op, not a throw | graceful-degradation design: `resolve()` returns `ResolvedSession \| null`, caller returns before `preventDefault()` |
| Canonical replacement | `uiSession` (inject name) → `adapter.current` (`ObservableSnapshot<SessionBindingValue>`) → `.key` (session id) and **`.ctx`** (replaces `sessions.scope(id)`) |
| Settles from the tried list | item 1 (clean console), item 2 (guard passed), item 6 (listener fires and bails — chord not swallowed) |
| Does not settle | item 5 (update chip / published artifact), item 3 (junction + hard refresh — bundle freshness, not the API change), item 4 partially (stock host packages) |
| Hardened guard | probe the dereferenced *fields* (`key`, `ctx`, legacy `current`/`byId`) + one live read-only round trip; shape probe at activation, live probe on binding emissions and first use; distinguish "no session" from "broken" |
| Host-side prevention | version the published data contract and validate it at activation (or a deprecated, warning-emitting `current` accessor) |
