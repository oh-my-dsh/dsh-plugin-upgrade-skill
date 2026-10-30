# JUDGE BRIEF · noskill.S9-composer-coordinate-trap

## Criteria (sealed rubric)
- [projection-contract] (20pt) Use host-input-contract.ts and host-input-facade.ts to distinguish published draft/Occurrence clipboard-text offsets from the detect-coordinate spans used by insertReference and consumeToken. A chip expands to clipboardText in the former and occupies one U+FFFC in the latter; ordinary text and separating spaces still contribute their normal width. Equivalent descriptions without exact type names are valid.
- [repeat-paste-failure] (20pt) Locate snapshot.draft.length in plugin-client.js add and connect the captured first-success/second-failure behavior to the host detect-span splice. With an initially empty composer both coordinates coincide; after a chip, clipboard length overshoots the detect span and insertReference returns false, which the plugin turns into its changed-composer toast. Do not infer a real concurrent edit from the toast or require inconsistent hardcoded character counts from the capture.
- [removal-and-bookkeeping] (20pt) Trace plugin-client.js remove: occurrence.offset/length are passed unconverted to consumeToken, its false result is ignored, and records.delete runs anyway. The live occurrence remains, while missing record data renders unavailable in the dock and the composer chip stays. Tie both symptoms to the same coordinate mismatch, rather than treating unavailable as a separate upload failure.
- [conversion-and-success-gate] (20pt) Derive and apply the conversion at BOTH call sites: subtract the sum of (occurrence.length - 1) for preceding chips; for insertion at draft end account for all preceding occurrences, and for removal map occurrence.offset then use a one-detect-character span. Keep the revision guard; retire records only after successful consumption or a verified successful clipboard-coordinate fallback. Equivalent correct mapping/pseudocode is sufficient; merely saying convert offsets is incomplete.
- [regression-sequences] (20pt) Propose two successive pastes with both occurrences/chips present, then remove a chip with another preceding chip and assert composer occurrence, dock chip and record are removed together while the other chip survives. Declined-consumption bookkeeping, first/last-chip and empty-again variants are valid additions. Code assertions and natural language are equivalent. Score only task items 1-4; item 5 host-source-reading discipline is explicitly unscored.

## Caps (score ceilings; judge returns each with triggered true/false)
(none)

## Candidate report(s)
#### FILE: S9-composer-coordinate-trap/S9-composer-coordinate-trap-report.md

# S9 · Composer Coordinate Trap — Diagnosis, Fix Direction, Regression Plan

**Plugin:** `@org/dsh-attach-input` v0.2.3 · **Host:** DSH 0.1.2-alpha.3
**Evidence (read-only):** `fixture/plugin-client.js`, `fixture/console-session.txt`, `fixture/host-input-facade.ts`, `fixture/host-input-contract.ts`

---

## 0. TL;DR — one root cause, two symptoms

Both reported bugs are the **same single contract misread**: the plugin mixes up the host's
**two coordinate systems**.

| Projection | Where it is published | How a chip is represented |
|---|---|---|
| **clipboard-text** | `InputState.draft`, `Occurrence.offset`, `Occurrence.length`, `EditorProjection.clipboardText` | chip expanded to its full `clipboardText` (e.g. `[attachment: screenshot.png]`, 28 chars) |
| **detect-text** | `EditorProjection.detectText`, every `TokenSpan` (`insertReference`, `consumeToken`) | chip = **exactly one U+FFFC** (1 char) |

The plugin derives every span it hands to the host from **clipboard-text** values
(`snapshot.draft.length`, `occurrence.offset`, `occurrence.length`) and passes them to verbs whose
`TokenSpan` is in **detect-text** coordinates. Every such span is too large by
`Σ (occurrence.length − 1)` — the total clipboard expansion of the chips already in the composer.

- **Bug 2 (paste #2 fails):** the insert span overshoots the end of `detectText`, the host refuses the splice, `insertReference` returns `false`, and the plugin renders that as "the composer changed".
- **Bug 3 (× → `unavailable`):** the removal span overshoots the same way, `consumeToken` returns `false`, and the plugin **ignores the return value** and deletes its bookkeeping record anyway — so the dock chip loses its record (`unavailable`) while the composer chip, never actually removed, stays.

Nothing here is a race, a revision problem, or two unrelated defects.

---

## 1. Why the FIRST paste succeeds and every later paste fails

### 1.1 What the plugin computes (`add`, `plugin-client.js`)

```js
let snapshot = input.state.getSnapshot();          // InputState: draft, draftRev, occurrences
...
const accepted = input.insertReference({ source, ref, label, appearance, clipboardText }, {
  start: snapshot.draft.length,   // ← offset in the CLIPBOARD-TEXT projection
  end:   snapshot.draft.length,   // ← offset in the CLIPBOARD-TEXT projection
  draftRev: snapshot.draftRev,
});
```

`snapshot.draft` is the **clipboard-text projection** (`host-input-contract.ts`: *"Clipboard-text
projection of the editor document (chips expanded to their clipboard form)"*). So `start`/`end`
are clipboard-text offsets. The comment *"insert at the end of the draft"* is the intent; the
*frame* is wrong.

### 1.2 What the host verb compares the span against (`host-input-facade.ts`)

```ts
insertReference(ref: ReferenceInsert, span: TokenSpan): boolean {
  const phase = this.core.state.phase
  if (phase !== 'plain' && phase !== 'claimed') return false
  if (span.draftRev !== this.rev) return false          // (a) revision CAS
  const tail = this.projection.detectText.slice(span.end, span.end + 1)   // (b) detect-text frame
  let applied = false as boolean
  this.applyEdit(() => {
    const nodes = tail === ' ' ? [$createReferenceChipNode(ref)]
                               : [$createReferenceChipNode(ref), $createTextNode(' ')]
    applied = $replaceDetectSpanWithNodes(span, nodes)   // (c) splice in detect-text frame
  })
  return applied
}
```

`span` is a `TokenSpan`, and the verb immediately uses it to index
`this.projection.detectText` — the **detect-text** projection (*"Trigger/TokenSpan coordinate
text (chip = one U+FFFC)"*, and the facade's own doc comment: *"@param span - pick-time span
snapshot (detect coordinates)"*). So:

- **(a)** the explicit revision guard compares `span.draftRev` against `this.rev`. In both pastes the plugin snapshots immediately before the call and nothing edits in between, so **this guard passes** — the composer did *not* change. (Which is why the toast text is misleading; see §1.5.)
- **(b)** the `tail` probe reads `detectText` at `span.end`, proving the detect frame.
- **(c)** the splice `$replaceDetectSpanWithNodes(span, …)` must resolve `span` against the detect document. With an out-of-range span it cannot apply, sets `applied = false`, and the verb returns `false` — exactly what the capture records for paste #2. (The splice's internals are not in the excerpt; the observable contract is "span outside the detect document ⇒ `false`, not an exception".)

**The exact mismatch:** the plugin feeds a **clipboard-text offset** where the verb requires a
**detect-text offset**, and the two differ by the accumulated clipboard expansion of the chips
already present:

> `clipboardOffset − detectOffset = Σ over occurrences (occurrence.length − 1)`

### 1.3 The arithmetic (matches `console-session.txt` line for line)

After paste #1 the capture records:

```
draft       = "[attachment: screenshot.png] "        length 29   (clipboard-text)
occurrences = [{ offset: 0, length: 28, clipboardText: "[attachment: screenshot.png]" }]
```

Therefore:

| quantity | value |
|---|---|
| `detectText` | `"￼ "` — **length 2** (chip = 1 U+FFFC + the separator space the verb appends) |
| divergence `draft − detectText` | 29 − 2 = **27** = `occurrence.length − 1` = 28 − 1 |
| span the plugin sends on paste #2 | `{ start: 29, end: 29 }` (from `snapshot.draft.length`) |
| span the verb needs | `{ start: 2, end: 2 }` (= `detectText.length`) |
| overshoot | **27 characters past the end of `detectText`** |
| `tail` probe | `detectText.slice(29, 30) === ""` → `tail !== ' '`, so the verb builds `[chip, ' ']` and then cannot place it |

The splice is refused → `insertReference` returns `false` → `records.delete(ref)` + the toast
*"The DSH composer changed before the attachment could be inserted"*. No second chip anywhere.
Exactly the user report.

### 1.4 Why "first works, later fails" is the signature of *this* mismatch

The two coordinate systems **coincide only when the composer contains no chips**:

- **Paste #1, empty composer:** `draft = ""` (length 0) and `detectText = ""` (length 0). The plugin's `start = end = 0` is simultaneously a valid clipboard offset *and* a valid detect offset. The splice applies, the chip lands, `draftRev` bumps, `changed()` renders both chips. ✔
- **Every paste after that:** each accepted chip adds `occurrence.length` characters to `draft` but only **1** character to `detectText`. The frames diverge by `length − 1` per chip — **27** for `[attachment: screenshot.png]`. The plugin keeps measuring the insertion point with the clipboard ruler, so its span is too far right by exactly that accumulated divergence, and the further right it is, the more certainly the splice is refused.

So the failure count is deterministic and monotonic: **0 chips → works; ≥1 chip → fails, and the
error grows with every additional chip** (3 chips ⇒ draft 87 vs `detectText` 6 ⇒ 81 chars of
overshoot). That is the fingerprint of a coordinate-frame bug and *not* of a race:

- a race/CAS failure would be **timing-dependent and non-reproducible**, would fire on the first paste too, and would leave `snapshot.draftRev !== this.rev` (here they are equal — the plugin snapshots immediately before the call and `setDraft` is not taken because the draft already ends in whitespace);
- a coordinate bug is **reproducible on the second interaction of every fresh session**, which is precisely what both users reported and what the capture shows.

The only guard-relevant difference between paste #1 and paste #2 is the span coordinates (the
revision is equally fresh in both, the phase is `plain` in both). Therefore the refusal can only
come from the span — which is the mismatch above.

### 1.5 Two secondary defects visible on the same path

- **The toast is a misdiagnosis.** `!accepted` is rendered as *"The DSH composer changed…"*, but the revision CAS passed; the composer did not change — the coordinates were wrong. The plugin should re-snapshot on refusal and distinguish `draftRev` changed (a real concurrent edit, this message is correct) from `draftRev` unchanged (a coordinate/range refusal, a different message). As written, the message actively hides the real cause.
- **The plugin is stricter than the host on phase.** It throws unless `snapshot.phase === 'plain'`, while `insertReference` also accepts `'claimed'`. Not one of the reported bugs, but it will produce spurious *"Wait for the current input operation to finish"* errors during legitimate claimed-phase inserts.

---

## 2. Why the × click turns the chip into `unavailable` instead of removing it

### 2.1 The removal path (`remove`, `plugin-client.js`)

```js
const remove = (sessionId, occurrence) => {
  const input = inputFor(sessionId);
  const snapshot = input.state.getSnapshot();
  if (snapshot.phase !== 'plain') return;
  // The occurrence owns its whole inline range, so the removal must span
  // occurrence.length, not one character.
  const end = occurrence.offset + (occurrence.length ?? 1);
  if (typeof input.consumeToken === 'function') {
    input.consumeToken({
      kind: 'span',
      span: { start: occurrence.offset, end, draftRev: snapshot.draftRev },
    });
  } else {
    input.setDraft(snapshot.draft.slice(0, occurrence.offset) + snapshot.draft.slice(end));
  }
  records.delete(occurrence.ref);   // ← unconditional
  changed();                        // ← unconditional
};
```

Three things go wrong, in order:

1. **Same coordinate-frame error as the insert path.** `occurrence.offset` / `occurrence.length` are **clipboard-text** coordinates by contract (*"Offset in the clipboard-text projection"*, *"Length in the clipboard-text projection; the occurrence occupies exactly [offset, offset+length)"*). `consumeToken`'s `span` guard is a `TokenSpan` in **detect-text** coordinates — it ends in `$replaceDetectSpanWithText(guard.span, '')` against the detect document, exactly like `insertReference`. So the plugin asks the host to delete `[0, 28)` of a detect document whose length is **2**. The guard's own checks pass (`draftRev` matches `this.rev`; `start !== end`), so the refusal again comes from the out-of-range splice: `applied = false`, `consumeToken` returns `false`.
2. **The return value is discarded.** `input.consumeToken({...})` is called as a statement — the capture even notes *"consumeToken(...) returned (not inspected by the plugin code)"*. The host said "no", and the plugin proceeded as if it had said "yes".
3. **Bookkeeping is updated unconditionally.** `records.delete(occurrence.ref)` and `changed()` run regardless, so the plugin's own state now claims the attachment is gone while the host document still contains the chip.

The comment *"the removal must span occurrence.length, not one character"* is the misread stated
out loud: in the **detect** frame the chip **is** one character (one U+FFFC). The author "fixed" a
non-existent off-by-one by multiplying it by 28.

### 2.2 Why the dock then shows `unavailable`

The dock renders **one chip per host occurrence** and looks the record up by ref:

```js
// const record = records.get(occurrence.ref);
// const meta = status === 'uploading' ? ${record.uploaded}/${record.items.length}`
//   : status === 'uploaded' ? 'copied' : record === undefined ? 'unavailable' : humanBytes(record.total);
```

After the click: the host still publishes the occurrence (the splice was refused), but `records`
no longer contains `ref` (step 3 above). So `records.get(occurrence.ref) === undefined` → the size
label falls through to `'unavailable'`, and the chip is still rendered because its occurrence is
still in `snapshot.occurrences`. The composer chip stays too. Exactly the capture:

```
dock chip STILL rendered, meta now reads "unavailable"
composer chip still present; records no longer contains the ref
```

(The `setDraft` fallback branch is not taken here because `consumeToken` exists. Note it is
clipboard-consistent — it would produce `" "`, a stray separator space — but it bypasses the host's
occurrence bookkeeping entirely, so it should be dropped or verified rather than kept as a silent
second path.)

**One cause, two symptoms:** the insert path overshoots the detect document and the removal path
overshoots the same document; the removal path additionally ignores the host's "no" and corrupts
its own bookkeeping. Fixing the coordinate frame fixes the toast; fixing the ignored return value
fixes `unavailable`.

---

## 3. Fix direction

### 3.1 The conversion rule, derived from the host excerpts

The rule is not a guess; it is read directly off the contract and the facade:

- `EditorProjection.detectText` — *"Trigger/TokenSpan coordinate text (chip = one U+FFFC)"*
- `EditorProjection.clipboardText` / `InputState.draft` — *"Persistence/InputState draft text (chip = clipboardText)"*
- `Occurrence.offset` / `Occurrence.length` — *"Offset / Length in the clipboard-text projection"*
- `insertReference(ref, span: TokenSpan)` and `consumeToken({kind:'span', span})` both index `this.projection.detectText` — *"@param span - pick-time span snapshot (detect coordinates)"*

⇒ **A chip occupies `occurrence.length` clipboard characters but exactly 1 detect character.**
Plain text is identical in both projections. Therefore, with `occurrences` sorted by offset:

```
detectOffset(clip)  = clip − Σ over occurrences o with (o.offset + o.length ≤ clip) of (o.length − 1)

detectLength(draft) = draft.length − Σ over all occurrences o of (o.length − 1)
                    = detectText.length

detectStart(o)      = o.offset − Σ over occurrences p before o of (p.length − 1)
detectEnd(o)        = detectStart(o) + 1        // a chip is exactly one U+FFFC
```

A clipboard position that falls *inside* a chip's expansion `[o.offset, o.offset+length)` collapses
onto that chip's single detect cell (there is no "inside" in the detect frame).

**Values that must be converted:** every number the plugin currently derives from
`snapshot.draft.length`, `occurrence.offset`, or `occurrence.length` and hands to a host verb —
i.e. the `start`/`end` of the `insertReference` span and the `start`/`end` of the `consumeToken`
span guard. `draftRev` is **not** converted — it is the same counter in both frames and must simply
be read from the same snapshot the offsets come from.

### 3.2 Call site A — the insert path (`add`)

```js
// helpers (clipboard-text ⇄ detect-text)
const detectLength = (snapshot) =>
  snapshot.draft.length - snapshot.occurrences.reduce((n, o) => n + o.length - 1, 0);

const detectStartOf = (o, occurrences) =>
  o.offset - occurrences.filter(p => p.offset < o.offset).reduce((n, p) => n + p.length - 1, 0);

// inside add(), replacing the insertReference span:
for (const item of items) {
  const ref = id();
  const record = { ref, sessionId, items: [item], total: item.file.size, label: item.path, status: 'ready' };
  records.set(ref, record);

  const detectEnd = detectLength(snapshot);        // === detectText.length ; was snapshot.draft.length
  const accepted = input.insertReference(
    { source: SOURCE, ref, label: item.path, appearance: 'file', clipboardText: `[attachment: ${item.path}]` },
    { start: detectEnd, end: detectEnd, draftRev: snapshot.draftRev },   // detect coordinates
  );
  if (!accepted) {
    records.delete(ref);
    const now = input.state.getSnapshot();
    if (now.draftRev === snapshot.draftRev) {
      // rev unchanged ⇒ not a concurrent edit ⇒ do not claim the composer changed
      throw new Error('Attachment insert refused: span outside the composer (coordinate mismatch)');
    }
    throw new Error('The DSH composer changed before the attachment could be inserted');
  }
  snapshot = input.state.getSnapshot();            // refresh BOTH rev and coordinates for the next item
}
changed();
```

For the repro this turns `{start: 29, end: 29}` into `{start: 2, end: 2}`. If the facade's public
surface exposes the projection (`input.projection.detectText`), `detectText.length` is an equivalent
source for `detectEnd` — but the `InputState`-only derivation above is guaranteed available and is
self-checking.

Note the loop already re-snapshots after each successful insert; with the conversion applied per
iteration, a multi-file paste now inserts each chip at the correct detect position instead of
compounding the error (chip 2 of a 2-item paste would otherwise need `4`, not `58`).

### 3.3 Call site B — the removal path (`remove`)

```js
const remove = (sessionId, occurrence) => {
  const input = inputFor(sessionId);
  const snapshot = input.state.getSnapshot();
  if (snapshot.phase !== 'plain' && snapshot.phase !== 'claimed') return;   // match the host's guard

  const detectStart = detectStartOf(occurrence, snapshot.occurrences);
  const detectEnd = detectStart + 1;                 // a chip is exactly one U+FFFC — NOT occurrence.length

  const consumed = typeof input.consumeToken === 'function'
    ? input.consumeToken({ kind: 'span', span: { start: detectStart, end: detectEnd, draftRev: snapshot.draftRev } })
    : false;

  if (!consumed) return;                             // host refused ⇒ change NOTHING plugin-side

  records.delete(occurrence.ref);
  changed();
};
```

For the repro this turns `{start: 0, end: 28}` into `{start: 0, end: 1}`, which splices the single
U+FFFC out of `"￼ "` and leaves `" "`.

### 3.4 The bookkeeping rule that makes `unavailable` impossible

> **Plugin-side state may only be mutated after the host verb returns `true`, and only by the amount the host actually applied.**

`add` already honours this (it rolls the record back on refusal); `remove` must be brought in line.
With that rule, a refused `consumeToken` leaves the record in place, the dock keeps rendering the
chip with its real size, and the user can retry — `unavailable` becomes unreachable by construction.
(Defensive extra: if `records.get(ref)` is already missing when `remove` is entered — a double
click — return immediately rather than issuing a second verb call.)

### 3.5 Secondary corrections on the same paths

- Drop the `setDraft` fallback in `remove` (or verify it): it mutates the draft behind the host's occurrence bookkeeping and leaves a stray separator space.
- Separator space: the verb appends a space after the chip unless one is already adjacent (`tail === ' '` check). The occurrence's own range is `[offset, offset+length)` in clipboard coordinates and does **not** include that separator, so the contract-correct removal span is `[detectStart, detectStart+1)` and the space remains in the draft. If the product decision is that × should also swallow the separator, extend the span by one *only when the next detect character is a space* — that is a deliberate, tested choice, not a default.
- `occurrence.length ?? 1` should be deleted: the detect length of a chip is always exactly 1, independent of `occurrence.length`.

---

## 4. Regression test plan

Each scenario is a full interaction sequence with the assertions that must hold. T2, T7, T8 and T9
are the ones that pin the two reported bugs; T12 is the cheap invariant that catches the whole
defect class.

**T1 — baseline: first insert on an empty composer.**
Fresh session, `draft === ""`. Paste one file.
Assert: `insertReference` returns `true`; exactly one composer chip; one dock chip with the byte
label; `draft === "[attachment: screenshot.png] "`; `occurrences.length === 1` with `offset === 0`,
`length === 28`; no toast.

**T2 — the reported bug: second insert with a chip already present.**
Continue from T1. Paste a second file.
Assert: `insertReference` returns `true` (**no toast**); two composer chips; two dock chips;
`occurrences.length === 2` sorted by offset with the second at `offset === 29`, `length === 28`;
`draft === "[attachment: screenshot.png] [attachment: screenshot.png] "`.
This is the exact repro of user report #2 and must fail on the unfixed plugin.

**T3 — accumulation across three inserts.**
From an empty composer, paste three files in a row.
Assert: all three inserts return `true`; `occurrences.length === 3`; the detect span passed on call
*k* satisfies `end === detectText.length` at that moment (2, 4, 6) — i.e. the overshoot is 0 every
time, not 0 / 27 / 54.

**T4 — insert after typed text without a trailing space.**
Type `hello` (no trailing space) → paste a file.
Assert: insert returns `true`; `draft === "hello [attachment: screenshot.png] "`; the typed text is
preserved and not duplicated. Covers the `setDraft` pre-space branch and the re-snapshot that must
follow it (the rev *and* the coordinates both move).

**T5 — insert after typed text with a trailing space.**
Type `hello ` → paste. Assert `true` and `draft === "hello [attachment: screenshot.png] "` — no
doubled space (the plugin's pre-space must not fire, and the host's post-chip space must not double).

**T6 — a genuine concurrent edit must still be rejected (guards against over-correction).**
Snapshot, then make an unrelated host edit so `draftRev` bumps, then call the insert with the stale
`draftRev`. Assert `insertReference` returns `false` **and** the plugin raises *"The DSH composer
changed before the attachment could be inserted"* (now truthfully) and leaves no record behind.
This proves the fix did not paper over the real CAS by always passing the newest rev.

**T7 — the reported bug: × on the only chip.**
From T1, click × on the dock chip.
Assert: `consumeToken` returns `true`; the composer chip is gone (`occurrences.length === 0`, `draft`
no longer contains the clipboard text); the dock renders **no** chip; `records` no longer contains
the ref; `changed()` was called exactly once; and **the dock never renders the label `unavailable`
for a ref the user just removed**. Fails on the unfixed plugin (composer chip stays, label becomes
`unavailable`).

**T8 — offset arithmetic on removal from the middle.**
From T3 (three chips), remove the **middle** one.
Assert: `consumeToken` returns `true`; two occurrences remain, both with correct `offset`/`length`
(the later chip's clipboard offset shifts down by exactly the removed chip's clipboard length, plus
the separator if it was consumed); the dock shows exactly two chips with the correct labels and byte
sizes; the surviving chips' detect spans are still in range.

**T9 — remove-then-insert round trip.**
From a two-chip state, remove the first chip, then immediately paste a new file.
Assert: the insert returns `true` and the new chip lands at the end of the *post-removal* detect
text — proving the plugin re-snapshotted after the removal and recomputed coordinates from the new
state, not from a stale one.

**T10 — repeated / concurrent × clicks.**
Click × twice in rapid succession on the same chip.
Assert: the second call is a no-op (the record is already gone, so no second `consumeToken` call, or
a call whose `false` result changes nothing); no `unavailable` label appears; the composer state is
unchanged after the first successful removal. Pins the "unconditional delete + changed()" bug.

**T11 — × while an input operation is in flight.**
Force `phase !== 'plain'` (and not `'claimed'`), then click ×.
Assert: no verb call, the record survives, the dock chip keeps its real size.

**T12 — the invariant that catches the whole class (run inside every scenario above, plus a randomized soak).**
After **every** mutating interaction, assert both:

1. `draft.length − Σ(occurrence.length − 1) === detectText.length` (the two projections agree on the derived detect length — 29 − 27 = 2 in the repro);
2. every span passed to `insertReference` or `consumeToken` during the run satisfied `0 ≤ start ≤ end ≤ detectText.length` **at call time** (assert this by spying on the facade).

Then a randomized soak: N random inserts and removals from random starting states (empty, one chip,
several chips, typed text with and without a trailing space), asserting the two invariants after
each step plus "no dock chip ever renders `unavailable` for a ref present in `occurrences`".

**Unit test for the conversion helper** (table-driven, no host needed): `clipToDetect` /
`detectStartOf` / `detectLength` over — empty document; one chip; two chips; a position inside a
chip's clipboard expansion; a position exactly at a chip boundary; a position after the last chip;
typed text with no chips. The two-chip and inside-a-chip rows are the ones the original code got
wrong.

---

## 5. Routine checks before calling input-machine verbs (maintainer discipline — unscored)

1. **Identify the frame of every number before you pass it.** `TokenSpan` ⇒ detect coordinates; `Occurrence.offset`/`length`, `InputState.draft` ⇒ clipboard coordinates. The contract file says so in one line each; read those lines, do not infer them from field names.
2. **Grep the facade for `this.projection.detectText` vs `this.projection.clipboardText`** to see which text a guard slices or compares — that is the frame the verb lives in. In this host both verbs slice `detectText`.
3. **Never treat `draft.length` as a coordinate.** Convert, or derive the detect length as `draft.length − Σ(length − 1)`.
4. **Read `draftRev` from the same snapshot your offsets come from, and re-snapshot after every successful edit** (both verbs are CAS-guarded: `span.draftRev !== this.rev ⇒ false`).
5. **Never ignore a verb's boolean.** Mutate plugin-side bookkeeping only on `true`; on `false`, re-snapshot and classify (rev changed ⇒ concurrent edit; rev unchanged ⇒ your coordinates were wrong).
6. **Check the phase guard against the host's, not against your assumption** — the host accepts `plain` *and* `claimed` for `insertReference`.
7. **Keep the projection invariant in CI** (`draft.length − Σ(length − 1) === detectText.length`, and "every span passed to a verb is in range at call time"). It is a two-line assertion that fails loudly on any future coordinate regression, including ones introduced by host changes to chip expansion.
8. **When the host adds a projection, a new verb, or changes how a chip is expanded, re-verify every call site against the new excerpts before release.**

---

## Appendix — worked numbers from the capture

| step | `draft` (clipboard) | `detectText` | plugin span | correct span | outcome |
|---|---|---|---|---|---|
| paste #1 (empty) | `""` (0) | `""` (0) | `[0,0)` | `[0,0)` | ✔ applied, rev bumps |
| after #1 | `"[attachment: screenshot.png] "` (29) | `"￼ "` (2) | — | — | occurrence `offset 0, length 28` |
| paste #2 | (29) | (2) | `[29,29)` | `[2,2)` | ✘ refused → toast |
| × on chip #1 | (29) | (2) | `[0,28)` | `[0,1)` | ✘ refused, return ignored, record deleted → `unavailable` |
| 3 chips | 87 | 6 | `[87,87)` | `[6,6)` | divergence 81 = 3 × 27 |

Note on the table: `"￼ "` denotes the detect text, i.e. the single character U+FFFC (OBJECT
REPLACEMENT CHARACTER) followed by the separator space — length 2, versus the 29-character
clipboard-text draft.

## Required output (JSON only)
{"decisions":[{"id":"<criterion-id>","verdict":"pass|partial|fail|missing","reason":"short"}],"caps":[{"id":"<cap-id>","triggered":false,"reason":"short"}]}
Every criterion and cap exactly once. pass=full points, partial=half, fail/missing=0; a triggered cap caps the total.