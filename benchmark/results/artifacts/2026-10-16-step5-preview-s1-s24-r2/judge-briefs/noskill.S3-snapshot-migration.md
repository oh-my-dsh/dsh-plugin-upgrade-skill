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

# S3 · Snapshot Read-Surface Migration Assessment — `@demo/dsh-bench-pet`

- **Upgrade:** dsh `0.1.1-rc.1` → `0.1.2-alpha.2`
- **Mode:** read-only assessment — no fixture file was modified, nothing was executed, no migration was performed (per brief: "do not touch the code yet").
- **Fixture under assessment:** `fixture/` — browser pet plugin, `src/client/index.ts`, `src/client/Pet.tsx`, `src/client/locales.ts`, `package.json`, `cordis.patch.yml`.
- **Report date:** 2026-10-16.

---

## 1. What was inspected — and the hard limits of this assessment

**Read (all read-only, all under the permitted `fixture/` path):**

- `fixture/package.json`, `fixture/cordis.patch.yml`, `fixture/README.md`
- `fixture/src/client/index.ts`, `fixture/src/client/Pet.tsx`, `fixture/src/client/locales.ts`

**Read-only local probes** (host-side Cordis inspect provider; host queries run locally, no browser page needed):

- Host `Service` catalog; full contracts for `sessionProjections`, `sessionProjectionCache`, `clientModules`
  (`WebBootEntry.inject`, `WebBootGraph`, `WebBootRelease`).

**Not available, and why it matters:**

1. **The upgrade-card registry** (the `DSH-0.1.2-Ax-xx` cards) lives in the skill materials under the repository
   `skills/` tree. This task's workspace boundary explicitly forbids reading, searching, or citing anything there
   (card identifiers included), and likewise `solution/` and `tests/`. The fixture itself contains no card
   references. → **No verified card numbers can be cited; see §6.**
2. **The 0.1.2-alpha.2 client runtime type definitions** (`@deepseek-ai/dsh-client-runtime`,
   `-ui-slots`, `-ui-conversation`, `-client-locale`) live under `node_modules/`, also outside the permitted
   boundary.
3. **The live client contract could not be observed:** the client-platform inspect providers
   (`client/Service`, `client/Slots`, …) require a connected browser page. The query failed with
   "Client inspect query … timed out … Open or reconnect the Harness page" — this unattended container has no page
   attached. Host-side probes did work and are cited as supporting evidence where relevant.

**How this report stays rigorous anyway.** It separates two claims:

- **What breaks** — derived from the fixture itself. The code self-identifies as "0.1.1-rc.1 era"
  (`index.ts:2`) and its own comments name the legacy surface: *"Animation follows the **flat conversation
  snapshot** fields"* (`Pet.tsx:17`), *"Pose follows the live conversation snapshot"* (`Pet.tsx:2`). A
  snapshot **read-surface** migration replaces exactly that surface, so every flat-field read below is a breaking
  surface **by construction** — independent of what the new field names turn out to be. Findings are tiered:
  **Tier A** = breaks by construction; **Tier B** = version-coupled surface that breaks *if* the corresponding
  0.1.2 contract changed (must be re-validated, cannot be confirmed from inside this boundary).
- **What the new form is** — the *semantics* of each replacement are derivable and stated exactly. The
  *identifiers* (hook names, unit keys, type names) are shown as **provisional shapes** with `<placeholders>`,
  to be confirmed against the card registry / 0.1.2 runtime types before use. No post-migration identifier in
  this report is asserted as fact.

---

## 2. Verdict at a glance

- The plugin's entire coupling to the legacy snapshot lives in `src/client/Pet.tsx` (4 selector reads + 2 type
  anchors) plus one type-level merge in `src/client/index.ts`. Nothing else in the plugin touches the snapshot.
- Only **two** of the four snapshot reads are live (they drive the animation): the reasoning scan
  (`Pet.tsx:20`) and the in-flight tool-call aggregate (`Pet.tsx:21`). The other two — `running`
  (`Pet.tsx:19`) and `turnEnds` (`Pet.tsx:23`) — are read and immediately discarded (`void`).
- The functional migration is therefore small: **re-point 2 live reads at the new read path, delete 2 dead reads,
  re-establish the subscription mechanism, re-validate 3 registration surfaces.** Plus 3 pre-existing defects
  to fix while in the file (§7).
- Exactly **one** read cannot ride a compatibility projection: the reasoning scan (`Pet.tsx:13-15`) — §5.

---

## 3. Findings — every breaking surface, tied to its source location

Card column: not citable from the permitted materials (§6). Each row carries its migration theme instead.

### F1 (Tier A) — flat top-level `running` flag

- **Location:** `src/client/Pet.tsx:19` — `const running = useSession(s => s.running)`
- **Breaks because:** reads the legacy top-level boolean `running` off the flat `ConversationSnapshot`. The flat
  field is part of the read surface this migration replaces.
- **Post-migration form (semantics):** answer "is a turn currently executing" from the new run/status state.
- **Post-migration form (provisional shape — confirm identifiers against the 0.1.2-alpha.2 client contract):**
  ```ts
  const running = useConversation(s => s.<runUnit>.active === true)   // e.g. status/phase === 'running'
  ```
- **Recommended action:** this read is **dead code** (voided at `Pet.tsx:26`) — **delete it, do not port it.**

### F2 (Tier A) — reasoning-emission scan over `partial.blocks`  ← the critical finding

- **Location:** `src/client/Pet.tsx:20` — `const thinking = useSession(isThinking)`;
  `src/client/Pet.tsx:12-15` — `isThinking(s) = s.partial?.blocks.some(b => b.kind === 'reasoning') ?? false`
- **Breaks because:** reads the legacy flat streaming partial (`snapshot.partial.blocks`) and infers "the model is
  emitting reasoning" by scanning for a block whose `kind === 'reasoning'`. This is the most semantically loaded
  read in the plugin: over a *streaming* partial, block identity and lifecycle (delta vs settled blocks, reasoning
  visibility toggles) is exactly what a flat scan gets wrong, so the legacy predicate is both coupled to the old
  shape and fragile under the new one.
- **Post-migration form (semantics):** the same question — "is the model emitting reasoning right now" — must be
  answered from the new structured state: an explicit reasoning-activity signal, or per-block **lifecycle status**
  rather than a flat kind scan.
- **Post-migration form (provisional shape):**
  ```ts
  const thinking = useConversation(s => s.<conversationUnit>.reasoning.active === true)
  // if the new state still exposes blocks, require lifecycle, not just kind:
  //   s.blocks.some(b => b.kind === 'reasoning' && b.status === 'streaming')
  ```
- **Classification: must switch to the new read path immediately** (§5).

### F3 (Tier A) — in-flight tool-call aggregate

- **Location:** `src/client/Pet.tsx:21` — `const toolRunning = useSession(s => s.runningCalls.length > 0)`
- **Breaks because:** reads the legacy flat `runningCalls` array.
- **Post-migration form (semantics):** "any tool call in flight" from the new per-call lifecycle records.
- **Post-migration form (provisional shape):**
  ```ts
  const toolRunning = useConversation(s => s.<toolUnit>.calls.some(c => c.status === 'running'))
  ```

### F4 (Tier A) — turn-end timeline tail

- **Location:** `src/client/Pet.tsx:22-23` —
  `const lastTurnEnd = useSession(s => s.turnEnds[s.turnEnds.length - 1]?.reason)` (comment at `:22`:
  "the last completed turn's end reason picks the settle frame")
- **Breaks because:** reads the legacy flat `turnEnds` timeline array and takes its tail by **array position**.
- **Post-migration form (semantics):** "end reason of the last completed turn" from per-turn records, where
  "last" means **turn sequence**, not array index.
- **Post-migration form (provisional shape):**
  ```ts
  const lastTurnEnd = useConversation(s => {
    const turns = s.<turnUnit>.turns
    return turns[turns.length - 1]?.endReason
  })
  ```
- **Recommended action:** dead code (voided at `Pet.tsx:27`) → delete. Note: the file header (`Pet.tsx:4`)
  documents a "settled turn triggers a celebration frame" behavior that the trimmed code never implements —
  decide explicitly whether to implement it on the new read path or drop it; do not lose it silently.

### F5 (Tier A) — the read mechanism itself arrives through the slot-props contract

- **Location:** `src/client/Pet.tsx:7` (`import type { PropsLocale, PropsRuntime } from
  '@deepseek-ai/dsh-client-ui-slots'`), `:10`
  (`export type PetProps = PropsRuntime<'conversation.session.header.actions'> & PropsLocale<'pet'>`),
  `:18` (`export function Pet({ useSession, t }: PetProps)`)
- **Breaks because:** the selector subscription is not imported from a package — it is **projected into the
  component through the slot props type** (`t` provably comes from `PropsLocale<'pet'>`; by symmetry
  `useSession` comes from `PropsRuntime<'conversation.session.header.actions'>`). If 0.1.2-alpha.2 reshapes that
  props projection — renames the hook, changes the selector signature, or moves the conversation read off the slot
  props — the destructure fails at compile time and **every** read site fails with it.
- **Post-migration form (semantics):** re-establish the subscription through the 0.1.2 props/read contract for the
  same slot key; rebuild `PetProps` from it.
- **Post-migration form (provisional shape):**
  ```ts
  export type PetProps = Props<'conversation.session.header.actions'> & PropsLocale<'pet'>
  export function Pet({ useConversation, t }: PetProps) { /* reads per F1-F4 */ }
  ```

### F6 (Tier A) — the legacy flat snapshot type is the type anchor of the read surface

- **Location:** `src/client/Pet.tsx:8` — `import type { ConversationSnapshot } from
  '@deepseek-ai/dsh-client-runtime/client'`; used at `:13` (`isThinking`'s parameter).
- **Breaks because:** the selector's parameter type *is* the read surface. When the snapshot shape migrates, this
  import either disappears or changes shape; either way `isThinking`'s signature is invalid.
- **Post-migration form (semantics):** type selectors against the new snapshot / read-state type exported by the
  0.1.2 client runtime; keep predicates pure and **absence-tolerant** (see §5, capability absence).

### F7 (Tier B) — locale namespace-map augmentation target

- **Location:** `src/client/index.ts:14-19` —
  `declare module '@deepseek-ai/dsh-client-ui-slots' { interface LocaleNamespaceMap { pet: PetKey } }`;
  consumed at `Pet.tsx:10` (`PropsLocale<'pet'>`) and `Pet.tsx:25` (`t`).
- **May break because:** the namespace map is augmented on the **slots** package. If 0.1.2 moves
  `LocaleNamespaceMap` (e.g. into the locale package), the augmentation silently applies to *nothing* and
  `PropsLocale<'pet'>` / `t` typing degrades — a **silent**, not loud, failure mode.
- **Post-migration form (semantics):** re-point the `declare module` augmentation at whichever module owns
  `LocaleNamespaceMap` in 0.1.2; keep the payload shape (`Record<PetKey, string>` × zh/en,
  `src/client/locales.ts`) unless the register contract also changes (F9).

### F8 (Tier B) — client service inject list

- **Location:** `src/client/index.ts:29` — `export const inject = ['slots', 'conversation', 'locale']`;
  consumed at `:38` (`ctx.inject(['slots', 'conversation'], …)`).
- **May break because:** service-key renames break the ordering edges; the code's own comment (`:25-27`) flags
  that registering into an undeclared slot throws.
- **Post-migration form (semantics):** same list, keys re-validated against the 0.1.2 client service table.

### F9 (Tier B) — locale registration

- **Location:** `src/client/index.ts:36` —
  `ctx.effect(() => ctx.locale.register(NS, { zh, en }), 'pet: dictionaries')`, with `NS = 'pet'` (`:22`).
- **May break because:** `register` signature / payload shape change.
- **Post-migration form (semantics):** same call, signature re-validated. `locales.ts` is plain data and is
  expected to survive unchanged.

### F10 (Tier B) — slot registration: slot key, `order` option, registrant form

- **Location:** `src/client/index.ts:39-42` —
  `scope.slots.register({ name: 'conversation.session.header.actions', id: 'pet', order: 10 }, Pet)`
- **May break because:** (a) the slot key `conversation.session.header.actions` may be renamed in 0.1.2 —
  registering into an undeclared slot **throws** (comment at `:26-27`); (b) the `order` option may be
  renamed/reshaped; (c) the registrant form may change from a bare component to a factory/explicit node — the
  host-side slot inspection model already distinguishes "Slot and Factory topology nodes".
- **Post-migration form (semantics):** same registration against the 0.1.2 slot key, option names, and registrant
  shape per the new `slots.register` contract.

### F11 (Tier B, latent) — client wire `inject` list omits the slots package

- **Location:** `fixture/package.json` — `client.inject: ["dsh-client-runtime", "dsh-client-ui-conversation",
  "dsh-client-locale"]`, while the code imports and augments `@deepseek-ai/dsh-client-ui-slots`
  (`Pet.tsx:7`, `index.ts:14`).
- **May break because:** today every `dsh-client-ui-slots` use is type-only, so the omission is latent. If
  0.1.2's wire composition (host `clientModules` → `WebBootEntry.inject`) stops resolving transitive
  dependencies, or the slots package is merged/renamed, the augmentation target and props types may fail to
  resolve. The observed host contract shows a malformed/missing declaration "aggregates into one loud throw" at
  boot.
- **Post-migration form (semantics):** declare every package the plugin's types come from — add
  `dsh-client-ui-slots` (or its 0.1.2 successor) to `client.inject`.

### F12 (Tier B, watch) — patch entry identity

- **Location:** `fixture/cordis.patch.yml` — inserts plugin id `bench-pet` / name `@demo/dsh-bench-pet`.
- **May break because:** only if 0.1.2 changes the cordis patch schema. No migration impact expected; the plugin
  id and package name must stay stable across the upgrade.

---

## 4. Post-migration target shape — summary picture

The legacy read surface is **one flat snapshot object** read through a selector hook injected via slot props:

```
useSession(selector)  →  ConversationSnapshot { running, partial.blocks[].kind, runningCalls[], turnEnds[].reason, … }
```

The 0.1.2 direction (semantics; identifiers provisional) is a **structured, per-domain read state** reached
through the 0.1.2 props/read contract, where each concern the pet needs is an explicit, versioned piece of state:

```
useConversation(selector)  →  <runUnit>.active            (was: running)
                              <conversationUnit>.reasoning.activity   (was: partial.blocks kind scan)
                              <toolUnit>.calls[].status     (was: runningCalls.length > 0)
                              <turnUnit>.turns[].endReason  (was: turnEnds tail)
```

Supporting local evidence for this direction (host-side, observed read-only via the inspect provider): the host
already exposes `ctx.sessionProjections` — domain plugins register **versioned projection units** (key + pure
fold over the session event log + `stateVersion` + wire view) and clients receive a consistent cut
(`ProjectionSnapshot { values, asOfSeq }`) with `Object.is` change notification; `ctx.sessionProjectionCache`
serves version-matched cached rows. A client read surface built on versioned per-domain views rather than one flat
object is consistent with that architecture. The client-side read surface itself could not be inspected
(no browser page — §1), so treat the identifiers as provisional until confirmed.

---

## 5. Compatibility projection vs. immediate switch to the new read path

**What a compatibility projection is here:** a transitional unit registered **on the new read path** that
republishes one legacy-shaped value so existing consumers keep working for a deprecation window. DSH's projection
machinery is built for exactly this kind of versioned transitional citizen: units carry `stateVersion` +
`viewSchema`, are pure folds over the session event log, produce a consistent cut, and notify on `Object.is`
change (host `ctx.sessionProjections` contract, observed locally). Two consequences the migration must respect:

- **Capability absence is a first-class state.** In the projection model an unloaded domain's key disappears from
  the snapshot and clients read it as *capability absence*. The pet's reads must tolerate `undefined` (fall back
  to the `idle` frame) instead of assuming flat fields exist.
- **Versions are pinned.** Views are version-matched; the migration must pin the unit versions it reads rather
  than assuming "newest shape".

| Finding | Field | Classification | Rationale |
|---|---|---|---|
| **F2** | `partial.blocks` reasoning scan | **Immediate — no safe projection** | Reasoning-emission detection over a *streaming* partial is precisely where a flat re-publish lies (delta vs settled blocks, lifecycle/visibility toggles). The answer must come from the new structured reasoning-activity state directly. |
| **F5 / F6** | subscription mechanism + snapshot type | **Immediate** | Type/mechanism level: there is no legacy surface left to project *onto*. The new read path must exist first; the compatibility projection itself can only be built **on top of** the new path. |
| **F7** | `LocaleNamespaceMap` augmentation | Immediate (type-level) | Silent-failure augmentation; re-point with the switch. |
| **F3** | `runningCalls.length > 0` | **Projection-eligible short-term**; prefer immediate | The in-flight *set* still exists in the new per-call lifecycle, so a projection can filter it losslessly — but the aggregate discards per-call detail and the port is a one-liner. |
| **F1** | `running` | Projection-eligible — **but delete** (dead read) | Pure boolean, losslessly derivable from the new run/status state. |
| **F4** | `turnEnds` tail | Projection-eligible **only if** per-turn end reasons survive; else immediate | The projection must preserve "last **completed** turn" ordering (sequence-based, not array-position). Dead read → delete. |
| **F8-F12** | registration / wire surfaces | Re-validate with the switch | Not snapshot reads; ordering edges and wire composition. |

**Recommended order:**

1. Delete F1 + F4 and their `void` lines — zero-risk surface reduction (also removes the bogus cast, D1).
2. Land the new read path (F5/F6) — everything else hangs off it.
3. Flip F2 **immediately** (no projection); flip F3 in the same change, or behind a one-release compatibility
   projection if the new tool-call view is not ready yet.
4. Re-point F7; re-validate F8/F9/F10; fix F11.
5. Fix D2 (render-derived frame) and decide the documented celebration-frame behavior (`Pet.tsx:4`).

---

## 6. Card mapping (requirement 3) — honestly blocked by the workspace boundary

The brief asks for the full card number per finding (e.g. `DSH-0.1.2-A1-xx`). **No verified card numbers exist
inside the permitted materials, and none were invented.** The upgrade-card registry is part of the skill materials
under the repository `skills/` tree; this task's workspace boundary explicitly forbids reading, searching, or
citing anything there — card identifiers included — and likewise `solution/` and `tests/`. The fixture contains
no card references, the client runtime types that would corroborate card content are outside the permitted paths
(`node_modules/`), and the live client inspect providers that could have confirmed the 0.1.2 client contract were
unavailable (no browser page connected; the client `Service.listService` query timed out).

Pattern-guessing numbers (`DSH-0.1.2-A1-01` …) would be fabrication and would corrupt exactly the mapping this
report exists to provide. Instead, the **mapping key** — one row per finding, with the migration theme to match
against the registry, so exact card numbers can be attached in one pass:

| Finding | Migration theme (match against the card registry) | Source |
|---|---|---|
| F2 | Reasoning/thinking detection: flat `partial.blocks` kind-scan → structured reasoning-activity read | Pet.tsx:12-15, 20 |
| F3 | In-flight tool calls: flat `runningCalls` array → per-call lifecycle read | Pet.tsx:21 |
| F1 | Top-level `running` flag → run/status read | Pet.tsx:19 |
| F4 | Flat `turnEnds` timeline → per-turn records with end reason | Pet.tsx:22-23 |
| F5 | Slot-props projection: conversation read hook shape/signature | Pet.tsx:7, 10, 18 |
| F6 | `ConversationSnapshot` type → new snapshot/read-state type | Pet.tsx:8, 13 |
| F7 | `LocaleNamespaceMap` ownership/location | index.ts:14-19; Pet.tsx:10 |
| F8 | Client service inject keys | index.ts:29, 38 |
| F9 | `ctx.locale.register` signature | index.ts:36 |
| F10 | Slot registration: slot key, `order` option, registrant form | index.ts:39-42 |
| F11 | Client wire `inject` composition completeness | package.json |
| F12 | Patch entry identity stability | cordis.patch.yml |

---

## 7. Pre-existing defects found during the assessment (fix while migrating)

- **D1 — invalid cast.** `src/client/Pet.tsx:27` — `void lastTurnEnd as CSSProperties` parses as
  `(void lastTurnEnd) as CSSProperties`: an `undefined` → `CSSProperties` assertion that is a TS2352 error
  under `strictNullChecks` and dead weight otherwise. It disappears when F4's dead read is deleted.
- **D2 — the animation never updates.** `src/client/Pet.tsx:24, 28-31` — `frame.current` is a ref mutated
  inside `useEffect`; React does not re-render on ref mutation, so `data-frame` is frozen at `idle` after
  mount. Derive the frame during render and drop the ref/effect:
  ```ts
  const frame = toolRunning ? 'working' : thinking ? 'thinking' : 'idle'
  return <div data-frame={frame} className="pet" />
  ```
- **D3 — dead reads.** `src/client/Pet.tsx:19, 23, 25` (`running`, `lastTurnEnd`, `t` are all `void`ed).
  Delete rather than port; this alone removes half the snapshot coupling.

---

## 8. Read-only discipline statement

- Every access to `fixture/` was a read (content dumps, line-numbered listing). No file under `fixture/` was
  created, modified, moved, or deleted; the fixture is exactly as delivered.
- No migration, installation, build, or plugin execution was performed; no code was changed.
- No external services or network fetches; no writes outside the permitted output path. The only write produced
  by this assessment is this report, under `agent-output/S3-snapshot-migration/`.
- All analysis ran inline (read-only scans + host-local inspect queries); no temporary files were created, so
  there is nothing to clean up.


## Required output (JSON only)
{"decisions":[{"id":"<criterion-id>","verdict":"pass|partial|fail|missing","reason":"short"}],"caps":[{"id":"<cap-id>","triggered":false,"reason":"short"}]}
Every criterion and cap exactly once. pass=full points, partial=half, fail/missing=0; a triggered cap caps the total.