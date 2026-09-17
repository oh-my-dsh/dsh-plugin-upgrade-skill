# S9 · Composer Coordinate Trap — Diagnostic Report

**Plugin:** `@org/dsh-attach-input` v0.2.3 · **Host:** DSH `0.1.2-alpha.3`
**Evidence:** `fixture/plugin-client.js`, `fixture/console-session.txt`, `fixture/host-input-facade.ts`, `fixture/host-input-contract.ts`

## Root cause in one sentence

Both bugs come from a single contract misread: the plugin computes spans in the **clipboard-text projection** coordinates (`InputState.draft` / `Occurrence.offset`/`length`), but both host verbs — `insertReference(ref, span: TokenSpan)` and `consumeToken({ kind: 'span', span })` — consume spans in **detect-text coordinates**, where each chip is exactly one U+FFFC character, not its full `clipboardText` string.

---

## 1. Why the first paste succeeds and every later paste fails

### The mismatch

- `host-input-contract.ts` says `InputState.draft` is the *"Clipboard-text projection of the editor document (chips expanded to their clipboard form)"*, while `EditorProjection.detectText` is the *"Trigger/TokenSpan coordinate text (chip = one U+FFFC)"*.
- `host-input-facade.ts` documents `insertReference`'s `span` parameter as *"pick-time span snapshot (**detect coordinates**)"* and its guard is `if (span.draftRev !== this.rev) return false`, then it slices `this.projection.detectText` and splices via `$replaceDetectSpanWithNodes(span, nodes)` — i.e. the splice happens in detect coordinates.

The plugin (`plugin-client.js`, `add`) computes:

```js
start: snapshot.draft.length,
end:   snapshot.draft.length,
draftRev: snapshot.draftRev,
```

`snapshot.draft` is **clipboard-text** (chips expanded to `clipboardText`), so this is a clipboard coordinate fed to a verb that splices **detect** text.

### Why "first works, later fails" is the signature

- **Paste #1 (empty composer):** `draft.length === 0` and `detectText.length === 0`. In an empty document the two coordinate spaces coincide at 0, so the span `(0,0)` is valid in both — the insert applies and the chip lands at offset 0. This success is accidental, not correct.
- **Paste #2:** per `console-session.txt`, after paste #1 `draft = "[attachment: screenshot.png] "` (length 29) but the chip is **one** U+FFFC in detect text, so `detectText` is 2 characters (`U+FFFC` + space). The plugin sends `(29, 29)`; `$replaceDetectSpanWithNodes` cannot splice at offset 29 of a 2-character document, so `applied` stays `false` and `insertReference` returns `false`. The plugin's `if (!accepted)` branch deletes the record and throws *"The DSH composer changed before the attachment could be inserted"*.

The toast text is misleading: the composer did not "change" in the revision-CAS sense (the plugin re-reads the snapshot right before the call, so `draftRev` is current); the guard/splice fails because the span coordinates point outside the detect-text document. "First call works, every subsequent call fails" is exactly what happens when the coordinate error is proportional to inserted content — it is zero only while the document is empty.

(The tail check `this.projection.detectText.slice(span.end, span.end + 1)` for the separating space is also evaluated at the wrong offset, but the splice failure dominates.)

## 2. Why the × click turns the chip into `unavailable` instead of removing it

Trace of `remove(sessionId, occurrence)`:

1. The occurrence comes from `InputState.occurrences`, whose `offset`/`length` are explicitly *"in the clipboard-text projection"* (`host-input-contract.ts`: the occurrence *"occupies exactly [offset, offset+length)"* of `clipboardText`). The plugin builds `end = occurrence.offset + (occurrence.length ?? 1)` → span `(0, 28)` for paste #1's chip.
2. It passes that span to `input.consumeToken({ kind: 'span', ... })`. The host guard `if (guard.span.draftRev !== this.rev || guard.span.start === guard.span.end) return false` passes (revision is fresh, 0 ≠ 28), but the edit `$replaceDetectSpanWithText(span, '')` splices **detect** text, where the same chip is one U+FFFC and the whole document is 2 characters (`U+FFFC` + space). A `(0, 28)` span is out of range there, so `applied === false` and `consumeToken` returns `false`. `console-session.txt` confirms the chip survives: *"composer chip still present"*.
3. The plugin ignores the return value (session log line 18: *"consumeToken(...) returned (not inspected by the plugin code)"*) and unconditionally runs `records.delete(occurrence.ref); changed();`.
4. The dock renderer then hits `record === undefined` and shows the literal fallback `'unavailable'` from the rendering excerpt — the bookkeeping deleted the local record even though the host-side occurrence was never removed. Hence: chip stays, label flips to `unavailable`, composer chip persists.

So the `unavailable` state is plugin-side bookkeeping (record deleted on an unverified removal) stacked on the same coordinate mismatch.

## 3. Fix direction — conversion rule and call sites

### The rule (derived from the host source, not guesswork)

Per `host-input-contract.ts`: a chip occupies **1 character** in `detectText` (U+FFFC) but `clipboardText.length` characters in `draft`; `occurrences` are *"sorted by offset"* and carry their `clipboardText`. Therefore, to convert a clipboard-text offset `o` to detect coordinates:

```
detectOffset(o) = o
  - Σ clipboardText.length of every occurrence entirely before o
  + (count of those occurrences)   // each becomes 1 U+FFFC
```

and a chip occurrence maps to the detect span `[detectOffset(occurrence.offset), detectOffset(occurrence.offset) + 1)` — **length 1, not `occurrence.length`**.

### Call site 1 — insert path (`add`)

Replace `start/end = snapshot.draft.length` with the **detect-space end of the document**, derived from the snapshot the plugin already has:

```js
const detectEnd =
  snapshot.draft.length
  - snapshot.occurrences.reduce((n, occ) => n + occ.clipboardText.length, 0)
  + snapshot.occurrences.length;
input.insertReference({ /* ...unchanged ref fields... */ }, {
  start: detectEnd,
  end: detectEnd,
  draftRev: snapshot.draftRev,
});
```

Check against the capture: after paste #1, 29 − 28 + 1 = 2, which is the true end of `detectText` ("U+FFFC space"). Keep re-reading the snapshot after each insert (the plugin already does) so `draftRev` stays a valid CAS token.

### Call site 2 — removal path (`remove`)

Convert the occurrence to a length-1 detect span and **check the result**:

```js
const before = snapshot.occurrences.filter(o => o.offset < occurrence.offset);
const start = occurrence.offset
  - before.reduce((n, o) => n + o.clipboardText.length, 0)
  + before.length;
const ok = input.consumeToken({
  kind: 'span',
  span: { start, end: start + 1, draftRev: snapshot.draftRev },
});
if (!ok) return;            // leave records intact; surface the failure
records.delete(occurrence.ref);
changed();
```

Only delete the record after `consumeToken` returns `true`; on `false`, keep the record (so the dock shows the real size, not `unavailable`) and re-sync from a fresh snapshot. The `setDraft` fallback branch should slice by the same detect-converted range if it must stay (or better, be dropped in favor of the span verb), and note the span-kind guard rejects `start === end`, so the length-1 span is required for the guard to admit the request at all.

## 4. Regression test plan

Assert these exact interaction sequences (browser-level, against a real DSH input machine):

1. **Empty-composer paste (known-good baseline):** paste → chip in composer, dock chip with byte label, `occurrences.length === 1`, `occurrences[0].offset === 0`.
2. **Repeat paste (user report #2):** paste, paste again → **no toast**; second `insertReference` returns `true`; `occurrences.length === 2` sorted by offset; both dock chips show byte labels.
3. **Paste after typing:** type `"hello "`, paste → chip lands after the text; paste a second file → succeeds; assert `draft === "hello [attachment: a] [attachment: b] "` and both occurrences present.
4. **Remove first of two (offset-shift case):** with two chips pasted, click × on the first dock chip → `consumeToken` returned `true`; composer chip #1 gone, chip #2 intact; remaining occurrence offset updated; dock chip #1 gone entirely (not `unavailable`).
5. **Remove last chip:** single chip, × → composer draft back to pre-paste text, `records` empty, dock empty, no `unavailable` label.
6. **Failed-removal bookkeeping:** force a stale `draftRev` (mutate the composer between snapshot and click, or mock the verb to return `false`) → record is **kept**, dock still shows the byte label, and a retry succeeds.
7. **Phase guard:** start an input operation (non-`plain` phase), paste and click × → both paths no-op without throwing, records untouched.

Tests 2, 4, 5, and 6 fail on the current v0.2.3 code and pin both symptoms.

## 5. Routine source-reading discipline before calling input-machine verbs (guidance)

- **Check which coordinate space each verb consumes.** Read the verb's JSDoc and parameter type: here `TokenSpan` is documented as *"detect coordinates"* while `Occurrence` fields are documented as *"clipboard-text projection"*. If the two differ, any value copied straight from state into a span is suspect.
- **Read the projection type, not just the state type.** `EditorProjection` publishing both `detectText` and `clipboardText` is itself the hint that two coordinate systems exist and are not interchangeable.
- **Read every guard clause before the first call.** `draftRev !== this.rev` (CAS), `start === end` (empty span), phase checks, and trimmed-draft equality each define a distinct rejection reason; treating all of them as "composer changed" hides the real failure.
- **Treat verb return values as part of the contract.** `insertReference`/`consumeToken` return `boolean` precisely so callers can branch; never delete local bookkeeping or render fallback states on an unchecked result.
- **Unit-derive one worked example from the source** (here: "chip = 1 U+FFFC in detectText vs. 28 chars in draft") before wiring coordinates, and encode it as a test — the empty-document case that "works" is the classic false positive.
