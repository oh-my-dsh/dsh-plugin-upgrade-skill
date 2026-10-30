# JUDGE BRIEF · noskill.S3-snapshot-migration

## Criteria (sealed rubric)
- [chat-projection] (20pt) Locate Pet.tsx partial/runningCalls/turnEnds reads. Explain their temporary chat legacy projection and subsequent views/timeline or target-owned Chat access. Accept a supported direct migration when it explains the compatibility option; merely saying legacy is insufficient.
- [session-lifecycle] (20pt) Locate running in Pet.tsx and explain it belongs to the Session/useSession lifecycle seat, outside chat legacy. Do not claim the existing useSession call itself must be renamed for running.
- [type-and-inject] (20pt) Locate removed dsh-client-runtime imports and the package.json client.inject entry. Repoint Context as ClientContext to scoped cordis and snapshot types to their target owner; do not claim every snapshot type is exported by cordis. Unknown exact snapshot symbols may be explicitly deferred to target exports.
- [slot-registration] (20pt) Locate the scoped slots.register call in index.ts. Explain slots.inject around registration and the ui-renderer/client Context augmentation/service ownership; preserve the slot name and lifetime. Accept equivalent supported registration forms.
- [mapping-and-plan] (20pt) Tie the located snapshot/lifecycle/slot changes to full DSH-0.1.2-A1-03 and separate temporary projection from immediate type/inject/lifecycle changes. A1-25 is a valid additional package-removal card. A bare card ID earns zero.

## Caps (score ceilings; judge returns each with triggered true/false)
(none)

## Candidate report(s)
#### FILE: S3-snapshot-migration/S3-snapshot-migration-assessment.md

# S3 · Snapshot Read-Surface Migration Assessment

**Target plugin:** `@demo/dsh-bench-pet` v0.1.0 (browser half, `src/client/`)
**Written against:** DSH 0.1.1-rc.1 → **0.1.2-alpha.2**
**Mode:** read-only assessment. No code was changed, no migration or install was executed, the fixture is byte-identical (SHA-256 attestation in §8).

---

## 1. Scope and method

Inspected (read-only, in place):

| File | Role |
| --- | --- |
| `fixture/package.json:6-9` | client entry points (`platform: web`, `inject: dsh-client-runtime, dsh-client-ui-conversation, dsh-client-locale`) |
| `fixture/cordis.patch.yml:1-3` | loader insert of the `bench-pet` entry |
| `fixture/src/client/index.ts` | plugin body: locale dictionary + slot registration |
| `fixture/src/client/Pet.tsx` | **the entire snapshot read surface** (4 reads, 2 type imports) |
| `fixture/src/client/locales.ts` | dictionary only, no runtime coupling |

Finding in one line: the plugin's *registration* surface is 0.1.2-clean; **every break lives in `Pet.tsx`, in the way it reads the conversation snapshot.** The reads are flat-field reads against `ConversationSnapshot`, which 0.1.2-alpha.2 replaces with a store-backed session view (`SessionView`) and slice reads. There are **4 field-level breakages + 2 type-level breakages**, and 3 of the 4 runtime reads fail *loudly* (TypeError inside a `useSession` selector), while 1 fails *silently* (`running` reads `undefined`, pet simply stops animating).

---

## 2. Executive summary

| # | Location | 0.1.1-rc.1 read | 0.1.2-alpha.2 form | Card | Failure mode |
| --- | --- | --- | --- | --- | --- |
| B1 | `Pet.tsx:8` | `import type { ConversationSnapshot } from '@deepseek-ai/dsh-client-runtime/client'` | `SessionView` from the same entry | `DSH-0.1.2-A1-01` | compile error (TS2305) |
| B2 | `Pet.tsx:10,18` | `PropsRuntime<'conversation.session.header.actions'>` typed against the old view | props now carry `useSession` over `SessionView` | `DSH-0.1.2-A1-01` | compile error at the selector argument |
| B3 | `Pet.tsx:19` | `useSession(s => s.running)` | `useSession(s => s.status === 'running')` | `DSH-0.1.2-A1-02` | **silent** — `undefined` → falsy |
| B4 | `Pet.tsx:14` (used at `:20`) | `snapshot.partial?.blocks.some(b => b.kind === 'reasoning')` | `s.stream?.parts.some(p => p.type === 'reasoning')` | `DSH-0.1.2-A1-03` | **throws** — `.some` on `undefined` as soon as streaming starts |
| B5 | `Pet.tsx:21` | `useSession(s => s.runningCalls.length > 0)` | `useSession(s => s.toolCalls.some(c => c.status === 'running'))` | `DSH-0.1.2-A1-04` | **throws** — `.length` of `undefined` on first render |
| B6 | `Pet.tsx:23` | `s.turnEnds[s.turnEnds.length - 1]?.reason` | `s.turns.at(-1)?.outcome.reason` | `DSH-0.1.2-A1-05` | **throws** — index into `undefined` |

B5 fires on the very first render, so in practice **the pet does not degrade, it disappears** (the error escapes the selector, the slot's error boundary drops the header action). B3 is the dangerous one for QA: it throws nothing and just freezes the pet in `idle`.

---

## 3. Break surface detail

### B1 · Type re-export renamed `ConversationSnapshot` → `SessionView` — `src/client/Pet.tsx:8`

```ts
import type { ConversationSnapshot } from '@deepseek-ai/dsh-client-runtime/client'
```

0.1.2-alpha.2 no longer exports `ConversationSnapshot` from the client entry; the read model is the store-projected `SessionView` (one snapshot object per session, slices addressed by field). The runtime keeps a deprecated type alias for one minor, but it is annotated `@deprecated` and is not a substitute for the runtime changes below.

Post-migration:

```ts
import type { SessionView } from '@deepseek-ai/dsh-client-runtime/client'
```

**Card:** `DSH-0.1.2-A1-01` (snapshot type surface: one view type, slice access).

### B2 · `PropsRuntime` selector argument — `src/client/Pet.tsx:10, 18-23`

`PropsRuntime<'conversation.session.header.actions'>` still yields `{ useSession, t }`, and the slot name is unchanged (see §6), but `useSession` is now typed `useSession<T>(select: (view: SessionView) => T): T`. The four selectors in `Pet` therefore stop type-checking against the old field names before they ever run.

Post-migration (unchanged call shape, new view):

```ts
export type PetProps = PropsRuntime<'conversation.session.header.actions'> & PropsLocale<'pet'>
// useSession(select: (view: SessionView) => T): T
```

No change is required to `PropsLocale<'pet'>`, the slot name, or the `t` binding.

### B3 · `snapshot.running` boolean removed → `status` — `src/client/Pet.tsx:19`

```ts
const running = useSession(s => s.running)
```

0.1.2-alpha.2 makes the run state a single closed enum on the session view (`'idle' | 'running' | 'settling'`); the boolean was a lossy projection of it and is gone from the view. Reads return `undefined`, the selector does not throw, and the pet silently stops animating while a turn is in flight.

Post-migration:

```ts
const running = useSession(s => s.status === 'running')
// if `settling` should also count as active: s.status !== 'idle'
```

**Card:** `DSH-0.1.2-A1-02` (`running` → `status` enum; `running` retained only inside the compat projection, see §4).

### B4 · `snapshot.partial.blocks` → `snapshot.stream.parts` (and `block.kind` → `part.type`) — `src/client/Pet.tsx:13-15`, consumed at `:20`

```ts
function isThinking(snapshot: ConversationSnapshot): boolean {
  return snapshot.partial?.blocks.some(block => block.kind === 'reasoning') ?? false
}
```

Two renames plus one containment change:

* the streaming slice moved from `partial` to `stream` (`null` when not streaming — the optional chain survives, which is exactly why this one is easy to mis-migrate);
* the array is now `parts`, ordered by part index, not `blocks`;
* the discriminator is `part.type`, not `block.kind`; the reasoning literal is still `'reasoning'`.

The optional chain only guards `partial`. Once `stream` exists, `blocks` is `undefined` and `.some` throws — so the pet crashes at the exact moment the feature is supposed to show "thinking".

Post-migration:

```ts
function isThinking(view: SessionView): boolean {
  return view.stream?.parts.some(part => part.type === 'reasoning') ?? false
}
```

Note on selector hygiene: keep `isThinking` at module scope (as now) so it stays referentially stable across renders; an inline arrow re-subscribes on every render in 0.1.2-alpha.2.

**Card:** `DSH-0.1.2-A1-03` (`partial`/`blocks`/`kind` → `stream`/`parts`/`type`).

### B5 · `snapshot.runningCalls` array → `snapshot.toolCalls` keyed registry — `src/client/Pet.tsx:21`

```ts
const toolRunning = useSession(s => s.runningCalls.length > 0)
```

`runningCalls` is not just renamed; it changes *shape and meaning*. 0.1.2-alpha.2 keeps a keyed call registry (`toolCalls`, entries carry `callId`, `name`, `status: 'pending' | 'running' | 'done' | 'failed'`) so partial/parallel calls can be updated in place. Two consequences:

* `s.runningCalls` is `undefined` → `.length` throws on first render;
* the old count also swept in *queued* calls; `.length > 0` and "a tool is actually executing" are no longer the same predicate, so a blind `toolCalls.length > 0` would be a behavior regression even after the rename.

Post-migration:

```ts
const toolRunning = useSession(s => s.toolCalls.some(call => call.status === 'running'))
```

**Card:** `DSH-0.1.2-A1-04` (`runningCalls` → `toolCalls` registry + status filter).

### B6 · `snapshot.turnEnds[].reason` → `snapshot.turns[].outcome.reason` — `src/client/Pet.tsx:23`

```ts
const lastTurnEnd = useSession(s => s.turnEnds[s.turnEnds.length - 1]?.reason)
```

The flat `turnEnds` side-array is gone; turn history lives on `turns`, and the terminal reason moved one level down into `outcome` (with a re-enumerated value set — the old `end_turn`-style reason strings are not carried over). `s.turnEnds` is `undefined`, so `s.turnEnds.length` throws before the `?.` can help.

Post-migration:

```ts
const lastOutcome = useSession(s => s.turns.at(-1)?.outcome.reason)
// values: 'completed' | 'aborted' | 'error' (map explicitly; do not compare against the old strings)
```

Also note `turnEnds` only ever carried *end reasons*; if the celebration frame needs the finish timestamp or token usage, those live on `turns.at(-1)?.outcome` as well and must be selected separately.

**Card:** `DSH-0.1.2-A1-05` (`turnEnds` → `turns[].outcome`; reason enum renumbered).

---

## 4. Which fields can ride the compatibility projection, and which must switch now

0.1.2-alpha.2 ships a **one-minor read-only compatibility projection** over the new store (`@deepseek-ai/dsh-client-runtime/compat`, also reachable as the deprecated `snapshot.legacy` view). It rebuilds the *representable* subset of the old flat snapshot, logs a deprecation warning per read, and is scheduled for removal in 0.1.3. It is a bridge for shipping order, **not** a migration.

| Field | Reconstructible by projection? | Verdict | Why |
| --- | --- | --- | --- |
| `running` (B3) | Yes — `status !== 'idle'` is an exact inverse for this plugin | **May run first through the projection** | Only a boolean is derived; no information is lost, and behavior is bit-identical. Ship order: keep `s.running` for one release, migrate to `status` before 0.1.3. |
| `partial` presence (streaming flag) | Yes — `stream !== null` | **May run first through the projection** | The projection materializes `partial` as `null | { blocks }`; presence is exact. Do not read `.blocks` through it in new code. |
| `partial.blocks[].kind` (B4) | Partially — parts can be folded into blocks, but the projection drops part `phase` and ordering guarantees | **Switch to `stream.parts` immediately** | Even when it works it returns a *different* model; the pet's "thinking" state would be computed from a value the projection owner is free to stop maintaining. Dual-read here means two truths. |
| `runningCalls` (B5) | **No** — no array exists; the registry is keyed and only live entries are retained | **Must switch immediately** | The projection has nothing to project: `.length` throws, and the nearest reconstruction (`Object.keys(...).length`) would change the queued-vs-running semantics. |
| `turnEnds` (B6) | **No** — end-reason history is not retained in the flat form; reasons are re-enumerated under `outcome` | **Must switch immediately** | No data source; any shim would be fabricated state and would disagree with the transcript on abort/error. |
| `ConversationSnapshot` type (B1/B2) | Runtime alias only, `@deprecated` | **Switch immediately** | Type-level break: the alias does not carry the new fields, so the projection cannot be typed through it. Nothing compiles until the import moves. |

Practical consequence: an interim release that leans on the projection can keep only B3 (and the "is streaming" boolean) untouched. B1/B2, B4, B5, B6 must land in the same change as the 0.1.2-alpha.2 bump — they are the parts of the read surface where 0.1.2 changed *semantics*, not just *names*.

Rule of thumb used above: **projection is safe only where the new model still materializes the same information; it is unsafe wherever the new model changed cardinality (array → registry, side-array → nested outcome) or the value domain (boolean → enum, reason strings → outcome enum).**

---

## 5. Post-migration shape of the whole component (sketch, not applied)

```tsx
import { useEffect, useRef, type CSSProperties } from 'react'
import type { PropsLocale, PropsRuntime } from '@deepseek-ai/dsh-client-ui-slots'
import type { SessionView } from '@deepseek-ai/dsh-client-runtime/client'   // was ConversationSnapshot

export type PetProps = PropsRuntime<'conversation.session.header.actions'> & PropsLocale<'pet'>

function isThinking(view: SessionView): boolean {
  return view.stream?.parts.some(part => part.type === 'reasoning') ?? false
}

export function Pet({ useSession, t }: PetProps) {
  const running     = useSession(s => s.status === 'running')
  const thinking    = useSession(isThinking)
  const toolRunning = useSession(s => s.toolCalls.some(call => call.status === 'running'))
  const lastOutcome = useSession(s => s.turns.at(-1)?.outcome.reason)
  // ...
}
```

Behavioral note: `lastOutcome` is currently read and then voided (`void lastTurnEnd as CSSProperties`) — it is dead weight in the fixture. If the celebration frame is still wanted, branch on `lastOutcome === 'completed'`; if not, drop the read rather than carry a dead selector into the new view (each selector is a subscription).

---

## 6. Surfaces checked and found already compatible (negative evidence)

| Surface | Location | Verdict |
| --- | --- | --- |
| Slot registration `{ name, id, order }` | `index.ts:38-42` | Unchanged in 0.1.2-alpha.2; `conversation.session.header.actions` is still the header-actions slot id and `order: 10` still means "left of the default actions". |
| Service inject list `['slots', 'conversation', 'locale']` | `index.ts:29`, `index.ts:38` | Unchanged. `conversation` remains a valid ordering edge: the slot is declared in ui-conversation's `apply`, and `slots.register` into an undeclared slot still throws — keep the `ctx.inject` wrapper. |
| `ctx.effect(() => ctx.locale.register(NS, { zh, en }), 'pet: dictionaries')` | `index.ts:36` | Unchanged signature; the dictionary is returned as a disposer, which `ctx.effect` still accepts. |
| `LocaleNamespaceMap` module augmentation | `index.ts:14-19` | Unchanged; `PropsLocale<'pet'>` still resolves through it. |
| `package.json` client block | `package.json:6-9` | `platform: web` and the three `inject` entries (`dsh-client-runtime`, `dsh-client-ui-conversation`, `dsh-client-locale`) are still the correct preload ids; no entry rename in this release. |
| `cordis.patch.yml` | `cordis.patch.yml:1-3` | Loader schema unchanged. |
| `locales.ts` | whole file | Pure data; no runtime coupling. |

In other words: **the registration half of this plugin is already 0.1.2-shaped; only the read half is pre-migration.** That is consistent with the fixture being trimmed to the snapshot surface.

---

## 7. Recommended migration order (when the code change is authorized)

1. **B1/B2 (types)** — move to `SessionView`; this is what makes the remaining errors compile-visible instead of runtime-visible.
2. **B5, B6 (immediate)** — no projection exists; land together with the version bump.
3. **B4 (immediate)** — move to `stream.parts`; verify with a reasoning-only turn that the pet still switches to `thinking`.
4. **B3 (projection-first, optional)** — may stay on `s.running` for one release, but the deprecation warning makes this a scheduled cleanup; if the migration ships as one change, do it now.
5. **Verification** — (a) idle session: pet `idle`, no selector errors in console; (b) reasoning-only turn: `thinking`; (c) tool call with no reasoning: `working`; (d) aborted turn: pet must not celebrate; (e) uninstall/reinstall of the entry: dictionaries still register via `ctx.effect` dispose.

Acceptance for the whole migration: no read of `partial`, `runningCalls`, `turnEnds`, or `running` remains in `src/client/`, and no `@deepseek-ai/dsh-client-runtime/compat` import survives into 0.1.3.

---

## 8. Read-only attestation

No file under `fixture/` was created, modified, moved, or deleted. No migration, install, or package-manager command was run; no external network access was used. SHA-256 of the inspected tree (unchanged):

```
73D74CF519C91984DAEF5148CF17A4AB7275DC36B0A3F4C98C755E93FF218F0A  fixture/cordis.patch.yml
154E9FD5F8E1B9006571B0D842F7670476411B793B291E6938ADE40701F1F903  fixture/package.json
C1114413138587E985B76C1FD8E43E91C9CD0E06F43B19C17B09BCCA2A8B72D8  fixture/README.md
94533A879790CDCBBE47624C4409352EA0B2F7A637284CDA0E88DB1F18D0DD05  fixture/src/client/index.ts
D56AA3AAFF649BDD3AAD777D4272E8E690B2918FB168E573953102DFDDEEC5FF  fixture/src/client/locales.ts
777A963FFA454F0BA340BABB7269F378D6DACA8F0F2AACBFD2C08187345B3EC3  fixture/src/client/Pet.tsx
```

---

## 9. Card index used in this report

| Card | Subject |
| --- | --- |
| `DSH-0.1.2-A1-01` | Snapshot type surface: `ConversationSnapshot` → `SessionView` (renamed export, deprecated alias) |
| `DSH-0.1.2-A1-02` | Run state: boolean `running` → `status` enum |
| `DSH-0.1.2-A1-03` | Streaming slice: `partial.blocks[].kind` → `stream.parts[].type` |
| `DSH-0.1.2-A1-04` | Tool activity: `runningCalls` array → `toolCalls` keyed registry |
| `DSH-0.1.2-A1-05` | Turn outcome: `turnEnds[].reason` → `turns[].outcome.reason` |
| `DSH-0.1.2-A1-06` | Compatibility projection window (`runtime/compat`, `snapshot.legacy`), removed in 0.1.3 |

All six belong to the A1 series (client snapshot read surface). Numbering follows series order; the fixture does not ship the card catalog and this run was restricted to the fixture/agent-output tree, so confirm the index order against the release's card list before filing the migration PR — the *subjects* above are what the migration must be reviewed against.


## Required output (JSON only)
{"decisions":[{"id":"<criterion-id>","verdict":"pass|partial|fail|missing","reason":"short"}],"caps":[{"id":"<cap-id>","triggered":false,"reason":"short"}]}
Every criterion and cap exactly once. pass=full points, partial=half, fail/missing=0; a triggered cap caps the total.