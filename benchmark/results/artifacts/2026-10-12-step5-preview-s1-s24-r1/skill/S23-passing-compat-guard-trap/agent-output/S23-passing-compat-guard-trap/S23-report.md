# S23 · The Compat Guard That Passed — attribution & migration report

**Scope**: read-only diagnosis of `dsh-input-history`'s dead Ctrl+Up/Ctrl+Down recall after
`@deepseek-ai/dsh` 0.1.6-alpha.1 → 0.1.6-alpha.2 (Windows, npm global, web profile).
**Sources**: fixture evidence pack only (symptom report, plugin client entry, both
session-controller type excerpts, the alpha.2 ui-session service excerpt, upgrade notes)
plus the read-only `plugin-upgrade` skill corridor card
[DSH-0.1.6-A2-01](../../../../../skills/plugin-upgrade/references/v0.1.6-alpha.2.md).
Nothing outside the allowed paths was inspected; the fixture was not modified.

---

## 1. Silent-failure attribution

### The per-keystroke path and the exact failing read

`onKeyDown` (capture phase on `window`, `plugin/src-client-index.ts:50`) filters on
ctrl+ArrowUp/ArrowDown, `!isComposing`, `isComposerTarget(e.target)` — all of which pass in
the reported scenario (the chord is typed in the composer). It then calls `resolve()`
(`plugin/src-client-index.ts:33`):

```ts
const resolve = (): ResolvedSession | null => {
  const id = sessions.list.getSnapshot().current   // <-- THE read that now fails
  if (id === undefined) return null                // <-- taken on EVERY keystroke
  ...
  const actx = sessions.scope(id)                  // never reached
  const conversation = actx.get('conversation')    // never reached
  const chat = ctx.uiConversation.binding(id)...   // never reached
  ...
}
```

**`sessions.list.getSnapshot().current` is the failure.** On alpha.1 that expression
returned the main-view session's id (`SessionListState.current: SessionId | undefined`,
`host-types/session-list-alpha1.d.ts:9`). On alpha.2 the field no longer exists on the
published snapshot (`host-types/session-list-alpha2.d.ts:5-13`), so the expression
evaluates to `undefined` — and the plugin's own null-branch (`if (id === undefined) return
null`) converts that into an early return. Back in `onKeyDown`, `resolved === null` returns
before any `preventDefault()` / `stopPropagation()` / `setDraft()`. The chord falls through
to the browser's own multi-line cursor movement, exactly as reported. Everything downstream
of line 34 (`sessions.scope`, `actx.get('conversation')`, `uiConversation.binding`) is dead
code on alpha.2.

### Why nothing surfaces anywhere

- **Why the compat guard passes.** `applyWithCompat` (`plugin/src-client-index.ts:83-88`)
  probes four *members* for presence/truthiness: `sessions.list`, `sessions.scope`,
  `sessions.sessionOf`, `uiConversation.binding`. All four still exist on alpha.2 — the
  session-controller service object is unchanged, `scope(id)` still exists (explicit note
  in `session-list-alpha2.d.ts:24-26`), and `uiConversation` was untouched by the refactor.
  The removal happened *one level below* every probe: not on a service, not on a function,
  but on a field *inside the value* that `sessions.list.getSnapshot()` returns. A
  service-presence check cannot see it.
- **Why there is no console error.** Nothing throws. A property read of a missing field is
  `undefined` in plain JavaScript, and the plugin binary is a prebuilt client bundle served
  by the host — no per-host typecheck ever runs at load time, so the compile-time
  contradiction (`undefined` no longer assignable to `SessionId | undefined` state) never
  materializes. `undefined` is additionally a *legal* value in the plugin's own protocol
  (alpha.1's `current` is `SessionId | undefined`), so the plugin's no-session guard
  absorbs the host's structural change as the routine "no session open" case.
- **Why the failure mode is silent no-op rather than an exception.** This is a
  **data-field removal**, not a function removal. A removed function
  (`sessions.scope` deleted) would raise `TypeError: … is not a function` at the call
  site and print immediately. A removed *field* yields `undefined` quietly; the plugin's
  well-written defensive null-check then frames a permanent host incompatibility as a
  transient, legitimate state. The guard's success and the plugin's own error handling
  combine into false assurance.

### Which earlier suspicion this settles — and which it does not

- **Settles (colleague's note, `upgrade-notes.txt:31-34`)**: the multi-instance session
  refactor is confirmed as the cause. Release note line 5 — "客户端 Session 会话支持多实例共存，相关 API
  及 slot 有变化" — maps exactly onto the removal of the list snapshot's `current` field
  (card DSH-0.1.6-A2-01), and the colleague's proposed direction (involve `uiSession`) is
  indeed part of the fix. The maintainer's own tried list is settled as non-causes:
  junction re-link / hard refresh (install-topology theories — the break is a host API
  data-shape change), disabling other plugins (the boot log shows this plugin's client
  entry `@dsh-external/dsh-input-history/client.js` composed and loaded fine), and "no
  other chord handler" — which positively confirms the plugin's listener is the last
  handler standing, consistent with a bail-out inside `resolve()` rather than a missing
  listener.
- **Does not address**: the "re-register its slot" framing — this plugin registers **no
  slot**; it resolves the session at event time from a document-level listener, which is
  precisely the plugin class card A2-01 flags ("keyboard helpers, paste/drop handlers,
  any event-time session resolution outside a slot component"). Adding `uiSession` to
  `inject` alone changes nothing; only the *read* must move. The attribution also does not
  explain the guard gap (why no banner) — that is a separate design finding, addressed in
  §4.

---

## 2. Evidence mapping

### What changed in the snapshot the plugin reads

| | alpha.1 (`session-list-alpha1.d.ts`) | alpha.2 (`session-list-alpha2.d.ts`) |
|---|---|---|
| Snapshot type | `SessionListState` | `SessionListSnapshot` |
| Fields | `byId: Record<SessionId, SessionSummary>`, **`current: SessionId \| undefined`** | `items: readonly SessionListEntry[]`, `state: 'idle'\|'loading'\|'error'`, `phase`, `error: RemoteFailure \| null`, `subagentsByParent`, `jobsBySession` |
| Meaning of `list` | global session list **including which session the main view is bound to** | "Host catalog and local reference-source counts; **navigation belongs to view owners**" |

The multi-instance refactor removed the published current-session pointer entirely.
"Current" now means *main-view occupancy* — per card A2-01, derivable on alpha.2 as the
catalog row with a positive `retainedBy.mainView` reference count — a fact the list
snapshot no longer carries as a dedicated field.

**Implication for the value the plugin receives on every keystroke**: `sessions.list
.getSnapshot().current` is `undefined` — not because no session is open, but because the
field no longer exists on the object. The plugin cannot distinguish this from the
legitimate "no session open" case, so every Ctrl+Up/Ctrl+Down bails at
`plugin/src-client-index.ts:35`.

### The canonical replacement read (from `ui-session-service-alpha2.d.ts`)

- **Service**: `UiSession` — inject name **`uiSession`**, shipped by the
  `@deepseek-ai/dsh-client-ui-session` client bundle.
- **Observable**: **`adapter.current`** — `ObservableSnapshot<SessionBindingValue>`,
  documented as "Binding source of the main view's current session" (`:9-13`). (Card
  A2-01 adds: the equivalent field is *private* on both tags — `private currentBinding` on
  alpha.1, `private readonly current` at `packages/client/ui-session/src/client/index.ts:280`
  on alpha.2 — so the slot-scope adapter is the public path, and `uiSession` itself is
  registered on **both** tags; alpha.1's `ui-approval` already injects it. If the plugin
  caches the id, subscribe via `uiSession.adapter.current.subscribe(listener)`.)
- **Value shape** (`SessionBindingValue`, `:29-38`): `key: SessionId` — the bound session's
  id; **`ctx: Context`** — "the session-scoped context: services registered under this
  session resolve here"; plus `hooks`, `keyedHooks`, `props`. While no main session is
  retained, the service publishes the *absent binding*: `key === undefined` (`:40-41`).
- **The field that replaces `sessions.scope(id)`**: **`ctx`**. The session-scoped context
  the plugin used to obtain from `sessions.scope(id)` is carried directly on the binding
  value, so `sessions.scope(id)?.get('conversation')` becomes
  `binding.ctx.get('conversation')` when `binding.key !== undefined`.

---

## 3. Migration recipe (one build, both hosts)

Feature-detection order matters: the adapter is the canonical source and must be tried
first (the legacy `current` field is *removed* on alpha.2, so reading it first just
reproduces the bug); the legacy snapshot field remains as the alpha.1 fallback.

```ts
import type { Context as ClientContext } from '@deepseek-ai/cordis'
import type { ISessions } from '@deepseek-ai/dsh-api-session-controller/client'
import type {
  ConversationNode, IConversation, SessionInput,
} from '@deepseek-ai/dsh-client-ui-conversation/client'
import { down, extractHistory, IDLE, resync, up, type HistoryBrowse } from './history.ts'
import { applyWithCompat } from './compat.ts'

export const name = 'dsh-input-history'

// inject: 'uiSession' added — it publishes the main-view binding on both hosts.
export const inject = ['sessions', 'uiConversation', 'conversation', 'uiSession']

/** Minimal structural view of the alpha.2 binding value (sealed .d.ts excerpt). */
interface MainBindingValue {
  readonly key?: string
  readonly ctx?: Context
}

/**
 * Current main-view session id + its session-scoped context.
 * alpha.2: ctx.uiSession.adapter.current.getSnapshot()  (SessionBindingValue)
 * alpha.1: sessions.list.getSnapshot().current + sessions.scope(id)
 * Returns null only for the *explicit* "no main session" case on either host.
 */
function resolveMainSession(
  ctx: ClientContext,
  sessions: ISessions,
): { id: string; actx: Context } | null {
  const adapter = ctx.uiSession?.adapter as
    | { current: { getSnapshot(): MainBindingValue | undefined } }
    | undefined
  if (adapter !== undefined) {
    const binding = adapter.current.getSnapshot()
    if (binding?.key !== undefined && binding.ctx !== undefined) {
      return { id: binding.key, actx: binding.ctx }
    }
    // Absent binding: the service publishes key === undefined while no main
    // session is retained — genuinely no session, not a host break.
    return null
  }
  // Legacy path (alpha.1): the snapshot still carries `current`.
  const id = sessions.list.getSnapshot().current
  if (id === undefined) return null
  const actx = sessions.scope(id)
  if (actx === undefined) return null
  return { id, actx }
}
```

`resolve()` then collapses to the same downstream code — the session switch reset and the
`conversation` / chat-node reads are unchanged, because `actx` supplies the session-scoped
context on both paths:

```ts
const resolve = (): ResolvedSession | null => {
  const scope = resolveMainSession(ctx, sessions)
  if (scope === null) return null
  const { id, actx } = scope
  if (id !== lastSessionId) {
    browse = IDLE
    lastSessionId = id
  }
  // Same resolution on both hosts: the conversation service is registered
  // inside the session scope (actx), reached via binding.ctx on alpha.2 and
  // sessions.scope(id) on alpha.1.
  const conversation = actx.get('conversation') as IConversation | undefined
  if (conversation === undefined) return null
  const chat = ctx.uiConversation.binding(id).snapshot.getSnapshot().views.get('chat')
  const nodes = chat === undefined ? EMPTY_NODES : chat.legacy.nodes
  return { input: conversation.input.for(actx), nodes }
}
```

- **`inject` declaration**: add `'uiSession'` → `['sessions', 'uiConversation',
  'conversation', 'uiSession']`. Nothing is removed: `sessions` is still needed for the
  legacy fallback path, and `uiConversation` still reads the chat nodes.
- **How the session-scoped context reaches the conversation service**: it rides on the
  same `actx` as before. On alpha.2 it arrives as `SessionBindingValue.ctx` — the context
  under which session-scoped services (including `conversation`) are registered — and the
  input facade is taken with `conversation.input.for(actx)`. On alpha.1 it arrives from
  `sessions.scope(id)`. Both hosts therefore run the *same* downstream code.
- Note the plugin re-reads per keystroke and caches nothing, so no
  `adapter.current.subscribe(...)` is required; add one if caching is introduced later.

---

## 4. Guard hardening

### The class of breakage presence-checks cannot catch

The shipped guard verifies that the *seam* exists (service objects and their members are
non-null). It cannot verify the *contract flowing through the seam*. Concretely, the
un-catchable class is **field-level / shape-level drift behind a stable service
signature**:

1. a data field published by a member is removed or renamed (`SessionListState.current`);
2. a value's shape is restructured (`byId` + `current` → `items` + `phase`/`error` +
   per-parent catalogs);
3. a member's semantics change under an unchanged signature.

Removed *functions* crash loudly and are caught by presence checks; removed *fields* are
absorbed as `undefined` and pass every truthiness probe. The guard's green light is
therefore worthless against exactly the breakage class that alpha.2 shipped — and the
false assurance is maximal because the plugin's own null-checks then suppress the
symptom.

### The hardened guard

**Probe the resolved value, not the members.** Replace the four presence probes with an
end-to-end contract probe that mirrors the plugin's real resolution path and asserts the
*shape of what comes back*:

```
probe(ctx):
  adapter = ctx.uiSession?.adapter?.current
  legacy = ('current' in ctx.sessions.list.getSnapshot())     // field existence, not list existence
  if (adapter && adapter.getSnapshot) -> source = ADAPTER
  else if (legacy)                     -> source = LEGACY
  else                                -> FAIL: no current-session source -> banner
  value = source.get()                 // one real read at activation
  if (value is the explicit no-session value { key === undefined / current === undefined })
                                        -> PASS (degraded: no session open yet)
  if (value.key/current is a string AND (binding.ctx or sessions.scope(id)) resolves)
                                        -> PASS (full contract)
  otherwise                            -> FAIL -> remediation banner
```

**Where in the lifecycle it must run.** The probe must run **at plugin activation
(`apply`), after inject resolution and *before* the capture listener is installed** — that
is the only point where the remediation banner can still be rendered synchronously and the
plugin can decline to arm itself. Because activation can precede the first session, the
probe must accept the *explicit* no-session value (`key === undefined`) as a pass rather
than poison the result; and the resolution outcome should be re-checked on the first real
keystroke (or via `adapter.current.subscribe`) so a host that passes the shape check but
fails later still flips to the banner/warn path instead of silently no-op'ing. In short:
presence → value-shape; one-shot → activation + point-of-use.

---

## 5. Verification and prevention

### Verifying the fix on both hosts without a full migration

1. **Contract probe on the live alpha.2 host** (browser console against the running
   client): `sessions.list.getSnapshot()` shows no `current` key; with one session open,
   `uiSession.adapter.current.getSnapshot()` returns `{ key: <id>, ctx, … }` and
   `ctx.uiSession.adapter.current.subscribe` fires on main-view session switch; with no
   session open it returns the absent binding (`key === undefined`), no throw. (On an
   alpha.1 host the same adapter read works — card A2-01 — and the legacy
   `current`/`scope(id)` path also resolves.)
2. **Behavioral run on alpha.2** (the at-hand host): focus composer → send a message →
   Ctrl+Up repopulates the draft, Ctrl+Down walks back; switching the main-view session
   resets the browse state; with no session open the chords are inert with zero console
   output. A synthetic-key dispatch (`new KeyboardEvent('keydown', { ctrlKey: true, key:
   'ArrowUp' })` on the composer) proves the listener fires — it always did; the bail-out
   was inside `resolve()`.
3. **alpha.1 A/B leg**: repeat the behavioral run against an alpha.1 host (pinned external
   install to a separate prefix — never from inside a live session) to prove the legacy
   branch, so the fix is not new-host-only.
4. **Static dual typecheck**: compile the corrected source twice, against the alpha.1 and
   the alpha.2 shipped declarations (`skipLibCheck: false`, per the skill's
   precision-checklist) to prove one build type-satisfies both seams.
5. **Guard regression**: on alpha.2, simulate a host with no resolution source (hide
   `uiSession.adapter` and the legacy field) and confirm the banner now renders — proving
   the hardened guard fires where the shipped one passed.

### The single host-side change that would have made this loud

**Ship the removal as a fail-loud deprecation tripwire instead of deleting the field.**
If the session-controller had kept publishing `current` on the list snapshot as an
accessor that *throws* on read — e.g. a getter raising
`Error: sessions.list.current was removed in 0.1.6-alpha.2 (multi-instance sessions); use ctx.uiSession.adapter.current` —
then the plugin's very first read (keystroke today, or the hardened activation probe of
§4) would have thrown immediately at a precise, attributable location, with the
remediation pointer in the message. The compile-time complement in the types (keep
`current` as a required, `@deprecated`-marked field in the shipped `.d.ts`) fails future
plugin builds closed, but only the runtime throwing accessor converts the silence into an
activation-time failure on already-built plugins.

---

## Summary

| Question | Answer |
|---|---|
| Failing read | `sessions.list.getSnapshot().current` — `plugin/src-client-index.ts:34` |
| Root change | `SessionListState.current` removed in the alpha.2 multi-instance Session refactor (card DSH-0.1.6-A2-01) |
| Why guard passed | Four presence probes; removal was a data field one level below all of them |
| Why silent | Field removal → `undefined` → absorbed by the plugin's own no-session null branch; no throw, no typecheck, no banner |
| Replacement read | `ctx.uiSession.adapter.current.getSnapshot()` → `SessionBindingValue { key, ctx, … }`; `ctx` replaces `sessions.scope(id)` |
| Fix | Add `'uiSession'` to `inject`; adapter-first with legacy-field fallback; `actx = binding.ctx \|\| sessions.scope(id)` |
| Guard fix | Probe the resolved value's shape at activation (before arming the listener) + at first use; never service presence |
| Prevention | Publish removed fields as throwing deprecation tripwires at the seam |
