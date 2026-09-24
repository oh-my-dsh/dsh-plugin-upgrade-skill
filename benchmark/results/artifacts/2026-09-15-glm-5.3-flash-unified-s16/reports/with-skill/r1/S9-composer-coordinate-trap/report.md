# S9 · Composer Coordinate Trap — Diagnosis Report

Plugin: `@org/dsh-attach-input` v0.2.3 · Host: DSH `0.1.2-alpha.3`
Evidence: `fixture/plugin-client.js`, `fixture/console-session.txt`, `fixture/host-input-facade.ts`, `fixture/host-input-contract.ts` (all read-only; nothing in `fixture/` was modified).

## TL;DR

Both bugs are one contract misread, seen from two call sites: the host's span-taking
verbs (`insertReference`, `consumeToken{kind:'span'}`) consume **detect coordinates**
(`EditorProjection.detectText`, where a chip is exactly one U+FFFC), while the plugin
computes all spans from **clipboard-text coordinates** (`InputState.draft` and
`Occurrence.offset/length`, where a chip expands to its full `clipboardText` string).
On an empty composer the two projections are identical, so the first paste works by
coincidence; after the first chip exists they diverge and every subsequent span is
out of range. The × bug is that same mismatch on the removal verb, amplified by
plugin bookkeeping that deletes its record without checking the verb's `false` return.

---

## 1. Why paste #1 succeeds and every later paste fails

### The exact mismatch

The plugin inserts at "end of draft" using the published state snapshot
(`plugin-client.js:29-31`):

```js
start: snapshot.draft.length,
end: snapshot.draft.length,
draftRev: snapshot.draftRev,
```

`InputState.draft` is defined in `host-input-contract.ts:27` as the
"**Clipboard-text** projection of the editor document (chips expanded to their
clipboard form)".

But the span parameter of `insertReference` is a `TokenSpan` in **detect
coordinates**. The host facade proves this at `host-input-facade.ts:18` and `:24`:

```ts
const tail = this.projection.detectText.slice(span.end, span.end + 1)
...
applied = $replaceDetectSpanWithNodes(span, nodes)
```

The guard reads `detectText` at `span.end` and the splice helper
(`$replaceDetectSpanWithNodes`) operates on the detect text. Per
`host-input-contract.ts:37`, `detectText` is the projection where "chip = one
U+FFFC". So the plugin hands clipboard-text offsets to a verb that splices
detect-text offsets. That is the mismatch: **`snapshot.draft.length` (clipboard
projection length) vs `span.end` interpreted against `projection.detectText`
(detect projection)**.

### The numbers (from the captured session)

After paste #1 (`console-session.txt:8-9`):

- `draft` (clipboard projection) = `"[attachment: screenshot.png] "` → length **29**
- the single occurrence has `clipboardText` = `"[attachment: screenshot.png]"` → length **28**
- `detectText` = `U+FFFC + " "` → length **2**

Paste #2: the plugin computes `start = end = 29`, `draftRev` fresh. The host guards
that actually run (`host-input-facade.ts:16-17`) all pass:

- phase is `'plain'` ✓
- `span.draftRev !== this.rev` — the snapshot was taken immediately before, so the
  revision **matches** ✓ (the rev CAS is not the failure)

Then the body runs: `tail = detectText.slice(29, 30)` — `detectText` is only 2
characters long, so the span `[29, 29)` is out of range of the document it splices.
`$replaceDetectSpanWithNodes` cannot apply an edit outside the detect document and
returns `false`; `insertReference` returns `false` (`console-session.txt:14`
confirms: "insertReference returned false"). The plugin's `!accepted` branch
(`plugin-client.js:33-36`) deletes the record and throws the toast text.

Note what the toast text itself confesses: *"The DSH composer **changed** before the
attachment could be inserted"* — the plugin author assumed the only way
`insertReference` returns `false` is a stale-revision CAS failure, so a
coordinate-space bug got surfaced to users as a racing-composer message. The
revision was never stale.

### Why "first works, later fails" is the signature of this mismatch

The two projections are two renderings of the *same* document:

- clipboard projection: chip → its full `clipboardText` (28 chars here)
- detect projection: chip → exactly one U+FFFC (1 char)

With **no chips** in the composer, every character is literal text and the two
projections are character-for-character identical — clipboard offsets *are* valid
detect offsets. Paste #1 runs on that empty composer: `start = end = 0` is correct in
both coordinate systems at once, so the insert applies. The bug is invisible until
the first chip exists.

From the first chip onward, the projections diverge by `(occurrence.length − 1)`
characters per chip (28 − 1 = 27 here), so any clipboard-derived offset beyond the
first chip (29) points outside the detect document (length 2). Hence the precise
signature: the first operation on a chip-free document succeeds; **every** later
operation fails identically, regardless of timing. A genuine staleness/race bug
would instead fail intermittently and would also fail on the first paste after any
edit; a host regression would not correlate with "more than one chip". "First call
works, all subsequent calls fail with the same guard rejection" is the fingerprint
of a unit/coordinate mismatch that only manifests once the projections diverge.

## 2. Why × turns the chip into `unavailable` instead of removing it

### The removal path trace

The dock's × invokes `remove(sessionId, occurrence)` (`plugin-client.js:43-60`) with
an `Occurrence` straight from `InputState`. The contract pins its coordinate space
(`host-input-contract.ts:15-17`): `offset` — "Offset in the **clipboard-text**
projection", `length` — "Length in the **clipboard-text** projection".

The plugin builds:

```js
const end = occurrence.offset + (occurrence.length ?? 1);   // 0 + 28 = 28 (clipboard coords)
input.consumeToken({ kind: 'span', span: { start: 0, end: 28, draftRev } });
```

The span-kind branch of `consumeToken` (`host-input-facade.ts:37-43`):

1. `guard.span.draftRev !== this.rev` — fresh snapshot, passes ✓
2. `guard.span.start === guard.span.end` — `0 !== 28`, passes ✓
3. `applied = $replaceDetectSpanWithText(guard.span, '')` — this splices the
   **detect** text (`host-input-facade.ts:4`, "$replaceDetectSpanWithText … splice
   the DETECT text"). The requested detect range `[0, 28)` runs past the end of the
   2-character detect document (`U+FFFC `), so the edit is invalid against the
   document and does not apply — `consumeToken` returns `false`. The chip node and
   its separator space remain in the composer, exactly as captured:
   `console-session.txt:19` — "composer chip still present".

So the removal fails for the *same* reason the second insert fails: clipboard
coordinates fed to a detect-coordinate splice. (`draftRev` is projection-independent
— it is the editor revision both spaces share — which is why the CAS passes in both
bugs while the offsets are wrong in both. That symmetry is the fingerprint that this
is one misread, not two defects.)

### The plugin-side bookkeeping turns a failed remove into `unavailable`

`plugin-client.js:50-59` ignores the verb's return value (the capture explicitly
notes "consumeToken(...) returned (not inspected by the plugin code)") and then
**unconditionally** executes:

```js
records.delete(occurrence.ref);
changed();
```

So after a failed splice the plugin's own state says "gone" while the host's
composer still contains the chip. On re-render, the dock chip is still rendered —
dock chips track host occurrences, and the occurrence still exists. The rendering
excerpt (`plugin-client.js:63-65`) then looks up metadata:

```js
record === undefined ? 'unavailable' : humanBytes(record.total)
```

`records.get(occurrence.ref)` is now `undefined` (deleted a moment ago), so the size
label falls back to `unavailable`. That is the full user-visible symptom: chip not
removed, label becomes `unavailable`, composer chip stays. Two layers, one root
cause: (a) the removal span is in the wrong coordinate system, so the host correctly
refuses it; (b) the plugin treats the refusal as success and destroys its own
record, and the renderer's `undefined` fallback makes the damage visible as
`unavailable`.

## 3. Fix direction

### The conversion rule, derived from the host source

The contract defines the two spaces of the same document (`host-input-contract.ts:36-42`):
`detectText` (chip = one U+FFFC) vs `clipboardText` (chip = its insert-time
`clipboardText` cache, e.g. length 28), and `Occurrence.offset/length` are declared
to live in the clipboard space. Therefore, for a clipboard-space offset `p`:

```
detect(p) = p − Σ over occurrences entirely at or before p of (occurrence.length − 1)
```

Each chip occupies `length` clipboard characters but exactly 1 detect character, so
subtract `length − 1` per chip lying wholly before `p`. An occurrence's own clipboard
range `[offset, offset + length)` collapses to the single detect character at
`detect(offset)`, i.e. the detect interval `[detect(offset), detect(offset) + 1)`.

Worked check against the capture: end-of-draft → `29 − (28 − 1) = 2 = detectText.length` ✓;
the × chip → clipboard `[0, 28)` → detect `[0, 1)` ✓.

Where the host publishes the projection directly (`EditorProjection.detectText`,
"the published projection product consumed by the shell every update"), prefer
reading `detectText` and assert it equals the derived value — derive arithmetically
only what the published `InputState` alone must answer.

### Call site 1 — insert path (`add`)

```js
// detect-space end of draft: every occurrence lies wholly before the insert point
const detectEnd = snapshot.occurrences.reduce(
  (acc, o) => acc + (o.length - 1), snapshot.draft.length);
const accepted = input.insertReference({ /* unchanged */ }, {
  start: detectEnd,
  end: detectEnd,
  draftRev: snapshot.draftRev,   // draftRev stays: it is projection-independent
});
```

Paste #2 then sends `start = end = 2`; `tail = detectText.slice(2, 3) = ''`, so the
host appends its separator space after the new chip and the splice applies. Do not
"optimize" the position to `detectEnd − 1` to reuse the trailing space: `tail` would
be `' '`, the host would suppress the separator, and the two chips would end up
glued together in the clipboard projection. Insert at the true detect end and let the
host's own spacing rule (`host-input-facade.ts:21-23`) do its job.

### Call site 2 — removal path (`remove`)

```js
const detectStart = toDetect(occurrence.offset);   // rule above; 0 for the capture
const consumed = input.consumeToken({
  kind: 'span',
  span: { start: detectStart, end: detectStart + 1, draftRev: snapshot.draftRev },
});
if (consumed) {
  records.delete(occurrence.ref);
} else {
  // keep the record, keep the size label, surface a real error
}
changed();
```

Two corrections beyond the coordinates: (a) drop `occurrence.length ?? 1` —
`Occurrence.length` is non-optional in the published contract, and `+1` is now
correct because an occurrence is exactly one U+FFFC in detect space; (b) gate
`records.delete` on the verb's boolean so bookkeeping can never diverge from the
composer again. For the capture: span `[0, 1)` passes both guards, the U+FFFC is
spliced out, the composer chip disappears, the occurrence list updates, the dock
re-renders without the chip.

Secondary hardening while touching `add`: if item *k* of *n* fails mid-loop, items
1..k−1 are already inserted but `changed()` is skipped by the throw — re-render in a
`finally` (or collect failures) so the dock never goes stale after a partial batch.

## 4. Regression test plan

Unit level (the converter itself):

- U1 · Table-driven: for `{draft, occurrences}` fixtures derive detect offsets and
  assert against a host-shaped fake `detectText`. Must include: zero-chip document
  (converter is identity), the capture's one-chip case (29→2, [0,28)→[0,1)), and a
  multi-chip document with unequal `clipboardText` lengths (e.g. `/name` length 5 →
  1 detect char) to pin the per-chip `length − 1` rule.
- U2 · Invariant tripwire: after every render, assert
  `detectText.length === draft.length − Σ(occurrence.length − 1)`. Any future drift
  between the projections breaks this loudly instead of at insert time.

Integration level (the two reported sequences, asserted exactly):

- R1 · **Repeat insert** — empty composer → paste file A → paste file B without
  clearing. Assert: no toast on paste B; `insertReference` returned `true`;
  `occurrences.length === 2`; `draft === '[clipboardText A] [clipboardText B] '`;
  both chips visible in composer and dock. Also assert the intermediate invariant
  after paste A: the span the plugin *would* compute next satisfies
  `0 ≤ start = end ≤ detectText.length` and equals `detectText.length` (2, not 29) —
  this pins the coordinate conversion itself, not just the outcome.
- R2 · **Remove middle of three** — paste A, B, C → click × on B. Assert: consume
  returned `true`; B gone from composer and dock; A unchanged; C's clipboard offset
  shifted down by B's footprint while C's label/record survive.
- R3 · **Remove last** — click × on the only remaining chip → composer empty,
  `occurrences` empty, dock empty, `records` empty. (Covers the "no chips left"
  projection-coincidence edge in the other direction.)
- R4 · **Failed remove keeps bookkeeping** — force the span guard to fail (mutate
  the draft between snapshot and × click so the rev CAS rejects) → assert the
  consume returned `false`, the record is **retained**, the dock chip still shows
  its size (never `unavailable`), and a visible error is raised. This is the test
  that would have caught the `records.delete`-without-checking bug even if the
  coordinates had been fixed first.
- R5 · **No-chip regression guard** — assert the full flow still works on an empty
  composer, documented as "insufficient on its own": the capture proves the
  empty-composer path cannot distinguish correct code from the coordinate bug, so
  R1/R4 are the mandatory gates and R5 is only a smoke check.

## 5. Maintainer's routine source-reading discipline before calling input-machine verbs

Guidance (not scored), much of it the skill's standing rule "read the verb's guard in
the target tag's source — never call from memory":

1. **Read the parameter's type, not the verb's name.** `insertReference(ref, span:
   TokenSpan)` — then find which projection `TokenSpan` is defined against. The
   JSDoc said it plainly: "pick-time span snapshot (**detect coordinates**)."
2. **Trace the parameter to the coordinate currency it is actually spent in.** The
   body's `this.projection.detectText.slice(span.end, …)` and
   `$replaceDetectSpanWithNodes(span, …)` reveal the space the splice happens in;
   the type name alone never does.
3. **Check the published contract for dual projections of the same document.** When
   one state has two renderings (`EditorProjection.detectText` vs `clipboardText`),
   every offset-taking API belongs to exactly one of them, and the contract's
   field docs say which ("Offset in the clipboard-text projection"). Map each of
   your offsets to its space before writing the call.
4. **Enumerate the guard set and each failure mode.** Here: phase gate, rev CAS
   (`draftRev !== this.rev`), `start === end`, and splice-applied. Know which
   failures return `false` — these verbs never throw — and handle `false` at every
   call site before shipping.
5. **Exercise every offset-taking verb on a document that already contains at least
   one chip before release.** On an empty document all projections coincide and any
   coordinate bug passes ("first call works" proves nothing). A one-chip smoke test
   (R1's intermediate assertion) is the cheapest detector for this entire defect
   class.
6. **Prefer the host's own projection over recomputation.** If the host publishes
   `detectText`, read it; if you must convert between spaces, derive the rule from
   the projection definitions and assert the invariant (U2) rather than trusting
   arithmetic that was never executed against the host.

---

### Evidence index

| Claim | Source |
|---|---|
| `InputState.draft` is clipboard projection (chip expanded) | `fixture/host-input-contract.ts:26-28` |
| `Occurrence.offset/length` are clipboard coordinates | `fixture/host-input-contract.ts:15-17` |
| `detectText` = chip = one U+FFFC | `fixture/host-input-contract.ts:36-38` |
| `insertReference` tail check + splice run on `detectText` | `fixture/host-input-facade.ts:18, 24` |
| `consumeToken` span branch: CAS, `start===end`, detect splice | `fixture/host-input-facade.ts:37-43` |
| Plugin computes span from `snapshot.draft.length` | `fixture/plugin-client.js:29-31` |
| Plugin builds removal span from `occurrence.offset/length` | `fixture/plugin-client.js:48-54` |
| Plugin ignores consume result, deletes record unconditionally | `fixture/plugin-client.js:50-58`, `fixture/console-session.txt:18` |
| `unavailable` fallback in dock rendering | `fixture/plugin-client.js:63-65` |
| Paste #1 ok (draft len 29, occurrence len 28), paste #2 false, × leaves chip | `fixture/console-session.txt:4-21` |
