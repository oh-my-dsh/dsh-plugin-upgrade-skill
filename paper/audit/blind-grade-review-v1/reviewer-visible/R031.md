# S6 · Corridor Net-State Judgment — Migration Report

Task: decide the fate of the alpha.1 "defense code" in the plugin at the fixture pack (read-only inspection), with the DSH target host at **0.1.2-alpha.2**. Method: Mode A (read-only inspect) of the dsh-plugin-upgrade skill; corridor read in full (rc.2 → alpha.1 → alpha.2), net state computed before any recommendation. Skill rule applied: "Read the full corridor first and compute the final net state. When a field is removed in an intermediate version and restored in the target, do not delete and re-add it."

## Evidence inspected

Fixture pack (READ-ONLY, unchanged):

- `environment/fixture/package.json` — `"name": "dsh-events-bench", "private": true`; test material only, not published.
- `environment/fixture/README.md` — describes the code as alpha.1 defense that `delete`s the `ignorable` marker and claims it "must be kept when migrating to alpha.2"; states the target alpha.2 restored retention semantics (DSH-0.1.2-A1-02 → DSH-0.1.2-A2-01 remove-then-restore) and that the correct action is to **delete this defense**.
- `environment/fixture/src/events.ts`:

```ts
export function produceExternalEvent(session: any, payload: any): void {
  const event = { type: 'third-party/informational', payload }
  // alpha.1 removed SessionEvent.ignorable (DSH-0.1.2-A1-02). If the marker is
  // not deleted the reader rejects it, so delete the marker before writing.
  // Keep this when migrating to alpha.2. — community comment
  delete (event as any).ignorable
  session.append(event)
}
```

(Comment text in the fixture is Chinese; translated above; the README itself annotates it "陷阱：alpha.2 已恢复保留语义，这段防御应当删除" — trap: alpha.2 restored retention semantics, this defense should be deleted.)

Corridor cards (skill references):

- **DSH-0.1.2-A1-02** (`references/v0.1.2-alpha.1.md`, rc.2→alpha.1): "`SessionEvent.ignorable` temporarily removed" — alpha.1 could not retain the marker on third-party informational events; first-party readers reject unknown persisted events as required-on-read. Recipe for alpha.1 targets: stop writing the unknown event or switch to known public vocabulary; explicitly: "If the final target is alpha.2 or later, first read DSH-0.1.2-A2-01 … do not delete the producer marker and then restore it."
- **DSH-0.1.2-A2-01** (`references/v0.1.2-alpha.2.md`, alpha.1→alpha.2): "Restore `SessionEvent.ignorable` for third-party persisted events" — alpha.2 restores the retention semantics across envelope/persistence/reload/transport. "Old adapters that keep dropping the marker will make first-party readers reject Sessions containing unknown events." Producer rule: write `ignorable: true` only for informational events an old reader can omit without affecting reconstruction; the marker is not a consumer-side filter; events remain in loaded events after reload; unknown events without the marker remain required-on-read.

## 1. Fate of the defense code: DELETE

The full-corridor net state (rc.2 → alpha.1 → alpha.2):

1. **rc.2 and earlier** — `SessionEvent.ignorable` exists; third-party informational events carry `ignorable: true`, and readers may omit their semantics on reload.
2. **alpha.1 (DSH-0.1.2-A1-02)** — the field was **temporarily removed**. alpha.1 could not retain the marker on external informational events, so unknown persisted events were treated as required-on-read and rejected the reload. This was an explicit temporary regression, not a new permanent contract.
3. **alpha.2 (DSH-0.1.2-A2-01)** — the retention semantics were **restored**. The card is typed `fix` and explicitly reverts A1-02. Dropping the marker in alpha.2 is now the bug: "old adapters that keep dropping the marker will make first-party readers reject Sessions containing unknown events."

The defense code was written against the alpha.1 intermediate state only. Its premise ("readers will reject it without deleting") is false on the alpha.2 target — on alpha.2, deleting the marker is exactly what makes the event `required-on-read`, so any session log containing `third-party/informational` written by this code fails closed on reload with an unknown-required event. A1-02 also forbids the delete-then-restore pattern outright: "do not delete the producer marker and then restore it."

**Verdict: delete the `delete (event as any).ignorable` line and the comment.** Do not replace it with `event.ignorable = true` inside this function either — see §2 for the producer seam. The comment's instruction to "keep this when migrating to alpha.2" is a community-comment trap; the card chain (A1-02's own "temporarily removed" wording and A2-01's revert) overrides the comment. Per the brief's rule, decision is by evidence (the two reviewed corridor cards and the alpha.2 restore decision note they cite), not by the in-code comment.

## 2. Correct producer semantics, and what an ordinary plugin via `Session.append(...)` should do

- **Semantics of the marker** (A2-01): `ignorable: true` marks an informational event whose semantics an old reader may omit without affecting reconstruction. It is not a consumer-side filtering directive; the event stays in loaded events after reload. Unknown events **without** the marker are required-on-read and must fail closed (unknown required events must be rejected — this is the verification clause of both A1-02 and A2-01).
- **Public API gap**: A2-01 states explicitly that "the public live `Session.append(...)` still has no `ignorable` parameter". So an ordinary plugin that only has `session.append(event)` **cannot legitimately set the marker**. The required action for the fixture's `produceExternalEvent` is:
  1. Delete the `delete (event as any).ignorable` line (it actively manufactures the required-on-read hazard on alpha.2).
  2. Do **not** fake the field via a cast (`(event as any).ignorable = true`) — A2-01: ordinary plugins with only this API "should mark the producer seam as a capability gap rather than faking a public entry via cast."
  3. Record the capability gap: this producer needs either a public append API that accepts the envelope marker, or ownership of a persistence/envelope seam (JSONL/SQLite/API transports must preserve the field as-is per A2-01). Until then, either accept that the event is required-on-read, or stop emitting that unknown persisted event on hosts where fail-closed rejection of the log is unacceptable (the A1-02 fallback posture).
- **Verification** (from A2-01): in a test owning the persistence seam, an unknown event with `ignorable: true` survives reload in loaded events and old readers omit it; an unknown event without the marker is rejected; a plain `Session.append` is not documented as supporting the field. Note the alpha.2 SQLite provider accepts only schema 20 (rejects schema 19 without auto-migration) — backup/export before upgrading persistence homes.

## 3. Evidence basis and unconfirmed items

Confirmed by pack + reviewed corridor cards:

- alpha.1 removed the field temporarily (A1-02, wording "temporarily removed"); alpha.2 restored retention (A2-01, type `fix`, "revert of DSH-0.1.2-A1-02"); both cite the same alpha.2 decision note `.agents/notes/implemented/architecture/2026-08-30-retain-ignorable-external-session-events.md`.
- The fixture comment's claim ("must be kept for alpha.2") contradicts both cards and the fixture's own README, which pre-annotates the comment as a trap.

Unconfirmed (closed-book brief; no host source available in the fixture):

- The exact current shape of the public `Session.append` signature on the alpha.2 tag (parameter list beyond "no `ignorable` parameter") — taken from A2-01's statement only.
- Whether any host-internal/privileged seam currently exists that a third-party plugin may legitimately use to set the marker — A2-01 implies persistence/envelope-seam owners can, but the concrete API was not verifiable from the pack.
- Whether `third-party/informational` events written by this alpha.1-era defense already exist in real session logs of the deployment — out of scope for a source-only, read-only review; if they do, those entries are required-on-read on alpha.2 and would need log-level remediation (unconfirmed, not assessable here).

No files were modified; the fixture pack is unchanged.
