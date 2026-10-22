# JUDGE BRIEF · skill.S6-corridor-net-state

## Criteria (sealed rubric)
- [corridor-net-state] (25pt) Explain alpha.1 removal followed by alpha.2 restoration of SessionEvent.ignorable retention, applying the final alpha.2 state to produceExternalEvent in src/events.ts. Correct version history is required; bare A1-02/A2-01 card names earn no credit, and equivalent history without card IDs is acceptable.
- [remove-marker-stripping] (25pt) Locate delete (event as any).ignorable and reject the comment prescribing continued stripping on alpha.2. Recommend removing that defense and correcting its obsolete rationale. Distinguish removing the stripping code from removing the marker itself. It is valid to note that the shown literal currently has no marker, so the delete is a no-op, while still rejecting the intended stripping policy.
- [informational-producer] (25pt) Explain that only informational events whose semantics old readers may omit without breaking reconstruction can carry ignorable:true; required events must not be made ignorable. Retention across persistence/reload is not a reader-side filtering instruction: marked events remain in the loaded log. Apply this to the third-party/informational producer while respecting the live append limitation.
- [public-append-gap] (25pt) Identify the public live Session.append capability gap: it has no supported ignorable parameter. Ordinary plugins must not fake an entry with a cast, invented argument or unsupported API. Explicitly defer the exact producer/persistence integration pending target API verification; naming an undocumented successor is not required. Proposed retention/required-event checks are valid but actual execution is not required.

## Caps (score ceilings; judge returns each with triggered true/false)
- CAP [keep-stripping-marker] ceiling=10 Trigger only when the final recommendation affirmatively keeps the alpha.1 defense or continues deleting the marker on alpha.2. Negating that recommendation, quoting the old code for diagnosis, or removing the delete statement does not trigger it. Read the entire sentence and conclusion, including double negation and later contradictions.

## Candidate report(s)
#### FILE: S6-corridor-net-state/S6-corridor-net-state-report.md

# S6 · Corridor Net-State Judgment — Migration Report

**Task**: read-only judgment on the `ignorable` "defense code" in `fixture/src/events.ts`, target host **alpha.2** (`dsh-v0.1.2-alpha.2`).
**Mode**: A · inspect (read-only). **Fixture modified: NO** — verified byte-identical to the seal before and after analysis (SHA-256, see §6).
**Report path**: `agent-output/S6-corridor-net-state/S6-corridor-net-state-report.md`

---

## 0. Verdict at a glance

| # | Question | Answer |
|---|---|---|
| 1 | Fate of the `delete (event as any).ignorable` defense | **DELETE it** (and delete the stale alpha.1 comment with it). The alpha.1 rationale was a temporary host defect that alpha.2 reverted; the corridor net state at alpha.2 is "marker retained", so the defense is now actively harmful. |
| 2 | Correct producer semantics | `ignorable: true` is **envelope/persistence/transport retention semantics**, and it is an *omission-safety* marker: an unknown event type may be skipped on reload **only if** it already carries the marker; a missing marker means *required* → the log is refused. It is **not** a consumer-side filtering directive. It fits only informational events whose absence cannot change Session reconstruction. |
| 3 | What an ordinary plugin using `Session.append(...)` should do | **Do not persist third-party custom events through `Session.append(...)` on alpha.2 at all.** The public `Session.append(...)` signature has **no `ignorable` parameter** (only `type`, `data`, and `SurfaceIntent` for surface events), so a custom type live-appends fine and then throws `SessionFormatUnsupportedError` on the next cold load. Use a **plugin-owned sidecar/store keyed by Session id** instead. Registering an event name alone is not enough; do not fake a public entry via casts. |
| 4 | Evidence basis | Version cards `DSH-0.1.2-A1-02` → `DSH-0.1.2-A2-01`, the alpha.2 API ledger `API-05`, the corridor-rollup net-state rule, and the read-only `plan-migration.mjs` scan of the fixture. The in-source comment was treated as a claim to be falsified, not as evidence. |

---

## 1. Evidence base (all read-only, all inside the cell)

### 1.1 The fixture under review

`fixture/src/events.ts` (8 lines, verbatim structure — quoted only because it is the subject of the report):

- L2: builds `const event = { type: 'third-party/informational', payload }`
- L3–L5: a Chinese community comment asserting that alpha.1 removed `SessionEvent.ignorable` (citing `DSH-0.1.2-A1-02`), that "not deleting the marker will be rejected by readers", and that **"this block must be kept when migrating to alpha.2"**
- L6: `delete (event as any).ignorable`
- L7: `session.append(event)`

Note the shape of the code: the object literal on L2 **never sets** `ignorable`. The L6 `delete` is therefore a no-op on the object as written — which is itself the first red flag that the "defense" was written defensively against a *field that was not there*, not against a real runtime check. The defense's stated purpose ("delete the marker so readers accept it") can only be meaningful if some upstream step had set it; with the current literal, `delete` removes nothing.

### 1.2 The corridor (built by `from → to` metadata, not filename order)

Per `references/README.md` §"Version corridor index" and `references/pre-flight.md` §1, the corridor is read **in full** and folded into its net state before touching source.

| Order | Card set | from → to | Relevant cards |
|---:|---|---|---|
| 2 | `v0.1.2-alpha.1.md` | `dsh-v0.1.1-rc.2` → `dsh-v0.1.2-alpha.1` | **DSH-0.1.2-A1-02** · `SessionEvent.ignorable` temporarily removed |
| 3 | `v0.1.2-alpha.2.md` | `dsh-v0.1.2-alpha.1` → `dsh-v0.1.2-alpha.2` | **DSH-0.1.2-A2-01** · Restore `SessionEvent.ignorable` for third-party persisted events (explicitly the *revert* of A1-02) |

Target = `dsh-v0.1.2-alpha.2`. No gap: the `rc.2 → alpha.1 → alpha.2` path is fully carded (confirmed by `plan-migration.mjs`, which reported `"gaps": []`).

### 1.3 The two cards that decide the case

**`DSH-0.1.2-A1-02` (alpha.1, breaking, required-if-target-is-alpha.1)**

- Symptoms: alpha.1 could not preserve `ignorable: true` on third-party informational events; when first-party readers met unknown persisted events, they rejected the reload treating them as required events.
- Recipe (key points): do **not** turn unknown persisted events into a consumer whitelist; either stop writing that unknown persisted event or switch to public event vocabulary the target already knows; and if the final target is alpha.2 or later, read **DSH-0.1.2-A2-01** first to compute the corridor net state — *do not delete the producer marker and then restore it*.

**`DSH-0.1.2-A2-01` (alpha.2, fix, required-if-hit)**

- Symptoms (key points): alpha.1 could not retain the marker on external informational events; with alpha.2 restoring it, **old adapters that keep dropping the marker make first-party readers reject Sessions containing unknown events** — i.e. the stale defense is itself the alpha.2 hazard.
- Recipe highlights: producers write `ignorable: true` **only** for informational events whose semantics an old reader can omit without affecting reconstruction; the marker is **not** a consumer-side filtering directive; events remain in loaded events after reload. What alpha.2 restores is the **retention semantics of envelope/persistence/reload/transport**; **"the public live `Session.append(...)` still has no `ignorable` parameter"**, so ordinary plugins with only this API should mark the producer seam a **capability gap** rather than faking a public entry via cast. JSONL, SQLite, API transports and the generated catalog must preserve the field as-is; **unknown events without the marker remain required-on-read**. The SQLite provider accepts only schema 20, does not auto-migrate schema 19, and rejects other schemas (back up/export or rebuild first).
- Verification: unknown events **with** `ignorable: true` still exist in loaded events after reload and old readers can omit their semantics; unknown **required** events are rejected; a plain `Session.append` should not be documented as supporting the field; schema 19 is rejected, a rebuilt schema 20 boots.

### 1.4 The API ledger `API-05` (`references/api-migration-0.1.2-alpha.2.md`)

- Key point: alpha.2 restores `ignorable?: true` on the event envelope, **but the public `Session.append()` still accepts only `type`, `data`, and `SurfaceIntent` (surface events only) and will not write `ignorable` into the event**. Consequence: an out-of-repo custom type live-appends and persists fine, then throws `SessionFormatUnsupportedError` on the next cold load, refusing the whole Session — **a silent write / loud read that one live smoke cannot catch**.
- The envelope semantics remain in force: a reader may continue past an unknown type **only if** that event already carries `ignorable: true`; **a missing field means required**.
- Best practice (5 points): (1) on alpha.2, out-of-repo plugins should **not** persist state with a custom `SessionEventMap` + `Session.append()`; **use a plugin-owned sidecar/store keyed by Session id**; (2) when reusing an existing known event, reuse only its real, identical semantics; (3) `ignorable: true` fits only auxiliary information whose absence does not change core/durable Session semantics; (4) persistence/transport owners must preserve existing markers end-to-end, and unknown events without a marker keep failing closed; (5) **re-evaluate third-party persistent events only after upstream ships a supported `append(..., { ignorable: true })`** or another formal mechanism — *"Registering an event name alone is not enough; do not write up the field restoration as if that capability had shipped."* It also states the surface *"cannot be bypassed with casts, thawing objects, or hand-editing JSONL."*
- One-page conclusion row (`SessionEvent`): *"Seeing that alpha.2 restored `ignorable`, directly `Session.append()` custom events → Writes succeed live, but the whole session is refused on cold load because the events have no marker → alpha.2 only restores the envelope field; the public `Session.append()` cannot set it yet, so out-of-repo plugins switch to their own sidecar/store."*

### 1.5 The corridor net-state rule (this is the crux)

`references/README.md` §"Version corridor index" states the rule: when the target spans multiple versions, read the full corridor and compute the final net state before touching source — **if a field is removed in alpha.1 and restored in alpha.2, do not delete and re-add it**.

`references/rollup-0.1.2.md` §"Card index (by touchpoint)" (touchpoint #2) repeats the rule and names `ignorable` as the canonical example: a field may be removed in an intermediate version and restored in a later one (removed by **DSH-0.1.2-A1-02**, restored by **DSH-0.1.2-A2-01**). Fold the corridor into its net state before modifying source — do not delete once for alpha.1 and then add it back for alpha.2; **if the final target restores that semantics, defensive code in old-version adaptations should be removed rather than kept.**

### 1.6 Machine check — read-only `plan-migration.mjs`

Run from the cell-local skill copy (`node skills/plugin-upgrade/scripts/plan-migration.mjs`, read-only by design; it never writes the target repo):

- `--from dsh-v0.1.2-alpha.1 --to dsh-v0.1.2-alpha.2`: corridor resolved, **touchpoint #2 detected — 1 hit at `src/events.ts:3`** (pattern 1: `SessionEvent|session/event|ctx.on(|subscribe(`); all other six classes: 0 hits. Applicable card: **DSH-0.1.2-A2-01** (fix / required-if-hit). Manual review: DSH-0.1.2-A2-03 (packaging — not hit here). Exit 0.
- `--from dsh-v0.1.1-rc.2 --to dsh-v0.1.2-alpha.2 --format json`: corridor = `[v0.1.2-alpha.1.md, v0.1.2-alpha.2.md]`, `"gaps": []`; applicable cards include **A1-02 (action: required-if-target-is-alpha.1)** and **A2-01 (required-if-hit)** — i.e. the planner itself surfaces the A1-02 action as *conditional on the target being alpha.1*, which is not the case here.

Touchpoint checkup (per `pre-flight.md` §Summary template):

| Touchpoint | Hit | File/line | Applicable card | Confidence note |
|---|---:|---|---|---|
| #1 patch | no | — | — | fixture has no patch/patchedDependencies |
| #2 events | **yes** | `src/events.ts:3` (and the `Session.append` at :7) | A1-02 → A2-01 | Producer role; the only touchpoint class hit |
| #3 services/Remote | no | — | — | no `ctx.get`/`ctx.remote`/`@Remote`/internal imports |
| #4 filesystem | no | — | — | no DSH_HOME/readFile/writeFile |
| #5 UI/commands/tools | no | — | — | no registerCommand/ctx.tools |
| #6 custom channel | no | — | — | no server/WS/router |
| #7 subprocess/output | no | — | — | no child_process/headless |

No-hit notes: scan scope = the whole fixture (2 code/config files scanned; `README.md` is Markdown and is excluded by the planner by design, and it was read separately by hand). Dependency/configuration checked separately: `package.json` declares **no** `@deepseek-ai/*` dependency, **no** `peerDependencies`, **no** `dsh.client.inject`, and no lockfile — i.e. the fixture is a minimal, dependency-free test surface, so the type/packaging classes have nothing to hit.
Must verify (not performed here, see §5): real cold-load behaviour on an alpha.2 host.

### 1.7 Corroboration from later corridor edges (not the deciding evidence, but consistent)

- `DSH-0.1.5-A2-05` (alpha.5→0.1.5-alpha.2): first-party events `deliverables/presented` and `subagent/catalog` join `KNOWN_SESSION_EVENT_TYPES` **without** an `ignorable` marker, and the storage contract refuses unknown non-ignorable events (log "likely written by a newer harness"). The card states plainly that because `Session.append()` has no `ignorable` channel, a producer cannot mark these events → the missing public write channel is a durable property of the API, not a one-off alpha.2 quirk.
- `DSH-0.1.6-alpha.1`: the new `image/offload` durable event likewise carries no `ignorable: true`, so builds that do not know the type refuse the log.
- `DSH-0.1.7-J1-05` (jump card): "unknown-ignorable" session events remain a live category of stored data in the V4 format line.

These later cards are **outside** the alpha.2 target corridor and are cited only to show the semantics did not flip back. They do not change the alpha.2 verdict.

---

## 2. Requirement 1 — Fate of the defense code: **DELETE**

### 2.1 The full history of the semantics across the corridor

| Host version | `SessionEvent.ignorable` on third-party persisted events | What a producer had to do |
|---|---|---|
| `0.1.1-rc.2` (pre-corridor) | present and honoured | write `ignorable: true` for informational events (the normal case) |
| `0.1.2-alpha.1` | **temporarily removed** — alpha.1 cannot retain the marker; unknown persisted events are treated as *required* and the reload is rejected | card A1-02: stop writing that unknown persisted event, or switch to public event vocabulary alpha.1 already knows. **Do not** widen a consumer whitelist. |
| `0.1.2-alpha.2` (**target**) | **restored** — the retention semantics of envelope / persistence / reload / transport are back (A2-01 is explicitly the revert of A1-02) | write `ignorable: true` for informational events whose absence cannot change reconstruction; and, because the public write surface does not exist, **do not persist third-party custom events through `Session.append(...)` at all** — use a sidecar/store |

### 2.2 Why the defense must be deleted, not kept

1. **The corridor net state at alpha.2 is "marker retained".** A1-02 was explicitly a *temporary* removal; A2-01 explicitly *reverts* it ("revert of DSH-0.1.2-A1-02"). The skill's net-state rule therefore applies: *"if the final target restores that semantics, defensive code in old-version adaptations should be removed rather than kept."*
2. **Keeping it is not neutral — it is a defect on alpha.2.** A2-01's symptom line says it outright: *"old adapters that keep dropping the marker will make first-party readers reject Sessions containing unknown events."* A producer that strips the marker produces an event that alpha.2 readers classify as **required**; the session then fails closed on reload. Keeping the defense converts a "marker absent" event into a hard reload refusal.
3. **The comment is self-refuting and factually wrong on the target.** It says "不删 marker 会被 reader 拒绝" ("without deleting the marker the reader rejects it") — but on alpha.2 it is the **opposite**: *deleting* the marker is what gets the session rejected. The comment also says the block "迁移到 alpha.2 时这段要继续保留" ("must be kept when migrating to alpha.2") — this is the trap; A1-02's own recipe says the exact opposite: *"do not delete the producer marker and then restore it."* Evidence, not the comment, decides: **the comment is stale, inverted, and must go with the code.**
4. **The defense is a no-op even on its own terms.** As written, the object literal on L2 never sets `ignorable`, so `delete (event as any).ignorable` removes nothing. It protects against a condition that the code never creates, while making the *source of truth for the event's omission-safety* ambiguous. Keeping a no-op that asserts a false invariant is worse than removing it.
5. **The correct fix is not "stop deleting" but "stop persisting through `Session.append`".** Simply removing L6 (and the L3–L5 comment) leaves the *real* alpha.2 problem in place: the custom `third-party/informational` type would still be appended without a marker, because the public `Session.append(...)` cannot write one → same cold-load refusal, now by the other route. See §3.

### 2.3 The concrete edit (described, not applied — fixture is read-only here)

In `fixture/src/events.ts`:

- **Delete** L6 (`delete (event as any).ignorable`) — the defense.
- **Delete** L3–L5 (the stale alpha.1 comment). It asserts a false invariant and would mislead the next maintainer. Replacement comment should record the *target* semantics: alpha.2 restores the marker (A2-01), the public `Session.append(...)` has no `ignorable` parameter, so custom persisted events are a known capability gap → use a sidecar/store.
- **Then** apply §3: the `session.append(event)` call itself must go (migrated to a plugin-owned sidecar keyed by Session id) for an out-of-repo plugin on alpha.2. Keep the function only if the event is demonstrably *not* persisted (e.g. it is a live-only surface event) — otherwise the custom type poisons the session log.

### 2.4 What is **not** claimed

- I did **not** verify alpha.2 host source directly (the tag source is not in the cell and network access is out of scope). The alpha.2 semantics above are taken from the skill's curated cards and API ledger, which cite pinned primary sources (alpha.2 `packages/core/session/src/types.ts`, `packages/core/session/src/index.ts`, `packages/session/session-persistence/src/coordinator.ts`, and the alpha.2 decision note *“retain ignorable external session events”*). Treat the *card-level* statements as the authoritative corpus for this task; the underlying upstream files are **unconfirmed** from this container.
- I did **not** execute the fixture (it is a private test surface, and the task forbids building/running a reproduction environment). No runtime observation of the reload refusal is claimed.
- Whether the plugin's *own* `third-party/informational` type is semantically "informational" (i.e. whether `ignorable: true` would even be the right marker) is **unconfirmed** — the fixture carries no consumer of that payload. Per §3, the recommended action (sidecar) does not depend on that answer.

---

## 3. Requirement 2 — Correct producer semantics, and what an ordinary plugin should do

### 3.1 What `ignorable: true` means (producer side)

- **It is an envelope/retention marker**, restored in alpha.2 across the envelope, persistence, reload, and transport layers (A2-01). JSONL, SQLite, API transports, and the generated catalog must **preserve the field as-is**.
- **It is an omission-safety marker, not a filter switch.** Semantics: when a reader meets an **unknown** event type, it may continue (skip the event) **only if** that event already carries `ignorable: true`. A **missing** marker means the event is **required** → the reader refuses to interpret the log (fail-closed). This is exactly the property the alpha.1 comment gets backwards.
- **It is not a consumer-side filtering directive**, and it is **not** a "the reader will delete it" hint: after reload, marked events **remain in the loaded events**; the marker only licenses an old/other reader to *omit their semantics* when it cannot interpret the type.
- **Who may use it**: only *informational / auxiliary* events whose absence cannot change Session reconstruction or core/durable semantics. A reader that *has* the plugin may use the event; a reader that does not must be able to skip it safely. Core/model-visible events, and anything that changes turn/message derivation, must **not** be marked ignorable.
- **Who must not use it**: producers must not turn unknown persisted events into a consumer whitelist (A1-02) — the fail-closed behaviour for unknown *required* events is the safety property, and it must stay.

### 3.2 What an ordinary plugin going through `Session.append(...)` should do on alpha.2

**Short answer: it should not persist third-party custom events through `Session.append(...)` on alpha.2 — it should use a plugin-owned sidecar/store keyed by Session id.**

Longer, with the reason:

1. **The public API surface has no `ignorable` parameter.** alpha.2's `Session.append()` accepts only `type`, `data`, and `SurfaceIntent` (and `SurfaceIntent` applies to surface events only). It will **not** write `ignorable` into the event. This is the hint in the task brief, and it is the reason the whole problem exists.
2. **Therefore the failure is a silent write / a loud read.** A custom type live-appends and persists fine; the *next cold load* of that session throws `SessionFormatUnsupportedError` and refuses to restore the **whole** Session. A live smoke test cannot catch it — you must do a real persist → process restart / cold-load test.
3. **The gap cannot be patched from outside.** The envelope/retention semantics cannot be obtained via casts, thawing objects, or hand-editing JSONL. A `declare module '@deepseek-ai/dsh-session/types'` augmentation plus a custom `SessionEventMap` entry is a **type-level** registration only; it does **not** give the plugin a way to write the marker. *"Registering an event name alone is not enough."*
4. **Concrete recommendation for this fixture's function (`produceExternalEvent`):**
   - Replace the persisted `Session.append(event)` with a **plugin-owned sidecar store keyed by Session id** (the event payload is auxiliary plugin state; it is exactly the "informational" case, so a sidecar loses nothing semantically).
   - If the plugin truly needs a durable Session event, then on alpha.2 there is **no supported public producer path** → this is a **capability gap / pending review**, not something to fake. Re-evaluate only when upstream ships a supported `append(..., { ignorable: true })` or another formal mechanism that persists the omission-safety marker and decides compatibility independently of the current composition.
   - If instead the plugin **reuses an existing known event type**, reuse only that type's **real, identical** semantics — never disguise plugin state as a model-visible or core event, and never hand-write core event types.
5. **Not in scope for this fixture but flagged for a real deployment (from A2-01):** the SQLite session-persistence provider accepts only **schema 20**, does **not** auto-migrate schema 19, and rejects other schemas. Before upgrading, back up/export or rebuild per the provider documentation. (Separately, `DSH-0.1.2-A3-02` shows the optional SQLite session-persistence provider is removed at 0.1.2-alpha.3 and JSONL is the sole first-party `ctx.sessionPersistence` implementation — relevant if the target ever moves past alpha.2.)

### 3.3 The one-line rule to put in the plugin's own notes

> On alpha.2, `ignorable: true` is restored at the envelope level but is **not** writable through the public `Session.append(...)`; therefore a third-party plugin must not persist custom events into the Session log on alpha.2 — keep plugin state in a Session-keyed sidecar, and treat the producer seam as a capability gap until a supported append/registration path ships.

---

## 4. Requirement 3 — Evidence, not the comment

| Claim (source of the claim) | Status on alpha.2 | Evidence used |
|---|---|---|
| "alpha.1 removed `SessionEvent.ignorable`" (fixture comment, L3) | **True, and confirmed** | card `DSH-0.1.2-A1-02` (breaking, required-if-target-is-alpha.1) |
| "Without deleting the marker the reader will reject it" (fixture comment, L3–L4) | **FALSE / inverted on alpha.2** | card `DSH-0.1.2-A2-01` symptom line: adapters that keep dropping the marker make readers **reject** the session; ledger `API-05`: unknown events **without** the marker are required-on-read |
| "This block must be kept when migrating to alpha.2" (fixture comment, L4–L5) | **FALSE** | A1-02 recipe: *"do not delete the producer marker and then restore it"*; rollup net-state rule: *"if the final target restores that semantics, defensive code in old-version adaptations should be removed rather than kept"* |
| "alpha.2 restored the retention semantics" | **Confirmed** | `DSH-0.1.2-A2-01` is explicitly the *revert of* `DSH-0.1.2-A1-02` |
| "The public `Session.append(...)` has no `ignorable` parameter" | **Confirmed** (from the card/ledger corpus) | A2-01 migration recipe; ledger `API-05`; ledger one-page conclusion row `SessionEvent` |
| "A custom appended type fails the *next* cold load with `SessionFormatUnsupportedError`" | **Confirmed (card/ledger); not reproduced in this container** | ledger `API-05` + its source list (alpha.2 `session-persistence/src/coordinator.ts` cold-load guard) |
| The plugin's own `third-party/informational` payload is safe to mark ignorable | **Unconfirmed** — no consumer of the payload exists in the fixture | fixture content only (3 files, no consumer) |
| alpha.2 upstream source files themselves (types/append implementation) | **Unconfirmed in this container** — pinned URLs only; the tags are not present in the cell and network access is out of scope | card source lists |
| Runtime behaviour of a real alpha.2 host (reload acceptance/refusal) | **Unconfirmed** — no host execution permitted or possible here (the installed host is a different version and is out of scope by instruction) | — |
| Later-corridor behaviour (0.1.5-alpha.2, 0.1.6-alpha.1, 0.1.7 jump) | **Confirmed from cards**, but **outside the alpha.2 target corridor**; cited only as consistency evidence, not as the deciding basis | `DSH-0.1.5-A2-05`, `DSH-0.1.6-alpha.1`, `DSH-0.1.7-J1-05` |

Nothing in this report rests on the fixture's own comment; the comment is treated as a hypothesis that the cards falsify.

---

## 5. Skipped, pending, and residual risk

**Skipped (with evidence)**
- Touchpoints #1, #3, #4, #5, #6, #7 — planner reported 0 hits across the whole fixture; `package.json` has no DSH dependency/peer/inject/lockfile, so dependency, composition, UI, channel, and subprocess classes have nothing to hit. Not applicable.
- `DSH-0.1.2-A2-03` (peer trimming), `A1-12`/`A1-23`/`A1-24` — packaging/privacy/informational cards with no touchpoint overlap in this fixture; flagged by the planner as manual review only, no action here.
- `A1-06`/`A1-07`/`A1-14` — surfaced by the `rc.2 → alpha.2` planner run only because they share touchpoint #2 with the event hit; their content (PTC rename, WebFetch default, log upload) is unrelated to `ignorable` and is not hit by this fixture.

**Pending / residual risk**
- **Producer capability gap (blocking for the *real* fix).** Even after deleting the defense, alpha.2 offers no public way for an out-of-repo plugin to write a marked third-party event. Until upstream ships a supported append/registration path, the only safe answer for this plugin is the sidecar/store. Status: **pending upstream capability**, not "pending review of a local decision".
- **SQLite persistence schema.** If a real deployment persists sessions through the SQLite provider, schema 19 is rejected by alpha.2 (schema 20 only, no auto-migration) → back up/export or rebuild before upgrade. Not applicable to this fixture (no persistence provider wired).
- **Consumer-side behaviour is out of this task's reach.** For the *host* (not this plugin), the marker must be preserved end-to-end by persistence/transport owners, and unknown events without a marker must keep failing closed.
- **Validation not performed** (fixture is test-only, private, and read-only; no build/run/install permitted): a real persist → cold-load test, a typecheck against the alpha.2 cohort, and a real alpha.2 profile mount. Recommended once a real plugin (not this fixture) carries the same pattern.

---

## 6. Rollback / integrity statement

- **Fixture unchanged.** SHA-256 of `fixture/README.md`, `fixture/package.json`, `fixture/src/events.ts` recomputed after all analysis and compared with both `fixture-seal.pre.json` and `fixture-seal.source.json`: **all three match exactly** (`293a9d4b…`, `0f94b8a5…`, `e0d7190a…`). No file under `fixture/` was created, modified, moved, or deleted.
- **Only write performed**: this report, under `agent-output/S6-corridor-net-state/`.
- **No** skill, evaluator, or reference material was modified; no network access; no package install; no host command was executed (the installed host runs a different version and is out of scope).
- **Rollback**: n/a for the fixture (nothing to roll back). If a future implementation lands the §2.3 edit, the rollback is a single-file revert of `src/events.ts` plus a plugin SemVer bump decision made separately from the DSH host version.

---

## 7. Final summary table

| Hit location | Old interface | Typical symptom | Target interface | Required / conditional change | Verification status |
|---|---|---|---|---|---|
| `fixture/src/events.ts:6` | `delete (event as any).ignorable` (alpha.1 defense) | On alpha.2 the stripped marker makes the event **required**; the session is refused on the next cold load | none — the defense is **removed**; alpha.2 retains the marker | **Required** (delete) | Verified by card/ledger evidence + corridor net-state rule; runtime reproduction **not performed** |
| `fixture/src/events.ts:3-5` | stale alpha.1 comment asserting "keep this block" | misleads every future maintainer into preserving a defect | comment replaced with the alpha.2 semantics | **Required** (rewrite) | Verified |
| `fixture/src/events.ts:7` | `session.append(event)` for a custom persisted type | live write succeeds; next cold load throws `SessionFormatUnsupportedError` and refuses the whole Session | plugin-owned sidecar/store keyed by Session id (no public `ignorable` write channel exists) | **Required** for an out-of-repo plugin on alpha.2 | Verified from ledger `API-05` + A2-01; runtime reproduction **not performed** |
| `fixture/src/events.ts:2` | `{ type: 'third-party/informational', payload }` | — | if a Session event is ever kept: `ignorable: true` only for auxiliary, omission-safe semantics | **Conditional** (blocked on the upstream producer capability) | Unconfirmed whether this payload qualifies as omission-safe |

**One-sentence answer**: *Delete the defense and its comment — alpha.2 restores `ignorable` (A1-02 → A2-01 is a remove-then-restore, and the corridor net state says the net result is "retained"), and keeping the deletion now causes exactly the reader rejection the comment wrongly attributes to the other branch; but the correct alpha.2 producer answer is bigger than that — the public `Session.append(...)` has no `ignorable` parameter, so an ordinary plugin must not persist third-party custom events into the Session log at all and should move plugin state to a Session-keyed sidecar/store.*


## Required output (JSON only)
{"decisions":[{"id":"<criterion-id>","verdict":"pass|partial|fail|missing","reason":"short"}],"caps":[{"id":"<cap-id>","triggered":false,"reason":"short"}]}
Every criterion and cap exactly once. pass=full points, partial=half, fail/missing=0; a triggered cap caps the total.