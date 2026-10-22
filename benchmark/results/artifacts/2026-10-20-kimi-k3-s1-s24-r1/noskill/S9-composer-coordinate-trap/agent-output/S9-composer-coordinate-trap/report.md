# S9 · Composer Coordinate Trap — Diagnosis & Fix Report

Plugin: `@org/dsh-attach-input` v0.2.3 · Host: DSH `0.1.2-alpha.3`
Evidence: `fixture/plugin-client.js`, `fixture/console-session.txt`,
`fixture/host-input-contract.ts`, `fixture/host-input-facade.ts` (read-only, unmodified).

## Root cause (one sentence)

**Both symptoms are a single contract misread: the plugin computes `TokenSpan`
coordinates in the clipboard-text projection, while every host verb guard and splice
operates in the detect projection** (chip = one U+FFFC). The removal bug is
additionally amplified by ignoring the verb's boolean return.

---

## 1. Why the FIRST paste succeeds and every later paste fails with the toast

### The exact mismatch

- What the plugin computes (`plugin-client.js:21-32`): the insert span is
  `{ start: snapshot.draft.length, end: snapshot.draft.length, draftRev: snapshot.draftRev }`.
  Per the published contract (`host-input-contract.ts:26-27`), `InputState.draft` is the
  **clipboard-text projection**: "chips expanded to their clipboard form". Each chip
  contributes its full `clipboardText` (here `[attachment: screenshot.png]` = 28 chars).
- What the host verb compares/splices against (`host-input-facade.ts:11-26`):
  `insertReference(ref, span)` documents `span` as "pick-time span snapshot
  **(detect coordinates)**"; it reads the tail from `this.projection.detectText.slice(span.end, …)`
  (line 18) and applies the edit with `$replaceDetectSpanWithNodes(span, nodes)` (line 24).
  Per `host-input-contract.ts:36-37`, `EditorProjection.detectText` is the
  "Trigger/TokenSpan coordinate text (**chip = one U+FFFC**)" — each chip occupies
  **exactly one character** there.

So `span.start`/`span.end` are denominated in the wrong currency: clipboard offsets
vs. detect offsets.

### The numbers from the capture

After paste #1 (`console-session.txt:7-9`):
- `draft` = `"[attachment: screenshot.png] "` → length **29** (clipboard projection)
- `detectText` = `"\uFFFC "` → length **2** (chip = 1 char + the separating space)

On paste #2 the plugin passes `start = end = 29`. The `draftRev` CAS
(`host-input-facade.ts:17`) **passes** — the plugin re-snapshots at `plugin-client.js:11`,
so the revision is fresh. What fails is the coordinate range: offset 29 does not exist in a
2-character detect text, so `$replaceDetectSpanWithNodes` cannot apply the edit,
`applied` stays `false`, the verb returns `false`, and the plugin throws its generic
message at `plugin-client.js:35` ("The DSH composer changed before the attachment could be
inserted"). **The toast text is misleading: nothing "changed" — the revision guard is not
the failing guard; the span simply does not denote a position in detect text.**

### Why "first works, later fails" is the signature

The two projections diverge only where a chip exists:
- Empty composer: `draft` = `detectText` = `""`. Insertion point 0 is valid in both
  systems. Paste #1 succeeds **by degenerate coincidence**, not by correctness.
- After the first chip: each chip inflates the clipboard projection by
  `clipboardText.length − 1` (here 27) relative to detect. Plain typed text does not
  diverge (identical in both projections), so the defect stays hidden until a chip is
  present — which is exactly "paste #1 OK, paste #2+ always fail". Any repeat interaction
  that reads `draft.length` after a chip exists inherits the accumulated offset error.

---

## 2. Why the × click turns the chip into `unavailable` instead of removing it

### Removal path trace

1. × on the dock chip → `remove(sessionId, occurrence)` (`plugin-client.js:43-60`).
2. The plugin builds
   `span = { start: occurrence.offset, end: occurrence.offset + (occurrence.length ?? 1), draftRev }`
   (line 49-53). Per `host-input-contract.ts:14-17`, `Occurrence.offset`/`length` are
   "**in the clipboard-text projection**" — for the first chip: `{ start: 0, end: 28 }`.
3. Host `consumeToken` span guard (`host-input-facade.ts:38`): `draftRev` is fresh and
   `start !== end`, so the guard **passes**; then `$replaceDetectSpanWithText({0..28}, '')`
   (line 41) runs against the 2-character detect text. The chip's detect span is `[0, 1)`;
   the requested range `[0, 28)` overshoots the document and does not denote the chip, so
   the chip's U+FFFC is never removed. The verb returns `false`
   (`console-session.txt:18`: "returned (not inspected by the plugin code)").
4. **The plugin ignores the boolean** and unconditionally executes
   `records.delete(occurrence.ref); changed();` (`plugin-client.js:58-59`).

### Why the UI shows `unavailable`

The dock renders from the host's `occurrences` (the composer was never edited, so the
occurrence still exists), but the meta line comes from the plugin's own `records` map
(`plugin-client.js:62-65`): `record === undefined ? 'unavailable' : humanBytes(...)`.
After the unconditional `records.delete`, the still-present occurrence has no record →
meta flips to `unavailable`, dock chip stays, composer chip stays
(`console-session.txt:19-21`). Plugin bookkeeping has diverged from host state.

**Same root misread as bug #1** (clipboard coordinates fed to a detect-coordinate verb),
plus a secondary defect: an unchecked success return that converts a failed host edit into
silent local state corruption.

---

## 3. Fix direction — the conversion rule, derived from the host source

### The rule

From `host-input-contract.ts`: a chip = **1 char (U+FFFC)** in detect text (line 36) and
**`clipboardText.length` chars** in the clipboard projection / `draft` / `Occurrence`
coordinates (lines 14-17, 26-27, 38-41). Therefore, with occurrences sorted by offset:

```
detectOffset(clipboardOffset) =
    clipboardOffset − Σ (occ.length − 1)   over all occurrences fully before clipboardOffset
                                           (occ.offset + occ.length ≤ clipboardOffset)
```

and a chip's detect length is **always exactly 1**. Sanity check against the capture:
end-of-draft detect offset = 29 − (28 − 1) = **2** = `"\uFFFC ".length` ✓.
(`draftRev` needs no conversion — it is projection-independent revision currency and the
plugin already re-snapshots it correctly.)

### Call site 1 — insert path (`plugin-client.js:21-32`)

Replace `start/end: snapshot.draft.length` with the detect-coordinate end of draft:

```js
const detectEnd = snapshot.draft.length
  - snapshot.occurrences.reduce((acc, o) => acc + (o.length - 1), 0);
// (or read projection.detectText.length directly, if the facade exposes the projection)
input.insertReference({ … }, { start: detectEnd, end: detectEnd, draftRev: snapshot.draftRev });
```

Keep the existing re-snapshot after the `setDraft` padding call and after each loop
iteration — those are already correct and remain necessary.

### Call site 2 — removal path (`plugin-client.js:43-60`)

Convert the occurrence's clipboard range to its detect span — never pass
`occurrence.length` as a span length:

```js
const before = snapshot.occurrences.filter(o => o.offset + o.length <= occurrence.offset);
const detectStart = occurrence.offset - before.reduce((acc, o) => acc + (o.length - 1), 0);
const ok = input.consumeToken({
  kind: 'span',
  span: { start: detectStart, end: detectStart + 1, draftRev: snapshot.draftRev }, // chip = 1 U+FFFC
});
if (!ok) return;            // host rejected: keep the record, keep the dock meta correct
records.delete(occurrence.ref);
changed();
```

Also:
- **Check the boolean** on both verbs (insert already does; removal must). Local
  bookkeeping (`records`) may only mutate after the host confirms the edit.
- Drop the `occurrence.length ?? 1` fallback: `length` is non-optional in the contract;
  the fallback only masks contract violations.
- Coordinate math may only mix within one projection: the `setDraft` fallback path
  (line 56) slices `draft` with clipboard offsets — that one is internally consistent
  and can stay as the no-`consumeToken` fallback.

---

## 4. Regression test plan — interaction sequences to assert

**Repeat-interaction (bug #1):**
1. `T1` Fresh composer → paste file A → assert: no toast, 1 dock chip, 1 composer chip,
   `records` has A, `occurrences[0] = { offset: 0, length: clipboardText.length }`.
2. `T2` (core regression) With A's chip present → paste file B → assert: **no toast**,
   `insertReference` accepted, 2 chips in both dock and composer, draft =
   `"[attachment: A] [attachment: B] "`, B's occurrence offset = A's clipboard span + 1.
   This sequence must run with a chip already in the composer — an empty-composer-only
   test cannot catch this bug class.
3. `T3` Three consecutive pastes → all accepted; occurrences sorted, offsets contiguous.
4. `T4` Type `"hello"` (no trailing space) → paste → assert the `setDraft` padding
   branch ran, insert accepted at the correct detect end, draft = `"hello [attachment: X] "`.
5. `T5` One clipboard event with 2 files (the `for` loop) → both chips inserted; asserts
   the in-loop re-snapshot keeps `draftRev` and detect end fresh.
6. `T6` Negative: force a stale `draftRev` (interleave a host edit between snapshot and
   insert) → verb returns false → assert error thrown **and** the orphan ref rolled back
   out of `records`.

**Removal (bug #2):**
7. `T7` (core regression) Paste A → click × on the dock chip → assert: composer
   `occurrences` empty, dock chip gone, record deleted. Then paste C → succeeds (clean state).
8. `T8` Paste A, paste B → × on the **first** chip → assert: only A removed; B's chip
   remains with correctly shifted offsets; B's record intact; dock shows only B.
   (Removing offset-0 with a 28-char clipboard span is exactly the original failure mode.)
9. `T9` Paste A, B → × on the **second** chip (non-zero offset; exercises the
   Σ(len − 1) conversion) → assert only B removed.
10. `T10` Failure honesty: stub `consumeToken` to return `false` → click × → assert:
    record **retained**, dock meta still `humanBytes(total)` — never `unavailable` —
    composer chip intact; plugin and host state stay in sync.
11. `T11` Double-click × rapidly → second click is a harmless no-op.
12. `T12` Host without `consumeToken` → `setDraft` fallback removes chip + record
    consistently.

**Invariant assertion after every sequence:** `draft` equals the occurrences expanded to
their `clipboardText` spans; `detectText.length === draft.length − Σ(occ.length − 1)`
(if the projection is readable); `records` keys === composer occurrence refs for this
plugin's `SOURCE`. A test that asserts only the dock or only `records` is insufficient —
bug #2 was precisely a desync between the two.

---

## 5. Routine host-source checks before calling input-machine verbs (guidance)

Before shipping against any input-machine verb, read the host facade source for:

1. **Which projection each parameter lives in.** The splice helpers name the coordinate
   space (`$replaceDetectSpanWithNodes/Text`, `projection.detectText` vs
   `projection.clipboardText`). A `TokenSpan` is detect coordinates; `draft`,
   `Occurrence.offset/length` are clipboard coordinates. Never mix fields from different
   projections in one expression.
2. **Every guard clause and each distinct false-return branch** (phase, `draftRev` CAS,
   empty-span rejection `start === end`, bare-token trimmed-draft equality) — and map them
   to distinct diagnostics instead of one generic toast that misattributes the cause.
3. **Whether the verb returns a success boolean.** If it does, checking it is part of the
   contract; local bookkeeping must only commit on host confirmation.
4. **The doc comments on published contract fields** you consume (`InputState`,
   `Occurrence`, `EditorProjection`) — they state the projection of every coordinate
   field ("chip = one U+FFFC", "offset in the clipboard-text projection").
5. **Re-diff these files on every host upgrade** (e.g. `0.1.2-alpha.3` → next): facade
   guards and projection semantics can shift under you; pin and re-verify.
6. **Keep a projection-consistency invariant in tests** (draft ↔ occurrences ↔ detect
   length) so any future coordinate drift fails loudly in CI rather than as a user toast.
