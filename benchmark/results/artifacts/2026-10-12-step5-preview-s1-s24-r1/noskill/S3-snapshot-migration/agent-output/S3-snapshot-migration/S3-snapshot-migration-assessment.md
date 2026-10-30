# S3 · Snapshot Read-Surface Migration Assessment

**Plugin under assessment:** `@demo/dsh-bench-pet` (browser pet, session header)
**Host migration:** dsh `0.1.1-rc.1` → dsh `0.1.2-alpha.2`
**Evidence fixture:** `...\noskill\S3-snapshot-migration\fixture\`
**Mode:** read-only assessment — no code was modified, no migration or install was executed.
**Assessment date:** 2026-10-13

---

## 0. Scope limits, and an honest statement of what I could not verify

**Fixture inspected (complete — 6 files, 2 directories, confirmed with `Get-ChildItem -Recurse -Force`):**

| File | Role |
| --- | --- |
| `package.json` | client manifest / runtime injects |
| `cordis.patch.yml` | plugin registration patch |
| `README.md` | fixture note ("task material only — cannot be run, must not be published") |
| `src/client/index.ts` | plugin body, slot registration, locale registration, module augmentation |
| `src/client/Pet.tsx` | the component that reads the conversation snapshot |
| `src/client/locales.ts` | dictionary data (no dsh API usage) |

### Blockers I must declare rather than paper over

1. **Upgrade-card catalog is not in the permitted scope, so I cannot cite verified card numbers.**
   Requirement 3 of the brief asks for the full card number (e.g. `DSH-0.1.2-A1-xx`). The fixture contains **no** card catalog, changelog, or release note — I enumerated every file, including hidden ones, and there is nothing of the kind. The workspace boundary restricts reads to the fixture and this output directory, and the task instructions separately forbid reading or citing the repository's `skills/` tree, which is where card identifiers live. The brief itself instructs: *"If something you need is missing from your allowed paths, state that in your report instead of searching elsewhere."*
   **I have therefore not invented any `DSH-0.1.2-A1-xx` identifier.** A fabricated card number would be worse than no card number, because a wrong mapping actively mis-routes the migration. Section 6 is a fill-in table with the exact evidence needed to pin each card as soon as the catalog is made available to me.

2. **The literal 0.1.2-alpha.2 API spelling is inferred, not verified.** I have no access to the hosted changelog, types, or SDK surface, so I cannot prove the new field paths. Every "new form" below is therefore given in two layers:
   - a **structural rule** (what the read must express, and why the old expression fails) — this I can derive from the fixture itself and stand behind;
   - an **illustrative spelling** — marked `⧼inferred⧽`, to be confirmed against the 0.1.2-alpha.2 types before it is committed.

3. **What I *can* stand behind from the fixture alone:** the complete inventory of read sites, which of them are live vs. dead in this trimmed fixture, the direction of each break (rename / re-nest / removal / signature change / hard throw), and the silent-failure risk analysis that drives the projection-vs-immediate split in Section 4.

### Read-only discipline

- No writes were made to the fixture; all fixture `LastWriteTime` values remain `2026/9/3 18:21:09` (files) / `2026/10/12 11:05:30` (directories).
- The only path written to is `...\agent-output\S3-snapshot-migration\` (this report), as designated.
- No parent, sibling, `solution/`, `tests/`, `benchmark/`, `skills/`, or repository-root path was listed, globbed, or opened.

---

## 1. Inventory of the snapshot read surface

The pet's animation is driven entirely by `useSession` reads in `src/client/Pet.tsx`. There are **four distinct snapshot reads** plus one whole-snapshot selector signature:

| # | Read site | Old expression | What it feeds | Live in this fixture? |
| --- | --- | --- | --- | --- |
| R1 | `Pet.tsx:19` | `useSession(s => s.running)` | `running` | **No** — consumed by `void running` (`Pet.tsx:26`) |
| R2 | `Pet.tsx:20` | `useSession(isThinking)` — whole-snapshot selector `Pet.tsx:13-15` | `thinking` | **Yes** — drives `'thinking'` frame |
| R3 | `Pet.tsx:14` (inside R2) | `snapshot.partial?.blocks.some(b => b.kind === 'reasoning') ?? false` | `thinking` | **Yes** |
| R4 | `Pet.tsx:21` | `useSession(s => s.runningCalls.length > 0)` | `toolRunning` | **Yes** — drives `'working'` frame |
| R5 | `Pet.tsx:23` | `useSession(s => s.turnEnds[s.turnEnds.length - 1]?.reason)` | `lastTurnEnd` | **No** — consumed by `void lastTurnEnd as CSSProperties` (`Pet.tsx:27`) |

Supporting type surfaces: `ConversationSnapshot` import (`Pet.tsx:8`) and the slot prop types `PropsRuntime` / `PropsLocale` (`Pet.tsx:7`, `Pet.tsx:10`).

`src/client/locales.ts` contains **no dsh API surface** — it is a plain `Record<PetKey, string>` pair. It is clean and needs no migration beyond the namespace it feeds into (see S11).

---

## 2. Every breaking surface, tied to source location

Severity: **BLOCKER** = compile/register failure; **SILENT** = compiles and runs but produces wrong behavior; **TYPE** = type-level only.

### Snapshot read surface (`src/client/Pet.tsx`)

| ID | Location | Old form | Break mechanism | Severity |
| --- | --- | --- | --- | --- |
| **S1** | `Pet.tsx:19` | `useSession(s => s.running)` | Top-level flat `running` boolean on the snapshot. If 0.1.2-alpha.2 re-nests session state (e.g. under a `session` node) or replaces the bare flag with a derived status/state-machine value, this selector resolves to `undefined`. | **TYPE** in this fixture (dead read), **SILENT** if re-enabled |
| **S2** | `Pet.tsx:20` | `useSession(isThinking)` where `isThinking(snapshot: ConversationSnapshot): boolean` | Structural break independent of field names: the read primitive is handed a **whole-snapshot function selector**. If 0.1.2-alpha.2 constrains `useSession` (path literals, `shallow` comparison, or stable-identity selectors) the call signature itself stops matching, regardless of the body. | **BLOCKER** (or **SILENT** if selectors are silently non-reactive) |
| **S3** | `Pet.tsx:14` | `snapshot.partial?.blocks.some(block => block.kind === 'reasoning') ?? false` | Three separable hazards: (a) `partial` (the in-flight buffer) re-nested onto the active turn node; (b) `blocks` renamed (e.g. → `parts`); (c) the `kind` discriminant literal `'reasoning'` renamed or renamed to a different key. Note the guard is asymmetric — `?.` protects `partial` but **not** `blocks`, so `blocks` becoming `undefined` throws at `.some`. | **SILENT** (any of a/b/c → always `false`), **BLOCKER** if `blocks` itself goes undefined |
| **S4** | `Pet.tsx:21` | `useSession(s => s.runningCalls.length > 0)` | `runningCalls` is a flat array of in-flight tool calls. If 0.1.2-alpha.2 replaces the array with derived in-flight tool state (keyed object / count exposed on the call node), `.length` is `undefined`, `undefined > 0` is `false`, and the pet **silently reports idle for the whole duration of every live tool call**. | **SILENT** — worst offender |
| **S5** | `Pet.tsx:23` | `useSession(s => s.turnEnds[s.turnEnds.length - 1]?.reason)` | `turnEnds` array-of-end-records is a denormalized mirror of turn state. If 0.1.2-alpha.2 folds end-of-turn state onto the turn node (`turns.at(-1).endReason`-style) or renames `reason`, this reads `undefined` at a new index. | **TYPE** in this fixture (dead read), **SILENT** if re-enabled |
| **S6** | `Pet.tsx:8` | `import type { ConversationSnapshot } from '@deepseek-ai/dsh-client-runtime/client'` | The type `isThinking` is annotated with. If the snapshot type is renamed, moved, or restructured in 0.1.2-alpha.2, this import fails and R2/R3 collapse with it. | **BLOCKER** |
| **S7** | `Pet.tsx:7`, `Pet.tsx:10` | `import type { PropsLocale, PropsRuntime } from '@deepseek-ai/dsh-client-ui-slots'`; `PetProps = PropsRuntime<'conversation.session.header.actions'> & PropsLocale<'pet'>` | The slot prop contract. `useSession` and `t` are injected *through* these types, so any change to the slots package's prop surface in 0.1.2-alpha.2 breaks the component signature and the `({ useSession, t })` destructure. | **BLOCKER** |

### Registration / wiring surface (`src/client/index.ts`)

| ID | Location | Old form | Break mechanism | Severity |
| --- | --- | --- | --- | --- |
| **S8** | `index.ts:40` | `{ name: 'conversation.session.header.actions', id: 'pet', order: 10 }` | The slot-name string. The fixture's own comment (`index.ts:26-27`) records that *"register() into an undeclared slot throws"* — so a 0.1.2 rename converts a silent miss into a **hard throw at plugin load**. Also affects `PropsRuntime<'conversation.session.header.actions'>` at `Pet.tsx:10` (S7) and the ordering edge. | **BLOCKER** |
| **S9** | `index.ts:29`, `index.ts:38` | `inject = ['slots', 'conversation', 'locale']` / `ctx.inject(['slots', 'conversation'], ...)` | Service-name strings. If the `conversation` service is renamed or absorbed into another service in 0.1.2-alpha.2, `ctx.inject` cannot resolve it and throws. Both the top-level export and the nested call must change together. | **BLOCKER** |
| **S10** | `index.ts:36` | `ctx.effect(() => ctx.locale.register(NS, { zh, en }), 'pet: dictionaries')` | Locale registration call. If the locale service's register signature, namespace handling, or dictionary-shape contract changes in 0.1.2-alpha.2, this call breaks. | **BLOCKER** or **SILENT** (dictionaries fail to attach, `t` returns fallbacks) |
| **S11** | `index.ts:14-19` | `declare module '@deepseek-ai/dsh-client-ui-slots' { interface LocaleNamespaceMap { pet: PetKey } }` | Module augmentation target. If `LocaleNamespaceMap` is moved out of `@deepseek-ai/dsh-client-ui-slots` or renamed in 0.1.2-alpha.2, the augmentation **silently stops applying** — `PropsLocale<'pet'>` (S7) loses its key union and locale keys become untyped. | **SILENT** (type safety loss) |
| **S12** | `index.ts:8`, `index.ts:10` | `import type {} from '@deepseek-ai/dsh-client-locale/client'`; `import type {} from '@deepseek-ai/dsh-client-ui-conversation/client'` | These exist *only* to load the `declare module` merges that provide `ctx.locale` and the `conversation.session.header.actions` SlotMap entry. If the `/client` subpath export is renamed (e.g. → `/browser`) in 0.1.2-alpha.2, the module fails to resolve and the augmentation above silently disappears. | **SILENT** (or **BLOCKER** if the subpath is gone) |
| **S13** | `index.ts:6` | `import type { ClientContext } from '@deepseek-ai/dsh-client-runtime/client'` | Context type import; tied to S12 subpath risk. | **BLOCKER** |

### Manifest / packaging surface

| ID | Location | Old form | Break mechanism | Severity |
| --- | --- | --- | --- | --- |
| **S14** | `package.json:8` | `"inject": ["dsh-client-runtime", "dsh-client-ui-conversation", "dsh-client-locale"]` | Runtime dependency list. Package names and/or version ranges must be bumped to the 0.1.2-alpha.2 host line before the plugin loads. | **BLOCKER** (resolution failure) |
| **S15** | `cordis.patch.yml:1-3` | `- insert: [{ id: 'bench-pet', name: '@demo/dsh-bench-pet' }]` | Plugin registration patch. Verify the `insert` schema against 0.1.2-alpha.2's patch format before applying. | **BLOCKER** if schema changed, otherwise clean |

### Explicitly NOT breaking

- `src/client/locales.ts` — pure data plus a local type alias; no dsh API surface. Clean.
- The `useEffect` / `useRef` frame logic at `Pet.tsx:28-31` and the `data-frame` render at `Pet.tsx:31` — framework-level React only. Clean.
- `src/client/index.ts:22` (`const NS = 'pet'`) and the dictionary payload itself — only the *call* around them (S10) is at risk.

---

## 3. Post-migration form (new API shape)

> **All new spellings below are `⧼inferred⧽`.** The structural rule is derived from the fixture; the literal path must be confirmed against the 0.1.2-alpha.2 types before committing. Card numbers for each are unresolved — see Section 6.

### S1 · `running` flag — `Pet.tsx:19`

Structural rule: the session-running boolean becomes a **derived read**, not a flat mirror on the snapshot. Keep it a single-boolean selector so it stays referentially stable for `useSession`.

⧼inferred⧽ — `const running = useSession(s => s.session.running)`
or, if the flag becomes derived in 0.1.2-alpha.2:
⧼inferred⧽ — `const running = useSession(s => s.status === 'running')`

Migration rule: **do not hand-roll the running condition** from other fields; a projection that re-derives it will drift from the host's own definition.

### S2 · whole-snapshot selector — `Pet.tsx:20`

Structural rule: the selector must be expressed in the form the 0.1.2-alpha.2 read primitive accepts, and it must be **stable across renders** (module scope, not a closure recreated each render). The semantic requirement is unchanged: "is the model emitting reasoning with no tool in flight."

⧼inferred⧽ — if function selectors survive 0.1.2-alpha.2:

```ts
// module scope, not inline — stable identity for the read primitive
const selectReasoning = (s: ConversationSnapshot): boolean =>
  s.partial?.blocks.some(b => b.kind === 'reasoning') ?? false
const thinking = useSession(selectReasoning)
```

⧼inferred⧽ — if 0.1.2-alpha.2 requires a leaf/path read plus a `shallow` comparator, the two halves split:

```ts
const reasoningCount = useSession(s => s.session.reasoningCount)  // ⧼inferred path⧽
const thinking = reasoningCount > 0
```

### S3 · `partial.blocks[].kind === 'reasoning'` — `Pet.tsx:14`

Structural rule: the reasoning detector must go through the **new normalized block/part path**, and the `kind === 'reasoning'` comparison must use the new discriminant literal. Also fix the asymmetric guard — guard the container, not just `partial`.

⧼inferred⧽:

```ts
const blocks = s.session?.blocks ?? s.partial?.blocks ?? []   // ⧼inferred⧽
const thinking = blocks.some(b => b.kind === 'reasoning')     // ⧼inferred literal⧽
```

**Do not fuzzy-match.** If the discriminant literal is unknown at migration time, fail the build (exhaustive `switch` / `never` check) rather than let it default to `false`.

### S4 · `runningCalls.length > 0` — `Pet.tsx:21` (highest-risk read)

Structural rule: in-flight tool state is **derived**, so the length comparison must become a read of the derived in-flight value, not an array-ness probe. The semantic requirement is exactly: "at least one tool call is in flight."

⧼inferred⧽:

```ts
// if the host exposes a derived flag/count:
const toolRunning = useSession(s => (s.session.inFlightCalls ?? 0) > 0)      // ⧼inferred⧽
// if tool state is keyed by id rather than an array:
const toolRunning = useSession(s => Object.keys(s.session.calls).length > 0) // ⧼inferred⧽
```

Migration rule: **never keep `.length` on a value whose array-ness you have not confirmed.** `undefined > 0 === false` is exactly the failure mode that makes this read look healthy while the pet is frozen on `idle`.

### S5 · `turnEnds[last].reason` — `Pet.tsx:23`

Structural rule: end-of-turn state moves onto the turn node, so the "last completed turn" read becomes a last-turn lookup rather than a denormalized-array index. The semantic requirement is: "the end reason of the most recent completed turn."

⧼inferred⧽ — `const lastTurnEnd = useSession(s => s.turns.at(-1)?.endReason)`  ⧼inferred path + literal⧽

Migration rule: index-off-the-end must stay safe (`.at(-1)` / optional chaining), otherwise the selector throws during an empty session.

### S6 · `ConversationSnapshot` import — `Pet.tsx:8`

Structural rule: import the snapshot type from wherever 0.1.2-alpha.2 now defines it, and re-point the `isThinking`/`selectReasoning` annotation and the `s.full` shapes together.

⧼inferred⧽ — `import type { ConversationSnapshot } from '@deepseek-ai/dsh-client-runtime/client'` stays, but the exported **name** must match the 0.1.2-alpha.2 export. If it is renamed (e.g. `SessionSnapshot`), update the annotation at `Pet.tsx:13` in the same commit — do not leave a stale `ConversationSnapshot` reference.

### S7 · slot prop types — `Pet.tsx:7`, `Pet.tsx:10`

Structural rule: keep deriving `PetProps` from the slots package rather than declaring the shape inline, so `useSession` and `t` stay in sync with the host. Update the generic arguments to the new slot id (S8) and locale namespace (`pet` — unchanged).

⧼inferred⧽ — `export type PetProps = PropsRuntime<'conversation.session.header.actions'> & PropsLocale<'pet'>` keeps the same shape; only the slot-name literal changes **in lockstep with S8**.

### S8 · slot name — `index.ts:40`

Structural rule: the slot id must match the id declared by ui-conversation in 0.1.2-alpha.2. Because `register()` into an undeclared slot throws (see the fixture's own comment at `index.ts:26-27`), this is a **fail-fast** break, not a drift.

⧼inferred⧽:

```ts
scope.slots.register(
  { name: 'conversation.session.header.actions', id: 'pet', order: 10 }, // ⧼new id⧽
  Pet,
)
```

Migration rule: change the name in **all three places at once** — `index.ts:40`, `Pet.tsx:10` (`PropsRuntime<...>`), and any doc comment. Split commits here produce a confusing interval where the plugin compiles but throws at load.

### S9 · service inject list — `index.ts:29`, `index.ts:38`

Structural rule: the inject list is an ordering contract, not just a dependency list. Both the exported `inject` and the nested `ctx.inject(['slots','conversation'], ...)` must name the services that exist in 0.1.2-alpha.2.

⧼inferred⧽ — `export const inject = ['slots', 'conversation', 'locale']` stays if service names survive; if `conversation` is renamed or absorbed, update **both** sites identically and re-verify the ordering edge (the header-actions slot is declared by ui-conversation's apply, and registering before that throws).

### S10 · locale register call — `index.ts:36`

Structural rule: dictionary registration stays inside a `ctx.effect`, keyed by the plugin's namespace, so the effect can be re-run and disposed.

⧼inferred⧽ — `ctx.effect(() => ctx.locale.register(NS, { zh, en }), 'pet: dictionaries')` keeps the same shape; verify only the `register(namespace, dict)` signature and the `NS` treatment.

### S11 · module augmentation target — `index.ts:14-19`

Structural rule: keep augmenting the locale namespace map in the package that still owns it in 0.1.2-alpha.2, and keep the augmentation adjacent to the `PetKey` definition so the two cannot drift.

⧼inferred⧽:

```ts
declare module '@deepseek-ai/dsh-client-ui-slots' {   // ⧼new owner⧽
  interface LocaleNamespaceMap {
    /** The pet's copy. */
    pet: PetKey
  }
}
```

Migration rule: verify with a type-level assertion that `pet: PetKey` is actually picked up — an unapplied augmentation is invisible at runtime and only shows up as silently-untyped locale keys.

### S12 · type-only side-effect imports — `index.ts:8`, `index.ts:10`

Structural rule: these imports exist to load `declare module` merges. Keep them type-only, but re-point them at the 0.1.2-alpha.2 subpaths.

⧼inferred⧽:

```ts
import type {} from '@deepseek-ai/dsh-client-locale/client'           // ⧼subpath⧽
import type {} from '@deepseek-ai/dsh-client-ui-conversation/client'  // ⧼subpath⧽
```

### S13/S14/S15 · manifest and patch

Structural rule: the manifest's runtime injects and the cordis patch must agree with the 0.1.2-alpha.2 host packages before anything else is attempted.

⧼inferred⧽:

```yaml
# cordis.patch.yml — verify against the 0.1.2-alpha.2 patch schema
- insert:
    - id: bench-pet
      name: '@demo/dsh-bench-pet'
```

```jsonc
// package.json — verify package names / ranges against the 0.1.2-alpha.2 host line
"client": { "platform": "web", "inject": [/* ... */] }
```

---

## 4. Compatibility projection vs. immediate switch to a new read path

The host upgrade ships a compatibility projection for the read surface. The split is driven by **one question per field**: *while the projection is active, can this read be wrong without raising an error?* If yes → switch immediately. If it is a pure rename/re-nest with a provably equivalent meaning → it can ride the projection through a transition window.

### 4a. Can go through the compatibility projection first

| Field | Site | Why it is safe to project |
| --- | --- | --- |
| `running` (S1) | `Pet.tsx:19` | Dead in this fixture (`void running`, `Pet.tsx:26`) and semantically a single boolean. Even a transient mis-projection cannot regress behavior here. |
| `turnEnds[last].reason` (S5) | `Pet.tsx:23` | Dead in this fixture (`void lastTurnEnd as CSSProperties`, `Pet.tsx:27`) and a pure re-nest of existing turn state — same information, different location. |
| `partial.blocks[].kind === 'reasoning'` (S3) | `Pet.tsx:14` | Projectable **only if** the reasoning discriminant literal is confirmed unchanged and `blocks` stays an array-typed container. If either is unconfirmed, treat as 4b — see the caveat below. |
| Slot prop types / locale register / manifest / patch (S7, S10, S11, S12, S13, S14, S15) | `index.ts`, `package.json`, `cordis.patch.yml` | Packaging and typing surfaces, not runtime reads; they can be aligned in the same pass as the reads without a behavioral transition window. |

### 4b. Must switch to a new read path immediately

| Field | Site | Why the projection is not enough |
| --- | --- | --- |
| **`runningCalls.length > 0`** (S4) | `Pet.tsx:21` | **Highest priority.** The old expression assumes array-ness. If 0.1.2-alpha.2 exposes derived/keyed in-flight tool state, `.length` is `undefined` and `undefined > 0` is `false` — the pet renders `idle` for the entire duration of every live tool call, with no error and no type error (a `?.length`-style access still type-checks loosely). A projection would faithfully carry the wrong answer forward. |
| **`block.kind === 'reasoning'`** (S3, literal) | `Pet.tsx:14` | Same silent-failure class: a renamed discriminant literal still type-checks against a widened union but compares unequal at runtime, so `thinking` is permanently `false`. **Switch immediately unless the literal is verified unchanged.** |
| **`useSession(isThinking)` whole-snapshot selector** (S2) | `Pet.tsx:20` | A signature-level change cannot be projected — there is no compatible shim for an arbitrarily-shaped function selector. If the 0.1.2-alpha.2 read primitive constrains selectors, this fails immediately, and only the call form can be fixed. |
| **Slot name** (S8) | `index.ts:40` | The fixture's own comment records that registering into an undeclared slot **throws** (`index.ts:26-27`). A projection cannot suppress a throw, so this must be corrected in the commit that upgrades the host. |
| **Service inject list** (S9) | `index.ts:29`, `index.ts:38` | Same reason — `ctx.inject` on a non-existent service throws at load. |
| **`ConversationSnapshot` type** (S6) | `Pet.tsx:8` | Compile-time gate; nothing downstream can be type-checked until this import resolves, so it blocks the whole read-surface migration. |

### 4c. Net transition plan implied by 4a + 4b

1. **Pass 0 (blocking, before anything else):** confirm the card catalog and the 0.1.2-alpha.2 types (Section 6). Resolve S6, S7, S8, S9 — the four that fail loudly.
2. **Pass 1 (same commit as Pass 0):** switch S4 and the S3 discriminant literal to the new read path immediately. These are the two silent-wrong-behavior reads.
3. **Pass 2 (may ride the projection):** S1 and S5 can stay on the projected reads through a transition window, since they are dead reads in this fixture — but they must be re-pointed before the projection is removed, not dropped.
4. **Pass 3 (typing/packaging):** S10–S15, with a type-level assertion that the `pet` namespace augmentation still applies.

---

## 5. Risk ranking

| Rank | ID | Risk |
| --- | --- | --- |
| 1 | **S4** `Pet.tsx:21` | Silent permanent freeze on `idle` during live tool calls |
| 2 | **S3** `Pet.tsx:14` | Silent permanent freeze on `idle` during reasoning |
| 3 | **S2** `Pet.tsx:20` | Selector-signature incompatibility; not projectable |
| 4 | **S8** `index.ts:40` | Hard throw at plugin load (slot name) |
| 5 | **S9** `index.ts:29`, `38` | Hard throw at plugin load (service names) |
| 6 | **S6** `Pet.tsx:8` | Compile gate for the whole read surface |
| 7 | **S1 / S5** | Dead reads today; latent break if re-enabled |
| 8 | **S7, S10, S11, S12, S13** | Type/packaging surfaces; silent safety loss |
| 9 | **S14, S15** | Manifest/patch schema verification |

---

## 6. Card mapping — unresolved, fill-in table

**I have deliberately left every card number blank.** The upgrade-card catalog is not present anywhere in the permitted scope (verified by full recursive enumeration of the fixture, including hidden files), and I am instructed not to read or cite the repository's `skills/` tree where card identifiers live. The brief instructs me to state missing needs rather than search elsewhere or improvise.

To close this table, supply the 0.1.2-alpha.2 card catalog (or the cards' titles/one-line summaries) and the mapping below can be completed mechanically — each row states the exact subject matter the card must cover.

| ID | Site | Subject the card must cover | Card |
| --- | --- | --- | --- |
| S1 | `Pet.tsx:19` | Relocation/derivation of the session `running` flag | **not determinable in scope** |
| S2 | `Pet.tsx:20` | `useSession` selector-signature change (function → constrained/path form) | **not determinable in scope** |
| S3 | `Pet.tsx:14` | Re-nesting/renaming of `partial.blocks` and the `kind` discriminant (`'reasoning'`) | **not determinable in scope** |
| S4 | `Pet.tsx:21` | Replacement of the flat `runningCalls` array with derived/keyed in-flight tool state | **not determinable in scope** |
| S5 | `Pet.tsx:23` | Folding of `turnEnds[].reason` onto the turn node (`endReason`) | **not determinable in scope** |
| S6 | `Pet.tsx:8` | Rename/move of the `ConversationSnapshot` type export | **not determinable in scope** |
| S7 | `Pet.tsx:7`, `10` | Change to `PropsRuntime` / `PropsLocale` in the slots package | **not determinable in scope** |
| S8 | `index.ts:40` | Slot-id rename for `conversation.session.header.actions` | **not determinable in scope** |
| S9 | `index.ts:29`, `38` | Service-name change for `conversation` (or absorption into another service) | **not determinable in scope** |
| S10 | `index.ts:36` | Locale `register` signature / namespace contract change | **not determinable in scope** |
| S11 | `index.ts:14-19` | Move/rename of `LocaleNamespaceMap` | **not determinable in scope** |
| S12 | `index.ts:8`, `10` | Rename of the `/client` subpath export | **not determinable in scope** |
| S13 | `index.ts:6` | `ClientContext` type change | **not determinable in scope** |
| S14 | `package.json:8` | Runtime inject package names/ranges for the 0.1.2-alpha.2 line | **not determinable in scope** |
| S15 | `cordis.patch.yml` | Patch schema verification | **not determinable in scope** |

**Why I did not guess.** Card identifiers such as `DSH-0.1.2-A1-xx` are opaque labels that cannot be derived from the fixture — the fixture contains no catalog, no changelog, and no cross-reference. Any number I produced would be a fabrication, and a wrong mapping is actively harmful: it would direct the migration to work the wrong card and let the two silent-failure reads (S3, S4) ship broken. An accurate mapping is one that is *not asserted where it cannot be verified*.

---

## 7. Summary

- **15 breaking surfaces** identified across 5 files, each tied to a source location: 6 in `src/client/Pet.tsx`, 6 in `src/client/index.ts`, 2 in `package.json`/`cordis.patch.yml`, plus the package.json manifest.
- **The snapshot read surface has 4 distinct reads** (R1–R5 in Section 1) and **two of them fail silently** on the new host: `runningCalls.length > 0` (`Pet.tsx:21`) and `block.kind === 'reasoning'` (`Pet.tsx:14`). These are the ones that must move to the new read path immediately; they do not raise an error, they just freeze the pet's animation.
- **Two reads are dead in this trimmed fixture** (`running` at `Pet.tsx:19`, `turnEnds[].reason` at `Pet.tsx:23`) and can therefore ride the compatibility projection through a transition window — but they must be re-pointed before the projection is removed.
- **Two sites throw rather than drift** (slot name `index.ts:40`, service inject `index.ts:29`/`38`), so they cannot be projected and must be corrected in the host-upgrade commit.
- **Card numbers are deliberately not supplied.** The catalog is outside the permitted scope; I would rather report the gap accurately than fabricate a mapping. Section 6 is the fill-in table.
