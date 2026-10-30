# S23 · The Compat Guard That Passed — Silent-Failure Attribution & Migration

## 1. Silent-failure attribution

The plugin's per-keystroke resolution path is `resolve()` in `plugin/src-client-index.ts`:

1. `const id = sessions.list.getSnapshot().current`
2. `if (id === undefined) return null` — **this is the failing read.**
3. `const actx = sessions.scope(id)`
4. `const conversation = actx.get('conversation')`
5. `ctx.uiConversation.binding(id).snapshot.getSnapshot().views.get('chat')`
6. return `{ input: conversation.input.for(actx), nodes }`

The exact read that now fails is **`sessions.list.getSnapshot().current`**. In 0.1.6-alpha.2 the
session-list snapshot type was rebuilt as `SessionListSnapshot` (`items`, `state`, `phase`,
`error`, `subagentsByParent`, `jobsBySession`) and the `current` field that lived on the
alpha.1 `SessionListState` was **removed**. Accessing the property on the new snapshot object
therefore yields `undefined`, so `id === undefined` and `resolve()` short-circuits to
`null` on every chord before ever reaching `scope()`, the conversation service, or the draft
read/write.

Why nothing surfaces:

- **Why the compat guard passes** — the guard (in `apply()`) probes only four *service-level
  members*: `sessions.list`, `sessions.scope`, `sessions.sessionOf`, `uiConversation.binding`.
  All four still exist on alpha.2 (`scope` is explicitly still present per the alpha.2 d.ts
  note). None of the probes reads `list.getSnapshot().current`, so the guard never observes the
  removed field.
- **Why there is no console error** — nothing throws. A missing property on a plain snapshot
  object returns `undefined`; the plugin's own `id === undefined` branch swallows it as the
  legitimate "no session is current" empty state. No `TypeError`, no rejection, no log.
- **Why it is a silent no-op rather than a thrown exception** — the `undefined` read is
  indistinguishable from "no current session", so `resolve()` returns `null`, `onKeyDown`
  bails before `e.preventDefault()`/`e.stopPropagation()`, and the chord falls through to the
  composer's own (unchanged) multi-line cursor movement. The failure is therefore a no-op, not an
  error.

Which earlier suspicion this reading settles vs. leaves open:

- **Settles** — item 2 of the already-tried list ("compat banner not showing") and the symptom
  report's own "listener either not firing or firing and bailing out". It is **firing and bailing**:
  the listener runs, but `resolve()` returns `null` at the first undefined read, so nothing is
  swallowed and no banner appears because the guard's presence-checks pass.
- **Does not address** — the colleague's "re-register its slot" half of the hypothesis. The
  evidence shows no slot is involved: the plugin registers no `provide()` descriptor, and the
  break is a removed *snapshot field*, not a slot/registration problem. The slot changes in the
  refactor affect stock packages that publish per-session hooks via `UiSession.provide()`, not
  this external plugin's snapshot read.

## 2. Evidence mapping

**What changed in the snapshot (alpha.1 → alpha.2):**

| | alpha.1 `SessionListState` | alpha.2 `SessionListSnapshot` |
|---|---|---|
| summaries | `byId: Record<SessionId, SessionSummary>` | `items: readonly SessionListEntry[]` |
| **current** | **`current: SessionId | undefined`** | **removed (no such field)** |
| extras | — | `state`, `phase`, `error`, `subagentsByParent`, `jobsBySession` |

The decisive change is the removal of `current`. Consequence: on every keystroke the plugin now
receives `undefined` for the current session id, so `resolve()` returns `null` unconditionally
and recall is dead even though the session is retained and every other plugin works.

**Canonical replacement read (new service):**

- **Service**: `UiSession` (client bundle `@deepseek-ai/dsh-client-ui-session`, inject name
  `"uiSession"`).
- **Observable**: `UiSession.adapter.current` — `ObservableSnapshot<SessionBindingValue>`, the
  binding source of the main view's current session.
- **Value shape** `SessionBindingValue`:
  - `key: SessionId` — the bound session's id (replaces `list.getSnapshot().current`).
  - `ctx: Context` — the **session-scoped context**; this **replaces `sessions.scope(id)`** for
    session-scoped service resolution.
  - `hooks` / `keyedHooks` / `props` — contributed per-session hooks/props (not needed here).

Note the absent binding publishes `key === undefined`, so the id check still applies.

## 3. Migration recipe

Corrected dual-host resolution (one build, works on alpha.1 and alpha.2):

```ts
import type { Context as ClientContext } from '@deepseek-ai/cordis'
import type { ISessions, SessionId } from '@deepseek-ai/dsh-api-session-controller/client'
import type {
  ConversationNode, IConversation, SessionInput,
} from '@deepseek-ai/dsh-client-ui-conversation/client'
import type { SessionBindingValue } from '@deepseek-ai/dsh-client-ui-session/client'

interface ResolvedSession {
  readonly input: SessionInput
  readonly nodes: readonly ConversationNode[]
}

/** Returns the current session id + its session-scoped Context, on either host. */
function currentSessionContext(
  ctx: ClientContext,
  sessions: ISessions,
): { id: SessionId; actx: ClientContext } | null {
  // alpha.2 path: UiSession.adapter.current carries key + session-scoped ctx.
  const uiSession = (ctx as { uiSession?: { adapter?: { current?: {
    getSnapshot(): SessionBindingValue } } } }).uiSession
  const binding = uiSession?.adapter?.current?.getSnapshot?.()
  if (binding?.ctx !== undefined && binding.key !== undefined) {
    return { id: binding.key, actx: binding.ctx }
  }
  // alpha.1 legacy path: sessions.list snapshot carries current; scope(id) gives the ctx.
  const id = sessions.list.getSnapshot().current
  if (id === undefined) return null
  const actx = sessions.scope(id)
  if (actx === undefined) return null
  return { id, actx }
}
```

and `resolve()` becomes:

```ts
const resolve = (): ResolvedSession | null => {
  const found = currentSessionContext(ctx, sessions)
  if (found === null) return null
  const { id, actx } = found
  if (id !== lastSessionId) {
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

**Inject declaration change** — add `uiSession` as an *optional* dependency so activation
survives on alpha.1 (where the service does not exist) while still receiving it on alpha.2:

```ts
export const inject = {
  required: ['sessions', 'uiConversation', 'conversation'],
  optional: ['uiSession'],
}
```

(If the running Cordis only supports the flat-array form, keep the array and register the optional
dependency programmatically via `ctx.inject(['uiSession'], { optional: true })` inside `apply`,
reading it into a captured variable.)

**How the session-scoped context reaches the conversation service** — the `conversation` service
is session-scoped and can only be resolved from a session-scoped `Context`. On alpha.1 that
context came from `sessions.scope(id)`; on alpha.2 the canonical source is
`uiSession.adapter.current.getSnapshot().ctx` (`SessionBindingValue.ctx`). Passing that context
to `actx.get('conversation')` and then to `conversation.input.for(actx)` is what materializes
the per-session `SessionInput`, so the two paths converge on the same downstream code.

## 4. Guard hardening

**Class of breakage presence-checks cannot catch** — presence-checks validate only that top-level
service *members* exist; they cannot detect **field-level removals or shape changes inside the
values those members return**. Here `sessions.list` still exists, but the *value* its
`getSnapshot()` returns no longer carries `current`. A guard that checks "does the service
exist" is blind to "did the service's data contract change".

**Hardened guard** — probe the *data path the plugin actually reads*, i.e. the snapshot value's
shape, not the service members. Assert that at least one current-session source is structurally
present: the legacy `current` field on the list snapshot, or the new `adapter.current` snapshot
yielding a `SessionBindingValue` with a `ctx`:

```ts
function probeCurrentSessionSource(ctx: ClientContext): boolean {
  const listSnap = ctx.sessions?.list?.getSnapshot?.()
  const hasLegacyCurrent = listSnap != null && 'current' in listSnap // property exists, not just truthy
  const binding = (ctx as any).uiSession?.adapter?.current?.getSnapshot?.()
  const hasBindingCtx = binding?.ctx != null
  return hasLegacyCurrent || hasBindingCtx
}
```

**When it must run** — at **plugin activation** (immediately after services are injected, before
the `keydown` listener is registered), and re-probed on the first non-empty session snapshot
(because `current`/`key` may legitimately be `undefined` until a session is retained). The
reason activation-time is mandatory: this failure mode only manifests on the lazy per-keystroke
read, which the old guard never touches; a guard that performs (or structurally validates) the
actual read up front sees the missing field immediately and renders the banner.

## 5. Verification and prevention

**Verifying the fix on both hosts without a full migration** — the fix is pure client logic behind
injected services, so verify by (a) type-checking the entry against each host's published `.d.ts`
excerpts (two tsconfigs / a union of the two snapshots) to confirm the dual path compiles, and
(b) runtime-driving `currentSessionContext()` + `resolve()` with two representative fixtures —
an alpha.1-shaped list snapshot (`{ byId, current: id }` + `scope(id)` returning a stub ctx) and
an alpha.2-shaped `uiSession.adapter.current` snapshot (`{ key, ctx }`) — asserting that on
each the resolved `ResolvedSession` is non-null and `setDraft` receives the recalled text. This
is a unit-level smoke test; no npm-global reinstall or other-plugin migration is required.

**Single host-side change to make it loud at activation** — instead of silently deleting
`current` from the snapshot, ship it on alpha.2 as a **throwing deprecation accessor** (or return
a proxied/sealed snapshot that throws on access to removed fields) with a message pointing to
`UiSession.adapter.current`. The plugin's first `getSnapshot().current` read would then throw a
clear "removed in 0.1.6-alpha.2 — use UiSession.adapter.current" error at activation instead of
yielding `undefined`, surfacing through the plugin's existing compat guard as a banner (or at
least a loud console error). The type-side counterpart: type the removed field as `never` (or
drop it while the runtime accessor throws) so rebuilt consumers also fail at compile time, but the
runtime accessor is what makes already-built, junction-linked bundles fail loudly.
