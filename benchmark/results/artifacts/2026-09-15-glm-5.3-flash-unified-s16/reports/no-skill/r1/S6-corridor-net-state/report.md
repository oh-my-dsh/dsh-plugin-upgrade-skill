# Migration Report — S6 · Corridor Net-State Judgment

- Target host: **alpha.2**
- Fixture analyzed read-only: `fixture/` (untouched; `git` working tree clean, unchanged relative to HEAD)
- Files examined:
  - `fixture/src/events.ts` — the "defense code" under review
  - `fixture/README.md` — task-specific copy documenting the version corridor
  - `fixture/package.json` — test-only package (`"private": true`, ESM)

---

## 1. Fate of the defense code: **DELETE it**

```ts
// fixture/src/events.ts (current, alpha.1-era)
export function produceExternalEvent(session: any, payload: any): void {
  const event = { type: 'third-party/informational', payload }
  delete (event as any).ignorable   // <-- delete this line
  session.append(event)
}
```

### Reasoning — full history of the semantics across the version corridor

| Phase | State of `SessionEvent.ignorable` retention semantics | Consequence for producers |
|---|---|---|
| Baseline (pre-alpha.1) | Marker exists and events carrying it are accepted and retained (inferred from the "restore" wording; see Unconfirmed) | No producer-side stripping needed |
| **alpha.1** — `DSH-0.1.2-A1-02` | Marker **temporarily removed** from the `SessionEvent` contract | A persisted third-party event carrying the stale marker could be treated as invalid and rejected by readers. The defense — `delete (event as any).ignorable` before `append` — was a rational **window-of-time workaround** for that window only |
| **alpha.2 (target)** — `DSH-0.1.2-A2-01` | Retention semantics **restored** (`A1-02 → A2-01` remove-then-restore corridor completed) | The failure mode the defense guards against no longer exists. `ignorable` is again a legitimate, retained part of the event contract |

The defense is therefore **version-locked to alpha.1**. The corridor is remove-then-restore: whatever justified the strip existed only inside the alpha.1 window and was undone by the very next step of the corridor. Carrying it forward to alpha.2:

1. **Contradicts the restored contract** — it actively strips a legitimate marker if one is ever present on an event, fighting the host's restored retention semantics instead of relying on them;
2. **Propagates a false claim** — the in-code comment asserts "this must be kept when migrating to alpha.2", which the corridor history disproves; keeping the code keeps the misinformation;
3. Is, as written, **a no-op anyway** — the event literal `{ type: 'third-party/informational', payload }` never has an `ignorable` property, so `delete (event as any).ignorable` removes nothing. Even in alpha.1, this exact line guarded nothing unless the literal were later changed to carry the marker. (This weakens the comment's own story, but the verdict rests on the corridor, not on this observation.)

This conclusion is decided by the documented corridor evidence (`DSH-0.1.2-A1-02` removal cited in the code comment; `DSH-0.1.2-A1-02 → DSH-0.1.2-A2-01` remove-then-restore and "the correct action is to delete this defense" stated in `fixture/README.md`) — **not** by the community comment, which is the documented trap. Notably, even the comment's own bracketed annotation concedes the defense should be deleted; but the load-bearing evidence is the remove-then-restore corridor, not either comment.

### Recommended change (not applied — fixture is read-only)

```ts
export function produceExternalEvent(session: any, payload: any): void {
  session.append({ type: 'third-party/informational', payload })
}
```

Remove the `delete` line and the stale alpha.1-era comment block in their entirety. Do not merely neutralize the line; leaving the comment would keep the trap in the codebase for the next migration.

---

## 2. Correct producer semantics

**Producers do not manage `ignorable`.** The marker belongs to the (restored) `SessionEvent` contract owned by the host: whether an event is ignorable is a reader/host-facing classification, not something a third-party producer enforces or strips by mutating the event object before handing it over.

What an ordinary plugin going through `Session.append(...)` should do:

1. **Append the payload plainly** — `session.append(event)` with the event's own fields (`type`, `payload`, …);
2. **Touch nothing else** — do not `delete ignorable`, and do not set `ignorable` by hand on the object;
3. **Do not work around the API** — per the hint, the public alpha.2 `Session.append(...)` surface does not even expose an `ignorable` parameter. That is consistent with the marker being host-controlled: if the host classifies some events as ignorable, it does so through its own machinery, not through producer-supplied fields. Since the parameter is absent from the public surface, a plugin **cannot and should not** request ignorable status via `append(...)`; treating that as "unavailable" is the correct behavior rather than hacking the marker onto the object. (If a producer genuinely needs ignorable events, that would require a documented host API — none is present in the fixture; see Unconfirmed.)

On alpha.2 there is additionally **nothing to defend against**: with retention semantics restored, an event without the marker is a normal persistent event, and the presence of the marker (when the host sets it) is accepted and retained — readers do not reject it.

---

## 3. Evidence basis

**Verified from the fixture (read-only inspection):**

- The defense exists exactly as described: `delete (event as any).ignorable` immediately before `session.append(event)` — `fixture/src/events.ts:6`.
- The alpha.1 removal is referenced in the code comment as `DSH-0.1.2-A1-02`; the corridor `DSH-0.1.2-A1-02 → DSH-0.1.2-A2-01` (remove-then-restore) and the statement "the correct action is to delete this defense" are documented in `fixture/README.md`.
- The freshly created event literal never carries `ignorable`, so the `delete` is a no-op as written (`fixture/src/events.ts:2,6`).
- The comment instructs keeping the defense for alpha.2; this is contradicted by the corridor documented in the README — the comment is the trap, and the verdict does not rest on it.
- Fixture integrity preserved: no file under `fixture/` was modified; `git` working tree clean.

**Unconfirmed (closed-book brief; not guessed):**

- The exact upstream text of changelog entries `DSH-0.1.2-A1-02` and `DSH-0.1.2-A2-01` — only their IDs and the remove-then-restore characterization are available via the fixture.
- The exact alpha.2 public signature of `Session.append(...)` — whether any ignorable-related parameter exists in any form (the hint says it likely does not; treated as unavailable per the hint, but the signature itself was not verifiable).
- Whether alpha.1 readers actually rejected events carrying the stale `ignorable` field — asserted only by the community comment; plausible for a marker removed from the contract, but not independently verifiable.
- The precise pre-alpha.1 baseline semantics — inferred from the word "restored" in the README; baseline details unconfirmed.

---

## Summary

| Question | Answer |
|---|---|
| Fate of the defense code | **Delete** the `delete (event as any).ignorable` line and its comment entirely |
| Why | alpha.1-only workaround (`DSH-0.1.2-A1-02` removed the marker); alpha.2 (`DSH-0.1.2-A2-01`) restored retention semantics, so the guarded failure mode no longer exists — remove-then-restore corridor |
| Correct producer semantics | Producers do not manage `ignorable`; append plainly via `Session.append(...)`, never stripping or setting the marker by hand |
| Role of the hint | The public `append(...)` surface has no ignorable parameter — ignorable classification is host-controlled; the plugin should do nothing about it (exact signature unconfirmed) |
| Decision basis | Corridor evidence in the fixture README + code, explicitly **not** the community comment (documented trap) |
