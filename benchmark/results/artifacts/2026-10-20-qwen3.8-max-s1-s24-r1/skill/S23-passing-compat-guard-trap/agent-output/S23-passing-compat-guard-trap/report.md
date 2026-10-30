# S23 · The Compat Guard That Passed — Diagnosis Report

**Mode**: A · inspect (read-only) per skill `plugin-upgrade`. No fixture file was modified; no install/migration was executed.
**Corridor**: `@deepseek-ai/dsh` 0.1.6-alpha.1 → 0.1.6-alpha.2 (npm global, Windows web profile, six junction-linked external client plugins).
**Governing card**: **DSH-0.1.6-A2-01** (references/v0.1.6-alpha.2.md) — multi-instance Session references: `SessionListState.current` removed; resolve the main Session through `uiSession.adapter.current`. Supporting context: DSH-0.1.6-A2-03 (link-installed plugins outside Plugin Manager), DSH-0.1.6-A2-04 (npm publish lag). The card's first-hand fleet evidence is literally this plugin family (`dsh-input-history`, fixed upstream in v0.1.15).
**Evidence base**: `fixture/symptom-report.md`, `fixture/plugin/src-client-index.ts`, `fixture/host-types/session-list-alpha1.d.ts`, `fixture/host-types/session-list-alpha2.d.ts`, `fixture/host-types/ui-session-service-alpha2.d.ts`, `fixture/upgrade-notes.txt`.

---

## 1. Silent-failure attribution

### 1.1 The exact read that fails

The per-keystroke path is `onKeyDown → resolve() → (extractHistory / up / down) → input.setDraft`. The failing read is the **first statement of `resolve()`** (`src-client-index.ts:34`):

```ts
const id = sessions.list.getSnapshot().current
```

On alpha.1, `sessions.list` published a `SessionListState` whose `current: SessionId | undefined` was "the session the main conversation view is currently bound to". On alpha.2 the multi-instance refactor replaced that payload with `SessionListSnapshot` (`items / state / phase / error / subagentsByParent / jobsBySession`) — **there is no `current` property on the snapshot object anymore**. TypeScript interfaces are erased at runtime; a property read of an absent key on a plain object is legal JavaScript and yields `undefined`. So on alpha.2 this line evaluates to `undefined` on every keystroke — no throw, no rejection, nothing logged.

### 1.2 Why the failure mode is a silent no-op, not an exception

`resolve()` is written defensively, and that defensiveness is exactly what silences the break:

1. `:34` → `id === undefined`
2. `:35` → `if (id === undefined) return null` — the designed "no session open" branch, indistinguishable from the removed-field case
3. `:56` in `onKeyDown` → `if (resolved === null) return` — early return **before** `e.preventDefault()` / `e.stopPropagation()` (`:61–62`)

Because the handler returns before claiming the event, the chord falls through to the composer's default key handling. This matches the symptom report precisely: "the chord is not swallowed either — the composer's own multi-line cursor movement still works". The plugin never reaches a code path that could throw or log; the removed field's `undefined` is **value-aliased** with alpha.1's legitimate "no current session" state, so even the plugin's own null-handling cannot tell breakage from idleness. Downstream reads (`sessions.scope(id)`, `actx.get('conversation')`, `uiConversation.binding(id)`) are never executed — the failure point is strictly the snapshot field read.

### 1.3 Why there is no console error

Nothing in the chain throws: absent-key property access returns `undefined`; `resolve()` returns `null` through its normal branch; `onKeyDown` returns normally. The plugin has no logging on the null path (a design gap — see §4.4). The capture listener itself is healthy and firing on every Ctrl+Up/Down; it just bails at `:56` every time. Hence "zero errors, zero warnings … Nothing."

### 1.4 Why the compat guard passes

The shipped guard (`apply()`, `:83–88`) probes **four service-member presences**:

| Probe | Status on alpha.2 |
|---|---|
| `ctx.sessions.list` | present — the member survives; only its snapshot **payload type** changed (`SessionListState` → `SessionListSnapshot`) |
| `ctx.sessions.scope` | present — the alpha.2 excerpt states explicitly: "scope(id) still exists on ISessions at alpha.2" |
| `ctx.sessions.sessionOf` | present (scenario stipulates the guard reports compatible) |
| `ctx.uiConversation.binding` | present — untouched by this edge |

All four members exist, so `applyWithCompat` sees a healthy host and runs `applyBody`. The guard checks the **service/member layer**; the breakage lives **one layer down**, in the **shape of the value** an existing member returns. Presence of `sessions.list` says nothing about which fields its snapshots carry — and `sessions.scope` surviving is a decoy: it is reachable only with an id the plugin can no longer obtain.

### 1.5 Which already-tried suspicions this settles, and which it does not

**Settled by this reading:**

- **#1 (console clean)** — explained: no operation in the path can throw; failure is `undefined`-propagation through designed null branches (§1.2–1.3).
- **#2 (guard passed / no banner)** — explained: all probed members exist; the removed thing is a *field inside a snapshot*, below the guard's resolution (§1.4).
- **#6 (chords not taken by anything else)** — explained and consistent: `preventDefault` is only reached after a successful `resolve()`; with `resolve() === null` the event is never claimed, so removing the plugin changes nothing observable.
- **#3 (junction re-link, hard refresh) and #4 (other plugins disabled)** — rendered moot: the boot log shows `@dsh-external/dsh-input-history/client.js` in the 57-entry combo with "no pending entries"; the artifact is loading. The cause is the host's API surface, not link topology, bundle staleness, or inter-plugin conflict.

**Not addressed by this reading:**

- **#5 (update chip says "latest version")** — the plugin-release-currency question is orthogonal to host-shape evidence. Whether the published "latest" actually contains an alpha.2-adapted build (upstream shipped the fix in dsh-input-history v0.1.15 per card DSH-0.1.6-A2-01), or whether the chip is comparing the wrong coordinate for a junction-linked dev copy that Plugin Manager does not manage (card DSH-0.1.6-A2-03), cannot be settled from the type excerpts. It requires checking the plugin's own repository/registry version against the junction content.
- The **colleague's inject theory** ("add `uiSession` to the inject list") is only *partially* settled: adding `uiSession` to `inject` is a necessary piece of the fix (§3), but by itself it changes nothing — the resolution path must be rewritten to read the new observable.

---

## 2. Evidence mapping

### 2.1 What changed in the session-controller snapshot (alpha.1 → alpha.2)

**alpha.1** (`session-list-alpha1.d.ts`): `ISessions.list: ObservableSnapshot<SessionListState>` with

- `byId: Readonly<Record<SessionId, SessionSummary>>` — session summaries by id
- `current: SessionId | undefined` — "the session the main conversation view is currently bound to"

**alpha.2** (`session-list-alpha2.d.ts`): `ISessions.list: ObservableSnapshot<SessionListSnapshot>` with

- `items: readonly SessionListEntry[]`, `state: 'idle' | 'loading' | 'error'`, `phase`, `error`, `subagentsByParent`, `jobsBySession`
- **No `current`, no `byId`**; the member doc now reads "Host catalog and local reference-source counts; **navigation belongs to view owners**".

Semantics: the global list was demoted from *view-state carrier* to *catalog*. With multi-instance Session references, "current" stopped being a global fact and became **main-view occupancy**, expressed as a per-session reference count (`retainedBy.mainView > 0`, per card DSH-0.1.6-A2-01) and owned by the new `uiSession` service. Also on alpha.2's `ISessions`: `retain(target, options): SessionReference` is the new entry point; `scope(id)` still exists but is now a second-class path you can only use if you already hold an id.

**Implication for the plugin's per-keystroke value**: every call to `sessions.list.getSnapshot().current` on alpha.2 receives `undefined` — 100% of keystrokes, deterministically, from the first chord after the upgrade. `resolve()` therefore always returns `null` at its first guard, and the plugin is permanently in its "no session open" idle branch even with a session open on screen.

### 2.2 The canonical replacement read (from `ui-session-service-alpha2.d.ts`)

- **Service**: `UiSession`, exported by the client bundle `@deepseek-ai/dsh-client-ui-session`, Cordis inject name **`uiSession`** — "Root service owning per-Session bindings and the main-view selection". Per card DSH-0.1.6-A2-01 it is *not new in alpha.2*: the same package registers it on alpha.1 too (alpha.1's `ui-approval` already injects it), which is what makes a one-build dual-host fix possible.
- **Observable**: `uiSession.adapter.current: ObservableSnapshot<SessionBindingValue>` — "Binding source of the main view's current session" (the renderer-facing adapter for session / session-maybe slot scopes). Subscribable via `adapter.current.subscribe(listener)` if the consumer caches the id; `adapter.bindingSource(target)` and `sourceFor(owner)` resolve explicit bindings.
- **Value shape**: `SessionBindingValue`:
  - `key: SessionId` — the bound session's id; **`key` of the absent binding is `undefined`** (the service publishes the absent value while no main session is retained) — the same graceful "no session" signal alpha.1's `current` provided;
  - **`ctx: Context`** — "The session-scoped context: services registered under this session resolve here". **This is the field that replaces `sessions.scope(id)`** for session-scoped service resolution: instead of id → `scope(id)` → scoped Context, alpha.2 hands you the scoped Context directly on the binding value;
  - `hooks`, `keyedHooks`, `props` — standard sources contributed via `provide()` descriptors (e.g. ui-chat's per-session hooks); not needed by this plugin.

---

## 3. Migration recipe (one build, both hosts)

### 3.1 `inject` declaration change

```ts
// before
export const inject = ['sessions', 'uiConversation', 'conversation']
// after — add 'uiSession'
export const inject = ['sessions', 'uiConversation', 'uiSession', 'conversation']
```

- `uiSession` must be a **hard inject**: `@deepseek-ai/dsh-client-ui-session` registers it on both tags (DSH-0.1.6-A2-01), so it resolves on both hosts; and on any hypothetical host lacking it, Cordis leaves the plugin pending → a **loud activation failure** instead of another silent no-op — the failure direction we want.
- `sessions` stays (legacy fallback path on alpha.1; `scope` still used there). `uiConversation` and `conversation` are unchanged.
- Note: the colleague's suggestion stops here; adding the inject alone is inert — the resolution path below is the actual fix.

### 3.2 Corrected resolution function (dual-host)

```ts
import type { Context as ClientContext } from '@deepseek-ai/cordis'

/** Minimal structural view — keeps one build typechecking against either host's d.ts. */
interface MainSessionRef {
  readonly id: string
  /** The session-scoped Cordis Context; per-session services (conversation) resolve here. */
  readonly actx: ClientContext
}

/**
 * Resolve the main-view session on BOTH hosts from one build:
 * - alpha.1 (legacy): sessions.list snapshot carries `current`; sessions.scope(id) yields the ctx.
 * - alpha.2 (canonical): uiSession.adapter.current yields { key, ctx } — the binding value's
 *   `ctx` replaces sessions.scope(id). The adapter path also exists on alpha.1 (DSH-0.1.6-A2-01),
 *   so it doubles as the forward path; the legacy field is only consulted first when present.
 */
function resolveMainSession(ctx: ClientContext): MainSessionRef | null {
  // 1) Legacy alpha.1 field. On alpha.2 `current` is absent from the snapshot, so this
  //    read is undefined and we fall through — no throw, no host-version sniffing needed.
  const snap = ctx.sessions?.list?.getSnapshot?.() as
    | { current?: string | undefined }
    | undefined
  const legacyId = snap?.current
  if (legacyId !== undefined) {
    const actx = ctx.sessions.scope?.(legacyId) as ClientContext | undefined
    if (actx !== undefined) return { id: legacyId, actx }
  }
  // 2) Canonical alpha.2 read: main-view binding from the uiSession slot-scope adapter.
  //    Absent binding publishes key === undefined -> graceful null, same as alpha.1 idle.
  const binding = ctx.uiSession?.adapter?.current?.getSnapshot?.() as
    | { key?: string | undefined; ctx?: ClientContext | undefined }
    | undefined
  if (binding?.key !== undefined && binding.ctx !== undefined) {
    return { id: binding.key, actx: binding.ctx }
  }
  return null
}
```

And `resolve()` inside `applyBody` becomes (rest of the plugin untouched):

```ts
const resolve = (): ResolvedSession | null => {
  const main = resolveMainSession(ctx)
  if (main === null) return null
  if (main.id !== lastSessionId) {
    // Session switch: recall must start fresh on the new session.
    browse = IDLE
    lastSessionId = main.id
  }
  const conversation = main.actx.get('conversation') as IConversation | undefined
  if (conversation === undefined) return null
  const chat = ctx.uiConversation.binding(main.id).snapshot.getSnapshot().views.get('chat')
  const nodes = chat === undefined ? EMPTY_NODES : chat.legacy.nodes
  return { input: conversation.input.for(main.actx), nodes }
}
```

Behaviour notes:

- **Ordering is safe on both hosts**: on alpha.1 with a session open, the legacy branch answers; with no session open, both branches yield `null` — identical to the old behaviour. On alpha.2 the legacy read is always `undefined` (field gone), so the adapter answers. Discrimination is by *value presence*, not version strings or `in`-checks against objects whose key-set construction we don't control.
- **No caching problem**: the plugin resolves per keystroke, so `getSnapshot()` at event time is correct and no subscription is required. (If a future revision caches the id, subscribe via `ctx.uiSession.adapter.current.subscribe(listener)` — card DSH-0.1.6-A2-01.)
- **Alternative alpha.2-only derivation** (not needed for the dual build, listed for completeness): the main session is also derivable from the catalog as the row with `retainedBy.mainView > 0` — the card's marker — but `uiSession.adapter.current` is the canonical public path that works on both tags.

### 3.3 How the session-scoped context reaches the conversation service

`conversation` is not a root service the plugin can inject once — it is registered **per session, inside the session-scoped Cordis Context**. The carrier of that scope changes with the host:

- alpha.1: id → `sessions.scope(id)` → scoped `Context`
- alpha.2: main-view binding → `SessionBindingValue.ctx` → the same kind of scoped `Context`

The corrected code obtains `actx` from whichever path answered, then (a) resolves the per-session conversation service with the **weak get** `actx.get('conversation')` (may be `undefined` until the session's UI mounts — keep the null branch), and (b) passes the **same scoped ctx** into `conversation.input.for(actx)`, which binds the returned `SessionInput` facade to that session. The root `ctx` is never a valid substitute for `actx` in either call; `uiConversation.binding(main.id)` continues to key on the session id exactly as before.

---

## 4. Guard hardening

### 4.1 The class of breakage presence-checks cannot catch

The shipped guard asserts "member X exists on service Y". That class of probe is blind to everything **below the member layer**:

1. **Field-level removal/rename inside returned payloads** — this incident: `list` exists, `list.getSnapshot()` works, but a field the consumer reads from the payload is gone. Types are erased at runtime; an absent key reads as `undefined`.
2. **Payload-type substitution** — the member's return type changed wholesale (`SessionListState` → `SessionListSnapshot`) while the member's own name and callable shape stayed identical.
3. **Semantic drift** — a field survives with the same name but changed meaning/units/ownership (here: "current" moved from global list state to per-binding `retainedBy.mainView` occupancy).
4. **Value aliasing with legitimate empty states** — even a *value* probe (`snap.current === undefined?`) cannot distinguish "field removed" from "no session open", because the removed field's readout equals the old legitimate idle value.
5. **Decoy survivors** — `sessions.scope` still exists and passes its presence check, yet is useless without an id source; presence of a downstream member does not imply reachability of the full path.

General rule (mirrors the probe discipline in references/host-plane-probes.md): a probe must target **the actual contract the plugin consumes on the target tag**, never a stand-in whose survival is merely correlated. Presence-of-service guards are exactly such stand-ins.

### 4.2 What the hardened guard should probe instead

**Shape, not presence — and the real path, not proxies:**

1. **Snapshot shape classification** (activation-safe, session-independent): read `sessions.list.getSnapshot()` once and classify by positive markers of each published shape:
   - legacy marker: `byId`/`current` own properties present → alpha.1-shape host;
   - new marker: `items` (array) **and** `phase`/`jobsBySession` present → alpha.2-shape host.
   Classify by *positive* markers of the shape you intend to use; never by the mere absence of a key.
2. **Capability probe of the replacement path**: on a new-shape host, require `typeof ctx.uiSession?.adapter?.current?.getSnapshot === 'function'` **and** that calling it returns an object exposing `key` and (when `key` is defined) `ctx`. On a legacy-shape host, require `typeof ctx.sessions.scope === 'function'`.
3. **End-to-end probe of the plugin's own `resolve()`**: the guard's verdict must come from running the *same* function the keystroke handler runs — guard-pass ⇔ behaviour-possible, by construction. If `resolve()` returns `null` while an independent liveness signal says a main-view session exists (`adapter.current` binding `key` defined, or catalog rows with `retainedBy.mainView > 0`), that is an incompatibility, not idleness.

### 4.3 When the probe must run (lifecycle point)

Two tiers, because a single activation-time *value* probe is fundamentally ambiguous:

- **Tier 1 — at activation (inside `apply()`, before `applyBody`)**: run the shape classification + capability probe (§4.2 items 1–2). These do not depend on any session being open — both snapshot shapes exist from boot — so this tier **catches the present failure mode immediately at plugin activation**, on the first load after the upgrade, banner and all.
- **Tier 2 — deferred, at first live session**: subscribe to the main-view binding (`uiSession.adapter.current.subscribe`) or the session catalog; the first time a session is demonstrably bound, execute `resolve()` once (§4.2 item 3). If it returns `null` against a live binding → raise the remediation banner + a single `console.warn` with attribution. This tier catches residual semantic breaks that shape probes cannot express (e.g. `conversation` no longer registered in the scoped ctx, `input.for()` contract drift).

The shipped guard ran only at activation **and only on presence** — too shallow a probe at the one moment it ran. The fix is not "probe later" alone; it is "probe shape at activation, probe the real path when a session exists".

### 4.4 Cheap hygiene addition

Make the null path observable: when `onKeyDown` bails because `resolve() === null` **while the catalog shows a live main-view session**, emit a rate-limited `console.warn('[dsh-input-history] resolution no-op with live session — host API drift?')`. Silent no-ops are the failure *mode*; they should never also be silent in the *logs*.

---

## 5. Verification and prevention

### 5.1 Verifying the fix on both hosts without a full migration

Layered, cheapest first (mirrors the skill's validation ladder; none of this migrates the other five plugins or the host fleet):

1. **Shape unit tests (no host needed)**: exercise `resolveMainSession`/`resolve` against synthetic snapshots cloned from the two sealed d.ts excerpts — `{ byId, current }` (legacy), `{ items, state, phase, error, subagentsByParent, jobsBySession }` (new) — plus both absent-binding values. Assert: legacy shape + id → legacy branch (`scope(id)` used); new shape + binding `{key, ctx}` → adapter branch; absent → `null`, never a throw.
2. **Dual typecheck of the one build**: compile the plugin twice, once against each pinned declaration cohort (`@deepseek-ai/dsh-api-session-controller` + `@deepseek-ai/dsh-client-ui-session` at each tag), `skipLibCheck: false`. The *unguarded* legacy read must fail the alpha.2 compile (proving the break is statically visible for anyone who recompiles); the feature-detected build (structural casts as in §3.2) must pass both.
3. **Runtime behaviour on both hosts**: two disposable profiles, one per pinned host version — installed from an **external** terminal (`npm install -g @deepseek-ai/dsh@<exact>`; never inside a live dsh session, per the skill's global-upgrade discipline), junction-link the same plugin build into both. Cold-start `dsh web`, hard-refresh, then run card DSH-0.1.6-A2-01's verification triad:
   - one session open → Ctrl+Up fills the composer with the last sent message, Ctrl+Down walks back;
   - switching the main-view session → recall resets (`browse = IDLE`) and follows the new session;
   - no session open → chords fall through to composer defaults; `resolve()` returns `null` without throwing; console clean.
4. **Activation layer**: run the skill's `scripts/verify-runtime.mjs` against an isolated profile per host to confirm the entry activates and no injected service (now including `uiSession`) stays pending; for the Web client, prove registration/mount via the boot manifest rather than accepting a bare HTTP 200.

### 5.2 The single host-side change that would have made this loud

**A runtime deprecation trap in the service: keep publishing the removed key as a throwing accessor on the snapshot object.**

```ts
// inside the session-controller's snapshot publication, for one deprecation window:
Object.defineProperty(snapshot, 'current', {
  enumerable: false,
  get(): never {
    throw new Error(
      '[dsh] SessionListState.current was removed in 0.1.6-alpha.2 (multi-instance Session ' +
      'references). Read the main session via ctx.uiSession.adapter.current.getSnapshot().key ' +
      '(session-scoped ctx: binding.ctx). [DSH-0.1.6-A2-01]'
    )
  },
})
```

(Equivalent generalized form: publish snapshots behind a strict `Proxy` whose `get` trap throws on keys outside the current shape, turning *any* stale-field read into an attributed error.)

Why this is the right single change:

- **It fires at the first legacy read — which, with an activation-time shape probe (§4.2), is plugin activation itself.** Even for this plugin as shipped (reads only on keystroke), the first Ctrl+Up would throw an error carrying the exact migration recipe instead of producing `undefined`; the plugin's existing `applyWithCompat` banner machinery would light up, and the console would finally have something.
- **The types-only removal that actually shipped cannot be loud at runtime.** Deleting `current` from the interface breaks only consumers who *recompile* against the new d.ts; a prebuilt plugin bundle is never re-typechecked at host boot, so at runtime the deletion degrades to `undefined` — precisely the silence observed. Type removal is still correct hygiene, but loudness for the installed ecosystem requires the trap in the runtime object (service side), not just in the declarations.
- It costs one property, is removable after a deprecation window, and converts an entire breakage class (field-level removal behind surviving members) from "silent no-op" to "attributed exception with remediation text".

**Complementary prevention (plugin ecosystem side)**: guards should probe consumed *shapes and real paths* (§4), plugin authors should recompile against the pinned target-host declarations during any host upgrade (the alpha.2 typecheck would have flagged `.current` at build time — this is the static half of the same prevention), and post-upgrade diagnosis should treat "guard passes + feature dead" as the signature of sub-member-level drift, per references/troubleshooting.md.

---

*Report produced read-only from the sealed fixture plus skill card DSH-0.1.6-A2-01 (references/v0.1.6-alpha.2.md). Fixture unmodified; no installs, migrations, or network accesses performed.*
