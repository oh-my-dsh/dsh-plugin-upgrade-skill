# S23 · The Compat Guard That Passed — silent field-level removal behind a passing presence guard

Evidence base: the sealed fixture pack only (`symptom-report.md`, `plugin/src-client-index.ts`,
`host-types/session-list-alpha1.d.ts`, `host-types/session-list-alpha2.d.ts`,
`host-types/ui-session-service-alpha2.d.ts`, `upgrade-notes.txt`, `README.md`). The plugin's own
repo is not in the pack, so every claim below is derived from the attached entry source and the
three sealed type excerpts. Nothing outside the cell was read; the fixture is unchanged.

---

## 1. Silent-failure attribution

### Per-keystroke resolution path

Each document-capture `keydown` runs `onKeyDown`:

1. filter: Ctrl without Alt/Meta, `ArrowUp`/`ArrowDown`, not composing, composer target;
2. `resolve()`:
   - `const id = sessions.list.getSnapshot().current`  ← **the read that fails**
   - `if (id === undefined) return null`
   - session-switch reset (`browse = IDLE`, `lastSessionId = id`)
   - `const actx = sessions.scope(id)`
   - `actx.get('conversation')` → `IConversation`
   - `ctx.uiConversation.binding(id).snapshot.getSnapshot().views.get('chat')` → `chat.legacy.nodes`
   - `conversation.input.for(actx)` → `SessionInput`
3. `extractHistory(nodes)` + `input.state.getSnapshot().draft` + `up()`/`down()` + `input.setDraft(step.text)`.

**The exact failing read** is `sessions.list.getSnapshot().current` — the `current` field of the
session-list snapshot object. At alpha.1 `getSnapshot()` yields `SessionListState { byId, current }`;
at alpha.2 it yields `SessionListSnapshot { items, state, phase, error, subagentsByParent, jobsBySession }`,
in which `current` **does not exist at all**.

### Why nothing surfaces anywhere

- **Why the compat guard passes.** `applyWithCompat` checks the *presence of four members on the
  service objects*: `sessions.list`, `sessions.scope`, `sessions.sessionOf`,
  `uiConversation.binding`. All four still exist at alpha.2 — the alpha.2 `ISessions` excerpt still
  declares `list` and explicitly notes that `scope(id)` still exists. The breakage sits one
  dereference deeper: inside the **value** that the still-present `list.getSnapshot()` returns. A
  presence check over an object graph cannot observe a field removed from a value a present method
  hands back. That is also exactly why no compatibility banner renders: the guard's healthy branch
  runs `applyBody` as if nothing changed.
- **Why there is no console error.** Reading a missing property on a plain object is not an error in
  JavaScript: `snapshot.current` evaluates to `undefined` silently — no throw, no warning, no Proxy
  or getter that could complain. The plugin never logs on this path, and alpha.2's runtime dependency
  resolution ("插件依赖解析模式调整为运行时解析") successfully binds the same compiled bundle to the new
  service objects, so there is no load-time diagnostic either. The boot log confirms the entry loaded
  normally (`@dsh-external/dsh-input-history/client.js` in the combo, "no pending entries, no duplicate
  loader ids"), so activation-time signals are also clean.
- **Why a silent no-op rather than a thrown exception.** The plugin contains an intentional graceful
  exit — `if (id === undefined) return null`, i.e. "the user has no session bound". Removing the
  field makes that legitimate-looking path fire on **every** press; the code cannot distinguish
  "API removed" from "no session bound". `onKeyDown` then does `if (resolved === null) return`
  **before** `e.preventDefault()`/`e.stopPropagation()`, which matches the symptom precisely: the
  chord is *not swallowed*, so the composer's own multi-line cursor movement still runs. The removal
  did not create a crash path; it re-pointed the working path into the plugin's own documented
  null-path. (Build-time gap: the bundle was compiled against alpha.1's `SessionListState`, so the
  `.current` access type-checked once and is unchecked at runtime on alpha.2's snapshot.)

### Which earlier suspicion this settles, and which it does not

- **Settles item 6 of the already-tried list** ("chords are not taken by anything else; with the
  junction removed Ctrl+Up/Down still do nothing"): the capture listener *does* fire — the boot log
  proves the entry is loaded and `ctx.effect` installs a document-level capture listener — and the
  failure is a bail-out *before* `preventDefault()`. "Chord not swallowed" is the fingerprint of
  `resolve()` returning `null`, not of a dead or hijacked chord. (Items 1 and 2 follow from the same
  reading: an intentional null-return emits no console output and never reaches the banner path.)
- **Does not address item 5** ("update chip says latest version"): registry currency says nothing
  about host-surface compatibility. The latest published build can be — and evidently is — compiled
  against alpha.1's snapshot shape; the chip cannot detect host API drift.
- **Does not validate the colleague's hypothesis** ("re-register its slot / re-declare inject, try
  adding 'uiSession'"): nothing in this entry registers a slot, and activation demonstrably succeeded
  (the guard ran and the effect installed the listener). Adding `uiSession` to `inject` is part of the
  *migration* (§3), not a repair of registration — it helps only together with changing the
  resolution read itself.

---

## 2. Evidence mapping

### What changed in the snapshot the plugin reads

| | alpha.1 `SessionListState` | alpha.2 `SessionListSnapshot` |
|---|---|---|
| fields | `byId`, **`current: SessionId | undefined`** | `items`, `state`, `phase`, `error`, `subagentsByParent`, `jobsBySession` |
| semantics | one global current: "the session the main conversation view is currently bound to" | multi-instance catalog ("客户端 Session 会话支持多实例共存"); "navigation belongs to view owners"; no global current; load `state`/`phase`/`error` plus per-session extras |

Precisely: `current` was **removed outright** — not renamed in place, not kept as an optional field.
The multi-instance refactor moved the "which session is the main view showing" concept out of the
session controller; `list` became a catalog (`items`, load status) with per-session addenda. The
excerpt also notes that `scope(id)` still exists at alpha.2 — so the second dereference would have
worked; the id lookup dies first.

**Implication for the value received on every keystroke:** `sessions.list.getSnapshot()` still
returns an object, but reading `.current` on it yields `undefined` on every keystroke — not `null`,
not an error. The plugin's own "no session bound" fast path therefore fires on every press.

### The canonical replacement read (from the new-service excerpt)

- **Service:** `UiSession` from `@deepseek-ai/dsh-client-ui-session`'s client bundle, inject name
  **`uiSession`** ("Root service owning per-Session bindings and the main-view selection").
- **Observable it exposes:** `uiSession.adapter.current : ObservableSnapshot<SessionBindingValue>`
  — "Binding source of the main view's current session"; this is where alpha.1's
  `SessionListState.current` concept lives now. Per-id/per-owner bindings go through
  `uiSession.sourceFor(owner | id)` / `adapter.bindingSource(target)`.
- **Shape of the yielded value:** `SessionBindingValue { key: SessionId; ctx: Context; hooks;
  keyedHooks; props }`; the absent binding publishes `key === undefined` (the service "publishes the
  absent value while no main session is retained").
- **The field that replaces `sessions.scope(id)`:** **`SessionBindingValue.ctx`** — "the
  session-scoped context: services registered under this session resolve here". That `ctx` is what
  the plugin must use both to resolve the session's conversation facade and as the argument to
  `conversation.input.for(...)`, exactly as `sessions.scope(id)` supplied on alpha.1.

---

## 3. Migration recipe — one build, both hosts

Design decisions:

1. Branch on **service presence** (`ctx.get('uiSession')` !== undefined → alpha.2), not on value
   shape at runtime: `uiSession` only exists on alpha.2.
2. Declare `uiSession` as an **optional** inject dependency, so the same bundle still activates on
   alpha.1 where the service does not exist (a hard-required inject would block activation there).
   If the host's inject contract cannot express optional entries, keep it out of the declarative
   list and resolve lazily via `ctx.get('uiSession')` (returns `undefined` on alpha.1).
3. Touch the legacy field only through a narrow structural cast, so one source tree compiles clean
   against **both** sealed type sets (never `snap.current` directly on the new type).

```ts
// dual-host session resolution — one bundle, compiled against both host type sets
import type { Context as ClientContext } from '@deepseek-ai/cordis'

export const inject = [
  'sessions',
  'uiConversation',
  'conversation',                  // keeps the package loaded; resolved per-session below
  { name: 'uiSession', optional: true }, // alpha.2 only — must not block alpha.1 activation
]

/** alpha.2 surface, structural (the sealed types live on the host). */
interface UiSessionLike {
  readonly adapter: {
    readonly current: {
      getSnapshot():
        | { readonly key?: SessionId; readonly ctx?: ClientContext }
        | undefined
    }
  }
}
/** alpha.1 surface, structural. */
interface LegacyListSnapshot {
  readonly current?: SessionId
}

function resolve(): ResolvedSession | null {
  let id: SessionId | undefined
  let actx: ClientContext | undefined

  const uiSession = ctx.get('uiSession') as UiSessionLike | undefined

  if (uiSession !== undefined) {
    // ---- alpha.2 canonical path ----
    const binding = uiSession.adapter.current.getSnapshot()
    id = binding?.key            // undefined == no main session retained (absent binding)
    actx = binding?.ctx          // <- replaces sessions.scope(id)
  } else {
    // ---- alpha.1 legacy path ----
    const snap = sessions.list.getSnapshot() as LegacyListSnapshot
    id = snap?.current           // legacy field; absent at alpha.2
    actx = id === undefined ? undefined : sessions.scope(id)
  }

  if (id === undefined || actx === undefined) return null

  if (id !== lastSessionId) {
    // Session switch: recall must start fresh on the new session.
    browse = IDLE
    lastSessionId = id
  }

  const conversation = actx.get('conversation') as IConversation | undefined
  if (conversation === undefined) return null

  const chat = ctx.uiConversation.binding(id).snapshot.getSnapshot().views.get('chat')
  const nodes = chat === undefined ? EMPTY_NODES : chat.legacy.nodes
  return { input: conversation.input.for(actx), nodes }
}
```

- **`inject` change:** add `'uiSession'` **marked optional** alongside `sessions`, `uiConversation`,
  `conversation`. A service that exists on only one host generation must be an optional dependency,
  otherwise the single bundle fails to activate on the other host. The rest of `applyBody` (the
  `ctx.effect` listener, the history machine, `input.setDraft`) is unchanged; `onKeyDown` stays as
  written because `resolve()` still returns the same `ResolvedSession`.
- **How the session-scoped context reaches the conversation service:** `SessionBindingValue.ctx`
  (alpha.2) / `sessions.scope(id)` (alpha.1) is the per-session `Context`, and the plugin passes it
  into the conversation service twice, exactly as before: (a) `actx.get('conversation')` resolves the
  conversation facade *registered under that session*, and (b) `conversation.input.for(actx)`
  materializes `SessionInput` against that session's service scope. Only the *provenance* of `actx`
  changes; the call shape into the conversation service does not.

---

## 4. Guard hardening

**The class of breakage presence-checks cannot catch: field-level (value-shape) drift behind stable
service identity.** The shipped guard asserts that four members *exist on service objects*. That
validates only the top-level object graph. It cannot see a property that was removed, renamed,
retyped, or semantically relocated **inside a value those members return**. Here `sessions.list`
exists, `getSnapshot()` exists and returns a real object on both hosts — only the field set of that
object changed. The same blind spot covers renamed return fields, changed field types
(`SessionId` → entry list), changed nullability/arity of returned members, and moved concepts (a
per-session context relocated to a new service) — none of which move any
`typeof ctx.x.y !== 'undefined'` needle.

**Hardened guard: probe the contract, not the presence.** Perform one real read and assert the
*shape the plugin actually consumes*; the host is acceptable iff at least one supported resolution
contract probes healthy:

```ts
function probeHost(ctx: ClientContext): { ok: boolean; path: 'uiSession' | 'legacy' | null; detail: string } {
  // Contract A (alpha.2): the main-view binding yields { key, ctx }
  const uiSession = ctx.get('uiSession') as UiSessionLike | undefined
  const b = uiSession?.adapter?.current?.getSnapshot?.()
  const modernOK = !!b && 'key' in b && 'ctx' in b

  // Contract B (alpha.1): the session-list snapshot still carries the legacy CURRENT field
  const snap = ctx.sessions?.list?.getSnapshot?.() as LegacyListSnapshot | undefined
  const legacyOK = !!snap && 'current' in snap

  // Downstream contracts consumed per keystroke (dry-run one real resolution):
  // - 'views' in uiConversation.binding(id).snapshot.getSnapshot()
  // - typeof actx.get('conversation')?.input?.for === 'function'
  const downstreamOK = true // probe these with one real binding as well

  if (modernOK && downstreamOK) return { ok: true,  path: 'uiSession', detail: 'adapter.current {key,ctx}' }
  if (legacyOK && downstreamOK) return { ok: true,  path: 'legacy',    detail: 'list snapshot .current' }
  return { ok: false, path: null, detail: 'no supported session-resolution contract probed healthy' }
}
```

Two rules make this actually catch S23:

1. **Dereference one level deeper than the service.** The missing check is `'current' in snap` /
   `'ctx' in binding` on a *materialized value* — on alpha.2 `'current' in sessions.list.getSnapshot()`
   is `false` while every member the shipped guard inspects is `true`.
2. **Run the probe at the right lifecycle points.** It must run against a **materialized snapshot
   value**, never only against service objects: at activation if `getSnapshot()` already returns a
   real object; otherwise (and in addition) on the **first settled snapshot** — subscribe to
   `sessions.list` / `uiSession.adapter.current` and assert on the first non-pending emission
   (alpha.2 snapshots carry `state: 'idle' | 'loading' | 'error'`, so "settled" is observable) — and
   re-probe on session switch, since bindings materialize per session. The probe must be green
   *before the first keystroke is expected to work*; a probe run only at activation against the
   service objects is exactly the shipped behavior and is blind to this class, while a probe run only
   at first keystroke is still a user-visible no-op first. On failure, flip the existing
   `applyWithCompat` remediation banner — i.e. a "compat guard" should be a **contract probe**, not a
   presence probe.

---

## 5. Verification and prevention

**Verify the fix on both hosts without a full migration** (all additive / read-only; nothing below
was executed in this read-only evaluation — these are the maintainer's steps):

1. **Dual type-check from one source tree.** Two `tsc --noEmit` passes over the *same* sources: one
   path-mapped to `session-list-alpha1.d.ts`, one to `session-list-alpha2.d.ts` +
   `ui-session-service-alpha2.d.ts`. Clean in both proves one build covers both surfaces (the legacy
   field is touched only through the structural cast, so the alpha.2 pass sees no banned
   `snapshot.current`).
2. **Resolver unit test against the sealed shapes — no host needed.** Drive `resolve()` with fakes
   shaped exactly like the three fixture types (`SessionListState`; `SessionListSnapshot`;
   `SessionBindingValue`) and assert: recall works via the legacy branch; recall works via the
   `uiSession` branch; an alpha.2-shaped snapshot alone no longer produces a silent `null` (or the
   guard/banner path is taken when both contracts probe unhealthy). This is the cheapest regression
   proof for S23.
3. **Guard self-test.** Point the hardened `probeHost` at the alpha.2-shaped fake: it must return
   `ok:false` against the pre-fix guard's world and `ok:true, path:'uiSession'` after; against the
   alpha.1-shaped fake it must return `ok:true, path:'legacy'` before and after (no alpha.1
   regression).
4. **Live console probe on each running host.** Temporarily add one `console.debug` in `resolve()`
   reporting the branch taken and probe facts (`'current' in snap`, `uiSession` presence,
   `binding?.key`) on each chord press; press Ctrl+Up once on the alpha.2 host (expect
   `path:'uiSession'`, defined `key`, draft fill) and once on a pinned 0.1.6-alpha.1 instance in a
   scratch npm prefix (expect `path:'legacy'`) — the scratch prefix is a second host for the
   maintainer, not a migration of the working setup.
5. **Behavior smoke on both hosts.** With ≥1 sent message: Ctrl+Up fills the composer, Ctrl+Down
   walks back to the typed draft, switching sessions mid-browse resets the browse state, and a
   successful recall now calls `preventDefault` (the chord no longer leaks to composer cursor
   movement).

**The single host-side change that would have made this loud at plugin activation: stop removing
fields silently — deprecate-then-remove.** In `@deepseek-ai/dsh-api-session-controller`, keep
`current` on the snapshot for one release as a **loud stub**: a defined property whose accessor
throws (or at minimum warns and throws) a named error such as
`[dsh-api-session-controller] sessions.list.current was removed in 0.1.6-alpha.2; use
uiSession.adapter.current -> SessionBindingValue.ctx`, and in the `.d.ts` keep the member as
`/** @deprecated removed in 0.1.6-alpha.2; use uiSession.adapter.current.key */ readonly current: never`
(compile-time half). Consequence: the plugin's first access — including the activation-time contract
probe that a hardened guard performs — throws a named, actionable error that the host's plugin-error
reporter surfaces at activation, instead of quietly receiving `undefined` and taking the no-session
path. (Equivalent minimal variant if the field cannot survive: publish a declared capability map the
guard can assert, e.g. `sessions.api = { version: 2, removed: { 'list.current': 'uiSession.adapter.current' } }`;
but the throwing deprecated stub is the smallest change that converts this exact silent removal into
a loud activation failure.)

---

## run-stats

- toolcalls: 19 total — 5 top-level `run_code` invocations + 14 nested tool calls (1 glob, 8 read,
  4 write, 1 send_message)
- token usage: n/a (not visible in this harness)
- completion time: 2026-10-21T08:04:05.849Z (UTC; sampled local context 2026-10-21T15:52:39+08:00 Asia/Shanghai)
