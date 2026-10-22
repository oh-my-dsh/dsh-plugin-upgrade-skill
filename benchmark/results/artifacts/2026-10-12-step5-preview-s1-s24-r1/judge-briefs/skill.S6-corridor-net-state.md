# JUDGE BRIEF · skill.S6-corridor-net-state

## Criteria (sealed rubric)
- [corridor-net-state] (25pt) Explain alpha.1 removal followed by alpha.2 restoration of SessionEvent.ignorable retention, applying the final alpha.2 state to produceExternalEvent in src/events.ts. Correct version history is required; bare A1-02/A2-01 card names earn no credit, and equivalent history without card IDs is acceptable.
- [remove-marker-stripping] (25pt) Locate delete (event as any).ignorable and reject the comment prescribing continued stripping on alpha.2. Recommend removing that defense and correcting its obsolete rationale. Distinguish removing the stripping code from removing the marker itself. It is valid to note that the shown literal currently has no marker, so the delete is a no-op, while still rejecting the intended stripping policy.
- [informational-producer] (25pt) Explain that only informational events whose semantics old readers may omit without breaking reconstruction can carry ignorable:true; required events must not be made ignorable. Retention across persistence/reload is not a reader-side filtering instruction: marked events remain in the loaded log. Apply this to the third-party/informational producer while respecting the live append limitation.
- [public-append-gap] (25pt) Identify the public live Session.append capability gap: it has no supported ignorable parameter. Ordinary plugins must not fake an entry with a cast, invented argument or unsupported API. Explicitly defer the exact producer/persistence integration pending target API verification; naming an undocumented successor is not required. Proposed retention/required-event checks are valid but actual execution is not required.

## Caps (score ceilings; judge returns each with triggered true/false)
- CAP [keep-stripping-marker] ceiling=10 Trigger only when the final recommendation affirmatively keeps the alpha.1 defense or continues deleting the marker on alpha.2. Negating that recommendation, quoting the old code for diagnosis, or removing the delete statement does not trigger it. Read the entire sentence and conclusion, including double negation and later contradictions.

## Candidate report(s)
#### FILE: S6-corridor-net-state/S6-corridor-net-state-migration-report.md

# S6 · Corridor Net-State Judgment — Migration Report (Read-Only)

- **Target corridor**: `dsh-v0.1.2-alpha.1` → `dsh-v0.1.2-alpha.2` (host target = alpha.2)
- **Plugin under review**: `fixture/` (package `dsh-events-bench` 0.1.0, `"private": true`, test material)
- **Mode**: read-only inspection/report only. No file under `fixture/` was modified; nothing was executed; no reproduction environment was built.
- **Primary evidence**: skill version cards [DSH-0.1.2-A1-02](../../../skills/plugin-upgrade/references/v0.1.2-alpha.1.md) and [DSH-0.1.2-A2-01](../../../skills/plugin-upgrade/references/v0.1.2-alpha.2.md), the alpha.2 API ledger entry [API-05](../../../skills/plugin-upgrade/references/api-migration-0.1.2-alpha.2.md), and the corridor-fold rule in [rollup-0.1.2.md](../../../skills/plugin-upgrade/references/rollup-0.1.2.md). The community comment inside `src/events.ts` was treated as a claim to be checked, not as evidence.

## Verdict

**DELETE the defense code** (`delete (event as any).ignorable` and its comment at `fixture/src/events.ts:3-6`). Keeping it on alpha.2 is wrong, and the comment's instruction to keep it is a trap contradicted by primary sources.

## 1. Full corridor history of this semantics

| Corridor step | Card | What happened to `SessionEvent.ignorable` |
|---|---|---|
| ≤ `0.1.1-rc.2` | — | Marker exists on the persisted event envelope; third-party informational events carry `ignorable: true` (cf. `examples/legacy-plugin/src/index.ts:13-19`, the canonical producer shape). |
| → `0.1.2-alpha.1` | **DSH-0.1.2-A1-02** (breaking, "required-if-target-is-alpha.1") | Marker **temporarily removed**. alpha.1 cannot preserve `ignorable: true` on third-party informational events; first-party readers meeting unknown persisted events reject the reload and treat them as required events. |
| → `0.1.2-alpha.2` | **DSH-0.1.2-A2-01** (fix) | Marker **restored** — the card is explicitly a *revert of A1-02*. alpha.2 restores the retention semantics of envelope / persistence / reload / transport (JSONL, SQLite, API transports, generated catalog preserve the field as-is). |

**Net state over the corridor: the marker exists on alpha.2.** Per `SKILL.md` Mode C step 2 and `rollup-0.1.2.md:52-55`, when a field is removed in an intermediate version and restored in the target, you must not "delete and re-add" it, and **"if the final target restores that semantics, defensive code in old-version adaptations should be removed rather than kept."** `ignorable` is the canonical example named in that rule.

## 2. Why this defense must be deleted

1. **It targets a gap that no longer exists.** The defense was authored for the alpha.1-only removal (A1-02). A2-01 restores the marker on the target host, so the workaround is obsolete on alpha.2.
2. **Its own premise was never true, even on alpha.1.** The comment claims "without deleting the marker readers will reject it." The actual alpha.1 hazard (A1-02) is the opposite: an unknown persisted event *without* the marker is treated as **required** and its reload is **rejected** (fail-closed). Deleting a marker never helps a reader accept the event. The documented alpha.1 recipe was "stop writing that unknown persisted event, or switch to public event vocabulary the target version already knows" — not marker deletion.
3. **The line is dead code even by its own terms.** `event` is built in the same function (`fixture/src/events.ts:2`) with no `ignorable` property, so `delete (event as any).ignorable` removes nothing. It never did anything on any version.
4. **Keeping it is actively harmful on alpha.2.** On the restored semantics, stripping the marker is how you break a session: per A2-01, "old adapters that keep dropping the marker will make first-party readers reject Sessions containing unknown events," and "unknown events without the marker remain required-on-read." If any legitimate producer seam writes `ignorable: true`, a retained `delete` converts a reloadable informational event into an unknown required event and refuses the whole cold load.
5. **A1-02 itself pre-answered this exact migration**: "If the final target is alpha.2 or later, first read DSH-0.1.2-A2-01 to compute the corridor net state; **do not delete the producer marker and then restore it**." The community comment instructing "keep this when migrating to alpha.2" is contradicted by both cards and by the rollup fold rule.

## 3. Correct producer semantics on alpha.2

Per DSH-0.1.2-A2-01 and API-05:

- Producers write **`ignorable: true` only for informational events** whose semantics an old reader can omit without affecting reconstruction. The marker is an omission-tolerance flag on the **persisted envelope**, not a consumer-side filtering directive; events remain in loaded events after reload.
- Transports must preserve the field as-is; unknown events **without** the marker remain required-on-read (fail-closed).
- **Capability gap (confirmed by both cards): the public live `Session.append(...)` on alpha.2 still has no `ignorable` parameter** — it accepts only `type`, `data`, and `SurfaceIntent`, and it will not write the marker into the event. Therefore ordinary plugins with only that API should **mark the producer seam as a capability gap rather than faking a public entry via cast** (no casts, no object thawing, no hand-edited JSONL to set it).

## 4. What an ordinary plugin going through `Session.append(...)` should do

For the situation in this fixture — a plain plugin emitting its own third-party informational event via `session.append(...)` — the alpha.2 guidance is (API-05, best practice):

1. **Stop persisting plugin state as third-party session events on alpha.2.** The public `append` cannot set `ignorable`; a custom type will live-append fine yet the next cold load throws `SessionFormatUnsupportedError` and refuses to restore the whole Session ("silent write / loud read" — one live smoke cannot catch it).
2. **Use a plugin-owned sidecar/store keyed by Session id** for plugin state instead.
3. If reusing an existing known event type, reuse only its real, identical semantics — never disguise plugin state as a model-visible or core event.
4. Only integrations that **own the persistence seam** (in-repo persistence/reload/transport owners) should read/write the marker, preserving it end-to-end and covering both tests: "unknown events with a marker are readable" and "unknown required events without a marker are explicitly refused."
5. Re-evaluate third-party persistent events only after upstream ships a supported `append(..., { ignorable: true })` or an equivalent formal mechanism; registering an event name alone is not sufficient.

## 5. Minimal correct change if the migration proceeds (illustrative only — not applied)

Current (`fixture/src/events.ts:1-8`) keeps the deletion defense; both the defense and its persistence approach need attention:

- **Remove** the comment (lines 3-5) and `delete (event as any).ignorable` (line 6). Do not "restore" a delete-vs-add dance — the corridor net state already has the marker.
- **Replace the persistence scheme**: an ordinary out-of-repo plugin should move this informational state to a plugin-owned sidecar/store keyed by Session id (API-05 §4.1). If instead this plugin owns its persistence seam (`ctx.emit('session/event', { type, ignorable: true, payload })` — cf. `examples/legacy-plugin/src/index.ts:13-19`), the event literal simply carries `ignorable: true` and nothing ever deletes it.

## 6. Touchpoint checkup (pre-flight table)

| Touchpoint | Hit | File/line | Applicable card | Note |
|---|---:|---|---|---|
| #1 source patch | no | — | — | — |
| #2 events / persistent events | **yes** | `fixture/src/events.ts:1-8` | DSH-0.1.2-A1-02 → DSH-0.1.2-A2-01; API-05 | Third-party persisted informational event; producer marker manipulation |
| #3 services/Remote | no | — | — | — |
| #4 host filesystem | no | — | — | — |
| #5 UI/commands/tools | no | — | — | — |
| #6 custom channels | no | — | — | — |
| #7 subprocess/output | no | — | — | — |

Scan scope: `fixture/` only (README.md, package.json, src/events.ts). No dependency/import graph beyond the fixture exists to inspect.

## 7. Unconfirmed items (cannot verify from allowed materials)

- **Exact target-tag signature of `Session.append`**: the ledger states it accepts only `type`, `data`, and `SurfaceIntent`; the fixture instead calls `session.append(event)` with a single event object. The actual alpha.2 `.d.ts` (`packages/core/session/src/types.ts`) was not fetchable in this offline, read-only setup — **unconfirmed**.
- **Plugin face / seam ownership**: the fixture uses `session: any` and shows no activation, package manifest, or augmentation, so whether this code is an ordinary out-of-repo plugin or owns a persistence seam is **unconfirmed**. The recommendation in §5 branches accordingly.
- **Upstream primary sources** (alpha.2 tag files, the retain-ignorable decision note, release notes) are cited through the skill's cards only; not fetched (offline per brief). Card status for both cards is "reviewed" (A1 verifiedAt 2026-09-01, A2 verifiedAt 2026-08-31); alpha.2 restore is sourced to the tag `0a53fb55bea101816fa226bb964ae2bed71c343b`.
- **SQLite persistence**: A2-01 notes the SQLite provider accepts only schema 20 and rejects schema 19 — relevant only if this deployment uses that provider; the fixture shows no provider usage — **unconfirmed**.

## 8. Reporting (skill structure)

- **Pre-existing failures (baseline)**: not collected — no baseline build/test run was possible or permitted (fixture is `"private": true` static test material; reproduction environments are out of scope). This migration adds no failures by construction (source unchanged).
- **Completed**: corridor net-state computation for `ignorable` (removed A1-02 → restored A2-01); verdict **delete the defense** with card-level evidence; confirmed producer semantics and the public-`append` capability gap; ordinary-plugin guidance (sidecar/store).
- **Skipped**: touchpoint classes #1, #3–#7 — no hits in the fixture. No other alpha.1/alpha.2 card intersects this code (no APIProxy, settings, Remote, packaging, or composition surface present).
- **Pending / residual risk**: exact `append` signature at the target tag; plugin face/seam ownership; any real deployment data already persisted under the alpha.1-era scheme should be validated with a real persist → cold-load cycle before decommissioning the old behavior. Cold-load refusal of an unknown required event is the residual failure mode if the marker is still missing at the eventual write seam.
- **Rollback**: none required — `fixture/` is untouched relative to git HEAD (grading precondition). The report is the only artifact produced (this file, under `agent-output/S6-corridor-net-state/`).
- **Recommendations**: when implementing Mode C, delete the marker-deletion defense and its comment, migrate plugin state to a sidecar store keyed by Session id, and do not cast to fake an `ignorable` parameter on `Session.append`; re-check third-party persistent events only when upstream ships a supported append mechanism.


## Required output (JSON only)
{"decisions":[{"id":"<criterion-id>","verdict":"pass|partial|fail|missing","reason":"short"}],"caps":[{"id":"<cap-id>","triggered":false,"reason":"short"}]}
Every criterion and cap exactly once. pass=full points, partial=half, fail/missing=0; a triggered cap caps the total.