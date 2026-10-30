# JUDGE BRIEF · skill.S23-passing-compat-guard-trap

## Criteria (sealed rubric)
- [silent-break-attribution] (20pt) Walk resolve() in plugin/src-client-index.ts: sessions.list.getSnapshot() succeeds but the published snapshot no longer carries current, so id is undefined and the function returns null on every keystroke; onKeyDown then exits before preventDefault. Explain both silences: the four presence probes in the compat guard all survive (the service, its members, even the observable exist — only a field inside the published value is gone), and undefined was a legitimate no-session state the code deliberately ignores quietly. Do not claim the sessions service or the guard itself was removed, renamed, or throws.
- [evidence-mapping] (20pt) From session-list-alpha1.d.ts vs session-list-alpha2.d.ts: SessionListState.current is gone and navigation moved to view owners (ISessions.list doc comment). From ui-session-service-alpha2.d.ts: the canonical replacement is the uiSession service — adapter.current (ObservableSnapshot<SessionBindingValue>) yielding { key, ctx, hooks, keyedHooks, props }, where key replaces current and ctx is the session-scoped context replacing sessions.scope(id). Mapping to card DSH-0.1.6-A2-01 is creditable; the card alone without the type-walk earns partial at most.
- [dual-host-migration] (20pt) Propose a corrected resolution: read ctx.uiSession.adapter.current.getSnapshot() when the service exists, fall back to the legacy current field plus sessions.scope otherwise, from one build; inject gains uiSession; the conversation service resolves through the binding value ctx (scope.get('conversation')), and input.for receives that scope. Accept equivalent shapes and guard order. A recipe that only works on alpha.2 (no fallback) or that keeps reading the removed field earns partial; re-registering slots or merely re-declaring inject without the code change earns zero.
- [guard-hardening] (20pt) Name the breakage class the shipped guard cannot catch: field-level removal behind service-level stability, checked once at activation while the break recurs per use. Specify a hardened guard that probes the actual capability (assert the specific snapshot field on alpha-1-shaped hosts and/or feature-detect uiSession on alpha-2-shaped hosts) and note the probe must run lazily or per-use, not only at activation. Presence-list expansion alone is insufficient.
- [verification-and-prevention] (20pt) Verify without a full migration: a temporary probe of adapter.current key with one session open, chord behavior after the code change on both hosts, and typecheck against alpha.2 published types as the strongest pre-ship gate. Prevention: a removed public snapshot field should fail loud — a deprecated getter that throws/warns on read, or a runtime snapshot-shape contract guards can pin. Do not require executing this static fixture.

## Caps (score ceilings; judge returns each with triggered true/false)
- CAP [slot-reregistration-misdiagnosis] ceiling=40 The final remedy is only re-registering slots, re-declaring inject, or reinstalling the plugin — the colleague red herring — without the current-session code fix. Apply only to affirmative final advice or conclusions. Quoted, hypothetical or explicitly rejected bad examples do not trigger the cap; read the whole report.

## Candidate report(s)
#### FILE: S23-passing-compat-guard-trap/report.md

# S23 · The Compat Guard That Passed — Failure Attribution & Migration

Scope: read-only analysis. Fixture unchanged. Evidence pack: `fixture/`, skill reference
`references/v0.1.6-alpha.2.md` (card **DSH-0.1.6-A2-01** is the authoritative match for this
exact failure; key points cited below, full card text not reproduced).

---

## 1. Silent-failure attribution

**The exact read that now fails** is the first line of `resolve()` in
`plugin/src-client-index.ts`:

```ts
const id = sessions.list.getSnapshot().current
```

Per-keystroke path: `onKeyDown` → filter (Ctrl, not Alt/Meta, ArrowUp/Down, not composing,
`isComposerTarget`) → `resolve()` → read `.current` → `if (id === undefined) return null`
→ handler returns **before** `preventDefault()`/setDraft, so the chord is neither handled nor
swallowed. On alpha.2 the snapshot object has no `current` property, so the read yields
`undefined`, `resolve()` returns `null`, and `onKeyDown` bails silently. (This is also why
the composer's own multi-line cursor movement still works — the plugin never calls
`preventDefault`.)

**Why nothing surfaces anywhere:**

- *Why the guard passes.* The shipped guard probes only four **service members** —
  `sessions.list`, `sessions.scope`, `sessions.sessionOf`, `uiConversation.binding` — all of
  which still exist on alpha.2. It is a presence check, not a shape check: it never inspects the
  *shape* of `sessions.list.getSnapshot()`, so it cannot see that a nested field
  (`SessionListState.current`) was removed.
- *Why there is no console error.* Accessing a missing property on a live JS snapshot object
  returns `undefined`; it does not throw. The plugin is a prebuilt bundle compiled against the
  alpha.1 declarations, and at runtime the TS-level "Property 'current' does not exist" never
  occurs — plain JS just reads `undefined`.
- *Why the failure is a silent no-op, not a throw.* The very next statement is a defensive
  `if (id === undefined) return null`, an early bail that converts the missing field into a
  clean null. That is the trap: the code was written to tolerate "no session open," and the
  removed field is indistinguishable from "no session open."

**Already-tried list — settled vs. not addressed.** This reading *settles* suspicion **#2**
("compat banner not showing"): the guard passing is fully explained — it checks service presence,
which is intact. It also *explains* **#1** (console clean): nothing throws, nothing logs, nothing
takes the banner branch. It does **not address #5** ("update chip says latest"): being on the
latest plugin release is a distribution/version-coordinate fact, not a compatibility fact — the
plugin is simply the newest release and that release is alpha.2-incompatible; the reading says
nothing about whether a compatible release exists. (#3 relink and #4 disable-others are negative
rule-outs, consistent with the reading but not resolved by it.)

## 2. Evidence mapping

**What changed in the snapshot the plugin reads** (the two session-controller excerpts):

- alpha.1 `SessionListState` = `{ byId: Record<SessionId, SessionSummary>; current: SessionId | undefined }`.
- alpha.2 `SessionListSnapshot` = `{ items: readonly SessionListEntry[]; state: 'idle'|'loading'|'error'; phase; error; subagentsByParent; jobsBySession }`.

`current` was **removed outright** (and the snapshot was reshaped: `byId` record → `items`
array, plus phase/error/jobs). Session ownership became per-source reference counts, and
"current" now means main-view occupancy (a row with `retainedBy.mainView > 0`).

**Implication for the value on every keystroke:** `sessions.list.getSnapshot().current` returns
`undefined` unconditionally on alpha.2, so `resolve()` returns `null` on every chord and the
handler no-ops.

**Canonical replacement read** (from `ui-session-service-alpha2.d.ts`): the service is
**`UiSession`** (inject name `uiSession`), shipped by `@deepseek-ai/dsh-client-ui-session`. The
observable it exposes is **`adapter.current`**, typed
`ObservableSnapshot<SessionBindingValue>` — "Binding source of the main view's current session."
The value it yields is **`SessionBindingValue`**:

```ts
{ key: SessionId; ctx: Context; hooks; keyedHooks; props }
// key of the absent binding is undefined
```

The field that **replaces `sessions.scope(id)`** for session-scoped service resolution is
**`ctx`** — the session-scoped context in which per-session services (e.g. `conversation`)
resolve. (`key` replaces `SessionListState.current` as the current/main-session id.)

## 3. Migration recipe

The public dual-host path is the slot-scope adapter `uiSession.adapter.current.getSnapshot()`
(registered by `@deepseek-ai/dsh-client-ui-session` on **both** tags — alpha.1 `ui-approval`
already injects it). Primary path uses the binding; a legacy fallback keeps alpha.1 hosts (and
any host without `uiSession`) working via `current` + `sessions.scope`. One build serves both.

```ts
import type { Context as ClientContext, Context } from '@deepseek-ai/cordis'
import type { ISessions } from '@deepseek-ai/dsh-api-session-controller/client'
import type { UiSession } from '@deepseek-ai/dsh-client-ui-session/client'
import type {
  ConversationNode, IConversation, SessionInput,
} from '@deepseek-ai/dsh-client-ui-conversation/client'

export const name = 'dsh-input-history'

// inject gains 'uiSession'
export const inject = ['sessions', 'uiConversation', 'conversation', 'uiSession']

interface ResolvedSession {
  readonly input: SessionInput
  readonly nodes: readonly ConversationNode[]
}
const EMPTY_NODES: readonly ConversationNode[] = []

function resolve(ctx: ClientContext): ResolvedSession | null {
  const sessions: ISessions = ctx.sessions
  const uiSession = ctx.uiSession as UiSession | undefined

  let id: string | undefined
  let actx: Context | undefined

  // Preferred: main-view binding (alpha.2, and already present on alpha.1).
  const binding = uiSession?.adapter?.current?.getSnapshot?.()
  if (binding && binding.key !== undefined) {
    id = binding.key
    actx = binding.ctx            // session-scoped context (replaces sessions.scope(id))
  } else {
    // Legacy: alpha.1 list snapshot still carried `current`.
    const snapshot = sessions.list.getSnapshot() as { current?: string } | undefined
    id = snapshot?.current
    actx = id === undefined ? undefined : sessions.scope(id)
  }

  if (id === undefined) return null
  if (id !== lastSessionId) { browse = IDLE; lastSessionId = id }

  actx = actx ?? sessions.scope(id)
  if (actx === undefined) return null

  const conversation = actx.get('conversation') as IConversation | undefined
  if (conversation === undefined) return null

  const chat = ctx.uiConversation.binding(id).snapshot.getSnapshot().views.get('chat')
  const nodes = chat === undefined ? EMPTY_NODES : chat.legacy.nodes
  return { input: conversation.input.for(actx), nodes }
}
```

**What must change in `inject`:** add `'uiSession'` to the inject array, so `ctx.uiSession` is
populated. **How the session-scoped context reaches the conversation service:** through
`SessionBindingValue.ctx` — the binding materializes the per-session `Context`, and
`ctx.get('conversation')` resolves the `IConversation` inside that scope, exactly as
`sessions.scope(id)` did before; the legacy branch keeps using `sessions.scope(id)`.

## 4. Guard hardening

**Class of breakage presence-checks cannot catch.** The shipped guard verifies that four service
members are truthy; it cannot detect a **field-level / shape-level removal** — a service and its
methods all still exist while a nested field on the returned snapshot (`SessionListState.current`)
is silently gone. Presence checks assert "the door is there," not "the room behind it has the
furniture I need." Any removal below the probed surface (a snapshot field, a view entry, a union
member, a renamed hook) passes a presence guard and fails only as a silent `undefined` read.

**Hardened guard.** Probe the *resolved value*, not service presence:

1. *Shape probe* (session-count independent, so it is safe at activation): assert the field
   exists as an own/enumerable property, not that it is non-undefined —
   `Object.prototype.hasOwnProperty.call(sessions.list.getSnapshot(), 'current')` — and/or assert
   the canonical replacement is available, i.e. `ctx.uiSession?.adapter?.current?.getSnapshot`
   is a function returning a value with a `key` field. `hasOwnProperty` distinguishes
   "field removed" (fails loudly) from "field present but no session open" (passes; legitimate).
2. *Equivalence probe* (needs a session, so run lazily): when a session is open, assert the
   resolved id equals the open session id; log/console.error once if resolution returns
   `undefined` while a session is open — this catches any future silent `undefined`.

**Lifecycle point.** The presence/shape probe must run at **plugin activation** — inside
`apply()`/the guard, before the keydown listener is wired — because that is where the
remediation banner is rendered and where a loud failure is visible immediately, rather than on
the Nth keystroke. The value-equivalence probe runs on first resolve (event-time), where a
session actually exists.

## 5. Verification and prevention

**Verifying the fix on both hosts without a full migration.** `uiSession` exists on both tags,
so the same build passes both:

1. *Static/mechanical:* extract `resolve()` as a pure function taking injected
   `{ sessions, uiSession, uiConversation }`; unit-test it against stubs built from both sealed
   excerpts — alpha.1 (legacy `current` + `scope`) and alpha.2 (`adapter.current` binding with
   `key`/`ctx`) — asserting it returns the open session id in both, switches id on
   main-view change, and returns `null` (not throw) with no session. Typecheck once against
   alpha.1 types and once against alpha.2 types (`skipLibCheck: false`) to prove no
   field-reference residue.
2. *Runtime:* run the skill's `scripts/verify-runtime.mjs` offline contract checker on an
   isolated profile per host to prove `uiSession` resolves and no required service stays pending;
   then one real mount smoke test per host: execute the Ctrl+Up path and assert
   `input.setDraft` is called with the recalled text (message → recall → draft set), plus a
   no-session case returning `null` without a throw.

**Single host-side change that would have made this loud.** In the service/types, do not silently
delete `SessionListState.current`: mark it `@deprecated` in the declaration **and** replace the
plain data field with an accessor (getter/Proxy) that emits a one-shot
`console.warn('[dsh] SessionListState.current is deprecated — use uiSession.adapter.current')`
while still returning the main-view id (computed from `retainedBy.mainView`). Any plugin that
reads `current` then surfaces a warning at its first read (which a hardened guard can turn into
a banner at activation), and recompiling authors get a static deprecation diagnostic from
TypeScript — converting the silent field-level removal into a loud, attributable signal instead
of an `undefined` no-op.

## Required output (JSON only)
{"decisions":[{"id":"<criterion-id>","verdict":"pass|partial|fail|missing","reason":"short"}],"caps":[{"id":"<cap-id>","triggered":false,"reason":"short"}]}
Every criterion and cap exactly once. pass=full points, partial=half, fail/missing=0; a triggered cap caps the total.