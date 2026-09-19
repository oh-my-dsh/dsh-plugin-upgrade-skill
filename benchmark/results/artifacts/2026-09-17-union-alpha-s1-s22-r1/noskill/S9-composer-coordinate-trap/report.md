# S9 · Composer Coordinate Trap — Diagnosis Report

Evidence base (all read-only; fixture left unchanged):

- E:/deepseek-harness/dsh-plugin-upgrade-skill/benchmark/tasks/S9-composer-coordinate-trap/environment/fixture/plugin-client.js
- E:/deepseek-harness/dsh-plugin-upgrade-skill/benchmark/tasks/S9-composer-coordinate-trap/environment/fixture/console-session.txt
- E:/deepseek-harness/dsh-plugin-upgrade-skill/benchmark/tasks/S9-composer-coordinate-trap/environment/fixture/host-input-facade.ts
- E:/deepseek-harness/dsh-plugin-upgrade-skill/benchmark/tasks/S9-composer-coordinate-trap/environment/fixture/host-input-contract.ts
- E:/deepseek-harness/dsh-plugin-upgrade-skill/benchmark/tasks/S9-composer-coordinate-trap/environment/fixture/README.md

Verdict up front: both symptoms are one contract misread. The plugin computes token-span
coordinates in the **clipboard-text projection** (InputState.draft / Occurrence.offset+length,
where a chip is expanded to its full clipboardText), while both host verbs — insertReference and
consumeToken with a span guard — consume spans in the **detect projection** (EditorProjection.detectText,
where a chip is exactly one U+FFFC character). Bug 1 (repeat paste) and bug 2 (× → "unavailable")
are the same wrong-plane math at two call sites, plus one bookkeeping defect that turns the second
failure into "unavailable".

## 1. Why the first paste succeeds and every later paste fails

**The two coordinate planes.** The host publishes two projections of the same document
(host-input-contract.ts):

- `InputState.draft` — "Clipboard-text projection of the editor document (chips expanded to their
  clipboard form)". After paste #1 it is `[attachment: screenshot.png] ` — 29 characters, of which
  the chip contributes 28.
- `EditorProjection.detectText` — "Trigger/TokenSpan coordinate text (chip = one U+FFFC)". The same
  document is `U+FFFC + " "` — 2 characters.

`TokenSpan` — the span argument of `insertReference` and the span guard of `consumeToken` — belongs
to the detect plane. Two statements in the excerpts fix this:

- the contract types `detectText` as the "Trigger/TokenSpan coordinate text";
- the facade header says `$replaceDetectSpanWithText` / `$replaceDetectSpanWithNodes` "splice the
  DETECT text and apply the edit", and `insertReference` samples `this.projection.detectText` for
  its tail check (`detectText.slice(span.end, span.end + 1)`).

Meanwhile `Occurrence.offset` / `Occurrence.length` are documented as coordinates "in the
clipboard-text projection", and `EditorProjection.occurrences` is explicitly the "InputState-compatible
occurrence view (clipboardText coordinates)".

**What the plugin computes.** In `add()` (plugin-client.js):

```js
start: snapshot.draft.length,
end:   snapshot.draft.length,
draftRev: snapshot.draftRev,
```

`snapshot.draft` is the clipboard projection, so `start/end` are clipboard-plane offsets passed into a
detect-plane verb.

**Trace with the captured numbers (console-session.txt):**

- Paste #1, empty composer: `draft === ""`, so the plugin sends span [0,0]. With **zero chips** the two
  projections are the same string, so a clipboard-derived offset is accidentally a valid detect offset.
  The guard `span.draftRev !== this.rev` passes, `tail` is `""` (not a space) so the host appends the
  separator space, the splice applies, and `insertReference` returns true. From this moment the planes
  diverge: `draft` = 29 chars, `detectText` = 2 chars, occurrence = {offset 0, length 28} in clipboard
  coordinates.
- Paste #2: the draft ends with a space so no `setDraft` runs; the plugin takes a **fresh** snapshot and
  sends span [29,29] with the current `draftRev`. The phase guard passes and the revision CAS passes —
  the composer has in fact not changed, so the toast's story is wrong. The span is then applied against
  the 2-character detect document: offset 29 does not exist in it, `$replaceDetectSpanWithNodes`
  refuses the span, `applied` stays `false`, `insertReference` returns `false`. The plugin deletes the
  record and throws `The DSH composer changed before the attachment could be inserted`.

**The exact mismatch:** the plugin supplies `snapshot.draft.length` — a length in the clipboard-text
projection (chips expanded) — as `span.start/span.end`, while the verb's guard and splice compare and
apply the span against `projection.detectText` (chip = one U+FFFC). Concretely: clipboard offset 29 vs
a detect document of length 2. The failing comparison is span-vs-detectText, **not** the revision CAS —
the toast blames a composer change that never happened.

**Why "first works, later fails" is the signature of this mismatch.** The two projections are
character-identical exactly while the document contains no chips (`occurrences.length === 0`); any
offset derived from one plane is then valid in the other. The first successful paste creates the first
chip, and from then on every clipboard-plane offset overshoots the detect document by
Σ(chip clipboardText.length − 1) — structurally and deterministically, not as a race. That is why the
failure starts precisely after the first success and never recovers: re-snapshotting cannot help, because
29 > 2 is a property of the document, not of timing. A genuine revision race would instead fail
intermittently, including on the first paste, and would succeed on an immediate fresh-snapshot retry.

## 2. Why the × click turns the chip into `unavailable` instead of removing it

**Removal path trace** (`remove()` → `consumeToken()`):

1. The dock passes the host occurrence `{offset 0, length 28, ref}` — clipboard coordinates by
   contract ("Offset/Length in the clipboard-text projection").
2. The plugin computes `end = occurrence.offset + (occurrence.length ?? 1)` = 28 and calls
   `consumeToken({ kind: 'span', span: { start: 0, end: 28, draftRev } })` — clipboard coordinates
   again, fed to a verb that splices the **detect** text. The chip's true detect span is [0, 1)
   (one U+FFFC); the supplied span is 27 characters too long.
3. Host guards: `guard.span.draftRev !== this.rev` passes (nothing edited since the snapshot) and
   `start === end` passes (0 ≠ 28). Then `$replaceDetectSpanWithText(span, '')` evaluates [0,28)
   against the 2-character detect text `U+FFFC + " "`; the span is out of range, the splice does not
   apply, and `consumeToken` returns `false`. No edit lands — hence the composer chip survives. (If the
   splice had clamped and deleted, the chip node would be gone and the dock would lose the chip
   entirely, which is not what the capture shows.)

**Plugin-side bookkeeping around the rejection:**

4. `remove()` never inspects the return value — the capture notes "consumeToken(...) returned (not
   inspected by the plugin code)". It unconditionally runs `records.delete(occurrence.ref)` and
   `changed()`.
5. The dock renders chips from the composer's occurrence view and resolves meta via
   `records.get(occurrence.ref)`; the render excerpt's `record === undefined ? 'unavailable'` branch
   exists precisely for a missing record. Because the occurrence still exists in the composer (the
   removal never applied), the chip is still rendered; because the plugin deleted its record anyway,
   the lookup misses and the meta degrades to `unavailable`.
6. The state is now permanently stuck: the ref is forgotten while the chip remains, and every retry
   re-sends the same wrong-plane span and fails again.

So symptom 2 is the same wrong-plane span as symptom 1, compounded by treating a rejected verb call as
success and deleting the plugin's own record.

## 3. Fix direction

**The conversion rule, derived from the host excerpts.** A chip occupies exactly **one** character in
`detectText` and exactly `clipboardText.length` characters in `draft`/`clipboardText` (an Occurrence
occupies [offset, offset+length) in the clipboard projection; detectText is the TokenSpan plane where
chip = one U+FFFC). Non-chip characters are identical in both projections, and occurrences are sorted
by offset. For a fresh snapshot with occurrences o₀…oₙ:

```
toDetect(oᵢ)              = oᵢ.offset − Σ_{k<i} (oₖ.clipboardText.length − 1)
a chip's detect span      = [toDetect(oᵢ), toDetect(oᵢ) + 1)
detect document length    = snapshot.draft.length − Σ_{all k} (oₖ.clipboardText.length − 1)
```

If the host exposes the projection product to plugins, prefer reading `detectText` directly (insert at
`detectText.length`; locate a chip as the i-th U+FFFC) — same arithmetic, fewer assumptions. Always
convert from a snapshot taken immediately before the call; never reuse offsets across snapshots or
edits. `draftRev` needs no conversion — the revision is plane-independent.

**Call site 1 — insert path (`add()`).** Replace

```js
start: snapshot.draft.length,
end:   snapshot.draft.length,
```

with the detect-plane end of document, e.g. `start: end: detectEnd` where
`detectEnd = snapshot.draft.length − Σ(occurrence.clipboardText.length − 1)` over the fresh snapshot
(or `projection.detectText.length` when reachable). Keep `draftRev: snapshot.draftRev` and the phase
check. With paste #2's numbers the span becomes [2,2] — the end of the 2-character detect document —
and the host's tail logic appends the separator space as designed. Also fix the failure message: on
`false`, re-snapshot; if `draftRev` is unchanged, the span was rejected (a coordinate problem), not
"the composer changed".

**Call site 2 — removal path (`remove()`).** Replace

```js
span: { start: occurrence.offset, end: occurrence.offset + (occurrence.length ?? 1) }
```

with

```js
span: { start: toDetect(occurrence), end: toDetect(occurrence) + 1, draftRev: snapshot.draftRev }
```

One detect character per chip; `occurrence.length` is the clipboard-plane width and must not be added.
For the captured chip the span becomes [0,1] instead of [0,28]. The `?? 1` fallback should disappear —
it superficially resembles the right "+1 per chip" form while sitting on the wrong plane. (The legacy
`setDraft`-slice fallback happens to be plane-correct — `setDraft` consumes the clipboard/draft text per
the contract — but it bypasses the span CAS protocol; keep the span path as primary.)

**Call site 3 — bookkeeping.** `consumeToken` returns whether the token was consumed. Gate
`records.delete(occurrence.ref)` and `changed()` on that boolean; on `false`, keep the record (meta
stays a byte size, never `unavailable`), surface a retryable error, and optionally re-snapshot and
retry once — a genuine revision race after user typing does happen. Symmetrically, the insert path
should distinguish "revision moved" from "span rejected" in what it reports.

## 4. Regression test plan

Exact interaction sequences to assert (each names the assertion that fails if either bug returns):

- **T1 · Repeat insert (user report #2).** Fresh empty composer → paste image A → assert dock chip +
  composer chip, draft === "[attachment: A] ", occurrences.length === 1 → paste image B → assert no
  toast, insert accepted, records.size === 2, draft === "[attachment: A] [attachment: B] ",
  occurrences.length === 2 with B's ref present → paste image C → assert 3 chips. Two consecutive
  pastes are the minimum; any single-paste test is blind to this bug.
- **T2 · Same-paste multi-item.** One paste event carrying two files → assert both chips inserted.
  This exercises the in-loop re-snapshot in `add()`; a stale-snapshot regression shows up as the second
  item failing while the first succeeds.
- **T3 · Insert after typed text.** Type "hello" → paste A → assert draft === "hello [attachment: A] "
  (host separator logic) → paste B → assert "hello [attachment: A] [attachment: B] " and two
  occurrences sorted by offset.
- **T4 · Remove the first of two chips.** Paste A, paste B → click × on A → assert `consumeToken`
  returned true; draft === " [attachment: B] " (chip A's 28 clipboard characters removed, separator
  space remains); B still rendered with correct label and byte-size meta (never "unavailable");
  records still contains B's ref; B's occurrence offset re-scaled correctly.
- **T5 · Remove with interleaved text.** Type "x " → paste A → type " y " → paste B → remove A →
  assert draft === "x  y [attachment: B] " (chip removed, both text runs intact). This is the sequence
  that catches per-preceding-chip conversion errors in `toDetect`.
- **T6 · Reverse removal order.** Paste A, paste B → remove B first → assert A untouched (label, size,
  offset) → then remove A → composer empty, records empty, dock empty.
- **T7 · Rejected-removal handling (pins the bookkeeping fix).** Paste A → make the span stale between
  snapshot and click (programmatic keystroke, or force phase ≠ 'plain') → click × → assert the
  `false` return is handled: record retained, meta still shows the byte size, composer chip still
  present, retryable error shown → click × again on a quiet composer → removal succeeds. Additionally
  assert the dock meta never shows "unavailable" while the occurrence still exists in
  `snapshot.occurrences`.
- **T8 · Insert failure classification.** With a chip present, force a genuine revision change (user
  types) between snapshot and insert → assert the plugin re-snapshots and retries with converted
  coordinates; and that a structurally invalid span is reported as a coordinate error rather than
  "the composer changed".

Where the harness exposes the projection, add a standing invariant after every step:
`detectText.length === draft.length − Σ(occurrence.clipboardText.length − 1)` — a cheap
plane-consistency tripwire.

## 5. Routine host-source checks before calling input-machine verbs (guidance, unscored)

- Read the verb body, not just its name: which projection does it splice (`$replaceDetectSpanWith*`
  → the DETECT text), and which text does it sample for guards (`insertReference`'s tail check reads
  `this.projection.detectText`)?
- Re-read the coordinate documentation on the published types every time: "Trigger/TokenSpan
  coordinate text (chip = one U+FFFC)" vs "Offset in the clipboard-text projection". Two live
  projections of one document is a standing trap; the field JSDoc is the authority, not intuition.
- Enumerate every `false`-return path (phase, draftRev CAS, empty span, bare-token equality, splice
  rejection) and handle each explicitly; a boolean return is part of the verb contract, never a hint.
- Before release, exercise the verb in the state where the two projections diverge — at least one chip
  in the composer, ideally with text around it — because the empty/plain state validates wrong-plane
  math by accident.
- Re-snapshot after every verb call and never reuse offsets across edits.

## Inference notes (stated honestly)

- That the splice helpers reject (rather than clamp) out-of-range spans is inferred: their bodies are
  not in the excerpt. But the capture shows both verbs returning `false` while every guard that
  precedes the splice in the facade (phase, revision CAS, start ≠ end) demonstrably passes, and no edit
  landed (the composer chip survived the × click). Rejection is the only reading consistent with the
  capture.
- The dock-renders-from-occurrences reading comes from the excerpt's
  `record === undefined ? 'unavailable'` branch plus the capture (chip still rendered, meta
  "unavailable", records missing the ref).
- The `setDraft` fallback's plane is inferred from the contract ("Persistence/InputState draft text
  (chip = clipboardText)") and the plugin's own `setDraft` usage; it is not exercised in the capture.
