# Migration Report · S6 Corridor Net-State Judgment

Target host: **alpha.2**. Fixture analyzed read-only at `environment/fixture/` (`README.md`, `package.json`, `src/events.ts`). Nothing under the fixture was modified.

## 1. Fate of the defense code: DELETE it

The defense in `src/events.ts`:

```ts
delete (event as any).ignorable
session.append(event)
```

It must be **removed** when migrating to alpha.2. Reasoning across the version corridor:

- **alpha.1** (change id `DSH-0.1.2-A1-02`): `SessionEvent.ignorable` was temporarily removed. In that window the defensive `delete` was arguably harmless-to-necessary bookkeeping, since the marker itself had no defined meaning.
- **alpha.2** (change id `DSH-0.1.2-A2-01`): the retention semantics were **restored** — the fixture `README.md` states this explicitly: "The target alpha.2 restored the retention semantics (DSH-0.1.2-A1-02 → DSH-0.1.2-A2-01 remove-then-restore) — **the correct action is to delete this defense**."

Under restored semantics, the corridor is remove-then-restore: the alpha.1 removal was temporary, not a permanent contract change. Keeping the `delete` on alpha.2 actively destroys information: it strips an `ignorable` marker from a persistent event before it is written, so an event that should be readable-by-default becomes (or fails to declare itself as) ignorable contrary to intent, and the marker can never be recovered from the log. The community comment's claim — "不删 marker 会被 reader 拒绝" (readers will reject it unless the marker is deleted) and "迁移到 alpha.2 时这段要继续保留" (keep this when migrating to alpha.2) — is wrong for alpha.2 and is even self-flagged in the comment itself as a trap: "（陷阱：alpha.2 已恢复保留语义，这段防御应当删除）". Per the brief, decide by evidence, not by the comment; the evidence (README change ids and the comment's own trap annotation) both point to deletion.

Concretely: delete the line `delete (event as any).ignorable` and the accompanying alpha.1 comment from `src/events.ts`.

## 2. Correct producer semantics on alpha.2

- Under alpha.2's restored semantics, `SessionEvent.ignorable` is again a defined part of the event envelope: log readers accept any event type, and the `ignorable` flag controls read-time treatment (an event marked `ignorable: true` may be skipped/ignored by consumers that do not know the type; unmarked events are required-on-read). This matches the harness invariant that builds which do not know a type refuse the log unless the event carries the envelope's `ignorable: true`.
- A producer therefore must **not mutate or delete** envelope fields. Write the event with exactly the envelope it intends. For the fixture's third-party informational event, if the producer wants readers of older/unknown builds to tolerate it, it should explicitly set `ignorable: true`; if it must be strictly replayed, leave the flag unset/absent rather than actively deleting it.
- Going through the ordinary public API `session.append(...)`: the public surface generally does not expose the `ignorable` parameter directly to third-party producers (the brief hints "the public API surface may not even have that parameter"). If `append` does not accept `ignorable`, the ordinary plugin's correct action is simply `session.append(event)` with a well-formed payload and **no envelope surgery at all** — the platform owns envelope fields, and the alpha.1-era `delete` has no legitimate replacement. Any need to mark an event ignorable would have to go through the platform's supported typing/envelope mechanism, not a pre-write `delete` (exact availability of an `ignorable` option on `append` in alpha.2: **unconfirmed** — the fixture pack contains no API signature to verify it against).

## 3. Evidence basis and unconfirmed items

Evidence used (all from the fixture pack):
- `environment/fixture/README.md`: names the corridor `DSH-0.1.2-A1-02 → DSH-0.1.2-A2-01` (remove-then-restore), states "the correct action is to delete this defense".
- `environment/fixture/src/events.ts`: the defense itself and the community comment, including its own trap annotation admitting alpha.2 restored retention semantics.
- `environment/fixture/package.json`: `"private": true` — test material only, not executed or published.

Unconfirmed (closed-book limits):
- The exact alpha.2 public signature of `session.append(...)` (whether an `ignorable` option exists for producers) — not present in the fixture pack.
- The precise reader rejection behavior described in the comment for alpha.1 — no alpha.1 reader source is in the pack; the comment's claim is taken as narrative only and was not verified.

Bottom line: **delete the defense**; producers write well-formed events via `session.append(...)` and never strip envelope markers; on alpha.2 the `delete` is both unnecessary (readers no longer reject unmarked third-party events) and harmful (it destroys the restored retention signal).
