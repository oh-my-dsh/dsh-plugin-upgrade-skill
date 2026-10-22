# S9 · Composer Coordinate Trap — Diagnosis Report

Plugin: `@org/dsh-attach-input` v0.2.3 · Host: DSH `0.1.2-alpha.3`
Evidence: `fixture/plugin-client.js`, `fixture/console-session.txt`, `fixture/host-input-facade.ts`, `fixture/host-input-contract.ts`

## Executive summary — one defect, not two

Both user-visible bugs come from **a single contract misread**: the host input machine publishes
**two different text projections** of the same editor document, each with its own coordinate
system, and the plugin passes offsets from one projection into verbs that interpret them in the
other.

From `host-input-contract.ts` (`EditorProjection`, L35–42):

| Projection | Chip renders as | Who uses it |
|---|---|---|
| `detectText` — "Trigger/TokenSpan coordinate text (chip = one U+FFFC)" | exactly **1 character** (U+FFFC) | `TokenSpan.start/end` — the span guards and splices of `insertReference` and `consumeToken` |
| `clipboardText` — "Persistence/InputState draft text (chip = clipboardText)" | the chip's full clipboard form, e.g. `[attachment: screenshot.png]` = **28 characters** | `InputState.draft` and every `Occurrence.offset/length` ("Offset/Length **in the clipboard-text projection**", contract L14–17) |

The plugin reads `InputState` (`draft`, `occurrences` — clipboard coordinates) and feeds those
numbers straight into `TokenSpan` fields that the host consumes in **detect coordinates**
(facade header comment L3–4: the splice helpers "splice the DETECT text"; `insertReference` L18
slices `this.projection.detectText` at `span.end`; `consumeToken` L41 calls
`$replaceDetectSpanWithText(guard.span, '')`).

The two coordinate systems are **identical only while the document contains no chips**, and
diverge by `Σ(occurrence.length − 1)` as soon as chips exist. That is why the first paste works
and everything after it fails — see §1.

Note: the third `TokenSpan` field, `draftRev`, is **not** part of the bug. `InputState.draftRev`
is explicitly "the monotonic editor revision (span CAS compares against this)" (contract L28–29),
which is exactly what the facade compares (`span.draftRev !== this.rev`, facade L17, L38). The
plugin already passes the right revision currency; only the **offsets** are in the wrong space.

---

## 1. Why paste #1 succeeds and every later paste fails with the toast

### What the plugin computes (insert path)

`plugin-client.js` `add()` L21–32 builds the span as:

```js
{ start: snapshot.draft.length, end: snapshot.draft.length, draftRev: snapshot.draftRev }
```

`snapshot.draft` is the **clipboard-text projection** ("chips expanded to their clipboard form",
contract L26–27). So `start/end` are clipboard-space offsets. But `insertReference` uses the span
as a **TokenSpan in detect space**: it checks `detectText.slice(span.end, span.end + 1)` for the
separating-space decision and splices `detectText` at `[span.start, span.end)`.

### The exact mismatch

> The plugin computes `start/end` as the length/offset of the **clipboard projection** (chip =
> `clipboardText`, N chars), while the host verb's span handling (tail probe + CAS-splice)
> compares and consumes those numbers against the **detect projection** (chip = one U+FFFC).
> After *k* chips exist, every plugin-computed offset is too large by
> `Σᵢ (clipboardTextᵢ.length − 1)`.

### Trace against the session capture

**Paste #1 (fresh session, empty composer) — works.** `draft = ''`, so
`start = end = draft.length = 0`. With zero chips the two projections coincide: detect offset 0
== clipboard offset 0. The CAS passes (`draftRev` is current; the trailing-space `setDraft` branch
at L13–16 does not fire on an empty draft). The host splices at detect `[0,0)`, tail probe reads
`''` ≠ `' '`, so it inserts chip + space. Log confirms: `draft = "[attachment: screenshot.png] "`
(length 29), `occurrences = [{offset: 0, length: 28, ...}]`.

**Paste #2 — fails deterministically.** Fresh snapshot: `draft.length = 29`, which ends in a space,
so no `setDraft`; `draftRev` is current and the **CAS guard passes**. But the span sent is
`{start: 29, end: 29}` while the actual detect text is `"\uFFFC "` — **length 2** (one chip char +
one space). The plugin's offset is 27 too far right (exactly `length − 1 = 28 − 1` for the one
existing chip). The tail probe reads past the end (`slice(29,30) = ''`), and the detect-space
splice at 29 is out of bounds, so the edit does not apply and `insertReference` returns `false`
(log L14). The plugin's `!accepted` branch (L33–36) throws its canned message.

### Why "first works, later fails" is the *signature* of this mismatch

A clipboard↔detect confusion is the identity map on a chip-free document — offset 0 in one space is
offset 0 in the other — so the very first insert into an empty composer can never expose it. The
first successful insert *creates the first chip*, and from then on the two projections differ by
`Σ(len − 1)` at every point behind a chip, so **every** subsequent offset the plugin computes from
`draft.length` or `occurrence.offset` lands out of range (or, with more typed text, silently at
the wrong place). Deterministic "n-th interaction onward" failure with a clean first run is what
coordinate-space divergence looks like; contrast the alternative explanations the toast suggests:
a genuine revision-CAS race would fail *sporadically* (including on paste #1 if the user typed
concurrently), and a phase-guard rejection would fail whenever phase ≠ plain/claimed — neither
produces "first always OK, all later always fail" on an idle composer. The toast text "The DSH
composer changed…" is therefore a **misdiagnosis baked into the plugin**: nothing changed; the
composer was stable and the span was simply in the wrong units.

---

## 2. Why the × click yields an `unavailable` ghost chip instead of removing it

### The removal path

`plugin-client.js` `remove()` L43–60 receives an `Occurrence` — whose `offset/length` are
**clipboard coordinates** by definition (contract L14–17). It computes:

```js
const end = occurrence.offset + (occurrence.length ?? 1);   // L49 — "the occurrence owns its whole inline range"
input.consumeToken({ kind: 'span', span: { start: occurrence.offset, end, draftRev: snapshot.draftRev } });  // L51–54
```

The comment is true **in clipboard space** and false in detect space, where the occurrence owns
exactly **one** character. `consumeToken`'s span branch (facade L37–43) runs
`$replaceDetectSpanWithText(guard.span, '')` — again a detect-space splice.

### Trace against the session capture

For the single chip: `{offset: 0, length: 28}` → plugin span `[0, 28)`. The facade guards pass
(`draftRev` current; `start !== end`), but the detect text is `"\uFFFC "` (length 2), so the
`[0,28)` detect splice is out of bounds → no edit applies, `consumeToken` returns `false`, and
the composer chip survives (log L20).

### The plugin-side bookkeeping defect that turns failure into "unavailable"

`remove()` **never inspects the return value** (log L18: "returned (not inspected by the plugin
code)"). Unconditionally, L58–59:

```js
records.delete(occurrence.ref);
changed();
```

So plugin state and host state diverge: the composer still contains the chip (host refused the
edit), hence the dock still renders it from the occurrence view — but its backing record is gone.
The dock's meta expression (L63–65) falls into `record === undefined ? 'unavailable' : …`, so the
size label flips to `unavailable` while the chip itself stays. That is precisely user report #3.

This is the **same root cause** as bug #1 (clipboard offsets fed to a detect-space verb) plus one
independent-of-coordinates bookkeeping error (optimistic `records.delete` without checking the
verb's boolean). Even with correct coordinates, any legitimate CAS failure — user typing between
`getSnapshot()` and `consumeToken` — would produce the identical ghost chip. Conversely, fixing
only the bookkeeping would leave removals silently no-op'ing. Both halves must be fixed.

(Side note: the legacy fallback at L56, `setDraft(draft.slice(0,offset) + draft.slice(end))`,
is *coordinate-correct* — `setDraft` consumes clipboard-projection text and the occurrence offsets
are clipboard-space — which ironically makes the primary path the only broken one.)

---

## 3. Fix direction — conversion rule derived from the host source, and call sites

### The rule (derived, not guessed)

From the contract excerpts:

* detect space: "chip = one U+FFFC" (`EditorProjection.detectText`, L36–37) → a chip occupies
  **exactly 1** detect character;
* clipboard space: "chip = clipboardText" (L38–39) and "the occurrence occupies exactly
  `[offset, offset+length)`" in the clipboard-text projection (`Occurrence`, L16–17) → the same
  chip occupies **`occurrence.length`** clipboard characters;
* `InputState.occurrences` is "sorted by offset" (L30–31), and its coordinate space is stated as
  "clipboardText coordinates" (`EditorProjection.occurrences`, L40–41).

Therefore each occurrence *before* a position shrinks by `length − 1` when mapping
clipboard → detect:

```
detectOffset(x) = x − Σ { o.length − 1 : o ∈ snapshot.occurrences, o.offset + o.length ≤ x }
```

Two concrete forms needed:

* **end-of-draft append point** (all occurrences precede it):
  `detectEnd = draft.length − Σ_all (o.length − 1)`
* **one occurrence's own detect span** (for removal):
  `[ detectOffset(o.offset), detectOffset(o.offset) + 1 )` — **width 1**, not `o.length`.

Sanity check against the capture: paste #2 → `29 − (28−1) = 2` == actual `detectText.length`;
removal → `[0, 1)` == the U+FFFC position. `draftRev` needs **no** conversion — it is already the
CAS currency the guards compare (`span.draftRev !== this.rev`).

Always compute from **one consistent snapshot** (the same `getSnapshot()` supplies `draft`,
`draftRev`, and `occurrences`), and recompute after every mutation — including the plugin's own
`setDraft(draft + ' ')` (a plain space is 1:1 in both projections, so the space itself needs no
adjustment, but the refreshed snapshot must be the one used) and after each successful insert in
the multi-item loop.

### Call site 1 — insert path (`add`, plugin-client.js L21–32)

```js
const shrink = snapshot.occurrences.reduce((s, o) => s + (o.length - 1), 0);
const detectEnd = snapshot.draft.length - shrink;
const accepted = input.insertReference({ ...ref... },
  { start: detectEnd, end: detectEnd, draftRev: snapshot.draftRev });
```

Additionally, stop equating `false` with "composer changed": the host returns `false` for
phase ≠ plain/claimed, stale `draftRev`, **and** span/splice rejection. On `false`, re-read the
snapshot and retry once (bounded) before surfacing an error, keep the `records.delete(ref)`
rollback for the genuine failure, and make the message reflect the actual cause class.

### Call site 2 — removal path (`remove`, plugin-client.js L43–60)

```js
const detectStart = snapshot.occurrences
  .filter(o => o.offset + o.length <= occurrence.offset)
  .reduce((s, o) => s - (o.length - 1), occurrence.offset);
const ok = input.consumeToken({
  kind: 'span',
  span: { start: detectStart, end: detectStart + 1, draftRev: snapshot.draftRev },
});
if (ok) {
  records.delete(occurrence.ref);
} else {
  // CAS lost or span rejected: DO NOT delete the record.
  // Re-sync snapshot/occurrence and retry (bounded), or report failure.
}
changed();
```

The bookkeeping invariant to enforce: **`records` may only be mutated in the direction the host
confirmed** — `records.delete` strictly gated on `consumeToken(...) === true`, mirroring how
`add` already gates on `accepted`. Under this invariant the dock can never render an
`unavailable` ghost: either the host removed the chip (occurrence and record both gone) or the
record survives with its real size label.

---

## 4. Regression test plan

Every sequence below must be asserted end-to-end (host state via `getSnapshot()`: `draft`,
`draftRev`, `occurrences`; plugin state via the dock DOM and the internal `records` map; and the
verbs' boolean returns).

### A. Repeat-insert sequences (kills bug #1)

1. **A1 — second paste (the reported repro).** Fresh session, empty composer → paste file A →
   assert insert accepted, 1 occurrence `{offset 0, length |A.clip|}`, `draft = A.clip + ' '`,
   dock + composer chips visible → paste file B (no intervening edits) → **assert no toast, insert
   returns true**, 2 occurrences sorted by offset, `draft = A.clip + ' ' + B.clip + ' '`, both
   chips in composer and dock. → paste file C → same assertions (guards a fix tuned to exactly
   one pre-existing chip).
2. **A2 — insert behind chips *and* typed text (misalignment, not just out-of-bounds).** Paste A →
   type `hello` after the chip → paste B → assert B's occurrence offset equals
   `|A.clip| + 1 + 6` in clipboard space **and** the composer text order is chip-A, "hello ",
   chip-B, " " — i.e. B landed at the true end. This catches in-range-but-shifted splices, which
   fail *silently* (wrong position) rather than loudly (false return), so A1 alone is insufficient.
3. **A3 — trailing-space branch.** Type `draft` (no trailing whitespace) → paste A → assert the
   plugin's `setDraft(draft + ' ')` fires, the span comes from the **re-fetched** snapshot, and
   the result is `"draft [attachment: A] "` with one occurrence at offset 6.
4. **A4 — multi-file single paste.** Paste 3 files in one `add` call → all three accepted, loop
   re-snapshots between inserts, 3 occurrences in order.
5. **A5 — genuine staleness still detected (no over-correction).** Snapshot taken, then a
   concurrent edit bumps `draftRev` before `insertReference` → assert it returns false, the
   plugin rolls back (`records` unchanged), and the user-visible error is the "composer changed"
   class — the CAS must keep working after the coordinate fix.

### B. Removal sequences (kills bug #2)

6. **B1 — the reported repro.** Paste A only → click × on dock chip → assert `consumeToken`
   returns true, composer chip gone (`occurrences.length === 0`, `draft === ''`), **dock chip
   gone** (not merely relabeled), `records` empty. The literal regression assertion: at no point
   does the dock show meta `unavailable` while a composer chip exists.
7. **B2 — remove the FIRST of two chips.** Paste A, paste B → × on A → assert only A removed; B's
   composer chip intact and B's dock label still shows its real size; `records` has exactly B;
   the re-rendered dock uses a **fresh snapshot** (B's clipboard offset shifted after removal).
8. **B3 — remove the SECOND of two chips.** Mirror of B2 (exercises the Σ(len−1) conversion for a
   chip with a preceding chip — B's detect offset is `A_detect + …`, not B's clipboard offset).
9. **B4 — remove with typed text around the chip.** Type `hello ` → paste A → type `world` →
   move/click × on A → assert `draft` becomes `"hello world"`-equivalent (text preserved, only
   the U+FFFC and its range removed), 0 occurrences.
10. **B5 — removal failure bookkeeping (ghost guard).** Force `consumeToken` to return false
    (bump `draftRev` between snapshot and consume, or stub the verb) → assert **`records` still
    contains the ref**, the dock chip still shows its real byte size, and the plugin retries or
    reports — never delete-then-fail. This is the exact `unavailable`-ghost regression, and it
    must fail if `records.delete` is ever made unconditional again.
11. **B6 — remove twice / remove after re-paste.** × on A → immediately × again on a stale
    occurrence reference → assert graceful no-op or re-sync, no exception, no record/state
    divergence.

### C. Cross-cutting invariant (property-style)

12. **C1 — randomized interleaving.** Random sequence of {paste, ×-remove, type text, setDraft}
    (≥50 steps); after **each** step assert:
    * bijection: `records.keys()` == set of `occurrences[].ref` (plugin bookkeeping ↔ host state);
    * coordinate consistency: for every occurrence, `detectOffset(o.offset)` lies inside
      `detectText` and `detectText[detectOffset(o.offset)] === '\uFFFC'`;
    * no dock chip ever renders `unavailable`;
    * the "composer changed" toast appears only when `draftRev` actually moved (injected race),
      never on idle-repeat pastes.

13. **C2 — unit-level contract lock.** A test that fails to compile/run if the span literal in
    either call site is ever sourced directly from `snapshot.draft.length` or
    `occurrence.offset + occurrence.length` again (e.g. a tiny `toDetectSpan(snapshot, …)`
    helper as the *only* sanctioned producer of `TokenSpan`, with its conversion covered by
    table-driven cases: 0 chips, 1 chip, chips + text, chip at offset 0 vs mid-draft).

---

## 5. Routine host-source discipline before calling input-machine verbs (guidance)

Before any release, and on every DSH version bump (especially alphas), re-read the host source for
each verb the plugin calls and record in a small **verb-contract sheet**:

1. **Coordinate space of every positional parameter.** For each span/offset argument, find where
   the verb *consumes* it (guard comparisons, `slice`, splice helpers) and which projection text
   it indexes — here `insertReference`/`consumeToken` both splice `detectText`. Type names
   (`TokenSpan` vs `Occurrence`) and the projection doc comments ("chip = one U+FFFC" vs
   "chip = clipboardText") are the authoritative markers; never assume a "text offset" is
   interchangeable between published views.
2. **Revision currency.** What revision field the CAS compares (`span.draftRev !== this.rev`),
   which published field carries it (`InputState.draftRev`), and what bumps it (every
   `applyEdit`/`setDraft`) — so snapshots are re-taken after every mutation, including the
   plugin's own.
3. **Full return-value semantics.** Enumerate every path that yields `false`/`true` (phase
   guard, CAS, degenerate span `start === end`, splice rejection) and treat the boolean as the
   only truth for mutating plugin-side bookkeeping; never map one boolean blindly onto one
   user-facing cause ("composer changed").
4. **Chip/token rendering in each projection.** How many characters an entity occupies in detect
   vs clipboard vs persistence/model forms — the source of the `length − 1` shrink rule.
5. **Phase preconditions.** Which phases each verb accepts (`plain`/`claimed` here) and what
   the plugin's own async gaps (file reads, uploads) can do to the phase in between.
6. **Non-empty-document smoke tests.** Coordinate divergences are invisible on an empty composer;
   the plugin's CI smoke suite must exercise every verb with ≥1 chip and mixed typed text present
   (sequences A2/B2/B4 above), so a units regression fails loudly at the second interaction, not
   in a user report.

---

*Fixture was inspected read-only; nothing under `fixture/` was modified. All line references are
to the four fixture files named above.*
