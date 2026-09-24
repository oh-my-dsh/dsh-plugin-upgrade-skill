# S9 · Composer Coordinate Trap — Diagnosis Report

**Task**: `@org/dsh-attach-input` v0.2.3 on DSH `0.1.2-alpha.3` — two user-visible bugs
(paste #2+ fails with "The DSH composer changed before the attachment could be inserted";
× click leaves the chip and shows `unavailable`).

**Mode**: A · inspect (read-only). Evidence: `fixture/plugin-client.js`,
`fixture/console-session.txt`, `fixture/host-input-facade.ts`,
`fixture/host-input-contract.ts`. No migration, installation, or fixture write was performed.

---

## Executive summary — one contract misread, two symptoms

The host's input machine has **two text coordinate systems** (see
`host-input-contract.ts`, `EditorProjection`):

| Projection | A chip is rendered as | Used by |
|---|---|---|
| **detectText** (Trigger/TokenSpan coordinates) | **one `U+FFFC` character** | the span arguments of the input verbs `insertReference(ref, span)` and `consumeToken({kind:'span', span})` — spliced by `$replaceDetectSpanWithNodes` / `$replaceDetectSpanWithText` |
| **clipboardText / draft** | the occurrence's full `clipboardText` (e.g. `[attachment: screenshot.png]`, 28 chars) | `InputState.draft` and `InputState.occurrences` (`offset`/`length` are documented as "offset/length **in the clipboard-text projection**") |

The plugin computes **every span it passes to the verbs in clipboard-text (draft)
coordinates** — `snapshot.draft.length` for insertion, `occurrence.offset +
occurrence.length` for removal — while the verbs' guards and splice helpers operate in
detect coordinates. The two coordinate systems coincide **only when the composer contains
no chips**; every chip makes them diverge by `occurrence.length − 1` characters. That is
exactly why **the first paste succeeds and every subsequent interaction fails**, and why
the removal path fails in the same way. Both user reports are one bug: a projection/
coordinate-system mix-up, compounded on the removal path by ignoring the verbs' boolean
return and deleting the plugin's own bookkeeping unconditionally.

---

## 1. Why paste #1 succeeds and every later paste fails

### What the plugin computes

`add()` (plugin-client.js):

```js
const accepted = input.insertReference({...}, {
  start: snapshot.draft.length,      // ← draft/clipboardText coordinate
  end: snapshot.draft.length,
  draftRev: snapshot.draftRev,       // ← correct: fresh snapshot, CAS passes
});
```

### What the host guard compares against

`insertReference` (`host-input-facade.ts`) checks:

1. `phase` must be `'plain'` or `'claimed'` — plugin already snapshots and throws unless
   `phase === 'plain'`, so this passes;
2. `span.draftRev !== this.rev` — the plugin re-snapshots after its optional
   trailing-space `setDraft`, so the CAS passes;
3. the span is handed to `$replaceDetectSpanWithNodes(span, nodes)`, which splices the
   **detect text** — where a chip is exactly **one `U+FFFC` character**, not its
   `clipboardText` expansion.

### The exact mismatch

After paste #1 the captured session log shows:

- `draft = "[attachment: screenshot.png] "` → **length 29** (clipboard-text projection);
- `occurrences = [{offset: 0, length: 28, ...}]`;
- therefore `detectText = "\uFFFC "` → **length 2**.

Paste #2 computes `start = end = 29` — a position **27 characters past the end of the
detect text** (detect length 2). The detect-span splice cannot apply at that position, so
`$replaceDetectSpanWithNodes` leaves `applied = false` and `insertReference` returns
`false`. The plugin translates `!accepted` into the toast
`"The DSH composer changed before the attachment could be inserted"` and rolls back its
record. **Nothing actually "changed before the insert"** — the revision guard passed; the
span was simply expressed in the wrong coordinate system. The toast message is the
plugin's own (mis)interpretation of a rejected span.

### Why "first works, later fails" is the signature

With an empty composer there are no chips, so `draft.length === detectText.length === 0`
and the two projections agree — paste #1 lands `start = end = 0`, which is valid in both
coordinate systems, and succeeds. From then on, **every chip in the composer makes the
draft `clipboardText` expansion longer than the detect text by
`Σ(occurrence.length − 1)` characters** (here 28 − 1 = 27). Every subsequent insert
computes an end-of-draft position that overshoots the detect text by that amount and is
rejected. The failure is not timing-dependent, not revision-dependent, and not
data-dependent — it is purely "does a chip already exist", which is why the first paste is
always fine and all later ones always fail. (Note the trailing-space normalization via
`setDraft` + re-snapshot does not help: `setDraft` takes draft text, and the re-snapshot
still reports draft/clipboard coordinates.)

---

## 2. Why the × click turns the chip into `unavailable` instead of removing it

Trace of `remove(sessionId, occurrence)`:

```js
const end = occurrence.offset + (occurrence.length ?? 1);   // = 0 + 28
input.consumeToken({
  kind: 'span',
  span: { start: 0, end: 28, draftRev: snapshot.draftRev }, // detect text is only "\uFFFC " (len 2)
});
records.delete(occurrence.ref);   // ← runs unconditionally
changed();                        // ← re-render
```

In the host's `consumeToken` span branch, the revision CAS passes (fresh snapshot) and
`start !== end`, so it proceeds to `$replaceDetectSpanWithText(guard.span, '')` — again
a **detect-coordinate** splice. The span `[0, 28)` extends 26 characters past the end of
the 2-character detect text, the splice cannot apply, `applied` stays `false`, and
`consumeToken` returns `false`. The plugin's own comment — *"the occurrence owns its
whole inline range, so the removal must span `occurrence.length`, not one character"* —
is precisely the contract misread: `occurrence.length` (28) is its extent **in the
clipboard-text projection**; in detect coordinates (the coordinates `consumeToken`
splices) the same occurrence is exactly **one `U+FFFC` character**. In detect
coordinates the plugin should span exactly one character — the opposite of the comment's
conclusion.

Two consequences combine into symptom #3:

1. **The composer chip stays** because the splice was rejected and the edit never applied.
2. **The dock chip degrades to `unavailable`** because the plugin ignores the boolean
   return of `consumeToken` and unconditionally runs `records.delete(occurrence.ref)` +
   `changed()`. The dock renderer (excerpt) resolves `records.get(occurrence.ref)`;
   the record is gone, `status` is neither `uploading` nor `uploaded`, so the fallback
   branch `record === undefined ? 'unavailable' : humanBytes(record.total)` renders
   `unavailable` — while the chip element itself is still rendered because the occurrence
   still exists in the composer. Plugin-side bookkeeping and composer state diverge.

So the removal path has the **same coordinate-system bug** plus a second, smaller defect:
**not treating the verbs' `false` return as failure** before mutating local state.

---

## 3. Fix direction — the conversion rule and the call sites

### The rule, derived from the host source

From `EditorProjection` in `host-input-contract.ts`: the detect text is the same document
as the clipboard/draft text **except that each occurrence (chip) occupies exactly one
`U+FFFC` character in detect coordinates and `occurrence.length` characters in
clipboard coordinates**; plain text outside occurrences maps 1:1. Therefore, to convert a
clipboard-coordinate position `p` to a detect-coordinate position:

```
detectPos(p) = p − Σ over occurrences o with o.offset + o.length ≤ p of (o.length − 1)
               (a position inside an occurrence maps to that occurrence's single
                U+FFFC position: detectPos = o.offset − Σ_{earlier}(o.length − 1))
```

and a **whole-occurrence span** `[o.offset, o.offset + o.length)` converts to a
**one-character detect span** `[detectPos(o.offset), detectPos(o.offset) + 1)`.
Equivalently, the detect length of the whole draft is
`draft.length − Σ(o.length − 1)` over all occurrences — a cheap sanity check.

### Call site A — insert path (`add()`)

Compute the insert position in detect coordinates. For end-of-draft insertion this is
simply the detect length of the current snapshot:

```js
const detectLen = snapshot.draft.length
  - snapshot.occurrences.reduce((n, o) => n + (o.length - 1), 0);
// span: { start: detectLen, end: detectLen, draftRev: snapshot.draftRev }
```

Keep the existing `draftRev` discipline (snapshot → optional `setDraft` → re-snapshot →
insert with the fresh `draftRev`); that part is already correct. Inside the multi-item
loop the re-snapshot after each accepted insert is also already correct — only the
position arithmetic changes. (The trailing-space concern is additionally handled host-side:
`insertReference` itself inspects `projection.detectText` after the span and appends a
separating space unless one is next, so the plugin's draft-side space normalization can
stay as a convenience but is not the failure.)

### Call site B — removal path (`remove()`)

```js
const earlier = snapshot.occurrences
  .filter(o => o.offset + o.length <= occurrence.offset)
  .reduce((n, o) => n + (o.length - 1), 0);
const start = occurrence.offset - earlier;   // detect position of the chip's U+FFFC
const ok = input.consumeToken({
  kind: 'span',
  span: { start, end: start + 1, draftRev: snapshot.draftRev }, // exactly one detect char
});
if (!ok) return;             // do NOT delete the record on rejection
records.delete(occurrence.ref);
changed();
```

Two mandatory changes here: (a) the one-character detect span as above; (b) **check the
boolean return** of `consumeToken` and keep the record (and re-render nothing or show a
retry affordance) when it is `false`, so dock bookkeeping can never diverge from composer
state. The legacy `setDraft` fallback branch already splices `snapshot.draft` with
clipboard coordinates — that branch is correct as written and needs no conversion.

(Sort order helps: `occurrences` is documented as sorted by offset, so "earlier"
occurrences are exactly those ending at or before the target offset.)

---

## 4. Regression test plan

All sequences run against a real host input machine (the verbs + projection), fresh
session, empty composer, asserting on `input.state.getSnapshot()` and the plugin's dock
records.

**A. Repeat-paste (kills the insert bug — paste #2 must succeed):**
1. Paste file 1 → assert `insertReference` returned `true`, snapshot has 1 occurrence,
   composer shows one chip, dock chip shows the human-readable size (not `unavailable`).
2. Paste file 2 → assert `true` again, 2 occurrences, chip #2 present in the composer
   **after** chip #1, dock has 2 chips, no toast raised.
3. Paste file 3 → assert `true`, 3 occurrences. (First-works/later-fails signature must
   be asserted explicitly: the test fails if any paste after the first throws.)
4. Paste a **multi-item** clipboard (items array length ≥ 2) into an already non-empty
   composer → every loop iteration inserts; assert occurrence count grows by the item
   count.
5. Paste after typing plain text without a trailing space (draft `"hello"`) → plugin's
   space normalization + converted span still insert; assert the chip lands after the
   text and `draft` ends with the chip's `clipboardText`.

**B. Removal (kills the ×-click bug — whole-occurrence one-char span + return check):**
1. From state A.2 (two chips), click × on the **first** dock chip → assert
   `consumeToken` returned `true`, exactly the first occurrence is gone from the
   snapshot, the second occurrence's `offset` shifted consistently in the new snapshot,
   `draft` no longer contains the removed `clipboardText`, the dock chip is gone (not
   rendered with `unavailable`), and `records` no longer has the ref.
2. Click × on the remaining chip → composer empty (`draft === ''`, 0 occurrences), dock
   empty.
3. Click × on the **last** of three chips (non-zero earlier-occurrence context) → only
   that occurrence is removed (guards the `Σ(length−1)` accumulation).

**C. Rejection paths (bookkeeping must not diverge):**
1. Force a revision mismatch: snapshot, then mutate the draft (e.g. `setDraft`) behind
   the plugin's back, then call `remove` with the stale span → assert `consumeToken`
   returned `false`, the record is **still present**, the dock chip still shows its size
   label (never `unavailable`), and the composer is unchanged.
2. Same for `add`: stale `draftRev` → `insertReference` returns `false` and the plugin
   rolls the record back (existing behavior) and surfaces a retryable error, not a
   success-looking dock chip.

**D. Coordinate invariant (property test):** after every mutation above, assert
`detectLen(snapshot) === snapshot.draft.length − Σ(occ.length − 1)` and that
occurrences are sorted by offset — this catches any future re-introduction of mixed
coordinates at any call site, not just the two known ones.

Sequences A.2 and B.1 are the minimal pair that reproduces the two user reports; C and D
exist so neither bug can return in a disguised form (e.g. someone "fixing" removal by
trimming the draft directly and reintroducing divergence on rejection).

---

## 5. Routine maintainer discipline before calling input-machine verbs (guidance, unscored)

- **Read the verb's parameter type in the host source, not just its name.** For every
  span/token argument, identify *which projection* the coordinates belong to. In this
  host: `TokenSpan` / detect-span arguments to `insertReference` / `consumeToken` are
  **detectText coordinates** (chip = one `U+FFFC`), while everything read from
  `InputState` (`draft`, `occurrences[].offset/length`) is **clipboard-text
  coordinates**. The JSDoc on `Occurrence` ("Offset in the clipboard-text projection")
  and on `EditorProjection.detectText` ("chip = one U+FFFC") state this explicitly — the
  plugin's own comment shows the author read `Occurrence` but not the projection docs.
- **Treat every boolean return as a contract.** Both verbs return whether the edit
  applied; a `false` must gate local state mutation. Never delete/rename local records
  around a verb whose return was not inspected.
- **Note which guards are cheap CAS vs. structural splice.** `draftRev` CAS failures mean
  "retry with a fresh snapshot"; splice failures mean "your span was wrong". The plugin's
  toast conflated the two. Logging the actual return + snapshot at the failure point
  would have distinguished them immediately.
- **Re-read these files on every DSH upgrade** (this is the plugin-upgrade pre-flight for
  the input touchpoint): the published contract types (`input.ts` — projection field
  semantics) and the facade (`facade.ts` — verb guards and which splice helper each verb
  uses). A coordinate-system change there is silent at typecheck time because both sides
  are plain numbers.
- Write at least one test per verb that exercises the **second** interaction in a
  sequence, since coordinate bugs in dual-projection APIs are invisible on the first
  interaction with empty state.

---

## Skipped / not applicable

- Corridor cards: DSH `0.1.2-alpha.3`'s card set (`references/v0.1.2-alpha.3.md`) contains
  no composer/input-machine change (settings-card capability + SQLite provider removal
  only), so no version-card migration applies; the defect is entirely in the plugin's use
  of the (unchanged) input contract.
- Baseline build/test run: not collected — this is a static evidence-pack diagnosis
  (Mode A); no plugin repository, build, or runtime was available or required.
- No writes outside the designated report directory; fixture untouched.

## Pending / residual risk

- The exact behavior of `$replaceDetectSpanWithNodes` on an out-of-range span is inferred
  from its return value (`applied = false`, chip never appears) in the captured log, not
  from its source (not included in the fixture). The diagnosis does not depend on whether
  it clamps or rejects — either way the edit does not apply at a detect-invisible
  position — but a maintainer should confirm in `facade.ts`'s splice helpers.
- The `draftRev` CAS is correctly handled by the plugin today; if the host ever moves to
  a per-projection revision, the re-snapshot discipline must be re-checked.
