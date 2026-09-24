# S9 · Composer Coordinate Trap — diagnosis report

Plugin: `@org/dsh-attach-input` v0.2.3 on DSH `0.1.2-alpha.3`
Evidence: `fixture/plugin-client.js`, `fixture/console-session.txt`, `fixture/host-input-facade.ts`, `fixture/host-input-contract.ts` (read-only; nothing in `fixture/` was modified).

## TL;DR

Both bugs are one defect, not two: the plugin builds every `TokenSpan` from **clipboard-text projection coordinates** (`InputState.draft.length`, `Occurrence.offset`/`Occurrence.length`), but both host verbs (`insertReference` and `consumeToken(kind:'span')`) interpret `TokenSpan.start/end` in **detect coordinates** (`EditorProjection.detectText`, where a chip is exactly one U+FFFC character). The two coordinate systems are numerically identical only while the composer contains zero chips — which is why the first paste works and every later one fails.

---

## 1. Why the first paste succeeds and every later paste fails

### The exact mismatch

The plugin inserts with (`plugin-client.js`, `add`):

```js
input.insertReference({ source, ref, label, appearance, clipboardText }, {
  start: snapshot.draft.length,   // ← clipboard-text projection coordinate
  end:   snapshot.draft.length,   // ← clipboard-text projection coordinate
  draftRev: snapshot.draftRev,
});
```

`snapshot` comes from `input.state.getSnapshot()`, and the contract is explicit about what `draft` is (`host-input-contract.ts`):

> `draft` — *Clipboard-text projection of the editor document (**chips expanded to their clipboard form**).*

But the host verb's parameter is documented as detect coordinates (`host-input-facade.ts`):

```ts
/** @param span - pick-time span snapshot (detect coordinates). */
insertReference(ref: ReferenceInsert, span: TokenSpan): boolean {
  ...
  const tail = this.projection.detectText.slice(span.end, span.end + 1)
  ...
  applied = $replaceDetectSpanWithNodes(span, nodes)   // splices the DETECT text
```

and the contract defines the coordinate space TokenSpan lives in:

> `detectText` — ***Trigger/TokenSpan coordinate text* (chip = one U+FFFC).**

So the plugin computes the span in a projection where a chip occupies its full `clipboardText` (28 chars for `[attachment: screenshot.png]`), while the host reads and splices a projection where that same chip is **one** character (U+FFFC).

### Step-by-step against the capture

After paste #1 (from `console-session.txt`):

- clipboard `draft` = `"[attachment: screenshot.png] "` → length **29**
- `detectText` = `"\uFFFC "` (one chip char + the host-inserted separator space) → length **2**

**Paste #1 (works):** the composer was empty, so `draft.length = 0` and `detectText.length = 0`. With no chips the two projections are character-for-character identical, so the wrong unit is invisible: span `{0, 0, rev}` is a valid empty span in *either* coordinate system. `tail = detectText.slice(0,1) = '' ≠ ' '`, the host splices in `[chipNode, " "]`, and the insert applies.

**Paste #2 (fails):** `snapshot.draft.length = 29` (ends with a space, so the plugin's whitespace-pad branch is skipped and the snapshot is unchanged). The plugin sends span `{start: 29, end: 29, draftRev}`:

- `draftRev` CAS **passes** (nothing else edited the composer) — so the toast's wording "the DSH composer changed" is misleading; this is not a revision race;
- `tail = detectText.slice(29, 30)` → `''` (detect doc is only 2 chars);
- `$replaceDetectSpanWithNodes({29, 29}, …)` cannot splice at offset 29 of a 2-character document → `applied = false` → `insertReference` returns `false`;
- the plugin then does `records.delete(ref)` and throws the toast error.

Every subsequent paste fails for the same reason, and the divergence only grows: each accepted chip adds `len(clipboardText) + 1` chars to the clipboard projection but exactly 2 chars (chip + separator) to the detect projection.

### Why "first works, later fails" is the signature of this mismatch

The two projections are defined to be identical exactly when the document contains zero chips (both reduce to the plain typed text). So any span computed in the wrong unit is *correct on the first call into an empty composer* and *wrong on every call once a chip exists*. That deterministic first-call-only pattern is the fingerprint of a projection-unit mismatch:

- a genuine "composer changed" race would be intermittent and timing-dependent, not 100% reproducible on paste #2 in a fresh session;
- an off-by-one or revision bug would typically fail on the first call too, or fail nondeterministically;
- only "the coordinate base diverges as soon as the first chip is inserted" produces exactly *first succeeds, every later one fails*.

## 2. Why the × click turns the chip into `unavailable` instead of removing it

### The removal path

`plugin-client.js`, `remove`:

```js
const end = occurrence.offset + (occurrence.length ?? 1);   // clipboard coords: 0 + 28
input.consumeToken({
  kind: 'span',
  span: { start: occurrence.offset, end, draftRev: snapshot.draftRev },  // {0, 28}
});
records.delete(occurrence.ref);   // unconditional
changed();
```

`occurrence` is an `Occurrence` from `InputState`, and the contract pins its units:

> `offset` / `length` — *Offset/Length in the **clipboard-text projection**; the occurrence occupies exactly [offset, offset+length).*

The host verb, however, splices detect coordinates again (`host-input-facade.ts`):

```ts
if (guard.kind === 'span') {
  if (guard.span.draftRev !== this.rev || guard.span.start === guard.span.end) return false
  this.applyEdit(() => { applied = $replaceDetectSpanWithText(guard.span, '') })
  return applied
}
```

For the captured session: the plugin sends `{start: 0, end: 28, draftRev}`. Both host guards pass (rev matches; 0 ≠ 28), but `$replaceDetectSpanWithText` operates on a detect document of length 2 (`"\uFFFC "`), so a span reaching to offset 28 is out of bounds and the splice does not apply — the composer chip survives (confirmed by the capture: "composer chip still present"; had the span been interpreted as a clamp-and-delete, the U+FFFC would have been removed and the chip would be gone, contradicting the log). `consumeToken` returns `false`.

Note the comment in the plugin is exactly backwards for detect coordinates — *"the removal must span `occurrence.length`, not one character"* — in detect space the occurrence **is** one character (the U+FFFC), which is precisely what must be spanned.

### The plugin-side bookkeeping that turns it into `unavailable`

The plugin never inspects the verb's return value (the capture even notes *"consumeToken(...) returned (not inspected by the plugin code)"*). It unconditionally runs `records.delete(occurrence.ref)` and `changed()`. The dock re-render then evaluates the rendering excerpt:

```js
... : record === undefined ? 'unavailable' : humanBytes(record.total)
```

`records.get(occurrence.ref)` is now `undefined` because the record was deleted even though the corresponding composer occurrence still exists — so the dock chip remains rendered with its size label replaced by **`unavailable`**. The chip inside the composer also stays, because the host never applied the splice. Result: a zombie chip in both places, exactly as reported.

### One underlying contract misread

Symptom 2 is the same misread as symptom 1, on the second verb: `TokenSpan` passed to `consumeToken(kind:'span')` must be in detect coordinates, and the plugin fed it clipboard coordinates (`occurrence.offset`/`occurrence.length` straight out of `InputState.occurrences`). The only span field the plugin ever got right is `draftRev` — the revision counter is shared by both projections (it is the editor revision, not a projection coordinate).

## 3. Fix direction

### The conversion rule (derived from the host source)

The contract defines the relationship between the two projections:

- `detectText`: chip = **one** U+FFFC character;
- `clipboardText` (= `InputState.draft`): chip = its full `clipboardText` string;
- `Occurrence.offset/length`: position and extent in the clipboard projection;
- plain (non-chip) text is identical in both projections.

Therefore, for a clipboard-projection position `p`, the detect-projection position is obtained by collapsing every chip that lies entirely before `p` down to one character:

```
detectPos(p) = p − Σ (o.length − 1)   for every occurrence o with o.offset + o.length ≤ p
```

and an occurrence's own detect span is `[detectPos(o.offset), detectPos(o.offset) + 1)` — length exactly 1.

Sanity check against the capture: after paste #1, `draft.length = 29`, one occurrence with `length = 28` → insert point `29 − (28 − 1) = 2` = `detectText.length` ✓. For the × click: occurrence at `offset 0` → detect span `{start: 0, end: 1}` → splices exactly the U+FFFC ✓.

(If the facade/projection with `detectText` is reachable from plugin client code, read the positions from it directly; otherwise the arithmetic above uses only the published `InputState.occurrences`, which the plugin already consumes. In both cases the rule — chip = 1 char — comes from the contract text, not from trial and error.)

### Call site 1 — the insert path (`add`)

Compute the span in detect coordinates:

```js
const occurrences = snapshot.occurrences;
const detectEnd = occurrences.reduce(
  (pos, o) => pos - (o.length - 1),   // collapse each chip to one char
  snapshot.draft.length,              // insert at end of draft (clipboard length)
);
const accepted = input.insertReference({ ... }, {
  start: detectEnd,
  end: detectEnd,
  draftRev: snapshot.draftRev,
});
```

Inside the multi-item loop the plugin already re-snapshots after each insert (`snapshot = input.state.getSnapshot()`), so the conversion must use that refreshed snapshot's `draft.length` and `occurrences` (the just-inserted chip shifts everything). No change is needed to the `draftRev` handling — it is already correct.

### Call site 2 — the removal path (`remove`)

Convert the occurrence's clipboard span to its one-character detect span:

```js
const detectStart = snapshot.occurrences
  .filter(o => o.offset + o.length <= occurrence.offset)
  .reduce((pos, o) => pos - (o.length - 1), occurrence.offset);
const accepted = input.consumeToken({
  kind: 'span',
  span: { start: detectStart, end: detectStart + 1, draftRev: snapshot.draftRev },
});
```

The `occurrence` object must be re-read from the *current* snapshot at click time (offsets of later chips shift after any edit or earlier removal) — deriving it from a stale dock render would reintroduce the same class of bug at a different offset.

### Call site 3 — the bookkeeping around the verbs (both paths)

Honor the boolean contract of both verbs:

- `add`: only keep the record / proceed when `insertReference` returns `true`; the current code already deletes the record on failure, but the error message should not claim "the composer changed" unless `snapshot.draftRev !== rev` actually indicates a race — a rejected splice is a caller bug and should be surfaced as such (it makes this defect look like a timing issue in production reports).
- `remove`: only run `records.delete(occurrence.ref)` and `changed()` when `consumeToken` returns `true`. On `false`, leave the record and the dock chip intact (optionally retry once with a fresh snapshot). This alone would have prevented the `unavailable` zombie even before the coordinate fix, and it is the correct defense for any future guard rejection.

The `setDraft` fallback branch in `remove` operates on the clipboard draft and can stay as a fallback, but note it bypasses the chip-aware editor edit; prefer the corrected `consumeToken` span path.

## 4. Regression test plan

Sequences that must be asserted (integration level, against the real input machine — unit tests with a stubbed facade would have missed this because the stub shares the plugin's misreading):

- **T1 · First paste (baseline, must keep passing):** fresh empty composer → paste file → assert `insertReference` returned `true`; exactly one composer chip; `draft === "[attachment: <path>] "`; one occurrence with `offset 0`, `length = clipboardText.length`; dock chip shows `humanBytes(size)`.
- **T2 · Second paste (the reported bug):** with T1's chip present, paste a second file → assert `true`; two composer chips; two occurrences sorted by offset; **no toast**; dock shows two chips with correct byte labels. This is the exact user sequence and fails today.
- **T3 · Repeated pastes / multi-item paste:** paste three files in a row, and one paste carrying two items → all chips present, all inserts accepted, occurrence offsets strictly increasing and consistent with `draft`.
- **T4 · Plain text around chips:** type text before and after existing chips, then paste → insert-at-end span still resolves to the correct detect offset (exercises the conversion with non-chip text on both sides of the insertion point).
- **T5 · Remove the last chip:** click × on the final chip → `consumeToken` returns `true`; chip gone from the composer; `draft` no longer contains its `clipboardText`; occurrence list empty; dock chip removed; `records` empty.
- **T6 · Remove a middle chip:** two chips; click × on the first → first occurrence gone, second occurrence's `offset` re-read from a fresh snapshot; then click × on the remaining chip → also removed. Asserts the post-removal offset shift is handled.
- **T7 · Rejected removal leaves state intact:** between dock render and × click, bump the revision (simulate a keystroke so `draftRev` changes) → `consumeToken` returns `false` → assert the record is **kept**, the dock chip still shows its byte size (never `unavailable`), the composer chip is still present, and a retry after re-render succeeds.
- **T8 · Interleaved insert/remove:** paste, remove, paste again in one session → second insert must succeed (asserts the insert conversion works against a detect document that shrank back).
- **T9 · Projection invariant (host-side assert):** after every step of T1–T8, assert `detectText.length === draft.length − Σ(o.length − 1)` and that every occurrence maps to exactly one U+FFFC in `detectText`. This is the invariant whose violation caused both bugs; asserting it continuously makes any future coordinate confusion fail loudly on the first offending call rather than on the second paste.
- **T10 · No false "composer changed" toasts:** across all happy paths, assert the toast string is never emitted.

## 5. Maintainer's routine source-reading discipline (unscored guidance)

Before calling any input-machine verb:

1. **Pin down the coordinate space of every coordinate-bearing argument.** Read the verb's doc comment and body for which projection it slices/splices (`detectText` vs `clipboardText`/`draft`). In this codebase, `TokenSpan` is *detect* coordinates — "detect" in `$replaceDetectSpanWith*` is the tell.
2. **Cross-check the contract types' field comments** (`host-input-contract.ts`) for each value you pass: `draft`/`occurrences` are clipboard projection; `detectText` is the TokenSpan base; chip = one U+FFFC vs chip = full `clipboardText`.
3. **Check the guard conditions, not just the happy path:** the rev CAS (`draftRev !== this.rev`), `start !== end`, and trimmed-draft equality for bare tokens — and what the returned `boolean` means. Never ignore a verb's return value before mutating local bookkeeping.
4. **Write the repeat-interaction test first:** any verb that takes coordinates should be exercised at least twice in one session with state (a chip) left behind by the first call — first-call-only tests cannot see projection divergence.
5. **Assert the projection invariant** (chip = 1 char in detect, `length` in clipboard) in integration tests, so a unit mismatch fails on call #1 instead of shipping as "works once, then breaks".
