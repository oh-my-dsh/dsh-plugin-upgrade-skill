# JUDGE BRIEF · skill.S6-corridor-net-state

## Criteria (sealed rubric)
- [corridor-net-state] (25pt) Explain alpha.1 removal followed by alpha.2 restoration of SessionEvent.ignorable retention, applying the final alpha.2 state to produceExternalEvent in src/events.ts. Correct version history is required; bare A1-02/A2-01 card names earn no credit, and equivalent history without card IDs is acceptable.
- [remove-marker-stripping] (25pt) Locate delete (event as any).ignorable and reject the comment prescribing continued stripping on alpha.2. Recommend removing that defense and correcting its obsolete rationale. Distinguish removing the stripping code from removing the marker itself. It is valid to note that the shown literal currently has no marker, so the delete is a no-op, while still rejecting the intended stripping policy.
- [informational-producer] (25pt) Explain that only informational events whose semantics old readers may omit without breaking reconstruction can carry ignorable:true; required events must not be made ignorable. Retention across persistence/reload is not a reader-side filtering instruction: marked events remain in the loaded log. Apply this to the third-party/informational producer while respecting the live append limitation.
- [public-append-gap] (25pt) Identify the public live Session.append capability gap: it has no supported ignorable parameter. Ordinary plugins must not fake an entry with a cast, invented argument or unsupported API. Explicitly defer the exact producer/persistence integration pending target API verification; naming an undocumented successor is not required. Proposed retention/required-event checks are valid but actual execution is not required.

## Caps (score ceilings; judge returns each with triggered true/false)
- CAP [keep-stripping-marker] ceiling=10 Trigger only when the final recommendation affirmatively keeps the alpha.1 defense or continues deleting the marker on alpha.2. Negating that recommendation, quoting the old code for diagnosis, or removing the delete statement does not trigger it. Read the entire sentence and conclusion, including double negation and later contradictions.

## Candidate report(s)
#### FILE: S6-corridor-net-state/migration-report.md

# S6 · Corridor Net-State Judgment — `SessionEvent.ignorable` Defense Code (target host: dsh-v0.1.2-alpha.2)

**Mode**: A/C read-only inspection + corridor net-state analysis (plugin-upgrade skill). No file under `/app/fixture/` was modified; no build, install, execution, or git operation was performed.

## 1. Subject identity

- Fixture: `dsh-events-bench@0.1.0` (`"private": true`, ESM), single source file `fixture/src/events.ts`.
- `package.json` declares **no DSH dependency cohort at all** → the declared/resolved DSH peer versions are **unconfirmed** from the fixture itself; the target host is given by the brief as **alpha.2**.
- The code under review (`src/events.ts`, lines 1–8): `produceExternalEvent()` builds `{ type: 'third-party/informational', payload }`, then runs the "defense" `delete (event as any).ignorable` before `session.append(event)`. The comment (lines 3–5) claims alpha.1 removed `SessionEvent.ignorable` (citing DSH-0.1.2-A1-02), that "without deleting the marker readers will reject it", and that **this must be kept when migrating to alpha.2**.

## 2. Version corridor and the full history of this semantics

Corridor edges are taken from the directed `from → to` metadata in `references/README.md` (never filename order):

| Edge | Card file | Relevant cards |
|---|---|---|
| `dsh-v0.1.1-rc.2 → dsh-v0.1.2-alpha.1` | v0.1.2-alpha.1.md | **DSH-0.1.2-A1-02** (breaking) |
| `dsh-v0.1.2-alpha.1 → dsh-v0.1.2-alpha.2` (target) | v0.1.2-alpha.2.md | **DSH-0.1.2-A2-01** (fix) |
| rc.2→alpha.2 API ledger | api-migration-0.1.2-alpha.2.md | **API-05** |

History of `SessionEvent.ignorable` across the corridor:

1. **Pre-alpha.1 (≤ 0.1.1-rc.2)** — the field existed with retention semantics (A1-02 calls its removal "temporary"; A2-01 is its revert). The exact version that first introduced it is **not carded** in the available references → **unconfirmed**.
2. **alpha.1 — removed** (DSH-0.1.2-A1-02, `required-if-target-is-alpha.1`): alpha.1 cannot preserve `ignorable: true` on third-party informational events; first-party readers meeting unknown persisted events treat them as required and **reject the reload** (fail closed). Recipe: only if the target is *exactly* alpha.1, stop writing such events or use known vocabulary — and explicitly: *"If the final target is alpha.2 or later, first read DSH-0.1.2-A2-01 to compute the corridor net state; do not delete the producer marker and then restore it."*
3. **alpha.2 — restored** (DSH-0.1.2-A2-01, `required-if-hit`, revert of A1-02): alpha.2 restores the **retention semantics** of envelope/persistence/reload/transport (JSONL, SQLite, API transports, generated catalog must preserve the field as-is). The card's *Symptoms* line names this exact fixture pattern as the alpha.2 hazard: *"old adapters that keep dropping the marker will make first-party readers reject Sessions containing unknown events."*
4. **Net-state hygiene rule** (rollup-0.1.2.md, whose canonical example is this very field): fold the corridor into its net state before modifying source — *"if the final target restores that semantics, defensive code in old-version adaptations should be **removed** rather than kept."* SKILL.md Mode C step 2 says the same (do not delete-and-re-add across an intermediate removal).

**Corridor net state at the target (alpha.2): the `ignorable` marker and its retention semantics are IN FORCE. The alpha.1 removal is an intermediate state that no longer exists at the target.**

## 3. Requirement 1 — Fate of the defense code: **DELETE**

Delete line 6 (`delete (event as any).ignorable`) together with the misleading comment (lines 3–5).

Reasoning, by evidence not by comment:

- The comment's claim "must be kept when migrating to alpha.2" is **contradicted by the primary cards**: A2-01 restores retention at the target and lists marker-dropping adapters as the failure mode; the rollup rule says such old-version defense code should be removed when the final target restores the semantics. Deciding by the comment would keep an alpha.1-only adaptation alive on a host where it is wrong.
- A1-02's own recipe defers to the net state when the final target is alpha.2+, i.e. the alpha.1 workaround is explicitly *not* meant to survive the corridor.
- Practical note on this specific snippet: as written, the `delete` on a freshly built literal that never sets `ignorable` is a **runtime no-op today**; its harm is latent — it codifies the marker-dropping pattern (any future path where the event does carry the marker, e.g. payload/envelope spread, would be silently stripped, producing exactly the A2-01 cold-load rejection), and the comment actively misinstructs maintainers to preserve that pattern on alpha.2.
- Evidence grade: card-based (A1-02, A2-01, API-05, rollup rule) and consistent with the fixture README's own statement. Card source URLs (alpha.2 release notes / architecture note / core session sources on GitHub) were **not fetched** (out of network scope) — cited as card sources only; direct upstream re-verification: **unconfirmed**.

## 4. Requirement 2 — Correct producer semantics on alpha.2, and what an ordinary `Session.append(...)` plugin should do

**Envelope/reader semantics restored by alpha.2 (A2-01, API-05):**

- `ignorable: true` may be written **only for informational events whose semantics an old reader can omit without affecting Session reconstruction**. It is *not* a consumer-side filtering directive; marked events still remain in loaded events after reload.
- Unknown persisted events **without** the marker remain **required-on-read**: readers must fail closed (cold load refuses the whole Session — `SessionFormatUnsupportedError` per API-05).
- Owners of persistence/reload/transport (JSONL, SQLite, API transports, catalog) must preserve the marker end-to-end; they must never strip it.

**The public write surface (the brief's hint — confirmed by the ledger):**

- What alpha.2 restored is the *envelope field and retention plumbing*; the public live **`Session.append(...)` still has no `ignorable` parameter** — it accepts only `type`, `data`, and `SurfaceIntent` (surface events only) and will not write the marker (A2-01 recipe; API-05 "How it breaks").
- Consequence for an out-of-repo plugin appending an unknown custom type (exactly this fixture's `third-party/informational`): the live append **succeeds and persists, yet the next cold load rejects the entire Session** — a "silent write / loud read" that a live smoke test cannot catch (API-05).
- Faking the marker is forbidden: it **cannot be bypassed with casts, thawing frozen objects, or hand-editing JSONL** (API-05). A2-01 likewise: ordinary plugins should mark the producer seam as a **capability gap** rather than fake a public entry via cast.

**Therefore an ordinary plugin going through `Session.append(...)` on alpha.2 should:**

1. **Not persist plugin state via custom `SessionEventMap` augmentation + `Session.append()`** — treat third-party persistent-event production as a capability gap (A2-01 / API-05 best practice #1);
2. Use a **plugin-owned sidecar/store keyed by Session id** for anything it needs to survive reloads;
3. If reusing an existing known event type, reuse only its real, identical semantics (never disguise plugin state as a model-visible/core event);
4. **Re-evaluate only after upstream ships a supported mechanism** (e.g. a formal `append(..., { ignorable: true })`) — registering an event name alone is not enough, and the field restoration must not be written up as if that producer capability had shipped (API-05 #5);
5. If such a custom append already exists, run a real **persist → restart → cold-load** test (not live-append-only) and treat a cold-load refusal as a migration blocker: remove the persistence scheme rather than swallow the error.

**Applied to this fixture:** deleting the defense is necessary but **not sufficient** for alpha.2. `produceExternalEvent` as a whole is the API-05 "dangerous legacy pattern": on alpha.2 it writes an unknown type through a public append that cannot carry the marker, so the Session it touches will be refused on the next cold load. The migrated plugin should **remove this producer path** (or reroute it to a sidecar store / an already-known event vocabulary with identical semantics), and — if it is kept in any form pending upstream support — mark it explicitly as a capability gap. Two shape observations, flagged but not decisive: the call form `session.append(eventObject)` with a `payload` field does not match the documented public form `append(type, data)` (API-05 example; `session: any` hides it at compile time) — runtime behavior of the single-object form is **unconfirmed** (no execution allowed); and the discriminator field being `type` (not `kind`) is consistent with DSH-0.1.1-R1-06.

## 5. Adjacent alpha.2 facts worth carrying into the migration plan

- If the plugin (or its host profile) touches the SQLite Session-persistence provider: it accepts **only schema 20**, rejects schema 19 with no auto-migration — back up/export or rebuild before upgrading (A2-01 recipe).
- Verification expectations per A2-01: marked unknown events still present after reload and omittable by old readers; unknown unmarked events rejected; plain `Session.append` not documented as supporting the field.

## 6. Requirement 3 — Unconfirmed items (explicit)

1. The version in which `SessionEvent.ignorable` was first introduced (pre-alpha.1) — not carded in the available references.
2. Runtime behavior of the fixture's single-object `session.append(event)` call and of the `payload` field name on alpha.2 — ledger-documented public surface only; nothing was executed (read-only brief).
3. The fixture's actual DSH dependency cohort — `package.json` declares none.
4. Direct upstream source verification (GitHub URLs listed as card sources) — not fetched; network access outside this task's scope.
5. Post-alpha.2 evolution of this semantics (later corridor edges) — out of scope for a migration whose target host is alpha.2; not assessed here.

## 7. Bottom line

- **Defense code: DELETE** (both the `delete` statement and the comment). The corridor net state at alpha.2 has `ignorable` retention restored (DSH-0.1.2-A1-02 → DSH-0.1.2-A2-01 remove-then-restore); keeping an alpha.1 marker-dropping adaptation on alpha.2 is precisely the failure mode A2-01 warns about, and the comment's "keep it for alpha.2" claim is refuted by the cards.
- **Producer semantics: the public `Session.append(...)` on alpha.2 cannot set `ignorable` at all**; an ordinary plugin must not append unknown persistent event types (silent write / loud cold-load read), must not fake the marker via casts or JSONL edits, and should use a session-keyed sidecar store while marking the producer seam as a capability gap until upstream ships a supported mechanism.
- All conclusions are card-evidenced (DSH-0.1.2-A1-02, DSH-0.1.2-A2-01, API-05, rollup-0.1.2 net-state rule, DSH-0.1.1-R1-06); unverifiable points are listed in §6.

**Boundary discipline**: fixture untouched (zero writes); report and temp files confined to `/app/agent-output/S6-corridor-net-state/`; no git, no network, no installs, no execution of fixture code.


## Required output (JSON only)
{"decisions":[{"id":"<criterion-id>","verdict":"pass|partial|fail|missing","reason":"short"}],"caps":[{"id":"<cap-id>","triggered":false,"reason":"short"}]}
Every criterion and cap exactly once. pass=full points, partial=half, fail/missing=0; a triggered cap caps the total.