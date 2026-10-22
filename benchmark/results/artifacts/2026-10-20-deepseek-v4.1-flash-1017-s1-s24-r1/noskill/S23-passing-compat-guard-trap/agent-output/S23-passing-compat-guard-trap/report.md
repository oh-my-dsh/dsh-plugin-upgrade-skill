# S23 · The Compat Guard That Passed — silent-failure attribution and dual-host migration

**Verdict (one line).** The plugin still resolves every service it injects; what it lost is a
*field inside the payload of an observable it still has*. On alpha.2,
`ctx.sessions.list.getSnapshot().current` is `undefined` forever, because the main-view session
identity moved out of the session-controller's list snapshot into the new `uiSession` service.
`resolve()` treats that `undefined` as "no session yet" and returns before it ever calls
`preventDefault()` — hence literally nothing happens and nothing is logged.

Evidence base (all read-only): `fixture/plugin/src-client-index.ts` (91 lines),
`fixture/host-types/session-list-alpha1.d.ts` (22),
`fixture/host-types/session-list-alpha2.d.ts` (27),
`fixture/host-types/ui-session-service-alpha2.d.ts` (41),
`fixture/upgrade-notes.txt` (35), `fixture/symptom-report.md` (27).

---

## 1. Silent-failure attribution

### 1.1 The per-keystroke resolution path, step by step

Every relevant step is in `plugin/src-client-index.ts`. `apply()` (L78–91) runs `applyBody`
(L27–71) behind `applyWithCompat`, which registers one capture-phase `keydown` listener
(L67–70). The listener is registered successfully on alpha.2 — activation never throws.

| # | Step | Location | alpha.1 | alpha.2 |
|---|------|----------|---------|---------|
| 1 | capture-phase `keydown` fires | L68 | fires | **fires** (listener alive, plugin loaded) |
| 2 | modifier / key / IME filter | L51–53 | pass | pass |
| 3 | composer-target filter | L54 | pass | pass |
| 4 | read current session id: `sessions.list.getSnapshot().current` | **L34** | `'sess-…'` | **`undefined`** ← the failure |
| 5 | `if (id === undefined) return null` | **L35** | not taken | **taken → `resolve()` → `null`** |
| 6 | `sessions.scope(id)` | L41 | resolves ctx | never reached |
| 7 | `actx.get('conversation')` | L43 | resolves | never reached |
| 8 | `uiConversation.binding(id)…views.get('chat')` | L45 | resolves | never reached |
| 9 | `extractHistory` / `up` / `down` | L57–59 | runs | never reached |
| 10 | `e.preventDefault()` + `stopPropagation()` | **L61–62** | runs | **never reached** |
| 11 | `input.setDraft(step.text)` | L64 | runs | never reached |

**The exact read that now fails is L34.** It does not *throw*; it evaluates to `undefined`,
because `current` no longer exists on the snapshot object that `sessions.list` publishes.
alpha.2's `SessionListSnapshot` (`host-types/session-list-alpha2.d.ts` L5–13) carries
`items / state / phase / error / subagentsByParent / jobsBySession` and neither `current` nor
`byId`. `sessions.list` itself is still a valid `ObservableSnapshot`, so `getSnapshot()`
succeeds and hands back a well-formed object of a *different shape*.

### 1.2 Why nothing surfaces — three independent reasons

**(a) Why the compat guard passes.** The guard (L83–88) probes four *member existences*:
`sessions.list`, `sessions.scope`, `sessions.sessionOf`, `uiConversation.binding`. At alpha.2
all four are still present and truthy — `scope(id)` still exists on `ISessions` (the alpha.2
excerpt says so explicitly at L24–26), and `sessions.list` is still an observable. A presence
check asks *"does the name exist on the object?"*; the break is *"does the value inside the
name still have the shape the caller assumes?"*. `sessions.list` passes because the
**container survived while its payload changed**. The guard proves the service is there, not
that the read returns anything usable.

**(b) Why there is no console error.** Nothing in the path can throw. The property access
`….getSnapshot().current` on an object lacking `current` is plain, legal JS returning
`undefined`. The very next line (L35) is a *deliberate, type-correct* early return that
handles exactly that value: on alpha.1 `current` is legitimately `SessionId | undefined`
("no session bound yet"), so `undefined` is an expected, benign state. The plugin therefore
executes its happy-path-for-"empty" branch. There is no `console.warn`, no `throw`, no
rejected promise, so `applyWithCompat` has nothing to catch (its banner path is
throw-driven), and the browser reports nothing: no uncaught exception, no failed network
call, no CSP violation.

**(c) Why it is a silent no-op rather than an exception or a swallowed chord.** The
`return null` at L35 is *upstream* of `e.preventDefault()` (L61) and `e.stopPropagation()`
(L62). Two consequences, both matching the bug report: the hotkey is **not consumed** — the
browser's default caret movement in a multi-line composer still works, exactly as the report
says ("the chord is not swallowed either"); and no state-machine transition, no `setDraft`,
no toast ever runs. The failure is invisible from outside because the only symptom is the
absence of an effect that has no other side effect.

This is a **field-level removal behind a passing service-level guard**, made silent by a
defensive `undefined` check whose semantics changed from "no session yet" (transient, benign)
to "the host's data model no longer has this field" (permanent, fatal) — with nothing in the
code able to tell the two apart, because both are `undefined`.

### 1.3 What this reading settles — and what it does not

**Settled (the maintainer's own open question).** `symptom-report.md` L13–14 leaves an
either/or: *"the capture listener is either not firing or firing and bailing out."* The reading
settles it: **firing and bailing out** at L35. Corroborating detail: if the listener were not
firing at all, some other handler would have had to claim the chord; tried-list item 6 shows
nothing else claims it, and a dead listener plus an unclaimed chord is indistinguishable from
what is observed — the trace through L34–L35 distinguishes them.

The reading also closes the rest of the tried list, each for a stated reason:

- **#1 console clean** — by design: `undefined`, not an exception (§1.2b).
- **#2 banner absent / guard passed** — by design: presence-only probe (§1.2a).
- **#3 re-linked junction, hard refresh** — irrelevant: the new bundle *is* loading; a stale
  bundle would be alpha.1-shaped and would have worked.
- **#4 disabled all other plugins** — irrelevant: the break is inside this plugin's own read;
  no cooperation with any other plugin is involved.
- **#5 update chip "latest version"** — irrelevant and misleading: the plugin did not regress,
  the **host** changed under it. No plugin release fixes this unless the plugin is rewritten
  to the alpha.2 contract.
- **#6 no competing handler** — correct, and now explained: our own handler returns before
  `preventDefault`, so there is nothing to compete with.

**Not addressed by this reading.** The colleague's hypothesis in `upgrade-notes.txt` L31–35 —
*"maybe your plugin needs to re-register its slot or re-declare inject? Have you tried adding
'uiSession' to the inject list?"* — is **not** the diagnosis, and would not have fixed
anything on its own:

- `inject` is **not the failing link**. Had `sessions`, `uiConversation` or `conversation`
  failed to resolve, activation would have failed *before* `applyBody` ran, or `ctx.sessions`
  would be `undefined` and the guard's very first presence check (L84) would have failed →
  the remediation banner *would* have rendered. It did not. All injected services are present
  and wired; the plugin receives everything it declared.
- Slot re-registration is unrelated: this plugin registers no slot; it registers a `window`
  listener via `ctx.effect` (L67–70), which is alive.
- Adding `'uiSession'` is **necessary but not sufficient** for the fix: it only provides the
  new *source*. You must also change what you read (`adapter.current` ⇒
  `SessionBindingValue.ctx`) and keep the alpha.1 path. Declaring `uiSession` without reading
  it changes nothing at all.

Also outside this reading's scope: whether other modules in the plugin (e.g. `history.ts`) or
other installed plugins also read `current`/`byId` and are silently degraded the same way. The
refactor removed both fields, so any consumer of `byId` is degraded too (it now gets
`undefined` for every lookup) — that is a separate audit, not part of this bug.

---

## 2. Evidence mapping

### 2.1 What changed about the snapshot the plugin reads

| Aspect | alpha.1 (`session-list-alpha1.d.ts`) | alpha.2 (`session-list-alpha2.d.ts`) |
|---|---|---|
| Type name | `SessionListState` | `SessionListSnapshot` |
| Payload kind | **flat global view state**: `byId: Record<SessionId, SessionSummary>` + `current: SessionId \| undefined` | **catalog + async status**: `items: readonly SessionListEntry[]`, `state: 'idle'\|'loading'\|'error'`, `phase`, `error`, `subagentsByParent`, `jobsBySession` |
| Main-view selection | **inside this snapshot** (`current`, documented as "the session the main conversation view is currently bound to") | **absent — deliberately relocated**; alpha.2 doc comment on `list`: "navigation belongs to view owners" |
| Container on `ISessions` | `readonly list: ObservableSnapshot<SessionListState>` | `readonly list: ObservableSnapshot<SessionListSnapshot>` — same member name, same generic, **different type argument** |
| Session scoping | `scope(id): Context \| undefined` | `scope(id)` still exists (excerpt L24–26 note), but the canonical handle is now the binding value's `ctx` |

So the change is: **a 2-field state object (`byId`, `current`) became a 6-field catalog
snapshot, and the one field carrying the main-view identity was dropped** by the multi-instance
session refactor ("客户端 Session 会话支持多实例共存，相关 API 及 slot 有变化",
`upgrade-notes.txt` L5). Identity moved from *"the list knows which session is current"* to
*"the view layer owns a binding to a session; the binding value carries the identity and its
scope"*.

### 2.2 What the plugin therefore receives on every keystroke

`ctx.sessions.list.getSnapshot()` still returns a fresh, valid object each time — alpha.2 does
publish and update this observable (jobs, subagent catalogs, loading state). But `…current` on
that object is **`undefined` on every single call, for the lifetime of the process**, for two
independent reasons that both matter:

1. the property does not exist (so it is `undefined` by JS semantics, not by value);
2. even a "derive it yourself" workaround from this snapshot is impossible — `byId` is gone
   too, and `items` is a *catalog* array, not a selection.

Consequently `resolve()` (L33–48) short-circuits at L35 on **every** keypress. `browse` never
advances, `lastSessionId` is never assigned, and `input.for(...)`, `extractHistory(...)`,
`setDraft(...)` are dead code at runtime. The plugin sits in a permanent "no session yet"
state that no user action can exit — session switching cannot fix it, because switching would
be observed through the same dead field.

### 2.3 The canonical replacement read

From `host-types/ui-session-service-alpha2.d.ts`:

- **Service:** `UiSession` — exported by the client bundle
  `@deepseek-ai/dsh-client-ui-session`; **inject name `"uiSession"`** (class extends `Service`,
  "Root service owning per-Session bindings and the main-view selection").
- **Observable:** `adapter.current` — `ObservableSnapshot<SessionBindingValue>`, documented as
  "Binding source of the main view's current session". Related, for non-main bindings:
  `sourceFor(owner: SessionBinding | SessionId): BindingSource` and
  `adapter.bindingSource(target: unknown): BindingSource`.
- **Value shape:** `SessionBindingValue`
  - `key: SessionId` — the bound session's id;
  - **`ctx: Context` — "the session-scoped context: services registered under this session
    resolve here"** ← **this is the field that replaces `sessions.scope(id)` for
    session-scoped service resolution**;
  - `hooks: Record<string, unknown>`, `keyedHooks: Record<string, Record<string, unknown>>`,
    `props: Record<string, unknown>`.
- **Absent-binding contract (critical for the guard):** the trailing note says that
  `SessionBindingValue.key` of the absent binding is `undefined`, and that the service
  publishes the absent value while no main session is retained. So the **value object always
  exists; only the identity inside it may be `undefined`**. That is a *different* absent-signal shape from
  alpha.1, and it is exactly the distinction the hardened guard must test structurally
  (`'key' in value`) rather than by truthiness.

Replacement, one-for-one:

| alpha.1 read | alpha.2 read |
|---|---|
| `sessions.list.getSnapshot().current` | `uiSession.adapter.current.getSnapshot()!.key` |
| `sessions.scope(id)` | `uiSession.adapter.current.getSnapshot()!.ctx` |
| `sessions.list.getSnapshot().byId[id]` | no equivalent in the list; use `uiSession.sourceFor(id)` / the binding value |
| `ctx.uiConversation.binding(id)…views.get('chat')` | shape unchanged — but key it by the **binding value** when the host offers one (see §3.4 caveat) |

---

## 3. Migration recipe — one build, both hosts

Two changes: the **declaration** (`inject` gains an *optional* `uiSession`, so alpha.1 still
activates), and the **read** (a capability-selected session reader that returns the same
internal `{ id, actx }` pair from either contract). Everything downstream of `resolve()` —
`extractHistory`, `up`, `down`, `setDraft`, the `ctx.effect` listener — is untouched.

### 3.1 `inject`: optional, not required

```ts
// BEFORE (alpha.1-only, silently wrong on alpha.2)
// export const inject = ['sessions', 'uiConversation', 'conversation']

// AFTER — 'uiSession' exists only at >= alpha.2, so it must be OPTIONAL:
// a required entry would make the whole plugin fail to activate on alpha.1.
export const inject = {
  required: ['sessions', 'uiConversation'],
  optional: ['uiSession', 'conversation'],
}
```

`uiSession` **must be optional** — that is the whole point of "one build". `conversation` is
normally obtained from the session-scoped context (`actx.get('conversation')`) rather than
from the root, so it is listed optional only for the root fallback in §3.3.

### 3.2 Contract probes — shared by the resolver and by the hardened guard

```ts
import type { Context as ClientContext } from '@deepseek-ai/cordis'
import type { ISessions } from '@deepseek-ai/dsh-api-session-controller/client'
import type {
  ConversationNode, IConversation, SessionInput,
} from '@deepseek-ai/dsh-client-ui-conversation/client'
import type {} from '@deepseek-ai/dsh-client-ui-session/client' // UiSession / SessionBindingValue

/** Internal, host-agnostic result of one session resolution. */
export interface SessionRef {
  /** Bound session id. */
  readonly id: string
  /** Session-scoped context: services registered for this session resolve here. */
  readonly actx: ClientContext
  /** Opaque token handed to uiConversation.binding(); the binding value on alpha.2. */
  readonly token: unknown
}

/** Minimal structural view of the alpha.2 service, so alpha.1 builds without the package. */
interface UiSessionLike {
  readonly adapter?: { readonly current?: { getSnapshot?: () => unknown } }
  readonly sourceFor?: (owner: unknown) => unknown
  readonly bindingSource?: (target: unknown) => unknown
}

/** alpha.2 contract: the binding VALUE exists and carries key + ctx (either may be absent-valued). */
export function hasBindingContract(ctx: ClientContext): boolean {
  const ui = (ctx as { uiSession?: UiSessionLike }).uiSession
  const current = ui?.adapter?.current
  if (current === undefined || typeof current.getSnapshot !== 'function') return false
  const value = current.getSnapshot() as Record<string, unknown> | undefined
  // Structural test, NOT truthiness: the absent binding still publishes { key: undefined, ... }
  return value !== undefined && value !== null && 'key' in value && 'ctx' in value
}

/** alpha.1 contract: the list state itself carries 'current'. */
export function hasLegacyListContract(ctx: ClientContext): boolean {
  const sessions = ctx.sessions as ISessions | undefined
  const state = sessions?.list?.getSnapshot?.() as Record<string, unknown> | undefined
  return state !== undefined && state !== null && 'current' in state
}

/**
 * Pick the reader for this host, ONCE, at activation.
 * Throws when neither contract holds -> applyWithCompat renders its banner (loud, not silent).
 */
export function selectSessionReader(
  ctx: ClientContext,
): (ctx: ClientContext) => SessionRef | null {
  if (hasBindingContract(ctx)) return readBinding    // alpha.2 (or later, if the shape holds)
  if (hasLegacyListContract(ctx)) return readLegacy  // alpha.1
  throw new Error(
    'dsh-input-history: host exposes neither the uiSession binding contract (key/ctx) ' +
    'nor the legacy session-list contract (current). Refusing to install a dead key handler.',
  )
}
```

### 3.3 The two readers

```ts
/** alpha.2: identity + session scope both come from the binding value. */
function readBinding(ctx: ClientContext): SessionRef | null {
  const ui = (ctx as { uiSession?: UiSessionLike }).uiSession
  const value = ui?.adapter?.current?.getSnapshot?.() as
    | { key?: unknown; ctx?: unknown }
    | undefined
  if (value === undefined || value === null) return null
  // Distinguish "no main session retained" (legit, transient) from "contract broken".
  if (value.key === undefined || value.ctx === undefined) return null
  return { id: String(value.key), actx: value.ctx as ClientContext, token: value }
}

/** alpha.1: identity from the list snapshot, scope from sessions.scope(id). */
function readLegacy(ctx: ClientContext): SessionRef | null {
  const state = ctx.sessions.list.getSnapshot() as { current?: string } | undefined
  if (state === undefined || state === null) return null
  if (!('current' in state)) return null // shape gone: caller treats as broken, not as empty
  const id = state.current
  if (id === undefined) return null // legitimately no session yet
  const actx = ctx.sessions.scope(id)
  if (actx === undefined) return null
  return { id, actx, token: id }
}
```

### 3.4 The corrected `resolve()` — drop-in for `applyBody`

```ts
function applyBody(ctx: ClientContext): void {
  // Activation-time contract selection: throws => banner instead of a dead hotkey.
  const readSession = selectSessionReader(ctx)

  let browse: HistoryBrowse = IDLE
  let lastSessionId: string | undefined

  const resolve = (): ResolvedSession | null => {
    const ref = readSession(ctx)
    if (ref === null) return null // no main session: legitimately no-op this keystroke

    if (ref.id !== lastSessionId) {
      // Session switch: recall must start fresh on the new session.
      browse = IDLE
      lastSessionId = ref.id
    }

    // Session-scoped service resolution: the SAME call on both hosts, because both
    // SessionRef.actx values are a Cordis Context holding that session's services.
    const conversation =
      (ref.actx.get('conversation') as IConversation | undefined) ??
      (ctx.conversation as IConversation | undefined)
    if (conversation === undefined) return null

    const nodes = readChatNodes(ctx, ref)
    return { input: conversation.input.for(ref.actx), nodes }
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

/**
 * Chat nodes. The binding-based token is preferred on alpha.2 (multi-instance hosts key
 * their bindings by binding, not by raw id); the raw id remains the alpha.1 path.
 * A failed read degrades the history source only — it must NOT disable the chords.
 */
function readChatNodes(ctx: ClientContext, ref: SessionRef): readonly ConversationNode[] {
  try {
    const binding = ctx.uiConversation.binding(ref.token as never)
    const chat = binding?.snapshot.getSnapshot().views.get('chat')
    return chat === undefined ? EMPTY_NODES : chat.legacy.nodes
  } catch {
    return EMPTY_NODES
  }
}
```

Note on `readChatNodes`: the pack pins the *session* contract precisely but does not restate
`uiConversation.binding`'s keying at alpha.2 (its fourth guard entry is shown only as still
present). Passing `ref.token` — the binding value on alpha.2, the raw id on alpha.1 — plus the
`try/catch` is deliberate: the chords stay alive even if the binding lookup was rekeyed, at the
cost of empty recall history until that is confirmed. `SessionRef.token` is the single place to
adjust.

### 3.5 How the session-scoped context reaches the conversation service

- `ISessions.scope(id)` and `SessionBindingValue.ctx` return the **same kind of object**: a
  Cordis `Context` whose registry is the session's scope. That is why both readers can produce
  `SessionRef.actx` and every downstream line stays identical.
- `ref.actx.get('conversation')` resolves the session's `IConversation`; then
  `conversation.input.for(ref.actx)` produces the input facade — **the scope must be passed in,
  not assumed**, so the facade is bound to the same instance whose services were resolved.
  Mixing the *root* `ctx.conversation` with a *session* scope (or vice versa) is the
  multi-instance bug: with several sessions co-resident, the root service belongs to no
  particular session.
- On alpha.2 the binding value is the only structure that ties `key` and `ctx` together
  atomically, which is what makes it safe under multi-instance (the list snapshot no longer has
  a single `current` that could be stale). Read `key` and `ctx` from the **same**
  `getSnapshot()` call — never two, or a switch between them can pair an old id with a new ctx.

---

## 4. Guard hardening

### 4.1 The class of breakage presence checks cannot catch

The shipped guard (L83–88) tests `['sessions.list', …]` — *property exists and is truthy on
the service object*. It catches exactly one family:

- a whole service missing from the client bundle (DI cannot satisfy `inject`), or
- a member removed from the service's **own** surface (method/observable gone ⇒ `undefined`).

It is structurally blind to every failure where **the container survives and the payload
changes** — which is what happened:

1. **Field removal inside a returned value.** `sessions.list` is present; `getSnapshot()`
   returns an object with `items/state/phase/…` and no `current`. Presence of `list` says
   nothing about the shape of `list.getSnapshot()`.
2. **Same name, different shape/semantics** (a silent retype): `SessionListState` →
   `SessionListSnapshot` keeps the member name *and* the generic wrapper
   (`ObservableSnapshot<…>`) while changing the type argument. TypeScript catches this only if
   the consumer is recompiled against the new types — and an installed external plugin never
   is.
3. **Member present but permanently empty/dead** because its backing wiring moved to another
   service (`current` was relocated to `uiSession.adapter.current`; the old name could even be
   kept as a deprecated stub and still read as falsy).
4. **Narrowed return**: method exists, now returns `undefined` for inputs it used to handle
   (e.g. `scope(id)` under multi-instance, or `uiConversation.binding(id)` if rekeyed).
5. **Renamed sub-field of a sub-object**: `byId[id]` → `items.find(...)`; the guard never
   looked inside, so all consumers see `undefined`, never an error.

Generalized: **presence ≠ contract.** A guard that asks "is the API there?" cannot detect "the
API is there and now answers differently". The alpha.2 refactor is a change of *answers* (where
identity lives), not of *names* — which is why the one plugin whose entire job is to read
`current` broke, while five others that only touch services and slots kept working.

### 4.2 What the guard should probe instead

Probe the **contract of the value the hot path will actually read**, at field level, using the
*same predicate functions the resolver uses* — never a second, drifting copy of the assumption:

1. **Drill to the leaf, don't stop at the service.** Follow the hot path's exact chain
   (`ctx.sessions.list.getSnapshot()`, `ctx.uiSession.adapter.current.getSnapshot()`) and
   validate the **leaf object's own properties** (`'current' in state`,
   `'key' in value && 'ctx' in value`). Use `in` / `Object.getOwnPropertyNames`, not
   truthiness: at alpha.2 the absent binding *legitimately* publishes `{ key: undefined }`, so
   `value.key` must be allowed to be `undefined` while the property must still **exist**.
   "Is `key` truthy?" and "does `key` exist?" are different questions; conflating them
   re-creates this bug one level deeper.
2. **Type-check the leaf, not just the container.** Assert the observable's `getSnapshot` is a
   function, that it returns a non-null object, and that the fields the hot path reads are of
   the expected kind (`current` is `string | undefined` *and present*; `ctx` is an object with
   a callable `get`).
3. **Probe both contracts and require at least one to be *satisfied*, not merely present**:
   `hasBindingContract(ctx) || hasLegacyListContract(ctx)`. A host with `uiSession` but a broken
   binding shape *and* no `current` is incompatible — that compound case is the one that must
   banner.
4. **Probe through the real reader once, with the real value**, and require a *shape-valid*
   result when a session is retained: `key` resolving to an id while `ctx` is missing must
   banner ("half the contract landed"), yet every presence check reports `uiSession` present ⇒
   fine.
5. **Record which branch was selected** so the next ticket carries
   `{ host branch: 'binding' | 'legacy', keyed: true }` instead of "it doesn't work".
6. **Keep the disjunction, never a conjunction**: a guard phrased "alpha.2 must not be the host
   unless the binding contract holds" would fail on alpha.1 and brick the other host. Compatibility
   guards must be *a disjunction of complete contracts*.

Sketch (drop-in for the array literal at L83–88):

```ts
applyWithCompat(
  'dsh-external/dsh-input-history',
  '当前 DSH 客户端 API 与插件不匹配',
  ['升级 DSH 到已适配版本。', '或更新插件到适配当前 DSH 的版本。'],
  [
    // NOT "does sessions.list exist?" — "does a COMPLETE session-selection contract hold?"
    ['session-selection contract (uiSession.adapter.current -> {key, ctx})',
      hasBindingContract(ctx) || hasLegacyListContract(ctx)],
    // leaf level: the list observable must still answer with a usable shape
    ['sessions.list.getSnapshot() shape',
      hasLegacyListContract(ctx) || hasBindingContract(ctx)],
    // the members the hot path needs INSIDE the resolved session scope
    ['session scope exposes conversation + input',
      probeScope(() => selectSessionReader(ctx)(ctx))],
    ['uiConversation.binding() yields a chat view source',
      typeof ctx?.uiConversation?.binding === 'function'],
  ],
  () => { applyBody(ctx) },
)

/** Resolve one session and touch the two members the hot path uses. */
function probeScope(read: () => SessionRef | null): boolean {
  try {
    const ref = read()
    if (ref === null) return true // no main session retained: indeterminate, not incompatible
    if (typeof ref.actx?.get !== 'function') return false
    const conversation = ref.actx.get('conversation') as IConversation | undefined
    return conversation !== undefined && typeof conversation.input?.for === 'function'
  } catch { return false }
}
```

### 4.3 When the probe must run

**At plugin activation, once, against the live runtime values — after DI has resolved and
before the listener is installed and before any handler is trusted to be alive.** In this
plugin that is the first statement of `applyBody` (§3.4: `selectSessionReader` is called at the
top), inside the `applyWithCompat` body so a failed probe takes the banner path.

Why that exact point, and not the alternatives:

- **Not at build/type level.** Types are erased; an installed external plugin is never
  recompiled against the new host's `.d.ts`. This bug shipped *because* the type evidence
  existed (no `current` in alpha.2's excerpt) and no runtime read cared.
- **Not at import time.** `inject` is not satisfied yet; `ctx.sessions` / `ctx.uiSession` are
  `undefined` at module evaluation, so a probe there yields a false negative on every host.
- **Not lazily at first keystroke** — which is what ships today. A lazy probe can only
  *swallow* its result (a keydown handler must not throw into a DOM event), so every failure
  becomes a no-op: that is the definition of this bug. Detection must happen where the plugin is
  still allowed to fail loudly / render remediation, i.e. **activation**.
- **Not only on host version strings.** Version gating would catch *this* bump but not a
  patch-level shape change, and it forces a plugin release per host release. Probe the
  contract, not the number — and run it at **every** activation, because the host can be
  replaced underneath an unchanged plugin. That is literally the remediation the banner
  already offers: "upgrade DSH" / "update the plugin".
- Also **re-probe on hot reload / re-apply**: the web profile can swap client bundles without a
  process restart, and activation is the only hook that runs in both cases.

---

## 5. Verification and prevention

### 5.1 Verifying the fix on both hosts without a full migration

The goal is to prove *both branches* with the *same artifact*, keeping the plugin
junction-linked into both profiles and never migrating the alpha.1 host:

1. **Two contract fixtures, one assertion set (fastest, no host needed).** Capture a real
   `getSnapshot()` from each host — alpha.1: `{ byId, current: 'sess-1' }`; alpha.2:
   `{ items: […], state: 'idle', phase, error: null, subagentsByParent: {}, jobsBySession: {} }`
   plus `uiSession.adapter.current` resolving `{ key: 'sess-1', ctx, hooks, keyedHooks, props }`
   and its absent form `{ key: undefined, … }`. Drive `applyBody` with a stub `ctx` per fixture,
   dispatch one synthetic `KeyboardEvent('keydown', { key: 'ArrowUp', ctrlKey: true })` with a
   composer-ish `target`, and assert: (a) `resolve()` is non-null; (b) `preventDefault` was
   called (`event.defaultPrevented === true`); (c) `setDraft` received the last sent message;
   (d) the absent-binding fixture yields `defaultPrevented === false` **without** a banner
   (legit no-op); (e) a "no contract at all" fixture yields a banner. These five assertions are
   the regression test the shipped guard should have been.
2. **Alpha.2 (the broken host) — live check.** Same plugin directory, host restarted, browser
   hard-refreshed: Ctrl+Up fills the composer with the last sent message, Ctrl+Down walks back;
   session switch resets the browse position (proves `lastSessionId` is observed again, i.e.
   identity is live, not one-shot); banner stays absent; the activation log line reports
   `branch=binding, keyed=true` (§4.2.5) — that line is the proof the *new* read path runs.
3. **Alpha.1 (the old host) — compatibility check.** Keep a second profile on alpha.1 with the
   *same* junction: Ctrl+Up/Down must still work, banner absent, log line reports
   `branch=legacy`. This is the check that `optional: ['uiSession']` did not become a hard
   requirement — a required entry there makes the plugin silently not activate, the mirror image
   of the original bug.
4. **Negative control on alpha.2.** Temporarily stub `uiSession.adapter.current` to return
   `{ key: 'x' }` (no `ctx`): the banner must appear at activation and no listener may be
   installed. This proves the guard fails *closed* instead of re-degrading to a no-op.
5. **Cheap introspection instead of a rewrite.** An activation-time `console.debug` /
   `ctx.logger` line with `{ branch, keyed, hasChat }` turns every future report like this one
   into a one-glance diagnosis, for one line and no migration.

No migration, no host downgrade, no separate build: one artifact with a capability-selected
reader, observed on both hosts, one assertion set, plus fixtures in CI.

### 5.2 The single host-side change that would make this loud at activation

**Ship a throwing accessor for the removed field, and declare it as `never` in the type.**

At alpha.2, instead of silently omitting `current` from `SessionListSnapshot`, keep the name as
an explicitly-removed member:

```ts
export interface SessionListSnapshot {
  items: readonly SessionListEntry[]
  state: 'idle' | 'loading' | 'error'
  phase: SessionListPhase
  error: RemoteFailure | null
  subagentsByParent: Readonly<Record<SessionId, SubagentCatalogSnapshot>>
  jobsBySession: Readonly<Record<SessionId, readonly JobView[]>>
  /**
   * @deprecated Removed in 0.1.6-alpha.2. The main-view selection moved to
   * uiSession.adapter.current (SessionBindingValue.key / .ctx).
   * Reading this throws.
   */
  readonly current: never
}
```

and at runtime publish the snapshot object with that property defined as a **getter that
throws** a message naming the replacement: "SessionListState.current was removed in
0.1.6-alpha.2 — read uiSession.adapter.current.getSnapshot().key".

Effect on the three layers:

- **Runtime:** the plugin's L34 read no longer yields `undefined`; it throws. With the §4.3
  activation probe in place the first read is at activation, inside `applyWithCompat`'s try, so
  the banner renders at load and the ticket carries the migration pointer. Even without the
  plugin-side probe — i.e. the plugin exactly as shipped — the throw fires inside the
  `keydown` handler and surfaces as an uncaught exception in F12, turning the report's "zero
  errors" into an error with a filename and line number.
- **Types:** `never` is unassignable, so any consumer that *does* recompile against alpha.2
  fails at the exact call site with a readable type error, and the `@deprecated` tag shows in
  editor hover/completion even before that.
- **Cost:** one property on one interface and one getter on one object — a transitional
  affordance deletable in the next minor.

Why this and not something else: a *type-only* change is erased and cannot help an already
installed plugin; a *required*-inject or host-side version check makes the host adjudicate
compatibility centrally, which is a bigger architectural change and does not scale to six
externally-owned plugins. The throwing deprecated accessor is the minimal change that puts the
failure **where a plugin can be loud about it**.

Weaker alternative, if a throwing getter is unacceptable (it can break other consumers mid-render
via its `??`/optional-chaining paths): give the removed field a one-shot
`console.error`/host-logger warning on first access
(`"SessionListState.current removed — use uiSession.adapter.current"`). That still turns today's
silence into a nameable console message, though it produces no exception and so does not by
itself reach an activation banner.

### 5.3 Prevention on the plugin side (beyond this fix)

- **Never let "legitimately empty" and "contract broken" share a return value.** `resolve()`
  should have three outcomes: a `SessionRef`; `null` for *no session* (transient); and a
  throw/report for *shape mismatch*. The original collapsed the last two into `null`, which is
  why the failure had no voice.
- **Keep the capability predicates in one place** and have both the guard and the hot path call
  them, so a future refactor cannot pass a hand-written guard while breaking the read.
- **Pin the alpha.1 path with a fixture** and run it in CI on every change; the alpha.1 branch is
  now the one nobody exercises.

---

## Appendix A · Traceability of every claim

| Claim | Evidence |
|---|---|
| Failing read is L34 | `plugin/src-client-index.ts` L34 (`sessions.list.getSnapshot().current`), L35 (`if (id === undefined) return null`) |
| Guard is presence-only, four members | L83–88 (`sessions.list`, `sessions.scope`, `sessions.sessionOf`, `uiConversation.binding`) |
| Early return precedes preventDefault | L35 vs L61–62 |
| alpha.1 shape: `byId` + `current` | `session-list-alpha1.d.ts` L5–10 |
| alpha.2 shape: `items/state/phase/error/subagentsByParent/jobsBySession`, no `current`/`byId` | `session-list-alpha2.d.ts` L5–13 |
| `scope` still exists at alpha.2, but the binding `ctx` is canonical | `session-list-alpha2.d.ts` L24–26 |
| Replacement service `UiSession`, inject `uiSession`, `adapter.current`, `SessionBindingValue.key/.ctx` | `ui-session-service-alpha2.d.ts` L5–13, L28–38 |
| Absent binding publishes `{ key: undefined }` | `ui-session-service-alpha2.d.ts` L40–41 |
| Refactor cause: multi-instance sessions, API/slot changes | `upgrade-notes.txt` L5 |
| Plugin loads, no duplicate loader ids | `upgrade-notes.txt` L11–19 |
| Chords not claimed by anyone else | `upgrade-notes.txt` L28–29 |
| Colleague's `inject`/slot hypothesis | `upgrade-notes.txt` L31–35 |
| Symptom: no error, no banner, chord not swallowed | `symptom-report.md` L11–14, L16–24 |

## Appendix B · Residual uncertainty (what the pack does not pin down)

1. **`uiConversation.binding` keying at alpha.2.** The pack proves the member still exists (it
   is a guard entry) but not whether it is keyed by raw `SessionId` or by the session binding
   under multi-instance. §3.4 handles both with `SessionRef.token` + `try/catch` so the chords
   stay alive either way; history content may be empty until confirmed against the real bundle.
2. **`applyWithCompat`'s exact catch semantics.** Assumed to (a) catch throws from the body and
   render the banner, (b) treat each `[label, value]` probe by the truthiness of `value`. Both
   are implied by L78–91 + `symptom-report.md` L20–22 (a banner exists and is not showing) and
   are what §4.2/§4.3 build on.
3. **Equivalence of `sessions.scope(id)` and `SessionBindingValue.ctx`.** Both are documented as
   "the session-scoped context"; `ref.actx.get('conversation')` depends on that equivalence.
4. **Whether other consumers read `byId`/`current`.** Out of scope; the refactor removed both,
   so any such consumer is silently degraded and should be audited with the same hardened probe.
