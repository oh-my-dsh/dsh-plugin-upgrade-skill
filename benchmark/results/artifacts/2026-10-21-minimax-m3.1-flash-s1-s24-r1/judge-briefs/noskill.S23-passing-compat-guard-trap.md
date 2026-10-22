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
#### FILE: S23-passing-compat-guard-trap/S23-report.md

# S23 · The Compat Guard That Passed — Silent-Failure Report

**Subject**: `@dsh-external/dsh-input-history` (Ctrl+Up / Ctrl+Down composer recall) stops responding after `dsh-v0.1.6-alpha.1 → dsh-v0.1.6-alpha.2` (npm global, Windows, web profile, six junction-linked external client plugins).

**Evidence base**: the sealed fixture pack only — `symptom-report.md`, `plugin/src-client-index.ts`, `host-types/session-list-alpha1.d.ts`, `host-types/session-list-alpha2.d.ts`, `host-types/ui-session-service-alpha2.d.ts`, `upgrade-notes.txt`. No live-host introspection was performed (the installed host is a different version and therefore out of scope). Anything not derivable from the pack is marked **[unconfirmed]**.

---

## 0. One-line verdict

Alpha.2's multi-instance session refactor **silently removed the `current` field from the session-list snapshot**. The plugin still reads `sessions.list.getSnapshot().current`; on alpha.2 that property no longer exists, so the read yields `undefined` — a legal JavaScript property access that throws nothing. The plugin's own *"no session bound"* early return converts that `undefined` into a silent no-op **before** `e.preventDefault()`, which is why the chord is not even swallowed. Every member the shipped guard probes still exists at alpha.2, so the guard passes; the broken thing is one level *below* the member the guard checks.

---

## 1. Silent-failure attribution

### 1.1 The per-keystroke resolution path

From `fixture/plugin/src-client-index.ts` (line numbers as shipped):

| Line | Code | Fate on alpha.2 |
|---|---|---|
| 51 | `const sessions: ISessions = ctx.sessions` | OK — service present |
| 34 | `const id = sessions.list.getSnapshot().current` | **← the exact failing read.** `.current` is absent from `SessionListSnapshot` → `undefined` |
| 35 | `if (id === undefined) return null` | **returns here, every keystroke** |
| 41 | `const actx = sessions.scope(id)` | never reached |
| 43 | `actx.get('conversation')` | never reached |
| 45 | `ctx.uiConversation.binding(id)…` | never reached |
| 47 | `conversation.input.for(actx)` | never reached |
| 55–56 | `const resolved = resolve(); if (resolved === null) return` | early return |
| 60–64 | `preventDefault()` / `stopPropagation()` / `setDraft()` | **never reached** |

The plugin's own resolution function:

```ts
const resolve = (): ResolvedSession | null => {
  const id = sessions.list.getSnapshot().current      // line 34 — undefined on alpha.2
  if (id === undefined) return null                    // line 35 — taken on EVERY keystroke
  …
  const actx = sessions.scope(id)                      // line 41 — never reached
  …
}
```

**The exact read that now fails is `sessions.list.getSnapshot().current` (line 34), specifically the property access `.current` on the snapshot returned by `sessions.list.getSnapshot()`.** Nothing else in the path is reached. The type-level cause is in `2.

### 1.2 Why the compatibility guard passes

The shipped guard probes **four service members** (lines 83–88):

```ts
['sessions.list',          ctx?.sessions?.list],
['sessions.scope',         ctx?.sessions?.scope],
['sessions.sessionOf',     ctx?.sessions?.sessionOf],
['uiConversation.binding', ctx?.uiConversation?.binding],
```

Each entry is a *presence* check (is the member non-`undefined` / a function?). At alpha.2 all four still hold:

* `ctx.sessions.list` — still declared on `ISessions` in the alpha.2 excerpt (its *payload type* changed; the member did not).
* `ctx.sessions.scope` — the alpha.2 excerpt states explicitly: *"NOTE: `scope(id)` still exists on `ISessions` at alpha.2 but is omitted from this excerpt"*.
* `ctx.sessions.sessionOf` — not listed in the alpha.2 excerpt, but the maintainer observed **no banner**; since a missing `sessionOf` would make the guard fail and render the remediation banner, its continued presence at alpha.2 is *inferred from the absence of the banner* **[unconfirmed directly — inferred]**.
* `ctx.uiConversation.binding` — the symptom report states every other plugin keeps working, and the guard's own probe is satisfied.

**The guard therefore certifies "the door is still there". It cannot certify "the room still contains the field I walk into".** A *field-level* removal inside the value produced by a present member is invisible to a member-presence check. This is the whole trap.

### 1.3 Why there is no console error

The failing operation is `snapshot.current` where `snapshot` is a perfectly well-formed `SessionListSnapshot` object. Reading a **non-existent own property** in JavaScript returns `undefined`; it is not a `TypeError` (that would require reading a property of `undefined`/`null` — and `sessions.list.getSnapshot()` still returns a valid object). So:

* no exception is thrown → no stack trace, no unhandled rejection, no F12 console output;
* the value `undefined` flows into a pre-existing, legitimate branch of the plugin's own control flow (*"no session id → nothing to do"*);
* that branch was written to be quiet, so it stays quiet.

The plugin also never calls `console.*` on this path, and `ctx.effect()` only manages the listener lifetime — it has no error reporting of its own. Hence "zero errors, zero warnings from the plugin" is the *expected* output of this bug, not evidence of absence of failure.

### 1.4 Why it is a silent no-op rather than a thrown exception

Four properties of the code path conspire:

1. **The failure reuses an existing, intentional escape hatch.** `if (id === undefined) return null` is legitimate for "the user has no session bound". The bug is indistinguishable from that state.
2. **The return happens before the side effects.** `e.preventDefault()` / `e.stopPropagation()` / `resolved.input.setDraft(...)` are all *after* the early return. So the plugin does not half-work, does not leave the composer in a broken state, and does not consume the chord — the browser's own cursor movement runs, which is exactly what the maintainer observed: *"the chord is not swallowed either — the composer's own multi-line cursor movement still works"*. A thrown exception would instead have surfaced in the console; a swallowed chord with an intact cursor is the signature of "handler ran and returned early".
3. **No error boundary is engaged.** `ctx.effect()` only installs/removes the `keydown` listener; nothing wraps the handler in a try/catch that reports, and nothing re-throws into the host.
4. **The guard has already declared the host compatible**, so the host's "plugin incompatible" reporting path (the remediation banner) is switched off for this plugin by construction.

### 1.5 Which earlier suspicion this settles — and which it does not

**Settled (the colleague's note in `upgrade-notes.txt`):** *"Multi-instance refactor landed in alpha.2… Maybe your plugin needs to re-register its slot or re-declare inject? Have you tried adding 'uiSession' to the inject list?"*

* As the cause of the dead chord: **settled as NOT the cause.** Registration/`inject` resolution is healthy — the boot log shows `@dsh-external/dsh-input-history/client.js` in a 57-entry combo with *"no pending entries, no duplicate loader ids, host up"*, and all four guard probes resolve. The plugin **did** activate; it did not fail to load. Re-declaring `inject` or re-registering a slot would change nothing.
* As a *migration* step: **validated.** `uiSession` is indeed the new owner of "which session the main view is bound to" (`2), so `inject` must grow `'uiSession'` — but that is the *repair*, not the *diagnosis*. Adding it alone would not resurrect the chord: the failing read stays `sessions.list.getSnapshot().current` until it is rewritten.
* The release note the colleague skimmed is nevertheless the right note: *"客户端 Session 会话支持多实例共存，相关 API 及 slot 有变化"*. What changed for this plugin is the **API shape** (the snapshot), not slot registration.

**Also settled (the maintainer's own dichotomy):** *"the capture listener is either not firing or firing and bailing out"* — it is **firing and bailing out**, at line 34→35 of `resolve()`. Supporting evidence: the plugin appears in the boot combo and its guard evaluated the four members (i.e. `apply` ran, `applyBody` ran, the listener was installed), and the chord is *not* swallowed. The decisive point is that the guard's probes *did* evaluate (no banner = verdict "compatible", i.e. that code path ran), which a never-loaded plugin could not produce.

**NOT addressed (still-unexplained items on the already-tried list):** items **3** (re-link the junction + hard refresh), **4** (disable every other plugin), **5** (plugin update chip says "latest version"), and **6** ("with the junction removed, Ctrl+Up/Down still do nothing — no other handler"). All four are *delivery/environment* probes: they can observe a plugin that fails to load, fails to be injected, or is version-stale, but they are structurally incapable of seeing a **host API shape change** — the plugin loads fine and is "latest"; only the *values* the host hands it changed. Item 6 in particular is *consistent with* this diagnosis (the plugin's own handler is the only candidate and it bails) but does not by itself separate "handler bails" from "handler never bound" — the boot-combo and guard-pass evidence supplies that missing piece.

**Consequence for process:** "re-link / re-refresh / disable others / check the update chip" is a *delivery* checklist. This bug class needs a *contract* checklist: when a host release note says "Session APIs changed", the first action must be to diff the **host's published client `.d.ts`** against the API the plugin reads — not to re-install anything.

---

## 2. Evidence mapping

### 2.1 What changed about the snapshot the plugin reads

```ts
// alpha.1 — @deepseek-ai/dsh-api-session-controller
interface SessionListState {
  readonly byId: Readonly<Record<SessionId, SessionSummary>>;
  readonly current: SessionId | undefined;   // ← what the plugin reads
}
interface ISessions { readonly list: ObservableSnapshot<SessionListState>; … }

// alpha.2 — after the multi-instance refactor
interface SessionListSnapshot {
  items: readonly SessionListEntry[];
  state: 'idle' | 'loading' | 'error';
  phase: SessionListPhase;
  error: RemoteFailure | null;
  subagentsByParent: Readonly<Record<SessionId, SubagentCatalogSnapshot>>;
  jobsBySession: Readonly<Record<SessionId, readonly JobView[]>>;
}
interface ISessions { readonly list: ObservableSnapshot<SessionListSnapshot>; … }
```

Three changes, all material:

1. **The payload type was replaced**: `SessionListState` → `SessionListSnapshot`. The generic argument of `ObservableSnapshot` changed, so the *declared* value type of `sessions.list` changed too.
2. **`current` was deleted, with no successor in this snapshot.** alpha.2's snapshot is a **catalog** (`items`, `subagentsByParent`, `jobsBySession`) plus loading/error state. Note alpha.2's own comment on `list`: *"Host catalog and local reference-source counts; **navigation belongs to view owners**."* The session-list service deliberately gave up owning "which session the main view is bound to"; that ownership moved to a **view owner** — the new `uiSession` service.
3. **`byId` is gone too**, replaced by `items` (an array rather than an id-keyed record) — irrelevant to this plugin, but it confirms the snapshot was redesigned, not merely patched.

### 2.2 What the plugin now receives on every keystroke

```ts
const snapshot = sessions.list.getSnapshot()   // → a valid SessionListSnapshot object (not null/undefined)
const id      = snapshot.current                // → undefined  (property absent; no throw)
```

So the plugin receives **a well-formed snapshot object whose `current` member does not exist**, i.e. `undefined`, on **every single keystroke** — not just at startup, not only after a session switch. `resolve()` therefore returns `null` 100% of the time, and `onKeyDown` returns before touching the composer.

### 2.3 The canonical replacement read

From `fixture/host-types/ui-session-service-alpha2.d.ts` — a **new** client bundle, `@deepseek-ai/dsh-client-ui-session`:

* **Service**: `UiSession` (a `Service` subclass), exported by the `@deepseek-ai/dsh-client-ui-session` client bundle; **inject name `"uiSession"`**.
* **Observable**: `uiSession.adapter.current` — typed `ObservableSnapshot<SessionBindingValue>`, documented as *"Binding source of the main view's current session."* This is the new home of the removed `SessionListState.current`.
* **Value shape** — `SessionBindingValue`:

  ```ts
  interface SessionBindingValue {
    readonly key: SessionId;                        // the bound session's id
    readonly ctx: Context;                         // ← replaces sessions.scope(id)
    readonly hooks: Record<string, unknown>;
    readonly keyedHooks: Record<string, Record<string, unknown>>;
    readonly props: Record<string, unknown>;
  }
  ```

  * The **field that replaces `sessions.scope(id)` for session-scoped service resolution** is **`SessionBindingValue.ctx`** — documented as *"The session-scoped context: services registered under this session resolve here."* On alpha.1 the plugin got that context from `sessions.scope(id)`; on alpha.2 the same context arrives **carried by the binding value**, together with the id in `key`.
  * `ctx` is where the plugin finds the conversation service: `binding.ctx.get('conversation')` → `IConversation`, and `conversation.input.for(binding.ctx)` re-scopes the input facade to that session's context.
* **Absent-binding semantics (critical for a guard)**: *"`SessionBindingValue.key` of the absent binding is undefined; the service publishes the absent value while no main session is retained."* So `adapter.current.getSnapshot()` may legitimately yield a value with `key === undefined` (and no usable `ctx`) — any probe must distinguish "no session retained" from "API broken".
* **Other members of the service**: `adapter.bindingSource(target)`, `sourceFor(owner: SessionBinding | SessionId): BindingSource` (per-session binding source), and `provide(descriptor: SessionSourceDescriptor)` — *"Register one Session-scoped standard-source contribution (hook/prop roster + per-binding resolver); used by stock packages such as ui-chat to publish their per-session hooks."*

### 2.4 One-line summary of the migration

| | alpha.1 | alpha.2 |
|---|---|---|
| Which session is current | `sessions.list.getSnapshot().current` | `uiSession.adapter.current.getSnapshot().key` |
| Session-scoped context | `sessions.scope(id)` | `uiSession.adapter.current.getSnapshot().ctx` |
| Conversation service | `scope.get('conversation')` | `binding.ctx.get('conversation')` |
| Input facade | `conversation.input.for(scope)` | `conversation.input.for(binding.ctx)` |

---

## 3. Migration recipe (one build, both hosts)

### 3.1 The corrected resolution function

Feature-detect the **service** (`uiSession` present ⇒ alpha.2-class host), then read the **value** through the owning service. Both branches return the same `ResolvedSession`, so the rest of the plugin (history state machine, draft writes, browse reset) is untouched.

```ts
// session-resolution.ts
import type { Context as ClientContext } from '@deepseek-ai/cordis'
import type { ISessions } from '@deepseek-ai/dsh-api-session-controller/client'
import type {
  ConversationNode, IConversation, SessionInput,
} from '@deepseek-ai/dsh-client-ui-conversation/client'

export interface ResolvedSession {
  readonly id: string
  readonly input: SessionInput
  readonly nodes: readonly ConversationNode[]
}

const EMPTY_NODES: readonly ConversationNode[] = []

/** Minimal structural view of the legacy alpha.1 snapshot field we still need. */
interface LegacySessionListSnapshot {
  readonly current?: string | undefined
}

/** Minimal structural view of the alpha.2 ui-session binding source. */
interface UiSessionLike {
  readonly adapter: {
    readonly current: {
      getSnapshot(): {
        readonly key?: string | undefined
        readonly ctx?: ClientContext | undefined
      }
    }
  }
}

function chatNodes(ctx: ClientContext, id: string): readonly ConversationNode[] {
  const chat = ctx.uiConversation.binding(id).snapshot.getSnapshot().views.get('chat')
  return chat === undefined ? EMPTY_NODES : chat.legacy.nodes
}

/**
 * Resolve the current session's input facade + chat nodes.
 * Works on alpha.1 (legacy session-list snapshot) and alpha.2+ (ui-session binding)
 * from the SAME build, by runtime feature detection.
 */
export function resolveSession(ctx: ClientContext): ResolvedSession | null {
  // ── alpha.2 path: the canonical owner of "the main view's current session" ──
  const uiSession = (ctx as unknown as { uiSession?: UiSessionLike }).uiSession
  if (uiSession !== undefined) {
    const binding = uiSession.adapter.current.getSnapshot()
    const id = binding?.key
    if (id === undefined) return null           // no session retained — legitimate no-op
    const actx = binding?.ctx
    if (actx === undefined) return null
    const conversation = actx.get('conversation') as IConversation | undefined
    if (conversation === undefined) return null
    return {
      id,
      input: conversation.input.for(actx),
      nodes: chatNodes(ctx, id),
    }
  }

  // ── alpha.1 path: legacy SessionListState.current + sessions.scope(id) ──
  const sessions = ctx.sessions as ISessions
  const snapshot = sessions.list.getSnapshot() as unknown as LegacySessionListSnapshot
  const id = snapshot.current
  if (id === undefined) return null
  const actx = sessions.scope(id)
  if (actx === undefined) return null
  const conversation = actx.get('conversation') as IConversation | undefined
  if (conversation === undefined) return null
  return {
    id,
    input: conversation.input.for(actx),
    nodes: chatNodes(ctx, id),
  }
}
```

Notes:

* **Why the legacy read is cast through a structural shim**: the plugin's stale import of `ISessions` still types `list` as `ObservableSnapshot<SessionListState>`, which *compiles* against alpha.1 but silently diverges at runtime. Reading it through `LegacySessionListSnapshot` (an optional `current`) keeps the build green against **both** host `.d.ts` sets and makes the legacy dependence explicit rather than invisible.
* **Do not** structure the alpha.2 branch as "use `uiSession` if present, else fall back to `sessions.list…`" *for the id* on alpha.2: alpha.2 has no `current` to fall back to, so the fallback must be strictly the alpha.1 branch, selected by the *presence of the `uiSession` service*, not by the freshness of a snapshot field.
* The alpha.1 branch is unreachable on alpha.2 and vice versa; each is exercised on exactly one host, which is what makes a single build legitimate.

### 3.2 What must change in the plugin's `inject` declaration

```ts
// before
export const inject = ['sessions', 'uiConversation', 'conversation']

// after
export const inject = ['sessions', 'uiSession', 'uiConversation', 'conversation']
```

* `uiSession` must be **requested from the host**, otherwise `ctx.uiSession` is never injected and the alpha.2 branch can never run (the plugin would silently take the legacy branch on alpha.2 and reproduce the exact bug).
* **Dual-host caveat [unconfirmed]**: the fixture does not specify how alpha.1's client-plugin loader treats an `inject` entry naming a service that does not exist in that host (hard failure vs. tolerated omission). The plugin's existing defensive style (`ctx?.sessions?.list` in the guard) suggests omission is tolerated rather than fatal, but this must be checked on alpha.1 before shipping. If alpha.1 *does* hard-fail on an unknown inject name, keep the hard list as `['sessions', 'uiConversation', 'conversation']` and obtain `uiSession` opportunistically as an optional service (the resolution function above already tolerates `ctx.uiSession === undefined`).
* Because the guard resolves members off `ctx` with optional chaining, the same optionality applies to the *guard* — the guard must **not** treat a missing `uiSession` as an incompatibility on alpha.1.

### 3.3 How the session-scoped context reaches the conversation service

* **alpha.1**: `sessions.scope(id)` → the session-scoped `Context`; the conversation service is registered in that scope; `actx.get('conversation')` retrieves it; `conversation.input.for(actx)` binds the input facade to that scope.
* **alpha.2**: the *same* session-scoped context is **carried inside the binding value** — `uiSession.adapter.current.getSnapshot().ctx` is *"the session-scoped context: services registered under this session resolve here"*. So `binding.ctx.get('conversation')` retrieves the conversation service registered under that session, and `conversation.input.for(binding.ctx)` re-scopes the input facade to it.
* In both hosts the context is the **handle** that makes session-scoped service resolution work. The alpha.2 change is only that the context is delivered *with* the binding value instead of being looked up separately by id.
* The plugin does **not** need to call `uiSession.provide(...)` for this: `provide` is for packages that publish *their own* per-session hooks/props (stock `ui-chat` does this). The plugin is a **consumer** of the session scope, so it reads `ctx` off the binding value. `provide` matters only if the plugin later wants to expose per-session contributions.

### 3.4 The call-site change in the plugin entry

```ts
// src-client-index.ts (applyBody)
const resolve = (): ResolvedSession | null => {
  const resolved = resolveSession(ctx)          // ← the whole dual-host resolution
  if (resolved === null) return null
  if (resolved.id !== lastSessionId) {          // browse reset now keys off the resolved id
    browse = IDLE
    lastSessionId = resolved.id
  }
  return resolved
}
```

(The `lastSessionId` reset logic must move *after* the resolution, because on alpha.2 the id comes from `binding.key` rather than from `list.current`; keeping the old order would compare against a permanently `undefined` legacy id.)

---

## 4. Guard hardening

### 4.1 The class of breakage presence-checks cannot catch

Presence checks answer *"does this member exist?"*. The break class they miss is **contract drift below the member level — the member survives, the value it produces changes**. Concretely, for this API surface:

1. **Field removal / rename inside a returned object** — this case: `SessionListState.current` deleted from `SessionListSnapshot`.
2. **Type substitution of the payload** — `list` went from `ObservableSnapshot<SessionListState>` to `ObservableSnapshot<SessionListSnapshot>`; the member's *type* changed while the member stayed.
3. **Return-shape change of a method** — e.g. `scope(id)` returning a different object, or `binding(id)` returning a different view map. Presence is unaffected.
4. **Ownership migration** — the value moved to a *different service* (`uiSession.adapter.current`). The old member still exists (so `sessions.list` passes) but no longer carries the fact.
5. **Semantic/default change** — a field that was an empty array is now `null`; an enum gains a variant; a field becomes lazily-populated.
6. **Element-shape change of a collection** — `byId` (record) → `items` (array): the member is still "there" but indexed differently.

The pattern: **presence checks are insensitive to every change in the *contents* of the API. Alpha.2's refactor is entirely a content-level change, which is why the guard — a member-level check — scored 100% healthy.**

### 4.2 What the guard should probe instead

**Probe the values the plugin will actually consume, along the plugin's real resolution path** — a *capability/value* probe, not a *member* probe. The probe should be the plugin's own resolution function, plus shape assertions on its result:

```ts
/**
 * Hardened capability probe: does the host actually give us the values
 * our resolution path needs? Presence of members proves nothing.
 */
export function probeCapabilities(ctx: ClientContext): { ok: true } | { ok: false; why: string } {
  const uiSession = (ctx as unknown as { uiSession?: UiSessionLike }).uiSession

  if (uiSession !== undefined) {
    const binding = uiSession.adapter.current.getSnapshot()
    if (!binding || binding.key === undefined) {
      return { ok: false, why: 'uiSession.adapter.current has no bound session yet' }
    }
    if (binding.ctx === undefined) {
      return { ok: false, why: 'uiSession binding carries no session-scoped ctx' }
    }
    const conversation = binding.ctx.get('conversation') as IConversation | undefined
    if (conversation === undefined) {
      return { ok: false, why: 'session ctx does not expose the conversation service' }
    }
    if (typeof conversation.input?.for !== 'function') {
      return { ok: false, why: 'conversation.input facade is missing/reshaped' }
    }
    const chat = ctx.uiConversation.binding(binding.key).snapshot.getSnapshot().views.get('chat')
    if (chat === undefined || !Array.isArray(chat.legacy?.nodes)) {
      return { ok: false, why: 'uiConversation chat view has no legacy.nodes array' }
    }
    return { ok: true }
  }

  // legacy host: the same assertions against the legacy path
  const snapshot = ctx.sessions.list.getSnapshot() as unknown as LegacySessionListSnapshot
  if (snapshot.current === undefined) {
    return { ok: false, why: 'sessions.list snapshot no longer carries the legacy current field' }
  }
  // … then the same ctx.get('conversation') / input.for / nodes assertions
  return { ok: true }
}
```

Properties that make this a real guard:

* It exercises **the same code path the runtime uses**, so a field removal cannot pass it: on alpha.2 the legacy branch's `snapshot.current === undefined` check fires (if the legacy branch were taken), and the alpha.2 branch asserts `binding.key`, `binding.ctx`, `ctx.get('conversation')`, `conversation.input.for`, and `chat.legacy.nodes`.
* It asserts **shapes** (`key` is a string, `ctx` is defined, `for` is a function, `nodes` is an array), so a type substitution is caught as well as a deletion.
* It keeps the *policy* of the shipped guard: never throw out of activation; report a **specific** reason and render the remediation banner.

### 4.3 At what point in the lifecycle the probe must run

**Not at activation time.** Two reasons:

1. At activation the main session may not be retained yet — the fixture states the ui-session service *"publishes the absent value while no main session is retained"*, i.e. `adapter.current.getSnapshot().key` is legitimately `undefined` before the first session is bound. A probe run eagerly at activation would either false-negative (banner on a perfectly healthy host) or, worse, be written permissively enough to pass everything — which is exactly the shipped guard's failure mode.
2. Value-level facts about a session scope only *exist* once a session is bound and the session-scoped services (`conversation`) have been registered into that scope.

**The correct point is: the first moment a session binding becomes available, and re-evaluated on every binding change** — i.e. a reaction on the binding observable:

```ts
ctx.effect(() => {
  const source = uiSession
    ? uiSession.adapter.current
    : ctx.sessions.list                       // legacy observable
  source.getSnapshot()                        // react to binding changes
  const verdict = probeCapabilities(ctx)
  if (!verdict.ok) reportIncompatible(verdict.why)   // banner + console.warn, never a silent no-op
  return () => {}
}, 'dsh-input-history: capability probe')
```

Two complementary timings are worth having:

* **Reactive (primary)**: re-probe whenever the binding / session-list snapshot changes — this catches the break *without any user interaction*, typically within moments of host start, and reports a concrete reason.
* **Lazy (secondary)**: also probe inside `onKeyDown` before returning `null`, and **log a warning naming the missing field** when a composer-targeted chord is pressed but resolution fails. This is the last line of defence that turns any *future* silent no-op into a loud one, and it directly addresses the symptom "nothing in the console".

Complementary guard requirement: **the probe must be able to fail.** A guard that can only ever return "compatible" is decoration. The hardened guard must have a reachable failure state and must render its reason.

---

## 5. Verification and prevention

### 5.1 Verifying the fix on both hosts without a full migration

Because the fix is a runtime feature-detected dual build, verification needs **one plugin build and two hosts** — no coordinated release, no per-host plugin fork, no source change between hosts.

**On alpha.2 (the failing host)**

1. Rebuild the plugin with the new `resolveSession`; hard-refresh the browser (client bundles are served from the junction).
2. Bind/open a conversation. Press **Ctrl+Up** → the composer draft must be filled with the last sent message; **Ctrl+Down** must walk the history back; the chord must now be **swallowed** (`preventDefault` is reached — a visible change from "cursor moves, nothing happens").
3. Prove the *alpha.2 branch* was taken (not the legacy one): a temporary `console.info('branch=uiSession')` in each branch, or a counter exposed on `window`. Remove afterwards.
4. Negative check: temporarily stub `sessions.list.getSnapshot()` to return a snapshot **without** `current` and confirm recall still works — this reproduces alpha.2's shape exactly and proves independence from the removed field.
5. Confirm the hardened probe reports `ok: true` on alpha.2 and that no remediation banner appears.

**On alpha.1 (the regression host)**

6. Roll the host back to `0.1.6-alpha.1` (npm global reinstall), restart the host, hard-refresh the browser — **the same plugin build**, no plugin change.
7. Repeat the Ctrl+Up / Ctrl+Down check → recall must work via the legacy branch (`ctx.uiSession` is undefined there).
8. Confirm the probe reports `ok: true` on alpha.1 and that no banner appears (the guard must not treat a missing `uiSession` as incompatibility).

**Guard regression tests (no host swap needed)**

9. Fault-inject on each host: make `binding.key` / `binding.ctx` / `conversation.input.for` unavailable and assert the probe returns a **failing verdict with a reason** and the banner renders. Repeat with `list.getSnapshot()` returning a snapshot without `current` on the legacy host.
10. **Static, host-free check (cheap, high value)**: recompile the plugin against **alpha.2's** published `@deepseek-ai/dsh-api-session-controller/client` `.d.ts`. The stale `.current` read must be a **compile error** — this is exactly the detector the incident lacked, because the junction-linked plugin was **prebuilt** and never recompiled against alpha.2's types. Make this a CI gate: *build every external client plugin against the newest published host client types*.

### 5.2 The single host-side change that would have made this loud at activation

**Recommendation: publish an explicit client-API contract version on the service and have the client-plugin loader validate it at activation, failing loudly on mismatch.**

Concretely — in the session-controller service (or a dedicated client-api service) add a machine-readable contract marker, e.g. `ISessions.apiVersion` / `capabilities` (`'alpha2'`, `'alpha1'`), and have the client-plugin loader compare it with a version the plugin **declares** (e.g. `export const minClientApi = 'alpha1'` / `requires`), refusing to activate — or activating with a loud, named error plus a console warning — when the host's contract is newer than the plugin's declared support.

Why this is the right single change:

* The removal was **silent because the API had no versioned contract**: alpha.1 and alpha.2 both expose `ISessions` with a `list` member, so a plugin and a host can agree on "the service exists" while disagreeing completely on what it contains. A versioned contract turns "content drift" into "declared incompatibility", which the loader can detect **at activation** — precisely the moment the shipped guard was supposed to fire.
* It is **host-side** (in the service or its types), which is where the break originated, and it protects *every* plugin — not just this one — against the next field-level removal.

**Cheap complement (not sufficient on its own)**: keep `current` on `SessionListSnapshot` as an explicitly **deprecated but present** accessor that **throws a named error** — e.g. *"`SessionListState.current` was removed in 0.1.6-alpha.2; use `uiSession.adapter.current.getSnapshot().key`"* — or at minimum emits a one-time `console.warn` naming the replacement. This converts a *silent* removal into a *loud* one at the first read and gives stale plugins a migration hint instead of a no-op. It is not "at activation" on its own (the stale read happens on the first keystroke), and it cannot cover plugins that never touch the removed member, which is why the versioned-contract change is the primary recommendation.

**Why the type change alone did not fire**: removing `current` from the published `.d.ts` *is* a loud failure **at build time** — but only for plugins that are recompiled against it. This plugin ships a **prebuilt, junction-linked** bundle, and the maintainer's update chip confirmed it was "latest version", so no recompilation ever happened. The lesson for the host: **type-level breaks only protect consumers who rebuild**; runtime contracts and loader validation are what protect the ones who do not.

---

## Appendix · Unconfirmed items (not derivable from the fixture)

1. Whether alpha.1's client-plugin loader tolerates an `inject` entry naming a non-existent service (`'uiSession'`) — affects `3.2`'s exact form.
2. Whether `sessions.scope(id)` on alpha.2 keeps alpha.1's exact semantics (the alpha.2 excerpt says the member still exists but omits it) — the legacy branch is only exercised on alpha.1, so this is not on the critical path.
3. The alpha.2 shapes of `IConversation`, `SessionInput.for(ctx)` and `uiConversation.binding(id).snapshot…views.get('chat')` — these come from the *conversation* / *ui-conversation* bundles, which are **not in the fixture**; only the plugin's own imports of them are visible. The recipe assumes they are unchanged; the hardened probe asserts their shape at runtime so the assumption is checked rather than trusted.
4. The exact alpha.2 contents of `ctx.sessions.sessionOf` — inferred to still exist from the absence of the remediation banner, not directly evidenced.
5. Which specific "slot" changes the alpha.2 release note refers to — the excerpt gives no slot-level detail; the plugin's failure is explained entirely by the snapshot change, but the note's slot wording was not independently verified.


## Required output (JSON only)
{"decisions":[{"id":"<criterion-id>","verdict":"pass|partial|fail|missing","reason":"short"}],"caps":[{"id":"<cap-id>","triggered":false,"reason":"short"}]}
Every criterion and cap exactly once. pass=full points, partial=half, fail/missing=0; a triggered cap caps the total.