# S23 · Reference Answer · The Compat Guard That Passed

## 1. Silent-failure attribution

The broken read is in `resolve()`:

```ts
const id = sessions.list.getSnapshot().current   // <-- returns undefined on alpha.2
if (id === undefined) return null                 // <-- silent early exit
```

On alpha.2, `SessionListSnapshot` has `items/state/phase/error/subagentsByParent/jobsBySession`
— there is no `current` field (compare the two type excerpts: alpha.1's `SessionListState`
had `current: SessionId | undefined`). The `list` observable itself still exists and still
publishes a valid snapshot, so `getSnapshot()` succeeds and `.current` is simply
`undefined`. `resolve()` returns `null`, `onKeyDown` returns without calling
`preventDefault`, and the chord falls through untouched.

Why nothing surfaces:

- **The compat guard passes because it checks the wrong granularity.** All four checks are
  service-member presence probes — `sessions.list`, `sessions.scope`, `sessions.sessionOf`,
  `uiConversation.binding`. Every one of those still exists on alpha.2 (`list` is still an
  `ObservableSnapshot`, just of a reshaped value). A removed *field* inside the published
  snapshot is invisible to presence checks.
- **No console error** because nothing throws: reading a missing property on an object
  yields `undefined`, and the plugin treats `undefined` as "no session open" — a
  legitimate state it was designed to ignore quietly.
- **The silent no-op is by design of the original code**: `id === undefined` previously
  meant "no conversation open yet", a state that must not produce noise.

This settles tried-item 6 differently than the maintainer read it: with the plugin removed
the chords do nothing because no handler exists; with the plugin loaded they do nothing
because the handler exits at line one — the two are indistinguishable from the outside,
which is exactly why the bug looks like "the listener is not firing". It does not address
tried-item 3 (junction/link) or 4 (other plugins) — those were never implicated.

## 2. Evidence mapping

- **What changed**: `SessionListState.current` (alpha.1) → gone in `SessionListSnapshot`
  (alpha.2). Navigation/selection no longer belongs to the sessions controller — the
  alpha.2 `ISessions.list` doc comment says "navigation belongs to view owners".
- **What the plugin receives**: every keystroke resolves `current` → `undefined` →
  `resolve()` → `null`, deterministically, forever.
- **The canonical replacement**: the new `uiSession` service
  (`@deepseek-ai/dsh-client-ui-session`, alpha.2). Its `adapter.current` is an
  `ObservableSnapshot<SessionBindingValue>`; a snapshot yields
  `{ key, ctx, hooks, keyedHooks, props }` where:
  - `key` is the bound session's id — the replacement for `current`;
  - `ctx` is the session-scoped context — the replacement for `sessions.scope(id)`:
    services registered under the session (e.g. `conversation`) resolve through it.

The absent binding publishes an absent value (`key` undefined), preserving the
"no session open" semantics.

## 3. Migration recipe

```ts
export const inject = ['sessions', 'uiSession', 'uiConversation', 'conversation']

// inside applyBody:
const currentSession = (): { sessionId: string; scope: ClientContext } | null => {
  if (ctx.uiSession !== undefined) {
    const snap = ctx.uiSession.adapter.current.getSnapshot()
    if (snap !== undefined && snap.key !== undefined && snap.ctx !== undefined) {
      return { sessionId: snap.key, scope: snap.ctx }
    }
    return null // main session absent on alpha.2
  }
  // alpha.1 fallback: legacy field + sessions.scope
  const id = sessions.list.getSnapshot().current
  if (id === undefined) return null
  const scope = sessions.scope(id)
  return scope === undefined ? null : { sessionId: id, scope }
}

const resolve = (): ResolvedSession | null => {
  const current = currentSession()
  if (current === null) return null
  const { sessionId: id, scope } = current
  // ... session-switch reset unchanged ...
  const conversation = scope.get('conversation') as IConversation | undefined
  if (conversation === undefined) return null
  const chat = ctx.uiConversation.binding(id).snapshot.getSnapshot().views.get('chat')
  const nodes = chat === undefined ? EMPTY_NODES : chat.legacy.nodes
  return { input: conversation.input.for(scope), nodes }
}
```

Notes: `inject` gains `uiSession` so the fiber waits for the service (on hosts where it
exists). The session-scoped `ctx` from the binding value replaces `sessions.scope(id)` —
`conversation.input.for(scope)` receives the same kind of scope. A null check on the
snapshot plus the legacy branch keeps one build serving both hosts.

## 4. Guard hardening

The shipped guard checks that four service *members exist*. This breakage class is
**field-level removal behind service-level stability**: the service object, its methods,
and even the observable all survive; only the published shape changes. Presence probes
cannot catch it, and they run once at activation while this failure recurs per keystroke.

A hardened guard probes the *behavior* it depends on, at the granularity it depends on:

- after resolving the real snapshot, assert the specific field:
  `typeof sessions.list.getSnapshot().current !== 'undefined'` on alpha.1-shaped hosts,
  and `ctx.uiSession?.adapter?.current !== undefined` on alpha.2-shaped hosts — the
  plugin's actual dependency is "some way to learn the main session id", so the guard
  should feature-detect that capability (either source is acceptable), not enumerate
  service members;
- run the probe lazily (per first real use) or re-run it when activation-time state can
  go stale — an activation-time snapshot cannot see per-keystroke field reads.

## 5. Verification and prevention

Verify without a full migration:

- **alpha.2**: with one session open, a temporary console probe
  `ctx.uiSession.adapter.current.getSnapshot()?.key` (or the devtools equivalent through
  the plugin's own logging) must print the open session id; after the code change, the
  chord recalls history and switches reset the browse state on session switch.
- **alpha.1**: the same build falls into the legacy branch — `current` resolves, chords
  work; assert no regression by loading the dual build on an alpha.1 host.
- Typecheck against alpha.2's published types catches the removed field at compile time
  (the strongest pre-ship check for this class).

Host-side prevention: deleting a public field from a published snapshot is silent by
default. If the controller had kept `current` as a deprecated getter that throws (or
console.warns) once read, or if the type-level removal were paired with a runtime
deprecation alarm keyed to the first read, the plugin would have failed loud at first
keystroke — or better, at activation if the host exposes a snapshot-shape contract the
guard can pin.
