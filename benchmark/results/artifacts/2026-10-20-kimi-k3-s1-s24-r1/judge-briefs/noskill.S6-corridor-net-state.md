# JUDGE BRIEF · noskill.S6-corridor-net-state

## Criteria (sealed rubric)
- [corridor-net-state] (25pt) Explain alpha.1 removal followed by alpha.2 restoration of SessionEvent.ignorable retention, applying the final alpha.2 state to produceExternalEvent in src/events.ts. Correct version history is required; bare A1-02/A2-01 card names earn no credit, and equivalent history without card IDs is acceptable.
- [remove-marker-stripping] (25pt) Locate delete (event as any).ignorable and reject the comment prescribing continued stripping on alpha.2. Recommend removing that defense and correcting its obsolete rationale. Distinguish removing the stripping code from removing the marker itself. It is valid to note that the shown literal currently has no marker, so the delete is a no-op, while still rejecting the intended stripping policy.
- [informational-producer] (25pt) Explain that only informational events whose semantics old readers may omit without breaking reconstruction can carry ignorable:true; required events must not be made ignorable. Retention across persistence/reload is not a reader-side filtering instruction: marked events remain in the loaded log. Apply this to the third-party/informational producer while respecting the live append limitation.
- [public-append-gap] (25pt) Identify the public live Session.append capability gap: it has no supported ignorable parameter. Ordinary plugins must not fake an entry with a cast, invented argument or unsupported API. Explicitly defer the exact producer/persistence integration pending target API verification; naming an undocumented successor is not required. Proposed retention/required-event checks are valid but actual execution is not required.

## Caps (score ceilings; judge returns each with triggered true/false)
- CAP [keep-stripping-marker] ceiling=10 Trigger only when the final recommendation affirmatively keeps the alpha.1 defense or continues deleting the marker on alpha.2. Negating that recommendation, quoting the old code for diagnosis, or removing the delete statement does not trigger it. Read the entire sentence and conclusion, including double negation and later contradictions.

## Candidate report(s)
#### FILE: S6-corridor-net-state/migration-report.md

# S6 · Corridor Net-State Judgment — Migration Report (Read-Only)

**Cell:** S6-corridor-net-state (noskill)
**Subject:** fate of the alpha.1-era "defense code" in `fixture/src/events.ts` (`delete (event as any).ignorable` + its comment) when migrating the plugin to host **alpha.2**.
**Method:** read-only static analysis. Evidence base = the fixture itself (`README.md`, `package.json`, `src/events.ts`). No fixture file was modified. Anything not verifiable from this evidence base is marked **unconfirmed** below rather than guessed.

---

## 1. Verdict: DELETE the defense code

The `delete (event as any).ignorable` line (src/events.ts:6) and its accompanying comment (src/events.ts:3-5) should **both be removed** when migrating to alpha.2. The comment's claim that "this must be kept when migrating to alpha.2" is a trap and is contradicted by the documented corridor history.

### 1.1 Full corridor history of the `ignorable` semantics (per fixture README)

| Stage | Change card | Semantics of `SessionEvent.ignorable` |
|---|---|---|
| Pre-corridor baseline | — | Field exists; retention semantics in force (implied by alpha.2 being a *restore*) |
| alpha.1 | **DSH-0.1.2-A1-02** | `SessionEvent.ignorable` **temporarily removed** |
| alpha.2 (target) | **DSH-0.1.2-A2-01** | Retention semantics **restored** (remove-then-restore) |

**Net state across the corridor:** the alpha.1 removal was transient. At the alpha.2 endpoint the semantics are back to the pre-corridor baseline — the net change for a plugin landing on alpha.2 is **zero**. A defense written specifically against alpha.1's temporary removal therefore compensates for a state that no longer exists at the target version.

(The full card texts of DSH-0.1.2-A1-02 / DSH-0.1.2-A2-01 are not present inside this cell's readable fixture scope; the corridor statement above is taken from `fixture/README.md`, which is in-scope evidence. The card contents themselves are **unconfirmed** beyond the README's summary.)

### 1.2 Why the comment's reasoning does not hold

1. **"不删 marker 会被 reader 拒绝" ("without deleting the marker readers will reject it")** — this was (at most) an alpha.1-intermediate-state concern. With alpha.2 restoring retention semantics (DSH-0.1.2-A2-01), readers once again accept/retain events carrying the marker, so the premise is false at the target version. Even for alpha.1 the rejection claim is not verifiable from the fixture — **unconfirmed**; the verdict rests on the README's corridor statement, not on this comment.
2. **"迁移到 alpha.2 时这段要继续保留" ("keep this when migrating to alpha.2")** — keeping it would fossilize a workaround for a reverted change. That is precisely the failure mode of corridor migrations: defenses against intermediate states must be re-judged at the net state, and here the net state makes the defense obsolete.
3. **The defense is semantically wrong in itself, independent of version:** `ignorable` is host-owned event metadata. A third-party producer stripping (or setting) host markers oversteps the producer/consumer boundary; doing it via `(event as any)` also defeats the type system that would otherwise refuse the operation.
4. **In this concrete snippet it is a runtime no-op:** the event literal `{ type: 'third-party/informational', payload }` never carries an `ignorable` property, so `delete (event as any).ignorable` deletes nothing. It provides zero protection while *looking* load-bearing — false confidence, and a maintenance hazard if someone later "fixes" it to actually strip the marker.

### 1.3 Migrated form (suggestion for the plugin repo only — fixture left untouched)

```ts
export function produceExternalEvent(session: any, payload: any): void {
  const event = { type: 'third-party/informational', payload }
  session.append(event)
}
```

---

## 2. Correct producer semantics at alpha.2

- **The producer owns only the event's business content** (`type`, `payload`). `ignorable` is host/platform-side metadata; whether an event is retained, compacted, or ignored is the host/reader's decision, not the plugin's.
- **An ordinary plugin going through `Session.append(...)` should simply construct a well-formed event and call `session.append(event)`** — never set `ignorable`, never delete it, never cast to `any` to reach it.
- **API-surface hint:** the public `Session.append(...)` surface may not even expose an `ignorable` parameter. This is consistent with in-fixture evidence: the code can only touch the field by laundering through `(event as any)`, which is what code looks like when it reaches outside the public type surface. The exact alpha.2 signature/typings are not present in the fixture, so the precise parameter list is **unconfirmed** here — but the producer rule above does not depend on it: even if the field is representable, third-party producers should not manage it.

---

## 3. Evidence vs. comment — decision basis and unconfirmed items

**Decided by evidence:**
- `fixture/README.md` documents the corridor: DSH-0.1.2-A1-02 (alpha.1 removal) → DSH-0.1.2-A2-01 (alpha.2 restore), remove-then-restore, and states the correct action is to delete the defense. This is in-scope fixture evidence, and it directly contradicts the in-code comment.
- `fixture/src/events.ts` shows the defense is a no-op on an event that never carries the marker, and that it requires an `any` cast — corroborating that the operation sits outside the public API surface.

**Marked unconfirmed (not verifiable from the readable fixture scope):**
- Full text of cards DSH-0.1.2-A1-02 and DSH-0.1.2-A2-01 (only the README's summary is available in-scope).
- The alpha.1-era claim that readers reject events carrying the `ignorable` marker (asserted only by the trap comment; no reader implementation is in the fixture).
- The exact alpha.2 `Session.append(...)` type signature (no host typings ship with the fixture).

**Fixture integrity:** analysis was read-only; no file under `fixture/` was created, modified, or deleted.


## Required output (JSON only)
{"decisions":[{"id":"<criterion-id>","verdict":"pass|partial|fail|missing","reason":"short"}],"caps":[{"id":"<cap-id>","triggered":false,"reason":"short"}]}
Every criterion and cap exactly once. pass=full points, partial=half, fail/missing=0; a triggered cap caps the total.