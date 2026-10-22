# S23 - The Compat Guard That Passed: silent-failure attribution and dual-host migration

**Task:** diagnose why a composer input-recall plugin (Ctrl+Up / Ctrl+Down) stopped working after an
in-place host upgrade dsh-v0.1.6-alpha.1 -> dsh-v0.1.6-alpha.2, with no error, no banner, and a
passing compatibility guard.

**Mode:** read-only diagnosis plus a migration recipe (skill: plugin-upgrade). Nothing under
`/app/fixture/` was modified; no host upgrade, install, or migration was executed. Every finding below
comes from the sealed fixture pack plus the bundled skill references (cards DSH-0.1.6-A2-01,
DSH-0.1.2-A1-27, DSH-0.1.6-A2-04, API-10).

**Fixture identity**

| Artifact | Role |
|---|---|
| fixture/symptom-report.md | maintainer bug report (silent failure, console clean, guard passed) |
| fixture/plugin/src-client-index.ts | the plugin client entry: guard + per-keystroke resolution |
| fixture/host-types/session-list-alpha1.d.ts | ISessions / SessionListState at alpha.1 |
| fixture/host-types/session-list-alpha2.d.ts | ISessions / SessionListSnapshot at alpha.2 |
| fixture/host-types/ui-session-service-alpha2.d.ts | new UiSession client service (alpha.2) |
| fixture/upgrade-notes.txt | release-note excerpt, boot log excerpt, already-tried list, colleague note |

---

## 1 - Silent-failure attribution

### 1.1 The per-keystroke resolution path, step by step

The plugin captures `keydown` at the document level (`window.addEventListener('keydown', onKeyDown, true)`,
registered inside `ctx.effect`) and, on every chord press, runs `resolve()`
(`fixture/plugin/src-client-index.ts:33-48`):

```ts
const resolve = (): ResolvedSession | null => {
  const id = sessions.list.getSnapshot().current     // <- line 34 : THE FAILING READ
  if (id === undefined) return null                    // <- line 35 : silent early return
  if (id !== lastSessionId) { browse = IDLE; lastSessionId = id }
  const actx = sessions.scope(id)                      // <- line 41 : never reached on alpha.2
  if (actx === undefined) return null
  const conversation = actx.get('conversation') as IConversation | undefined   // line 43
  if (conversation === undefined) return null
  const chat = ctx.uiConversation.binding(id).snapshot.getSnapshot().views.get('chat')  // line 45
  const nodes = chat === undefined ? EMPTY_NODES : chat.legacy.nodes
  return { input: conversation.input.for(actx), nodes }
}
```

**The exact read that now fails: `sessions.list.getSnapshot().current` - the `current` property of
the value returned by the session-controller list snapshot** (`src-client-index.ts:34`).

It is not `sessions.scope`, not `uiConversation.binding`, not `conversation.input.for`, and not the
keyboard listener itself. On alpha.2 the list snapshot object simply has **no `current` property**, so
the read yields `undefined`, the `id === undefined` branch returns `null`, and `onKeyDown` returns at
line 56 - **before** `e.preventDefault()` / `e.stopPropagation()` (lines 61-62).

That single fact explains every symptom the maintainer reported:

| Reported symptom | Produced by |
|---|---|
| "the chord is not swallowed either" | the handler returns at line 56, before `preventDefault()`; the composer's own cursor movement still runs |
| "no text appears, no toast" | `resolved === null` -> nothing is written into the composer |
| "the capture listener is either not firing or firing and bailing out" | it is **firing and bailing out** - the listener is registered unconditionally by `ctx.effect`, and nothing about the host change can unregister it |
| "the plugin worked perfectly on alpha.1" | on alpha.1 the snapshot still carries `current`, so `id` is the main-view session id and the whole path completes |
| "every other plugin works" | only consumers of *this* field break; the removal is silent for every other plugin |

### 1.2 Why the compat guard passes

The shipped guard checks **four service members' presence** (`src-client-index.ts:83-88`):

```ts
['sessions.list', ctx?.sessions?.list],
['sessions.scope', ctx?.sessions?.scope],
['sessions.sessionOf', ctx?.sessions?.sessionOf],
['uiConversation.binding', ctx?.uiConversation?.binding],
```

Every one of those four is a **two-level** surface: service object -> member. The alpha.2 break is a
**three-level** surface: service object -> member (`list`) -> the value it returns
(`SessionListSnapshot`) -> field (`current`). The guard never calls `getSnapshot()`, so it never
touches the level that changed.

Corroboration from the fixture itself: the alpha.2 excerpt states that `scope(id)` **still exists** on
`ISessions` at alpha.2 (it is merely omitted from the excerpt). And the fact that the maintainer saw
**no banner** is itself evidence that `ctx.sessions.list`, `ctx.sessions.scope`,
`ctx.sessions.sessionOf` and `ctx.uiConversation.binding` all still exist on alpha.2 - i.e. the
guard's pass is true about the *service surface* and blind about the *value surface*. That is
exactly the trap: a presence guard reports "compatible" for a host that removed the data the
plugin consumes.

Two aggravating details:

* the guard reads its subjects with optional chaining (`ctx?.sessions?.list`), so even a genuinely
  missing service would not throw inside the guard - it would just feed `undefined` into the banner
  decision;
* the guard runs **once, at activation**, while the broken read happens **per keystroke**. Even a
  value-aware guard at activation is only as good as the contract it probes (see section 4).

### 1.3 Why there is no console error

* **JavaScript semantics:** reading a non-existent property of a plain object returns `undefined`;
  it does not throw. `SessionListSnapshot` is a plain snapshot object - there is no accessor, Proxy,
  or brand check that could fail.
* **The plugin converts it into a designed no-op:** `if (id === undefined) return null` is written as
  "no session is open". The code cannot distinguish *"there is no current session"* from *"the host
  no longer publishes a current session"*, so it silently takes the benign branch. The same
  `undefined -> null -> return` pattern is repeated three times (lines 35, 42, 44), so every
  possible failure inside `resolve()` degrades into silence rather than an error.
* **Nothing logs:** the plugin never writes to `console` on this path, and `applyWithCompat` only
  renders the banner when its four presence probes fail.
* **The type system was not a backstop:** the plugin compiles against the **alpha.1** declarations of
  `@deepseek-ai/dsh-api-session-controller/client`. In that declaration `current` exists, so
  `sessions.list.getSnapshot().current` type-checks cleanly. Type declarations and runtime
  activation are separate planes - the skill's precision checklist makes the same point for other
  releases ("typecheck is silent about this" in the alpha.2 Markdown-label card).

### 1.4 Why the failure mode is a silent no-op rather than a thrown exception

The removal is *value-level*, not *service-level*, and the plugin's own defensive coding turns a
missing value into an early `return null`. Three properties compose into the silence:

1. **No throw site exists.** The only throw-like path would be an exception from a host accessor;
   there is none - `current` is simply absent.
2. **The consumer treats absence as a normal state.** `undefined` is the plugin's own sentinel for
   "nothing to recall", so the state is indistinguishable from a legitimate no-op.
3. **The failure happens below the plugin's activation-time contract.** The guard observes the
   service graph; the break is in a value the service returns. Activation succeeds; the failure
   only materialises per keystroke, where nothing is logged and nothing is thrown.

### 1.5 What the reading settles - and what it does not

**Settles**

* **Already-tried #2 ("compat banner not showing / guard passed").** The banner's absence is a *false
  negative*: the host is genuinely missing the field the plugin needs, and the guard is structurally
  incapable of seeing that. After this reading, "no banner" must be re-read as "the guard is too
  shallow", not as "the plugin is compatible".
* **Already-tried #3 and #5 (re-link the junction + hard refresh; plugin already latest).** These
  cannot help, and now for a stated reason: the shipped artifact is *correct for alpha.1*;
  re-deploying it on alpha.2 reproduces the identical break. The bug lives in the plugin's read of
  host data, not in the install topology or the plugin's own version.
* **Already-tried #6 (chords not taken by anything else).** Combined with the reading, this localises
  the failure *inside this plugin's own handler* - no peer plugin, no other handler, no stale bundle.
  It is the last piece needed for full attribution.
* **The report's own dichotomy** ("the capture listener is either not firing or firing and bailing
  out") resolves to **firing and bailing out** at `src-client-index.ts:35`.
* **The colleague's note, first half:** "maybe your plugin needs to re-register its slot" is *not
  applicable*. The plugin registers no slot; it binds a document-level `keydown` listener through
  `ctx.effect`. Per card **DSH-0.1.6-A2-01**, slot components with session scope are unaffected by
  this change - they receive session context through their Provider. The slot-re-registration
  hypothesis is ruled out.

**Does not address**

* **Already-tried #1 (console clean) and #4 (disabling all other plugins)** are observations of
  *absence*. They never narrowed the search: nothing in the tried list could distinguish *"the API is
  missing"* (a service-level removal - the guard **would** have fired) from *"the field inside the
  value is missing"* (a value-level removal - the guard **cannot** fire). This reading is what closes
  that gap: the break is value-level.
* **The colleague's note, second half** ("try adding `uiSession` to the inject list") is
  *directionally right but insufficient*. Adding `uiSession` to `inject` without changing the read
  leaves the plugin just as broken, because the failing read is still
  `sessions.list.getSnapshot().current`. Worse, on a host that lacks the service, adding it to
  `inject` can keep the plugin from activating at all - which would suppress the guard's banner
  path entirely. The inject change and the read change must land together (section 3).
* **A second, still-open risk of the same class:** `chat.legacy.nodes` (line 46). The fixture contains
  no alpha.2 ui-chat snapshot type, so whether the legacy array is still populated on alpha.2 is
  **unconfirmed from the fixture**. Per API-10 in the skill's alpha.2 ledger,
  `snapshot.legacy.nodes` is a staged-compatibility surface for an explicit dual-host requirement -
  legitimate here, but it should be re-checked *after* the primary fix, because it is the next
  candidate for the same kind of silent no-op (history list empty -> recall finds nothing).

---

## 2 - Evidence mapping

### 2.1 What changed in the snapshot the plugin reads

| | alpha.1 | alpha.2 |
|---|---|---|
| Interface name | `SessionListState` | `SessionListSnapshot` |
| `ISessions.list` type | `ObservableSnapshot<SessionListState>` | `ObservableSnapshot<SessionListSnapshot>` |
| Identity of sessions | `byId: Readonly<Record<SessionId, SessionSummary>>` | `items: readonly SessionListEntry[]` (array, not a map) |
| **The session the main view is bound to** | `current: SessionId \| undefined` | **field absent - no `current` in the interface at all** |
| Lifecycle / catalog additions | - | `state: 'idle' \| 'loading' \| 'error'`, `phase: SessionListPhase`, `error: RemoteFailure \| null`, `subagentsByParent`, `jobsBySession` |
| Documented intent | "Global session-list state published by the sessions controller" | "Host catalog and local reference-source counts; **navigation belongs to view owners**" |

Two things changed, and only one of them matters to this plugin:

1. **The snapshot was re-shaped:** `SessionListState` -> `SessionListSnapshot`, `byId` map -> `items`
   array, plus new lifecycle/catalog fields. The plugin never read `byId`, so this part of the change
   is inert for it.
2. **`current` was removed outright** - not renamed, not relocated within `list`. The rationale
   recorded in card **DSH-0.1.6-A2-01** is the multi-instance Session-reference refactor: session
   ownership becomes per-source reference counts, "current" becomes *main-view occupancy* rather
   than a single global pointer, and the list is demoted to a **catalog** - "navigation belongs to
   view owners".

**What the plugin now receives on every keystroke:** `sessions.list.getSnapshot()` returns a
`SessionListSnapshot` - an object carrying `items/state/phase/error/subagentsByParent/jobsBySession`
and **no `current`**. The property read at line 34 therefore evaluates to `undefined` on **every**
keystroke, regardless of which session is open, whether one is open at all, or how the main view is
navigated. The plugin is permanently in its "no current session" branch: `resolve()` always returns
`null`, the session-switch reset of `browse`/`lastSessionId` never runs, and `sessions.scope(id)` is
never called. The plugin remains *activated* while being *permanently inert*.

### 2.2 The canonical replacement read (from the new-service excerpt)

**Service:** `UiSession` - the root service exported by the
**`@deepseek-ai/dsh-client-ui-session`** client bundle. Its inject name is **`uiSession`**
(`ctx.uiSession`). It is described as the "Root service owning per-Session bindings and the
main-view selection".

**Observable it exposes:** `UiSession.adapter.current: ObservableSnapshot<SessionBindingValue>` -
"Binding source of the main view's current session". (Sibling surfaces:
`adapter.bindingSource(target)` and `sourceFor(owner)`, plus `provide(descriptor)` for registering
per-session hook/prop contributions.)

**Shape of the value it yields - `SessionBindingValue`:**

| Field | Type | Meaning / role in this migration |
|---|---|---|
| `key` | `SessionId` | **the bound session's id - the replacement for `sessions.list.getSnapshot().current`** |
| `ctx` | `Context` | **the session-scoped context: "services registered under this session resolve here" - the replacement for `sessions.scope(id)`** |
| `hooks` | `Record<string, unknown>` | standard hooks contributed by `provide()` descriptors for this binding |
| `keyedHooks` | `Record<string, Record<string, unknown>>` | per-key hook contributions |
| `props` | `Record<string, unknown>` | per-binding props |

Two operational details from the excerpt matter for the code:

* **The absent binding is representable:** "SessionBindingValue.key of the absent binding is
  undefined; the service publishes the absent value while no main session is retained." So
  `key === undefined` is the legitimate "no session open" signal - exactly the semantic the plugin's
  `id === undefined` check was written for, and the bridge that makes one code path serve both hosts.
* **`ctx` travels with the binding.** Card DSH-0.1.6-A2-01 records that `uiSession` is *not new*: it
  is registered by `@deepseek-ai/dsh-client-ui-session` on **both** hosts, and the public
  slot-scope adapter path `ctx.uiSession.adapter.current.getSnapshot()` works on both tags - the
  *private* field that held the current binding differs per host (`private currentBinding` on
  alpha.1, `private readonly current` on alpha.2), which is exactly why the plugin could never have
  read it directly.

**Alternative read (alpha.2-only) - marked partially unconfirmed:** the card also notes that on
alpha.2 the same fact can be derived from the catalog as the row whose `retainedBy.mainView` count
is positive. The fixture's alpha.2 excerpt shows `items: readonly SessionListEntry[]` and **no
`byId`** on the snapshot, while the card's wording refers to `sessions.list.getSnapshot().byId`. The
`retainedBy.mainView` route therefore **cannot be fully pinned from the fixture** - treat it as
alpha.2-only, shape-unconfirmed, and prefer the `uiSession.adapter.current` path, which the card
states works on both tags.
---

## 3 - Migration recipe (one build, two hosts)

### 3.1 The corrected resolution function

Dual-host strategy: **prefer the new service, fall back to the legacy field.** The branch is chosen
by *capability* (does the host expose a binding?), never by a version string - consistent with the
skill's dual-cohort discipline (`examples/04-dual-cohort-plugin.md`: prefer a verified call-superset
or an explicit adapter over version parsing).

```ts
import type { Context, Context as ClientContext } from '@deepseek-ai/cordis'
import type { ISessions } from '@deepseek-ai/dsh-api-session-controller/client'
import type {
  ConversationNode, IConversation, SessionInput,
} from '@deepseek-ai/dsh-client-ui-conversation/client'
import type {} from '@deepseek-ai/dsh-client-ui-chat/client'
// Type-only import that activates the ctx.uiSession Context augmentation:
import type {} from '@deepseek-ai/dsh-client-ui-session/client'

export const inject = ['sessions', 'uiConversation', 'conversation', 'uiSession']

interface ResolvedSession {
  readonly id: string
  readonly ctx: Context          // the session-scoped context
  readonly input: SessionInput
  readonly nodes: readonly ConversationNode[]
}

const EMPTY_NODES: readonly ConversationNode[] = []

/**
 * Resolve the main view's session id + its session-scoped context on BOTH hosts.
 *
 * alpha.2 (primary): ctx.uiSession.adapter.current.getSnapshot()
 *   -> SessionBindingValue { key: SessionId, ctx: Context, hooks, keyedHooks, props }
 *      key === undefined  === "no main session retained"  (the absent binding)
 *      ctx               === the session-scoped ctx (replaces sessions.scope(id))
 *
 * alpha.1 (fallback): sessions.list.getSnapshot().current  (SessionListState.current)
 *      plus sessions.scope(id) for the session-scoped context.
 */
function resolveMainSession(ctx: ClientContext): { id: string; ctx: Context } | null {
  // ---- 1) New service path (alpha.2; also public on alpha.1) ------------------
  const binding = ctx.uiSession?.adapter?.current?.getSnapshot?.()
  if (binding !== undefined && binding !== null) {
    const key = binding.key
    if (typeof key === 'string' && key.length > 0) {
      // The binding carries the session-scoped ctx (alpha.2 SessionBindingValue.ctx).
      if (binding.ctx !== undefined) return { id: key, ctx: binding.ctx }
      // Defensive: a host may expose the binding without ctx -> fall back to scope().
      const scoped = ctx.sessions?.scope?.(key)
      if (scoped !== undefined) return { id: key, ctx: scoped }
    }
  }

  // ---- 2) Legacy path (alpha.1): the `current` field of the list snapshot -----
  const legacy = ctx.sessions?.list?.getSnapshot?.() as { current?: unknown } | undefined
  const legacyId = legacy?.current
  if (typeof legacyId !== 'string' || legacyId.length === 0) return null
  const scoped = ctx.sessions?.scope?.(legacyId)
  if (scoped === undefined) return null
  return { id: legacyId, ctx: scoped }
}

function applyBody(ctx: ClientContext): void {
  let browse: HistoryBrowse = IDLE
  let lastSessionId: string | undefined

  const resolve = (): ResolvedSession | null => {
    const main = resolveMainSession(ctx)
    if (main === null) return null
    const { id, ctx: actx } = main

    if (id !== lastSessionId) {
      // Session switch: recall must start fresh on the new session.
      browse = IDLE
      lastSessionId = id
    }

    // The session-scoped context resolves the session's own services.
    const conversation = actx.get('conversation') as IConversation | undefined
    if (conversation === undefined) return null

    const chat = ctx.uiConversation.binding(id).snapshot.getSnapshot().views.get('chat')
    const nodes = chat === undefined ? EMPTY_NODES : chat.legacy.nodes
    return { input: conversation.input.for(actx), nodes }
  }

  // onKeyDown and the ctx.effect listener registration stay identical to the excerpt.
}
```

Notes on why this shape is correct:

* the **session id** now comes from `binding.key` (new service) or `legacy.current` (legacy field) -
  the two are the same fact, read from the surface each host actually provides;
* the **session-scoped context** is `binding.ctx` on alpha.2 and `sessions.scope(id)` on alpha.1 - the
  *role* of `actx` is unchanged, only its origin moves;
* `actx.get('conversation')` and `conversation.input.for(actx)` keep their signatures: per card
  **DSH-0.1.2-A1-27** the input-machine face (`conversation.input.for(actx)` / `setDraft` /
  `state.getSnapshot().draft`) is unchanged, with the session binding's `ctx` used as `actx`;
* `binding.key === undefined` (the absent binding) maps onto the plugin's existing "no session"
  branch, so "no session open" stays a graceful no-op instead of becoming an error;
* the **only** behaviour change on alpha.2 is *where the id and the scope come from* - no change to
  the history state machine (`up`/`down`/`extractHistory`/`resync`) or to the DOM capture.

### 3.2 What must change in the plugin's `inject` declaration (and around it)

1. **`export const inject`** - add `'uiSession'`:

   ```ts
   export const inject = ['sessions', 'uiConversation', 'conversation', 'uiSession']
   ```

   Keep `'sessions'`: the alpha.1 fallback path still reads `sessions.list.getSnapshot().current` and
   `sessions.scope(id)`. Keep `'conversation'`: the plugin resolves it *inside* the session scope
   (`actx.get('conversation')`), and the root injection is what guarantees the service is provided in
   the session scope.
2. **Type-only augmentation import** - `import type {} from '@deepseek-ai/dsh-client-ui-session/client'`
   (the plugin already uses this pattern for `dsh-client-ui-chat/client`), so `ctx.uiSession` is
   typed. Without it, `ctx.uiSession` degrades to `any` or errors under `skipLibCheck: true`, and the
   skill's precision checklist treats a newly introduced implicit `any` as a migration failure.
3. **Direct dependency on the owning package** - `@deepseek-ai/dsh-client-ui-session` must be the
   plugin's own direct dependency (dev + peer), not a transitive one: the owner of any declaration the
   source imports must be a direct dependency of the plugin.
4. **Composition row** - the plugin's `dsh.client.inject` / assembly row must include the
   `@deepseek-ai/dsh-client-ui-session` client bundle so the service actually exists in the client
   combo (otherwise `ctx.uiSession` is absent and the strict-injection path can keep the plugin from
   activating). This is the colleague's "add `uiSession` to the inject list" hint, correctly located.
5. **Cohort honesty** - the plugin currently compiles against the alpha.1 declarations; its dev/peer
   dependency cohort must be widened/repointed so that the alpha.2 surface is what it is written
   against (section 5). Pin the peer range to cover both hosts, and keep the published lockfile
   installable.

### 3.3 How the session-scoped context reaches the conversation service

* **alpha.2:** `UiSession.adapter.current.getSnapshot().ctx` **is** the session-scoped context
  ("services registered under this session resolve here"). Passing it as `actx` makes
  `actx.get('conversation')` resolve *that session's* conversation service, and
  `conversation.input.for(actx)` bind the input machine to the same session scope. The
  scoped-service addressing convention is unchanged - only the object that carries the scope
  changed.
* **alpha.1:** `sessions.scope(id)` returns the session scope, exactly as before; the same two calls
  work with it.
* **Both:** the identity of `actx` is the *session scope*, so the conversation service, the input
  machine, and `uiConversation.binding(id)` all stay addressed to the same session. The composer
  draft write (`resolved.input.setDraft(step.text)`) therefore still lands in the right session's
  composer.
---

## 4 - Guard hardening

### 4.1 The class of breakage presence-checks cannot catch

The shipped guard asks *"does this service member exist?"*. It cannot see any of the following, all
of which are **value-level** changes - the service object and its member paths are untouched:

* **field removal inside a returned value** - exactly this case (`SessionListState.current` -> gone);
* **field rename** (`byId` -> `items`): the member still exists, the field does not;
* **semantic change under an unchanged name** - the same property now means something else (the card
  records "current" changing meaning from *the bound session* to *main-view occupancy*);
* **type narrowing / shape change of a present value** (map -> array; a required field becoming
  optional);
* **conditional/optional values** - `binding.key === undefined` is a *legitimate* value that a
  presence-check cannot distinguish from "never populated";
* **anything below the second level** - the guard observes the service graph, the plugin consumes a
  *value graph*.

In short: **presence checks validate the identity of the API surface; they cannot validate the shape
or semantics of the data that surface returns.** Their failure mode is the dangerous direction - a
*false negative* (guard says "compatible", plugin is broken) rather than a false positive (spurious
banner). The type system is the other half of the net, and it was silently in the plugin's favour
because the plugin compiled against the alpha.1 declarations.

### 4.2 What the hardened guard must probe instead

Probe **the data contract the plugin actually consumes**, at **two points in the lifecycle**.

**(a) Activation-time host-contract probe (shape, not presence).** Run inside `apply`, *before*
`applyBody` registers the listener, and fail **loudly** (banner + `console.error`) if it fails:

```ts
type Probe = { ok: true } | { ok: false; reason: string }

/** Shape/contract probe. Deliberately NOT a member-presence check. */
function probeHostContract(ctx: ClientContext): Probe {
  // 1) The list snapshot must at least be a snapshot object we can read.
  const list = ctx.sessions?.list?.getSnapshot?.()
  if (list === undefined || list === null || typeof list !== 'object') {
    return { ok: false, reason: 'sessions.list.getSnapshot() did not return a snapshot object' }
  }

  // 2) Exactly one of the two supported current-session contracts must be present:
  //    (a) the legacy field `current` on the list snapshot   (alpha.1)
  //    (b) a binding exposing `key` from the new service    (alpha.2)
  const hasLegacyCurrent = 'current' in (list as object)
  const binding = ctx.uiSession?.adapter?.current?.getSnapshot?.()
  const hasBinding = binding !== undefined && binding !== null && typeof binding === 'object'
  const hasBindingKey = hasBinding && 'key' in (binding as object)

  if (!hasLegacyCurrent && !hasBindingKey) {
    return {
      ok: false,
      reason:
        'no supported current-session contract: sessions.list.getSnapshot().current is absent '
        + 'and uiSession.adapter.current.getSnapshot() exposes no key',
    }
  }

  // 3) If the new contract is present, its *value* shape must hold.
  if (hasBindingKey) {
    const b = binding as { key?: unknown; ctx?: unknown }
    if (b.key !== undefined && typeof b.key !== 'string') {
      return { ok: false, reason: 'uiSession binding key is not a session id' }
    }
    if (b.key !== undefined && b.ctx === undefined) {
      return { ok: false, reason: 'uiSession binding carries a key but no session-scoped ctx' }
    }
  }

  // 4) The service the plugin binds per session must be callable.
  if (typeof ctx.uiConversation?.binding !== 'function') {
    return { ok: false, reason: 'uiConversation.binding is not callable' }
  }

  return { ok: true }
}
```

Two properties make this the right probe:

* it is **session-state independent** (it inspects the *shape* of the host's snapshot, not "is a
  session open"), so it can be evaluated at activation without false alarms on a cold boot;
* it **distinguishes the two supported contracts**, so it passes on both hosts by construction and
  fails on a host where neither contract exists - i.e. exactly the alpha.2-break scenario *if* the
  plugin had not adopted the new service, and exactly a future alpha.3+ drift if it later drifts again.

**(b) First-use behavioural probe.** The activation probe cannot see everything (e.g. the session scope
missing the `conversation` service, or a chat view with no nodes). So the first time the plugin
resolves a session, assert the resolution actually produced usable data, and shout if it did not:

```ts
// inside resolve(), only when the host claims a session exists
if (resolved === null && hostClaimsSessionOpen(ctx)) {
  console.error(
    '[dsh-input-history] session resolution produced null although the host reports an open session; '
    + 'the client API contract changed under this plugin.',
    { list: Object.keys(ctx.sessions.list.getSnapshot() ?? {}), binding: bindingDebug(ctx) },
  );
}
```

**(c) The guard must fail closed and visibly.** On a failed probe: render the remediation banner, log
to `console.error` with the *reason string*, and **do not register the keydown listener**. A guard
that renders a banner but still installs a silently-dead feature is the same trap with extra steps.

**(d) Never branch on the host version string.** The branch must be chosen by capability detection
(`'current' in snapshot` vs. a binding with `key`), per the dual-cohort discipline: one build,
capability-selected path, no version parsing.

### 4.3 At what point in the lifecycle the probe must run

| Probe | When | Why there |
|---|---|---|
| Host-contract shape probe | **At plugin activation**, inside `apply`, before `applyBody` | the break is a *host contract* change, visible without any session being open; it is the only moment at which the plugin can still refuse to install a broken feature and tell the user |
| Behavioural probe | **At first successful resolution** (first keystroke / first binding) | catches contract damage the activation probe cannot see (missing session-scoped `conversation`, empty chat view) |
| Listener registration | only **after** the activation probe passes | a failed contract must not leave a dead hotkey installed |

The activation probe must *not* be session-state dependent - a guard that demands "a current session
must exist right now" would fire spuriously on every cold boot and would train the maintainer to
ignore the banner.
---

## 5 - Verification and prevention

### 5.1 Verifying the fix on both hosts without a full migration

The migration is one plugin, not a fleet change; the host-side fleet is not touched. Verification is
layered so that each layer rejects a bad fix early and cheaply.

**L0 - Static, no host at all (cheapest; catches the original bug class).**
Point the plugin's `@deepseek-ai/dsh-api-session-controller/client` devDependency at **0.1.6-alpha.2**
and run `tsc --noEmit` (once with `skipLibCheck: false`). The pre-fix line
`sessions.list.getSnapshot().current` must now be a **type error** ("property `current` does not exist
on type `SessionListSnapshot`"). That single diagnostic *is* the bug report. CI must own it
permanently - the whole reason this shipped silently is that the plugin's typecheck ran against the
**older** declarations.

**L1 - Host-shaped unit tests (no host).** Build two fake `ClientContext`s from the fixture's own type
excerpts - alpha.1-shaped (`list.getSnapshot() -> { byId, current: 's1' }`, `scope(id) -> sessionCtx`)
and alpha.2-shaped (`list.getSnapshot() -> { items, state:'idle', phase:'ready', error:null,
subagentsByParent:{}, jobsBySession:{} }` with **no** `current`, plus
`uiSession.adapter.current.getSnapshot() -> { key:'s1', ctx: sessionCtx, hooks:{}, keyedHooks:{},
props:{} }`) - and assert:

* alpha.2 fake -> `resolveMainSession` returns `{ id:'s1', ctx: sessionCtx }` (new service path);
* alpha.1 fake **without** a `uiSession` service -> returns `{ id:'s1', ctx: sessionCtx }` (legacy path);
* alpha.1 fake **with** `uiSession` -> returns the same id via the new path;
* "no session open" (absent binding: `key === undefined`; legacy: `current === undefined`) -> returns
  `null` and **does not throw**;
* the hardened guard returns `ok:false` on a "neither contract" fake and `ok:true` on both good fakes;
* the behavioural probe fires when the host claims a session but resolution returns `null`.

(This layer needs the plugin's own repository - `history.ts` / `compat.ts` are **not** in this fixture
pack, so it cannot be executed from here.)

**L2 - Live alpha.2 host, without migrating the broken plugin.** Ship a tiny throw-away probe client
plugin that, at activation, logs `Object.keys(ctx.sessions.list.getSnapshot())` and
`ctx.uiSession?.adapter?.current?.getSnapshot()`. That confirms the real alpha.2 field set and the
real binding shape on the machine, **without touching `dsh-input-history`** - a diagnosis-grade check
that costs one extra bundle. (Reading the live client `Context` from the browser console is **not**
a substitute: the client `Context` is not exposed on `window`; `window.__DSH_BOOT__` exposes entries,
not the context. - *unconfirmed from the fixture; treat the probe plugin as the reliable route.*)

**L3 - Behavioural acceptance of the fix, one identical artifact, two hosts.** Build the plugin **once**
and install the **same** tarball on an alpha.1 host and an alpha.2 host (dual-cohort rule: the same
artifact on both lanes, not two builds). On each host, hard-refresh the browser and verify:

1. with one session open and at least one sent message: **Ctrl+Up** fills the composer with the last
   sent message, **Ctrl+Down** walks back;
2. switching the main-view session **resets** the recall state (the `browse = IDLE` branch keyed on the
   newly resolved id - this is the check that proves the id source is live, not merely
   non-`undefined`);
3. with **no** session open: the chord is a graceful no-op - **no** console error, **no** thrown
   exception;
4. the chord is still swallowed (`preventDefault`) when it *does* resolve, so the composer's own
   cursor movement does not fight the recall;
5. the compat banner does **not** appear on either host.

Browser acceptance must go the full path - token to Cookie, boot manifest, advertised client
artifact, registration/mount, DOM marker - not a bare HTTP 200 - and it must cover both the client
bundle (hard refresh) and the host half (restart) per the skill's validation layering. Note the
release-engineering caveat in card **DSH-0.1.6-A2-04**: npm publication can lag the GitHub
release (an E404 window), so poll `npm view @deepseek-ai/dsh@0.1.6-alpha.2 version` **before**
touching a host, and never run the global host upgrade from inside a session running on that host
(stop every host first, install from an external terminal with the exact pinned version).

**L4 - Guard regression.** Run the plugin against a deliberately "drifted" fake host (list snapshot
with neither `current` nor a binding) and assert the banner renders, `console.error` is emitted, and
**no** keydown listener is installed.

### 5.2 The single host-side change that would have made this loud at plugin activation

**Primary answer: replace the silent removal with a *loud, typed deprecation*.** On alpha.2, the list
snapshot should still expose `current` as an accessor that **throws a named migration error** (e.g.
"`SessionListState.current` was removed in dsh-v0.1.6-alpha.2 - resolve the main session through
`ctx.uiSession.adapter.current.getSnapshot()`"), and the published types should carry the same member
as `@deprecated` with the migration hint. A plugin that still reads it would then fail **with a
message that names the replacement** instead of degrading to `undefined`; and a plugin whose guard
reads the snapshot would fail **at activation**.

The companion change on the *types* side: keep the removed member **visible in the published
declaration** (marked deprecated, with the replacement named) rather than deleting it, so the
*typecheck* also shouts - which is what would have caught this plugin at build time.

**Honest sequencing caveat.** With the *shipped* guard, a value-level throwing stub still surfaces at
the **first keystroke**, not at activation, because the guard only checks member presence and never
calls `getSnapshot()`. To land the failure exactly *at plugin activation*, the removal has to be
observable from activation-time code. Two host-side ways to do that:

* **Contract marker (recommended).** Publish a machine-readable contract identity on the service -
  e.g. `ISessions.contractVersion` (or a `capabilities` set) - so a plugin's activation-time guard can
  assert *"I require contract >= N / capability `session.mainBinding`"* and **refuse to activate**
  with a banner and a console error, instead of probing member presence. This is the durable fix: it
  makes *future* removals loud by construction, and it gives plugins a supported way to state their
  requirement.
* **Throw at the service boundary.** Make the removed contract observable through the service access
  itself (e.g. `ctx.sessions.list` raising a migration error on hosts that dropped `current`) so that
  activation-time probing trips immediately.

**Prevention beyond the host change (plugin/host hygiene, one line each):**

* **Plugin CI must typecheck against the newest host cohort's declarations.** The plugin compiled
  against alpha.1 types; that is the whole reason the compiler stayed silent. A peer range that
  admits alpha.2 while the devDependency stays on alpha.1 is the hole.
* **Guard failures must be fail-closed and audible**: banner **and** `console.error`, and no dead
  hotkey installed.
* **Release notes must list removed client-facing members explicitly.** The alpha.2 note only said
  "client Session multi-instance support; related APIs and slots changed" - a pointer, not a field
  list. The release-note text should have named `SessionListState.current` as removed and pointed at
  `ctx.uiSession.adapter.current`.
* **Plugin-manager coexistence check (informational, card DSH-0.1.6-A2-03):** this profile's six
  plugins are junction-linked with hand-written patch rows, so they load and serve their bundles but
  stay outside the new Plugins-page bundle management. Real-time row toggles may therefore appear
  not to apply to them - a separate operational trap from this bug, worth noting in the migration
  report.

---

## Appendix - Evidence to conclusion map

| Evidence (fixture) | Conclusion |
|---|---|
| session-list-alpha1.d.ts: `SessionListState.current: SessionId \| undefined` | the legacy field the plugin read, and its meaning ("the session the main conversation view is currently bound to") |
| session-list-alpha2.d.ts: `SessionListSnapshot` has `items/state/phase/error/subagentsByParent/jobsBySession` and **no** `current`; comment "navigation belongs to view owners" | the exact removal; the list is demoted to a catalog; the plugin's read yields `undefined` on every keystroke |
| session-list-alpha2.d.ts NOTE: `scope(id)` still exists at alpha.2 | the guard's `sessions.scope` presence check legitimately passes - the break is one level deeper |
| ui-session-service-alpha2.d.ts: `UiSession.adapter.current: ObservableSnapshot<SessionBindingValue>` | the canonical replacement observable for the current session |
| ui-session-service-alpha2.d.ts: `SessionBindingValue { key, ctx, hooks, keyedHooks, props }` | `key` replaces `sessions.list.getSnapshot().current`; `ctx` replaces `sessions.scope(id)` |
| ui-session-service-alpha2.d.ts: the absent binding publishes `key === undefined` | "no session open" stays representable -> one code path for both hosts |
| src-client-index.ts:34-35 (`current` read -> `if (id === undefined) return null`) | the failing read and the silent early return that converts it into a no-op |
| src-client-index.ts:61-62 (`preventDefault` after the null check) | why the chord is not swallowed - the handler returns before it |
| src-client-index.ts:83-88 (four presence probes) | why the banner cannot fire: member presence is not value shape |
| upgrade-notes.txt already-tried #2 / #6 and the colleague's slot note | what the diagnosis settles (section 1.5) and what it does not |
| Skill card **DSH-0.1.6-A2-01** (multi-instance Session references; `uiSession.adapter.current` works on both tags; slot components unaffected) | the canonical replacement read and the refutation of the slot-re-registration hypothesis |
| Skill card **DSH-0.1.2-A1-27** (input-machine face unchanged; `binding.ctx` used as `actx`) | why `conversation.input.for(actx)` / `setDraft` keep their signatures |
| Skill API-10 (`snapshot.legacy.nodes` is staged dual-host compatibility) | the residual `legacy.nodes` risk, flagged as unconfirmed from the fixture |

**Unconfirmed from the fixture (marked, not guessed):** the alpha.2 ui-chat snapshot shape and whether
`legacy.nodes` is still populated (the fixture ships no ui-chat type excerpt); whether the alpha.2
`retainedBy.mainView` catalog route is reachable via `byId` (the fixture's alpha.2 snapshot shows
`items`, not `byId`); whether the client `Context` is reachable from the browser console.

**Fixture integrity:** `/app/fixture/` was read only; no file under it was modified, moved, or deleted.