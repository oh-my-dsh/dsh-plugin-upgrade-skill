# JUDGE BRIEF · noskill.S23-passing-compat-guard-trap

## Criteria (sealed rubric)
- [silent-break-attribution] (20pt) Walk resolve() in plugin/src-client-index.ts: sessions.list.getSnapshot() succeeds but the published snapshot no longer carries current, so id is undefined and the function returns null on every keystroke; onKeyDown then exits before preventDefault. Explain both silences: the four presence probes in the compat guard all survive (the service, its members, even the observable exist — only a field inside the published value is gone), and undefined was a legitimate no-session state the code deliberately ignores quietly. Do not claim the sessions service or the guard itself was removed, renamed, or throws.
- [evidence-mapping] (20pt) From session-list-alpha1.d.ts vs session-list-alpha2.d.ts: SessionListState.current is gone and navigation moved to view owners (ISessions.list doc comment). From ui-session-service-alpha2.d.ts: the canonical replacement is the uiSession service — adapter.current (ObservableSnapshot<SessionBindingValue>) yielding { key, ctx, hooks, keyedHooks, props }, where key replaces current and ctx is the session-scoped context replacing sessions.scope(id). Mapping to card DSH-0.1.6-A2-01 is creditable; the card alone without the type-walk earns partial at most.
- [dual-host-migration] (20pt) Propose a corrected resolution: read ctx.uiSession.adapter.current.getSnapshot() when the service exists, fall back to the legacy current field plus sessions.scope otherwise, from one build; inject gains uiSession; the conversation service resolves through the binding value ctx (scope.get('conversation')), and input.for receives that scope. Accept equivalent shapes and guard order. A recipe that only works on alpha.2 (no fallback) or that keeps reading the removed field earns partial; re-registering slots or merely re-declaring inject without the code change earns zero.
- [guard-hardening] (20pt) Name the breakage class the shipped guard cannot catch: field-level removal behind service-level stability, checked once at activation while the break recurs per use. Specify a hardened guard that probes the actual capability (assert the specific snapshot field on alpha-1-shaped hosts and/or feature-detect uiSession on alpha-2-shaped hosts) and note the probe must run lazily or per-use, not only at activation. Presence-list expansion alone is insufficient.
- [verification-and-prevention] (20pt) Verify without a full migration: a temporary probe of adapter.current key with one session open, chord behavior after the code change on both hosts, and typecheck against alpha.2 published types as the strongest pre-ship gate. Prevention: a removed public snapshot field should fail loud — a deprecated getter that throws/warns on read, or a runtime snapshot-shape contract guards can pin. Do not require executing this static fixture.

## Caps (score ceilings; judge returns each with triggered true/false)
- CAP [slot-reregistration-misdiagnosis] ceiling=40 The final remedy is only re-registering slots, re-declaring inject, or reinstalling the plugin — the colleague red herring — without the current-session code fix. Apply only to affirmative final advice or conclusions. Quoted, hypothetical or explicitly rejected bad examples do not trigger the cap; read the whole report.

## Candidate report(s)
#### FILE: S23-report.md

# S23 · The Compat Guard That Passed — Silent-Failure Analysis

## 1. Silent-failure attribution

### Per-keystroke resolution path (plugin/src-client-index.ts)

The capture-phase `keydown` listener (`onKeyDown`) filters the chord (Ctrl, ArrowUp/ArrowDown, not composing, composer target) and then calls `resolve()`:

```ts
const id = sessions.list.getSnapshot().current          // (A)
if (id === undefined) return null                        // (B)  <-- exits here on alpha.2
...
const actx = sessions.scope(id)                          // (C)
if (actx === undefined) return null
const conversation = actx.get('conversation') as IConversation | undefined
if (conversation === undefined) return null
...
```

**The exact read that now fails is (A): `sessions.list.getSnapshot().current`.** On
0.1.6-alpha.2 the global snapshot type changed from `SessionListState { byId, current }`
to `SessionListSnapshot { items, state, phase, error, subagentsByParent, jobsBySession }` —
the `current` field was **removed**, not renamed or moved. Reading a missing property in
JS yields `undefined`, so `id === undefined` is always true and `resolve()` returns
`null` at (B) on every keystroke, before `sessions.scope(id)` is ever reached. The
handler then executes `if (resolved === null) return` — before `preventDefault`/`stopPropagation`
— so the chord is not even swallowed (matching the maintainer's observation that
composer multi-line cursor movement still works).

### Why nothing surfaces

- **No console error**: property access on a defined object never throws;
  `sessions.list` itself is still a live observable, it just publishes the new shape.
  `undefined.current` would throw, but this is `snapshot.current` on a valid snapshot.
- **Silent no-op, not an exception**: the plugin deliberately treats every
  resolution failure as `return null` + early `return`. That design (correct for
  "no session bound yet") now absorbs a *permanent* schema change because the
  alpha.2 snapshot legitimately always yields `undefined` for `.current`.
- **Compat guard passes**: the guard probes *presence* of four members —
  `sessions.list`, `sessions.scope`, `sessions.sessionOf`, `uiConversation.binding`.
  All four still exist in alpha.2 (the excerpt notes `scope(id)` "still exists on
  ISessions at alpha.2"). The breakage is **field-level** (a property inside the
  snapshot value), not service-level, so presence checks cannot see it.

### Which earlier suspicion this settles

- **Settles tried-list item 2 / the colleague's note**: it is *not* a missing slot
  re-registration or a failing activation — the plugin activates fine; the guard's
  four probes genuinely exist. Adding `'uiSession'` to inject alone would not fix
  anything without rewriting `resolve()`, but the colleague's instinct ("APIs and
  slots changed") points at the right subsystem.
- **Settles item 1 (clean console)** and **item 6 (chord not taken)**: fully
  explained by the silent `null` path.
- **Does not address items 3/4/5** (junction, other plugins, update chip): those
  were already non-causes; this analysis neither confirms nor refutes anything about
  packaging — it shows the bug is in the plugin's data read, not its delivery.

## 2. Evidence mapping

### Snapshot change (session-list-alpha1.d.ts → session-list-alpha2.d.ts)

| | alpha.1 `SessionListState` | alpha.2 `SessionListSnapshot` |
|---|---|---|
| current session | `current: SessionId \| undefined` | **gone** |
| session set | `byId` record | `items: readonly SessionListEntry[]` |
| other fields | — | `state/phase/error/subagentsByParent/jobsBySession` |

Implication: on alpha.2 `sessions.list.getSnapshot().current` is `undefined` on
**every** keystroke regardless of which session is open. The plugin's resolution is
dead at its first line; everything downstream (`scope`, `conversation`, `binding`) is
unreachable. The alpha.2 type even comments "navigation belongs to view owners" —
current-session selection moved out of the sessions controller into the UI layer.

### Canonical replacement (ui-session-service-alpha2.d.ts)

- **Service**: `UiSession` from `@deepseek-ai/dsh-client-ui-session`, inject name **`uiSession`**.
- **Observable**: `uiSession.adapter.current` — `ObservableSnapshot<SessionBindingValue>`,
  "binding source of the main view's current session".
- **Value shape** (`SessionBindingValue`):
  - `key: SessionId` — the bound session id (replaces `snapshot.current`; it is
    `undefined` for the absent binding while no main session is retained, which
    preserves the plugin's "no session → null" branch);
  - `ctx: Context` — **the session-scoped context; this is the field that replaces
    `sessions.scope(id)`** for resolving session-scoped services such as
    `conversation`;
  - `hooks / keyedHooks / props` — contributions from `provide()` descriptors.

## 3. Migration recipe

Dual-host resolution function (one build, works on alpha.1 and alpha.2):

```ts
const resolve = (): ResolvedSession | null => {
  // Prefer the alpha.2 ui-session binding when the host provides it.
  const uiSession = (ctx as any).uiSession as
    | { adapter?: { current?: { getSnapshot(): SessionBindingValue | undefined } } }
    | undefined
  const binding = uiSession?.adapter?.current?.getSnapshot?.()
  if (binding !== undefined) {
    // alpha.2 path: absent binding publishes key === undefined.
    if (binding.key === undefined || binding.ctx === undefined) return null
    const id = binding.key
    if (id !== lastSessionId) { browse = IDLE; lastSessionId = id }
    const actx = binding.ctx                       // replaces sessions.scope(id)
    const conversation = actx.get('conversation') as IConversation | undefined
    if (conversation === undefined) return null
    const chat = ctx.uiConversation.binding(id).snapshot.getSnapshot().views.get('chat')
    const nodes = chat === undefined ? EMPTY_NODES : chat.legacy.nodes
    return { input: conversation.input.for(actx), nodes }
  }
  // alpha.1 fallback: legacy snapshot field + legacy scope().
  const legacy = sessions.list.getSnapshot() as { current?: string }
  const id = legacy.current
  if (id === undefined) return null
  if (id !== lastSessionId) { browse = IDLE; lastSessionId = id }
  const actx = sessions.scope(id)
  if (actx === undefined) return null
  const conversation = actx.get('conversation') as IConversation | undefined
  if (conversation === undefined) return null
  const chat = ctx.uiConversation.binding(id).snapshot.getSnapshot().views.get('chat')
  const nodes = chat === undefined ? EMPTY_NODES : chat.legacy.nodes
  return { input: conversation.input.for(actx), nodes }
}
```

Detection is by **capability** (`uiSession.adapter.current` exists and yields a
binding value), not by version sniffing, so the same bundle runs on both hosts.

### inject change

`inject` becomes `['sessions', 'uiConversation', 'conversation', 'uiSession']`.
Because inject entries are hard requirements, the plugin must either (a) ship this
as the alpha.2-targeted version and keep an alpha.1 build for older hosts, or
(b) avoid hard-injecting `uiSession` and resolve it optionally
(`ctx.get?.('uiSession')` / probing `ctx.uiSession` inside apply, as the code
above does) so activation does not fail on alpha.1. Option (b) is what makes
"one build on both hosts" possible with Cordis-style inject semantics.

### How the session-scoped context reaches conversation

`SessionBindingValue.ctx` **is** the session scope: "services registered under
this session resolve here." So `conversation` is obtained with
`binding.ctx.get('conversation')` and the input facade with
`conversation.input.for(binding.ctx)` — no `sessions.scope(id)` call at all on
alpha.2.

## 4. Guard hardening

### The blind spot

Presence checks (`ctx?.sessions?.list !== undefined`) verify that a *service member
exists*, not that the *data it yields keeps its shape*. They cannot catch:

- field removal/rename inside snapshot values (this bug: `current` gone),
- field type changes (string → object), observable payload re-shape,
- behavioral changes (snapshot present but never updating, scope returning a
  differently-populated context).

Any break below the top-level member boundary is invisible to a presence guard.

### Hardened guard

Probe **values, not presence**: actually read what the plugin depends on and
assert the shape.

- Instead of checking `sessions.list` exists, take one snapshot and check the
  specific capability: *either* `'current' in snapshot` (alpha.1) *or* a working
  `uiSession.adapter.current.getSnapshot()` whose value has `key` and `ctx`
  (alpha.2). If neither capability is present, show the banner.
- Likewise probe that a resolved scope actually yields `actx.get('conversation')`
  with an `input` facade, rather than checking `sessions.scope` is a function.

**Lifecycle point**: the probe must run **at activation, before `applyBody`
subscribes the listener, and after the services are live enough to produce a
first snapshot** — i.e. inside the same guarded thunk but performing a real
`getSnapshot()`/scope resolution (possibly deferred one tick or run inside the
first `ctx.effect` so observables have published). A pure synchronous
property-existence test at module scope runs too early and tests too shallowly;
the snapshot must be sampled at least once to distinguish "host compatible" from
"host renamed the field". On probe failure, render the same remediation banner
instead of silently installing the dead listener.

## 5. Verification and prevention

### Verifying the fix on both hosts without a full migration

- **alpha.2**: run the fixed build, focus the composer, press Ctrl+Up after sending
  a message — the draft must populate; Ctrl+Down walks forward. Instrument once:
  temporarily log `uiSession.adapter.current.getSnapshot()` and confirm
  `key`/`ctx` are defined and `resolve()` no longer returns `null`.
- **alpha.1**: install the same build (optional `uiSession` resolution path),
  confirm the fallback branch executes (log which branch ran), and repeat the
  recall walk.
- Cheap harness without two installs: a tiny browser stub test that feeds
  `resolve()` (a) an object exposing only the alpha.2 `uiSession` shape and
  (b) an object exposing only the alpha.1 `list{current}` + `scope` shape, and
  asserts both produce a non-null `ResolvedSession`. This is pure logic — no
  host needed.
- Also verify the degraded case: absent binding (`key === undefined`) must leave
  the chord untouched (no preventDefault) so the composer cursor still moves.

### Single host-side change that would have made this loud

**Keep a deprecated alias and make it fail loudly**: in alpha.2's
`SessionListSnapshot`, keep `current` as a deprecated accessor that
`console.warn`s (or throws in dev) with "moved to uiSession.adapter.current" —
or, cleaner at the type level, keep the field declared as `@deprecated` **and**
have the runtime publish a getter that logs once per client. Either way, plugin
activation/first keystroke produces a visible, actionable message instead of a
permanent `undefined`. Even simpler: shipping an explicit `@deprecated current`
in the .d.ts would have flagged the removal at the plugin's next typecheck/build.
The core principle: *field removals on public snapshot types must go through a
deprecated-and-noisy phase, not a silent delete.*


## Required output (JSON only)
{"decisions":[{"id":"<criterion-id>","verdict":"pass|partial|fail|missing","reason":"short"}],"caps":[{"id":"<cap-id>","triggered":false,"reason":"short"}]}
Every criterion and cap exactly once. pass=full points, partial=half, fail/missing=0; a triggered cap caps the total.