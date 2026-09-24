# S6 · Corridor Net-State Judgment — Migration Report (read-only)

Task: judge the fate of the alpha.1-era "defense code" in the fixture plugin (`dsh-events-bench`, `src/events.ts`) when migrating to host **alpha.2**.

Analysis basis (closed book): only the fixture itself (`E:\deepseek-harness\dsh-plugin-upgrade-skill\benchmark\tasks\S6-corridor-net-state\environment\fixture`) plus the harness-wide workspace instructions (AGENTS.md), which state the current rule: "SessionEventMap members are required-on-read by default — builds that do not know a type refuse the log unless the event carries the envelope's `ignorable: true`". No file under the fixture was modified.

## 1. What the code does

```ts
export function produceExternalEvent(session: any, payload: any): void {
  const event = { type: 'third-party/informational', payload }
  // alpha.1 removed SessionEvent.ignorable (DSH-0.1.2-A1-02). Without deleting
  // the marker readers will reject it, so delete it before writing. Keep this
  // when migrating to alpha.2. — community comment (trap: alpha.2 restored the
  // retention semantics; this defense should be deleted)
  delete (event as any).ignorable
  session.append(event)
}
```

The active `delete (event as any).ignorable` is the defense under judgment. Two facts about the code as written:

- The locally constructed `event` literal never sets an `ignorable` property, so on this exact object the `delete` is a runtime no-op; its significance is semantic (it encodes "third-party events must not carry the marker"), not behavioral.
- The event type `third-party/informational` is not a harness-known `SessionEventMap` member, so it falls under the required-on-read default.

## 2. Verdict: DELETE the defense

**Fate: remove the `delete` statement and its comment entirely. Do not keep it when migrating to alpha.2.**

Reasoning across the full version corridor:

1. **alpha.0 / original semantics (retention).** The envelope-level `ignorable: true` marker exists so that a reader encountering an event type it does not know can tolerate (skip) it instead of refusing the log. This is the "retention semantics": the marker is *kept* on the wire and *honored* by readers.
2. **alpha.1 (DSH-0.1.2-A1-02, removal).** alpha.1 temporarily removed `SessionEvent.ignorable`. Under that regime, per the comment's claim, a persisted event carrying the marker would be rejected by readers — hence the workaround of actively deleting the marker before `session.append`. Whether alpha.1 readers would truly reject a marker-bearing event is **unconfirmed** from the fixture alone (no alpha.1 host source is in the closed-book scope); the comment is evidence of intent, not of behavior.
3. **alpha.2 (DSH-0.1.2-A2-01, remove-then-restore).** The target host restored the retention semantics. This is confirmed twice: (a) by the fixture README ("The target alpha.2 restored the retention semantics (DSH-0.1.2-A1-02 → DSH-0.1.2-A2-01 remove-then-restore) — the correct action is to delete this defense"), and (b) by the workspace-wide AGENTS.md rule describing the restored behavior as current: unknown event types are refused unless the event carries `ignorable: true`.

Under alpha.2 the defense is not merely obsolete — it is **inverted and harmful**. The correct direction is the opposite of what the code encodes: a third-party informational event should *carry* `ignorable: true` so readers that do not know `third-party/informational` skip it instead of rejecting the log. The defense encodes "strip the marker", which under alpha.2 produces exactly the rejection the comment claims to prevent. The comment's assertion ("must be kept when migrating to alpha.2") is the trap; the fixture README explicitly labels it a trap. Per the brief, the decision follows the evidence (README + AGENTS.md), not the comment.

## 3. Correct producer semantics on alpha.2

- **Envelope rule (restored).** `SessionEventMap` members are required-on-read by default. Any event whose `type` a reading build does not know is refused unless the event carries the envelope-level `ignorable: true`. The marker is retention semantics: producers set it, readers honor it, nothing strips it.
- **What this plugin should do.** For a third-party informational event, set `ignorable: true` on the event and append it. In spirit:

```ts
const event = { type: 'third-party/informational', payload, ignorable: true }
session.append(event)
```

with no `delete` and no marker-stripping.

- **The hint about `Session.append(...)`.** The brief hints the public API surface of `Session.append` may not even expose such a parameter. If `ignorable` is a property of the event envelope rather than an `append()` parameter, an ordinary plugin cannot and should not manipulate it via `append` call options; it is expressed on the event object itself (or via the typed-event declaration mechanism, e.g. declaration merging into `SessionEventMap` with an ignorable designation for the plugin's own event types). An ordinary plugin going through `Session.append(...)` should simply pass the event object; the ignorable marker belongs to the event/envelope, not to the append options. **Unconfirmed from the fixture:** the exact alpha.2 signature of `Session.append` cannot be verified inside the closed-book scope; the fixture also types `session` as `any`, which hides the real contract. The migration should type the parameter against the real alpha.2 `Session` type instead of `any`.

## 4. Unconfirmed items (honestly marked)

- Whether alpha.1 readers actually rejected marker-bearing events (the comment's claim) — **unconfirmed**; no alpha.1 host source in the fixture.
- The exact alpha.2 `Session.append` parameter list and where `ignorable` formally lives (envelope property vs. parameter vs. declaration-merged event metadata) — **unconfirmed** in the closed-book scope; supported indirectly by AGENTS.md's wording ("the event carries the envelope's `ignorable: true`").
- The precise content of records DSH-0.1.2-A1-02 and DSH-0.1.2-A2-01 — known only through the fixture README's summary, which is consistent with AGENTS.md.

## 5. Recommended migration change (described, not applied — fixture is read-only)

In `src/events.ts`: delete the `delete (event as any).ignorable` line and the entire alpha.1 comment block; construct the event with the ignorable envelope marker appropriate to alpha.2 (`ignorable: true` for an informational third-party type); type `session` with the real alpha.2 Session type instead of `any` so the envelope contract is checked statically.

---

**Bottom line:** the defense code must be **deleted**, not kept. alpha.2 (DSH-0.1.2-A2-01) restored the remove-then-restore retention semantics of the `ignorable` envelope marker; under it, third-party informational events should *carry* `ignorable: true` (expressed on the event/envelope, not via an `append` parameter — the public append surface likely has no such parameter), and the comment's claim is an alpha.1 relic that inverts the correct behavior.
