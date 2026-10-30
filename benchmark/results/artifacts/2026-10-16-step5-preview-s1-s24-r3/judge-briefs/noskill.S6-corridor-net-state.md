# JUDGE BRIEF · noskill.S6-corridor-net-state

## Criteria (sealed rubric)
- [corridor-net-state] (25pt) Explain alpha.1 removal followed by alpha.2 restoration of SessionEvent.ignorable retention, applying the final alpha.2 state to produceExternalEvent in src/events.ts. Correct version history is required; bare A1-02/A2-01 card names earn no credit, and equivalent history without card IDs is acceptable.
- [remove-marker-stripping] (25pt) Locate delete (event as any).ignorable and reject the comment prescribing continued stripping on alpha.2. Recommend removing that defense and correcting its obsolete rationale. Distinguish removing the stripping code from removing the marker itself. It is valid to note that the shown literal currently has no marker, so the delete is a no-op, while still rejecting the intended stripping policy.
- [informational-producer] (25pt) Explain that only informational events whose semantics old readers may omit without breaking reconstruction can carry ignorable:true; required events must not be made ignorable. Retention across persistence/reload is not a reader-side filtering instruction: marked events remain in the loaded log. Apply this to the third-party/informational producer while respecting the live append limitation.
- [public-append-gap] (25pt) Identify the public live Session.append capability gap: it has no supported ignorable parameter. Ordinary plugins must not fake an entry with a cast, invented argument or unsupported API. Explicitly defer the exact producer/persistence integration pending target API verification; naming an undocumented successor is not required. Proposed retention/required-event checks are valid but actual execution is not required.

## Caps (score ceilings; judge returns each with triggered true/false)
- CAP [keep-stripping-marker] ceiling=10 Trigger only when the final recommendation affirmatively keeps the alpha.1 defense or continues deleting the marker on alpha.2. Negating that recommendation, quoting the old code for diagnosis, or removing the delete statement does not trigger it. Read the entire sentence and conclusion, including double negation and later contradictions.

## Candidate report(s)
#### FILE: S6-corridor-net-state/S6-corridor-net-state.md

# S6 · Corridor Net-State Migration Report

**Subject:** `src/events.ts` — the `SessionEvent.ignorable` "defense code"
**Corridor:** alpha.1 → **alpha.2** (target host = alpha.2)
**Scope:** read-only analysis of `fixture/`; fixture left byte-for-byte unchanged.

---

## 1. Verdict (up front)

**DELETE the defense.** When migrating to alpha.2, remove the line

```ts
delete (event as any).ignorable
```

together with its comment. Do **not** keep it, despite what the code comment asks for. The comment is self-labeled as a trap (see §4) and its premise is false on the alpha.2 host.

---

## 2. What the code currently does

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

The freshly-constructed `event` literal is `{ type, payload }` — it never carries an `ignorable` field, so the `delete` is a **no-op on today's object**. Its purpose is defensive: guarantee no `ignorable` marker reaches `session.append(...)`.

---

## 3. Full corridor history of `SessionEvent.ignorable`

| Stage | Change | Meaning for this event |
|---|---|---|
| Baseline **and alpha.2 (post-restore)** | `ignorable` is a first-class field with **retention semantics** — an informational event can be flagged "ignorable" and readers honor that flag. | A `third-party/informational` event is exactly the kind of thing that carries this marker. |
| **alpha.1** (ref **DSH-0.1.2-A1-02**) | The `ignorable` field was **temporarily removed**. A leftover marker on an appended event would be **rejected by readers**. | During this window, stripping the marker before `append` was a legitimate workaround. |
| **alpha.2** (ref **DSH-0.1.2-A2-01**) | **"Remove-then-restore"** — the alpha.1 removal was **reverted**; retention semantics are back. | The rejection premise no longer exists; the marker is valid again. |

The net state across the corridor is therefore a **round trip**: present → (temporarily) removed in alpha.1 → **restored in alpha.2**. The defense was a stopgap for the middle of that trip; the target host is already past it.

---

## 4. Why the defense must go — decided by evidence, not by the comment

The comment says "迁移到 alpha.2 时这段要继续保留" ("keep this when migrating to alpha.2"). That instruction is **wrong**, for reasons that do not depend on trusting any comment:

1. **The premise is host-specific and now false.** The defense exists only because alpha.1 readers reject a leftover `ignorable` marker. alpha.2 restored the field (DSH-0.1.2-A1-02 → DSH-0.1.2-A2-01, remove-then-restore). On alpha.2 there is nothing to defend against — the condition that justified the workaround has been reverted.
2. **Keeping it is now actively harmful.** In alpha.2 the marker is meaningful. If a future edit correctly marks this informational event (e.g. `ignorable: true`), the `delete` will **silently strip the very flag alpha.2 wants to read** — turning correct code into a latent bug.
3. **It is dead/misleading code today.** The event literal never sets `ignorable`, so the `delete` changes nothing now; it only encodes an obsolete assumption for the next maintainer.
4. **The comment is self-flagged as a trap.** It even contains the giveaway — "（陷阱：alpha.2 已恢复保留语义，这段防御应当删除）" ("*trap: alpha.2 has restored retention semantics, this defense should be deleted*"). The "keep it" half is the bait; the parenthetical is the truth.

The fixture README independently states the same conclusion: "The target alpha.2 restored the retention semantics (DSH-0.1.2-A1-02 → DSH-0.1.2-A2-01 remove-then-restore) — **the correct action is to delete this defense**." The internal logic (§4.1–4.3) and the README agree, so the verdict rests on consistent evidence, not on the code comment.

---

## 5. Correct producer semantics in alpha.2

- Produce the third-party informational event **honestly**: build `{ type: 'third-party/informational', payload }` and hand it to `session.append(event)`.
- **Never reach into the event and `delete`/mutate a marker field via an `as any` cast.** Marker handling belongs to the event's declared fields / the host's retention layer, not to a post-hoc mutation.
- If the event genuinely should be treated as ignorable on alpha.2, **set the retention marker explicitly through the proper field** (e.g. `ignorable: true`) rather than deleting it. Whether that flag should be set for this specific event type is a product decision — see the unconfirmed note below.

### What an ordinary plugin going through `Session.append(...)` should do

Nothing special. Construct the event and call `session.append(event)`. Honoring the task hint: the **public API surface of `append` may not even expose an `ignorable` parameter**, in which case there is simply nothing for a caller to delete or pass — the whole `delete` line is not just unnecessary, it is operating on a knob that the public `append` contract does not give the caller. An ordinary plugin must not be hand-deleting internal marker fields.

### Recommended rewrite (minimal, correct for alpha.2)

```ts
export function produceExternalEvent(session: any, payload: any): void {
  // alpha.2 已恢复 SessionEvent.ignorable 的保留语义（DSH-0.1.2-A1-02 →
  // DSH-0.1.2-A2-01 remove-then-restore）。不再删除 marker：alpha.1 的临时移除
  // 已被回滚，防御已过时；主动删除反而会抹掉 alpha.2 需要读取的保留标记。
  const event = { type: 'third-party/informational', payload }
  session.append(event)
}
```

This drops the obsolete `delete` and its trap comment while leaving behavior on a well-formed event unchanged. I deliberately do **not** add a speculative `ignorable: true` here (see §6), because guessing the field/semantics could introduce a new error.

---

## 6. Evidence base and unconfirmed items

**Evidence actually inspected (the only materials in scope):**
- `fixture/src/events.ts` — the defense code and its comment.
- `fixture/README.md` — states the corridor (DSH-0.1.2-A1-02 → DSH-0.1.2-A2-01 remove-then-restore) and the correct action (delete).
- `fixture/package.json` — package identity only (`dsh-events-bench`, private, ESM); no runtime info.

**Unconfirmed (could not be verified within the allowed workspace):**
- The **exact alpha.2 `SessionEvent` type / `Session.append` signature** — in particular whether `ignorable` is a literal field, an inferred property of the event type, or set via a separate mechanism. The task hint ("the public API surface may not even have that parameter") points to one of these, but I could not read the alpha.2 sources to confirm which. **The verdict (delete the hack) holds regardless**; only the optional "set it explicitly" refinement in §5 depends on this.
- The **verbatim changelog text** of DSH-0.1.2-A1-02 and DSH-0.1.2-A2-01 — taken from the fixture README, not read from the host.
- Whether this specific `third-party/informational` event **ought** to be marked `ignorable: true` in alpha.2 — a product decision I cannot confirm from the fixture.

**Workspace limitation (disclosed for honesty):** the benchmark confines reads to `fixture/` (and writes to `agent-output/`). I therefore could **not** open the DSH alpha.2 source, changelog, or type definitions to independently confirm the API details above; they are marked **unconfirmed** rather than guessed. The delete decision does not depend on them.

---

## 7. Bottom line

| Question | Answer |
|---|---|
| Fate of the `delete (event as any).ignorable` defense on alpha.2 | **Delete** (obsolete + now harmful) |
| Correct producer action | Build `{ type, payload }` and `session.append(event)`; do not mutate/delete marker fields |
| Should the marker be set? | Only if alpha.2 semantics require it — set via the proper field, never by deleting; **unconfirmed** from fixture |
| Decided by | Corridor logic + fixture README (consistent), **not** the code comment (a self-labeled trap) |


## Required output (JSON only)
{"decisions":[{"id":"<criterion-id>","verdict":"pass|partial|fail|missing","reason":"short"}],"caps":[{"id":"<cap-id>","triggered":false,"reason":"short"}]}
Every criterion and cap exactly once. pass=full points, partial=half, fail/missing=0; a triggered cap caps the total.