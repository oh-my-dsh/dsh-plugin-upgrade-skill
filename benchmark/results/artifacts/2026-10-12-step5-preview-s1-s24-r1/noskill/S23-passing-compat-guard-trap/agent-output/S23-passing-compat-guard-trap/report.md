# S23 · The Compat Guard That Passed — analysis and migration report

Evidence: `fixture/symptom-report.md`, `fixture/plugin/src-client-index.ts`,
`fixture/host-types/session-list-alpha1.d.ts`, `fixture/host-types/session-list-alpha2.d.ts`,
`fixture/host-types/ui-session-service-alpha2.d.ts`, `fixture/upgrade-notes.txt`.
All conclusions below are derived only from this pack (the plugin repo is not available, per `fixture/README.md`).

---

## 1. Silent-failure attribution

### The per-keystroke resolution path, walked

1. **Listener registration (works).** `apply` runs `applyWithCompat` (`src-client-index.ts:78-90`); the four probes pass, so `applyBody` executes and `ctx.effect` installs `onKeyDown` as a **window capture-phase** listener (`src-client-index.ts:67-70`). This is consistent with the boot log: the client bundle loads, no warnings, "host up".
2. **Chord dispatch (fires).** `onKeyDown` (`src-client-index.ts:50-65`) passes its static filters — `ctrlKey && !altKey && !metaKey`, `ArrowUp`/`ArrowDown`, `!isComposing`, `isComposerTarget(e.target)`. The handler *is* firing and *is* reaching `resolve()`. This settles the maintainer's "either not firing or firing and bailing out" fork: it is firing and bailing.
3. **The exact read that now fails: `src-client-index.ts:34`**

   ```ts
   const id = sessions.list.getSnapshot().current
   ```

   On alpha.2 this reads **`undefined`**, every keystroke, forever (see §2 for why).
4. **Graceful bail.** `if (id === undefined) return null` (`src-client-index.ts:35`) — the plugin's own "no current session" branch, designed for a legitimate idle state.
5. **Silent no-op.** Back in `onKeyDown`, `if (resolved === null) return` (`src-client-index.ts:56`) fires **before** `e.preventDefault()` / `e.stopPropagation()` (`src-client-index.ts:61-62`). Consequences, exactly matching the report: no draft text (`input.setDraft` never runs), no toast (none exists in this path), **chord not swallowed** → the composer's native multi-line cursor movement still works, and `browse` never advances so history recall is dead.

### Why nothing surfaces anywhere

- **Why the compat guard passes.** The guard probes four *service-member* presence facts (`src-client-index.ts:83-88`): `ctx?.sessions?.list`, `ctx?.sessions?.scope`, `ctx?.sessions?.sessionOf`, `ctx?.uiConversation?.binding`. On alpha.2 all four members still *exist* — `scope(id)` even survives the refactor (see the NOTE at `session-list-alpha2.d.ts:24-26`), and `uiConversation` is an untouched service. The guard never *calls* `getSnapshot()` and never inspects the value's fields, so a deletion **inside the payload** is structurally invisible to it. The guard checked the shelf, not the book.
- **Why there is no console error.** Reading a missing property from an *existing* object evaluates to `undefined`; it does not throw (TypeError only arises on a `null`/`undefined` base). Line 34 therefore produces no exception, the plugin handles `undefined` as designed, and the host logs nothing because it does not observe plugin-side reads. The F12 console is clean because there is literally nothing to log.
- **Why silent no-op rather than a thrown exception.** `resolve()` was written to *tolerate* "no current session" by returning `null` — a normal runtime state (idle main view). The host's change removed the field that carried the session id, which is **indistinguishable at runtime from** that tolerated state. So the code takes its own graceful-degradation branch on 100% of keystrokes. In practice the "legitimately undefined" branch never fired even on alpha.1 (a web profile always has a session open); the removal turned a dead-but-harmless branch into a permanently triggered one.

### Suspicion bookkeeping (already-tried list, `upgrade-notes.txt:21-30`)

- **Settled: #6 — "chords not taken by anything else."** The reading proves the ownership question end-to-end: the capture listener fires, filters pass, and the handler *internally* bails at `src-client-index.ts:35` before `stopPropagation`, so nothing else ever sees the chord. The failure is 100% inside the plugin's first read. (Removing the junction making the chords still do nothing is now fully explained: with the plugin gone there is no consumer at all; with the plugin present, its consumer bails silently.) This also retro-explains **#1** (clean console — no throw exists to log), **#2** (guard passes — surface-only probes), **#3** (junction re-link / hard refresh irrelevant — the break is a host-side shape change), and **#4** (disabling other plugins irrelevant — the break is strictly host-vs-this-plugin).
- **Not addressed: #5 — "update chip says latest version."** That is a distribution-level signal (plugin package version vs. the registry). The read path neither confirms nor refutes it, and cannot: the plugin *is* on its latest published build; there simply is no published version that speaks alpha.2's session API. The chip stays a red herring — "latest" says nothing about host-API compatibility.
- **The colleague's note** ("re-declare inject / add `uiSession`") is *directionally* right (the multi-instance refactor is the cause, and the fix does add `uiSession`) but wrong about the mechanism of silence: the inject list and activation are fine; the silent death is the removed `current` field, one level below anything the inject graph controls.

---

## 2. Evidence mapping

### What changed about the snapshot the plugin reads

| | alpha.1 (`session-list-alpha1.d.ts`) | alpha.2 (`session-list-alpha2.d.ts`) |
|---|---|---|
| Service member | `sessions.list: ObservableSnapshot<SessionListState>` | `sessions.list: ObservableSnapshot<SessionListSnapshot>` |
| Payload fields | `byId: Record<SessionId, SessionSummary>`, **`current: SessionId \| undefined`** | `items`, `state`, `phase`, `error`, `subagentsByParent`, `jobsBySession` — **no `current`, no `byId`** |
| Documented meaning | "The session the main conversation view is currently bound to" | "Host catalog and local reference-source counts; **navigation belongs to view owners**" (`session-list-alpha2.d.ts:16`) |

The multi-instance session refactor (release note: "客户端 Session 会话支持多实例共存，相关 API 及 slot 有变化") made a single global "current session" meaningless — multiple instances coexist — so the controller stopped publishing main-view selection and the field was **deleted, not deprecated**. `sessions.list` was narrowed to a catalog; selection moved to the view owners.

**Implication for the value the plugin receives:** on every keystroke, `sessions.list.getSnapshot()` returns a `SessionListSnapshot` that has no `current` property, so `.current` evaluates to `undefined` — not a stale id, not an error. `resolve()` therefore returns `null` on 100% of chords. (`sessions.scope` also still exists per the NOTE at `session-list-alpha2.d.ts:24-26`, so the guard's `sessions.scope` probe passing is consistent — the break is strictly in the snapshot *payload*, one level deeper than every guard probe.)

### The canonical replacement read (from `ui-session-service-alpha2.d.ts`)

- **Service:** `UiSession`, shipped by `@deepseek-ai/dsh-client-ui-session` in alpha.2's client bundle; **inject name: `uiSession`**.
- **Observable it exposes:** `uiSession.adapter.current: ObservableSnapshot<SessionBindingValue>` — "Binding source of the main view's current session."
- **Shape of the yielded value (`SessionBindingValue`):**

  ```ts
  {
    readonly key: SessionId;                          // replaces sessions.list.getSnapshot().current
    readonly ctx: Context;                            // replaces sessions.scope(id)
    readonly hooks: Record<string, unknown>;          // provide()-contributed stock hooks
    readonly keyedHooks: Record<string, Record<string, unknown>>;
    readonly props: Record<string, unknown>;
  }
  ```

  - **`key`** is the replacement for identity: the id of the session the main view is bound to. For an *absent* binding the service publishes the absent value with **`key === undefined`** (`ui-session-service-alpha2.d.ts:40-41`) — which maps exactly onto the plugin's existing `id === undefined → null` branch, so the no-session case needs no new code.
  - **`ctx`** is the field that replaces `sessions.scope(id)` for session-scoped service resolution: "The session-scoped context: services registered under this session resolve here." The plugin's `actx.get('conversation')` and `conversation.input.for(actx)` (`src-client-index.ts:43-47`) must be driven by `binding.ctx` on alpha.2.
  - `hooks`/`keyedHooks`/`props` are the per-session contribution slots behind `provide()` (used by stock packages such as ui-chat); this plugin consumes none of them.

---

## 3. Migration recipe

One build, both hosts: prefer the alpha.2 `uiSession` binding, fall back to the legacy snapshot + `scope` when the service is absent.

```ts
import type { Context as ClientContext } from '@deepseek-ai/cordis'
import type { ISessions } from '@deepseek-ai/dsh-api-session-controller/client'
import type {
  ConversationNode, IConversation, SessionInput,
} from '@deepseek-ai/dsh-client-ui-conversation/client'

// Minimal structural view of the alpha.2 uiSession service (type-only, erased at build).
interface SessionBindingValueLike {
  readonly key: string | undefined
  readonly ctx: { get(id: string): unknown }
}
interface UiSessionLike {
  readonly adapter: {
    readonly current: { getSnapshot(): SessionBindingValueLike };
  }
}
// Legacy payload no longer present in alpha.2's sealed SessionListSnapshot.
interface LegacySessionListState {
  readonly current: string | undefined
}

export const inject = ['sessions', 'uiConversation', 'conversation', 'uiSession']

interface ResolvedSession {
  readonly input: SessionInput
  readonly nodes: readonly ConversationNode[]
}

const EMPTY_NODES: readonly ConversationNode[] = []

/** Dual-host read of "the main view's current session" and its session-scoped ctx. */
function currentSession(
  ctx: ClientContext & { uiSession?: UiSessionLike },
): { id: string | undefined; actx: ReturnType<LegacyScope> | undefined } {
  // alpha.2 canonical path: UiSession binding value carries key + session ctx.
  const uiSession = ctx.uiSession
  const current = uiSession?.adapter?.current
  if (current !== undefined) {
    const binding = current.getSnapshot()
    if (binding.key === undefined) return { id: undefined, actx: undefined }
    return { id: binding.key, actx: binding.ctx as never }
  }
  // alpha.1 legacy path: global snapshot + sessions.scope(id).
  const sessions = ctx.sessions as ISessions
  const id = (sessions.list.getSnapshot() as unknown as LegacySessionListState).current
  if (id === undefined) return { id: undefined, actx: undefined }
  return { id, actx: sessions.scope(id) as never }
}
// ^ actx is typed structurally; both branches satisfy session-ctx usage below.
type LegacyScope = (id: string) => unknown

function applyBody(ctx: ClientContext): void {
  let browse: HistoryBrowse = IDLE
  let lastSessionId: string | undefined

  const resolve = (): ResolvedSession | null => {
    const { id, actx } = currentSession(ctx)
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

  // ... onKeyDown unchanged (src-client-index.ts:50-65), ctx.effect unchanged
}
```

**What must change in `inject`:** add `'uiSession'` —

```ts
export const inject = ['sessions', 'uiConversation', 'conversation', 'uiSession']
```

It must be injected so `ctx.uiSession` exists on alpha.2 to be feature-detected. On alpha.1 the service does not exist; per the alpha.2 release note ("插件依赖解析模式调整为运行时解析" — dependency resolution moved to runtime resolution), a missing inject entry resolves to `undefined` at runtime rather than failing activation, and `currentSession` falls back to the legacy branch whenever `ctx.uiSession?.adapter?.current` is absent. If a host build rejects unknown inject names outright, the same feature-detection can be done through the runtime service registry without an inject entry — but with runtime resolution the entry is safe on both hosts.

**How the session-scoped context reaches the conversation service:** on alpha.2 it arrives *through the binding value*: `uiSession.adapter.current.getSnapshot().ctx` is the session-scoped `Context` ("services registered under this session resolve here"), and that ctx is what gets passed to `actx.get('conversation')` and `conversation.input.for(actx)`. On alpha.1 the same struct is produced by `sessions.scope(id)`. Everything downstream is unchanged: the conversation facade resolves inside whichever session ctx the host branch produced, and `ctx.uiConversation.binding(id)` stays keyed by the same id (the ui-chat per-session view lookup is orthogonal to this change).

---

## 4. Guard hardening

**The class of breakage presence-checks cannot catch:** *value/shape-level (deep contract) breaks behind an intact service surface.* The four shipped probes only assert "the member exists" (`ctx?.sessions?.scope` etc.). Any incompatibility **below** that surface — a field removed from a snapshot payload, a renamed key, a reshaped observable value, a changed return contract — passes every presence check, because the member still exists and is still callable. That is precisely this incident: `sessions.list` present, `getSnapshot()` callable, `sessions.scope` present, `uiConversation.binding` present — and the data the plugin actually consumes (`current`) deleted. Presence checks can only detect *missing services*, never *changed data contracts*; the shipped guard is structurally blind to the entire class of field-level removals.

**Hardened guard — probe behavior and payload shape, not member presence.** At activation, *execute the exact reads the plugin depends on* and assert the resulting value's shape; feed any failure into the same `applyWithCompat` banner path:

```ts
function hostProbeError(
  ctx: ClientContext & { uiSession?: UiSessionLike },
): string | null {
  // alpha.2 path: the uiSession binding must yield { key, ctx }.
  const current = ctx.uiSession?.adapter?.current
  if (current !== undefined) {
    const v = current.getSnapshot?.()
    if (v === undefined) return 'uiSession.adapter.current emitted no binding value'
    if (!('key' in v) || !('ctx' in v)) {
      return 'SessionBindingValue shape changed: expected { key, ctx, ... }'
    }
    return null
  }
  // legacy path: the sessions.list snapshot must carry `current`, and
  // scope(id) must resolve to a session ctx exposing the conversation facade.
  const snap = (ctx.sessions as ISessions | undefined)?.list?.getSnapshot?.()
  if (snap === undefined) return 'sessions.list unavailable'
  if (!('current' in (snap as object))) {
    return (
      "sessions.list snapshot lost 'current' — host migrated to multi-instance " +
      'sessions; plugin requires the uiSession.adapter.current path'
    )
  }
  const id = (snap as unknown as LegacySessionListState).current
  if (id !== undefined && (ctx.sessions as ISessions).scope(id) === undefined) {
    return 'sessions.scope(id) returned undefined for a live session id'
  }
  return null
}

export function apply(ctx: ClientContext): void {
  const probe = hostProbeError(ctx)
  applyWithCompat(
    'dsh-external/dsh-input-history',
    '当前 DSH 客户端 API 与插件不匹配',
    ['升级 DSH 到已适配版本。', '或更新插件到适配当前 DSH 的版本。'],
    [
      ['probe', probe === null ? ctx?.sessions?.list : undefined],
      // ... keep the original member probes as a second safety net
    ],
    () => { if (probe !== null) throw new Error(probe); applyBody(ctx) },
  )
}
```

(Exact wiring depends on `applyWithCompat`'s signature in `./compat.ts`, which is not in the pack; any variant that fails activation on a non-null probe result is equivalent — the essential change is *call the read, assert the shape*.)

**Where in the lifecycle the probe must run:** at **activation**, inside `apply`, *before* `ctx.effect` registers the keydown capture — the one point guaranteed to run on every host restart for every plugin, and the only point at which a remediation banner can still reach the user. Because the activation-time snapshot can legitimately be the *absent* value (no session retained yet), the shape assertion must additionally run **on the first live emission** of the current-session observable (one-shot effect subscription), raising the banner then if the payload is malformed. Activation + first-emission validation fully covers this failure mode: the shape assertion fails immediately on alpha.2, because the snapshot it reads no longer carries `current`.

---

## 5. Verification and prevention

### Verifying the fix on both hosts without a full migration

1. **Fabricated dual-host unit test of `currentSession`** (pure function, no host needed):
   - alpha.1-shaped ctx: `sessions.list.getSnapshot() → { byId, current: 's1' }`, `scope('s1')` → ctx with `conversation`, `uiConversation.binding('s1')` → chat nodes;
   - alpha.2-shaped ctx: `uiSession.adapter.current.getSnapshot() → { key: 's1', ctx }`;
   - assert both return equal `{ input, nodes }`; both return the null branch when `current`/`key` is `undefined`; and — critically — a ctx with **neither** legacy `current` **nor** `uiSession` returns `null` **and** makes `hostProbeError` non-null (the guard now fails loudly where it previously passed silently).
2. **On the real alpha.2 host:** junction the rebuilt bundle, restart the host, hard-refresh; confirm the plugin still appears in the boot combo with no warnings; send a message, press Ctrl+Up → the composer draft fills with the last sent message; Ctrl+Down walks back; the chord is now swallowed (no native multi-line cursor movement while browsing); no compatibility banner renders.
3. **Regression on alpha.1:** same single build in a pinned alpha.1 profile (or downgraded global install) reproduces identical chord behavior, proving the fallback branch. If no alpha.1 host is reachable, the fabricated-context test in step 1 is the regression evidence.
4. **Guard regression:** point the hardened probe at an alpha.2-shaped host *without* the fix and assert the remediation banner renders with both strings — proving this failure mode is now loud at activation rather than silent.

### The single host-side change that would have made it loud

Do not **delete** the field — ship a deprecation shim. Keep `current` on the alpha.2 snapshot as a defined accessor (service-side) instead of removing it outright:

```ts
Object.defineProperty(snapshot, 'current', {
  get() {
    console.warn(
      '[dsh] sessions.list.snapshot.current was removed in 0.1.6-alpha.2 ' +
      '(multi-instance sessions); use uiSession.adapter.current.getSnapshot().key',
    )
    return undefined
  },
  configurable: true,
})
```

A `console.warn` on first read would have put the exact replacement API into the maintainer's F12 console on the first Ctrl+Up after the upgrade. In an alpha channel the same accessor can **throw** instead (`throw new Error('... use uiSession.adapter.current ...')`), turning the silent removal into a stack trace on the first read — and because the §4 hardened guard *calls* `getSnapshot()` and reads `current` at activation, the host-side warning/throw fires exactly at plugin activation and the guard converts it into the remediation banner. A types-side variant — keeping `current` in the sealed `.d.ts` marked `@deprecated` for one cycle — would only catch plugins *compiled* against alpha.2 types; this plugin was built against alpha.1 (and `session-list-alpha2.d.ts` shows the field simply gone), so the runtime accessor is the only change that makes it loud for the already-shipped bundle.

---

## Summary

The read at `plugin/src-client-index.ts:34` (`sessions.list.getSnapshot().current`) is the exact failure: alpha.2's multi-instance refactor deleted `current` from the `sessions.list` snapshot, so every keystroke reads `undefined` and `resolve()` silently returns `null` before the chord is swallowed. The guard passes because it probes service-member *presence* while the break is a *payload field deletion*; nothing throws because missing-property reads return `undefined` and the plugin treats that as a tolerated idle state. The fix is a dual-host resolver — `uiSession.adapter.current.getSnapshot()` → `{ key, ctx }` on alpha.2 (with `'uiSession'` added to `inject`), legacy snapshot + `sessions.scope(id)` on alpha.1 — plus an activation-time guard that calls the reads and asserts the payload shape instead of checking member presence.
