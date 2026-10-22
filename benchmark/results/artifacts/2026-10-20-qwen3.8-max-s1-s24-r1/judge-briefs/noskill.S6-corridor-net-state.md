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

# S6 · Corridor Net-State Judgment — Migration Report (target host: DSH 0.1.2-alpha.2)

**Fixture:** `/app/fixture/` (read-only, verified unchanged — see §7)
**Code under judgment:** `fixture/src/events.ts` → `produceExternalEvent()`, specifically the line `delete (event as any).ignorable` and its accompanying "community comment".
**Arm:** noskill — evidence base is limited to the in-cell materials (fixture files + hash manifest). No change-card corpus or API docs are mounted in this cell; every claim that cannot be verified from them is explicitly marked **unconfirmed** (§6).

---

## 1. Verdict (Requirement 1): **DELETE the defense code**

The `delete (event as any).ignorable` line and the comment block above it (lines 3–6 of `src/events.ts`) must be **removed**, not kept, when migrating to alpha.2. The comment's instruction "迁移到 alpha.2 时这段要继续保留" ("this must be kept when migrating to alpha.2") is **wrong** and must not be followed.

### Reasoning — the full corridor history of this semantics

The `ignorable` marker on `SessionEvent` follows a **remove-then-restore** trajectory across the version corridor:

| Corridor leg | State of `SessionEvent.ignorable` / retention semantics | Evidence |
|---|---|---|
| Pre-alpha.1 baseline | Field exists; retention semantics in force | Implied by the restore card; exact baseline version and semantics **unconfirmed** in-cell |
| **alpha.1** — card **DSH-0.1.2-A1-02** | Field **temporarily removed** | Cited in both the fixture comment and `fixture/README.md` |
| **alpha.2 (target)** — card **DSH-0.1.2-A2-01** | Retention semantics **restored** | `fixture/README.md`: "The target alpha.2 restored the retention semantics (DSH-0.1.2-A1-02 → DSH-0.1.2-A2-01 remove-then-restore) — the correct action is to delete this defense." |

**Corridor net state = net-zero for this feature.** A remove-then-restore pair means alpha.2 ends where the pre-alpha.1 baseline stood: the `ignorable` marker and its retention semantics are part of the host again. The defense code was a workaround for a *transient* alpha.1 condition (the marker field being gone). Once the condition is reverted by DSH-0.1.2-A2-01, the workaround's entire reason for existence disappears. Judging "net state across the corridor" instead of "state at the last version I happened to code against" is exactly what catches this trap: the comment extrapolated alpha.1's temporary removal into the future.

### Evidence-based grounds (Requirement 3: decide by evidence, not by the comment)

1. **Card-level evidence overrides the comment.** The only authoritative corridor statement available in-cell (README, keyed to card IDs DSH-0.1.2-A1-02 → DSH-0.1.2-A2-01) says alpha.2 *restored* the semantics and the correct action is deletion. The comment is self-described as "社区注释" (community annotation) — speculation, not a card. The fixture's own trap annotation in the same comment ("陷阱：alpha.2 已恢复保留语义，这段防御应当删除") agrees with the README.
2. **The defense is dead code even on its own terms.** The event literal built on line 2 is `{ type: 'third-party/informational', payload }` — it **never sets** `ignorable`. Deleting a property that was never present is a **no-op**: the "readers will reject it" scenario the comment fears cannot arise from this producer's own object as written (nothing between construction and `append` adds the key). So the line never actually defended anything; it only encodes a false belief.
3. **Keeping it is an active hazard in alpha.2.** With retention semantics restored, `ignorable` is again a meaningful host-managed marker. Keeping a reflexive `delete` (a) documents the wrong corridor state for future maintainers, and (b) if the pattern is ever copied to events that *do* carry the marker — e.g. events forwarded/relayed from other sources — it would strip a field the alpha.2 host relies on for its retention/skip behavior, defeating exactly what DSH-0.1.2-A2-01 restored. (What readers concretely do with the marker in alpha.2 is **unconfirmed** in-cell; this hazard argument is secondary to ground 1.)
4. The comment's premise "不删 marker 会被 reader 拒绝" (alpha.1 readers reject events carrying the marker) is **itself unverified** — it appears only in the community comment; no in-cell material confirms alpha.1 reader rejection behavior. It does not need to be true or false for the verdict: either way the alpha.1-era condition is over in alpha.2.

---

## 2. Correct producer semantics for alpha.2 (Requirement 2)

**`ignorable` is not a producer-side knob.** It is a host/pipeline-managed marker on `SessionEvent` (part of the restored retention semantics). Per the task hint, the public API surface of `Session.append(...)` **may not even expose such a parameter** — i.e. whether an event is ignorable is not something a plugin sets, and equally not something a plugin should strip. (The exact public signature of `Session.append(...)` in alpha.2 is **unconfirmed** in-cell — no API docs are mounted in this cell.)

**What an ordinary plugin going through `Session.append(...)` should do:**

- Construct the event with only its **declared, schema-owned fields** (here: `type: 'third-party/informational'` and its `payload`);
- Call `session.append(event)` directly;
- **Never set and never `delete` `ignorable`** (or any other host-managed marker) — marker handling belongs to the host under the restored alpha.2 retention semantics.

**Migrated `produceExternalEvent` (what the file should look like after the upgrade — NOT applied; fixture stays read-only):**

```ts
export function produceExternalEvent(session: any, payload: any): void {
  const event = { type: 'third-party/informational', payload }
  session.append(event)
}
```

No replacement code is needed for the removed line: the alpha.2 restore is host-side, so there is nothing for the producer to add back. The migration action for this file is pure subtraction (delete line 6 and the stale comment on lines 3–5).

---

## 3. Fate summary

| Item | Fate | Why |
|---|---|---|
| `delete (event as any).ignorable` (line 6) | **Delete** | alpha.2 restored the semantics (DSH-0.1.2-A2-01 reverses DSH-0.1.2-A1-02); line is a no-op on this producer anyway; keeping it misdocuments the corridor and risks stripping a restored host marker if the pattern spreads |
| Comment block (lines 3–5) | **Delete** | Its factual claim about alpha.1's removal is historically correct but its prescription ("keep for alpha.2") is contradicted by the restore card |
| `session.append(event)` with plain `{ type, payload }` event | **Keep as-is** | This is the correct ordinary-producer shape on alpha.2 |

---

## 4. Corridor lesson (why "net state" matters)

When a change card is later reversed inside the same corridor (remove → restore), code written against the *intermediate* version must be re-judged against the *net* end state, not against the version it was written for. Defense code justified by "version X removed Y" expires the moment a later card restores Y; comments asserting permanence ("must be kept") carry no authority — only the card trail does.

---

## 5. Fixture materials relied on

- `fixture/src/events.ts` — the defense code + community comment (incl. its trap annotation).
- `fixture/README.md` — corridor statement: DSH-0.1.2-A1-02 → DSH-0.1.2-A2-01, remove-then-restore; "the correct action is to delete this defense".
- `fixture/package.json` — `"private": true`, test material only; do not execute or publish.
- `fixture-hash-before.json` — integrity manifest (used in §7).

Change cards are referenced **by ID and key point only** (per report constraints, no card text is reproduced — none is present in-cell anyway).

---

## 6. Confirmed vs. unconfirmed

**Confirmed from in-cell evidence:**
- Existence, exact shape, and comment claims of the defense code (`src/events.ts`).
- Corridor legs and their IDs: alpha.1 removed `SessionEvent.ignorable` (DSH-0.1.2-A1-02); alpha.2 restored retention semantics (DSH-0.1.2-A2-01); pattern = remove-then-restore; README's stated correct action = delete the defense.
- The `delete` is a no-op on the event literal actually constructed in this function.
- Fixture is private test material and must remain byte-identical.

**Unconfirmed (not verifiable from in-cell materials; marked per Requirement 3):**
- Full text/exact wording of cards DSH-0.1.2-A1-02 and DSH-0.1.2-A2-01.
- The precise semantics of `ignorable` / "retention semantics" (what readers concretely do with the marker in the baseline and in alpha.2).
- Whether alpha.1 readers actually rejected events carrying `ignorable` (claim exists only in the community comment).
- The exact public signature of `Session.append(...)` in alpha.2 and whether an `ignorable` parameter exists on any public surface (hint suggests not; no API docs in-cell).
- Which pre-alpha.1 version last had the field before removal.

---

## 7. Read-only compliance

- No file under `/app/fixture/` was created, modified, or deleted by this analysis.
- Post-analysis verification: sha256 of all three fixture files recomputed and **matched** `fixture-hash-before.json` exactly (package.json `0f94b8a5…`, README.md `293a9d4b…`, src/events.ts `e0d7190a…`).
- This report is the only artifact written, under `/app/agent-output/S6-corridor-net-state/`. Nothing was executed from the fixture; no dependencies installed; no network or out-of-cell paths consulted; no git operations performed.


## Required output (JSON only)
{"decisions":[{"id":"<criterion-id>","verdict":"pass|partial|fail|missing","reason":"short"}],"caps":[{"id":"<cap-id>","triggered":false,"reason":"short"}]}
Every criterion and cap exactly once. pass=full points, partial=half, fail/missing=0; a triggered cap caps the total.