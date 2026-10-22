# S23 · The Compat Guard That Passed — Diagnosis & Migration Report

**Case**: `dsh-input-history` (Ctrl+Up / Ctrl+Down composer recall) silently dies after an in-place
upgrade of `@deepseek-ai/dsh` 0.1.6-alpha.1 → 0.1.6-alpha.2 (npm global, Windows, web profile).
No error, no warning, no compat banner; the plugin's own four-check guard reports the host as
compatible; all five sibling plugins keep working.

**Evidence used** (read-only): `fixture/symptom-report.md`, `fixture/plugin/src-client-index.ts`,
`fixture/host-types/session-list-alpha1.d.ts`, `fixture/host-types/session-list-alpha2.d.ts`,
`fixture/host-types/ui-session-service-alpha2.d.ts`, `fixture/upgrade-notes.txt`, `fixture/README.md`.
(The optional skill reference `skills/plugin-upgrade/` does not exist at the permitted path, so this
report relies solely on the evidence pack.)

---

## 1. Silent-failure attribution

### The per-keystroke resolution path

`onKeyDown` (document capture listener installed once from `ctx.effect`) filters the chord, then calls
`resolve()` on **every** qualifying keystroke. `resolve()` is a four-step chain, and each step is a
guarded early return:

```text
(1) const id = sessions.list.getSnapshot().current      // FAILS HERE, every time
(2) if (id === undefined) return null                   // silent bail-out
(3) const actx = sessions.scope(id)                     // never reached
(4) actx.get('conversation') / uiConversation.binding(id)  // never reached
```

**The exact read that now fails is step (1): `sessions.list.getSnapshot().current`.**

Comparing the two session-controller excerpts:

| | alpha.1 `SessionListState` | alpha.2 `SessionListSnapshot` |
|---|---|---|
| fields | `byId`, `current` | `items`, `state`, `phase`, `error`, `subagentsByParent`, `jobsBySession` |
| `current` | **present** (`SessionId` or undefined) | **removed** |
| documented role | "the session the main conversation view is currently bound to" | "Host catalog and local reference-source counts; **navigation belongs to view owners**" |

The alpha.2 `list` is still an `ObservableSnapshot`, so the call itself succeeds — but the published
object no longer carries `current`. JavaScript property access on a missing key yields `undefined`
(never a throw), so `id === undefined` and `resolve()` returns `null` on **every** keystroke, forever.

### Why nothing surfaces anywhere

1. **Why the compat guard passes.** The guard probes four *service members*: `sessions.list`,
   `sessions.scope`, `sessions.sessionOf`, `uiConversation.binding`. At alpha.2 all four still
   exist — `list` still exists (only its *contents* were reshaped), and the alpha.2 excerpt's own
   NOTE confirms `scope(id)` "still exists on ISessions at alpha.2". A presence check on the
   container is blind to a field-level removal inside it. The guard never reads
   `getSnapshot().current`, so it has nothing to fail on.
2. **Why there is no console error.** No exception is thrown: reading an absent property is
   `undefined`, not a TypeError; the plugin never dereferences anything past the first line of
   `resolve()`. Nothing rejects, nothing logs.
3. **Why it is a silent no-op rather than a crash.** This is a *designed* graceful-degradation
   path colliding with a *data* break. `resolve()` returns `null` for every "can't resolve" case,
   and `onKeyDown` treats `null` as "not ours — let the event pass". With no `preventDefault()`
   the chord falls through to the composer's native multi-line cursor movement — which is exactly
   the reported symptom ("the chord is not swallowed either"). Visually this is indistinguishable
   from the plugin never having been loaded. The alpha.2 release note (runtime dependency
   resolution) removes the last remaining failure surface: even a missing `inject` no longer
   hard-fails at activation.
4. **The plugin did load.** The boot log shows `@dsh-external/dsh-input-history/client.js` in the
   assembled combo with "host up", and no banner rendered — so `apply()` ran, the guard passed, and
   `applyBody` installed the capture listener. The listener **is** firing; it bails at step (2).

### Which already-tried suspicion this settles — and which it does not

*Settled:* the whole "is it loaded / does something else own the chord" cluster. The boot log proves
activation; item 6's negative control (junction removed, chords still do nothing) proves no other
handler owns Ctrl+Up/Down; items 1–2 are now explained (clean console and a passing guard are the
*predicted* consequences of a field-level removal behind a presence-check guard); items 3–5
(re-link junction, hard refresh, disable other plugins, "latest version" chip) are confirmed red
herrings — the plugin code is correct *for alpha.1*, and "latest plugin version" says nothing about
the host API surface it reads.

*Not settled:* two things. (a) The colleague's `uiSession`-inject suggestion is **not** a fix by
itself — adding an inject name changes nothing while the failing read is
`sessions.list…current`; the resolution code must be rewritten (section 3). (b) The type evidence
proves only that the **first** read is dead. It does **not** prove the rest of the chain survives
alpha.2: whether `sessions.scope(id)` is still *populated* (the excerpt only says it still
*exists*), and whether `uiConversation.binding(id)…views.get('chat').legacy.nodes` still yields
nodes. Those are runtime questions the pack cannot answer, and section 5's verification must cover
them.

---

## 2. Evidence mapping

### What changed in the snapshot the plugin reads

`sessions.list` went from a **navigation** state (`byId` + `current` — "which session the main
conversation view is bound to") to a **catalog** state
(`items`, `state`, `phase`, `error`, `subagentsByParent`, `jobsBySession` — "host catalog and
local reference-source counts; navigation belongs to view owners"). The multi-instance refactor moved
"which session is current" out of the global session controller and into the view/service layer.

**Implication for the plugin:** on every keystroke, `sessions.list.getSnapshot().current` evaluates
to `undefined`. `resolve()` returns `null` before `lastSessionId` is ever updated, before
`sessions.scope` is ever called, before any draft is read or written. Recall is dead from the first
line of the function.

### The canonical replacement read (alpha.2)

From `host-types/ui-session-service-alpha2.d.ts` — the new service shipped in
`@deepseek-ai/dsh-client-ui-session`'s client bundle, inject name **`uiSession`**:

| question | answer |
|---|---|
| service | `UiSession` (extends `Service`), from `@deepseek-ai/dsh-client-ui-session/client` |
| observable | `uiSession.adapter.current` — `ObservableSnapshot<SessionBindingValue>`, "binding source of the main view's current session" |
| value shape | `SessionBindingValue` with `key` (SessionId), `ctx` (Context), `hooks`, `keyedHooks`, `props` |
| absence signal | "SessionBindingValue.**key** of the absent binding is undefined; the service publishes the absent value while no main session is retained" — so `key === undefined` replaces `current === undefined` |
| **field replacing `sessions.scope(id)`** | **`SessionBindingValue.ctx`** — "the session-scoped context: services registered under this session resolve here" |

So session-scoped resolution changes hands: at alpha.1 the session ctx came from
`sessions.scope(id)`; at alpha.2 it is carried *on the binding value* —
`uiSession.adapter.current.getSnapshot().ctx` — and the conversation service is reached from that
ctx (`bindingValue.ctx.get('conversation')`), exactly as `conversation.input.for(actx)` expects.
`UiSession.sourceFor(owner: SessionBinding or SessionId)` accepting a bare `SessionId` confirms
id-based addressing (e.g. `uiConversation.binding(id)` for the chat nodes) is still supported, so
that half of the chain can stay as written, keyed off `bindingValue.key`.

---

## 3. Migration recipe (one build, both hosts)

**`inject` change:** add `'uiSession'` — the session-scoped ctx now arrives through the ui-session
service's binding value, not through the session controller:

```ts
export const inject = ['sessions', 'uiConversation', 'conversation', 'uiSession']
```

On alpha.1 `ctx.uiSession` is `undefined` (runtime dependency resolution tolerates absent injects),
so it must be **feature-detected, never dereferenced unguarded**, and the type should be declared
structurally rather than imported from `@deepseek-ai/dsh-client-ui-session` when the build target
is alpha.1 (the package may not be installed there).

**Corrected resolution — feature-detects the new service, falls back to the legacy field:**

```ts
import type { Context as ClientContext } from '@deepseek-ai/cordis'
import type {
  ConversationNode, IConversation, SessionInput,
} from '@deepseek-ai/dsh-client-ui-conversation/client'

/** Minimal structural views of the two host generations (no hard import of either). */
interface SessionListSnapshotLegacy { readonly current: string | undefined }
interface SessionBindingValueLike {
  readonly key: string | undefined
  readonly ctx: Context | undefined
}
interface UiSessionLike {
  readonly adapter?: { readonly current?: { getSnapshot(): SessionBindingValueLike } }
}

/** Current session id plus its session-scoped context, from whichever host generation is live. */
function resolveCurrent(ctx: ClientContext): { id: string; actx: Context } | null {
  // alpha.2 path: navigation moved to the ui-session service main-view binding.
  const ui = (ctx as { uiSession?: UiSessionLike }).uiSession
  const binding = ui?.adapter?.current?.getSnapshot()
  if (binding !== undefined) {
    if (binding.key === undefined || binding.ctx === undefined) return null // no main session retained
    return { id: binding.key, actx: binding.ctx }
  }
  // alpha.1 path: the session-list snapshot still carried 'current'; scope(id) resolved the ctx.
  const legacy = ctx.sessions?.list?.getSnapshot() as SessionListSnapshotLegacy | undefined
  const id = legacy?.current
  if (id === undefined) return null
  const actx = ctx.sessions?.scope?.(id)
  if (actx === undefined) return null
  return { id, actx }
}

function applyBody(ctx: ClientContext): void {
  let browse: HistoryBrowse = IDLE
  let lastSessionId: string | undefined

  const resolve = (): ResolvedSession | null => {
    const current = resolveCurrent(ctx)
    if (current === null) return null
    const { id, actx } = current
    if (id !== lastSessionId) {
      // Session switch: recall must start fresh on the new session.
      browse = IDLE
      lastSessionId = id
    }
    // The session-scoped ctx (binding-value ctx at alpha.2, scope(id) at alpha.1)
    // is what resolves the per-session 'conversation' service.
    const conversation = actx.get('conversation') as IConversation | undefined
    if (conversation === undefined) return null
    const chat = ctx.uiConversation.binding(id).snapshot.getSnapshot().views.get('chat')
    const nodes = chat === undefined ? EMPTY_NODES : chat.legacy.nodes
    return { input: conversation.input.for(actx), nodes }
  }

  // onKeyDown and ctx.effect(...) are unchanged; the bail-out contract stays identical.
}
```

**How the session-scoped context reaches the conversation service:** it no longer arrives via
`sessions.scope(id)`. At alpha.2 it rides on `uiSession.adapter.current`'s `SessionBindingValue.ctx`;
services registered under that session (`conversation`) resolve from that ctx, and
`conversation.input.for(actx)` is fed that same ctx. The alpha.1 branch is byte-for-byte the old
behaviour. Branch on the *service's presence*, never on a host version string.

---

## 4. Guard hardening

**The class of breakage presence-checks cannot catch:** *shape-level* (field-level) breaks inside a
still-present member — the container exists, so a truthiness or `typeof` check passes, but the data
the plugin actually reads was removed, renamed, or re-shaped. Here `sessions.list` exists,
`sessions.scope` exists (per the excerpt's own NOTE), `sessionOf` exists, `uiConversation.binding`
exists — and the plugin still reads a field that alpha.2 deleted. Presence checks verify
*addressability of the container*; the break is in its *contents*. The same blind spot covers renamed
fields (`byId` became `items`) and contract drift (a member that exists but now means something
new). Compounding it, the plugin converts every unresolved shape into a designed `return null`, so
"guard passes + defensive code" equals permanent silence.

**Hardened guard — probe the data path, not the service names:**

```ts
/**
 * Returns the list of unmet contract requirements. Probes the live host objects
 * (the snapshots the plugin actually reads), not service presence.
 */
export function probeClientContract(ctx: ClientContext): string[] {
  const missing: string[] = []
  const snap = ctx?.sessions?.list?.getSnapshot?.() as Record<string, unknown> | undefined
  const ui = (ctx as { uiSession?: UiSessionLike }).uiSession
  const binding = ui?.adapter?.current?.getSnapshot?.() as Record<string, unknown> | undefined

  if (binding !== undefined) {
    // alpha.2 host: current session and session-scoped ctx must ride on the binding value.
    if (!('key' in binding) || !('ctx' in binding)) missing.push('uiSession.adapter.current {key, ctx}')
  } else if (snap !== undefined) {
    // alpha.1 host: navigation lived on the session-list snapshot.
    if (!('current' in snap)) missing.push('sessions.list.getSnapshot().current')
    if (typeof ctx?.sessions?.scope !== 'function') missing.push('sessions.scope(id)')
  } else {
    missing.push('sessions.list.getSnapshot()')
  }
  if (typeof ctx?.uiConversation?.binding !== 'function') missing.push('uiConversation.binding(id)')
  return missing
}
```

Note the probe is a **shape check on a real snapshot** (`'current' in snap`), not a `typeof` check on
a service. On alpha.1 the `current` key is present from the very first publish (its value may be
`undefined`), so the probe is publish-order independent; on alpha.2 it fails *immediately and
loudly*, which is precisely what the shipped guard could not do.

**Lifecycle placement — two points, both mandatory:**

1. **At activation**, inside `apply()` before `applyBody` — the same place the current guard runs,
   but probing shapes. This is what turns this exact regression into a visible banner at load.
2. **Re-probe at effect time and on the first real snapshot emission** (inside the same
   `ctx.effect` that installs the keydown listener — e.g. on each `adapter.current` or
   `sessions.list` update until one probe passes, then disarm). This matters because the host
   publishes an *absent* binding value before any session is retained, and because alpha.2 made
   dependency resolution and plugin unload runtime operations — a contract that is valid at
   `apply()` time can change under a live host. A guard that runs only once, synchronously,
   before the host has published state, would either false-positive on the absent value or miss a
   later degradation.

---

## 5. Verification and prevention

**Verifying the fix on both hosts without a full migration:**

- **alpha.2 (the broken host):** open a session, send two or three messages, press Ctrl+Up — the
  composer draft must fill with the last sent message; Ctrl+Down must walk back. Then, with no
  session retained (`key === undefined`), confirm the chords no-op silently *and* without error.
  Temporarily instrument `resolveCurrent` with a counter to prove the alpha.2 branch is the one
  taken; remove before shipping.
- **alpha.1 (regression):** run the *same build* against the alpha.1 host and repeat — identical
  behaviour proves the legacy fallback branch is live and untouched.
- **Type-level:** run `tsc --noEmit` twice against one tree, once with alpha.1 host types and once
  with alpha.2 host types on the module resolution — one build compiling clean against both is the
  cheapest proof that no version sniffing crept in.
- **Guard-level:** run `probeClientContract` on both hosts — empty on both; then hand-simulate the
  break (delete `current` from a fake alpha.1 snapshot) and confirm it reports the requirement
  instead of passing. No full migration is needed because the fix is feature-detected, not
  version-detected.

**The single host-side change that would have made this loud at plugin activation:**

Turn the removed field into a **throwing, deprecated accessor** instead of an absent one — i.e. in
alpha.2's session controller, keep `current` on the published snapshot as a getter (and keep it in
the `.d.ts`, marked `@deprecated`) that throws
"TypeError: SessionListState.current was removed in 0.1.6-alpha.2 — use uiSession.adapter.current".
With that one change, the plugin's existing first read — and any hardened shape probe — throws a
visible error on the *first keystroke* and at activation respectively, instead of silently yielding
`undefined`. (The equivalent types-side variant: ship a machine-readable snapshot schema or
capability declaration with the client bundle and validate the plugin's required field set against
it at activation. Both convert "field silently missing" into "activation fails loudly"; the throwing
deprecated getter is the smaller, service-local change.)

---

## Summary

| question | answer |
|---|---|
| exact failing read | `sessions.list.getSnapshot().current` evaluates to `undefined` at alpha.2, on every keystroke |
| why silent | absent-property read yields `undefined`; `resolve()` and `onKeyDown` convert it into a designed no-op; no `preventDefault`, so the chord falls through to native cursor movement |
| why guard passes | it probes four service *members*, all still present at alpha.2; it never probes the snapshot's *fields* |
| what changed | the session-list snapshot went from navigation state (`current`) to catalog state (`items`, `jobsBySession`, …) |
| replacement | `uiSession.adapter.current` yields `SessionBindingValue`; **`SessionBindingValue.ctx`** replaces `sessions.scope(id)`; absence is signalled by `key === undefined` |
| fix | add `'uiSession'` to `inject`; feature-detect the binding value and fall back to legacy `current` plus `scope(id)`; feed `bindingValue.ctx` to `actx.get('conversation')` and `input.for(actx)` |
| guard fix | probe live snapshot *shape* (`'current' in snap`, or `key` and `ctx` in the binding) at activation **and** again at effect time on the first published snapshot |
| host fix | ship `current` as a deprecated **throwing getter** (or a validated snapshot-schema contract) so the stale read fails loudly |

*Note: the optional read-only skill reference at `skills/plugin-upgrade/` is absent from the
permitted paths; nothing outside the three allowed path groups was read, and the fixture was not
modified.*
