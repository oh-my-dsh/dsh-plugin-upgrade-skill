# S9 · Composer Coordinate Trap — Diagnosis Report

**Plugin:** `@org/dsh-attach-input` v0.2.3 · **Host:** DSH `0.1.2-alpha.3`

## Root cause in one sentence

Both reported bugs are a **single** contract misread: the plugin computes
`TokenSpan` offsets in **clipboard-text (draft) coordinates**, but the host
input-machine verbs interpret and splice those spans in **detect coordinates**
— and in detect coordinates a chip is *one* `U+FFFC` character, not the
`clipboardText`-sized run the plugin assumes.

---

## 1. Why the FIRST paste succeeds and every later paste fails

The host publishes **two projections of the same document** (per
`host-input-contract.ts` → `EditorProjection`):

- **`detectText`** — "Trigger/TokenSpan coordinate text (**chip = one U+FFFC**)".
  This is the coordinate space the facade verbs splice.
- **`clipboardText`** / `InputState.draft` — "Persistence/InputState draft
  text (**chip = clipboardText**)". Here a chip is expanded to its
  `clipboardText` string, whose length is `Occurrence.length`.

The two spaces coincide **only while there are no chips** (both empty), and
**diverge the moment a chip exists**, because a chip adds `length` characters
to the draft but only `1` character to `detectText`.

**Exact mismatch.** In `add()` the plugin builds the insertion span as

```js
{ start: snapshot.draft.length, end: snapshot.draft.length, draftRev: snapshot.draftRev }
```

`snapshot.draft.length` is a **clipboard-text** offset. But `insertReference`
(host `facade.ts`) uses the span as a **detect** coordinate:

```ts
const tail = this.projection.detectText.slice(span.end, span.end + 1)
...
applied = $replaceDetectSpanWithNodes(span, nodes)   // splices DETECT text
```

So the plugin's `start/end` are in the wrong coordinate system. Note this is
**not** the revision CAS failing — the plugin re-snapshots after every edit, so
`span.draftRev === this.rev` matches both times. The failure is purely the
offset coordinate.

**Why "first works, later fails" is the signature.** On the first paste the
draft is empty (`length 0`) and `detectText` is empty (`length 0`), so
`start=end=0` is accidentally valid in both spaces and the insert applies.
After that first insert (captured log):

- `draft` = `"[attachment: screenshot.png] "` → **length 29** (28 clipboard
  chars + 1 separator space)
- `detectText` = `"\uFFFC "` → **length 2** (1 chip + 1 separator space)

The coordinate spaces have now diverged by `28 − 1 = 27` characters. On the
second paste the plugin passes `start=end=29` (the draft length), but
`detectText` is only 2 characters long, so `detectText.slice(29, 30)` is out
of range and `$replaceDetectSpanWithNodes({29,29})` cannot apply →
`applied=false` → `insertReference` returns `false` → the plugin throws
`"The DSH composer changed before the attachment could be inserted"`. The gap
grows with every chip, so **every** subsequent paste fails the same way.

---

## 2. Why the × click turns the chip into `unavailable` instead of removing it

Trace of `remove(sessionId, occurrence)` with the captured state
(`occurrence = { offset: 0, length: 28 }`, draft length 29, `detectText`
length 2):

1. The plugin computes
   `end = occurrence.offset + occurrence.length = 0 + 28 = 28`
   — again a **clipboard-text** length, while the comment *asserts* "the removal
   must span `occurrence.length`, not one character." That assertion is the
   trap: it is backwards for the detect space.
2. It calls `consumeToken({ kind: 'span', span: { start: 0, end: 28, draftRev } })`.
3. The host span guard (`facade.ts`) passes the revision CAS and the
   `start !== end` check, then runs
   `applied = $replaceDetectSpanWithText(guard.span, '')`
   — splicing a `[0, 28)` span out of a **2-character** `detectText`, which is
   out of range, so `applied=false` and `consumeToken` returns `false`.
4. **The plugin ignores the return value.** It unconditionally executes
   `records.delete(occurrence.ref)` and `changed()` (the capture confirms:
   "consumeToken(...) returned (not inspected by the plugin code)").
5. The dock re-renders and reads `records.get(occurrence.ref)` → `undefined`,
   so the meta falls through to the `'unavailable'` branch — while the host
   occurrence (composer chip) is still present because the splice never ran.

**Net effect:** the plugin's in-memory bookkeeping (`records`) and the host
state (`occurrences`) silently desync. The chip is never removed, and the dock
chip's label degrades to `unavailable` (record gone, chip present) — exactly
the third symptom.

---

## 3. Fix direction — the conversion rule, derived from the host source

The host source states the rule explicitly, so no guessing is needed:

- `EditorProjection.detectText`: "chip = one U+FFFC".
- `EditorProjection.clipboardText`: "chip = clipboardText".
- `Occurrence.offset/length`: "Offset/Length **in the clipboard-text projection**".
- `insertReference(ref, span)`: "`span` — pick-time span snapshot (**detect coordinates**)".
- `consumeToken` span guard / `$replaceDetectSpanWithNodes` /
  `$replaceDetectSpanWithText`: "splice the **DETECT** text".

**Conversion rule.** A chip occupies `length` characters in clipboard-text
coordinates but exactly **1** character (the single `U+FFFC`) in detect
coordinates. Therefore, to convert a clipboard-text offset `p` (not inside any
chip) to its detect offset, collapse every chip **before** `p` from
`length` characters down to 1, i.e. subtract `length − 1` per prior chip:

```js
// occurrences are sorted by offset (guaranteed by InputState)
function toDetect(snapshot, clipboardOffset) {
  let delta = 0;
  for (const occ of snapshot.occurrences) {
    if (occ.offset + occ.length <= clipboardOffset) delta += occ.length - 1;
    else break; // later chips are at >= clipboardOffset
  }
  return clipboardOffset - delta;
}
```

Equivalently, the detect end of the whole document is
`draft.length − Σ(occ.length − 1)`.

### Call site A — insert path (`add`)

Convert the "insert at end" collapsed span to detect coordinates before the call:

```js
const detectEnd = toDetect(snapshot, snapshot.draft.length);
const accepted = input.insertReference(
  { source: SOURCE, ref, label: item.path, appearance: 'file',
    clipboardText: `[attachment: ${item.path}]` },
  { start: detectEnd, end: detectEnd, draftRev: snapshot.draftRev },
);
```

(`draftRev` is already correct — it is the shared monotonic editor revision,
and the plugin re-snapshots after `setDraft`.)

### Call site B — removal path (`remove`)

The occurrence's chip is **one** detect character. Compute its detect start and
span exactly one character, and **honor the boolean result** so bookkeeping
cannot desync:

```js
const detectStart = toDetect(snapshot, occurrence.offset);
const ok = input.consumeToken({
  kind: 'span',
  span: { start: detectStart, end: detectStart + 1, draftRev: snapshot.draftRev },
});
if (ok) {
  records.delete(occurrence.ref);
  changed();
}
// on false: do NOT delete the record; re-sync bookkeeping from the host state.
```

(The `setDraft` fallback branch already slices `snapshot.draft` in clipboard
coordinates, which is self-consistent; it is unused on 0.1.2-alpha.3 where
`consumeToken` exists, but the span branch must be fixed regardless.)

The buggy `occurrence.length` span (`start, start+length`) must be replaced
by the single-character detect span (`start, start+1`); otherwise removal keeps
splicing out-of-range detect text and returning `false`.

---

## 4. Regression test plan

Assert these exact interaction sequences (fresh session each; "chip" = composer
occurrence, "dock" = plugin chip above the input):

1. **Empty composer, paste #1.** Assert `insertReference` returns `true`;
   `draft` = `"[attachment: <file>] "`; exactly one occurrence at
   `{offset:0, length:28}`; dock chip shows `ready` + correct byte label.
2. **Paste #2 into the non-empty composer (the original repro).** Assert no
   toast and `insertReference` returns `true`; two occurrences, sorted by
   offset; `draft` contains both clipboard forms; dock shows two chips. This
   is the key regression for bug #1 (previously returned `false` + toast).
3. **Paste after typed text without trailing whitespace** (e.g. type `hi` then
   paste). Assert `setDraft` appended a space and the insert still lands at
   the correct detect position (span computed from the re-snapshotted state);
   no coordinate drift.
4. **Remove the SECOND chip** (non-zero detect start). Assert
   `consumeToken` returns `true`; that occurrence disappears from host
   state; dock chip is removed (not `unavailable`); first chip remains intact
   with unchanged occurrence. Locks the `toDetect` offset for mid-document chips.
5. **Remove the FIRST chip** (the original repro). Assert `consumeToken`
   returns `true`; the chip is removed from **both** composer and dock; no
   `unavailable` meta is ever rendered; `records` no longer contains the ref
   and host state agrees.
6. **Remove the last remaining chip.** Assert `draft` returns to empty (or
   leftover whitespace is cleaned) and `occurrences` is empty; no
   `unavailable` state appears at any point.
7. **Stale/conflicting removal must not desync bookkeeping.** Force
   `consumeToken` to return `false` (e.g. a span built from an old
   `draftRev`). Assert the plugin **does not** delete the record and no
   `unavailable` label is produced — the chip and dock stay consistent.
8. **Phase guard.** Attempt insert/remove while `phase !== 'plain'`. Assert
   the plugin does not throw the misleading "composer changed" error and defers
   correctly.
9. **Unit test for `toDetect`.** Feed documents with 2–3 chips of varying
   `clipboardText` lengths and surrounding prose; assert detect offsets equal
   `p − Σ(length−1)` for chips before `p`, and that a chip's detect span is
   always exactly one character wide.

Items 2 and 5 are the minimum guards that make both original reports unable to
silently return.

---

## 5. Routine pre-call discipline for input-machine verbs (guidance)

Before calling any span-bearing host verb (`insertReference`,
`consumeToken(kind:'span')`, or anything that splices text):

1. **Identify the coordinate space of every offset parameter.** The host keeps
   at least two projections — `detectText` (TokenSpan coordinates; chip =
   one `U+FFFC`) vs `clipboardText`/`draft` and `Occurrence.offset/length`
   (chip = `clipboardText`). Confirm which one the verb's `span` indexes
   into, and never pass a `draft.length` or `occurrence.offset` straight
   into a detect-span parameter.
2. **Check chip cardinality.** One chip is 1 character in detect space but
   `Occurrence.length` characters in clipboard space. Any offset computed in
   one space must be converted before use in the other (collapse chips:
   subtract `length − 1` per prior chip).
3. **Check the revision CAS contract.** Note whether the verb compares a
   `draftRev`/`rev` field and always re-snapshot immediately before building
   the span so the CAS is current; do not cache offsets across edits.
4. **Honor the boolean "applied" return.** Treat `false` as "the host did not
   change" and re-sync plugin bookkeeping from host state instead of mutating
   your own records, so a failed verb cannot desync UI from the composer.
5. **Check span validity rules** — 0-based, half-open `[start, end)`, and any
   non-empty requirement (the host `consumeToken` span guard rejects
   `start === end`).
6. **Watch for auto-inserted separators** (the host adds a separating space next
   to a chip unless one is already present), which further skews naive
   `length` arithmetic between the two projections.

Following these before release would have caught the detect-vs-clipboard
mismatch that produced both the second-paste toast and the `unavailable` dock chip.
