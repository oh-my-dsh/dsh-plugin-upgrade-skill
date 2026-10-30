# S9 · Composer Coordinate Trap — diagnosis of @org/dsh-attach-input v0.2.3 on DSH 0.1.2-alpha.3

**Verdict up front:** both reported symptoms are one defect, not two. The plugin feeds
**clipboard-projection coordinates** into host verbs that splice the **detect projection**.
Symptom 2 (the toast) is that mismatch on the insert path; symptom 3 (the `unavailable` chip)
is the same mismatch on the removal path, plus plugin bookkeeping that ignores the verb's
failure return. Evidence: `fixture/plugin-client.js`, `fixture/host-input-facade.ts`,
`fixture/host-input-contract.ts`, `fixture/console-session.txt`.

---

## 0. The two projections the host maintains (from the host excerpts)

`host-input-contract.ts` publishes two coordinate spaces over the same document:

| Projection | Where it is exposed | A reference chip is… |
|---|---|---|
| **detect text** | `EditorProjection.detectText` — "Trigger/TokenSpan coordinate text (**chip = one U+FFFC**)" | exactly **1** character (U+FFFC) |
| **clipboard text** | `EditorProjection.clipboardText`, and `InputState.draft` — "Clipboard-text projection of the editor document (**chips expanded to their clipboard form**)" | its full `clipboardText` string |

And critically:

- `InputState.occurrences` is the "InputState-compatible occurrence view
  (**clipboardText coordinates**)" — `Occurrence.offset` / `Occurrence.length` are
  **clipboard** offsets/lengths (contract lines 14–16: "Offset in the clipboard-text
  projection… the occurrence occupies exactly [offset, offset+length)").
- `host-input-facade.ts` documents both verbs' spans as **detect** coordinates:
  `insertReference(ref, span: TokenSpan)` — "@param span - pick-time span snapshot
  (**detect coordinates**)" — and its body splices via `$replaceDetectSpanWithNodes(span, …)`
  on `this.projection.detectText` (facade lines 18, 24). `consumeToken`'s span guard likewise
  applies `$replaceDetectSpanWithText(guard.span, '')` (facade line 41) on the detect text.

**The contract misread:** the plugin treats everything it reads from `InputState` —
`draft.length`, `occurrence.offset`, `occurrence.length` — as if they were detect /
TokenSpan coordinates. They are clipboard coordinates. Each chip therefore contributes
`clipboardText.length` characters to the numbers the plugin computes but only **1**
character to the text the host verb actually splices — a divergence of
`clipboardText.length − 1` per chip.

---

## 1. Why the FIRST paste succeeds and every later paste fails (the toast)

**The call site** (`plugin-client.js` lines 27–32): the insertion span is

```js
start: snapshot.draft.length,   // ← clipboard-projection length
end:   snapshot.draft.length,
draftRev: snapshot.draftRev,
```

**What the host guard compares against** (`host-input-facade.ts` lines 14–26):

1. `span.draftRev !== this.rev` → return false — a revision CAS on the *editor revision*.
   This check **passes**: the plugin re-reads the snapshot immediately before the call
   (line 11, and again at line 37 after each item), so `snapshot.draftRev === this.rev`.
2. `$replaceDetectSpanWithNodes(span, nodes)` — splices **detectText** at `[span.start, span.end)`.
   This is the check that fails.

**Why "first works, later fails" is the exact signature of this mismatch:**

- **First paste:** the composer is empty — zero chips. With no U+FFFC in the document,
  `detectText === clipboardText`, so the two coordinate systems are *degenerately equal*.
  The span `{start: 0, end: 0}` is a valid detect span, the chip is spliced in, the host
  appends the separating space (facade lines 21–23), and everything looks fine. This is not
  luck of timing; it is the one state in which the misread is invisible.
- **Every later paste:** at least one chip now exists. In the capture, after paste #1
  `draft = "[attachment: screenshot.png] "` (**length 29**) while
  `detectText = "\uFFFC "` (**length 2**) — the chip is 1 detect character but 28
  clipboard characters, a divergence of 28 − 1 = **27**. Paste #2 computes
  `start = end = 29` and hands it to a verb that splices a 2-character detect text.
  Offset 29 is out of range, `$replaceDetectSpanWithNodes` cannot apply,
  `applied` stays `false` (facade lines 19/24/26), `insertReference` returns `false`,
  and the plugin throws the toast (lines 33–36). The capture confirms it:
  `insertReference returned false; no second chip anywhere`.

**Why the toast text is misleading:** it says "The DSH composer changed before the
attachment could be inserted", i.e. it blames the revision CAS — but the CAS passes.
`insertReference` returns `false` for three independent reasons (phase not
plain/claimed, `draftRev` mismatch, span not appliable in detect coordinates); this plugin
only ever produces the third. The failure is deterministic and grows with each chip
(divergence accumulates as Σ(clipboardText.length − 1)), which is why it is *every* later
paste, never just an occasional one.

---

## 2. Why the × click turns the chip into `unavailable` instead of removing it

The removal path (`plugin-client.js` lines 43–60) has the same coordinate defect plus a
bookkeeping defect, and the two compose:

1. **Coordinate defect (same root cause).** The dock chip is rendered from a host
   `Occurrence` whose `offset`/`length` are **clipboard** coordinates
   (`{offset: 0, length: 28}` in the capture). `remove()` builds
   `span: { start: 0, end: 28 }` and calls `consumeToken`, whose span guard
   (facade lines 37–43) checks `draftRev` (passes — the snapshot is fresh) and
   `start !== end` (passes), then applies `$replaceDetectSpanWithText({0, 28}, '')`
   to a detect text of length 2. Out of range → `applied = false` → **the host edit never
   happens**, so the composer chip stays. (The code comment "the removal must span
   occurrence.length, not one character" is the misread in one sentence: 28 is the length in
   the *clipboard* projection; in the *detect* projection the occurrence is exactly one
   character.)
2. **Bookkeeping defect.** The plugin **never inspects `consumeToken`'s return value**
   (the capture notes this: "returned (not inspected by the plugin code)") and then
   **unconditionally** runs `records.delete(occurrence.ref)` + `changed()` (lines 58–59).
3. **The visible symptom.** The dock renders from the host's occurrence view, which still
   contains the occurrence (the host edit never applied), but the plugin-side record is gone.
   The render expression (lines 63–65) resolves `record === undefined ? 'unavailable' : …`
   → the chip stays on screen with its size label replaced by `unavailable`, and the
   composer chip stays too. Exactly the capture: "dock chip STILL rendered, meta now reads
   'unavailable'; composer chip still present; records no longer contains the ref".

So the removal is a *divergence* bug: plugin-side state (`records`) is mutated on the
assumption the host edit applied, without checking that it did. The `unavailable` label is
the render-time proof that the two sides disagreed.

---

## 3. Fix direction — the conversion rule, derived from the host excerpts

**Rule (from `host-input-contract.ts`):** in the detect projection each chip is one U+FFFC;
in the clipboard projection it is its `clipboardText`. Therefore, for a clipboard offset
*c* and the occurrence list *O* of the same snapshot:

```
detectOffset(c) = c − Σ_{o ∈ O, o.offset < c} (o.length − 1)
```

and a chip's extent in detect coordinates is exactly **1** character (`length` is a
clipboard-projection field and must not be reused as a detect length). The `draftRev`
CAS needs **no** conversion — the contract states `draftRev` is the shared "monotonic
editor revision" and the facade compares it against `this.rev`; it is the coordinates,
not the currency, that are wrong.

**Call site A — insert path (`add()`, lines 21–32).** Replace
`start: snapshot.draft.length, end: snapshot.draft.length` with the detect end of the draft:

```js
const at = detectOffset(snapshot, snapshot.draft.length);   // == detectText length
input.insertReference({ … }, { start: at, end: at, draftRev: snapshot.draftRev });
```

Because `add()` re-reads the snapshot after every item (line 37), a multi-item paste
converts each successive span against the updated occurrence list. In the capture this turns
paste #2's span from the invalid `{29, 29}` into the correct `{2, 2}`.

**Call site B — removal path (`remove()`, lines 43–60).** Convert the occurrence's
clipboard range to a detect range, and gate the bookkeeping on the verb's result:

```js
const start = detectOffset(snapshot, occurrence.offset);
// consume the separating space the insert verb appended (facade lines 21–23) when present,
// mirroring its "unless one is already next" normalization:
const sep = snapshot.draft[occurrence.offset + occurrence.length] === ' ';
const ok = input.consumeToken({
  kind: 'span',
  span: { start, end: start + 1 + (sep ? 1 : 0), draftRev: snapshot.draftRev },
});
if (!ok) return;                 // host edit did NOT apply — do not touch records, do not re-render
records.delete(occurrence.ref);
changed();
```

Two hardening points on the same path:

- **Re-resolve the occurrence at click time.** `occurrenceId` is the "shell-assigned
  stable identity" (contract lines 8–9) that exists precisely so a render-time occurrence can
  be matched against a fresh snapshot. If the user typed between dock render and click, the
  captured `offset` is stale; look the occurrence up by `occurrenceId` in
  `input.state.getSnapshot().occurrences` and convert *that* snapshot's coordinates.
  Converting a stale offset against a fresh snapshot can yield an in-range but wrong span
  that silently corrupts the draft instead of failing loudly.
- **The `setDraft` fallback (lines 55–57) needs no conversion** — it slices
  `snapshot.draft` directly, which is already the clipboard projection, so it is the one
  coordinate-consistent path today (it leaves the separator space behind, same policy
  question as above). Note it bypasses the `draftRev` CAS; prefer the span verb.

**Also fix the diagnosis, not just the arithmetic:** the toast text asserts a cause
("composer changed") that the code never verified. After conversion, a `false` return means
something genuinely concurrent happened; distinguish the cases (re-read phase and `draftRev`)
before telling the user the composer changed.

**Verification:** this rule was checked against a model transcribed line-for-line from the
two host excerpts (guards included: phase, `draftRev` CAS, out-of-range splices, the
appended separator). The model reproduces the capture byte-for-byte with the current plugin
(draft length 29 vs detect length 2, paste #2 toast, `unavailable` after ×) and passes
21/21 assertions with the fix applied, including repeat pastes, single/middle/sequential
removals, re-paste after removal, pre-existing text around chips, and the verb-failure
bookkeeping guard.

---

## 4. Regression test plan — sequences that must be asserted

All assertions below run against the real host verbs (or a model pinned to the facade
excerpt); none of them may regress to the capture's outputs. Numbers use the capture's file
(`clipboardText` 28 chars ⇒ detect divergence 27 per chip).

**Insert path (guards the toast bug):**

1. **Fresh-session paste:** empty composer → paste → assert span `{start: 0, end: 0,
   draftRev: R0}`, returns `true`, one occurrence, `draft` ends with the chip's
   clipboard text + one space, no toast.
2. **Immediate second paste (the reported bug):** paste again → assert span
   `{start: 2, end: 2}` — the detect length after one chip + separator — **not** `{29, 29}`;
   returns `true`; two occurrences; second occurrence at clipboard offset 29 with length 28;
   `draft` = `"[attachment: screenshot.png] [attachment: screenshot.png] "`; no toast.
3. **Paste after plain text:** draft `"note "` → paste → span `{6, 6}` (detect ==
   clipboard while no chips exist — pins the degenerate case).
4. **Paste after a chip with surrounding text:** draft `"note [attachment: a.png] "`
   (detect length 8) → paste → span `{8, 8}`, **not** `{29, 29}`; insertion lands after
   the existing chip; both chips intact.
5. **Multi-item paste in one `add()` call:** items `[f1, f2]` → both spans computed from
   fresh snapshots (second span = detect length after the first chip + separator); both
   return `true`; two occurrences.
6. **Draft-without-trailing-space normalization:** draft `"abc"` → `add()` first
   `setDraft("abc ")` → span `{4, 4}`.
7. **Re-paste after a removal:** paste → remove → paste → the new span is computed from the
   post-removal snapshot (detect length reflects the removal); new chip appended last.

**Removal path (guards the `unavailable` bug):**

8. **Single-chip removal:** paste → click × → assert span `{0, 1}` (detect), returns
   `true`; dock chip unmounted; composer occurrence gone; `draft` no longer contains
   `"[attachment:"`; no `unavailable` label ever rendered.
9. **Middle-of-three removal:** paste three chips → click × on the middle dock chip → assert
   span `{2, 3}` (+ separator `{2, 4}` if the separator policy is enabled) — the detect
   position of chip 2 — only that chip removed; remaining occurrences keep labels/sizes;
   `draft` = `"[attachment: a.png] [attachment: c.png] "`.
10. **Sequential removals:** paste two → remove the first (its occurrence is at clipboard
    offset 0; the second shifts to offset 0 only in the *next* snapshot) → remove the second
    → assert `draft` is restored to the exact pre-paste text and occurrences are empty.
11. **Verb-failure bookkeeping guard:** make `consumeToken` return `false` (mock, or a
    real concurrent edit that bumps `draftRev` between snapshot and call) → assert the
    plugin **keeps** the record, the dock chip keeps its real size label (never
    `unavailable`), the host occurrence is untouched, and the failure is surfaced as
    retryable rather than silently swallowed.
12. **Stale render-time occurrence:** capture the dock's occurrence object, then type text
    before the chip (offsets shift) → click × → assert the removal re-resolves by
    `occurrenceId` from a fresh snapshot and removes the correct chip (a stale offset must
    not silently splice the wrong range).
13. **Fallback path (host without `consumeToken`):** assert `setDraft` receives the
    clipboard-coordinate slice `draft.slice(0, occ.offset) + draft.slice(occ.offset +
    occ.length)` — clipboard in, clipboard out — and the chip disappears.

**Cross-cutting invariants (assert in every sequence above):**

14. The toast "The DSH composer changed before the attachment could be inserted" never
    appears in any sequence whose only edits are the plugin's own.
15. Dock and host never diverge: every rendered occurrence has a live record, every record
    has a host occurrence — equivalently, the dock meta label is never `unavailable` while
    the host still reports the occurrence.
16. Round-trip: paste 3 → remove the middle → paste again → occurrence count is 3, the new
    chip is last, and all labels/sizes match their files.

---

## 5. Maintainer routine — what to check in the host source before calling input-machine verbs

Not scored, but this is the discipline that prevents the class:

1. **Ask "which projection is this number in?" for every field you read and every span you
   pass.** `InputState.draft` / `occurrences[].offset|length` are the clipboard
   projection; facade verb spans are detect coordinates. The docstrings and the projection
   type comments in `host-input-contract.ts` / `host-input-facade.ts` say which is which —
   read them, never infer from field names.
2. **Read the guard, not just the signature.** `insertReference` can return `false` for
   phase, revision CAS, *or* span non-applicability. Treat `false` as "the edit did not
   apply" and never encode a guessed cause in user-facing text.
3. **Never mutate plugin-side bookkeeping before checking the verb's boolean.** The
   `unavailable` bug is entirely a consequence of skipping that check.
4. **Model the chip expansion (chip = one U+FFFC) whenever you compute an offset or length**,
   and watch for host-side normalization around your edit (the appended separating space) so
   the inverse operation accounts for it.
5. **On every host upgrade, diff the files you actually call into** — `facade.ts`,
   `contract/input.ts`, `input/editor/projection.ts` — rather than relying on the
   release cards; coordinate semantics can change without any "breaking change" card
   (0.1.2-alpha.3's own cards say nothing about the input facade).
6. **Pin behavior with tests that use real projection values** (detect length vs clipboard
   length, occurrence offsets), not just mocked `true` returns — a mock that always returns
   `true` passes forever while the coordinates rot.
