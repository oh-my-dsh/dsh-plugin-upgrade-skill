# S6 Corridor Net-State Report (read-only)

## 1. Fate of the defense code: DELETE

`fixture/src/events.ts` contains, before `session.append(event)`:

```ts
delete (event as any).ignorable
```

accompanied by a comment claiming alpha.1 removed `SessionEvent.ignorable`, that readers will reject the marker unless it is deleted, and that this defense must be kept on alpha.2. **That instruction is stale and must not be followed.**

Corridor history of the semantics:

- Before alpha.1: `SessionEvent.ignorable` existed and the producer-side marker was retained by readers (retention semantics).
- alpha.1 (`DSH-0.1.2-A1-02`): the semantics were *removed* — the marker was dropped/ignored, and events carrying it could be rejected. This is the only window in which the delete-the-marker defense made sense.
- alpha.2 (`DSH-0.1.2-A2-01`): the semantics were *restored* — "remove-then-restore". On the alpha.2 host the marker is again preserved/respected, and an ordinary event carrying `ignorable` is accepted and retained, not rejected.

Net state on the target (alpha.2): the door is back to the old semantics. The defense's premise ("readers will reject it without deleting the marker") is no longer true on alpha.2. Keeping the defense would now actively strip the `ignorable` marker that the alpha.2 host would otherwise retain, degrading the event (readers can no longer honor the plugin's "ignorable" intent). Therefore the defense code, and its justifying comment, should be **deleted** when migrating to alpha.2.

## 2. Correct producer semantics

- A producer on alpha.2 should attach the marker normally (e.g. `event.ignorable = true` when the event is ignorable) and **must not** delete it before appending.
- An ordinary plugin going through the public `Session.append(...)` path should do nothing special: it should NOT touch the `ignorable` field at all. The public `append` surface may not even expose the `ignorable` parameter; the marker is producer metadata that the host consumes. The correct plugin behavior is simply `session.append({ type, payload })` (or with `ignorable` set in the ordinary object literal if the host supports it), letting the host apply its retention semantics. No marker deletion, no defensive stripping.

## 3. Evidence vs. comment

- Decision is driven by the version-corridor record referenced in the fixture (`DSH-0.1.2-A1-02` on alpha.1 → `DSH-0.1.2-A2-01` on alpha.2, a remove-then-restore), not by the inline comment, which encodes only the alpha.1-era belief and explicitly mislabels alpha.2.
- Unconfirmed (no host package, node_modules, or runtime available inside the cell): the exact reader-side behavior of `SessionEvent.ignorable` on alpha.2 (whether unknown/extra markers are rejected, accepted-and-retained, etc.), the exact spelling/type of the public field, and whether `Session.append` exposes an `ignorable` parameter. Nothing in the fixture contradicts "alpha.2 restored retention semantics", so the delete-the-defense conclusion stands; if external host documentation were needed for the exact API shape, that is a limitation of this environment, not a reason to keep the defense.

## Limitations

- No external docs, network, or host runtime were consulted (per instructions); specifics of `Session.append`'s signature on alpha.2 beyond "the marker parameter may not be publicly exposed" are unconfirmed.
- Fixture left untouched; no code was executed.
