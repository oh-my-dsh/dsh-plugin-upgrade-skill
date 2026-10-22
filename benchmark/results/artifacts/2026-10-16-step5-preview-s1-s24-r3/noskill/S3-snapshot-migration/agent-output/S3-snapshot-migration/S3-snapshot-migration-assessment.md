# S3 · Snapshot Read-Surface Migration Assessment

| | |
|---|---|
| **Plugin** | `@demo/dsh-bench-pet` — browser pet (pixel companion in the session header), client half |
| **Written for** | dsh `0.1.1-rc.1` |
| **Target host** | dsh `0.1.2-alpha.2` |
| **Mode** | **Read-only assessment.** No source, config, or fixture file was created, modified, or deleted. No migration was executed. |
| **Scope** | The **snapshot read surface** (every place the plugin reads the live conversation snapshot) — requirements 1–4 of the brief. Adjacent, non-snapshot surfaces are listed in §6 as *verify* items, not asserted breaks. |

---

## 0. Verdict in one paragraph

The plugin's entire snapshot read surface is **ten elements, all in `src/client/Pet.tsx`** (lines 7–8, 10, 13–15, 18–21, 23, 26–27, plus the consumers at 24/28–31). `src/client/index.ts` never reads the snapshot — it only mentions it in a doc comment (`index.ts:4`). Of those ten elements, **three are the read path itself** (type import, slot-props type, `useSession` destructure) and **two are structurally coupled reads that cannot ride a field-level compatibility projection** (`partial?.blocks[].kind === 'reasoning'` via a whole-snapshot callback, and the positional `turnEnds[len-1].reason` tail read). Those five are **immediate switches**. Two reads (`running`, `runningCalls.length`) are whole-value/one-hop reads with unchanged meaning and are the **projection candidates**. Two of the ten are **dead reads** (`void running`, `void lastTurnEnd as CSSProperties`) that have no runtime effect but still gate compilation — the classic thing a keyword-driven migration misses. **Requirement 3 of the brief (exact card numbers) could not be satisfied from the materials this run is permitted to read; see §5.1 for the honest statement and §5.2 for a keyed mapping that makes attaching the numbers a 10-minute job.**

---

## 1. What was inspected, and read-only discipline

Every file under the permitted `fixture/` path was read in full (6 files, 4,814 bytes total). Nothing else was opened — no repository root, no `skills/`, no `solution/`, no `tests/`, no `node_modules/`, no DSH checkout, no temp directory. No scratch files were created; the only file written is this report.

| File | Bytes | SHA-256 (first 16 hex) |
|---|---|---|
| `fixture/package.json` | 227 | `154e9fd5f8e1b900` |
| `fixture/cordis.patch.yml` | 64 | `73d74cf519c91984` |
| `fixture/README.md` | 204 | `c1114413138587e9` |
| `fixture/src/client/index.ts` | 1,546 | `94533a879790cdcb` |
| `fixture/src/client/locales.ts` | 337 | `d56aa3aaff649bdd` |
| `fixture/src/client/Pet.tsx` | 1,520 | `777a963ffa454f0b` |

These hashes were computed **before** this report was written and **re-verified after**; they are identical, i.e. the fixture is byte-for-byte unchanged. All line references below come from direct inspection of those files.

---

## 2. Complete inventory of the snapshot read surface

"Snapshot read surface" = the snapshot type, the hook that reads it, the slot-props plumbing that delivers the hook, and every field navigation performed on the snapshot. There are exactly ten elements, all in `src/client/Pet.tsx`:

| # | Location | Current form (abridged) | What it reads | Coupling class |
|---|---|---|---|---|
| **S1** | `Pet.tsx:8` | `import type { ConversationSnapshot } from '@deepseek-ai/dsh-client-runtime/client'` | the snapshot **type identity** + the module it lives in | read-path plumbing |
| **S2** | `Pet.tsx:10` | `PetProps = PropsRuntime<'conversation.session.header.actions'> & PropsLocale<'pet'>` | the slot-props type that carries `useSession` | read-path plumbing |
| **S3** | `Pet.tsx:18` | `export function Pet({ useSession, t }: PetProps)` | the read hook itself | read-path plumbing |
| **S4** | `Pet.tsx:19` | `useSession(s => s.running)` | `running` — scalar boolean | whole-value field read |
| **S5** | `Pet.tsx:20` + `13–15` | `useSession(isThinking)`; `isThinking` → `snapshot.partial?.blocks.some(b => b.kind === 'reasoning')` | `partial` (optional) → `blocks[]` → `kind` | **whole-snapshot callback + nested optional + discriminant test** |
| **S6** | `Pet.tsx:21` | `useSession(s => s.runningCalls.length > 0)` | `runningCalls` — array | one-hop collection read + plugin-side derivation |
| **S7** | `Pet.tsx:23` | `useSession(s => s.turnEnds[s.turnEnds.length - 1]?.reason)` | `turnEnds[]` **tail** → `reason` | **positional / membership-sensitive collection read** |
| **S8** | `Pet.tsx:26` | `void running` | `running` | **dead read — compile-time dependency only** |
| **S9** | `Pet.tsx:27` | `void lastTurnEnd as CSSProperties` | `turnEnds[].reason` | **dead read — compile-time dependency only** |
| **S10** | `Pet.tsx:6`, `:24`, `:28–31` | `import { …, type CSSProperties } from 'react'`; `useRef('idle')`; `useEffect` frame machine; `data-frame` render | consumers of the values above | downstream of every read |

Two details that are easy to miss and are called out again in §3:

* **S9 is the only reason `CSSProperties` is imported** (`Pet.tsx:6`). Delete S9 and that import becomes dead too.
* **S5's callback receives the entire snapshot object**, not one field. Even a perfect field-level compatibility projection does not repair a function whose *parameter type* is the whole snapshot — this read is coupled to the snapshot's overall shape, not to any single field.

---

## 3. Break analysis and post-migration form, per surface

**Placeholder convention.** Tokens in `CAPS` (`NEW_READ_HOOK`, `NEW_SNAPSHOT_TYPE`, `NEW_RUNNING`, `NEW_PARTIAL`, `NEW_BLOCKS`, `NEW_BLOCK_KIND`, `NEW_CALLS`, `NEW_TURNS`, `NEW_TURN_REASON`, `NEW_SNAPSHOT_MODULE`) stand for identifiers that only the `0.1.2-alpha.2` upgrade card can supply — they are deliberately **not** guessed (see §5.1). Everything else in each skeleton — the shape, the semantics, the fallbacks, the derivations — is normative and derived from the current code.

### S1 — the snapshot type import (`Pet.tsx:8`)

```ts
// 0.1.1-rc.1
import type { ConversationSnapshot } from '@deepseek-ai/dsh-client-runtime/client'

// 0.1.2-alpha.2 — same import site, new module + new type name
import type { NEW_SNAPSHOT_TYPE } from 'NEW_SNAPSHOT_MODULE'
```

* **Breaks because:** the snapshot type is the type identity of the whole read surface. If `0.1.2-alpha.2` renames the type or moves it out of `@deepseek-ai/dsh-client-runtime` into the package that owns the new read path, this import (and therefore every selector typed against it) fails to resolve.
* **Also do:** if the snapshot type moves to a *new owning package*, add that package to `client.inject` in `package.json:8` (see A6). A type-only move does not need a runtime dependency; a read-path move does.
* **Class: immediate** — this *is* the read path; there is nothing to project.

### S2 — the slot-props type (`Pet.tsx:10`, import at `:7`)

```ts
// 0.1.1-rc.1
export type PetProps = PropsRuntime<'conversation.session.header.actions'> & PropsLocale<'pet'>

// 0.1.2-alpha.2 — keep the intersection shape; re-point the PropsRuntime half at
// whatever module/type 0.1.2 declares for this slot's props.
export type PetProps = PropsRuntime<'conversation.session.header.actions'> & PropsLocale<'pet'>
//                 ^ import site at :7 re-pointed; injected hook name may change (→ S3)
```

* **Breaks because:** `PropsRuntime<...>` is what injects `useSession` into the component's props. If the read hook changes name, moves module, or the props helper itself is renamed, the type and the destructure at `:18` must change together.
* **Preserve:** the slot-name string `'conversation.session.header.actions'` (verify it still exists in 0.1.2's slot registry — A5), and the `& PropsLocale<'pet'>` intersection (locale surface, A2).
* **Class: immediate** — read-path plumbing.

### S3 — the read-hook destructure (`Pet.tsx:18`)

```ts
// 0.1.1-rc.1
export function Pet({ useSession, t }: PetProps) {

// 0.1.2-alpha.2 — one identifier; keep the local alias so the call sites below are untouched
export function Pet({ NEW_READ_HOOK: useSession, t }: PetProps) {
```

* **Breaks because:** the hook name is part of the read-path migration.
* **Preserve:** the local alias `useSession` (rename-on-destructure keeps the four call sites stable and the diff reviewable).
* **Selector identity note (applies to S4–S7):** three of the four reads pass **inline arrow functions** as selectors (`:19`, `:21`, `:23`), which are new function identities on every render. If the 0.1.2 read path requires stable selector references, hoist them to module scope or wrap in `useCallback`. `isThinking` at `:20` is already a stable named function — keep it that way.
* **Class: immediate.**

### S4 — the running flag (`Pet.tsx:19`, dead twin at `:26`)

```ts
// 0.1.1-rc.1
const running = useSession(s => s.running)

// 0.1.2-alpha.2
const running = useSession(s => s.NEW_RUNNING)
```

* **Semantics to preserve:** a boolean that is true while the session is executing; it drives tail-wag speed (per the header comment at `Pet.tsx:3–4`). In the trimmed fixture it is only dead-read at `:26`; in the untrimmed original it is live (see §7-L2).
* **Class: projection-capable (provisional).** Whole-value scalar read, one property hop, meaning unchanged. This is the textbook case for a compatibility alias. The dead read at `:26` must move with it in the same change (§3-S8).

### S5 — the reasoning / partial read (`Pet.tsx:20` + `13–15`)

```ts
// 0.1.1-rc.1
function isThinking(snapshot: ConversationSnapshot): boolean {
  return snapshot.partial?.blocks.some(block => block.kind === 'reasoning') ?? false
}
const thinking = useSession(isThinking)

// 0.1.2-alpha.2
function isThinking(s: NEW_SNAPSHOT_TYPE): boolean {
  return s.NEW_PARTIAL?.NEW_BLOCKS.some(block => block.NEW_BLOCK_KIND === 'reasoning') ?? false
}
const thinking = useSession(isThinking)
```

* **Breaks because:** three independent couplings stack here — (i) the callback's parameter type is the *entire* snapshot, so any reshape retypes it; (ii) the navigation is nested and optional (`partial?.blocks`); (iii) it tests a discriminant (`kind === 'reasoning'`). Any one of the three moving breaks this read.
* **Preserve:** the optional-`partial` short-circuit with the `?? false` fallback (when there is no partial, the answer is `false`, not `undefined`); the `reasoning` discriminant; the current assumption that `blocks` is present whenever `partial` is — either keep that assumption explicitly or harden it to `NEW_PARTIAL?.NEW_BLOCKS?.some(...)`; the stable named-function form of the selector.
* **Fork to decide:** if the 0.1.2 read path no longer hands selectors the whole snapshot (e.g. selectors read a narrower state object), `isThinking` cannot be passed by reference and must become either an inline selector over the new state or a small adapter — decide this *before* writing the code, it changes the shape of the fix.
* **Class: immediate.** A field-level projection does not help a whole-object callback.

### S6 — in-flight tool calls (`Pet.tsx:21`)

```ts
// 0.1.1-rc.1
const toolRunning = useSession(s => s.runningCalls.length > 0)

// 0.1.2-alpha.2
const toolRunning = useSession(s => s.NEW_CALLS.length > 0)
```

* **Semantics to preserve:** "at least one tool call is in flight" — this is what picks the `working` frame (`Pet.tsx:29`). The derivation is plugin-side and survives any rename.
* **The one case where this read cannot ride a naive projection:** if the in-flight collection stops being array-like (becomes a keyed record/map), `.length` must become `Object.keys(s.NEW_CALLS).length > 0` / `s.NEW_CALLS.size > 0`. Check the collection's kind in the card before assuming a one-token rename.
* **Class: projection-capable (conditional)** — rides the projection if the collection stays array-like; immediate switch if it becomes keyed.

### S7 — the turn-timeline tail read (`Pet.tsx:23`)

```ts
// 0.1.1-rc.1
const lastTurnEnd = useSession(s => s.turnEnds[s.turnEnds.length - 1]?.reason)

// 0.1.2-alpha.2 — same intent, expressed on the new turn surface
const lastTurnEnd = useSession(s => s.NEW_TURNS.at(-1)?.NEW_TURN_REASON)
```

* **Semantics to preserve — and the trap:** this is "the end reason of the most recently **completed** turn" (comment at `Pet.tsx:22`). The read is **positional and membership-sensitive**, not merely name-sensitive:
  * *Positional:* it takes the **tail** of the list. If 0.1.2 reverses ordering, or exposes a current-turn object plus a separate history, the equivalent read is `history.at(-1)` / `lastCompletedTurn` — not `turns[0]`.
  * *Membership:* `turnEnds` is a list of **completed** turn ends. If the new turn list also contains the **in-flight** turn, the tail silently becomes the *running* turn and the settle/celebration frame fires at the wrong time. This is a behavioral bug that type-checks cleanly — flag it in review.
* **Class: immediate.** Positional reads over a restructured timeline are exactly what a flat-field projection does not cover.

### S8 / S9 — the dead reads (`Pet.tsx:26–27`)

```ts
// 0.1.1-rc.1
void running
void lastTurnEnd as CSSProperties

// 0.1.2-alpha.2 — either delete both lines, or re-point them with S4 / S7.
// If deleted: the `type CSSProperties` import at Pet.tsx:6 becomes unused and must go too.
```

* **Breaks because:** they have no runtime effect, but they are **compile-time dependencies** on the old field paths. A migration that greps for *used* fields and skips `void` statements leaves the build broken for no visible reason — or, worse, "fixes" them by deleting lines the untrimmed plugin actually needs (see §7-L2).
* **Class: immediate** — they must move in the same commit as the field they touch.

### S10 — the consumers (`Pet.tsx:24`, `:28–31`)

* The frame machine currently derives only from `toolRunning` / `thinking` (`:29`); `running` and `lastTurnEnd` are dead in the trimmed fixture. The observable output is the `data-frame` attribute on the rendered div (`:31`) with values `idle` / `thinking` / `working` — that attribute is the cheapest regression oracle for the whole migration (drive a session into each state and assert the frame).
* **Class:** moves with whatever it consumes; no independent action.

---

## 4. Compatibility projection vs. immediate switch

### 4.1 The criteria (apply these to the card text, not to habit)

A read **can run first through a compatibility projection** when all three hold:

1. **Whole-value read** — at most one property hop, no optional chaining into nested structure, no positional indexing;
2. **Plugin-side derivation** — any logic applied to the value belongs to the plugin, not to the snapshot's internal shape;
3. **Unchanged meaning** — the field still denotes the same thing in 0.1.2 (a rename, not a redefinition).

A read **must switch to the new read path immediately** when any of these holds:

1. It navigates nested/optional structure whose shape the migration restructures;
2. It is **positional or membership-sensitive** on a collection (tail reads, "last completed X");
3. It goes through a **callback that receives the entire snapshot** — the parameter type is the whole object;
4. It **is** the read path (type import, props type, hook);
5. It is a **compile-time-only dependency** (dead read) — it must move with its field or be deleted.

### 4.2 Matrix

| Surface | Projection-capable? | Deciding criterion | Deadline |
|---|---|---|---|
| S1 type import, S2 props type, S3 hook | **No** | criterion 4 — it *is* the read path | immediately (compile gate) |
| S4 `running` | **Yes (provisional)** | 1 + 2 + 3 all hold | may lag one release behind the projection |
| S6 `runningCalls.length` | **Conditional** | holds only if the collection stays array-like | lag if array-like; immediate if keyed |
| S5 `partial.blocks` / `kind` | **No** | criteria 1 + 3 — whole-object callback + nested optional + discriminant | immediately |
| S7 `turnEnds` tail / `reason` | **No** | criterion 2 — positional + membership-sensitive | immediately |
| S8, S9 dead reads | **N/A** | criterion 5 — compile-time dependencies | same commit as the field they touch |

**Provisional** / **conditional** are the honest labels: whether the 0.1.2 projection actually covers `running` and `runningCalls` is stated by the card's projection-coverage list, which is not readable in this run (§5.1). If the card's coverage list does not include them, they move from the second column to the first.

### 4.3 If you do use a projection, use exactly one

Centralize it in a single adapter so the debt is visible and removable in one commit:

```ts
// session-compat.ts — TEMPORARY. Delete once S4/S6 are re-pointed.
import type { ConversationSnapshot } from '@deepseek-ai/dsh-client-runtime/client'
import type { NEW_SNAPSHOT_TYPE } from 'NEW_SNAPSHOT_MODULE'

/** Project the 0.1.2 snapshot onto the 0.1.1-rc.1 flat field names. */
export function toLegacySnapshot(s: NEW_SNAPSHOT_TYPE): ConversationSnapshot {
  return {
    running: s.NEW_RUNNING,
    runningCalls: s.NEW_CALLS,
    turnEnds: /* … */,
    partial: /* … */,
  }
}
```

Caveats: (a) the shim can only cover what the card declares as projected — S5 and S7 fall outside a field-level projection by construction, which is *why* they are immediate; (b) a shim that synthesizes a whole legacy snapshot object costs an allocation per read — measure before adopting it for the whole-snapshot callback; (c) give the shim a removal date the day you add it.

### 4.4 Sequencing

1. **Commit 1 — compile gate (no behavior change tolerated):** S1, S2, S3, S5, S7, plus delete-or-re-point S8/S9 (and drop the `CSSProperties` import at `:6` if S9 is deleted).
2. **Commit 2 — may ride the projection:** S4, S6. Re-point them now if the card's coverage list excludes them; otherwise re-point in the next release and track `session-compat.ts` as dated debt.
3. **Commit 3 — cleanup:** delete `session-compat.ts`; re-run the frame assertions.

---

## 5. Upgrade-card mapping

### 5.1 Honest statement on requirement 3 (full card numbers)

**The exact card numbers cannot be cited from this run, and I have not invented any.** The authoritative `DSH-0.1.2-A1-xx` catalog is not present in either path this run is permitted to read — the fixture contains no card reference of any kind (verified by a full-content scan of all six files, not a sample). The harness rule for this task forbids reading *or citing* card identifiers from the repository's `skills/` directory, and every other path on the box is outside the permitted read set. Fabricating numbers in a migration document would be worse than leaving them open: a maintainer would cite cards that do not exist. §5.2 therefore maps each surface to the **theme** of its governing card plus exact lookup keys, so the numbers can be attached in minutes once the catalog is in scope. Nothing else in this report depends on the card text: the locations, the semantics to preserve, and the projection criteria in §4.1 are all derived from the code itself.

### 5.2 Keyed mapping + lookup worksheet

| Surface(s) | Governing card theme | Lookup keys in the `DSH-0.1.2-A1` catalog | Card # |
|---|---|---|---|
| S1, S2, S3 | snapshot **read path**: read hook, snapshot type module, slot-props plumbing | `snapshot`, `read path`, `useSession`, `PropsRuntime`, `ConversationSnapshot` | `DSH-0.1.2-A1-??` |
| S4 | flat-field rename + projection coverage for the **running** flag | `running`, `compatib`, `projection`, `alias` | `DSH-0.1.2-A1-??` |
| S5 | **streaming partial** / reasoning-block read restructure | `partial`, `blocks`, `reasoning` | `DSH-0.1.2-A1-??` |
| S6 | **in-flight tool-call** collection | `runningCalls`, `calls`, `tool` | `DSH-0.1.2-A1-??` |
| S7 | **turn timeline** / turn-end reason | `turnEnds`, `turn`, `reason` | `DSH-0.1.2-A1-??` |
| S8, S9 | same card as the field each touches (S4 / S7) — they are compile-time twins | as above | `DSH-0.1.2-A1-??` |
| A1–A7 (§6) | locale / slots / inject / patch surfaces — verify only | `locale`, `slots`, `inject`, `patch` | `DSH-0.1.2-A1-??` |

When the catalog is in scope, the only column that changes is the last one — and the card's **projection-coverage list** is what converts the two *provisional* rows in §4.2 (S4, S6) into final answers.

---

## 6. Adjacent surfaces to verify (not the snapshot read surface)

These are **not** part of the snapshot read surface and are **not** asserted to break; they are the neighbouring surfaces a snapshot migration usually drags along, listed so the migration is not surprised by them.

| # | Location | Surface | What to verify on 0.1.2-alpha.2 |
|---|---|---|---|
| A1 | `index.ts:6`, `:8`, `:10` | type-only imports pulling the locale Context merge (`ctx.locale`) and the ui-conversation SlotMap merge | module specifiers still resolve and still merge; re-point if any merge moves |
| A2 | `index.ts:14–19` | `declare module '@deepseek-ai/dsh-client-ui-slots'` → `interface LocaleNamespaceMap { pet: PetKey }` | augmentation target module and interface name (a rename here breaks `PropsLocale<'pet'>` at `Pet.tsx:10` and the `t` prop) |
| A3 | `index.ts:29` | `inject = ['slots', 'conversation', 'locale']` | the `'conversation'` entry is an **ordering edge** (comment at `:25–27`): the `header.actions` slot is declared by ui-conversation's apply, and `register()` into an undeclared slot **throws**. If the service is renamed, this edge silently becomes a runtime throw |
| A4 | `index.ts:36` | `ctx.locale.register(NS, { zh, en })` | locale registration API shape |
| A5 | `index.ts:38–43` | `scope.slots.register({ name: 'conversation.session.header.actions', id: 'pet', order: 10 }, Pet)` | the slot **name string** must exist in 0.1.2's registry; confirm `order: 10` still means the same thing (vs. any new ordering API) |
| A6 | `package.json:8` | `client.inject: ["dsh-client-runtime", "dsh-client-ui-conversation", "dsh-client-locale"]` | must declare the package that owns the **new snapshot read path**. Note `@deepseek-ai/dsh-client-ui-slots` (imported at `Pet.tsx:7` and `index.ts:14`) is **not** declared here — it arrives transitively; if 0.1.2 tightens declaration rules, add it |
| A7 | `cordis.patch.yml:1–3` | `insert: [{ id: bench-pet, name: '@demo/dsh-bench-pet' }]` | patch schema and client-entry resolution under 0.1.2 |

---

## 7. Limitations and open questions

* **L1 — card catalog out of scope (§5.1).** Exact card numbers and the exact new identifiers are placeholders. This is the one requirement of the brief that could not be met literally; the reason and the workaround are stated rather than papered over.
* **L2 — the fixture is a trimmed excerpt.** `README.md:3` says "trimmed from real pre-migration code". The dead reads at `Pet.tsx:26–27` and the header comment at `Pet.tsx:3–4` ("a settled turn triggers a celebration frame") show the real plugin consumes `running` and `lastTurnEnd` in ways invisible here. **This assessment is complete for the fixture as given; re-run the §2 inventory against the real source before migrating** — the real read surface is probably larger than ten elements.
* **L3 — no release diff was available.** Nothing in the permitted materials states what `0.1.2-alpha.2` actually changes. The report therefore enumerates every element of the read surface and the decision criteria, instead of asserting a specific diff.
* **L4 — no build or typecheck was run** (read-only mandate). All line references come from direct file inspection; a `tsc --noEmit` against the 0.1.2 packages is the first thing to run once the migration starts.
* **L5 — one behavioral trap to watch in review:** S7's "last **completed** turn" semantics (§3-S7). A re-pointed read that type-checks can still return the in-flight turn's end reason and fire the settle frame at the wrong moment.

---

## 8. Ordered migration checklist

1. [ ] Pull the `DSH-0.1.2-A1` catalog into scope; fill the last column of §5.2; read the **projection-coverage list** and finalize the §4.2 verdicts for S4/S6.
2. [ ] Re-run the §2 inventory against the **untrimmed** source (L2) — expect more reads than the ten in the fixture.
3. [ ] Commit 1 (compile gate): re-point S1 (`Pet.tsx:8`), S2 (`:7`/`:10`), S3 (`:18`); rewrite `isThinking` (S5, `:13–15`/`:20`); re-express the turn-tail read (S7, `:23`); delete-or-re-point S8/S9 (`:26–27`) and drop the `CSSProperties` import (`:6`) if deleted.
4. [ ] Decide the S5 fork (whole-snapshot callback vs. narrower state) **before** writing the selector.
5. [ ] Commit 2: re-point S4 (`:19`) and S6 (`:21`) — immediately if the projection doesn't cover them or the call collection is keyed; otherwise behind `session-compat.ts` with a removal date.
6. [ ] Commit 3: delete the projection shim.
7. [ ] Verify A1–A7 (§6), especially A3 (ordering edge) and A6 (declare the new read path's package).
8. [ ] Regression: assert `data-frame` ∈ {`idle`, `thinking`, `working`} across session states (S10) — it exercises all four reads at once.
9. [ ] Confirm the fixture is still byte-identical to the §1 hash table before handing the plugin back.

---

*Assessment produced under BENCHMARK-AUTH-v1. Read-only: the fixture was inspected and re-verified unchanged; no migration, installation, build, or network action was performed.*
