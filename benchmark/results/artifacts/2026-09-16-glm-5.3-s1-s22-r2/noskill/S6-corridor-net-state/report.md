# S6 · Corridor Net-State Judgment — Migration Report (alpha.1 → alpha.2)

## Verdict up front

**Delete the defense code.** The `delete (event as any).ignorable` line (and its
comment) in `src/events.ts` is alpha.1-only residue. Under the alpha.2 target host it
is not merely dead code — it actively strips the very marker that the restored
retention semantics rely on, converting an intentionally-skippable third-party event
into one that conforming readers must either reject or hard-fail on. The comment's
claim that it "must be kept when migrating to alpha.2" is the trap; it is false.

## Evidence

Sources consulted (read-only, in-fixture only, per the closed-book scope):

1. `fixture/src/events.ts` — the defense code itself:

   ```ts
   const event = { type: 'third-party/informational', payload }
   // alpha.1 移除了 SessionEvent.ignorable（DSH-0.1.2-A1-02）。不删 marker 会被
   // reader 拒绝，所以这里先把 marker 删掉再写。迁移到 alpha.2 时这段要继续
   // 保留。——社区注释（陷阱：alpha.2 已恢复保留语义，这段防御应当删除）
   delete (event as any).ignorable
   session.append(event)
   ```

   Note the comment itself is self-defeating: its own parenthetical concedes that
   "alpha.2 已恢复保留语义，这段防御应当删除" (alpha.2 restored the retention
   semantics; this defense should be deleted). The leading sentences — the ones a
   maintainer skims — are the false part.

2. `fixture/README.md` — states the version-corridor history explicitly:
   alpha.2 **restored** the retention semantics
   (`DSH-0.1.2-A1-02` → `DSH-0.1.2-A2-01`, remove-then-restore), and confirms the
   correct action is to delete the defense.

3. Host-side corroboration (outside the fixture, flagged as such): the DSH
   repository's current architecture instructions state that `SessionEventMap`
   members are required-on-read by default, and builds that do not know an event
   type refuse the log **unless the event carries the envelope's `ignorable: true`**.
   That is precisely the restored alpha.2 semantics: `ignorable` exists again and is
   the sanctioned mechanism for third-party/informational events to survive
   unknown-type readers.

## 1. Fate of the defense code across the version corridor

Full history of the `ignorable` semantics as evidenced:

| Corridor step | `SessionEvent.ignorable` | Consequence for this code |
|---|---|---|
| Pre-alpha.1 (and alpha.2, `DSH-0.1.2-A2-01`) | Present; carrying `ignorable: true` on the envelope lets readers skip unknown event types | The marker is **required** for a third-party informational event to be safely persisted; deleting it is harmful |
| alpha.1 (`DSH-0.1.2-A1-02`) | Temporarily removed | A marker-bearing event could be rejected by readers that no longer knew the field; deleting it before append was a plausible (if brittle) local workaround |
| alpha.2 (target) | Restored (remove-then-restore) | The workaround's premise is gone; the `delete` now removes a legitimate field |

The defense was a **net-state judgment pinned to alpha.1's transient removal**. It was
never a durable invariant: its correctness depended on the host's transient state of
having dropped the field. Once alpha.2 restored the field, the code inverted from
protective to destructive. Keeping it — as the comment instructs — would mean every
event this plugin appends loses its opt-out marker, so any reader build that does not
know `third-party/informational` will refuse the log (or the plugin's events get
rejected), i.e. exactly the failure the defense claimed to prevent.

**Action for the migration: remove the `delete` line and the entire comment.** The
migrated producer should be simply:

```ts
export function produceExternalEvent(session: any, payload: any): void {
  session.append({ type: 'third-party/informational', payload })
}
```

## 2. Correct producer semantics under alpha.2

- `ignorable` is part of the **event envelope semantics**, not a per-call knob the
  producer mutates. It declares "readers that do not know this event type may skip
  it" — required-on-read is the default; `ignorable: true` is the documented opt-out.
- For a typed, merged event (`declaration merging` into `SessionEventMap`), the
  event's JSDoc/metadata declares `ignorable`; the plugin does not hand-edit the
  marker on the object it passes to `append`.
- **What an ordinary plugin going through `Session.append(...)` should do: nothing.**
  The public `Session.append` API surface does not expose an `ignorable` parameter
  (the hint in the brief, consistent with the fixture: the code has to reach for
  `delete (event as any).ignorable` precisely because there is no legitimate way to
  set or unset it at the call site). The producer's job is to supply `type` plus the
  event's payload; envelope-level concerns — including `ignorable` — belong to the
  event-type declaration, not to call-site mutation.
- Therefore the alpha.1-era pattern of "scrub the marker before appending" is wrong
  on two axes under alpha.2: it fights the envelope semantics, and it does so through
  an `any`-cast back door that the public API deliberately does not offer.

## 3. Confidence and unverified items

- **Confirmed by fixture evidence:** alpha.1 removed `ignorable`
  (`DSH-0.1.2-A1-02`); alpha.2 restored it (`DSH-0.1.2-A2-01`); the correct
  migration action is deletion of the defense. Both `README.md` and the comment's
  own parenthetical agree.
- **Corroborated outside the fixture** (host repo instructions, cited as context
  only): required-on-read default with `ignorable: true` as the skip mechanism.
- **Unconfirmed (closed-book limitation):** the exact shape of the alpha.2
  `Session.append` signature and of the envelope field (literal `ignorable: true`
  vs. declaration-merge metadata) — no alpha.2 type sources exist inside the
  fixture. I did not consult network or system directories per the brief. The
  conclusion (delete the defense; producers pass plain event objects) does not
  depend on which of those two shapes alpha.2 uses.

## Bottom line

Decide by evidence, not by the comment: the comment was written against alpha.1's
temporary removal and its migration advice is the planted fallacy. Delete the
defense, append the plain event, and leave `ignorable` to the event-type
declaration layer that alpha.2's restored semantics provide.
