# S9 · Composer Coordinate Trap — Diagnostic Report

Target: `@org/dsh-attach-input` v0.2.3 on DSH `0.1.2-alpha.3`
Evidence pack: `fixture/README.md`, `fixture/plugin-client.js`, `fixture/console-session.txt`, `fixture/host-input-facade.ts`, `fixture/host-input-contract.ts`

## Root cause in one sentence

Both bugs come from a single contract misread: the plugin computes span coordinates in the **clipboard-text projection** (`InputState.draft`), but both `insertReference` and `consumeToken` consume `TokenSpan` values in the **detect text projection** (`EditorProjection.detectText`, where every chip is exactly one U+FFFC) — and on the removal path it also ignores the verb's `boolean` return and deletes its own record unconditionally.

## Item 1 — Why the FIRST paste succeeds and every later paste fails

### The exact mismatch

The plugin builds the insert span from the clipboard projection, `plugin-client.js:29-31`:

```js
{
  start: snapshot.draft.length,
  end: snapshot.draft.length,
  draftRev: snapshot.draftRev,
}
```

But `host-input-facade.ts:11` documents `insertReference(ref, span)`'s span as a *"pick-time span snapshot (**detect coordinates**)"*, and lines 18/24 splice the **detect** text: `this.projection.detectText.slice(span.end, ...)` and `$replaceDetectSpanWithNodes(span, nodes)`. Per `host-input-contract.ts:35-41`, `detectText` renders each chip as **one U+FFFC**, while `draft` (the clipboard projection, contract line 27) expands each chip to its full `clipboardText` string.

### Why "first works, later fails" is the signature of that mismatch

- **Paste #1** (empty composer): both projections are empty, so clipboard coordinate 0 **equals** detect coordinate 0. The span (0, 0) with the current `draftRev` passes the guard (`host-input-facade.ts:17`: `span.draftRev !== this.rev → return false` is not triggered) and the splice lands correctly. `console-session.txt` lines 4-10 confirm: chip inserted, snapshot `draft = "[attachment: screenshot.png] "` (length 29).
- **Paste #2**: after paste #1 the two projections have diverged:
  - clipboard text: `"[attachment: screenshot.png] "` → length **29**
  - detect text: `"\uFFFC "` (one U+FFFC for the chip + the separating space the facade appends at `host-input-facade.ts:23`) → length **2**

  The plugin sends `start: 29, end: 29, draftRev: <current>`. The `draftRev` guard **passes** (the plugin re-snapshots at `plugin-client.js:37` after each insert, so the revision is fresh) — but offset 29 is far past the end of the 2-character detect text. `$replaceDetectSpanWithNodes` cannot splice at that position, `applied` stays `false`, and the verb returns `false`. The plugin's `if (!accepted)` branch (`plugin-client.js:33-36`) then deletes the record and throws exactly the observed toast: *"The DSH composer changed before the attachment could be inserted"* — misleading, because the composer did **not** change; the coordinates were in the wrong projection. `console-session.txt` lines 12-15 match: `insertReference returned false; no second chip anywhere`.

The "first works, later fails" pattern is the classic signature of a projection mismatch: on the first, empty document both coordinate systems coincide, so the bug is invisible; as soon as the first chip creates divergence between `detectText` (1 char per chip) and `clipboardText` (`clipboardText.length` per chip), every later offset lands outside the detect text and the splice fails. Had the `draftRev` guard been the cause, the failing return would depend on interleaved edits, not on paste ordinality.

## Item 2 — Why the × click turns the chip into `unavailable` instead of removing it

### The removal path

`plugin-client.js:49-57`:

```js
const end = occurrence.offset + (occurrence.length ?? 1);
if (typeof input.consumeToken === 'function') {
  input.consumeToken({
    kind: 'span',
    span: { start: occurrence.offset, end, draftRev: snapshot.draftRev },
  });
} else { /* setDraft fallback */ }
records.delete(occurrence.ref);
changed();
```

Two defects, one on each side of the call:

1. **Wrong projection again.** `occurrence.offset` and `occurrence.length` are defined in `host-input-contract.ts:14-17` as *"Offset in the **clipboard-text** projection"* / *"the occurrence occupies exactly [offset, offset+length)"*. But `consumeToken`'s span branch (`host-input-facade.ts:37-43`) does `$replaceDetectSpanWithText(guard.span, '')` — the **detect** text again. The plugin sends `{start: 0, end: 28}` (clipboard coordinates for `[attachment: screenshot.png]`); the detect text is only `"\uFFFC "` (2 chars). The guard at facade line 38 checks only `draftRev` and `start !== end` — both pass — so the invalid span reaches the splice, which cannot remove a 28-character span from a 2-character document. The composer chip survives (`console-session.txt` line 19: "composer chip still present").
2. **Bookkeeping ignores the verb's result.** `consumeToken` returns `boolean` ("whether the token was consumed", facade line 34), but the plugin does not inspect the return value and unconditionally runs `records.delete(occurrence.ref); changed();` (`plugin-client.js:58-59`). The dock renderer (`plugin-client.js:63-65`) maps a missing record to `'unavailable'`: `record === undefined ? 'unavailable' : humanBytes(record.total)`. So: consume fails → chip stays in the composer → record is still deleted from `records` → re-render finds `records.get(occurrence.ref) === undefined` → the stuck chip's size label flips to **`unavailable`**. `console-session.txt` lines 17-20 match all three observations exactly, including "records no longer contains the ref" and "consumeToken(...) returned (not inspected by the plugin code)".

Both symptoms therefore trace to the **same underlying contract misread** (clipboard vs. detect coordinates), with the `unavailable` label additionally amplified by deleting plugin-side state before checking the verb's boolean return.

## Item 3 — Fix direction: conversion rule and call sites

### The conversion rule (derived from the host source excerpts)

From `host-input-contract.ts`: `EditorProjection.detectText` renders **one chip = one U+FFFC**, `clipboardText` renders **one chip = `occurrence.clipboardText`** (length `occurrence.length`), and `occurrences` are sorted by offset in clipboard coordinates. Therefore, for any clipboard offset `c`:

```
detect(c) = c − Σ over occurrences o with o.offset + o.length ≤ c of (o.length − 1)
```

i.e. subtract, for every chip entirely before the offset, the extra characters its clipboard form contributes over the single detect character. A chip occupying clipboard `[offset, offset+length)` occupies exactly the single detect character at `detect(offset)`. Offsets strictly inside a chip have no detect equivalent — never target them. `draftRev` itself needs **no** conversion: it is the same monotonic `InputState.draftRev` in both projections (contract line 29, "span CAS compares against this"), and the session capture shows the revision was never the failing guard.

### Call site 1 — insert path (`plugin-client.js:21-32`)

Do not use `snapshot.draft.length`. Convert the intended "end of draft" position to detect coordinates:

```js
const detectEnd = detectOffset(snapshot.draft.length, snapshot.occurrences);
const accepted = input.insertReference({ /* unchanged ref payload */ }, {
  start: detectEnd,
  end: detectEnd,
  draftRev: snapshot.draftRev,
});
```

(If the snapshot exposed `detectText`, appending at `detectText.length` is equivalent — but the derivation must come from `occurrences`, since the plugin reads only the published `InputState`.) The facade then appends a separating space in detect space (facade lines 21-23) and bumps the revision; the existing re-snapshot at plugin line 37 stays correct.

### Call site 2 — removal path (`plugin-client.js:49-54`)

Replace the clipboard-span with the chip's single detect character, and honor the return value:

```js
const start = detectOffset(occurrence.offset, snapshot.occurrences);
const consumed = input.consumeToken({
  kind: 'span',
  span: { start, end: start + 1, draftRev: snapshot.draftRev }, // one U+FFFC per chip
});
if (!consumed) return;   // keep the record; the chip is still in the composer
records.delete(occurrence.ref);
changed();
```

The `setDraft` fallback (plugin line 56) already splices in clipboard coordinates and is correct as-is; but since the host on `0.1.2-alpha.3` exposes `consumeToken`, the span branch must use detect coordinates. Deleting the record only after a `true` return also fixes the `unavailable` symptom independently of the splice.

## Item 4 — Regression test plan

Each sequence asserts on both the composer document and the dock/records state:

1. **Repeat paste (bug #2).** Empty composer → paste file A → paste file B. Assert: no toast; two chips in the composer; `occurrences.length === 2` with non-overlapping clipboard ranges; two dock chips with byte-size labels; detect text length is 2 (two U+FFFC plus facade-appended spaces).
2. **First paste still works.** Empty composer → paste one file. Assert: exactly one chip; `draft` equals the occurrence's `clipboardText` plus trailing space; dock label is the file size (not `unavailable`).
3. **Removal by × (bug #3).** After sequence 1, click × on chip A. Assert: `consumeToken` returned `true`; A's composer chip is gone; `draft` shrank by exactly A's `clipboardText.length` (+ trailing-space handling); chip B and its record are untouched; A's dock chip disappears (no `unavailable` anywhere); `records` no longer holds A's ref.
4. **Failed consume must not corrupt bookkeeping.** Force a revision bump between snapshot and × click (e.g. type into the composer programmatically). Assert: `consumeToken` returned `false`; the record is **retained**; the dock chip still shows its size; no `unavailable`.
5. **Removal after a failed insert.** Paste, paste (expect one failure before the fix), then × the surviving chip. Assert clean removal and an empty composer/dock — no orphan records, no `unavailable`.
6. **Paste after text edits.** Type text, paste, type more, paste again. Assert both inserts land at the correct detect offsets — the conversion must be correct with non-chip text present, not only at the tail of an empty draft.
7. **Toast copy / diagnostics.** The old message ("The DSH composer changed...") misreports a coordinate error as a concurrent-edit error; assert that a genuine `draftRev` conflict and a failed coordinate splice are distinguishable in diagnostics.

## Item 5 — Maintainer's routine source-reading discipline (guidance, unscored)

Before calling any input-machine verb, read in the **host source** (not the published types alone):

1. **Which projection each parameter lives in.** `host-input-facade.ts` annotates the span as "detect coordinates" and splices `projection.detectText`; `host-input-contract.ts` annotates `Occurrence.offset/length` and `InputState.draft` as "clipboard-text projection". Everything read from `getSnapshot()` (`draft`, `occurrences`) is clipboard-coordinate; everything passed as `TokenSpan` is detect-coordinate. Never pass one into the other without the occurrence-derived conversion.
2. **The guard chain, in order.** `insertReference` checks phase, then `draftRev`, then the splice; `consumeToken` checks `draftRev` and `start !== end` before splicing. Know which failure each `false` return could mean — a passing `draftRev` guard with a `false` return points at coordinates, not concurrency.
3. **Return-value contracts.** Both verbs return `boolean` ("whether the edit applied"); every caller must branch on it before mutating its own bookkeeping.
4. **The projection product itself.** `EditorProjection` (contract lines 35-42) exists precisely to document the dual-coordinate scheme (`detectText` vs `clipboardText`); re-read it whenever a host upgrade touches `packages/client/ui-conversation/src/client/input/`.

Checking the facade's guard lines and the contract's coordinate annotations before release would have caught both defects: it makes visible that `snapshot.draft` and `TokenSpan` are documented in different coordinate spaces.