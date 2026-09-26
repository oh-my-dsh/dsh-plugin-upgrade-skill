# S6 · Corridor Net-State Judgment — Migration Report

Task: read-only analysis of the fixture plugin's "defense code" against target host 0.1.2-alpha.2, under the plugin-upgrade skill (Mode A · inspect; no files modified, fixture untouched).

## Fixture evidence

Fixture package: dsh-events-bench 0.1.0 (private, ESM), single source file src/events.ts (8 lines):

- export produceExternalEvent(session, payload) builds { type: 'third-party/informational', payload }, then the expression `(event as any).ignorable` is deleted, then session.append(event) is called.
- The comment (lines 3–5) claims: "alpha.1 removed SessionEvent.ignorable (DSH-0.1.2-A1-02); without deleting the marker readers will reject it, so delete it before writing; this must be kept when migrating to alpha.2." The comment itself also flags this as a trap ("陷阱：alpha.2 已恢复保留语义，这段防御应当删除"), which is a hint, not evidence — the decision below is derived from the corridor cards.

## 1. Fate of the defense code: DELETE it

Corridor history (read via the skill's references/README.md corridor index, then the two relevant card files — full corridor rc.2 → alpha.2 computed before judging, per the net-state rule):

- 0.1.1-rc.2 → 0.1.2-alpha.1 — DSH-0.1.2-A1-02 (breaking; action level required-if-target-is-alpha.1): alpha.1 temporarily removed the SessionEvent.ignorable marker. The card's own migration recipe says: if the target is exactly alpha.1, do NOT build a consumer whitelist — that would wrongly let required events through; stop writing the unknown persisted event or switch to public event vocabulary the target version knows. Critically, it adds: "If the final target is alpha.2 or later, first read DSH-0.1.2-A2-01 to compute the corridor net state; do not delete the producer marker and then restore it."
- 0.1.2-alpha.1 → 0.1.2-alpha.2 — DSH-0.1.2-A2-01 (fix, required-if-hit): alpha.2 RESTORED the retention semantics for third-party persisted events (envelope/persistence/reload/transport all preserve the field as-is; unknown events without the marker remain required-on-read). Source: the alpha.2 architecture note "retain ignorable external session events" plus the alpha.2 release notes.

Net state across the corridor: the field was removed in the intermediate version (alpha.1) and restored in the target (alpha.2) — a remove-then-restore pair explicitly cross-referenced by both cards. Per the corridor rule ("if a field is removed in an intermediate version and restored in the target, do not delete and re-add it"), the final state matches the pre-alpha.1 semantics. The alpha.2 card states the consequence directly: "old adapters that keep dropping the marker will make first-party readers reject Sessions containing unknown events."

Therefore the defense code must be DELETED. Keeping it on alpha.2 is not neutral: dropping the marker turns an ignorable informational event into a required-on-read unknown event, which makes first-party readers reject reload of sessions containing it — the exact failure the defense was written to avoid, reintroduced by the defense itself. The comment's instruction to "keep this when migrating to alpha.2" was reasoned against an intermediate version's semantics (per-card thinking, not corridor net state) and is wrong. The fixture README states the same expected outcome, consistent with the card evidence.

## 2. Correct producer semantics on alpha.2

From DSH-0.1.2-A2-01:

- Producers write the marker only for informational events whose semantics an old reader can omit without affecting reconstruction. It is not a consumer-side filtering directive, and ignorable events remain in loaded events after reload.
- The public live Session.append(...) has no ignorable parameter. An ordinary plugin going through the public API surface cannot (and should not) set the field — it must mark the producer seam as a capability gap rather than fake a public entry via a cast.
- Retention of the field is the responsibility of the persistence/transport integrations: JSONL, SQLite, API transports, and the generated catalog must carry the field as-is. Explicitly setting ignorable: true applies in manual envelope/seed setups or tests that own a persistence seam — not at the public append call site.

Corrected producer behavior for this fixture: write the event through the public API and touch no marker — delete the `delete (event as any).ignorable` line entirely. The object literal never sets ignorable, so after removing the defense there is no cast and no marker manipulation left. If the plugin genuinely needs old readers to be able to omit its informational events, that is a public-API capability gap to report upstream, not something to work around with `as any`.

Deployment-side caveat from the same card: the alpha.2 SQLite Session-persistence provider accepts only schema 20 (schema 19 is rejected, no auto-migration) — back up/export or rebuild before upgrading. Relevant to deployment, not to this code change.

## 3. Evidence basis, skipped items, and unconfirmed points

- The decision is grounded in the primary corridor cards DSH-0.1.2-A1-02 (references/v0.1.2-alpha.1.md) and DSH-0.1.2-A2-01 (references/v0.1.2-alpha.2.md), both citing the alpha.2 architecture decision note and the alpha.2 release notes; the corridor was connected via from/to metadata, never filename order.
- Confirmed: the remove-then-restore pair; the corridor net-state instruction inside A1-02 itself; that public Session.append has no ignorable parameter on alpha.2; that keeping the defense is actively harmful on alpha.2.
- Unconfirmed: closed-book brief with no network access — the exact alpha.2 TypeScript declaration of SessionEvent (optional/branded field shape) is taken from the cards, not verified from tag source. Whether anything else depends on the marker being absent: within the fixture, nothing — produceExternalEvent is the only function and nothing consumes the event.
- Skipped (non-hits): the remaining corridor cards (A1-01, A1-03…A1-32, A2-02…A2-10) do not intersect this fixture's single touchpoint (session events, class #2) or its packaging; the fixture declares no DSH dependencies, so no dependency-cohort work applies. A Mode C pre-migration baseline (build/typecheck/tests) was not run — read-only brief forbids executing package scripts; "pre-existing: not collected".

## Recommended change (for the maintainer; not applied — read-only task)

1. Delete the `delete (event as any).ignorable` line and the misleading comment block; append the event directly.
2. Do not add ignorable: true at this call site — public Session.append has no such parameter on alpha.2; file the capability gap upstream if guaranteed-ignorable third-party informational events are required.
3. If a migration ever targets alpha.1 (the intermediate version), the correct action per A1-02 is to stop writing the unknown persisted event or switch to known public event vocabulary — not to strip the marker.
