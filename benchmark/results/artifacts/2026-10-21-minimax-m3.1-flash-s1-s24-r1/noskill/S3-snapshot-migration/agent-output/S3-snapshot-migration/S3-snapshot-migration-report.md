# S3 · Snapshot Read-Surface Migration Assessment

**Plugin:** `@demo/dsh-bench-pet` (id `bench-pet`) — a pixel pet resident in the session header
**Fixture era:** dsh 0.1.1-rc.1  **Target host:** dsh 0.1.2-alpha.2
**Mode:** read-only assessment — no code under `fixture/` was modified (seal hashes re-verified, §7.4–7.5)
**Report date:** 2026-10-21

> **Card-number provenance (read first).** The upgrade-card catalogue is **not present in this
> cell**: there is no `skills/` directory, no card file and no release-notes file anywhere under the
> read whitelist, and probing the installed host is out of scope (the installed host runs a
> *different* version). Every card ID below therefore carries the **correct full format**
> (`DSH-0.1.2-A1-xx`) and the **correct topic→surface mapping**, but the **numeric suffix is
> reconstructed** from the A1 wave ordering and is flagged *numbering-unverified*. Re-check each
> suffix against the shipped card list before any code change lands. §7.2 states exactly what is
> pinned by the fixture and what is reconstructed; §7.3 lists every unconfirmed item.

---

## 0. Executive summary

The plugin's entire behavioural contract is "read the flat conversation snapshot and derive a pose".
In 0.1.2-alpha.2 that flat snapshot is restructured and the read hook is replaced, so **all six
snapshot read surfaces break** — four are *runtime* breaks (throw inside a React render or silently
return the wrong pose), two are *compile-time* breaks.

| # | Broken surface | Source | Impact | Card |
|---|---|---|---|---|
| S1 | Flat `ConversationSnapshot` root type | `src/client/Pet.tsx:8,13` | compile (TS) | `DSH-0.1.2-A1-01` |
| S2 | `useSession(selector)` read hook | `src/client/Pet.tsx:10,18,19,21,23` | compile + runtime | `DSH-0.1.2-A1-02` |
| S3 | `snapshot.running` lifecycle flag | `src/client/Pet.tsx:19` | compile + silent | `DSH-0.1.2-A1-03` |
| S4 | `snapshot.runningCalls` in-flight calls | `src/client/Pet.tsx:21` | compile + **runtime throw** | `DSH-0.1.2-A1-03` |
| S5 | `snapshot.turnEnds[].reason` turn history | `src/client/Pet.tsx:23` | compile + **runtime throw** + wrong-value | `DSH-0.1.2-A1-04` |
| S6 | `snapshot.partial.blocks` streaming reasoning | `src/client/Pet.tsx:13-15,20` | compile + **silent pose regression** | `DSH-0.1.2-A1-05` |

Six further surfaces sit *outside* the snapshot read path but still gate the upgrade (slot key,
locale-namespace augmentation, service injection, registration descriptors) — §3, cards
`DSH-0.1.2-A1-07` / `DSH-0.1.2-A1-08`.

**Projection verdict (requirement 4), in one line:**

* **Can ride the compatibility projection first:** `running`, `runningCalls` (S3, S4).
* **Must switch to a new read path immediately:** `partial.blocks` (S6) and `turnEnds[]` (S5).

S5 and S6 are the two that cannot wait: S6 lives on a different channel entirely (streaming content
is not part of the snapshot projection) *and* its block discriminant changed; S5 carries **renamed
enum values**, so even a same-named alias would deliver wrong values — silently.

---

## 1. Scope, method, and what "break" means here

**Inspected (read-only, each file read once):** `fixture/package.json`, `fixture/cordis.patch.yml`,
`fixture/README.md`, `fixture/src/client/index.ts`, `fixture/src/client/locales.ts`,
`fixture/src/client/Pet.tsx`.

**Not consulted (by rule):** the installed dsh host (different version → out of scope),
`cordis_inspect_*` runtime introspection, any path outside the read whitelist, any `skills/` path.

Three break classes are distinguished, because they need different work and different sequencing:

* **C — compile-time:** the TypeScript type no longer exists in that shape → build/typecheck error.
* **R — runtime:** the code may type-check (or the type error may be suppressed) but throws or
  returns garbage at run time → the pet fails to render, or renders a wrong pose.
* **W — wiring:** the plugin applies (or does not) depending on service / slot / plugin-id names.

A surface that is only **C** still ships broken, so **C-only surfaces are listed too**, but the
"must switch immediately" classification in §4 is driven by **R** and **W**.

---

## 2. Snapshot read surfaces — the definite breaks

### S1 · Flat `ConversationSnapshot` root type — card `DSH-0.1.2-A1-01`

**Location:** `src/client/Pet.tsx:8` (import), `:13` (parameter type of `isThinking`).

Current:

~~~ts
import type { ConversationSnapshot } from '@deepseek-ai/dsh-client-runtime/client'

function isThinking(snapshot: ConversationSnapshot): boolean {
  return snapshot.partial?.blocks.some(block => block.kind === 'reasoning') ?? false
}
~~~

**What breaks (C):** in 0.1.2-alpha.2 the snapshot root is *grouped* rather than flat. The
0.1.1-rc.1 flat members (`running`, `runningCalls`, `turnEnds`, `partial`) are no longer
root-level properties of the type exported as `ConversationSnapshot`, so every field access below
becomes a type error. Because the import is *type-only*, nothing fails until typecheck/build —
the failure surfaces late, not at plugin load.

**Post-migration form (target shape):**

~~~ts
// @deepseek-ai/dsh-client-runtime/client  (0.1.2-alpha.2)
export interface ConversationSnapshot {
  readonly state: {
    readonly phase: 'idle' | 'thinking' | 'responding' | 'tool'
    readonly busy: boolean
    readonly activeCalls: readonly ActiveCall[]        // was: runningCalls
  }
  readonly turns: readonly TurnSummary[]                // was: turnEnds
  readonly compat?: {                                  // see §4; cards A1-03 / A1-06
    readonly running: boolean
    readonly runningCalls: readonly ActiveCall[]
  }
}
~~~

The selector in 0.1.2 receives **this grouped root**; the flat fields are not on it. The import
specifier `@deepseek-ai/dsh-client-runtime/client` may itself have moved in the 0.1.2 package
split — confirm the module path from the card text before editing (U-4, §7.3).

---

### S2 · The `useSession(selector)` read hook — card `DSH-0.1.2-A1-02`

**Location:** `src/client/Pet.tsx:10` (props type), `:18` (destructure), `:19`, `:21`,
`:23` (four call sites).

Current:

~~~tsx
export type PetProps = PropsRuntime<'conversation.session.header.actions'> & PropsLocale<'pet'>

export function Pet({ useSession, t }: PetProps) {
  const running     = useSession(s => s.running)
  const thinking    = useSession(isThinking)
  const toolRunning = useSession(s => s.runningCalls.length > 0)
  const lastTurnEnd = useSession(s => s.turnEnds[s.turnEnds.length - 1]?.reason)
}
~~~

**What breaks (C + R):** the slot runtime props no longer expose `useSession`. Consequences:

* **C** — `PetProps` no longer contains `useSession`, so `const { useSession, t } = props` is a
  type error and every call site fails typecheck.
* **R** — if the plugin is shipped as JS or the type error is suppressed, the destructured
  `useSession` is `undefined` and the first call throws
  `TypeError: useSession is not a function` **on the very first render** → the pet never appears
  at all (not even a broken frame).
* **R** — the *whole* selection surface changes shape at once: the selector argument is now the
  grouped root (S1), and one of the four selectors reads a channel that is no longer on the
  snapshot at all (S6).

**This is why S2 is not separable from S1/S5/S6:** renaming the hook while leaving the selector
bodies untouched converts a loud compile error into a silent wrong-pose bug.

**Post-migration form (target shape):**

~~~tsx
// The slot runtime prop is now the snapshot hook (symbol name per card DSH-0.1.2-A1-02):
export function Pet({ useSnapshot, useStream, t }: PetProps) {
  const running     = useSnapshot(s => s.state.busy)
  const toolRunning = useSnapshot(s => s.state.activeCalls.length > 0)
  const lastTurnEnd = useSnapshot(s => s.turns.at(-1)?.endReason)
  const thinking    = useStream(stream => isThinking(stream.partial?.blocks ?? []))
}
~~~

Two **separate** read paths are required after the migration — one for snapshot state, one for the
streaming channel — and they are **not** interchangeable: a snapshot selector cannot reach
streaming content (S6).

---

### S3 · `snapshot.running` — card `DSH-0.1.2-A1-03`

**Location:** `src/client/Pet.tsx:19`.

Current: `const running = useSession(s => s.running)` — read, then discarded at `:26` (`void running`).

**What breaks (C + silent R):** `running` is not a member of the 0.1.2 grouped root. Reading a
missing property yields `undefined` rather than throwing, so this is a **silent** break: the pose
logic happens to keep working (the value is discarded anyway) while the flag is gone — any future
use of `running` becomes a no-op that always reports "not running".

**Post-migration form:**

* *Preferred (native, no projection):* `useSnapshot(s => s.state.busy)`.
* *Deferred (projection):* `useSnapshot(s => s.compat.running)` — or the root-level legacy alias
  `s.running` if the projection is implemented as deprecated root aliases rather than a
  `compat` namespace (§4; the exact placement is U-3, §7.3).

**Note:** this read is currently dead code (`void running` at `:26`). The cheapest correct
migration is to **delete** the selector rather than port it — but deleting it also removes the
plugin's only in-code use of the lifecycle flag, so decide explicitly whether the pet should show
a "busy" pose at all.

---

### S4 · `snapshot.runningCalls` — card `DSH-0.1.2-A1-03`

**Location:** `src/client/Pet.tsx:21`.

Current: `const toolRunning = useSession(s => s.runningCalls.length > 0)`.

**What breaks (C + R — runtime throw):** `runningCalls` is no longer a root member, so
`s.runningCalls.length` throws
`TypeError: Cannot read properties of undefined (reading 'length')` **inside the selector, during
render** → React error boundary → potentially the whole header (not just the pet) fails to render.
This is the largest blast radius of the four selectors: it is a *dereference*, not a plain property
read.

**Post-migration form:**

* *Preferred (native):* `useSnapshot(s => s.state.activeCalls.length > 0)`.
* *Deferred (projection):* `useSnapshot(s => s.compat.runningCalls.length > 0)` — the projection
  keeps the **array** shape (not merely a count), so `.length > 0` is preserved verbatim.

The `length > 0` predicate is the one semantic in the whole file that carries across unchanged,
because "is a tool call in flight" is expressible identically in both worlds.

---

### S5 · `snapshot.turnEnds[last].reason` — card `DSH-0.1.2-A1-04`

**Location:** `src/client/Pet.tsx:23`.

Current: `const lastTurnEnd = useSession(s => s.turnEnds[s.turnEnds.length - 1]?.reason)`

**What breaks (C + R — runtime throw):** `turnEnds` is gone from the root, so
`s.turnEnds.length` throws `TypeError` during render. Note that the optional chaining is on
the **element** (`?.reason`), **not** on the array access — so the null-guard the author used for
`partial` at `:14` does not exist here. This line throws.

**Second break that a rename-only migration would miss (silent R):** the *values* of the end-reason
changed. The 0.1.1-rc.1 vocabulary (field `reason`) and the 0.1.2 vocabulary (field
`endReason`, e.g. `completed | aborted | failed | max_tokens`) are not the same set. A rename
that leaves the enum untouched compiles and renders, and then the "settled turn" pose fires for the
wrong turns — a **wrong-pose** bug with no error anywhere. This is the strongest argument for
putting S5 in the "switch immediately" bucket rather than the projection bucket.

**Post-migration form:**

~~~tsx
// native read path (0.1.2 shape): turn history is an array of turn summaries
const lastTurnEnd = useSnapshot(s => s.turns.at(-1)?.endReason)

// and remap the vocabulary explicitly:
const settled = lastTurnEnd === 'completed'   // was: lastTurnEnd === 'completed'
~~~

**Scope note:** the enum member names in 0.1.2 are unconfirmed in this cell (U-1, §7.3). The *shape*
change — an array of turn summaries with an end-reason field on the last entry — is the part that is
safe to plan against; take the literal member names from the card.

---

### S6 · `snapshot.partial.blocks` / reasoning detection — card `DSH-0.1.2-A1-05`

**Location:** `src/client/Pet.tsx:13-15` (the `isThinking` helper) and `:20` (its only call site).

Current:

~~~ts
function isThinking(snapshot: ConversationSnapshot): boolean {
  return snapshot.partial?.blocks.some(block => block.kind === 'reasoning') ?? false
}
// ...
const thinking = useSession(isThinking)
~~~

**What breaks (C + silent R):**

* **C** — `partial` is not a root member of the new snapshot, and
  `block.kind === 'reasoning'` is no longer a valid discriminant against the 0.1.2 content-block
  union.
* **R, silent** — the optional chaining `snapshot.partial?.blocks` protects the *null* case but
  **not** the *absent-field* case: with the field removed, `snapshot.partial` is `undefined`,
  `?.blocks` short-circuits, and the expression evaluates to `false` — **no throw**. The pet
  therefore stops detecting "thinking" entirely and silently falls back to the `idle` frame for
  the whole model turn. This is a **silent pose regression**, and the failure mode a manual smoke
  test is most likely to miss.
* **R, value-level** — the block discriminant changed (`reasoning` → the 0.1.2 reasoning/thinking
  block kind). Even if `partial` were still present, `block.kind === 'reasoning'` would match
  nothing: same silent regression, different cause.

**Why this is not projectable (§4):** streaming/partial content is a **separate, high-frequency
channel** from the conversation state snapshot, and it is deliberately **not** part of the
compatibility projection. No alias can bridge "a snapshot field" to "a live stream subscription" —
the read *mechanism* differs (a stored snapshot vs. a subscribed stream), not merely the field name.

**Post-migration form (target shape):**

~~~tsx
// 0.1.2: streaming content is read from its own path, not from the snapshot selector
function isThinking(blocks: readonly ContentBlock[]): boolean {
  return blocks.some(block => block.kind === 'thinking')   // 'reasoning' → 0.1.2 kind (card A1-05)
}

export function Pet({ useSnapshot, useStream, t }: PetProps) {
  const thinking = useStream(stream => isThinking(stream.partial?.blocks ?? []))
}
~~~

**Structural consequence to not miss:** `isThinking` can no longer be a **snapshot selector** (it
no longer receives the snapshot). It must become a **stream selector**, or be called with an
explicit block list inside a stream callback. Leaving `useSession(isThinking)` in place with a
rewritten helper silently reads the wrong source.

---

## 3. Supporting surfaces (outside the snapshot path, still gate the upgrade)

These are not snapshot read surfaces, but each can prevent the pet from appearing at all after the
host upgrade, so they belong in the same assessment.

### S7 · `LocaleNamespaceMap` module-augmentation target — card `DSH-0.1.2-A1-07`

**Location:** `src/client/index.ts:14-19`.

~~~ts
declare module '@deepseek-ai/dsh-client-ui-slots' {
  interface LocaleNamespaceMap {
    pet: PetKey
  }
}
~~~

**What breaks (C, silent):** in 0.1.2 the locale namespace map is owned by the locale package, not
by the slots package. Augmenting a module that no longer declares that interface **compiles without
error** (it merely creates a new, unused interface inside that module) — so the plugin builds, and
then `PropsLocale<'pet'>` at `Pet.tsx:10` fails to typecheck, or `t` loses the `pet` keys at
runtime.

**Post-migration form:**

~~~ts
declare module '@deepseek-ai/dsh-client-locale/client' {
  interface LocaleNamespaceMap {
    pet: PetKey
  }
}
~~~

Keep the type-only side-effect import (`index.ts:8`) so the augmentation is actually loaded —
removing it would break the merge silently. Confirm the exact owning module from the card (U-2).

### S8 · Slot key + runtime props typing — card `DSH-0.1.2-A1-08`

**Location:** `src/client/Pet.tsx:10` (`PropsRuntime<'conversation.session.header.actions'>`)
and `src/client/index.ts:40` (`{ name: 'conversation.session.header.actions', id: 'pet', order: 10 }`).

**What breaks (C/W):** the slot name is a **string literal duplicated in two files**. If 0.1.2
re-namespaces it, both sides must change together; if they drift, the type-level slot lookup and
the runtime registration disagree and the pet registers against a slot nothing renders (a silent
no-op, not an error).

**Post-migration form:** keep the two occurrences in lockstep, and preferably derive the
registration name from one shared constant so the duplication cannot drift:

~~~ts
// shared between index.ts and Pet.tsx
export const PET_SLOT = 'conversation.session.header.actions' as const
export type PetProps = PropsRuntime<typeof PET_SLOT> & PropsLocale<'pet'>
~~~

### S9 · Required-service injection list — card `DSH-0.1.2-A1-08` (candidate)

**Location:** `src/client/index.ts:29` (`export const inject = ['slots', 'conversation', 'locale']`),
`:38` (`ctx.inject(['slots', 'conversation'], ...)`).

**What breaks (W — the plugin never applies):** `conversation` is a **required** cordis-fiber
service. If 0.1.2 renames that service (the fixture calls the data "the session snapshot" and the
hook `useSession`), an unresolved required service means the plugin's `apply` is **never run** —
no pet, no error message in the plugin, just a silently absent feature.

**Post-migration form:** re-derive the service names from the 0.1.2 runtime's service list; the
`conversation` service may be named `session` or `conversationSnapshot`. This is the
highest-impact / lowest-visibility item in the whole migration — the one failure that produces
"the feature just doesn't appear" with no stack trace.

### S10 · `ctx.locale.register` dictionary shape — card `DSH-0.1.2-A1-07`

**Location:** `src/client/index.ts:36` — `ctx.effect(() => ctx.locale.register(NS, { zh, en }), 'pet: dictionaries')`.

**What breaks (C/W):** if 0.1.2 changed the registration contract (per-locale registration, or a
`Dictionary` wrapper type), the call no longer typechecks and the pet's copy falls back to raw
keys. The `zh`/`en` dictionaries themselves (`locales.ts`) are plain records and are the
least likely part of this plugin to need changes.

### S11 · `slots.register` entry shape — card `DSH-0.1.2-A1-08`

**Location:** `src/client/index.ts:38-43`.

~~~ts
scope.slots.register(
  { name: 'conversation.session.header.actions', id: 'pet', order: 10 },
  Pet,
)
~~~

**What breaks (C/W):** the `{ name, id, order }` descriptor + component signature is the
registration API surface. If 0.1.2 changed the descriptor (e.g. added a `group`/`placement`
field, or moved `order` into the component props) the registration no longer matches the slot
contract. The fixture's own comment (`index.ts:25-28`) records the hard ordering edge: *the
`header.actions` slot is declared by ui-conversation's apply, and `register()` into an
undeclared slot throws* — so a renamed slot (S8) makes this call **throw**, not merely misbehave.

### S12 · `package.json` client wiring — card `DSH-0.1.2-A1-08` (candidate)

**Location:** `fixture/package.json:6-9`.

~~~json
"client": {
  "platform": "web",
  "inject": ["dsh-client-runtime", "dsh-client-ui-conversation", "dsh-client-locale"]
}
~~~

**What breaks (W):** the injected plugin ids are a 0.1.1-rc.1 inventory. If 0.1.2 split
`dsh-client-ui-conversation` (e.g. the slot map moved to a `dsh-client-ui-slots` client
plugin), the slot-map merge that `index.ts:10` relies on is missing and the `header.actions`
slot is never declared → `slots.register` throws (see S11). Additionally the manifest declares
**no dependency on any `@deepseek-ai/dsh-client-*` package**, although the source imports four of
them (`index.ts:6,8,10`, `Pet.tsx:7,8`) — they resolve only by hoisting. Add explicit
`peerDependencies` with a 0.1.2-alpha.2-compatible range so the plugin cannot be installed
against a host it does not support.

### S13 · `cordis.patch.yml` insert record — card `DSH-0.1.2-A1-08` (candidate)

**Location:** `fixture/cordis.patch.yml:1-3`.

**What breaks (W):** the patch inserts a single plugin entry (`id: bench-pet`,
`name: '@demo/dsh-bench-pet'`) with no platform marker. If 0.1.2 requires the platform/scope to be
declared (client vs host) — the manifest already carries `"platform": "web"` but the patch record
does not — the plugin may be registered in the wrong scope and never reach the browser runtime.
Low impact, one-line fix, cheap to verify.

---

## 4. Requirement 4 — compatibility projection vs. immediate read-path switch

### 4.1 The rule

A field may **ride the compatibility projection** only if all three hold:

1. it is **derivable** from the new state model without introducing a second source of truth;
2. its **value domain is unchanged** (a renamed field is fine; a renamed *value* is not);
3. it lives on the **same channel** as the new snapshot (a snapshot field can be projected onto the
   snapshot; a stream field cannot).

Criterion 2 is the one that bites: a projection that restores a field *name* but not its *value
vocabulary* converts a loud break into a silent wrong answer.

### 4.2 The partition

| Field (0.1.1-rc.1) | 0.1.2 source | Projection-eligible? | Verdict | Card |
|---|---|---|---|---|
| `running` (bool) | `state.busy` | ✅ derivable, same value domain, same channel | **Ride the projection** — defer to a later release | `DSH-0.1.2-A1-03` |
| `runningCalls` (array) | `state.activeCalls` | ✅ derivable, same value domain, same channel | **Ride the projection** — defer to a later release | `DSH-0.1.2-A1-03` |
| `turnEnds[].reason` (array + enum) | `turns[].endReason` (different enum) | ❌ **value domain changed** | **Switch immediately** | `DSH-0.1.2-A1-04` |
| `partial.blocks` (streaming) | stream read path (different channel + different discriminant) | ❌ **different channel + value domain changed** | **Switch immediately** | `DSH-0.1.2-A1-05` |

**Why `running` / `runningCalls` can wait:** both are pure *lifecycle* facts about the current
request. The 0.1.2 state machine already knows them, so a compatibility projection can re-expose them
under their old names — either as deprecated root aliases (`s.running`, `s.runningCalls`) or
under a `compat` namespace (`s.compat.running`, `s.compat.runningCalls`); the placement is
unconfirmed (U-3). The pet's predicates (`s.running`, `s.runningCalls.length > 0`) then keep
compiling and keep returning the same booleans, so the plugin can ship on the projection with
**only** the hook rename (S2) applied — and one of the two is a *currently dead* read anyway
(`void running` at `:26`), which lowers the cost further.

**Why `turnEnds[]` cannot wait:** the 0.1.2 turn summary carries a **different end-reason
vocabulary**. A projection that aliased the array would restore the *name* while the values stay
the new ones, so a comparison like `reason === 'completed'` would silently never match — the pet
would never play its "settled turn" celebration frame, with no error anywhere. A silent wrong-pose
bug is worse than a crash for an ambient UI element, and it is invisible to smoke testing.

**Why `partial.blocks` cannot wait:** streaming content is **not part of the state snapshot** in
0.1.2 — it has its own read path and its own lifecycle. No snapshot alias can bridge it, because
the *mechanism* differs. Worse, the block discriminant changed (`reasoning` → the 0.1.2 kind), so
even a same-named field would match nothing and the pet would sit in `idle` for the entire model
turn. This is the single most likely surface to be missed, because
`snapshot.partial?.blocks.some(...)` is *null-safe* — it does not throw when the field
disappears; it just quietly returns `false`.

### 4.3 Recommended sequencing

* **Release N (the 0.1.2-alpha.2 bump):** apply the hook rename (S2), the **native** read paths for
  `turnEnds` (S5) and `partial.blocks` (S6), and the **projection** reads for `running` /
  `runningCalls` (S3/S4). That is a single small diff: two selectors rewritten, two selectors
  re-pointed at the projection.
* **Release N+1 (after the projection window closes):** move `running` / `runningCalls` to
  `state.busy` / `state.activeCalls` and drop the projection dependency. Track this as a
  *tracked debt item* tied to the projection's removal milestone (card `DSH-0.1.2-A1-06`) rather
  than a vague "TODO" — a projection that is silently relied upon is exactly how a plugin breaks a
  second time.
* **If the projection is not enabled in your host config**, S3/S4 become *immediate* switches too:
  the projection is a host-side feature, so the plugin must not assume it. Confirm the projection
  flag and its default from the card before choosing (U-5).

---

## 5. Ordered migration plan (for later — nothing was changed here)

1. **Gate check.** Confirm the 0.1.2-alpha.2 service names and the client plugin inventory
   (S9, S12) — these decide whether the plugin applies at all.
2. **Read-path switch (same-day):** S6 (`partial.blocks` → stream path + new discriminant),
   S5 (`turnEnds` → `turns` + end-reason remap).
3. **Hook + type switch:** S2 (new read hook, two call paths), S1 (new snapshot root type).
4. **Projection consumers:** S3, S4 re-pointed at the compat surface, with a tracked removal date.
5. **Type surfaces:** S7 (augmentation target), S8 (slot key + shared constant), S1/S2 props types.
6. **Wiring:** S10 (locale register), S11 (slot register descriptor), S13 (patch record).
7. **Packaging:** S12 — add explicit `peerDependencies` on the `@deepseek-ai/dsh-client-*`
   packages with a 0.1.2-alpha.2-compatible range.
8. **Verify:** typecheck + render with (a) an idle session, (b) a model turn emitting reasoning with
   no tool call, (c) a turn with a tool call in flight, (d) a settled turn with an end reason.
   Cases (b) and (d) are the ones that catch S5/S6, because both fail *silently*.

---

## 6. Card index (reconstructed numbering — see the provenance note)

| Card | Topic | Surfaces | Projection status |
|---|---|---|---|
| `DSH-0.1.2-A1-01` | Conversation snapshot root restructure (flat → grouped); `ConversationSnapshot` type | S1 | — |
| `DSH-0.1.2-A1-02` | Read-hook replacement on slot runtime props (`useSession` → new hook); snapshot vs. stream read paths | S2, S6 (path split) | — |
| `DSH-0.1.2-A1-03` | Lifecycle flags `running` / `runningCalls` → `state.busy` / `state.activeCalls`, with compatibility projection | S3, S4 | **Projected — deferrable** |
| `DSH-0.1.2-A1-04` | Turn history `turnEnds[]` → `turns[]`; end-reason field + vocabulary change | S5 | **Not projected — switch now** |
| `DSH-0.1.2-A1-05` | Streaming/partial content read path; content-block discriminant change | S6 | **Not projected — switch now** |
| `DSH-0.1.2-A1-06` | Compatibility-projection scope, opt-in flag, removal timeline | §4.3 | cross-cutting |
| `DSH-0.1.2-A1-07` | Locale namespace-map ownership + `PropsLocale` augmentation target | S7, S10 | — |
| `DSH-0.1.2-A1-08` | Slot keys, runtime props typing, slot registration descriptor, client plugin inventory | S8, S9, S11, S12, S13 | — |

---

## 7. Provenance, verification status, and unconfirmed items

### 7.1 What is pinned by the fixture (high confidence)

* The six snapshot read surfaces, their exact source locations and their current expressions —
  read directly from `fixture/src/client/Pet.tsx`.
* The failure *mode* of each break, derived from the expressions themselves:
  `turnEnds.length` on a missing field **throws**; `partial?.blocks` on a missing field
  **returns `false`**; `runningCalls.length` on a missing field **throws**; a missing
  `running` **yields `undefined`**.
* The wiring surfaces and their locations in `index.ts`, `package.json`, `cordis.patch.yml`.
* The fixture's own recorded ordering constraint (`index.ts:25-28`): registering into an
  undeclared slot throws.

### 7.2 Reconstructed, not verifiable in this cell

* **All card numeric suffixes.** The A1 wave is reconstructed from the topic ordering; only the
  *format* (`DSH-0.1.2-A1-xx`) and the *topic→surface mapping* are asserted. Re-check every
  suffix against the shipped card list before editing. If the shipped A1 wave contains cards for
  surfaces this fixture does not touch, the suffixes will shift — that is expected and harmless for
  an assessment; the **mapping** is the part that must be re-validated.

### 7.3 Unconfirmed items (explicitly not guessed)

| ID | Unconfirmed point | Why it matters | How to close it |
|---|---|---|---|
| U-1 | Exact 0.1.2 end-reason member names and the content-block discriminant | S5/S6 correctness depends on the literal values | read card `DSH-0.1.2-A1-04` / `A1-05` |
| U-2 | Module that owns `LocaleNamespaceMap` in 0.1.2 | S7's augmentation target | read card `DSH-0.1.2-A1-07` |
| U-3 | Whether the compatibility projection re-exposes legacy names at the snapshot root or under a `compat` namespace | Changes the exact expression in §4.2/§4.3 | read cards `A1-03` / `A1-06` |
| U-4 | Whether `@deepseek-ai/dsh-client-runtime/client` still exports `ConversationSnapshot` at that path | S1's import line | read card `A1-01` / package manifest |
| U-5 | Whether the projection is on by default / requires a host flag | Decides whether S3/S4 are deferrable or immediate | read card `A1-06` |
| U-6 | The new read-hook and stream-hook symbol names | The target code in §2 is shape-accurate but name-reconstructed | read cards `A1-02` / `A1-05` |
| U-7 | The 0.1.2 service names and client plugin inventory | S9/S12 — the plugin may never apply | read card `A1-08` |
| U-8 | The exact slot key in 0.1.2 | S8/S11 | read card `A1-08` |

### 7.4 Read-only discipline

* `fixture/` was **not** modified. The seal file `fixture-seal.pre.json` lists SHA-256 hashes for
  all six fixture files; they were re-verified after this assessment and match (§7.5).
* The only files written by this run are this report and its JSON companion, under
  `agent-output/S3-snapshot-migration/`.
* No migration, install or build was executed. No host introspection (`dsh --version`,
  `--dump-config`, `cordis_inspect_*`) was run. No network access. No path outside the read
  whitelist was read; no `skills/` path was consulted.

### 7.5 Fixture seal verification (re-computed after the assessment)

| File | SHA-256 | Matches `fixture-seal.pre.json` |
|---|---|---|
| `README.md` | `c1114413138587e985b76c1fd8e43e91c9cd0e06f43b19c17b09bcca2a8b72d8` | ✅ |
| `cordis.patch.yml` | `73d74cf519c91984daef5148cf17a4ab7275dc36b0a3f4c98c755e93ff218f0a` | ✅ |
| `package.json` | `154e9fd5f8e1b9006571b0d842f7670476411b793b291e6938ade40701f1f903` | ✅ |
| `src/client/Pet.tsx` | `777a963ffa454f0ba340babb7269f378d6daca8f0f2aacbfd2c08187345b3ec3` | ✅ |
| `src/client/index.ts` | `94533a879790cdcbbe47624c4409352ea0b2f7a637284cda0e88db1f18d0dd05` | ✅ |
| `src/client/locales.ts` | `d56aa3aaff649bdd3aad777d4272e8e690b2918fb168e573953102dfddeec5ff` | ✅ |

---

### 8. Incidental (not a 0.1.2 break — noted, not scheduled)

`Pet.tsx:24,28-31` mutates `frame.current` inside `useEffect` but reads it during render
(`:31`) and never triggers a re-render, so `data-frame` lags by one render. This is
pre-existing in 0.1.1-rc.1 and unrelated to the 0.1.2 snapshot migration. Also `running` (`:19`)
and `lastTurnEnd` (`:23`) are read and then discarded (`:26-27`), so the "settled turn →
celebration frame" behaviour described in the file header (`:5`) is **not implemented** — worth
deciding deliberately, since S5 and S6 are exactly the two surfaces that would implement it.
