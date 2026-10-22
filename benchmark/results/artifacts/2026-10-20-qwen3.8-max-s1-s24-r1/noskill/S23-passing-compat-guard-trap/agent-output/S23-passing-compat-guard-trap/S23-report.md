# S23 · The Compat Guard That Passed — Diagnosis, Migration, and Guard Hardening

**Case**: `@dsh-external/dsh-input-history` (Ctrl+Up / Ctrl+Down composer recall) silently dead after
in-place host upgrade `@deepseek-ai/dsh` 0.1.6-alpha.1 → 0.1.6-alpha.2. No console error, no banner,
guard reports "compatible". Evidence: sealed pack under `/app/fixture/` (symptom report, plugin client
entry, both session-controller type excerpts, new ui-session service excerpt, release-notes/boot-log,
already-tried list).

**Root cause (one line)**: alpha.2's multi-instance session refactor removed the `current` field from the
snapshot published by `sessions.list` (navigation moved to the new view-owner service `uiSession`), so the
plugin's first per-keystroke read `sessions.list.getSnapshot().current` now yields `undefined` on every
press and its `resolve()` bails out silently at line one — while every member the compat guard probes
(`sessions.list`, `sessions.scope`, `sessions.sessionOf`, `uiConversation.binding`) still exists, so the
guard passes and nothing surfaces anywhere.

---

## 1. Silent-failure attribution

### 1.1 Per-keystroke resolution path walk (`plugin/src-client-index.ts`)

```
keydown (capture, document)
  → gate: e.ctrlKey && !alt/meta, key ∈ {ArrowUp, ArrowDown}, !isComposing, isComposerTarget(e.target)
      [all pass — the user is pressing in the composer; report confirms chords reach it]
  → resolve()
      (a) const id = sessions.list.getSnapshot().current          ← THE FAILING READ
      (b) if (id === undefined) return null                        ← resolve() dies HERE, every keystroke
      (c) const actx = sessions.scope(id)                          [never reached on alpha.2]
      (d) actx.get('conversation')                                 [never reached]
      (e) ctx.uiConversation.binding(id)…views.get('chat')         [never reached]
      (f) return { input: conversation.input.for(actx), nodes }    [never reached]
  → onKeyDown: if (resolved === null) return                       ← bare return, BEFORE preventDefault/
                                                                      stopPropagation
```

The exact failing read is **(a)**: `sessions.list.getSnapshot().current`.

- On **alpha.1**, `getSnapshot()` returned `SessionListState = { byId, current: SessionId | undefined }`
  — `current` was the main view's bound session, and this read worked.
- On **alpha.2**, the same observable member `list` still exists, but its payload type is now
  `SessionListSnapshot = { items, state, phase, error, subagentsByParent, jobsBySession }`. There is **no
  `current` field** — the excerpt's doc comment says it outright: *"Host catalog and local
  reference-source counts; **navigation belongs to view owners**."* With multiple coexisting session
  instances, a single controller-level "current session" no longer exists; selection moved to the new
  `UiSession` service.
- In shipped (already-compiled) JavaScript, reading an absent property on an object is **not an error** —
  it evaluates to `undefined`. So step (a) "succeeds" with `id === undefined`, step (b) takes what the
  code treats as the legitimate "no active session" branch, and `resolve()` returns `null`.

### 1.2 Why nothing surfaces anywhere

- **Why the compat guard passes**: the guard in `apply()` probes four *service members* for truthiness:
  `ctx.sessions.list`, `ctx.sessions.scope`, `ctx.sessions.sessionOf`, `ctx.uiConversation.binding`.
  All four still exist on alpha.2 — `list` is still an observable (same member name, different payload
  contract), and the alpha.2 excerpt's NOTE explicitly says `scope(id)` still exists on `ISessions`.
  Presence of a member says nothing about the shape of the data it returns. The break is **one level
  deeper** (a field inside the returned snapshot), which no member-presence check can observe.
- **Why there is no console error**: (i) absent-property reads yield `undefined` instead of throwing in
  JS; (ii) the plugin ships as built JS, so the TypeScript error *"Property 'current' does not exist on
  type SessionListSnapshot"* — which alpha.2's types DO produce for anyone who recompiles — was erased at
  build time and never re-checked at runtime; (iii) every downstream step is defensively guarded
  (`if (… === undefined) return null`), so the `undefined` never flows into a call that could throw
  (e.g. `.for(actx)` or `binding(id)` are never reached).
- **Why a silent no-op rather than an exception**: `onKeyDown` handles `resolved === null` with a bare
  `return` positioned **before** `e.preventDefault()` / `e.stopPropagation()`. That is by design — "no
  session open ⇒ do nothing and let the composer behave normally" — but after the upgrade it becomes the
  *permanent* path. This precisely matches the symptom report: no text appears, no toast, **and the chord
  is not swallowed** (the composer's own multi-line cursor movement still works, because the plugin never
  claims the event). The handler is firing; it is bailing out on its first read.

### 1.3 Which already-tried suspicions this settles — and which it does not address

| # | Tried item / suspicion | Verdict under this reading |
|---|---|---|
| 1 | "Console is clean while pressing chords" (implicit: a broken handler would log errors) | **Settled/refuted.** Clean console is fully consistent with breakage: the failure path is a guarded `return null`, not an exception. Absence of errors proved nothing about handler health. |
| 2 | "Compat banner not showing" (implicit: guard passing ⇒ host compatible) | **Settled/refuted.** The guard checks member presence only; the removed contract is a snapshot *field*. Guard pass is expected, not exculpatory. |
| 3 | "Re-linked junction + hard refresh — no change" (stale build/link) | **Settled/ruled out.** The break is in the host's published data shape, not in plugin delivery. |
| 4 | "Disabled all other plugins — no change" (inter-plugin chord theft) | **Settled/ruled out.** Consistent with the plugin self-bailing; no other plugin involved. |
| 6 | "Chords not taken by anything else" | **Settled and explained.** The plugin's own listener fires but returns before `preventDefault`, so nothing swallows the chord — exactly the observed "does nothing, not swallowed either". |
| Colleague | "Maybe re-register the slot / add `uiSession` to inject?" | **Half-confirmed.** Direction is right — `uiSession` IS the new canonical source of the current session — but merely adding it to `inject` changes nothing; the read in `resolve()` must be rewritten (§3). The slot theory is wrong: the plugin uses a document-level capture listener, not a slot. |
| 5 | "Update chip says *latest version*" | **NOT addressed.** This reading is a runtime-path analysis; it says nothing about whether an alpha.2-adapted plugin build exists in the update feed. The chip only compares the plugin's own version against its registry and is structurally blind to host-API drift — it will keep reporting "latest" while the plugin is broken. That suspicion stays open (and the chip stays untrustworthy as a compatibility signal). |

---

## 2. Evidence mapping

### 2.1 The two session-controller excerpts — what changed about the snapshot

| | alpha.1 (`session-list-alpha1.d.ts`) | alpha.2 (`session-list-alpha2.d.ts`) |
|---|---|---|
| Payload type of `sessions.list` | `SessionListState` | `SessionListSnapshot` |
| Fields | `byId: Record<SessionId, SessionSummary>`, **`current: SessionId \| undefined`** ("the session the main conversation view is currently bound to") | `items`, `state`, `phase`, `error`, `subagentsByParent`, `jobsBySession` — **no `current`, no `byId`** |
| Semantics | Controller owned navigation: one global "current" session | *"Host catalog and local reference-source counts; navigation belongs to view owners"* — multi-instance refactor: with several session views coexisting there is no single controller-level current; selection is per-view-owner |
| `scope(id)` | present | **still present** (per the excerpt's NOTE) — which is why even the guard's `sessions.scope` probe passes |

**Implication for the value the plugin receives on every keystroke**: the observable member the plugin
reads (`sessions.list`) is alive and well, but `getSnapshot()` now returns an object whose key set does
not include `current`. Therefore `sessions.list.getSnapshot().current === undefined` **on every single
keystroke, deterministically** — indistinguishable, at the value level, from alpha.1's legitimate
"no session open" state (`current: undefined`). That ambiguity is the whole trap: the plugin's defensive
`id === undefined ⇒ return null` branch silently absorbs a contract removal as if it were normal idle
state. (`sessions.scope(id)` would still have worked — the plugin just never gets to call it.)

### 2.2 The new-service excerpt — the canonical replacement read

From `host-types/ui-session-service-alpha2.d.ts` (ships in `@deepseek-ai/dsh-client-ui-session`'s client
bundle at alpha.2):

- **Service**: `UiSession` (class extending `Service`), inject name **`uiSession`**. It is the "root
  service owning per-Session bindings and the main-view selection" — i.e. the view owner that took over
  navigation.
- **Observable to read**: **`uiSession.adapter.current: ObservableSnapshot<SessionBindingValue>`** —
  documented as "binding source of the main view's current session". This is the exact replacement for
  `sessions.list.getSnapshot().current`.
- **Shape of the yielded value** — `SessionBindingValue`:
  - `key: SessionId` — the bound session's id (replaces the old `current` field);
  - **`ctx: Context` — the session-scoped context; "services registered under this session resolve
    here". This is the field that replaces `sessions.scope(id)`** for session-scoped service resolution
    (the excerpt's NOTE in the alpha.2 file says the same: "the ui-session service's binding value also
    carries the session-scoped ctx");
  - `hooks`, `keyedHooks`, `props` — standard contributions registered via `UiSession.provide()`
    descriptors (used by stock packages such as ui-chat); not needed by this plugin.
- **Absent-session semantics**: "SessionBindingValue.key of the absent binding is undefined; the service
  publishes the absent value while no main session is retained." So `key === undefined` remains the
  legitimate "no session" signal — the plugin's idle branch keeps working unchanged, and a hardened guard
  must probe **field presence** (`'key' in snap`), never `key !== undefined` (§4).
- Other members noted for completeness: `sourceFor(owner)` resolves a stable binding source for any one
  session (the multi-instance generalization), and `adapter.bindingSource(target)` serves slot scopes.
  For main-view recall, only `adapter.current` is needed.

Release-notes corroboration (`upgrade-notes.txt`): "客户端 Session 会话支持多实例共存，相关 API 及 slot 有变化" —
the multi-instance refactor is the announced change class; the boot log confirms the plugin's client bundle
loads fine among all six plugins ("no pending entries… host up"), i.e. activation succeeded — the failure
is purely post-activation data contract.

---

## 3. Migration recipe (one build, dual-host)

### 3.1 Corrected resolution function

Strategy: **prefer the alpha.2 canonical source (`uiSession.adapter.current`), fall back to the alpha.1
legacy field (`sessions.list…current` + `sessions.scope(id)`)**, using structural (duck-typed) probes so
the build compiles against alpha.1 types and runs on both hosts. `onKeyDown` itself needs no change.

```ts
import type { Context as ClientContext } from '@deepseek-ai/cordis'
import type { ISessions } from '@deepseek-ai/dsh-api-session-controller/client'
import type {
  ConversationNode, IConversation, SessionInput,
} from '@deepseek-ai/dsh-client-ui-conversation/client'

/** Structural view of alpha.2's UiSession — avoids a hard type import that
 *  doesn't exist on alpha.1. All access is optional-chained at runtime. */
interface SessionBindingLike {
  readonly key?: string
  readonly ctx?: ClientContext
}
interface UiSessionLike {
  readonly adapter?: {
    readonly current?: { getSnapshot(): SessionBindingLike | undefined }
  }
}

/** alpha.1's list snapshot carried `current`; alpha.2's does not. Read it
 *  through a cast so one build type-checks against either host's d.ts. */
interface LegacyListState { readonly current?: string }

/** One dual-host inject list: uiSession is OPTIONAL ('?' suffix) so activation
 *  is not blocked on alpha.1, where the service does not exist. */
export const inject = ['sessions', 'uiConversation', 'conversation', 'uiSession?']

function applyBody(ctx: ClientContext): void {
  let browse: HistoryBrowse = IDLE
  let lastSessionId: string | undefined

  const sessions: ISessions = ctx.sessions
  const uiSession = ctx.uiSession as UiSessionLike | undefined // undefined on alpha.1

  /** Current main-view session id + its session-scoped ctx, on either host. */
  const resolveSession = (): { id: string; actx: ClientContext } | null => {
    // (1) alpha.2 canonical: navigation belongs to the view owner.
    const binding = uiSession?.adapter?.current?.getSnapshot?.()
    if (binding?.key !== undefined && binding.ctx !== undefined) {
      return { id: binding.key, actx: binding.ctx }
    }
    // (2) alpha.1 legacy: global list snapshot's `current` + scope(id).
    const id = (sessions.list.getSnapshot() as LegacyListState).current
    if (id === undefined) return null
    const scope = (sessions as { scope?(id: string): ClientContext | undefined }).scope
    const actx = scope?.call(sessions, id)
    if (actx === undefined) return null
    return { id, actx }
  }

  const resolve = (): ResolvedSession | null => {
    const s = resolveSession()
    if (s === null) return null                    // no main session retained: idle, by design
    if (s.id !== lastSessionId) {
      browse = IDLE                                // session switch: recall starts fresh
      lastSessionId = s.id
    }
    const conversation = s.actx.get('conversation') as IConversation | undefined
    if (conversation === undefined) return null
    const chat = ctx.uiConversation.binding(s.id).snapshot.getSnapshot().views.get('chat')
    const nodes = chat === undefined ? EMPTY_NODES : chat.legacy.nodes
    return { input: conversation.input.for(s.actx), nodes }
  }

  // onKeyDown / effect registration: UNCHANGED from the shipped plugin.
}
```

Notes on the fallback ordering and safety:

- Ordering (uiSession first, legacy second) is safe on both hosts: on alpha.1 `ctx.uiSession` is
  `undefined`, so branch (1) short-circuits and branch (2) runs exactly the original code path; on
  alpha.2 branch (1) always resolves when a main session is retained (and if none is retained, the
  published absent value has `key === undefined`, branch (2) also finds no `current`, and the plugin
  idles correctly — same user-visible behavior as alpha.1 with no session).
- All alpha.2-only access is structural (`?.` chains + `in`-style checks), never a hard import, so the
  single build has no alpha.2-only module dependency and loads on alpha.1 unchanged.
- Residual risk to smoke-test (not evidenced either way in the sealed pack): the downstream
  `uiConversation.binding(id)…views.get('chat').legacy.nodes` read survived the guard check
  (`uiConversation.binding` is present on alpha.2), but its payload could carry its own field-level
  drift of the same class; §5's live check covers it.

### 3.2 What must change in the `inject` declaration

- **Before**: `export const inject = ['sessions', 'uiConversation', 'conversation']`
- **After**: `export const inject = ['sessions', 'uiConversation', 'conversation', 'uiSession?']`
- `uiSession` MUST be declared **optional** (Cordis `?` suffix in the inject list). A *required*
  `uiSession` inject would block/fail activation on alpha.1, where the service does not exist — trading
  a silent failure on alpha.2 for a loud one on alpha.1, breaking the "one build, both hosts" goal. If the
  bundled Cordis build did not honor the `?` suffix, the alternative is to omit `uiSession` from
  `inject` entirely and read `(ctx as any).uiSession` defensively — the code above already treats it as
  possibly-undefined, so it works under either mechanism.
- `sessions` stays in the list: it is still the alpha.1 fallback source and `scope()` provider.
  `uiConversation` and `conversation` stay as before.

### 3.3 How the session-scoped context reaches the conversation service

On alpha.2 the per-session services (including `conversation`) are registered **inside each session's
scope**, and `SessionBindingValue.ctx` *is* that scope ("services registered under this session resolve
here"). So the chain is:

```
uiSession.adapter.current.getSnapshot()   → SessionBindingValue
        .ctx                              → the session-scoped Context   (replaces sessions.scope(id))
        .ctx.get('conversation')          → THIS session's IConversation instance
        conversation.input.for(actx)      → input facade bound to the SAME session-scoped ctx
```

Two consequences under multi-instance:

1. The plugin must resolve `conversation` **from the binding's ctx**, never from its own root-level
   `ctx.conversation` — with several sessions coexisting, the root registration is not bound to the main
   view's current session (which is exactly why `resolve()` always used `actx.get('conversation')`).
2. The same `actx` (= `binding.ctx`) must be passed into `conversation.input.for(actx)` so the draft
   the plugin reads/writes belongs to the session the user is looking at. On alpha.1 the identical role
   was played by `sessions.scope(id)`; the recipe keeps that as the fallback.

---

## 4. Guard hardening

### 4.1 The class of breakage presence-checks cannot catch

The shipped guard evaluates `[name, ctx?.a?.b]` pairs and banners on falsy values — a pure
**member-presence** probe at `apply()` time. Everything in this family passes it while being broken:

1. **Field-level removal/rename inside returned payloads** (this incident): `sessions.list` exists, but
   `getSnapshot().current` no longer does. The contract lives in the *data*, one dereference deeper than
   the probe.
2. **Same-name semantic/type change**: `list` still returns an `ObservableSnapshot`, but its payload
   changed meaning (byId+current navigation state → items+phase catalog). Presence and even truthiness
   are identical; semantics are not.
3. **Signature changes on present members**: e.g. a surviving `scope(id)` gaining a required second
   parameter — `typeof scope === 'function'` still passes.
4. **Timing/lifecycle drift**: the member exists at `apply()` but its snapshot is not populated until a
   later lifecycle point, or the service is re-created by runtime unload/reload (another alpha.2 change:
   "插件依赖解析模式调整为运行时解析，插件管理支持运行时卸载").
5. **Value-level invariant flips**: absent key vs. `undefined` value; `undefined` being a legal state
   (`SessionBindingValue.key` of the absent binding) makes truthiness probes doubly useless.

General rule: presence checks verify the *object graph the plugin touches at activation*; they cannot
verify the *shape of values that flow later*, because those values are only observable by actually
calling the API and inspecting the result. TypeScript catches class 1–3 at build time — but the plugin
ships prebuilt JS and the host is upgraded underneath it, so no recompilation ever happens. The guard is
the plugin's only runtime type system, and it was aimed at the wrong level.

### 4.2 Hardened guard specification

**What to probe instead of service presence**: the *field contract of a live snapshot* — one real
`getSnapshot()` per read the plugin depends on, checking **own-field presence** (`'field' in snap` /
`Object.hasOwn`), never field truthiness (because `undefined` is a legal value on a healthy host with
no session open — a `snap.current !== undefined` probe would false-banner on pristine alpha.1). Accept
**either** host contract; banner only when **both** are absent:

```ts
type Probe = { ok: boolean; detail: string }

function probeHostContract(ctx: ClientContext): Probe {
  // alpha.2 contract: uiSession.adapter.current yields { key, ctx } values.
  try {
    const cur = (ctx as any).uiSession?.adapter?.current
    if (typeof cur?.getSnapshot === 'function') {
      const snap = cur.getSnapshot()
      if (snap !== null && typeof snap === 'object' && 'key' in snap && 'ctx' in snap) {
        return { ok: true, detail: 'uiSession.adapter.current → {key, ctx}' }
      }
    }
  } catch { /* fall through to legacy probe */ }
  // alpha.1 contract: sessions.list snapshot carries the `current` FIELD and scope() is callable.
  try {
    const snap = (ctx as any).sessions?.list?.getSnapshot?.()
    if (snap !== null && typeof snap === 'object' && 'current' in snap
        && typeof (ctx as any).sessions?.scope === 'function') {
      return { ok: true, detail: 'sessions.list snapshot has `current` + scope()' }
    }
  } catch { /* contract genuinely broken */ }
  return { ok: false, detail: 'neither session-navigation contract is present on this host' }
}
```

**At what lifecycle point the probe must run**:

1. **Primary probe: at activation, but after injected services are ready** — inside the plugin's first
   effect tick / `ctx.on('ready')` (or equivalent onReady hook), NOT synchronously at the top of
   `apply()` where the shipped guard runs. At `apply()` time services may still be initializing and a
   first snapshot may not be published yet; at *ready* time one real snapshot exists and its key set is
   the truth. This is the point that would have caught THIS failure: on alpha.2 the ready-time snapshot
   has no `current` key, and with no `uiSession` injected the guard had no second contract to accept —
   banner fires at startup instead of silence at keystroke time.
2. **Deferred re-probe on first use / on resolve failure**: whenever `resolve()` returns `null` while
   the guard believed the host compatible (or on the first keystroke per session), re-run
   `probeHostContract` once (rate-limited); on failure escalate to the remediation banner plus a single
   `console.warn('[dsh-input-history] host contract probe failed: …')`. This covers timing drift and
   runtime unload/reload (service re-created after activation), and it is the general antidote to the
   "silent no-op" failure mode: a null resolve stops being indistinguishable from idle.
3. **Re-probe on host lifecycle events** if the Cordis runtime exposes service disposal/re-provide
   signals (relevant given alpha.2's runtime dependency resolution and runtime unload), since a captured
   service reference can go stale under the plugin's feet.

Keep the old presence checks as a cheap first gate — they are necessary (a missing service IS
incompatible) — but no longer sufficient: presence gate → ready-time snapshot-field probe → first-use
re-probe.

---

## 5. Verification and prevention

### 5.1 Verifying the fix on both hosts without a full migration

One plugin build; verify by *branch observation*, not by migrating anything:

1. **Side-by-side host smoke (decisive, ~10 min/host)**: keep two global installs via separate npm
   prefixes (or `npx -p @deepseek-ai/dsh@0.1.6-alpha.1 …` / `@0.1.6-alpha.2`), junction-link the SAME
   built plugin into both profiles. Add a one-time debug log in `resolveSession` recording the chosen
   branch (`path=uiSession` vs `path=legacy`) and the snapshot's `Object.keys(...)`. Per host assert:
   - alpha.1: recall fills last sent message on Ctrl+Up, walks back/forward with repeat presses and
     Ctrl+Down; log shows `path=legacy`; snapshot keys include `current`; no banner; clean console.
   - alpha.2: identical recall behavior; log shows `path=uiSession`; snapshot keys show the new catalog
     shape (`items/phase/…`, no `current`); no banner; clean console.
   - both, multi-instance check (alpha.2): retain a second session, switch main view — recall resets
     (`browse = IDLE`) and targets the newly current session (`binding.key/ctx` follow the switch);
     with NO session retained, chords idle silently without errors (absent-binding value, `key ===
     undefined`).
   - residual-risk check (§3.1): confirm `uiConversation.binding(id)…views.get('chat').legacy.nodes`
     still yields history nodes on alpha.2 (it is reached for the first time after the fix).
2. **Offline contract tests (no host needed)**: unit-test `resolveSession`/`resolve` against two fake
   contexts built directly from the sealed type excerpts — fake A: `list.getSnapshot() → {byId,
   current:'s1'}` + working `scope('s1')`; fake B: `list.getSnapshot() → {items,…}` (no `current`) +
   `uiSession.adapter.current.getSnapshot() → {key:'s1', ctx: fakeCtx}`; fake C: alpha.2 shape WITHOUT
   uiSession (the broken status quo) → assert graceful `null`, not a throw. This pins the dual-host
   behavior in CI against both sealed contracts.
3. **Compile-time check per host**: `tsc --noEmit` the plugin against each host version's `.d.ts` set
   (two tsconfig targets). The alpha.2 compile additionally proves no uncast `.current` read survives
   anywhere in the codebase.
4. **Zero-code live probe (before shipping the fix, to confirm the diagnosis in situ)**: on the broken
   alpha.2 host, run in the browser console, with a session open, a one-liner through any debug handle the
   plugin exposes (or a temporary 3-line dev build): `Object.keys(ctx.sessions.list.getSnapshot())` →
   expect no `current` in the output; and `'current' in snapshot` → `false`. That single observation
   converts the whole theory into fact on the maintainer's machine.

### 5.2 The single host-side change that would have made this loud

**A removed-field trap on the published snapshot (service side).** In alpha.2, instead of simply omitting
`current` from the `SessionListSnapshot` instances the controller publishes, define it as an accessor
that fails loudly:

```ts
Object.defineProperty(snapshot, 'current', {
  configurable: false,
  get(): never {
    throw new Error(
      '[dsh] SessionListState.current was REMOVED in 0.1.6-alpha.2 (multi-instance session refactor). ' +
      'Read the main view\'s current session from uiSession.adapter.current.getSnapshot().key ' +
      '(session-scoped ctx: .ctx). Inject "uiSession?" to stay compatible with 0.1.6-alpha.1.',
    )
  },
})
```

Why this is the right single change:

- It defeats exactly the mechanism that kept this incident silent — absent-property reads returning
  `undefined`. Any plugin still reading `list.getSnapshot().current` throws on its **first read**, with
  an actionable migration message naming the replacement service, observable, and field. For plugins
  that snapshot eagerly at startup (initial-state renders, guards that probe data instead of presence)
  this fires at plugin activation; for this plugin it would fire on the very first keystroke — a loud
  console error on press #1 instead of permanent silence.
- It works for **prebuilt JS**, which is the actual population at risk: the type-level removal was
  *already* loud — `tsc` against alpha.2's types errors with "Property 'current' does not exist on type
  'SessionListSnapshot'" — but nobody recompiles a junction-linked external plugin when the host
  upgrades, so compile-time loudness never reached the runtime. Only an in-service trap closes that gap.
- Cost is one release of shim (the trap can downgrade to `console.error` + return `undefined` after a
  deprecation window if a hard throw is judged too aggressive for third-party code).

**Type-side companion (same spirit, zero runtime cost)**: had alpha.2 kept a tombstone in the published
types — e.g. `/** @deprecated removed in alpha.2; use UiSession.adapter.current */ readonly current?:
never` — tooling and IDEs would at least flag the field as removed-with-pointer for anyone reading the
new d.ts (as this task's maintainer did); but note a tombstone alone still *compiles* for readers of
`snap.current` and cannot help prebuilt bundles, which is why the runtime trap is the change that
actually converts silence into noise.

**Ecosystem-level prevention (beyond the single change, for the host team)**: publish a machine-readable
API contract version per service (e.g. `sessions.contractVersion = 2` or a manifest of snapshot key
sets) so plugin guards can assert the *data* contract declaratively; and emit release-note entries for
field-level removals in the same prominent slot as API additions — "相关 API 及 slot 有变化" did not name
`SessionListState.current`, which is why the maintainer's colleague skimmed past the actual cause.

---

## Appendix · Evidence index (fixture file → use)

- `symptom-report.md` — symptoms: silent dead chords, no console output, no banner, chord not swallowed; checked list 1–5. (§1.2, §1.3)
- `plugin/src-client-index.ts` — guard probes (four presence checks), `resolve()` path with the failing `.current` read, `onKeyDown` bare-return before `preventDefault`. (§1.1, §4.1)
- `host-types/session-list-alpha1.d.ts` — `SessionListState { byId, current }`; `scope(id)` contract the plugin was built on. (§2.1)
- `host-types/session-list-alpha2.d.ts` — `SessionListSnapshot` without `current`; "navigation belongs to view owners"; NOTE that `scope(id)` still exists and the ui-session binding value carries the session ctx. (§2.1, §4.1)
- `host-types/ui-session-service-alpha2.d.ts` — `UiSession`, inject name `uiSession`, `adapter.current: ObservableSnapshot<SessionBindingValue>`, `SessionBindingValue { key, ctx, hooks, keyedHooks, props }`, absent-binding semantics. (§2.2, §3)
- `upgrade-notes.txt` — release note (multi-instance session refactor; runtime dependency resolution/unload), boot log (plugin bundle loads, host up), already-tried list 1–6, colleague's inject guess. (§1.3, §4.2, §5.2)
