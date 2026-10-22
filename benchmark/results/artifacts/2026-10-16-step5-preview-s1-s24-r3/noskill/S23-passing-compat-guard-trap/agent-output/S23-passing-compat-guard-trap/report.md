# S23 · The Compat Guard That Passed — diagnosis, migration, hardening

**Arm**: noskill · **Host upgrade**: `@deepseek-ai/dsh` 0.1.6-alpha.1 → 0.1.6-alpha.2 (npm global, Windows, web profile, 6 junction-linked client plugins) · **Victim**: `@dsh-external/dsh-input-history` (Ctrl+Up / Ctrl+Down composer recall)

> Evidence used: `fixture/symptom-report.md`, `fixture/plugin/src-client-index.ts`,
> `fixture/host-types/session-list-alpha1.d.ts`, `fixture/host-types/session-list-alpha2.d.ts`,
> `fixture/host-types/ui-session-service-alpha2.d.ts`, `fixture/upgrade-notes.txt`,
> `fixture/README.md`. Nothing outside `fixture/` was read; the fixture was not modified.

---

## 1. Silent-failure attribution

**Conclusion.** The dead read is `sessions.list.getSnapshot().current` — `plugin/src-client-index.ts:34`, the *first* statement of `resolve()`. At alpha.2 that property no longer exists on the snapshot, so `id` is `undefined` on every keystroke, `resolve()` returns `null` at line 35, and `onKeyDown` returns at line 56 without calling `preventDefault()`. Nothing throws, nothing logs, and the chord falls through to the composer's native cursor movement — exactly the reported symptom.

### 1.1 The per-keystroke path, step by step

1. `onKeyDown` (line 50) runs as a **capture** listener on `window`. The modifier/key/`isComposing`/`isComposerTarget` filters all pass — the chord genuinely reaches the plugin. The maintainer's already-tried item 6 (with the junction removed, nothing else handles the chord) proves no competing handler exists.
2. Line 55 calls `resolve()`, whose **first** statement is line 34:
   ```ts
   const id = sessions.list.getSnapshot().current
   ```
3. On alpha.2 that property does not exist on the published snapshot, so `id` is `undefined`.
4. Line 35 `if (id === undefined) return null` — this guard was written for the legitimate steady state "no session is bound".
5. Line 56 `if (resolved === null) return` — a bare return. No `preventDefault()`, no `stopPropagation()`, no `console.*`, no banner, no state change. `browse` and `lastSessionId` are never updated, so the history state machine stays `IDLE` forever.
6. Lines 41–47 (`sessions.scope(id)` → `actx.get('conversation')` → `ctx.uiConversation.binding(id)` → `chat.legacy.nodes`) and lines 57–64 (history extraction, draft read, `setDraft`) are **never reached** on alpha.2.

**The exact failing read: `sessions.list.getSnapshot().current` at `plugin/src-client-index.ts:34`.** Everything downstream of it is dead code on alpha.2.

### 1.2 Why nothing surfaces anywhere

**(a) Why the compat guard passes.** `applyWithCompat` (lines 78–90) is handed four *presence* checks: `sessions.list`, `sessions.scope`, `sessions.sessionOf`, `uiConversation.binding` (lines 84–87). All four still exist at alpha.2:
- `list` still exists — its **payload shape** changed, not its existence (`session-list-alpha2.d.ts` keeps `readonly list: ObservableSnapshot<SessionListSnapshot>`).
- `scope` still exists — the alpha.2 excerpt says so explicitly: *"scope(id) still exists on ISessions at alpha.2 but is omitted from this excerpt"*.
- `sessionOf` and `uiConversation.binding` are not shown as removed anywhere in the pack, and the boot log shows the plugin loaded with `no pending entries, no duplicate loader ids, host up`.

A presence check answers "does this member exist on the service object". It says nothing about the fields inside the values that member returns. The guard is therefore **structurally incapable** of catching this breakage — it is not a bug in the guard's list, it is a bug in the guard's *kind*.

**(b) Why there is no console error.** There is no throw and no log statement on the failing path. Property access for a missing key on a plain published object never throws — it yields `undefined`. Every branch of `resolve()` is a graceful `return null`; the plugin contains no `console.error`/`console.warn` at all. The host boot log is clean, and release-note item 1 (插件依赖解析模式调整为运行时解析) is **not** implicated: `sessions` and `uiConversation` resolved fine at runtime.

**(c) Why a silent no-op instead of a thrown exception.** The absent field's runtime value (`undefined`) is **indistinguishable** from the legitimate "no current session" state that line 35 was written to handle. The code takes a pre-existing, deliberately quiet path. And because the handler returns *before* `preventDefault()`, the browser's own composer cursor movement continues — the maintainer's observation that "the chord is not swallowed" is the fingerprint of a bail-out, not of a missing listener. A thrown exception would have been loud; a designed-quiet branch is invisible.

**(d) Aggravating factor: prebuilt bundle.** The plugin is junction-linked as an already-built `client.js` and is never re-type-checked against alpha.2's `.d.ts`. A rebuild *would* have failed to compile (TS2339: `Property 'current' does not exist on type 'SessionListSnapshot'`), but no rebuild happens. Already-tried item 5 ("update chip says latest version") is a red herring: the plugin's own version is irrelevant when the host's contract moved underneath it.

### 1.3 Which earlier suspicion this settles

- **Item 6 (chords not taken by anything else) — settled, decisively.** With the junction removed nothing handles the chord; with it present the handler *is* firing and bailing at line 35. So this is neither a handler collision nor a "listener never registered" problem. It converts the maintainer's "either not firing or firing and bailing out" into a definite answer: **firing and bailing out**, at the first statement of `resolve()`.
- **Item 2 (no compat banner) — settled.** The guard passes by construction, so the absence of a banner carries **zero** information about compatibility. "Guard green" must never be read as "host compatible".
- **Items 1, 3, 4 — explained by the same fact.** Nothing to log (no throw, no log call), nothing to reload (the field is gone from the host, not from the bundle), and no other plugin is involved (the dead read is inside this plugin's own `resolve()`).

### 1.4 Which suspicion this does **not** address

- **The colleague's note — not settled, and not sufficient.** "Add `uiSession` to inject / re-register the slot" is *directionally* right for the migration but is **not** a fix on its own: line 34 would still read a field that no longer exists, so adding the inject name alone leaves the symptom unchanged. More importantly, because lines 41–47 never execute on alpha.2, this reading says **nothing** about whether `sessions.scope(id)` still returns a usable session-scoped ctx, whether `actx.get('conversation')` still resolves, or whether `ctx.uiConversation.binding(id)` still yields `views.get('chat')`. Those remain unverified by the evidence pack and must be probed separately (see §4). The release note's "相关 API 及 slot 有变化" likewise leaves the slot side unverified here.
- **Release-note items 1 and 4** (runtime plugin dependency resolution / runtime unload; 创造模式 Cordis changes) are not implicated by the symptom, but they are not excluded by this reading either — they are simply orthogonal.

## 2. Evidence mapping

**Conclusion.** alpha.1's `SessionListState` carried the *navigation* state (`current`) inside the global list snapshot; alpha.2's `SessionListSnapshot` carries only catalog/counts (`items`, `state`, `phase`, `error`, `subagentsByParent`, `jobsBySession`) — navigation was moved out to the view owner. So the plugin receives `undefined` where it used to receive a `SessionId`. The canonical replacement read is `uiSession.adapter.current` → `SessionBindingValue`, whose `key` replaces `list…current` and whose `ctx` replaces `sessions.scope(id)` for session-scoped service resolution.

### 2.1 What changed about the snapshot the plugin reads

| | alpha.1 `SessionListState` | alpha.2 `SessionListSnapshot` |
|---|---|---|
| session catalog | `byId: Readonly<Record<SessionId, SessionSummary>>` | `items: readonly SessionListEntry[]` |
| **navigation** | `current: SessionId \| undefined` — *"the session the main conversation view is currently bound to"* | **removed — no equivalent field** |
| load state | — | `state: 'idle' \| 'loading' \| 'error'`, `phase: SessionListPhase`, `error: RemoteFailure \| null` |
| derived catalogs | — | `subagentsByParent`, `jobsBySession` |

Two fields the plugin could have used are gone (`current`, `byId`); only `current` is on this plugin's path. The semantic change is stated outright in the alpha.2 comment on `ISessions.list`:

> *"Host catalog and local reference-source counts; **navigation belongs to view owners**."*

So the global sessions controller stopped publishing *which session the main view is bound to*; that state moved into the view owner. The driver is the release note *"客户端 Session 会话支持多实例共存，相关 API 及 slot 有变化"*: a single global `current` cannot express several concurrently live session bindings, so per-binding state replaced it.

### 2.2 What the plugin now receives on every keystroke

`sessions.list.getSnapshot().current` is `undefined` **on every keystroke, forever** — regardless of how many sessions exist or which one the user is looking at. Crucially the property is not merely empty, it is **absent**:

```ts
Object.prototype.hasOwnProperty.call(sessions.list.getSnapshot(), 'current') === false   // alpha.2
```

That distinction is the whole story: a *value*-level test (`=== undefined`) cannot tell "field removed" from "no session open", which is why line 35 hides the breakage; a *key*-level test (`'current' in snap`) tells them apart immediately. (Verified by running the plugin's `resolve()` verbatim against both snapshot shapes — see §5.4.)

### 2.3 The canonical replacement read (alpha.2)

From `ui-session-service-alpha2.d.ts`:

- **Service**: `UiSession`, exported by `@deepseek-ai/dsh-client-ui-session/client`, inject name **`uiSession`** (a `Service` subclass owning per-Session bindings and the main-view selection).
- **Observable**: **`uiSession.adapter.current`**, typed `ObservableSnapshot<SessionBindingValue>` — *"Binding source of the main view's current session"*, i.e. the renderer-facing adapter for the session / session-maybe slot scopes.
- **Shape of the value** (`SessionBindingValue`):
  ```ts
  interface SessionBindingValue {
      readonly key: SessionId            // the bound session's id
      readonly ctx: Context              // the session-scoped context
      readonly hooks: Record<string, unknown>
      readonly keyedHooks: Record<string, Record<string, unknown>>
      readonly props: Record<string, unknown>
  }
  ```
- **Field replacing `sessions.list.getSnapshot().current`**: `SessionBindingValue.key` — *"the bound session's id"*.
- **Field replacing `sessions.scope(id)` for session-scoped service resolution**: `SessionBindingValue.ctx` — *"the session-scoped context: services registered under this session resolve here."*
- **Absence semantics differ from the legacy read, and this matters**: *"SessionBindingValue.key of the absent binding is undefined; the service publishes the absent value while no main session is retained."* On alpha.2 the observable **always** publishes a value; "no session" is signalled by `value.key === undefined`, **not** by `value === undefined`. Testing the wrong one converts the fix into a brand-new silent no-op.
- `UiSession` additionally exposes `sourceFor(owner)`, `adapter.bindingSource(target)` and `provide(descriptor)` (per-session standard-source contributions — how stock packages such as ui-chat publish per-session hooks). That is the host's replacement for per-session slot registration, and it is where to look if this plugin ever needs to *contribute* per-session hooks rather than only read state.

## 3. Migration recipe (single build, both hosts)

**Conclusion.** Feature-detect, don't version-detect: read the main-view binding from `uiSession.adapter.current` when present, otherwise fall back to `sessions.list…current` + `sessions.scope(id)`. Add `'uiSession'` to `inject`; the session-scoped `Context` that `conversation` resolves under now comes from `SessionBindingValue.ctx` (alpha.2) or `sessions.scope(id)` (alpha.1).

### 3.1 Corrected resolution — one build, both hosts

Feature-detect, never version-detect: prefer the alpha.2 binding value when the service is there, fall back to the alpha.1 fields when it is not.

```ts
import type { Context as ClientContext } from '@deepseek-ai/cordis'
import type { ISessions } from '@deepseek-ai/dsh-api-session-controller/client'
import type { SessionBindingValue, UiSession } from '@deepseek-ai/dsh-client-ui-session/client'
import type {
  ConversationNode, IConversation, SessionInput,
} from '@deepseek-ai/dsh-client-ui-conversation/client'
import type {} from '@deepseek-ai/dsh-client-ui-chat/client'
import { down, extractHistory, IDLE, resync, up, type HistoryBrowse } from './history.ts'
import { applyWithCompat } from './compat.ts'

export const name = 'dsh-input-history'

/** alpha.2 needs the session-binding service; alpha.1 simply does not provide it. */
export const inject = ['sessions', 'uiConversation', 'conversation', 'uiSession']

/** The per-press session resolution: current session, its input facade and chat nodes. */
interface ResolvedSession {
  readonly input: SessionInput
  readonly nodes: readonly ConversationNode[]
}

/** Main-view session id + its session-scoped Context, whichever host is running. */
interface CurrentSession {
  readonly id: string | undefined
  readonly ctx: ClientContext | undefined
}

const EMPTY_NODES: readonly ConversationNode[] = []

/**
 * Dual-host read of "the session the main conversation view is bound to".
 *   alpha.2 -> uiSession.adapter.current  (SessionBindingValue.key / .ctx)
 *   alpha.1 -> sessions.list…current + sessions.scope(id)
 * Feature-detected, never version-detected: one build serves both hosts.
 */
function readCurrentSession(ctx: ClientContext): CurrentSession {
  const uiSession = ctx.uiSession as UiSession | undefined
  const current = uiSession?.adapter?.current
  if (current !== undefined) {
    // The service always publishes a value; an absent binding has key === undefined.
    const value = current.getSnapshot() as SessionBindingValue | undefined
    if (value === undefined) return { id: undefined, ctx: undefined }
    return { id: value.key, ctx: value.ctx }
  }
  const state = ctx.sessions.list.getSnapshot() as { readonly current?: string }
  const id = state.current
  if (id === undefined) return { id: undefined, ctx: undefined }
  return { id, ctx: ctx.sessions.scope(id) }
}

function applyBody(ctx: ClientContext): void {
  let browse: HistoryBrowse = IDLE
  let lastSessionId: string | undefined

  const sessions: ISessions = ctx.sessions

  const resolve = (): ResolvedSession | null => {
    const current = readCurrentSession(ctx)
    const id = current.id
    const actx = current.ctx
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

  // onKeyDown / ctx.effect unchanged from the shipped version.
}
```

Only three things change relative to the shipped file: the `inject` array, the new `readCurrentSession` helper, and the first four lines of `resolve()`. `onKeyDown`, the `ctx.effect` listener wiring, the history state machine and the `setDraft` write path are untouched.

### 3.2 What must change in the `inject` declaration

```diff
- export const inject = ['sessions', 'uiConversation', 'conversation']
+ export const inject = ['sessions', 'uiConversation', 'conversation', 'uiSession']
```

- On **alpha.2** the runtime resolves the new service and `ctx.uiSession` is live.
- On **alpha.1** the name resolves to nothing; every access must therefore be defensive (`ctx.uiSession?.adapter?.current`) and a missing `uiSession` must **never** be treated as an incompatibility — it is the legacy path, not a broken host. Getting this backwards makes the hardened guard (§4) start banner-ing on the *old* host.
- **One point the evidence pack cannot settle**: whether the host's `inject` machinery tolerates a service name that does not exist on the older host, or hard-fails activation. The shipped guard's own `ctx?.sessions?.list` optional-chaining style suggests accesses degrade to `undefined`, but this must be confirmed against the installed alpha.1/alpha.2 packages before merging. If it does hard-fail, keep `inject` unchanged and resolve the service from the context at call time instead.

### 3.3 How the session-scoped context reaches the conversation service

- **alpha.1 (legacy)**: `sessions.scope(id)` → `Context`; then `actx.get('conversation')`; then `conversation.input.for(actx)` — the input facade is parameterised by that session ctx.
- **alpha.2 (canonical)**: the session-scoped ctx is **published per binding** as `SessionBindingValue.ctx`; `actx.get('conversation')` on that ctx resolves the same session-scoped conversation service, and `conversation.input.for(actx)` keeps working because the facade is still parameterised by the session ctx.
- So the *only* thing that changes is **where `actx` comes from**. The service-resolution call `actx.get('conversation')` and the facade call `conversation.input.for(actx)` are byte-identical on both hosts — that is what makes a single build possible.
- `sessions.scope(id)` is retained purely as the alpha.1 fallback. The alpha.2 excerpt's NOTE confirms it still exists there, so the fallback stays safe even if the binding read is ever unavailable.
- `ctx.uiConversation.binding(id)` is still called with the `SessionId` from `value.key` — valid on both hosts. **Caveat**: the pack contains no alpha.2 excerpt for `uiConversation`, so its `binding(id).snapshot…views.get('chat')` shape is unverified; if it also drifted, the same key-existence probe from §4 must be applied there.

## 4. Guard hardening

**Conclusion.** A presence check on a service member says nothing about the *shape of the values* that member returns — this breakage is a field-level removal inside a published snapshot, which is invisible to `typeof ctx.sessions.list === 'object'`. The hardened guard must probe a **real read of the actual data path** (key-existence on the snapshot, then a full resolve round-trip), and it must run **after the host has published live session data** (first use / on binding emission), not only once at activation — because at activation "no session yet" and "field removed" are byte-identical.

### 4.1 The class of breakage presence-checks cannot catch

`typeof ctx.sessions.list === 'object'` and `typeof ctx.sessions.scope === 'function'` are statements about the **service object**. Both stayed true across the refactor. What changed was the **payload of an observable the service publishes** — a field was deleted from `SessionListSnapshot`. Presence checks are therefore blind to the whole family of **contract-shape drift behind stable names**:

1. **Fields removed, renamed or retyped inside published snapshots** — exactly this case (`current`, `byId` gone; `items`, `state`, `phase`, `error`, `subagentsByParent`, `jobsBySession` added).
2. **Observables that keep emitting with a different shape** — the guard never calls `getSnapshot()`, so it cannot see that the payload changed.
3. **Degraded return values** — e.g. `sessions.scope(id)` returning a *root* ctx instead of a session-scoped one. Every presence check passes, yet services resolve in the wrong scope and per-session state silently leaks or vanishes.
4. **Same name, different meaning** — `list` went from "session-list *state*" to "host *catalog* + reference-source counts" (its own doc comment says so). A presence check cannot detect a semantic rewrite.
5. **The correct source moving to a different service** — session-scoped resolution now lives on `uiSession`, not on `sessions`. No check of `sessions` can ever reveal that.
6. **Time-dependent availability** — services that appear or change *after* activation, or whose data only exists once a session is retained.

Presence checks answer "is the host too old / was this service deleted?". They cannot answer "did the host rewrite the contract under a stable name?" — which is precisely the alpha-series hazard: names are stable across alphas, shapes are not.

### 4.2 What the hardened guard should probe instead

Probe **one real round-trip of the actual data path**, asserting on **values**, never on member presence:

```ts
/** Returns the list of concrete contract violations, empty when the host is usable. */
function probeContract(ctx: ClientContext): string[] {
  const problems: string[] = []
  const snap = ctx.sessions?.list?.getSnapshot?.()
  if (snap === undefined) { problems.push('sessions.list.getSnapshot() unavailable'); return problems }

  // 1. KEY-EXISTENCE, not value: this is the check that fails loudly on alpha.2.
  //    '=== undefined' is exactly what hid the breakage — never use it here.
  const legacyNav = Object.prototype.hasOwnProperty.call(snap, 'current')

  // 2. Full resolve round-trip against live data, on whichever path exists.
  const uiSession = ctx.uiSession as UiSession | undefined
  const current = uiSession?.adapter?.current
  if (current !== undefined) {
    const value = current.getSnapshot() as SessionBindingValue | undefined
    if (value === undefined || typeof value !== 'object') {
      problems.push('uiSession.adapter.current published no value')
    } else {
      if (!('key' in value) || !('ctx' in value)) problems.push('SessionBindingValue missing key/ctx')
      else if (value.ctx === undefined || typeof value.ctx.get !== 'function') {
        problems.push('SessionBindingValue.ctx is not a Context')
      }
    }
  } else if (!legacyNav) {
    problems.push("sessions.list snapshot has no 'current' and no uiSession.adapter.current")
  }

  // 3. Session-scoped service resolution must actually resolve.
  const session = readCurrentSession(ctx)
  if (session.id !== undefined && session.ctx !== undefined) {
    const conversation = session.ctx.get('conversation') as IConversation | undefined
    if (conversation === undefined) problems.push("session ctx has no 'conversation' service")
    else if (typeof conversation.input?.for !== 'function') problems.push('conversation.input.for missing')
  }
  return problems
}
```

Assertions are **field/type assertions on the observed value** (`'current' in snap`, `'key' in value`, `typeof value.ctx.get === 'function'`), so a removal yields `false` instead of a vacuous pass. Failures must be reported through the *existing* remediation banner **and** a `console.error` naming the exact probe that failed — visible and diagnosable, not just visible.

### 4.3 When the probe must run

**Not only at activation.** Two reasons:

- At activation there may be **no retained session yet**, in which case `current === undefined` / `value.key === undefined` is *legitimate*. An activation-only probe then passes vacuously — the same vacuous pass that made the shipped guard useless here.
- The host now resolves plugin dependencies at runtime (release note 1), so services can appear or change shape after activation.

The probe must therefore run at four points:

1. **At activation** — but only the cheap, session-independent part: key-existence on the list snapshot and the presence/shape of `uiSession.adapter.current`.
2. **On first real use** — inside `onKeyDown`, *before* the result is consumed. This is the point where a session is guaranteed to be open and the probe is non-vacuous.
3. **On every emission** of the binding / list observable (subscribe in the `ctx.effect`), so a mid-session host change is caught.
4. **After the listener effect is installed**, once the host has had a chance to publish its first snapshot.

Practical shape: keep a `probeFailed` flag; on the first keystroke, if the probe fails, render the remediation banner, `console.error` the failing probe, and **stop swallowing the chord** so the user at least sees native behaviour while the maintainer sees a diagnostic. Re-probe on every session switch.

## 5. Verification and prevention

**Conclusion.** Verify with a throwaway probe build that logs `Object.keys()` of both snapshots plus which branch resolved, then the same dual-host bundle on an untouched alpha.1 host (second install/profile, no downgrade of the current one) — no full migration needed, only `resolve()` + `inject` + guard change. The single host-side change that makes this loud: ship the removal as a **deprecation shim** — keep `current` on the published snapshot as a getter that returns `undefined` but emits a one-time loud `console.error` naming the field and its replacement, and mark it `@deprecated` in `SessionListSnapshot` so any rebuild fails type-check.

### 5.1 Verify the fix on alpha.2 without a full migration

1. **Prove the diagnosis first, independently of any fix.** Ship a throwaway probe client plugin (or a temporary debug block in the same bundle) whose `apply` logs:
   ```ts
   const snap = ctx.sessions.list.getSnapshot()
   console.log('list snapshot keys:', Object.keys(snap))
   console.log("has 'current':", Object.prototype.hasOwnProperty.call(snap, 'current'))
   const u = ctx.uiSession as UiSession | undefined
   console.log('uiSession present:', !!u)
   if (u) console.log('binding value:', u.adapter.current.getSnapshot())
   ```
   Load it on the current alpha.2 host with a session open. Expected output: **no `current` key**, `uiSession present: true`, and a binding value whose `key` is the open session's id with a non-null `ctx`. That one log line settles attribution before anything is changed. (Equivalently, temporarily expose the reads as `window.__dshProbe` from the debug build and inspect them from F12 — no migration, no host change.)
2. **Apply the §3 change** (`readCurrentSession` + `inject` + guard probe). Nothing else moves: the history state machine, the draft read/write, the chat-node extraction and the keydown capture are untouched — this is a resolution fix, not a migration.
3. **Functional check on alpha.2**: open a session, send two messages, then
   - `Ctrl+Up` → composer fills with the last sent message;
   - `Ctrl+Up` again → the one before it;
   - `Ctrl+Down` → walks back;
   - at the top/bottom the chord must **fall through** (no `preventDefault`), exactly as on alpha.1.
   F12 must show the alpha.2 branch taken and no probe failure; the other five plugins must be unaffected.
4. **Regression check on alpha.1**: the hardened guard must **not** start banner-ing on the old host merely because `uiSession` is missing — the legacy branch must be selected silently. This inversion (guard failing on the *legacy* host) is the classic dual-host bug and must be tested explicitly.

### 5.2 Verify on alpha.1 without downgrading the current host

- Use a **second, untouched alpha.1 environment** (separate npm global prefix, profile dir, or container) and junction the **same built bundle** there. Expected: the legacy branch is taken, recall behaves identically, no banner. Do not downgrade the alpha.2 install in place.
- If no alpha.1 host is reachable inside the container, verify at unit level instead: stub the two snapshot shapes taken verbatim from the two `.d.ts` excerpts (alpha.1 `{ byId, current }` + `scope(id)`; alpha.2 `SessionListSnapshot` + `adapter.current` publishing `SessionBindingValue`) and assert that `readCurrentSession` returns the same `{ id, ctx }` for both, and that the *unpatched* `resolve()` returns `null` on the alpha.2 stub — i.e. reproduce the bug and then the fix in one harness.

### 5.3 The single host-side change that makes this loud

**Ship the removal as a deprecation shim instead of deleting the field.** In the sessions service at alpha.2, keep publishing `current` on the `SessionListSnapshot` object as a **getter** that returns `undefined` but, on first access, emits a one-time loud `console.error` (routed through the host's compat/banner channel) naming the removal and its replacement:

```
[dsh-api-session-controller] sessions.list.current was removed in 0.1.6-alpha.2
(multi-instance session refactor). Use uiSession.adapter.current ->
SessionBindingValue.key (session id) and SessionBindingValue.ctx
(session-scoped Context) from @deepseek-ai/dsh-client-ui-session.
```

and mark the property `@deprecated` with the same text in `SessionListSnapshot`'s `.d.ts`, so any plugin that *does* rebuild fails type-check with a pointer to the replacement.

**Why a runtime shim and not a type-only change:** a type-only removal (what actually shipped) only bites plugins re-compiled against the new `.d.ts`. This plugin is junction-linked as a prebuilt bundle and is never re-type-checked, so the compile-time signal never fires — that is exactly why the breakage stayed silent in the field. The getter converts the first post-upgrade read (the first `Ctrl+Up`) into an unmistakable console error, and costs one property on one published object for one alpha. Routed through the host's compat channel it also surfaces in the plugin manager at activation, which is the loudest available placement.

The general rule it instantiates: **a host must never remove a field from a published observable's payload silently.** Every field removal should ship as (a) a `@deprecated` type entry pointing at the replacement, and (b) a runtime warning getter for at least one alpha, so prebuilt plugins fail loudly at the read site instead of degrading into a no-op.

### 5.4 Checks actually executed during this diagnosis

- Ran the plugin's `resolve()` verbatim against faithful JS mirrors of both snapshot shapes (`agent-output/S23-passing-compat-guard-trap/tmp/repro.mjs`, node):
  - alpha.1 stub → `snapshotKeys: ["byId","current"]`, `hasCurrentKey: true`, legacy `resolve()` → `{ id: "s1", … }`.
  - alpha.2 stub → `snapshotKeys: ["items","state","phase","error","subagentsByParent","jobsBySession"]`, `hasCurrentKey: false`, legacy `resolve()` → **`null`** (the silent no-op), dual-host `resolve()` → `{ id: "s1", … }` on **both** stubs.
- Read-only inspection of all seven fixture files; no installation, migration, or host command was run.
