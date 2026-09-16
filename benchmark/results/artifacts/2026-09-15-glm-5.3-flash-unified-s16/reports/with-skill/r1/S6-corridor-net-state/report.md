# Migration Report · S6 Corridor Net-State Judgment — `SessionEvent.ignorable` defense code

- **Scope**: read-only analysis of `fixture/src/events.ts` (target host: **DSH 0.1.2-alpha.2**); nothing under `fixture/` was modified. Evidence is taken from the version cards and reference ledger available locally (the `plugin-upgrade` skill's `references/`); no runtime reproduction was built (forbidden by this brief, and the fixture is `"private": true` test material with `session: any`, so no declaration or runtime seam exists to probe).
- **Verdict up front**: **delete the defense code** (the `delete (event as any).ignorable` line and the comment that justifies it). The comment's premise is factually inverted, the defense never had any effect even on alpha.1, and the corridor net state rule for alpha.1→alpha.2 (remove-then-restore) explicitly requires removing alpha.1-era defensive adaptations instead of keeping them.

---

## 1. Fate of the defense code: DELETE

### 1.1 The full history of the semantics across the corridor

| Version | State of `SessionEvent.ignorable` | Evidence |
|---|---|---|
| pre-alpha.1 (0.1.1 line) | Marker exists in the event envelope; producers of third-party informational persistent events mark them `ignorable: true` | Inferred from card titles: A1-02 says "**temporarily** removed" and A2-01 is explicitly the "**revert** of DSH-0.1.2-A1-02" — a revert restores what existed before. The exact pre-removal producer contract is **unconfirmed** (no 0.1.1 card spells it out; see §4) |
| **0.1.2-alpha.1** | `SessionEvent.ignorable` **removed**. The host "cannot preserve the `ignorable: true` marker on third-party informational events; when first-party readers encounter unknown persisted events, they reject the reload treating them as required events" | DSH-0.1.2-A1-02 (`references/v0.1.2-alpha.1.md`), action level `required-if-target-is-alpha.1` |
| **0.1.2-alpha.2** (target) | Marker **restored** — a fix card that reverts A1-02. What returns is the **retention semantics** of the marker across envelope / persistence / reload / transport: "JSONL, SQLite, API transports, and the generated catalog must preserve the field as-is; unknown events without the marker remain required-on-read" | DSH-0.1.2-A2-01 (`references/v0.1.2-alpha.2.md`) |
| later corridor (0.1.5-alpha.2) | Net state holds: the reader still refuses "unknown [events] to this harness and not marked ignorable", and "`Session.append()` has no `ignorable` channel" | DSH-0.1.5-A2-05 (`references/v0.1.5-alpha.2.md`) |

This is the corridor's canonical remove-then-restore pair. The corridor rule (`references/rollup-0.1.2.md`, "Card index" note):

> "read the full corridor before touching anything: a field or its semantics may be removed in an intermediate version and restored in a later one (the canonical example is `ignorable`, removed by DSH-0.1.2-A1-02 and restored by DSH-0.1.2-A2-01). When migrating, fold the corridor into its net state before modifying source — do not delete once for alpha.1 and then add it back for alpha.2; **if the final target restores that semantics, defensive code in old-version adaptations should be removed rather than kept**."

Restated as policy in `SKILL.md` Mode C step 2 ("compute the final net state … do not delete and re-add it") and anticipated by A1-02's own recipe: "If the final target is alpha.2 or later, first read DSH-0.1.2-A2-01 to compute the corridor net state; **do not delete the producer marker and then restore it**."

Net state for rc.2 → alpha.1 → **alpha.2**: the marker and its retention semantics are **present**. Therefore the defense written for alpha.1 has no reason to exist on the target.

### 1.2 The comment's premise is inverted

The in-code comment claims: "不删 marker 会被 reader 拒绝" ("if you don't delete the marker, readers will reject it"). The documented reader semantics say the exact opposite:

- A reader that meets an **unknown** event type "may continue only if that event already carries `ignorable: true`; **a missing field means required**" (`references/api-migration-0.1.2-alpha.2.md`, API-05);
- "unknown events **without** the marker remain required-on-read" (A2-01);
- the fail-closed guard refuses "unknown to this harness and not marked ignorable" (DSH-0.1.5-A2-05, same guard lineage).

So the marker is an **omission-safety marker**: its presence licenses an old reader to skip the event; its absence makes the event required and triggers exactly the reload rejection the comment claims to prevent. Deleting the marker *causes* reader rejection for unknown types; it cannot prevent it.

### 1.3 The defense was a no-op even on alpha.1

- The event is constructed as `{ type: 'third-party/informational', payload }` — it never has an `ignorable` property in the first place, so `delete (event as any).ignorable` deletes a non-existent key: a literal no-op in its own terms.
- Even if the producer had set `ignorable: true`, A1-02's symptom statement says alpha.1 "cannot **preserve** the marker" — the host strips it at the envelope/persistence layer regardless of what the producer passes. The alpha.1 reload-rejection failure mode was caused by the host's inability to retain the marker, not by producers leaving one in place.

Conclusion: the defense never achieved its stated purpose on any version in the corridor, and on alpha.2 keeping it would encode an inverted mental model for future maintainers. Delete it.

---

## 2. Correct producer semantics on alpha.2 (ordinary plugin via `Session.append(...)`)

The second half of the corridor answer matters as much as the deletion, because alpha.2 does **not** restore the third-party producer surface:

- "What alpha.2 restores is the retention semantics of envelope/persistence/reload/transport; **the public live `Session.append(...)` still has no `ignorable` parameter**, so ordinary plugins with only this API should mark the producer seam as a **capability gap** rather than faking a public entry via cast" (A2-01).
- API-05 (interface ledger) spells out the public surface: `Session.append()` accepts only `type`, `data`, and `SurfaceIntent` (surface events only) — "it will not write `ignorable` into the event". The failure shape is **silent write / loud read**: a custom type live-appends and persists fine, then throws `SessionFormatUnsupportedError` on the next cold load, refusing to restore the whole Session — which "one live smoke cannot catch".
- "It cannot be bypassed with casts, thawing objects, or hand-editing JSONL" (API-05).

So for an ordinary plugin going through `Session.append(...)`:

1. **Delete the defense** (and the comment). Do not replace it with a marker-setting trick.
2. **Do not persist unknown third-party event types through `Session.append()` on alpha.2 at all.** Live append succeeds, but the persisted event carries no marker, so cold load fails closed and takes the whole session down. Per API-05 best practice, out-of-repo plugins should keep that state in a **plugin-owned sidecar/store keyed by Session id**; or reuse only event vocabulary the target version already knows, and only with its real, identical semantics — never disguise plugin state as a model-visible or core event.
3. **Do not fake the marker** through `as any` casts, frozen/thawed object tricks, or hand-edited JSONL — none of these is a supported seam.
4. **Understand what the marker would mean if it existed**: `ignorable: true` fits only auxiliary/informational events whose absence does not change core or durable Session semantics; it is **not** a consumer-side filtering directive — marked events still appear in the loaded event list after reload (A2-01).
5. **Record the capability gap** and re-evaluate only "after upstream ships a supported `append(..., { ignorable: true })` or another formal mechanism that persists the omission-safety marker" (API-05 best practice 5). Registering an event name alone is not such a mechanism.
6. Cross-cohort note: if this plugin must also serve an alpha.1 cohort, A1-02's recipe for an alpha.1 target was to **stop writing the unknown persisted event** (or switch to public known vocabulary) — not consumer whitelists, and not producer-side deletes.

---

## 3. Evidence basis and verification

Decided by cards/ledger, not by the comment:

- `fixture/src/events.ts` — the defense and comment under judgment;
- `references/v0.1.2-alpha.1.md` · DSH-0.1.2-A1-02 (removal; "temporarily"; recipe warning against delete-then-restore for alpha.2 targets);
- `references/v0.1.2-alpha.2.md` · DSH-0.1.2-A2-01 (restore of retention semantics; `Session.append` has no `ignorable` parameter → capability gap; unknown events without the marker remain required-on-read; SQLite schema 19 rejected / schema 20 only);
- `references/rollup-0.1.2.md` (corridor net-state rule; ignorable named as the canonical remove-then-restore example; "defensive code in old-version adaptations should be removed rather than kept");
- `references/api-migration-0.1.2-alpha.2.md` · API-05 (public append accepts only `type`/`data`/`SurfaceIntent`; silent write / loud read → `SessionFormatUnsupportedError` on cold load; best practices 1–5);
- `references/v0.1.5-alpha.2.md` · DSH-0.1.5-A2-05 (later corridor: reader still fails closed on unknown non-ignorable events; `Session.append()` still has no `ignorable` channel);
- `references/README.md` + `SKILL.md` Mode C step 2 (corridor construction by `from → to` edges; compute the final net state before touching source).

Proposed verification for the actual migration (not executed here — this brief forbids building/running an environment):

- static: `rg -n "delete .*ignorable"` over the migrated source → zero hits; also zero hits for any cast that writes `ignorable` through `append`;
- behavior (only if the plugin still persists any session-event-like state): a real persist → process restart / cold-load test, per API-05 — live append success alone proves nothing; unknown required events must be refused by the reader, which is why the sidecar/store scheme is the recommendation;
- typecheck against the actual alpha.2 packed declarations to confirm the public `Session.append` parameters before touching any call site.

## 4. Unconfirmed items

- **Pre-alpha.1 producer contract**: that `ignorable: true` was a producer-writable envelope marker before alpha.1 is inferred from "temporarily removed" (A1-02) and "revert of DSH-0.1.2-A1-02" (A2-01); no 0.1.1-line card in the available references spells out the pre-removal contract. Exact historical wording: unconfirmed (does not change the verdict).
- **Exact runtime signature/overloads of `Session.append()` in the alpha.2 packed declarations**: taken from the API ledger (API-05, citing `packages/core/session/src/index.ts` at tag `dsh-v0.1.2-alpha.2`); no packed `.d.ts` is available in the read-only fixture to verify directly. The fixture itself types `session: any`, so its call shape proves nothing either way.
- **Whether any internal (non-public) seam could set `ignorable` on alpha.2**: API-05 states the gap "cannot be bypassed"; I did not and cannot inspect host internals here. Existence of such a seam: unconfirmed — and irrelevant to the recommendation, which is bounded to the public API.
- **Runtime behavior**: no runtime verification was performed (static, read-only analysis only).
