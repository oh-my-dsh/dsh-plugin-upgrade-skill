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
#### FILE: S3-snapshot-migration/report.md

# S3 · Snapshot Read-Surface Migration Assessment — `@demo/dsh-bench-pet`

**Target migration:** dsh 0.1.1-rc.1 → dsh 0.1.2-alpha.2 (snapshot read-surface migration).
**Mode:** read-only assessment. No code touched, no migration/install executed.

---

## 0. Scope, method, read-only discipline

Inspected (read-only) every file under the fixture:
`README.md`, `cordis.patch.yml`, `package.json`, `src/client/Pet.tsx`, `src/client/index.ts`, `src/client/locales.ts`.

No fixture file was modified. No migration or install was run. Nothing outside the READ
allowlist (`fixture/`, `agent-output/`) was opened, globbed, or read — including the
skills/ directory, `solution/`, `tests/`, `node_modules/`, and the installed DSH checkout.

**NOSKILL constraint (honest gap, not a refusal to work):** this cell has the upgrade skill
*unavailable*, and the workspace boundary forbids reading/searching the `skills/` directory
and *citing card identifiers* (`DSH-0.1.x-xx`) from it. Consequently the exact post-migration
field names/API shapes and the exact card numbers (brief requirement #3) cannot be sourced from
any authorized path. **I do not fabricate them.** Everything below that is verifiable from the
fixture code is stated as fact; the projection-vs-switch split (§4) is clearly marked as reasoned
inference pending the cards.

---

## 1. How this plugin reads the snapshot

All animation state is derived from the live conversation snapshot through
`useSession(selector)`, supplied by the ui-conversation slot type
`PropsRuntime<'conversation.session.header.actions'>` (`Pet.tsx:10`). Each `selector` maps a
`ConversationSnapshot` (imported from `@deepseek-ai/dsh-client-runtime/client`) to a value, so
**every `useSession` selector is a snapshot read surface.** The 0.1.1-rc.1 era reads the *flat*
snapshot fields (`Pet.tsx:17`: "Animation follows the flat conversation snapshot fields"), which
is exactly the surface the 0.1.2-alpha.2 migration restructures.

---

## 2. Inventory of snapshot read surfaces (the break surfaces)

| # | Source location | Current (0.1.1-rc.1) read | Kind |
|---|---|---|---|
| S1 | `Pet.tsx:8` | `import type { ConversationSnapshot } from '@deepseek-ai/dsh-client-runtime/client'` | type-level surface |
| S2 | `Pet.tsx:19` | `useSession(s => s.running)` → `snapshot.running: boolean` | flat scalar |
| S3 | `Pet.tsx:13–15` (used at `:20`) | `snapshot.partial?.blocks.some(b => b.kind === 'reasoning')` | flat `partial` object → nested `blocks[].kind` |
| S4 | `Pet.tsx:21` | `useSession(s => s.runningCalls.length > 0)` → `snapshot.runningCalls: array` | flat array |
| S5 | `Pet.tsx:23` | `useSession(s => s.turnEnds[s.turnEnds.length - 1]?.reason)` → `snapshot.turnEnds[].reason` | flat array → nested `.reason` |

S2–S5 are the four runtime snapshot read surfaces; S1 is the compile-time type surface they all
depend on. This inventory is exhaustive for this plugin — `index.ts` touches only Cordis plugin
APIs (`ctx.effect`, `ctx.locale.register`, `ctx.inject`, `scope.slots.register`), not the
snapshot, so it is unaffected by *this* migration.

---

## 3. Per-surface assessment

### S1 — `ConversationSnapshot` type dependency (`Pet.tsx:8`)
- **Current form:** type-only import of `ConversationSnapshot`; also drives the
  `isThinking(snapshot: ConversationSnapshot)` parameter (`Pet.tsx:13`) and the selector input
  type of every `useSession` call.
- **Break impact:** if 0.1.2-alpha.2 renames the snapshot type or moves its fields, this import and
  every dependent annotation stop compiling.
- **Post-migration form:** import/annotate the new snapshot type and adjust all selectors (§3 S2–S5)
  accordingly. Exact new type name is defined by the corresponding card (unavailable in NOSKILL).

### S2 — `running` (`Pet.tsx:19`)
- **Current form:** `useSession(s => s.running)` — flat boolean "a turn is currently running".
- **Break impact:** flat field removed/renamed by the snapshot read-surface migration.
- **Post-migration form:** read the new activity/status field (or its derived form). Exact new shape
  is defined by the corresponding card (unavailable in NOSKILL).

### S3 — `partial.blocks[].kind === 'reasoning'` (`Pet.tsx:13–15`, `:20`)
- **Current form:** deep nested read — `snapshot.partial?.blocks.some(b => b.kind === 'reasoning')`;
  detects "model emitting reasoning with no tool in flight".
- **Break impact:** two nested levels (`partial` → `blocks` → `kind`); any rename of
  `partial`, of the block list, or of the `'reasoning'` block kind breaks the read at runtime
  (silently yields `false`) or compile time.
- **Post-migration form:** read the new in-flight/streaming block surface and the new reasoning-block
  discriminator. Exact new shape is defined by the corresponding card (unavailable in NOSKILL).

### S4 — `runningCalls` (`Pet.tsx:21`)
- **Current form:** `useSession(s => s.runningCalls.length > 0)` — flat array of in-flight tool
  calls; only its length is consumed.
- **Break impact:** flat field removed/renamed by the migration.
- **Post-migration form:** read the new in-flight-tool-call surface and take its count/derived flag.
  Exact new shape is defined by the corresponding card (unavailable in NOSKILL).

### S5 — `turnEnds[].reason` (`Pet.tsx:23`)
- **Current form:** `useSession(s => s.turnEnds[s.turnEnds.length - 1]?.reason)` — last completed
  turn's end reason (drives the "settle/celebration" frame).
- **Break impact:** flat turn-history field + nested `.reason`; the turn-lifecycle/end-reason model
  is restructured by the migration.
- **Post-migration form:** read the new turn-history/end-reason surface. Exact new shape is defined by
  the corresponding card (unavailable in NOSKILL).

---

## 4. Compatibility projection vs immediate switch (brief requirement #4)

The 0.1.2-alpha.2 migration keeps a **compatibility projection** that can still serve some old flat
fields for a transition window, while fields whose underlying model changed must switch to the
**new read path immediately**.

**Authoritative classification lives in the upgrade cards, which are out of scope in this NOSKILL
cell.** Based solely on the code + migration semantics, my *reasoned* (unverified) split is:

- **Likely projection-safe (can run first through a compat projection):**
  - `running` (`Pet.tsx:19`) — a coarse "is a turn running" boolean, cheaply derivable from the
    new snapshot with no semantic loss.
  - `runningCalls` length (`Pet.tsx:21`) — an in-flight-tool-call count, likewise derivable.
- **Likely must switch to the new read path immediately:**
  - `partial.blocks[].kind === 'reasoning'` (`Pet.tsx:13–15/20`) — depends on the block taxonomy;
    if the block list or the `'reasoning'` kind changed, a projection would be lossy/incorrect.
  - `turnEnds[].reason` (`Pet.tsx:23`) — depends on the turn-completion/end-reason model; a
    restructured turn lifecycle has no faithful flat projection.

*These two buckets are inference, not card-sourced; the per-field authoritative verdict and the exact
new identifiers must come from the corresponding upgrade card.*

---

## 5. Card mapping (brief requirement #3) — honest gap

The brief asks me to cite the full card numbers (e.g. `DSH-0.1.2-A1-xx`). Under the NOSKILL
constraint I am forbidden from reading/searching the `skills/` directory and from citing its card
identifiers, and the workspace boundary lists no path where those cards are authorized for me.
**I therefore report no card numbers rather than invent them.** When the card catalog is available
in a SKILL-enabled run, each surface in §2 (S1–S5, i.e. the four snapshot fields plus the type
import) maps 1:1 to the corresponding snapshot read-surface card(s).

---

## 6. Completeness checklist (did I miss a surface?)

All snapshot reads in this plugin are the `useSession` selectors in `Pet.tsx`; there are exactly
four (`running`, `partial.blocks[].kind`, `runningCalls`, `turnEnds[].reason`), plus the
`ConversationSnapshot` type import. Nothing else in `index.ts`, `locales.ts`, `package.json`,
or `cordis.patch.yml` reads the snapshot. Migration is complete only when **all of S1–S5** are
updated together.


## Required output (JSON only)
{"decisions":[{"id":"<criterion-id>","verdict":"pass|partial|fail|missing","reason":"short"}],"caps":[{"id":"<cap-id>","triggered":false,"reason":"short"}]}
Every criterion and cap exactly once. pass=full points, partial=half, fail/missing=0; a triggered cap caps the total.