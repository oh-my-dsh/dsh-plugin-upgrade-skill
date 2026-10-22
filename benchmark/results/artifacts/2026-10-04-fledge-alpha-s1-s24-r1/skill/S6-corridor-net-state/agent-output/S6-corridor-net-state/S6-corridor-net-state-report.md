# S6 · Corridor Net-State Judgment — `SessionEvent.ignorable` defense code

**Verdict (one line): DELETE the defensive `delete (event as any).ignorable` and its comment.**
At the alpha.2 target the marker-retention semantics is restored (`DSH-0.1.2-A1-02` → `DSH-0.1.2-A2-01`, remove-then-restore), the deletion is a no-op on the object it is applied to, and the "readers will reject it unless the marker is deleted" claim is the inverse of alpha.2 semantics.

- Mode: read-only inspection (skill Mode A / pre-flight #2), no fixture writes, no build/install/repro, no network.
- Fixture under review: `dsh-events-bench@0.1.0`, `private: true`, no dependencies (`fixture/package.json`), source `fixture/src/events.ts`.
- Target host: **alpha.2** (`dsh-v0.1.2-alpha.2`).
- Evidence base: cell fixture + `skills/plugin-upgrade/references/` (primary cards). The fixture directory was not modified.

Code under judgment (`fixture/src/events.ts:1-8`):

```ts
export function produceExternalEvent(session: any, payload: any): void {
  const event = { type: 'third-party/informational', payload }
  // alpha.1 移除了 SessionEvent.ignorable（DSH-0.1.2-A1-02）。不删 marker 会被
  // reader 拒绝，所以这里先把 marker 删掉再写。迁移到 alpha.2 时这段要继续
  // 保留。——社区注释（陷阱：alpha.2 已恢复保留语义，这段防御应当删除）
  delete (event as any).ignorable
  session.append(event)
}
```

---

## 1. Full history of `ignorable` across the version corridor

The corridor is built by the directed `from → to` edges in `references/README.md` (rows 2 and 3), not by filename order: `dsh-v0.1.1-rc.2 → dsh-v0.1.2-alpha.1 → dsh-v0.1.2-alpha.2`.

| Step | State of the semantics | Card / source | Evidence |
|---|---|---|---|
| Pre-alpha.1 (rc.2 baseline) | Producer marker `ignorable: true` existed on third-party persisted events (its removal is later called "temporary" and its restoration is an explicit revert) | `DSH-0.1.2-A1-02` (`v0.1.2-alpha.1.md:112-121`); `DSH-0.1.2-A2-01` (`v0.1.2-alpha.2.md:34-43`); `rollup-0.1.2.md:52-55` | A1-02 title "temporarily removed"; A2-01 is "revert of DSH-0.1.2-A1-02"; the rollup names `ignorable` the canonical remove-then-restore example |
| alpha.1 | **Removed** (breaking; "required-if-target-is-alpha.1"). alpha.1 cannot preserve the marker; first-party readers see unknown persisted events as required and reject the reload | `DSH-0.1.2-A1-02` | "alpha.1 cannot preserve the `ignorable: true` marker … they reject the reload treating them as required events"; recipe: if the target is exactly alpha.1, stop writing the unknown persisted event or use known vocabulary; never turn unknown persisted events into a consumer whitelist |
| alpha.2 | **Restored** (fix; "required-if-hit"). Retention semantics of envelope / persistence / reload / transport is back: unknown events carrying `ignorable: true` survive reload and an old reader may omit their semantics; unknown events **without** the marker remain required-on-read and fail closed. Producers write `ignorable: true` only for informational events whose omission does not affect Session reconstruction; it is not a consumer-side filtering directive and marked events remain in loaded events after reload | `DSH-0.1.2-A2-01`; `api-migration-0.1.2-alpha.2.md` API-05 (`:411-449`) | A2-01 symptoms: "old adapters that keep dropping the marker will make first-party readers reject Sessions containing unknown events"; JSONL/SQLite/API transports and the generated catalog must preserve the field as-is |
| alpha.2 write API | **Capability gap**: public `Session.append()` still accepts only `type`, `data`, and `SurfaceIntent` (surface events only) and will not write `ignorable` into the event | `api-migration-0.1.2-alpha.2.md` API-05 | "the public live `Session.append(...)` still has no `ignorable` parameter … mark the producer seam as a capability gap rather than faking a public entry via cast" |
| Beyond target (context only) | No later carded edge re-removes the semantics; the marker contract is still referenced as in force | `v0.1.5-alpha.2.md` A2-05 (`:196-224`); `v0.1.6-alpha.1.md:510-512`; `jump-0.1.5-rc.2-to-0.1.7-rc.1.md:179-194` | 0.1.5-alpha.2 refuses unknown non-ignorable events and notes `Session.append()` still has no `ignorable` channel; 0.1.6 `image/offload` carries no `ignorable` and is refused by builds that do not know it; the jump doc speaks of "(unknown-ignorable) session events" |

**Net state at the alpha.2 target: restored — do not delete and re-add.** `rollup-0.1.2.md:54-55` states the rule verbatim: when migrating, fold the corridor into its net state before touching source; "if the final target restores that semantics, defensive code in old-version adaptations should be removed rather than kept."

---

## 2. Fate of the defense code: delete

`delete (event as any).ignorable` at `fixture/src/events.ts:6` must be **removed, together with its comment (lines 3-5)**. Four independent, evidence-based reasons:

1. **Corridor net state.** The defense exists only because of the alpha.1-only removal (A1-02, action level "required-if-target-is-alpha.1"). The target is alpha.2, where A2-01 restored retention. Keeping an alpha.1-era adaptation at an alpha.2 target is exactly the "do not delete once for alpha.1 and then add it back for alpha.2" anti-pattern in `rollup-0.1.2.md:54-55`; here the deletion is the residue and must go.
2. **It is a no-op on its own object.** The property name in the object literal at line 2 is `payload`, not `ignorable`; the freshly constructed object never carries the marker, so `delete` removes nothing. It is dead code even before considering versions.
3. **The comment's claim is inverted at the target.** A2-01 says the bug is adapters that *keep dropping the marker* — that makes first-party readers reject Sessions containing unknown events. "Readers reject it unless the marker is deleted" is true only under alpha.1; at alpha.2 a missing marker means *required-on-read*, i.e. the rejection is caused by the missing marker, not by its presence.
4. **The in-code instruction contradicts the primary cards.** "Keep this when migrating to alpha.2" conflicts with A1-02's recipe ("If the final target is alpha.2 or later … do not delete the producer marker and then restore it") and with A2-01's verification (the marker must be preserved end-to-end). The comment even self-labels as a trap; the verdict does not rest on that label but on A1-02/A2-01/API-05.

What must **not** replace it: adding a cast-based `ignorable: true` injection to force the marker through `session.append`. That is the explicit anti-pattern in API-05 ("cannot be bypassed with casts, thawing objects, or hand-editing JSONL"; "do not … pretends a public entry point exists" — `evals.json` eval #2).

---

## 3. Correct producer semantics

- The envelope field is `ignorable?: true`. A **missing field means required**; a reader that meets an unknown type may continue only when the event already carries `ignorable: true` (A2-01, API-05).
- The marker is an **omission-safety marker at persistence/reload/transport level**, not a consumer-side filtering directive. Marked events are not filtered out on load; they remain in loaded events, and readers without the owning plugin simply omit interpreting their semantics (A2-01; `evals.json` eval #2: "keep/restore the producer marker").
- Producers may write `ignorable: true` **only for informational/auxiliary events** whose semantics an old reader can omit without affecting Session reconstruction. Its absence must not change core/durable Session semantics; do not disguise plugin state as a model-visible or core event (API-05 best practice 1-3).
- Persistence/transport owners (JSONL, SQLite schema 20, API transports, generated catalog) must **preserve the field as-is**; unknown events without a marker keep failing closed (A2-01; API-05 best practice 4). Dropping the marker is precisely the A2-01 regression being fixed.

---

## 4. Ordinary plugin going through `Session.append(...)`

The hint holds: at alpha.2 the public API surface does not have the parameter.

- API-05: `Session.append()` "still only accepts `type`, `data`, and `SurfaceIntent`, which is available to surface events only; it will not write `ignorable` into the event."
- Consequence: a custom type appended a live session can succeed and persist, then throw `SessionFormatUnsupportedError` on the **next cold load**, refusing to restore the whole Session — a "silent write / loud read" that one live smoke test cannot catch (API-05).
- Therefore an ordinary plugin should:
  1. **not** fake the parameter via cast/thaw/hand-edited JSONL;
  2. **not** persist state through a custom `SessionEventMap` augmentation + `Session.append()` on alpha.2 — use a plugin-owned sidecar/store keyed by Session id instead;
  3. reuse existing known events only with their real, identical semantics;
  4. **mark the producer seam as a capability gap** and re-evaluate only after upstream ships a supported `append(..., { ignorable: true })` or another formal mechanism that persists the omission-safety marker. Registering an event name alone is not enough (API-05 best practice 5).
- "Keep/restore the producer marker" applies to producers that own a real persistence/transport seam (envelope/seed writers and adapters). The fixture is not such a producer: it goes through public `session.append`. For the fixture, the only correct action is to delete the defense; whether the event should exist at all persists as an open capability gap, not something to force.
- Fixture-specific caveat: the call at line 7 passes one hand-built object (`session.append(event)`) through an `any`-typed `session`. Per API-05 the documented public shape is `type`/`data`/`SurfaceIntent`, so the object form itself is not confirmed against the public contract (see unconfirmed list). The `any` typing is precisely what hides the missing parameter.

---

## 5. Evidence vs. comment

| Claim in the comment (events.ts:3-5) | Primary evidence | Verdict |
|---|---|---|
| "alpha.1 removed `SessionEvent.ignorable` (A1-02)" | A1-02 (`v0.1.2-alpha.1.md:112-121`) | True |
| "readers will reject it if the marker is not deleted" | A2-01 (`v0.1.2-alpha.2.md:34-43`); API-05 | False at alpha.2 — missing marker means required-on-read; the marker is what prevents rejection |
| "delete the marker before writing" | A1-02 recipe: only for a target of exactly alpha.1 | Obsolete; target is alpha.2 |
| "keep this when migrating to alpha.2" | `rollup-0.1.2.md:52-55`; A1-02 recipe; A2-01 verification | False — remove alpha.1-era defensive code when the target restores the semantics |
| Self-label "trap: alpha.2 restored retention, this defense should be deleted" | A2-01; API-05 | Consistent with the cards, but the verdict above was derived from A1-02/A2-01/API-05, not from this label |

---

## 6. Verification plan (recommended on a real alpha.2 host; not executed here)

1. **Cold-load, not live smoke** (API-05 verification): persist a Session containing an unknown custom event *with* `ignorable: true` (manual envelope/seed setup or a test that owns the persistence seam), restart/cold-load, and assert the event still exists in loaded events and the reader continues; repeat *without* the marker and assert the explicit fail-closed refusal.
2. Confirm the plugin no longer contains the alpha.1 defensive deletion/comment residue (search for `ignorable` and for the A1-02 comment text in the migrated source).
3. If the plugin still cannot set the marker through `Session.append`, record the cold-load path as a migration blocker and move the data to a plugin-owned sidecar rather than accepting the refusal (API-05 verification).
4. On a real repository (not this dependency-free fixture), restore type declarations and typecheck after removing the `any`, then run build/tests.

---

## 7. Status (skill report structure)

- **pre-existing**: not collected — read-only Mode A; no baseline package scripts were run and none exist in the fixture.
- **Completed**: corridor folding (rc.2 → alpha.1 → alpha.2); verdict on the defense code; producer semantics; `Session.append` guidance; evidence/comment reconciliation.
- **Skipped**: build/typecheck/runtime verification — the fixture declares no DSH dependency or types (only `package.json` with `private: true`), no alpha.2 host is present in the cell, and the brief forbids building a reproduction environment or installing anything.
- **Pending / residual risk / unconfirmed**:
  1. Exact pre-alpha.1 (rc.2) envelope implementation details: the cards attest the marker existed only indirectly ("temporarily removed", revert) — **unconfirmed detail**; it does not change the net state.
  2. The real alpha.2 cold-load behavior was not reproduced here — **unconfirmed by execution**; stated from the reviewed primary cards (A2-01, API-05).
  3. Whether upstream has since shipped a supported `append(..., { ignorable: true })` after alpha.2 — **unconfirmed / out of target scope**; the 0.1.5-alpha.2 card still describes the channel as absent.
  4. The fixture's single-object `session.append(event)` form versus the documented public `append(type, data, …)` surface — **unconfirmed from fixture-local evidence** (the `session` parameter is `any`, no type declarations); per API-05 the object form is not the documented public shape.
  5. Later-corridor rows (0.1.5/0.1.6/0.1.7) are context only; they are outside the alpha.1 → alpha.2 migration corridor.
- **Rollback**: none needed — no file under `fixture/` was modified; this report is the only artifact written.
- **Recommendations**: delete the defense; do not cast around the capability gap; use a plugin-owned sidecar for durable plugin state; verify with a persist → cold-load test; re-evaluate third-party persistent events only when a supported marker-writing append/registration mechanism ships.
