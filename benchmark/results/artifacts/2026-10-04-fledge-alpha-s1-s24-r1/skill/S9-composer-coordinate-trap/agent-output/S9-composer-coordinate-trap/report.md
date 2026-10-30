# S9 — Composer Coordinate Trap: Diagnosis and Fix Direction

Root cause: one contract misread, surfacing as both reported symptoms.
`@org/dsh-attach-input` computes spans in the **clipboard-text projection**
(`InputState.draft`, where a chip is its `clipboardText`, e.g.
`[attachment: screenshot.png]`, 28 chars) and passes them into host "input
machine" verbs whose guards compare against the **detect-text projection**
(`EditorProjection.detectText`, where a chip is exactly one U+FFFC). The
two coordinate spaces coincide only while the composer contains no chips.

## 1. Why the first paste succeeds and every later paste fails

In `plugin-client.js` `add()`:

```js
input.insertReference({...}, {
  start: snapshot.draft.length,
  end: snapshot.draft.length,
  draftRev: snapshot.draftRev,
});
```

`snapshot.draft` is the clipboard-text projection (chip = full
`clipboardText`), so `start`/`end` are clipboard-projection offsets. But
the host guard (`host-input-facade.ts`, `insertReference`) documents its
span as "pick-time span snapshot (detect coordinates)" and applies the
edit with `$replaceDetectSpanWithNodes(span, nodes)` against
`this.projection.detectText`, whose chip width is 1 (U+FFFC). The
revision CAS (`span.draftRev !== this.rev`) passes — `draftRev` is fresh —
so the failure is purely the coordinate-space mismatch: the plugin hands a
clipboard-projection offset where a detect-text offset is expected.

Signature "first works, later fails":

- Paste #1: draft is `''` (or contains no chips). Clipboard projection
  and detect-text projection are identical, so a clipboard offset is
  accidentally the correct detect offset. `$replaceDetectSpanWithNodes`
  splices at the right place; the draft becomes
  `"[attachment: screenshot.png] "` (length 29) while detectText is
  `"￼ "` (length 2).
- Paste #2: the plugin computes `start = end = 29` from the clipboard
  draft, but detectText has length 2. The span is out of range, so the
  splice does not apply (`applied = false`), `insertReference` returns
  `false`, and the plugin throws/toasts "The DSH composer changed before
  the attachment could be inserted". The trailing-space peek
  (`detectText.slice(span.end, span.end + 1)`) also reads the wrong char
  for the same reason.

Every subsequent paste hits the same mismatch because the projections
diverge permanently after the first chip lands. Hence: one successful
insert, then a deterministic toast — that is the fingerprint of a
coordinate-space mix-up with a fresh `draftRev`, as opposed to a
stale-revision CAS failure.

## 2. Why the × click turns the chip into `unavailable` instead of removing it

`remove(sessionId, occurrence)` in `plugin-client.js`:

```js
const end = occurrence.offset + (occurrence.length ?? 1);
input.consumeToken({
  kind: 'span',
  span: { start: occurrence.offset, end, draftRev: snapshot.draftRev },
});
records.delete(occurrence.ref);
```

`Occurrence.offset`/`occurrence.length` are, per
`host-input-contract.ts`, "Offset/Length in the clipboard-text projection".
The plugin forwards them verbatim as the `TokenSpan` for `consumeToken`,
whose guard requires `guard.span.draftRev === this.rev` (passes) and
`start !== end` (passes), then splices with
`$replaceDetectSpanWithText(guard.span, '')` against the detect text. In
detect coordinates the actual chip is at `[d, d+1)` where `d` is roughly
`occurrence.offset - (occurrence.length - 1)`; the plugin's span
`[offset, offset + length)` therefore covers a wrong, usually over-long
or out-of-range range of the 2-char-wide detect document. The composer
chip node is not removed (capture: "composer chip still present"),
independent of whether `consumeToken` returned true — its return value is
not inspected.

Then the plugin unconditionally does `records.delete(occurrence.ref)` and
re-renders. The occurrence is still in `InputState.occurrences` (the
composer chip survives), so the dock still renders a chip for that ref,
but the record is gone, so the meta renders
`record === undefined ? 'unavailable'` — exactly the observed "size label
changes to `unavailable`, chip stays". So the same clipboard-vs-detect coordinate misread, this time on the
removal span — plus unconditional bookkeeping deletion — produced the
second symptom. Two symptoms, one cause.

(Side note: the plugin's `setDraft` fallback slices `snapshot.draft` —
the clipboard projection — with `occurrence.offset/length`, which is
dimensionally correct for `setDraft` because the fallback builds new
clipboard text. The broken half is only the `consumeToken` span.)

## 3. Fix direction

Convert at the verb boundary; never pass `InputState.draft`/`Occurrence`
offsets straight into a `TokenSpan`.

Rule (derived from `host-input-contract.ts` and `host-input-facade.ts`):

- `draft` / `Occurrence.offset` / `Occurrence.length` / `clipboardText`
  live in the clipboard-text projection.
- `TokenSpan.start` / `TokenSpan.end` for `insertReference` and for
  `consumeToken({kind:'span'})` live in the detect-text projection, where
  each chip is exactly one character (U+FFFC) and non-chip text is
  preserved.

Define, for occurrences sorted by `offset`:

```
detectDelta(occ) = occ.length - 1            // clipboard width minus detect width (1)
detectStart(occ) = occ.offset - Σ detectDelta(prev)   // prev = occurrences fully before occ
detectEnd(occ)   = detectStart(occ) + 1
```

Equivalently, reconstruct detect text: replace each occurrence's
`[offset, offset+length)` range in `draft` with `'\uFFFC'`; offsets in
that string are detect offsets. Since a chip is one char, the chip's own
removal span is simply `[detectStart, detectStart + 1)`.

Call sites:

1. Insert (`add()`):
   - The target position must be the draft end **in detect coordinates**:
     `detectEnd = draft.length - Σ_all (occ.length - 1)`. Pass
     `start = end = detectEnd`, `draftRev` from the same snapshot, to
     `insertReference`. The trailing-space normalization beforehand
     already works in clipboard space via `setDraft`, but the snapshot
     must be re-read after it (the plugin already does this).
2. Removal (`remove()`):
   - Span for `consumeToken` must be `{ start: detectStart(occ), end:
     detectStart(occ) + 1, draftRev: snapshot.draftRev }` — never
     `occ.offset`/`occ.length` directly. The comment in the plugin
     ("removal must span occurrence.length, not one character") is the
     exact inversion of the truth in detect coordinates: the chip is one
     character there; `occurrence.length` is the clipboard width.
   - Only `records.delete(occurrence.ref)` after `consumeToken` reports
     success; on failure keep the record (and ideally surface the
     toast), instead of deleting bookkeeping unconditionally.

If the host later exposes `EditorProjection.detectText` (or an occurrence
detect-span) directly, prefer reading it over reconstructing — but the
reconstruction above is the host-source-derived rule.

## 4. Regression test plan

Assert at the interaction-sequence level, with a real (or faithful) input
machine, not unit mocks of the guards:

Insert path:
1. Fresh empty composer → paste file A → assert one toast-free insert:
   `occurrences.length === 1`, `draft === '[attachment: A] '`, detect
   chip node present.
2. Immediately paste file B → assert **no** "composer changed" toast,
   `occurrences.length === 2`, `draft === '[attachment: A] [attachment: B] '`,
   second occurrence offset equals first occurrence's
   `offset + length + 1` in clipboard coordinates, and both dock chips
   show byte sizes (never `unavailable`).
3. Type plain text, then paste → assert insertion lands at the draft end
   and the text after the cursor position is preserved; also paste when
   the draft lacks a trailing space (the `setDraft` normalization path),
   then verify the next paste still succeeds (this catches forgetting to
   re-read the snapshot).
4. Assert no `unavailable` dock meta in any state.

Removal path:
5. Paste A → click × on its dock chip → assert dock chip gone, composer
   chip gone, `occurrences` empty, `draft === ''`, `records` empty.
6. Paste A and B → remove A via × → assert B's chip survives, B's
   occurrence re-based to offset 0, `records` holds only B's ref, and a
   subsequent remove of B leaves a clean empty state.
7. Paste A → click × → immediately paste again → assert the C chip
   inserts and both bugs cannot reappear through state divergence
   (records/occurrences/draftRev all consistent).

Invariant assertions to add around the verb calls (cheap early warning):

- For every `insertReference` call: `0 <= span.start === span.end` and
  `span.end <= detectTextLength` where `detectTextLength = draft.length -
  Σ(occ.length - 1)`.
- For every `consumeToken({kind:'span'})` call for a chip: `span.end -
  span.start === 1`.
- After every remove: `records.size === InputState.occurrences.length`
  and every occurrence's `ref` resolves in `records`.

## 5. Routine pre-call checklist for input-machine verbs (guidance)

Before calling any verb under `account/input`/`facade`:

1. Read the verb's guard in the host source (the `facade.ts` excerpt for
   the target version) and note which projection each field/span uses —
   clipboardText/detectText/model form are three different things.
2. Check what the `Occurrence` and `InputState` fields you plan to pass
   are measured against, and derive the conversion rule from the contract
   types (`contract/input.ts`), never from intuition.
3. Confirm `draftRev` freshness: re-read the snapshot after any
   `setDraft`/edit; a fresh rev is necessary but not sufficient — the
   coordinate space must also match.
4. Check the splice helpers (`$replaceDetectSpanWith*`) and the tail-char
   peeks to see which projection they read.
5. Decide success/failure handling: only commit plugin-side bookkeeping
   (`records`, re-render) to what the verb actually applied.
6. On version bumps, re-diff the facade excerpts; coordinate contracts
   are exactly the kind of thing that changes between alphas.
