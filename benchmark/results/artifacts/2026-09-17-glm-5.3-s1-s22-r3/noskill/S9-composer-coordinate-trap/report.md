# S9 · Composer Coordinate Trap — Diagnosis Report

Plugin under review: `@org/dsh-attach-input` v0.2.3 on DSH `0.1.2-alpha.3`.
Evidence used (read-only fixture): `plugin-client.js`, `console-session.txt`, `host-input-facade.ts`, `host-input-contract.ts`.

## Executive summary

Both reported symptoms are one bug, not two: **the plugin computes all span coordinates in the
clipboard-text projection while the host input verbs' span guards validate and splice in the
detect-text projection**, where every chip node counts as exactly one `U+FFFC` character. The two
projections carry different lengths whenever at least one chip exists. A secondary defect on the
removal path — the plugin ignores `consumeToken`'s boolean return and deletes its bookkeeping
record unconditionally — turns a guarded no-op into the visible `unavailable` chip.

Contract facts derived from the host source excerpts (not guesswork):

- `host-input-facade.ts` `insertReference`: guard is `span.draftRev !== this.rev` → false; the
  applied edit is `$replaceDetectSpanWithNodes(span, nodes)`, and the "append a separating
  space" lookahead reads `this.projection.detectText.slice(span.end, span.end + 1)`. So the
  `TokenSpan` `start`/`end` index **detectText**, not the draft.
- `host-input-facade.ts` `consumeToken` (span guard): CAS on `guard.span.draftRev !== this.rev`,
  rejects empty spans (`start === end`), then splices via `$replaceDetectSpanWithText(guard.span, '')`
  — again **detectText** coordinates.
- `host-input-contract.ts`: `InputState.draft` and `Occurrence.offset`/`length` are explicitly the
  **clipboard-text** projection ("chips expanded to their clipboard form"); `EditorProjection.detectText`
  is a different text where "chip = one `U+FFFC`", while `EditorProjection.clipboardText` and the
  `occurrences` view are the clipboard-text coordinates the plugin is reading.

So `InputState` is a *different projection* than the one the verbs' span guards speak. Passing
`InputState` coordinates into `insertReference`/`consumeToken` is a cross-projection coordinate mixup.

## 1. Why paste #1 succeeds and every later paste fails

What the plugin computes on `add`:

```js
start: snapshot.draft.length,   // clipboard-text length
end:   snapshot.draft.length,   // clipboard-text length
draftRev: snapshot.draftRev,
```

What the host compares/splices against: `detectText`, where each existing chip is one `U+FFFC`.

- **Paste #1 (empty composer, zero chips):** `draft === ''`, so clipboard length = detect length
  = 0, and `snapshot.draftRev` is current. `start = end = 0` is a valid caret position in *both*
  projections; the rev CAS passes; `$replaceDetectSpanWithNodes` applies at the end of an empty
  detect text. The capture confirms: chip inserted, `draft` becomes `"[attachment: screenshot.png] "`
  (length 29 — the chip's `clipboardText` is 28 chars plus the host-appended separator space).
- **Paste #2 (one chip present):** the plugin reads `snapshot.draft.length` — 29 in clipboard
  coordinates. In detect coordinates the document is just `"\uFFFC "` (chip + space), length 2.
  The plugin submits `start = end = 29`; that position does not exist in `detectText` (length 2),
  so `$replaceDetectSpanWithNodes` cannot apply and returns false, `insertReference` returns false,
  and the plugin throws the observed toast `"The DSH composer changed before the attachment could be
  inserted"`. The rev CAS itself passes — `snapshot.draftRev` was freshly read and no edit intervened
  — so the failure is purely the out-of-range span, not a stale revision.

**Why "first works, later fails" is the signature of this mismatch:** the two projections have
equal lengths **iff the document contains zero chips** (each chip contributes `length` chars to
`draft` but exactly 1 char to `detectText`; plain text contributes equally to both). Only the very
first insert into a chip-less composer gets valid coordinates by accident. From the moment any chip
exists, clipboard coordinates overstate detect positions by `Σ (occurrence.length − 1)` (here
28 − 1 = 27), and *every* subsequent insert span is past the end of `detectText`. The failure is
therefore permanent and deterministic, not a race — matching the report that it never works again
after the first paste. (Note the misdiagnosis trap: the plugin's toast text blames "the composer
changed", i.e. a concurrency assumption, but the rev CAS never fired.)

## 2. Why × turns the chip into `unavailable` instead of removing it

Removal path, step by step:

1. Plugin reads `snapshot = input.state.getSnapshot()`; phase is `'plain'`, so it proceeds.
2. It builds the span from the **published occurrence**: `end = occurrence.offset + occurrence.length`
   = `0 + 28`. But `Occurrence.offset`/`length` are clipboard-text coordinates (per the contract
   JSDoc); in `detectText` the chip occupies exactly `[0, 1)`.
3. It calls `input.consumeToken({ kind: 'span', span: { start: 0, end: 28, draftRev } })`. The rev
   CAS passes and `start !== end`, so the guard reaches `$replaceDetectSpanWithText({0..28}, '')`
   against a 2-character `detectText`; the splice cannot apply, `consumeToken` returns **false**,
   and the editor document is unchanged — which is why the composer chip stays (capture: "composer
   chip still present").
4. The plugin **ignores the return value** and unconditionally executes
   `records.delete(occurrence.ref); changed();`. The dock re-renders; in the dock-chip rendering
   excerpt, `records.get(occurrence.ref)` is now `undefined`, and the meta branch
   `record === undefined ? 'unavailable'` fires — producing the observed `unavailable` label while
   the chip itself remains rendered.

So the `unavailable` label is the plugin's own "record missing" sentinel being hit by *premature
bookkeeping deletion*, and the surviving chips are the host's span guard correctly refusing a
cross-projection span. Two contributing defects: (a) same coordinate mixup as the insert path;
(b) treating a guarded, return-`false` verb as fire-and-forget.

## 3. Fix direction: what to convert, by what rule, and where

**The rule (derived from `host-input-contract.ts`):** a span passed to an input-machine verb must
be expressed in **detect-text coordinates**, where each chip/occurrence counts as exactly **1**
(`U+FFFC)) instead of its `clipboardText` length. Given `InputState` (clipboard coordinates), the
conversion for any position `p` (an occurrence offset or the end-of-draft caret):

```js
// shrink = total chars "saved" by occurrences entirely before position p
const shrinkBefore = (occurrences, p) =>
  occurrences.reduce((s, o) => (o.offset + o.length <= p ? s + (o.length - 1) : s), 0);
const toDetectPos = (p, occurrences) => p - shrinkBefore(occurrences, p);
```

Equivalently: `detectEndOfDraft = state.draft.length − Σ over all occurrences (o.length − 1)`.
(Since occurrences are disjoint and sorted, an occurrence's own detect range is
`[toDetectPos(o.offset), toDetectPos(o.offset) + 1)` — always length exactly 1.)

Apply at these call sites in `plugin-client.js`:

- **Insert path (`add`)**: before each `input.insertReference`, convert the caret:
  `const detectEnd = toDetectPos(snapshot.draft.length, snapshot.occurrences);` then pass
  `{ start: detectEnd, end: detectEnd, draftRev: snapshot.draftRev }`. Keep the existing
  fresh-snapshot discipline (re-read after `setDraft` and after each insert) — the rev CAS compares
  against the live editor revision and must be re-read after any edit, including the host's own
  separator-space append. Also keep the `phase === 'plain'` precondition (the verb also accepts
  `'claimed'`, but the plugin's stricter check is fine).
- **Removal path (`remove`)**: convert the occurrence range:
  `start = toDetectPos(occurrence.offset, snapshot.occurrences)`, `end = start + 1` (a whole-chip
  span in detect coordinates — which also satisfies the `start !== end` non-empty-span guard). Do
  **not** use `occurrence.length`; that is the clipboard length. Pass the current
  `snapshot.draftRev`.
- **Removal-path robustness (bookkeeping)**: check `consumeToken`'s return. Only on `true` run
  `records.delete(occurrence.ref)`. On `false`, keep the record and surface the failure (e.g. retry
  after re-reading the snapshot, or show an error state distinct from `unavailable`) so a guarded
  no-op can never orphan the dock chip. The same "check the boolean" discipline applies to the
  `setDraft` fallback branch: note that fallback branch splices `snapshot.draft` — that string *is*
  clipboard coordinates, so its slicing arithmetic is coordinate-consistent, but replacing the chip's
  clipboard text as plain draft text destroys the occurrence metadata; prefer the converted
  `consumeToken` span and treat the fallback as best-effort.

Minimum-diff summary: one shared helper `toDetectPos` used by both `add` (caret) and `remove`
(occurrence range, `length → 1`), plus honoring `consumeToken`'s return before deleting the record.

## 4. Regression test plan

Assert the exact interaction sequences; each test must drive the real input machine (or a faithful
facade double that enforces the detect-text span guards and rev CAS), not a mock that accepts any span.

1. **Repeat-paste sequence (bug #1):**
   - Fresh session, empty composer. Paste file A → assert: one dock chip (`ready`, human-readable
     size), one composer occurrence, `draft === A.clipboardText + ' '`, `occurrences.length === 1`.
   - Paste file B **without any other edit** → assert: `insertReference` returned true, second dock
     chip and second composer occurrence exist, `occurrences.length === 2`, second occurrence's
     `offset` is after the first in clipboard coordinates, and no toast. This is the case that
     currently fails: it requires clipboard→detect conversion because a chip already exists.
   - Paste file C after typing free text between pastes (text + preceding chips + trailing-space
     append logic) → assert success and expected `draft` string.
   - Paste while `phase !== 'plain'` → assert the plugin's own guard throws its "wait" error and no
     record/dock chip leaks.
2. **Removal sequence (bug #2):**
   - One chip, click × → assert `consumeToken` returned true, composer occurrence removed,
     `draft` no longer contains the clipboard text, dock chip unmounted (not merely re-labeled),
     `records` no longer contains the ref.
   - Two chips A then B; remove **A** (an earlier chip shifts coordinates) → assert only A's
     occurrence/dock chip/record are gone and B remains with updated offsets. Removing the chip at
     the *start* is what exercises the coordinate-shrink path.
   - Two chips; remove **B**, then remove A (sequential removals — second removal must re-read the
     snapshot for both coordinates and `draftRev`).
   - **Guard-refusal path**: force `consumeToken` to return false (e.g. stale `draftRev` after an
     intervening edit) → assert the plugin does **not** delete the record and the dock chip does
     **not** render meta `unavailable` (assert `records.get(ref)` is defined and an explicit error
     state is shown instead).
   - Removal while `phase !== 'plain'` → assert no-op with chip intact and record retained.
3. **Cross-cutting assertions:** after every operation, `InputState.occurrences` offsets/lengths
   must be internally consistent with `draft` (each occurrence's clipboard text appears at
   `[offset, offset+length)`), and every span the plugin submits must satisfy
   `start/end ≤ detectTextLength` where the test derives detect length as
   `draft.length − Σ(length − 1)`.

## 5. Routine host-source checks before calling input-machine verbs (guidance)

- Read the **verb's guard, not just its signature**: which projection does the span index
  (`detectText` vs `clipboardText`), which revision field the CAS compares (`this.rev` vs the
  published `draftRev`), which phases are accepted, and which degenerate inputs (e.g.
  `start === end`) are rejected.
- Map every published field you read to its projection before using it numerically: the contract
  JSDoc states per-field which text `offset`/`length`/`draft` count (`U+FFFC` vs clipboard form).
  If a verb's parameters and your data are in different projections, convert explicitly at the
  boundary and unit-test the converter.
- Treat every boolean-returning verb as checkable: never mutate local bookkeeping (records, dock
  state) without confirming the host edit applied.
- Distrust your own error strings when diagnosing: a message that blames concurrency ("composer
  changed") should be verified against whether the rev CAS actually fired; a deterministic
  first-success-then-permanent-failure pattern almost always indicates a coordinate/identity
  mismatch, not a race.
- When available, dump `EditorProjection.detectText` in a debug session next to `InputState.draft`
  and diff their lengths — divergence equal to `Σ (chipLen − 1)` is this entire bug class in one check.
