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

# S9 · Composer Coordinate Trap — Root-cause report

**Subject:** `@org/dsh-attach-input` v0.2.3 on DSH `0.1.2-alpha.3`
**Evidence:** `/app/fixture/` (read-only) — `plugin-client.js`, `host-input-facade.ts`, `host-input-contract.ts`, `console-session.txt`
**Scope:** items 1–4 of the brief are answered; item 5 is included at the end as ungraded guidance.

---

## TL;DR — one contract misread, two symptoms

Your plugin reads the composer in **clipboard-text coordinates** and hands those numbers to host verbs that
work in **detect coordinates**. The host publishes *two different coordinate spaces* for the same document,
and a chip is **one character (U+FFFC)** in one of them and **28 characters** (its `clipboardText`) in the other.

* **Symptom 1 (second paste → toast).** The insert anchor `snapshot.draft.length` is a clipboard-space
  number; the host splices the *detect* text, which is far shorter. The span misses the document, the
  splice applies nothing, `insertReference` returns `false`, and your code throws the toast.
* **Symptom 2 (× → `unavailable`).** The removal span `[occurrence.offset, occurrence.offset + occurrence.length)`
  = `[0, 28)` is also clipboard-space; the chip is a single char in detect space. The splice applies
  nothing, `consumeToken` returns `false`, **you never check that boolean**, you nevertheless
  `records.delete(ref)`, and the dock chip's meta resolves to `unavailable`.

Both are the same defect: *clipboard-space values passed to a detect-space API*. The identity conversion
you use is accidentally correct only while the document contains **zero** chips — which is exactly why the
first paste works and every later one fails.

---

## 1 · Why the FIRST paste succeeds and every later paste fails

### 1.1 The two coordinate spaces the host publishes

From `host-input-contract.ts` (trimmed to the fields you read):

| Published value | Host doc comment | Space |
|---|---|---|
| `InputState.draft` | "Clipboard-text projection of the editor document (chips expanded to their clipboard form)" | **clipboard** |
| `Occurrence.offset` | "Offset in the clipboard-text projection" | **clipboard** |
| `Occurrence.length` | "Length in the clipboard-text projection; the occurrence occupies exactly [offset, offset+length)" | **clipboard** |
| `EditorProjection.detectText` | "Trigger/TokenSpan coordinate text (chip = one U+FFFC)" | **detect** |
| `EditorProjection.clipboardText` | "Persistence/InputState draft text (chip = clipboardText)" | **clipboard** |
| `EditorProjection.occurrences` | "InputState-compatible occurrence view (clipboardText coordinates)" | **clipboard** |

From `host-input-facade.ts`:

* `insertReference(ref, span: TokenSpan)` — the doc comment says *"pick-time span snapshot (**detect
  coordinates**)"*; the verb peeks the tail with `this.projection.detectText.slice(span.end, span.end + 1)`
  and splices via `$replaceDetectSpanWithNodes(span, nodes)`.
* `consumeToken(guard)` — the `span` branch splices via `$replaceDetectSpanWithText(guard.span, '')`
  (detect text); the `bare-token` branch of the *same function* compares
  `this.projection.clipboardText.trim() !== guard.token` (clipboard text).

So: **`TokenSpan` — the argument of both verbs you call — is always in detect coordinates.** `getSnapshot()`
hands you clipboard coordinates. Your code passes the first straight into the second.

### 1.2 The exact mismatch in your insert path

`plugin-client.js` (add path):

```js
input.insertReference({ source: SOURCE, ref, label: item.path, appearance: 'file',
                        clipboardText: `[attachment: ${item.path}]` },
  { start: snapshot.draft.length,   // ← clipboard-space number
    end:   snapshot.draft.length,   // ← clipboard-space number
    draftRev: snapshot.draftRev });
```

The host compares and splices that span against the **detect** text. Concretely, using the numbers in
`console-session.txt` after paste #1:

```
draft      = "[attachment: screenshot.png] "   → 29 clipboard chars
occurrence = { offset: 0, length: 28 }          → the chip's clipboard expansion
detectText = U+FFFC + " "                       →  2 detect chars
```

Paste #2 computes the anchor `start = end = snapshot.draft.length = 29` and asks the host to splice at
offset **29 of a 2-character detect text** — 27 characters past the end of the document. The span does not
address any real text, `$replaceDetectSpanWithNodes` applies nothing, `applied` stays `false`, and the verb
returns `false`. Your code then does `records.delete(ref)` and throws
`'The DSH composer changed before the attachment could be inserted'`.

**The toast is a misdiagnosis, and the message itself is the first bug's fingerprint.** The guard that
actually rejects the call is *not* the revision CAS (`span.draftRev !== this.rev`, `host-input-facade.ts:17`):
`snapshot.draftRev` is re-read from the live snapshot immediately before the call, so it matches `this.rev`.
The rejection is "your span is not in my coordinate space". Note also that `host-input-facade.ts:18` computes
`tail = detectText.slice(span.end, span.end + 1)` — at `span.end = 29` that is `""`, not `" "`, so even the
"is a space already next?" branch is being asked about a position that does not exist in the detect text.

### 1.3 Why "first works, later fails" is the signature of this specific mismatch

Your conversion function is effectively the **identity** — the clipboard offset is copied into the span
unchanged. The identity is correct **iff the document contains no chips**, because only then do the two
spaces agree character-for-character:

| document state | clipboard length | detect length | identity conversion |
|---|---|---|---|
| empty composer (paste #1) | 0 | 0 | ✔ correct (both are 0) |
| after paste #1 (1 chip) | 29 | 2 | ✘ off by 27 (29 vs 2) |
| after paste #2 (2 chips) | 58 | 4 | ✘ off by 54 |

The first paste therefore succeeds **by accident**: the composer is empty, so the anchor is 0 in both spaces
and the chip lands at the only valid position. That first paste then *creates* the divergence permanently —
one chip contributes 28 clipboard chars but 1 detect char — so every subsequent anchor computed from
`draft.length` overshoots the detect text by `Σ(chip.length − 1)` and is out of range. The error grows with
every chip, so paste #2 already fails at 29 > 2, and it would keep failing in any non-empty composer.

This rules out the other candidate explanations, which is what makes the pattern diagnostic:

* **Revision CAS (`draftRev`) mismatch** — would fail the *first* paste too, or fail only after a
  concurrent/unrelated edit (non-deterministic). Your failure is deterministic from paste #2 onward.
* **Phase not `plain`** — the `add` path explicitly re-checks `snapshot.phase !== 'plain'` and throws a
  *different* message ("Wait for the current input operation to finish").
* **A real host-side document change between the two calls** — the capture shows the draft did not change
  between paste #1 and paste #2; the composer content was identical.

Deterministic success on an empty composer, deterministic failure on every subsequent paste, with an
overshoot exactly equal to the accumulated chip expansions ⇒ coordinate-space mismatch.

---
## 2 · Why the × click turns the chip into `unavailable` instead of removing it

### 2.1 The removal path, traced

`plugin-client.js` (remove path):

```js
const end = occurrence.offset + (occurrence.length ?? 1);     // 0 + 28 = 28
if (typeof input.consumeToken === 'function') {
  input.consumeToken({ kind: 'span',
    span: { start: occurrence.offset, end, draftRev: snapshot.draftRev } });   // [0, 28)
}
records.delete(occurrence.ref);   // ← unconditional
changed();                        // ← re-render the dock
```

`occurrence.offset` and `occurrence.length` are **clipboard** coordinates by contract
(`Occurrence.length`: "Length in the clipboard-text projection"). The chip is **one character** in detect
space. So you sent the host a span `[0, 28)` meaning "delete 28 characters", while the document it is
looking at is 2 characters long (`U+FFFC + " "`), and the chip you meant to delete is the single char at
`[0, 1)`.

Inside the host, `consumeToken`'s span branch:

```ts
if (guard.span.draftRev !== this.rev || guard.span.start === guard.span.end) return false
this.applyEdit(() => { applied = $replaceDetectSpanWithText(guard.span, '') })
return applied
```

The revision CAS passes (fresh `draftRev`) and `start !== end` (0 ≠ 28), so the guard does **not** reject
it — the *splice* fails, because `[0, 28)` is out of range for a 2-char detect text. `applied` stays `false`
and `consumeToken` returns `false`.

### 2.2 The plugin-side bookkeeping that turns a no-op into `unavailable`

**The return value of `consumeToken` is never inspected** — the capture says so explicitly
("`consumeToken(...) returned (not inspected by the plugin code)`"). Three consequences follow, in order:

1. The host keeps the chip: the composer still shows it ("composer chip still present" in the capture).
2. `records.delete(occurrence.ref)` runs anyway → the plugin's private `Map` no longer contains the ref.
3. `changed()` re-renders the dock. The dock chip's meta expression is
   `record === undefined ? 'unavailable' : humanBytes(record.total)` — and `record` is now `undefined`
   because step 2 deleted it. Hence the label flips from `48.2 KiB` to **`unavailable`**.

So `unavailable` is not a rendering bug — it is the *visible symptom of a desynchronised record*: the plugin
believes the attachment is gone, the host says it is still there. The chip that remains on screen is a
**ghost**: drawn from the host's occurrence list (or from the stale dock entry) but with no backing record,
so it can never be removed again by the × handler, because the handler now has nothing to remove.

**Corroborating detail that pins the diagnosis:** the legacy fallback branch
`input.setDraft(snapshot.draft.slice(0, occurrence.offset) + snapshot.draft.slice(end))` is written in
**clipboard** space, against `draft` (a clipboard string) and clipboard occurrence offsets — it is
*coordinate-correct*. Only the primary path (the detect-space verb) is wrong. The plugin mixed the two
spaces: it used clipboard-space values to drive a detect-space verb. (Minor, non-blocking: that fallback
leaves the trailing space behind, since it slices `[0,0)` + `[28,29)` = `" "`. Worth a cleanup, but it is not
the reported bug.)

---

## 3 · The fix direction

### 3.1 The rule, derived from the host source

**Rule — clipboard→detect conversion.** A chip occupies `occurrence.length` characters in clipboard space but
exactly **1** character in detect space. Therefore every occurrence that lies entirely at-or-before a
character position `c` absorbs `occurrence.length − 1` clipboard characters:

```
detectPos(c, O) = c − Σ { (o.length − 1) : o ∈ O, o.offset + o.length ≤ c }
```

where `O` is the occurrence list of the **current** snapshot, sorted by offset.

Equivalently: `detectPos = c − (clipboard chars contributed by chips before c) + (number of chips before c)`.

* An occurrence's own detect range is a **single character**: `[detectPos(o.offset), detectPos(o.offset) + 1)`.
  Its detect *width is always 1* — never `o.length`.
* A position that falls strictly *inside* a chip's clipboard range has no detect-space meaning of its own;
  normalise it to that chip's detect start.

**Derivation check against the capture** (1 chip, `o = {offset: 0, length: 28}`, `draft.length = 29`):

| quantity | clipboard value | detect value | check |
|---|---|---|---|
| document end | 29 | `detectPos(29) = 29 − 27 = 2` | ✔ `detectText.length === 2` |
| chip start | 0 | `detectPos(0) = 0` | ✔ |
| chip end | 28 | `detectPos(28) = 28 − 27 = 1` | ✔ chip = `[0,1)`, width 1 |

**Anchor for "insert at the end of the draft"** = `detectPos(draft.length, occurrences)`.
In the capture that is **2**, not 29 — and 2 is exactly the position where the host's own tail-peek
(`detectText.slice(span.end, span.end+1)`) sees the space that already follows the first chip, so the host
inserts the new chip without adding a second space.

> Note: the excerpt shows that the plugin-facing `InputState` (`host-input-contract.ts`) does **not** carry
> `detectText`; only `EditorProjection` does. Whether your `input.state` also exposes a detect-space
> projection is **unconfirmed** from this fixture. If it does, prefer the host's own projection over
> recomputing it; if it does not, implement `detectPos` from `snapshot.draft` + `snapshot.occurrences` as above.

### 3.2 Call sites to change

**(A) Insert path — `add()`, `plugin-client.js:27-32` (the span literal).**

Convert the end-of-draft anchor to detect space, and recompute it **per iteration** (the loop already
re-reads the snapshot at line 37, so the newly inserted chip's occurrence is visible in the next iteration):

```js
const detectEnd = toDetectPos(snapshot.draft.length, snapshot.occurrences);
input.insertReference(refInsert, { start: detectEnd, end: detectEnd, draftRev: snapshot.draftRev });
```

Leave `draftRev` as-is — it is the CAS token and the facade compares it against `this.rev`
(`host-input-facade.ts:17`); that part of your code is already right. The `input.setDraft(...)`
normalisation at lines 13-16 stays where it is (it is a clipboard-space API and is used correctly); it must
still run **before** the anchor is computed, and the snapshot must be re-read after it (you already do).

**(B) Removal path — `remove()`, `plugin-client.js:49-54` (the span literal).**

Convert the occurrence's start to detect space, and use the chip's detect **width of 1**, not
`occurrence.length`:

```js
const d = toDetectPos(occurrence.offset, snapshot.occurrences);
input.consumeToken({ kind: 'span', span: { start: d, end: d + 1, draftRev: snapshot.draftRev } });
```

In the capture: `d = 0`, so the span becomes `[0, 1)` — the single `U+FFFC` — instead of `[0, 28)`.

Two further points on this path:

* **Use the host's current occurrence, not a stale one.** The `occurrence` object handed to `remove()` by the
  dock may come from an older render; its clipboard `offset` shifts whenever text before the chip changes.
  Re-read the matching occurrence from the *current* snapshot (match on `occurrenceId`) and convert that
  one. `Occurrence.occurrenceId` is described as a "shell-assigned stable identity", which is exactly what
  you want for this lookup.
* **Check the return value and gate the bookkeeping on it** (see (C)).

**(C) Bookkeeping — `plugin-client.js:58` (`records.delete(occurrence.ref)`).**

Do not delete the record unless the host actually removed the chip:

```js
const consumed = input.consumeToken({ kind: 'span', span });
if (!consumed) return;              // keep the record, keep the size label, surface a real error
records.delete(occurrence.ref);
changed();
```

This is the fix for the `unavailable` symptom **as a symptom**: a failed removal must leave the chip
removable and keep its label, rather than stranding a ghost chip. With (B) applied the removal succeeds, so
this branch normally will not trigger — but it is the difference between "one failure is visible" and "one
failure corrupts the plugin's state".

Longer term, the dock chip's metadata should be derived from the **host's** occurrence list
(`snapshot.occurrences` ↔ `records`), with the plugin's `Map` as a cache keyed by `ref`, so a failed or
partial host operation can never desynchronise the label from the document.

**(D) Summary — one rule, two call sites.**

| call site | clipboard value you had | detect value you must send |
|---|---|---|
| `add()` insert span | `start = end = draft.length` | `start = end = detectPos(draft.length, occurrences)` |
| `remove()` consume span | `start = occurrence.offset`, `end = offset + occurrence.length` | `start = detectPos(occurrence.offset, occurrences)`, `end = start + 1` |

Everything else in the two verbs' payloads (`draftRev`, `ref`, `label`, `appearance`, `clipboardText`) is
space-agnostic and stays as it is. In particular, `clipboardText` is the *persistence* form of the chip
(clipboard space) and is correct as you build it.

---
## 4 · Regression test plan

Three layers. The rule of thumb: **assert the arguments you send to the host verb, not only the visible
outcome** — a black-box "a chip appeared" assertion can pass while the coordinates are still wrong.

### Layer A — unit tests for the conversion helper (pure function, no host)

| # | input | expected |
|---|---|---|
| A1 | empty doc, `c = 0` | `detectPos(0) = 0` |
| A2 | 1 chip `{offset:0,length:28}`, draft len 29 | `detectPos(29) = 2`; `detectPos(0) = 0`; `detectPos(28) = 1`; chip detect range `[0,1)` |
| A3 | 2 chips (clipboard lens 28 + 28), draft len 58 | `detectPos(58) = 4`; 2nd chip detect range `[2,3)` |
| A4 | text + chip: draft `"hello [attachment: x.png] "` (chip at offset 6, len 28) | `detectPos(35) = 8`; chip detect range `[6,7)` |
| A5 | chip whose `clipboardText` is 1 char (`length = 1`) | `detectPos` unchanged (off-by-one guard: `length − 1 = 0`) |
| A6 | position strictly inside a chip's clipboard range | normalises to that chip's detect start |
| A7 | 3 chips with mixed lengths | `detectPos(draft.length) == detectText.length` for every fixture |

**A7 is the highest-value unit assertion:** for any document, `detectPos(draft.length, occurrences)` must
equal the length of the detect text, i.e. `draft.length − Σ(length − 1)`. If that invariant ever fails, the
helper is wrong for every anchor.

### Layer B — host-verb tests (fake/stub facade carrying the same guards, or a real input machine)

1. **B1 — first paste inserts (baseline).** Empty composer; `add()`; assert `insertReference` was called with
   `span { start: 0, end: 0, draftRev: rev }`; assert it returned `true`; assert exactly **one** occurrence
   exists; assert the dock chip shows the **size** (`48.2 KiB`), not `unavailable`.
2. **B2 — second paste inserts (regression for symptom 1).** After B1, `add()` again; assert **no throw** and
   **no toast**; assert `insertReference` returned `true`; assert **two** occurrences; assert the second
   call's span was `{ start: 2, end: 2, draftRev: rev }` while `snapshot.draft.length === 29` — i.e. assert
   the anchor is in **detect** space, not the clipboard length. This is the test that must fail against
   v0.2.3 (it would have been `{start: 29, end: 29}`).
3. **B3 — third paste, anchor advances by 2, not by 29.** Assert the spans sent are `0`, `2`, `4`.
4. **B4 — paste into a composer that already has typed text.** Type `"hello"`, paste; assert the anchor is
   `detectPos(5) = 5`.
5. **B5 — paste of multiple items in one call** (the `for` loop): assert two chips, anchors `0` then `2`,
   and that the second anchor was computed from the **refreshed** snapshot (i.e. it accounts for the first
   chip inserted in the same call).
6. **B6 — removal removes the chip (regression for symptom 2).** After B1, click ×; assert `consumeToken`
   was called with `span { start: 0, end: 1, draftRev: rev }` (not `[0,28)`); assert the host's occurrence
   list is now **empty**; assert the composer no longer contains the chip; assert the **dock chip is gone**
   (not rendered with `unavailable`); assert `records` no longer contains the ref.
7. **B7 — removal of the second of two chips.** Paste twice, remove the second; assert the **first** chip
   survives, occurrences length 1, the surviving occurrence's clipboard offset is still 0 and its detect
   range is `[0,1)`.
8. **B8 — removal with a stale occurrence object.** Mutate the composer (paste again) between render and
   click, then remove using the older occurrence; assert the removal targets the **current** occurrence
   (matched by `occurrenceId`) and the other chip survives.
9. **B9 — failed removal must not corrupt state.** Force `consumeToken` to return `false` (e.g. a stub
   returning `false`, or phase `claimed`); assert: the dock chip **still shows the size label** and **never**
   renders `unavailable`; the composer chip is still present; `records` still contains the ref so the user can
   retry; an error is surfaced to the user. *(This is the test that pins the bookkeeping fix (C).)*
10. **B10 — failed insert rolls back.** Force `insertReference` to return `false`; assert the record is
    removed, no orphan chip appears, and the error is reported. (You already do `records.delete(ref)` here —
    keep it; assert it so it is not lost in a refactor.)
11. **B11 — wrong-space regression guard.** Assert directly that no `TokenSpan` ever sent to
    `insertReference` / `consumeToken` has `end > detectText.length`, and that every span lies inside
    `[0, detectText.length]`. A cheap property assertion that would have caught both bugs.

### Layer C — end-to-end smoke in a real browser against the host (Playwright / manual)

* C1 — paste one file → **1** dock chip + **1** composer chip, dock chip shows the size.
* C2 — paste a second file → **2** dock chips + **2** composer chips, **no toast**, and the second chip sits
  after the first with a single space between them (no doubled space, no missing space).
* C3 — paste a third file → 3 chips, still no toast.
* C4 — click × on the **first** chip → that chip disappears from **both** the dock and the composer, the
  other chips remain, and **no `unavailable` label appears anywhere**.
* C5 — click × on the last chip → same expectations; the composer text is left with the remaining chips and
  the surrounding text intact (no truncation of neighbouring text — the classic symptom of a clipboard-space
  splice being applied to a detect-space document, or vice versa).
* C6 — type text, paste, then click × → the typed text is preserved and only the chip is removed.

**Minimum bar to close the bug:** B2, B6 and B9 must be red on v0.2.3 and green after the fix. B11 and A7 are
the cheap generalisation that keep this class of defect from coming back.

---

## 5 · Routine source-reading discipline before calling input-machine verbs (guidance, ungraded)

Before you call any input-machine verb, read the host source for **five** things, and keep a small
"coordinate space" table in the plugin's README mapping every field you read to its space:

1. **What space does the verb's `span` live in?** Read the verb's own doc comment and its splice target
   (`$replaceDetectSpanWithNodes` / `$replaceDetectSpanWithText` operate on the **detect** text;
   `setDraft` and the bare-token branch operate on **clipboard** text). A verb's *name* tells you nothing;
   its guard does. In this fixture, `insertReference` and `consumeToken` both take **detect** coordinates
   even though `consumeToken`'s sibling branch compares clipboard text.
2. **What space is the state I read in?** `InputState.draft`, `Occurrence.offset`, `Occurrence.length` are
   clipboard-space; `EditorProjection.detectText` is detect-space. Check the field's doc comment, not the
   field's name — `EditorProjection.occurrences` is explicitly "InputState-compatible … (clipboardText
   coordinates)".
3. **What is the unit of a chip in each space?** Detect space: exactly one character (U+FFFC). Clipboard
   space: the chip's `clipboardText` length. Any hard-coded "1" or "one char per chip" assumption must be
   tied to the space you are in.
4. **Does the verb return a boolean I must inspect, and what are all its failure modes?** `insertReference`
   and `consumeToken` return `false` for at least three distinct reasons: wrong `phase`, stale `draftRev`
   CAS, and a span that does not address the target text. Check the return value; and never let one generic
   error message stand in for all of them — your toast said "the composer changed", which sent the
   investigation toward revision conflicts instead of toward coordinates. Give each failure its own
   diagnostic.
5. **Which field is the CAS token, and which is the payload?** `draftRev` is the compare-and-swap token and
   must come from the *current* snapshot (re-read it after any call that mutates the draft, e.g. your
   `setDraft` normalisation). `clipboardText` is a *persistence* payload, not a coordinate — do not derive
   spans from it.

Also: check the **exact source paths of the version you target** —
`packages/client/ui-conversation/src/client/input/facade.ts`,
`packages/client/ui-conversation/src/client/contract/input.ts`,
`packages/client/ui-conversation/src/client/input/editor/projection.ts` — and diff them when you bump the
host version; a coordinate convention like "chip = one U+FFFC" is exactly the kind of detail that changes
between alphas without appearing in a changelog.

---

## Appendix · Numeric trace of the capture (reproduction of the two failures)

```
after paste #1
  clipboard space : draft = "[attachment: screenshot.png] "     (29 chars)
                    occurrences = [{ offset: 0, length: 28 }]
  detect space    : detectText = <U+FFFC> + " "                (2 chars)

paste #2  (v0.2.3)
  plugin sends    : span { start: 29, end: 29, draftRev }        ← clipboard number
  host sees       : detectText.length = 2  →  span out of range, splice applies nothing
  result          : insertReference → false
                    → records.delete(ref); throw "The DSH composer changed before …"

paste #2  (fixed)
  plugin sends    : span { start: 2, end: 2, draftRev }          ← detectPos(29) = 29 − 27
  host sees       : tail = detectText.slice(2,3) = ""  → chip + space inserted
  result          : detectText = <U+FFFC> " " <U+FFFC> " "  →  2 occurrences

click ×  (v0.2.3)
  plugin sends    : span { start: 0, end: 28, draftRev }         ← clipboard number (width 28)
  host sees       : detect text is 2 chars, chip is 1 char at [0,1) → splice applies nothing
  result          : consumeToken → false  (return value NOT checked)
                    → records.delete(ref) anyway → dock meta = "unavailable"
                    → composer chip still present (ghost)

click ×  (fixed)
  plugin sends    : span { start: 0, end: 1, draftRev }          ← detectPos(0) = 0, chip width 1
  host sees       : splices the single U+FFFC → chip removed
  result          : consumeToken → true → records.delete(ref) → chip gone from dock and composer
```

**Unconfirmed / out of scope:** the internal implementation of `$replaceDetectSpanWithNodes` and
`$replaceDetectSpanWithText` is not part of the fixture, so the exact internal reason an out-of-range span
is rejected (range check vs. no-match) cannot be read from the evidence pack. The conclusion — that the
span is expressed in the wrong coordinate space and therefore does not address the intended text, so no
edit is applied and the verb returns `false` — is directly supported by the capture (`insertReference
returned false`, `consumeToken(...) returned`) and by the facade's use of the detect text for both the tail
peek and the splice. Whether the plugin-facing input snapshot also exposes a detect-space projection is
likewise not determinable from the trimmed contract excerpt.



## Required output (JSON only)
{"decisions":[{"id":"<criterion-id>","verdict":"pass|partial|fail|missing","reason":"short"}],"caps":[{"id":"<cap-id>","triggered":false,"reason":"short"}]}
Every criterion and cap exactly once. pass=full points, partial=half, fail/missing=0; a triggered cap caps the total.