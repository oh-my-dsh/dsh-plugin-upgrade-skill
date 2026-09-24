# S6 · Corridor Net-State Judgment — Migration Report (read-only)

Task: judge the fate of an alpha.1-era "defense" that deletes the `SessionEvent.ignorable` marker before writing a third-party persistent event, when the migration target is **dsh 0.1.2-alpha.2**.

- Skill: plugin-upgrade (Mode A · inspect — read-only report; the brief is an unattended benchmark, so no confirmation pauses).
- Fixture inspected (unchanged, read-only): environment/fixture/README.md, package.json (`dsh-events-bench` 0.1.0, private), src/events.ts.
- Corridor evidence: skill references v0.1.2-alpha.1.md (DSH-0.1.2-A1-02), v0.1.2-alpha.2.md (DSH-0.1.2-A2-01), api-migration-0.1.2-alpha.2.md (API-05), rollup-0.1.2.md (corridor fold / net-state rule), v0.1.5-alpha.2.md (DSH-0.1.5-A2-05, confirming the read semantics survives later).
- Closed-book constraint honored: only the fixture and local skill references were read; no network, no builds, no reproduction environment.

## 1. Fate of the defense code: **DELETE** (do not keep)

Corridor history of the `ignorable` semantics across the 0.1.2 corridor:

| Edge | Change | Card |
|---|---|---|
| ≤ rc.2 | Envelope field `ignorable?: true` exists; unknown events without it are required-on-read | background |
| rc.2 → alpha.1 | `SessionEvent.ignorable` **temporarily removed** (breaking). alpha.1 cannot preserve the marker on third-party informational events; first-party readers reject reloads containing unknown persisted events | DSH-0.1.2-A1-02 |
| alpha.1 → alpha.2 | **Restored** (fix, revert of A1-02): envelope/persistence/reload/transport retention semantics is back; JSONL, SQLite, API transports, and the generated catalog must preserve the field as-is | DSH-0.1.2-A2-01 / API-05 |

Corridor **net state** for target alpha.2: the field and its retention semantics are restored. The rollup-0.1.2.md corridor rule names exactly this case as canonical: "if the final target restores that semantics, defensive code in old-version adaptations should be removed rather than kept" — do not delete-then-re-add across the corridor; compute the net state once.

Why the defense is not merely useless but actively wrong on alpha.2, per card A2-01's own symptom text: "now that alpha.2 restores it, old adapters that keep **dropping the marker** will make first-party readers reject Sessions containing unknown events." The code's premise is also inverted: the comment claims "without deleting the marker readers will reject it". That was backwards even for alpha.1 — A1-02 says alpha.1 *could not preserve* the marker, and unknown events *without* the marker are treated as required and rejected; the marker has always meant "an old reader may omit this event's semantics", never "reject". Deleting the marker is precisely what makes a reader refuse the session. The comment's second claim ("must be kept when migrating to alpha.2") contradicts A2-01 and must be rejected on evidence.

Conclusion: remove the `delete (event as any).ignorable` line and the accompanying comment. Nothing else in the fixture depends on it (single-file plugin, no other references).

## 2. Correct producer semantics on alpha.2, and what Session.append(...) callers should do

Envelope semantics (restored, per A2-01 + API-05):

- `ignorable: true` is a **producer-side omission-safety marker on the persisted event envelope**: when a reader that does not know the event type meets it, it may continue loading only if the event already carries `ignorable: true`; a missing field means the event is required and the reader fails closed (`SessionFormatUnsupportedError`, refusing the whole Session restore).
- It is **not** a consumer-side filtering directive; marked events remain in loaded events after reload. It fits only auxiliary information whose omission does not change core/durable Session reconstruction.
- It is a property of the persisted envelope, not something a caller passes per-call: **the public live `Session.append()` on alpha.2 still has no `ignorable` parameter** — it accepts `type`, `data`, and `SurfaceIntent` (surface events only) and will not write `ignorable` into the event.

What an ordinary plugin using only Session.append(...) should do on alpha.2 (API-05 "dangerous legacy pattern" and best practice):

1. **Do not persist plugin state as a custom `SessionEventMap` entry + `Session.append()`.** A custom type live-appends and persists fine, yet on the next cold load the unmarked unknown event throws and refuses the whole Session — a "silent write / loud read" a live smoke cannot catch. Use a plugin-owned sidecar/store keyed by Session id instead.
2. Do not fake the marker via casts, typed overloads, thawed objects, or hand-edited JSONL — there is no supported bypass; mark the producer seam as a **capability gap** rather than faking a public entry.
3. If reusing an existing known event type, reuse only its real, identical semantics; never disguise plugin state as a model-visible or core event.
4. Persistence/transport integrations (not this plugin's case) must preserve existing markers end-to-end and keep failing closed on unmarked unknown events.
5. Re-evaluate third-party persistent events only after upstream ships a supported `append(..., { ignorable: true })` or an equivalent formal mechanism.

Applied to src/events.ts `produceExternalEvent`: the function's whole design (writing `'third-party/informational'` through `session.append`) is the API-05 anti-pattern. The defense line is deleted, and the correct migration is to **stop writing this event through Session.append at all** and move the informational payload to a plugin-owned store. Note additionally that the fixture calls `session.append(event)` with a single whole-object argument, while the documented call shape in API-05 is `session.append(type, data)` — the single-object overload is **unconfirmed** in the available references (no type sources in this closed-book fixture), so flag rather than assert it.

## 3. Verification plan (for the implementing migration, not run here)

- Persist → process restart / cold-load test for any remaining custom append (live append alone proves nothing — API-05).
- Confirm unknown events **with** `ignorable: true` (set only via an owned persistence seam) survive reload; unknown unmarked events are explicitly refused.
- Confirm a plain `Session.append` is never documented as supporting the field.
- SQLite persistence: schema 20 only; schema 19 is rejected without auto-migration (A2-01 side note).

## Skipped / not applicable

- Touchpoint classes other than #2 (events) — the fixture is a single producer function with no source patches, services/Remote, filesystem, UI, channels, or subprocess surface.
- Later corridor edges (alpha.3 … 0.1.5) beyond a consistency check: DSH-0.1.5-A2-05 confirms the same read semantics (unknown unmarked events refused, `Session.append()` still has no `ignorable` channel), so nothing later re-inverts this judgment; a full net-state computation for targets beyond alpha.2 was out of scope.

## Unconfirmed / pending

- The single-object `session.append(event)` overload (see §2): no host type sources available in the closed-book fixture.
- Runtime behavior claims rest on the corridor cards and their cited upstream sources; no reproduction environment was built per the brief's constraints.

## Rollback

Read-only task; no files modified anywhere (fixture untouched, output written only to the designated report directory). Nothing to roll back.
