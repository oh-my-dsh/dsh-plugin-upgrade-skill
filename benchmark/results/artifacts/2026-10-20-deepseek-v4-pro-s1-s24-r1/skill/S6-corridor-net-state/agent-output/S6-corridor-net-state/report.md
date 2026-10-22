# S6 · Corridor Net-State Judgment — Migration Report

**Target host:** dsh-v0.1.2-alpha.2 (corridor: rc.2 → alpha.1 → alpha.2)
**Subject:** "defense code" in `fixture/src/events.ts` that deletes the `ignorable` marker before `session.append(...)`
**Mode:** read-only analysis (Mode A / inspect); fixture left unchanged.

---

## 1. Decision: DELETE the defense code

**The `delete (event as any).ignorable` line must be removed.** The community comment's instruction to "keep it when migrating to alpha.2" is a trap and is contradicted by the evidence.

### 1.1 Full corridor history of this semantics

| Version | State of `SessionEvent.ignorable` | Evidence card |
|---|---|---|
| rc.2 (pre-alpha.1) | Marker present / retained on the event envelope | DSH-0.1.2-A1-02 ("temporarily removed", "alpha.1 cannot preserve the `ignorable: true` marker") |
| alpha.1 | **Removed** — marker cannot be preserved; unknown persisted events are treated as required-on-read | DSH-0.1.2-A1-02 |
| alpha.2 | **Restored** (revert of A1-02) — envelope/persistence/reload/transport retain the marker again | DSH-0.1.2-A2-01 |

The net state of the corridor (rc.2 → alpha.2) is **restored**: alpha.2 re-establishes the retention semantics that alpha.1 temporarily dropped. The rollup guidance states this exact case: for cross-version revert-style changes, fold the corridor into its net state before touching source — *"if the final target restores that semantics, defensive code in old-version adaptations should be removed rather than kept"* (canonical example is `ignorable`, removed by A1-02 and restored by A2-01).

### 1.2 Why the defense is obsolete *and* harmful on alpha.2

- **Obsolete:** the defense existed only to work around alpha.1's removal. alpha.2 restores the marker, so there is nothing to work around.
- **Harmful:** on alpha.2, an unknown persisted event **without** `ignorable: true` is *required-on-read*, so a first-party reader rejects the whole session on cold load. Actively deleting the marker (the defense) produces exactly the failure the comment claims to prevent. DSH-0.1.2-A2-01: "old adapters that keep dropping the marker will make first-party readers reject Sessions containing unknown events."
- **Also vacuous here:** the fixture's event object literal is `{ type: 'third-party/informational', payload }` — it never carries an `ignorable` key, so `delete (event as any).ignorable` deletes a property that does not exist (a no-op). The line neither adds nor removes anything.

The alpha.1 workaround itself was already wrong in spirit: the A1-02 recipe is to *temporarily stop writing the unknown event or switch to known public vocabulary*, not to strip a marker and keep writing.

---

## 2. Correct producer semantics

### 2.1 For producers of third-party persisted events (persistence/transport owners)

- `ignorable: true` belongs on the **persisted SessionEvent envelope**, and is only appropriate for *informational* events whose semantics an old reader can omit without affecting reconstruction.
- It is **not a consumer-side filtering directive**: events marked ignorable still appear in loaded events after reload; the marker only licenses a reader that does not know the type to skip it safely.
- Unknown events **without** the marker remain required-on-read (fail closed).
- JSONL, SQLite, API transports, and the generated catalog must preserve the field as-is end-to-end.
- (Card: DSH-0.1.2-A2-01)

### 2.2 What an ordinary plugin going through `Session.append(...)` should do

- The public `Session.append()` accepts only `type`, `data`, and (surface events only) `SurfaceIntent`. **It has no `ignorable` parameter and does not write the field into the event.** (API-05)
- Therefore an ordinary plugin **cannot** mark a custom event ignorable through this API, and must **not** fake it via casts, thawed objects, or hand-edited JSONL. (DSH-0.1.2-A2-01; API-05)
- On alpha.2, out-of-repo plugins should **not** persist plugin state via a custom `SessionEventMap` augmentation + `Session.append()` — use a **plugin-owned sidecar/store keyed by session id** instead. (API-05 best practice)
- Treat the producer seam as a **capability gap**, and re-evaluate only after upstream ships a supported `append(..., { ignorable: true })` or another formal mechanism that persists the omission-safety marker. Registering an event name alone is not enough; do not document the field restoration as if that capability had shipped. (API-05)

---

## 3. Evidence vs. comment (unconfirmed items)

- The decision is based on the cards, not the comment. The comment's conclusion ("keep it") is the inverse of what the corridor evidence establishes.
- **Unconfirmed:** the *exact* pre-alpha.1 (rc.2) declaration/shape of `SessionEvent.ignorable` is not reproduced in the reference cards I read; the cards establish only the direction (present → removed in alpha.1 → restored in alpha.2, A2-01 explicitly described as a revert of A1-02). I did not access the target tag's `SessionEvent` type source (outside the read allowlist), so the precise envelope field spelling is marked unconfirmed rather than asserted.
- **Unconfirmed (not re-verified here):** the concrete runtime behavior on a live alpha.2 host (cold-load refusal) is cited from the cards' verification records, not reproduced in this container. It is consistent across DSH-0.1.2-A2-01 and API-05.

### Recommended validation (if a write were later authorized)
1. Remove the `delete` line; leave the producer on a sidecar/store rather than a custom persisted SessionEvent.
2. If any custom persisted event path is retained, run a real persist → process restart/cold load test (not just a live `append` smoke) to prove the session restores or fails closed as intended.

---

### Sources cited (key point only; card IDs, not full text)
- DSH-0.1.2-A1-02 — `SessionEvent.ignorable` temporarily removed in alpha.1; compute net state via A2-01 when targeting alpha.2+.
- DSH-0.1.2-A2-01 — `ignorable` restored; marker is envelope/retention semantics, not a `Session.append` parameter; unknown unmarked events stay required-on-read.
- API-05 — `Session.append()` surface lacks `ignorable`; silent-write/loud-read cold-load failure; use a sidecar store.
- rollup-0.1.2.md — revert-style corridor: fold to net state; remove old-version defensive code when the target restores the semantics.
