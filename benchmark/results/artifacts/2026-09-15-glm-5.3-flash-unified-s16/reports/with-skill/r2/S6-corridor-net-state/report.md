# S6 · Corridor Net-State Judgment — `SessionEvent.ignorable` defense code

- **Mode**: A · inspect (read-only). No file under `fixture/` was modified (working tree clean vs. HEAD).
- **Fixture**: `fixture/src/events.ts` — `produceExternalEvent()` builds `{ type: 'third-party/informational', payload }`, runs `delete (event as any).ignorable`, then `session.append(event)`.
- **Corridor**: `dsh-v0.1.1-rc.2 → dsh-v0.1.2-alpha.1 → dsh-v0.1.2-alpha.2` (target = **alpha.2**, per corridor edges in `references/README.md`, connected by `from → to` metadata, not filename order).
- **Method**: evidence from the version cards and corridor ledger only; the code comment and the fixture README note were treated as claims, not evidence.

---

## 1. Fate of the defense code: **DELETE**

### Corridor history of the `ignorable` semantics (net-state computation)

| Version | State of `SessionEvent.ignorable` | Evidence |
|---|---|---|
| ≤ 0.1.1-rc.2 (baseline) | Field present on the event envelope with **omission-safety retention semantics**: a reader meeting an unknown event type may continue only if the event carries `ignorable: true`; a missing marker means the event is *required* and fails closed | DSH-0.1.2-A2-01 (alpha.2 card) describes alpha.2 as a **restore/revert** of alpha.1's removal, i.e. reinstating the pre-alpha.1 semantics; reader fail-closed rule restated in API-05. The 0.1.1-rc.1/rc.2 cards themselves do not mention `ignorable` (their session-event card, DSH-0.1.1-R1-06, covers `type` vs `kind` only) — so the exact pre-rc.2 envelope history is **unconfirmed** beyond this inference |
| 0.1.2-alpha.1 (intermediate) | **Temporarily removed** (DSH-0.1.2-A1-02, breaking). alpha.1 *cannot preserve* the marker on third-party informational events; first-party readers encountering unknown persisted events reject the reload, treating them as required | `references/v0.1.2-alpha.1.md` · DSH-0.1.2-A1-02 |
| 0.1.2-alpha.2 (**target**) | **Restored** (DSH-0.1.2-A2-01, type: fix) — the envelope/persistence/reload/transport retention semantics are back; unknown events without the marker remain required-on-read | `references/v0.1.2-alpha.2.md` · DSH-0.1.2-A2-01, which is explicitly a revert of A1-02 |

**Net state across the corridor = the original retention semantics.** The removal (alpha.1) was an intermediate defect that the target (alpha.2) reverts. The defense code exists solely to work around that intermediate defect, so at the target it is obsolete — and worse than dead:

- **The cards pre-empt exactly this trap.** DSH-0.1.2-A1-02's recipe says: *"If the final target is alpha.2 or later, first read DSH-0.1.2-A2-01 to compute the corridor net state; **do not delete the producer marker and then restore it**."* The corridor rollup (`references/rollup-0.1.2.md`) generalizes it: *"if the final target restores that semantics, defensive code in old-version adaptations should be removed rather than kept."*
- **On alpha.2 the defense is actively harmful, not just stale.** A2-01's symptom line: *"old adapters that keep dropping the marker will make first-party readers reject Sessions containing unknown events."* A persistence seam that keeps stripping `ignorable` produces marker-less unknown events, which fail closed on cold load.
- **Even on alpha.1 the code as written never worked.** The object literal `{ type, payload }` never has an `ignorable` property, so `delete (event as any).ignorable` deletes a property that does not exist — a no-op. The comment's premise ("不删 marker 会被 reader 拒绝" — readers will reject it unless we delete the marker) misdescribes A1-02: alpha.1's defect was **host-side non-retention** (the host could not preserve the marker), not producer-side marker presence. Deleting it producer-side achieves nothing on any version.

### The comment is wrong on both counts

1. *"without deleting the marker readers will reject it"* — false for alpha.1 (the host dropped the marker regardless; A1-02) and backwards for alpha.2 (the marker is what lets readers skip an unknown event; A2-01/API-05).
2. *"this must be kept when migrating to alpha.2"* — exactly inverted. Alpha.2 restored retention; the required action is to **delete the defense**, per A1-02's recipe, the rollup corridor rule, and A2-01's symptom statement.

---

## 2. Correct producer semantics, and what an ordinary plugin via `Session.append(...)` should do

### What `ignorable` means (envelope semantics, restored in alpha.2)

- It is an **omission-safety / compatibility marker on the event envelope**, not a consumer-side filtering directive: a reader that does not know the event type may skip it *only* if it carries `ignorable: true`; a missing marker makes the event **required**, and unknown required events are rejected on load (fail closed).
- Marked events **remain in the loaded events after reload** — `ignorable` does not mean "drop it".
- Producers may set it **only** for informational/auxiliary events whose semantics a reader without the plugin can omit while still reconstructing the Session correctly; its absence must not change core/durable Session semantics.
- Persistence/transport owners (JSONL, SQLite schema 20, API transports, generated catalog) must **preserve the field as-is** end-to-end.

### The capability gap: the public API cannot set it

Alpha.2 restores the *envelope field*, but the **public live `Session.append(...)` still has no `ignorable` parameter** — per API-05 (`references/api-migration-0.1.2-alpha.2.md`) it accepts only `type`, `data`, and `SurfaceIntent` (the latter for surface events only) and *will not write `ignorable` into the event*. This is confirmed as still true much later in the corridor (DSH-0.1.5-A2-05: "`Session.append()` has no `ignorable` channel, a producer cannot mark these events"), so no later edge in the available cards reopens the seam.

Consequence for an ordinary plugin: a custom third-party event appended through the public API **persists fine live but throws `SessionFormatUnsupportedError` on the next cold load, refusing to restore the whole Session** — a *silent write / loud read* failure that a single live smoke test cannot catch.

### What the ordinary plugin should do (in order)

1. **Delete the defense** — remove `delete (event as any).ignorable` and the misleading comment. Do not replace it with anything that strips or fakes envelope fields.
2. **Do not fake the marker.** No `as any` casts, no freeze/thaw tricks, no hand-editing JSONL — API-05 states the gap "cannot be bypassed with casts, thawing objects, or hand-editing JSONL", and A2-01 says to record a *capability gap* "rather than faking a public entry via cast".
3. **Stop persisting plugin state as third-party persistent session events on alpha.2.** Use a **plugin-owned sidecar/store keyed by Session id** (API-05 best practice 1), or reuse an existing known event vocabulary only where the semantics are genuinely identical (best practice 2). The fixture's own event (`third-party/informational`) is informational in nature — exactly the profile `ignorable` was designed for — but the producer seam to mark it does not exist yet.
4. **Record the producer seam as a capability gap** and re-evaluate only after upstream ships a supported `append(..., { ignorable: true })` or another formal mechanism that persists the omission-safety marker (API-05 best practice 5). Registering an event name alone is not enough.
5. **If such events are written today anyway**, validate with a real *persist → process restart / cold load* test, never live-append alone; a cold-load refusal is a migration blocker to be removed, not swallowed (API-05 verification).

---

## 3. Evidence basis and unconfirmed items

### Evidence used (all read-only, from the fixture pack)

- `fixture/src/events.ts` (the defense under review); `fixture/README.md` and `fixture/package.json` (context only).
- DSH-0.1.2-A1-02 (`references/v0.1.2-alpha.1.md`, reviewed card set rc.2→alpha.1).
- DSH-0.1.2-A2-01 (`references/v0.1.2-alpha.2.md`, reviewed card set alpha.1→alpha.2 — the target edge).
- API-05 (`references/api-migration-0.1.2-alpha.2.md`, the alpha.2 interface ledger).
- Corridor rule and card index (`references/README.md`, `references/rollup-0.1.2.md`, `references/pre-flight.md` touchpoint #2).
- Corroborating later edge: DSH-0.1.5-A2-05 (`references/v0.1.5-alpha.2.md`).

The decision rests on the reviewed cards, **not** on the code comment (whose claims are inverted) nor on the fixture README's own spoiler note (which happens to agree but was not treated as authority).

### Unconfirmed / not verifiable in this closed-book container

- **Upstream sources**: the cited primary sources (alpha.2 `SessionEvent` type, `Session.append()` implementation, cold-load unknown-event guard, the 2026-08-30 *retain-ignorable-external-session-events* decision note, release notes) could not be fetched — no network access. They are taken as cited by the reviewed cards, not independently verified.
- **Pre-0.1.1-rc.2 history of `ignorable`**: the rc.1/rc.2 cards do not mention the field; its presence before alpha.1 is inferred from A2-01's "restore/revert" framing. **Unconfirmed.**
- **The fixture's exact call shape**: the fixture calls `session.append(event)` with a single object argument, while API-05 documents the public signature as `(type, data[, SurfaceIntent])`. Since the fixture types `session: any` and declares no DSH cohort in `package.json`, how a real host would treat this argument shape — and which cohort the fixture actually targeted — is **unconfirmed**. The recommendation above (do not write third-party persistent events through this seam on alpha.2) holds regardless of the argument shape.
- **Beyond-target behavior**: later cards corroborate the append gap and fail-closed reading through 0.1.5-alpha.2, but behavior beyond the alpha.2 target was not evaluated for this task.

## Recommendation summary

| Item | Verdict |
|---|---|
| `delete (event as any).ignorable` defense | **Delete** (corridor net state restores retention; the defense is a no-op today and harmful at the target) |
| Re-add `ignorable: true` via cast | **No** — public API has no such parameter; unsupported |
| Write third-party persistent events via `Session.append()` on alpha.2 | **No** — use a plugin-owned sidecar/store keyed by Session id; mark a capability gap and re-evaluate when upstream ships a supported marker-carrying append |
| Validation for any residual event writes | Real persist → cold-load test; `SessionFormatUnsupportedError` is a blocker, not something to swallow |
