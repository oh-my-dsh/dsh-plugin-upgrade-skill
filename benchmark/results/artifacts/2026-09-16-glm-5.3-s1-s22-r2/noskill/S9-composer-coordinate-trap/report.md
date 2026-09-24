# S9 · Composer Coordinate Trap — Diagnosis Report

**Plugin:** `@org/dsh-attach-input` v0.2.3 · **Host:** DSH `0.1.2-alpha.3`
**Evidence:** `plugin-client.js`, `console-session.txt`, `host-input-facade.ts`, `host-input-contract.ts` (fixture, read-only)

## Executive summary

Both reported symptoms are **one bug, not two**: the plugin computes editor-edit coordinates
in the wrong projection. The published `InputState` (`draft`, `Occurrence.offset`,
`Occurrence.length`) is expressed in the **clipboard-text projection**, where each chip
expands to its full `clipboardText` (e.g. `[attachment: screenshot.png]` = 28 chars). The
`TokenSpan` that the host verbs `insertReference(ref, span)` and `consumeToken({kind:'span',
span})` take is expressed in the **detect-text projection**, where each chip is a **single
U+FFFC character**. This is stated explicitly in `host-input-contract.ts`:

- `Occurrence.offset` / `Occurrence.length`: "Offset/Length in the **clipboard-text
  projection**; the occurrence occupies exactly [offset, offset+length)".
- `InputState.draft`: "**Clipboard-text projection** of the editor document (chips expanded
  to their clipboard form)".
- `EditorProjection.detectText`: "**Trigger/TokenSpan coordinate text** (chip = one
  U+FFFC)" — i.e. `TokenSpan`, the type of the `span` argument to both verbs, is a
  detect-text range.

The plugin feeds clipboard-text coordinates into detect-text span guards. The two projections
coincide only while the composer holds **no chips** (plain text maps 1:1), which is exactly
why paste #1 succeeds and every later interaction fails.

---

## 1. Why paste #1 succeeds and every later paste fails

### What the plugin computes

In `add()`:

```js
snapshot = input.state.getSnapshot();
...
const accepted = input.insertReference({...}, {
  start: snapshot.draft.length,   // clipboard-text length
  end: snapshot.draft.length,     // clipboard-text length
  draftRev: snapshot.draftRev,
});
```

`snapshot.draft` is the clipboard-text projection, so `snapshot.draft.length` counts every
chip as its full `clipboardText` (28 chars for `[attachment: screenshot.png]`).

### What the host guard compares against

In `host-input-facade.ts`, `insertReference`:

```ts
if (span.draftRev !== this.rev) return false
const tail = this.projection.detectText.slice(span.end, span.end + 1)
...
applied = $replaceDetectSpanWithNodes(span, nodes)  // splices DETECT text
```

The `span` is used directly against `this.projection.detectText` — the detect projection,
where a chip is **one U+FFFC**. So `span.start/end` must be detect-text offsets.

### The exact mismatch and the "first works, later fails" signature

- **Paste #1 (empty composer):** clipboard draft "" (length 0) and detectText "" (length 0)
  are identical — zero chips means zero divergence. `span = {start:0, end:0}` is valid in
  both projections, so the insert applies. The editor then appends the chip plus a separating
  space.
- **After paste #1:** clipboard draft "[attachment: screenshot.png] " = **29 chars** (log:
  length 29), but detectText = chip + space = **2 chars**. The single chip widened the gap
  between the two projections by length − 1 = 27.
- **Paste #2:** the plugin passes span {start:29, end:29} — a clipboard coordinate. In the
  2-character detect text, offset 29 is far past the end, so
  `$replaceDetectSpanWithNodes` on [29,29) cannot apply and returns false;
  `insertReference` returns false; the plugin throws the toast "The DSH composer changed
  before the attachment could be inserted". No chip is inserted anywhere (the plugin also
  correctly rolls back its record).

**Why "first works, later fails" is the signature of this mismatch:** the two coordinate
systems diverge by the sum of (clipboardText.length − 1) over the chips present. That sum is
**0 exactly when there are no chips** — so the very first interaction on a fresh/emptied
composer succeeds and every subsequent one (each computed from a now-chip-bearing
`InputState`) fails, and the failure deepens as more chips exist. A stale-`draftRev` CAS
failure would instead fail non-deterministically with timing, not deterministically on the
second paste. (`draftRev` itself is fine: `InputState.draftRev` is documented as "Monotonic
editor revision (span CAS compares against this)" — the same `this.rev` the guard uses — and
the plugin re-snapshots after every mutation.)

---

## 2. Why the × click turns the chip into `unavailable` instead of removing it

### The removal path

In `remove()`:

```js
const end = occurrence.offset + (occurrence.length ?? 1);   // clipboard coords: 0 + 28 = 28
input.consumeToken({ kind: 'span',
  span: { start: occurrence.offset, end, draftRev: snapshot.draftRev } });
...
records.delete(occurrence.ref);   // runs UNCONDITIONALLY
changed();
```

`occurrence.offset`/`length` come from `InputState.occurrences`, documented as
**clipboard-text projection** coordinates. `consumeToken`'s span guard in
`host-input-facade.ts` splices the **detect text**: the guard
(`span.draftRev === this.rev` and `span.start !== span.end`) passes — rev is current and
0 ≠ 28 — but `$replaceDetectSpanWithText([0,28), '')` targets a 2-character detect string
and cannot apply, so it returns false and **nothing is removed from the composer**. (Even if
the host clamped the range, deleting [0,28) of a 2-char string would wipe the trailing space
too; the correct detect range for one chip is exactly [offset', offset'+1) — see §3.)

### The plugin-side bookkeeping around it

`consumeToken(...)` returns a boolean ("whether the token was consumed") that the plugin
**never inspects** (the log confirms: "consumeToken(...) returned (not inspected by the
plugin code)"). Regardless of the outcome it executes:

1. `records.delete(occurrence.ref)` — the plugin's bookkeeping record is destroyed, and
2. `changed()` — the dock re-renders **from the host's occurrences view**, which still
   contains the occurrence because the host-side removal failed.

The dock chip renderer (excerpt) looks the occurrence up in `records`:

```js
const record = records.get(occurrence.ref);
... : record === undefined ? 'unavailable' : humanBytes(record.total)
```

The occurrence still exists (host state unchanged) but its record is gone, so
`record === undefined` and the size label flips to **`unavailable`** while the chip itself
persists — exactly user report #3. The visible `unavailable` state is therefore the compound
of (a) the same projection mismatch making the host splice fail, and (b) the plugin committing
its local rollback (record deletion + re-render) without checking the verb's success boolean.

---

## 3. Fix direction — the conversion rule, derived from the host source

### The rule

From `host-input-contract.ts`: per occurrence, the clipboard projection contributes
`occ.length` characters (`clipboardText`) while the detect projection contributes exactly
**1** character (U+FFFC). Therefore, for a clipboard-text coordinate `c`:

```
detect(c) = c − Σ { occ.length − 1 : occ.offset + occ.length ≤ c }   // occurrences fully before c
```

i.e. subtract (length − 1) for every occurrence that ends at or before the coordinate.
Equivalently, for the end-of-draft insertion point:
`detectText.length = draft.length − Σ (length_i − 1)` over all occurrences. The reverse
mapping (detect → clipboard) adds (length − 1) back per preceding occurrence. Within plain
text runs the two projections are identical; only chip boundaries shift coordinates.

`draftRev` needs **no** conversion — it is a revision counter, not a coordinate, and
`InputState.draftRev` is the same value the span CAS compares against.

### Call site 1 — the insert path (`add()`)

Convert `snapshot.draft.length` to detect coordinates before building the span. The insert
point is the end of the draft and every occurrence precedes it:

```js
const detectEnd = snapshot.draft.length -
  snapshot.occurrences.reduce((n, o) => n + (o.length - 1), 0);
// equivalently: detectEnd === detectText.length of the projection
const accepted = input.insertReference({ /* ... */ }, {
  start: detectEnd,
  end: detectEnd,
  draftRev: snapshot.draftRev,
});
```

(If the plugin ever inserts at a non-terminal position, apply the general `detect(c)` map
with the "occurrences fully before c" predicate.) The host's tail check
`detectText.slice(span.end, span.end+1) === ' '` operates in detect coordinates, and
`insertReference` itself appends the separating space; the pre-insert `setDraft(...+' ')`
fallback remains correct because `setDraft` takes clipboard-projection text.

### Call site 2 — the removal path (`remove()`)

An occurrence occupies **exactly one U+FFFC** in detect text, so its detect span is
[detect(occ.offset), detect(occ.offset) + 1) — never [offset, offset+length):

```js
const shift = snapshot.occurrences
  .filter(o => o.offset + o.length <= occurrence.offset)
  .reduce((n, o) => n + (o.length - 1), 0);
const start = occurrence.offset - shift;
const consumed = input.consumeToken({
  kind: 'span',
  span: { start, end: start + 1, draftRev: snapshot.draftRev },
});
if (!consumed) return;            // do NOT touch bookkeeping on failure
records.delete(occurrence.ref);
changed();
```

Two further hardening points on this path:

- **Check the boolean.** `consumeToken` and `insertReference` are fallible CAS verbs;
  bookkeeping (`records.delete`, `changed()`) must be committed only on true, else the dock
  re-renders with a live occurrence and a missing record — the `unavailable` ghost.
  (`add()` already rolls back correctly on failure; `remove()` must match.)
- The `setDraft` fallback branch in `remove()` slices `snapshot.draft`, which is
  clipboard-coordinate work and `setDraft` accepts clipboard-projection text — that branch
  is already correct; only the `consumeToken` span needed conversion.

---

## 4. Regression test plan

All sequences run against a fresh session with an empty composer; each step asserts both the
verb return value and the observable state (dock chips, composer `occurrences`, `records`).

**A. Repeat-insert (kills bug 1)**

1. Paste file #1 → assert `insertReference === true`; one composer occurrence and a dock
   chip whose meta is the human size (not `unavailable`).
2. Paste file #2 **without any other edit** → assert true; exactly two occurrences (offsets
   consistent with clipboard coordinates) and a second dock chip. *This is the exact reported
   failure: the second chip must appear and no toast may fire.*
3. Paste file #3 → assert true and three occurrences (divergence grows per chip; catches
   off-by-a-constant "fixes" that handle only one chip).
4. Paste after typing trailing plain text without a trailing space → exercises the
   `setDraft`-then-insert path; assert the span still uses detect coordinates after the
   `draftRev` bump.

**B. Removal (kills bug 2)**

1. With ≥ 1 chip: click × on the dock chip → assert `consumeToken === true`, the occurrence
   is gone from `input.state.getSnapshot().occurrences`, the dock chip is gone (not merely
   relabeled), and the composer chip is gone.
2. Remove the **first of two** chips → assert the surviving chip's offset/length in the
   refreshed `InputState` and that its dock label still shows the size (record retained).
3. Remove the **last** chip → assert the composer returns to the empty projection where the
   two coordinate systems coincide (guards against regressions that break re-sync).
4. Failure path: force a stale `draftRev` (e.g. concurrent `setDraft`) and click × →
   assert `consumeToken === false`, `records` still contains the ref, and the dock label
   is the size — never `unavailable` while the occurrence exists.

**C. Cross-path interaction**

1. Paste → remove → paste again → assert the second insert succeeds (the empty-document
   coincidence must not mask a removal that failed to restore state).
2. Paste two files, remove chip #1, paste a third → assert the insert lands after the
   surviving chip (detect offset computed over the *current* occurrences).

**Property oracle** (worth automating): for every reachable state,
`detectText.length === draft.length − Σ(occ.length − 1)`, and every span passed to a host
verb satisfies `0 ≤ span.start ≤ span.end ≤ detectText.length` with `span.draftRev` equal
to the snapshot's `draftRev`.

---

## 5. Routine host-source checks before calling input-machine verbs (unscored guidance)

1. **Read the guard, not just the signature.** For each verb, find every `return false`
   branch in the facade (`insertReference`, `consumeToken`) and identify which projection
   each compared value lives in (`this.rev` vs `projection.detectText` vs
   `projection.clipboardText`).
2. **Match every coordinate argument to its declared projection.** The contract file states
   per field which text it counts (detectText: chip = one U+FFFC; clipboardText /
   `InputState.draft` / `Occurrence.offset|length`: chip = its clipboardText). Any value
   crossing between them needs an explicit conversion; never assume "offset" is one system.
3. **Check whether the verb is a CAS.** `draftRev` comparisons mean the verb can fail
   legitimately; callers must branch on the boolean and only then commit local state.
4. **Re-derive invariants from the projection definitions** (e.g. the length identity above)
   and assert them in dev builds — a projection mismatch is silent until a second chip exists.
5. **Test the second interaction, not the first.** Any edit computed from published state
   must be exercised after at least one chip exists, since empty-document state makes
   divergent projections coincide and hides the bug.
