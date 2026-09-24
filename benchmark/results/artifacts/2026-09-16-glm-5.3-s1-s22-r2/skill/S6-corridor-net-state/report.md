# S6 · Corridor Net-State Judgment — `SessionEvent.ignorable` defense code (read-only report)

**Task**: judge the fate of an alpha.1-era "defense" that `delete`s the `ignorable` marker before writing a third-party persistent session event, when migrating to host **0.1.2-alpha.2**.
**Mode**: Mode A-style read-only analysis (per instruction: no writes to fixture, no reproduction environment, closed-book outside the fixture + skill references).
**Fixture analyzed**: `dsh-events-bench@0.1.0` (private), single source file `src/events.ts` (read in full); fixture left untouched.

## 1 · What the fixture actually does

```ts
export function produceExternalEvent(session: any, payload: any): void {
  const event = { type: 'third-party/informational', payload }
  delete (event as any).ignorable   // claims: without deleting, readers reject; keep when migrating to alpha.2
  session.append(event)
}
```

Two independent observations before any version reasoning:

- The deleted property never existed: the object literal `{ type, payload }` has no `ignorable` key, so the `delete` is a runtime no-op in every version. The "defense" defends nothing.
- The comment's causal claim is inverted even for alpha.1. Per **DSH-0.1.2-A1-02**, alpha.1 *could not preserve* the marker on third-party informational events; when first-party readers met unknown persisted events **without** `ignorable: true` they treated them as **required** and rejected the reload. Rejection is caused by the **absence** of the marker, never by its presence. Deleting the marker moves in exactly the wrong direction.

## 2 · Corridor net state of the `ignorable` semantics (evidence-based)

| Corridor edge | State of `SessionEvent.ignorable` | Evidence |
|---|---|---|
| ≤ 0.1.1-rc.2 | Envelope field exists for third-party informational events | Implied as the pre-existing state that alpha.1 "temporarily removed" (A1-02 title/symptoms) |
| rc.2 → **alpha.1** | **Removed** (DSH-0.1.2-A1-02, breaking, `required-if-target-is-alpha.1`). Host cannot retain the marker; readers reject unknown persisted events as required. Correct alpha.1 action: stop writing the unknown event or switch to known public vocabulary — **not** marker manipulation | card DSH-0.1.2-A1-02 |
| alpha.1 → **alpha.2 (target)** | **Restored** (DSH-0.1.2-A2-01, fix, revert of A1-02). Envelope/persistence/reload/transport retention semantics are back: unknown events **with** `ignorable: true` survive reload and old readers may omit their semantics; unknown events **without** the marker remain required-on-read (fail closed) | cards DSH-0.1.2-A2-01, API-05 |
| later (context only) | Envelope semantics persist: 0.1.5-alpha.2 adds two new **non-ignorable** events (DSH-0.1.5-A2-05) and notes `Session.append()` still has no `ignorable` channel | card DSH-0.1.5-A2-05 |

Per the corridor rule (compute the **net** state across the full corridor; a field removed in alpha.1 and restored in alpha.2 must not be delete-then-re-added), the net alpha.1→alpha.2 change for this seam is: **the marker is back, and producers/persistence owners are expected to preserve it, not strip it.** A2-01's symptoms explicitly name the fixture's pattern: "old adapters that keep dropping the marker will make first-party readers reject Sessions containing unknown events."

## 3 · Verdict on the defense code

**Delete the defense (the `delete (event as any).ignorable` line and its comment). Do not keep it.**

Reasoning:

1. **Corridor net state**: alpha.2 restored the retention semantics (A2-01). Stripping the marker is now actively harmful: an unknown persisted event without `ignorable: true` is required-on-read and first-party readers will reject the whole session reload. The comment's instruction "keep this when migrating to alpha.2" is the exact opposite of the correct action.
2. **The claim was never true**: rejection is triggered by a *missing* marker, not a present one, in both alpha.1 (A1-02 symptoms) and alpha.2 (A2-01/API-05). The comment misstates the semantics it claims to defend.
3. **It is a no-op anyway**: the marker is not present on the literal, so the line has no runtime effect — but a misleading no-op is worse than no code, because it encodes a false invariant for future maintainers.
4. **Even for a real alpha.1 target it was wrong**: A1-02's recipe for alpha.1 is to stop writing the unknown event or use known public vocabulary — never to manipulate the marker, and never a consumer-side whitelist.

However — deleting the defense does **not** make the surrounding code correct. See §4.

## 4 · Correct producer semantics on alpha.2

Per **API-05** (`ignorable` restored but the third-party **write surface is still incomplete**):

- The **public `Session.append(...)`** on alpha.2 accepts only `type`, `data`, and `SurfaceIntent` (surface events only). **It has no `ignorable` parameter** and will not write the marker into the event. The hint in the task brief is confirmed: the public API surface does not expose that parameter.
- Consequence for this fixture: `session.append({ type: 'third-party/informational', ... })` (a custom out-of-repo type) can live-append and persist fine, yet on the **next cold load** the unknown event carries no `ignorable: true`, so the reader throws `SessionFormatUnsupportedError` and refuses to restore the whole Session. This is a silent-write / loud-read failure that a live-only smoke test cannot catch.
- This cannot be bypassed by casts, object thawing, or hand-editing JSONL (API-05, explicit).

**What an ordinary plugin should do on alpha.2**:

1. **Do not persist plugin state via custom `SessionEventMap` augmentation + `Session.append()`.** Use a plugin-owned sidecar/store keyed by session id instead. This is the primary recommendation for this fixture: the whole `produceExternalEvent` persistence scheme, not just the `delete` line, should be removed/reworked.
2. If reusing an existing known event, reuse only its real, identical semantics; do not disguise plugin state as a model-visible or core event.
3. `ignorable: true` (as a producer concept, where a supported seam exists) fits only auxiliary information whose omission by a reader without the plugin still rebuilds the Session correctly; it is **not** a consumer-side filtering directive, and marked events remain in loaded events after reload.
4. Persistence/transport owners must preserve existing markers end-to-end; unknown unmarked events keep failing closed.
5. Re-evaluate third-party persistent events only after upstream ships a supported `append(..., { ignorable: true })` or an equivalent formal mechanism; do not treat the alpha.2 envelope restoration as that capability having shipped.

**Verification to demand** (per API-05/A2-01): for any surviving custom append, a real persist → process restart / cold-load test (not live-append only); a cold-load refusal is a migration blocker — remove the persistence scheme rather than swallowing the error. Persistence owners additionally cover "marked unknown events readable" and "unmarked unknown events explicitly refused".

## 5 · Evidence vs. comment — decision basis

- Decision made from the corridor cards **DSH-0.1.2-A1-02**, **DSH-0.1.2-A2-01**, and **API-05** in the skill's `references/` (each citing primary sources pinned to the alpha.2 tag: the retain-ignorable architecture note, alpha.2 `SessionEvent` type, `Session.append()` implementation, and the cold-load unknown-event guard), not from the fixture comment. The comment was treated as a claim to falsify, and it is falsified on both versions it mentions.
- **Unconfirmed items** (closed-book constraint; primary sources not reachable from the container): I did not directly read the alpha.1/alpha.2 tag sources themselves (e.g. `packages/core/session/src/types.ts` at the tags); the `Session.append` parameter list and `SessionFormatUnsupportedError` behavior are taken from the skill's curated cards/ledger, which pin those sources. I also did not execute anything against a real alpha.2 host (no reproduction environment permitted), so the cold-load failure of this exact fixture is predicted from API-05, not reproduced. The pre-alpha.1 state (marker present in ≤ rc.2) is inferred from A1-02's "temporarily removed" framing rather than a directly inspected rc.2 source.

## 6 · Summary

| Question | Answer |
|---|---|
| Fate of the `delete ignorable` defense | **Delete it.** alpha.2 restored retention semantics (A1-02 → A2-01 remove-then-restore ⇒ net: keep markers); stripping the marker makes readers reject the session; the line was a no-op with an inverted comment. |
| Correct producer semantics | Unknown events are readable after reload **only** with `ignorable: true` on the envelope; without it they are required-on-read and fail closed. `ignorable` is a producer omission-safety marker, not a consumer filter. |
| What `Session.append(...)` users should do | The public alpha.2 `append` has **no** `ignorable` parameter. Ordinary plugins must not persist custom third-party events this way at all — use a plugin-owned sidecar/store; a custom `append` type persists live but bricks the session on cold load (`SessionFormatUnsupportedError`). |

*Read-only analysis; no file under the fixture was modified, nothing was built, installed, or executed against a host.*
