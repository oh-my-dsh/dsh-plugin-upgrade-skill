# JUDGE BRIEF · skill.S9-composer-coordinate-trap

## Criteria (sealed rubric)
- [projection-contract] (20pt) Use host-input-contract.ts and host-input-facade.ts to distinguish published draft/Occurrence clipboard-text offsets from the detect-coordinate spans used by insertReference and consumeToken. A chip expands to clipboardText in the former and occupies one U+FFFC in the latter; ordinary text and separating spaces still contribute their normal width. Equivalent descriptions without exact type names are valid.
- [repeat-paste-failure] (20pt) Locate snapshot.draft.length in plugin-client.js add and connect the captured first-success/second-failure behavior to the host detect-span splice. With an initially empty composer both coordinates coincide; after a chip, clipboard length overshoots the detect span and insertReference returns false, which the plugin turns into its changed-composer toast. Do not infer a real concurrent edit from the toast or require inconsistent hardcoded character counts from the capture.
- [removal-and-bookkeeping] (20pt) Trace plugin-client.js remove: occurrence.offset/length are passed unconverted to consumeToken, its false result is ignored, and records.delete runs anyway. The live occurrence remains, while missing record data renders unavailable in the dock and the composer chip stays. Tie both symptoms to the same coordinate mismatch, rather than treating unavailable as a separate upload failure.
- [conversion-and-success-gate] (20pt) Derive and apply the conversion at BOTH call sites: subtract the sum of (occurrence.length - 1) for preceding chips; for insertion at draft end account for all preceding occurrences, and for removal map occurrence.offset then use a one-detect-character span. Keep the revision guard; retire records only after successful consumption or a verified successful clipboard-coordinate fallback. Equivalent correct mapping/pseudocode is sufficient; merely saying convert offsets is incomplete.
- [regression-sequences] (20pt) Propose two successive pastes with both occurrences/chips present, then remove a chip with another preceding chip and assert composer occurrence, dock chip and record are removed together while the other chip survives. Declined-consumption bookkeeping, first/last-chip and empty-again variants are valid additions. Code assertions and natural language are equivalent. Score only task items 1-4; item 5 host-source-reading discipline is explicitly unscored.

## Caps (score ceilings; judge returns each with triggered true/false)
(none)

## Candidate report(s)
#### FILE: S9-composer-coordinate-trap/report.md

# S9 · Composer Coordinate Trap — Diagnosis Report

**Plugin:** `@org/dsh-attach-input` v0.2.3 · **Host:** DSH `0.1.2-alpha.3`
**Verdict:** both symptoms are **one contract misread**, not two bugs. The plugin hands the
host's input-machine verbs a `TokenSpan` expressed in the **clipboard/draft projection**,
while the verbs interpret `span.start`/`span.end` in the **detect projection**
(`detectText`, where each chip is exactly one U+FFFC). The insert path and the removal path
both commit the same projection error; the removal path then compounds it with an
unconditional bookkeeping delete.

The two projections of the same editor document (from `host-input-contract.ts`):

- `EditorProjection.detectText` — "Trigger/TokenSpan coordinate text (chip = one U+FFFC)".
- `InputState.draft` / `Occurrence.offset` / `Occurrence.length` — "clipboard-text
  projection" (each chip expanded to its `clipboardText`, e.g. `[attachment: screenshot.png]`).

The verbs (`host-input-facade.ts`) operate on the **detect** text for every span:
`insertReference` reads `this.projection.detectText.slice(span.end, span.end+1)` and calls
`$replaceDetectSpanWithNodes(span, …)` ("splice the DETECT text"); `consumeToken`'s span
guard calls `$replaceDetectSpanWithText(guard.span, '')`. Only the revision CAS
(`span.draftRev !== this.rev`) is shared across both projections — it is the **position**,
not the revision, that diverges.

---

## 1. Why paste #1 succeeds and every later paste fails

**The exact mismatch.** The plugin inserts "at the end of the draft" and passes the span
`{ start: snapshot.draft.length, end: snapshot.draft.length, draftRev: snapshot.draftRev }`.
`snapshot.draft.length` is a **clipboard-projection** offset (chip = its 28-char
`clipboardText`). `insertReference`'s `span` is a **detect-projection** offset (chip =
one U+FFFC). The guard and the splice both live in detect coordinates.

**Why "first works, later fails" is the signature.** With an empty composer the two
projections coincide (`draft.length === detectText.length === 0`), so span
`{0,0}` is valid in both. After the first insert they diverge: detect becomes
`U+FFFC + " "` (length **2**), but draft becomes
`"[attachment: screenshot.png] "` (length **29**). Paste #2 therefore passes
`{start:29, end:29}`, which is past the end of the 2-character detect text; the
zero-width splice cannot apply, `applied` stays `false`, `insertReference` returns
`false`, and the plugin throws *"The DSH composer changed before the attachment could be
inserted"*. The draft grows `clipboardText.length − 1 = 27` characters more than the detect
text per inserted chip (plus the separator), so the offset drift appears **only after at
least one chip exists** — exactly the observed "first ok, every later fails" signature.

## 2. Why the × click turns the chip into `unavailable` instead of removing it

Trace of `remove(sessionId, occurrence)`:

1. `snapshot.phase === 'plain'` passes, so removal proceeds.
2. The plugin computes `end = occurrence.offset + occurrence.length = 0 + 28 = 28` — again
   **clipboard coordinates**.
3. `typeof input.consumeToken === 'function'` → it calls the **span** guard
   `{kind:'span', span:{start:0, end:28, draftRev}}`.
4. In the facade, the span guard checks `draftRev` (passes — same revision) and
   `start !== end` (passes), then runs
   `$replaceDetectSpanWithText({start:0, end:28}, '')` against a **2-character** detect
   text. The span end (28) is far past the detect length, the splice no-ops,
   `applied` stays `false`, and `consumeToken` returns `false`. **No edit is applied**,
   so the composer chip survives.
5. The plugin does **not inspect the return value** (the capture notes "returned (not
   inspected)") and unconditionally runs `records.delete(occurrence.ref)`.
6. `changed()` re-renders the dock; `records.get(occurrence.ref)` is now `undefined`,
   and the renderer's fallthrough branch (`record === undefined`) prints `unavailable`.

So the `unavailable` label is **not the host** marking the occurrence unavailable — it is
the plugin's own renderer falling through after the plugin deleted its record map entry while
the editor occurrence still existed.

## 3. Fix direction

**The conversion rule (derived from the host source).** In detect text each occurrence is one
U+FFFC; in the draft it is `length` characters. Therefore, for any clipboard/draft offset,
subtract `(length − 1)` for every occurrence that lies entirely before it:

- detect position of a draft offset `p` =
  `p − Σ (o.length − 1)` over occurrences with `o.offset + o.length ≤ p`.
- detect length of the whole document =
  `draft.length − Σ_{all occurrences}(o.length − 1)`.

**Insert path (insert at the end).** Recompute the detect end from the current snapshot, and
pass it as a zero-width detect span (recompute each loop iteration, because the plugin
re-snapshots after every insert):

```js
const detectEnd = snapshot.draft.length
  - snapshot.occurrences.reduce((s, o) => s + (o.length - 1), 0);
const accepted = input.insertReference(
  { source: SOURCE, ref, label: item.path, appearance: 'file',
    clipboardText: `[attachment: ${item.path}]` },
  { start: detectEnd, end: detectEnd, draftRev: snapshot.draftRev },
);
```

**Removal path.** Convert `occurrence.offset` to its detect coordinate. Because
`snapshot.occurrences` is sorted by offset, the detect position of the occurrence at index
`i` is `occurrence.offset − Σ_{j<i}(occurrences[j].length − 1)`, and the chip occupies
exactly one U+FFFC there:

```js
const occs = snapshot.occurrences;
const i = occs.findIndex(o => o.occurrenceId === occurrence.occurrenceId);
let detectStart = occurrence.offset;
for (let j = 0; j < i; j++) detectStart -= (occs[j].length - 1);
const consumed = input.consumeToken({
  kind: 'span',
  span: { start: detectStart, end: detectStart + 1, draftRev: snapshot.draftRev },
});
if (consumed) { records.delete(occurrence.ref); changed(); }
// else: do NOT delete the record — the occurrence still exists; keep dock/editor consistent.
```

Three mandatory changes, in short:

1. **Insert**: `span` in detect coordinates (`draft.length − Σ(length−1)`), not
   `draft.length`.
2. **Remove**: `span` in detect coordinates (`detectStart .. detectStart+1`), not
   `occurrence.offset .. occurrence.offset+length`.
3. **Remove bookkeeping**: gate `records.delete` on `consumeToken`'s truthy return; never
   delete the record when the host did not consume the token.

(The `else` fallback branch that uses `input.setDraft(slice(0,offset)+slice(end))` is
already correct: `setDraft` operates on the clipboard/draft projection, so removing the
`[offset, offset+length)` range there is the right span. Only the span-guard branch needed
conversion.)

## 4. Regression test plan

Assert these interaction sequences end-to-end, in a fresh empty composer each, plus the unit
checks on the conversion helper:

- **T1 — first insert (empty doc).** Paste one file → assert `insertReference` returns
  `true`; dock shows one chip `[name · bytes · ×]` (no `unavailable`); draft ===
  `clipboardText + " "`; occurrences `[{offset:0, length:clipboardText.length}]`.
- **T2 — repeat insert (the regression that was missed).** After T1, paste a **second** file
  → assert `insertReference` returns `true`, no toast, two chips in both dock and
  composer; draft === `c1 + " " + c2 + " "`; two occurrences with correct offsets/lengths.
- **T3 — triple repeat.** Paste a third file after T2 → all three inserts return `true`, no
  toast; proves the conversion is prefix-sum-correct beyond the first collision.
- **T4 — insert after trailing plain text.** Type `"hello"` (no chip) then paste → insert
  returns `true` and the chip lands after `"hello"` (detect offset = text length).
- **T5 — insert after a chip followed by text.** `chip + "world"` then paste → chip lands at
  the end, detect offset accounts for both the collapsed chip and the literal text.
- **T6 — removal of the first chip.** With ≥2 chips, click × on the **first** dock chip →
  assert `consumeToken` returns `true`, that chip disappears from **both** dock and
  composer, the record is deleted, and the remaining chip's `offset`/detect position shift
  correctly (no `unavailable`, no residual record).
- **T7 — removal of a middle chip.** With 3 chips, remove the middle one → only that chip is
  gone; the flanking chips and their labels stay intact and correct.
- **T8 — removal of the last chip.** Remove the final chip → returns `true`, chip gone, and
  the document's detect length returns to the plain-text remainder.
- **T9 — removal rejection does not corrupt bookkeeping.** Force a stale `draftRev` (or
  stub `consumeToken` to return `false`) on the remove path → assert the record is **not**
  deleted, the dock chip keeps its real size label (never `unavailable`), and the composer
  chip remains.
- **T10 — insert rejection cleans up.** Stale `draftRev` on insert → `insertReference`
  returns `false`, the just-created record is deleted, and the toast fires exactly once.
- **T11 — phase guard.** Attempt insert/remove while `snapshot.phase !== 'plain'` → verb is
  rejected or skipped cleanly, with no partial record or `unavailable`.
- **Unit checks (conversion helper).** For fixture occurrence sets (0, 1, 2, 3 chips, with
  interleaved literal text) assert `detectLen === draft.length − Σ(length−1)` and each
  occurrence's `detectStart === offset − Σ_{before}(length−1)`; assert every span end ≤
  detect length.

T2 and T6/T7 are the minimum non-negotiable pair — they cover the repeat-interaction and the
removal sequences that currently fail. T9 guards the bookkeeping half of the removal bug
independently of the coordinate fix.

## 5. Routine host-source checks before calling input-machine verbs

Before every call into the input machine, read the verb's own source and contract, not just
its public type names, and answer these five questions:

1. **Which projection does each argument live in?** Match the verb's parameter doc ("detect
   coordinates" / "clipboard-text projection") against the state object you are reading from
   (`InputState.draft`/`occurrences` are clipboard; `TokenSpan` is detect). Never mix a
   length/offset from one projection into the other.
2. **What does the guard actually compare/splice?** Grep the guard body for which string the
   verb slices or splices — `detectText.slice` / `$replaceDetectSpanWith*` means detect
   coordinates; `clipboardText.trim()` / `setDraft` means draft coordinates.
3. **Which field is the CAS key, and which is positional?** `draftRev` is the shared editor
   revision and will pass in both projections; a passing revision check does **not** validate
   your span's coordinate system.
4. **Does the verb return a boolean I must honor?** Any verb documented as "returns whether
   the edit applied" must have its return checked, and local bookkeeping (record add/delete)
   must be gated on that result — never mutate bookkeeping unconditionally.
5. **Am I testing only the degenerate empty-document case?** An empty document is where all
   coordinate systems coincide and hides projection bugs; always re-snapshot and recompute
   after each mutation, and always smoke-test the **repeat-interaction** sequence (insert
   two, remove each) rather than a single-shot happy path.

No corridor card in `skills/plugin-upgrade/references/` covers this input-machine
coordinate contract (grep for `insertReference`/`consumeToken`/`TokenSpan`/`detectText`/
`U+FFFC`/`draftRev` found no card), so the correction rule above is derived directly from
the two host excerpts in the fixture (`host-input-contract.ts`, `host-input-facade.ts`).


## Required output (JSON only)
{"decisions":[{"id":"<criterion-id>","verdict":"pass|partial|fail|missing","reason":"short"}],"caps":[{"id":"<cap-id>","triggered":false,"reason":"short"}]}
Every criterion and cap exactly once. pass=full points, partial=half, fail/missing=0; a triggered cap caps the total.