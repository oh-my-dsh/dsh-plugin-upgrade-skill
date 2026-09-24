# S9 · Composer Coordinate Trap — Diagnosis Report

**Task**: S9-composer-coordinate-trap (read-only analysis)
**Plugin**: `@org/dsh-attach-input` v0.2.3 (community Web plugin)
**Host**: DSH `0.1.2-alpha.3`
**Evidence**: fixture pack — `plugin-client.js`, `console-session.txt`, `host-input-facade.ts`, `host-input-contract.ts` (all paths relative to the task fixture directory; read-only, unchanged)

## Executive summary

Both user-visible bugs are **one underlying contract misread, not two unrelated defects**. The host input machine has **two coordinate systems** for the composer document:

1. **Clipboard-text projection** (`InputState.draft`, `Occurrence.offset`, `Occurrence.length`): each chip is expanded to its full `clipboardText` (e.g. `[attachment: screenshot.png]` = 28 chars).
2. **Detect-text projection** (`EditorProjection.detectText`): each chip is collapsed to **exactly one U+FFFC object-replacement character**; plain text is 1:1 with the clipboard projection.

The `TokenSpan` accepted by the host verbs `insertReference(ref, span)` and `consumeToken({kind:'span', span})` is in **detect coordinates** — the facade source says so explicitly ("`span` - pick-time span snapshot (detect coordinates)") and proves it operationally: `insertReference` reads its tail-space probe from `this.projection.detectText.slice(span.end, span.end + 1)`, and `consumeToken` splices via `$replaceDetectSpanWithText(guard.span, '')` into the same detect text.

The plugin computes every span from `snapshot.draft.length` and `occurrence.offset/length` — **clipboard coordinates** — and passes them to verbs that compare and splice in **detect coordinates**. Every failure below falls out of that single mismatch.

---

## 1. Why paste #1 succeeds and every later paste fails

### What the plugin computes

`add()` inserts at end-of-draft:

```js
start: snapshot.draft.length,
end: snapshot.draft.length,
draftRev: snapshot.draftRev,
```

`snapshot.draft` is `InputState.draft` — the **clipboard projection** (contract JSDoc: "Clipboard-text projection of the editor document (chips expanded to their clipboard form)").

### What the host guard compares against

`insertReference` passes `span` straight into `$replaceDetectSpanWithNodes(span, nodes)`, and probes the trailing character in `projection.detectText` at `span.end`. The revision CAS (`span.draftRev !== this.rev`) passes — the plugin re-snapshots correctly and nothing else edited the draft — and the phase guard passes (`plain`). The splice itself is what fails: the span endpoints are interpreted against `detectText`, where the document is much shorter than the clipboard draft whenever chips exist.

### The arithmetic (from the capture)

- Paste #1 (empty composer): clipboard draft `""` (length 0) and detectText `""` (length 0). The wrong-coordinate value **coincidentally equals the correct one** — span `{0,0}` is valid in both systems. Chip + separating space applied → success.
- After paste #1: `draft = "[attachment: screenshot.png] "` (length **29**, occurrence `length: 28`), but `detectText = "\uFFFC "` (chip + space, length **2**).
- Paste #2: the plugin sends `{start: 29, end: 29}`. In detect coordinates that points **27 characters past the end** of a 2-character document (`29 − 2 = 28 − 1 = occurrence.clipboardText.length − 1`). The out-of-range splice cannot apply, `applied` stays `false`, `insertReference` returns `false`, and the plugin throws the toast "The DSH composer changed before the attachment could be inserted" and rolls back its record — hence no second chip anywhere.

### Why "first works, later fails" is the signature of this mismatch

The two projections have **equal length exactly when the document contains no chips** (or only chips whose `clipboardText` is one character). A clipboard-derived endpoint is therefore correct only on an empty/chip-less composer. **Each successful insert makes every subsequent clipboard-derived endpoint overshoot by `Σ(occurrence.length − 1)` over all preceding chips** — the bug is deterministic, cumulative, and self-armoring: the first insert is precisely the operation that breaks all later ones. That monotone, "works once then never again" pattern (with no concurrency, no timing dependence, no user-visible conflict) is the fingerprint of a **unit/coordinate mismatch**, not a race or a stale-revision problem — the revision CAS succeeds every time; it is the *space*, not the *time*, coordinate that is wrong.

---

## 2. Why the × click produces `unavailable` instead of removing the chip

### The removal path, traced

`remove(sessionId, occurrence)` builds the span from the occurrence:

```js
const end = occurrence.offset + (occurrence.length ?? 1);
input.consumeToken({ kind: 'span', span: { start: occurrence.offset, end, draftRev: snapshot.draftRev } });
```

Per the published contract, `Occurrence.offset` and `Occurrence.length` are **clipboard-projection coordinates** ("Offset in the clipboard-text projection"; "Length in the clipboard-text projection"). So the plugin sends `{start: 0, end: 28}` for the captured occurrence `{offset: 0, length: 28}`.

Inside `consumeToken` the span guard passes its two explicit checks — `draftRev` matches `this.rev`, and `start !== end` — but then `$replaceDetectSpanWithText(guard.span, '')` tries to splice `[0, 28)` out of a `detectText` that is only **2 characters** long. The splice fails, `applied` stays `false`, and `consumeToken` **returns `false`**.

### The plugin-side bookkeeping failure

`remove()` **never inspects the return value** (the capture confirms: "consumeToken(...) returned (not inspected by the plugin code)"). It unconditionally proceeds to:

```js
records.delete(occurrence.ref);
changed();
```

So the plugin destroys its own bookkeeping for a chip the host never removed. Consequences, matching the capture exactly:

- **Composer chip stays**: the host edit was rejected, so the chip node is still in the editor document and still in `InputState.occurrences`.
- **Dock chip turns `unavailable`**: the dock renderer does `records.get(occurrence.ref)`; the record was deleted, so `record === undefined` and the rendering excerpt's fallback branch `record === undefined ? 'unavailable'` fires. The chip cannot go away because the dock still enumerates the host's (unchanged) occurrence list — only its metadata source is gone.

So symptom 3 is the **same coordinate mismatch** (clipboard endpoints spliced into detect space → verb returns `false`) **plus a missing boolean check** (the plugin treats a rejected edit as success and desynchronizes its mirror of host state). The `unavailable` label is the visible artifact of that desynchronization, not a host-side status.

---

## 3. Fix direction: the conversion rule and both call sites

### The rule, derived from the host source

From `EditorProjection`'s contract: plain text characters are 1:1 between `detectText` and `clipboardText`; **each occurrence occupies exactly one U+FFFC in `detectText` and exactly `occurrence.length` characters in `clipboardText`**. Therefore, to map a clipboard-projection coordinate `X` to a detect-projection coordinate:

```
detect(X) = X − Σ (occ.length − 1)  for every occurrence occ with occ.offset + occ.length ≤ X
```

(i.e. every occurrence entirely before the coordinate shrinks it by `length − 1`; occurrences merely straddling/after `X` do not). And a clipboard interval `[a, b)` that exactly covers one occurrence maps to a detect interval of **length 1**: `[detect(a), detect(a) + 1)` — a chip is one character.

Equivalently, for end-of-document insertion: `detectEnd = detectText.length = snapshot.draft.length − Σ(occ.length − 1)` over all occurrences — computable purely from the published `InputState` without touching the unpublished projection. Sanity check against the capture: `29 − (28 − 1) = 2` ✓; the occurrence `[0, 28)` maps to `[0, 1)` ✓.

`draftRev` needs no conversion — the revision CAS compares `span.draftRev` to the same `this.rev` in both systems; keep taking it from the same snapshot as the offsets.

### Call site 1 — `add()` (insert path)

Replace the clipboard endpoint with the converted detect endpoint:

```js
const toDetect = (snapshot, x) =>
  x - snapshot.occurrences
    .filter(o => o.offset + o.length <= x)
    .reduce((acc, o) => acc + o.length - 1, 0);

const end = toDetect(snapshot, snapshot.draft.length);
const accepted = input.insertReference({ ... }, {
  start: end,
  end,
  draftRev: snapshot.draftRev,
});
```

(If the facade ever exposes `projection.detectText` to plugins, prefer `detectText.length` directly; the occurrence-based formula is the published-state equivalent.) Note the plugin's existing space-normalization via `setDraft` already refreshes `snapshot` before this computation — keep that ordering, since `setDraft` bumps `this.rev`.

### Call site 2 — `remove()` (removal path)

Convert the occurrence interval and — equally important — **check the boolean**:

```js
const start = toDetect(snapshot, occurrence.offset);
const end = start + 1; // one chip = one U+FFFC in detectText
const consumed = input.consumeToken({
  kind: 'span',
  span: { start, end, draftRev: snapshot.draftRev },
});
if (!consumed) {
  // surface a conflict / retry with a fresh snapshot; do NOT touch records
  return false;
}
records.delete(occurrence.ref);
changed();
return true;
```

The `!consumed` branch is what prevents the `unavailable` zombie chip: plugin bookkeeping must move **only after** the host confirms the edit applied. (The current comment "the removal must span occurrence.length, not one character" is exactly backwards — in detect coordinates it must span **one** character; that comment is the misread, written down.) The `setDraft` string-slicing fallback branch has the same bug in worse form: slicing `snapshot.draft` (clipboard coords) by occurrence offsets happens to be *correct* for `setDraft` (which takes clipboard text) but would leave the chip node behind; prefer fixing the primary path and treating the fallback as out-of-contract for chips.

### Not a fix

Retrying, refreshing snapshots, or re-ordering the paste flow cannot help: the mismatch is in the *units* of the endpoint, not in staleness — the revision CAS already succeeds on every failing call.

---

## 4. Regression test plan

All sequences run against a real composer shell (the guard reads `this.rev` and `projection.detectText`; a mock that "accepts any span" would hide the bug class entirely — the mock must implement both projections and length-discriminate like the real splice).

**R1 · Repeat paste (kills bug 1).** Fresh empty session. Paste file A → assert exactly one dock chip and one occurrence; then paste file B **with no other interaction** → assert `insertReference` returned `true`, two occurrences exist, and `InputState.draft` length equals `Σ(text) + Σ(occurrence.length)`. The original bug deterministically fails here (second span endpoint 27 past the detect end).

**R2 · Paste after typed text.** Type "see this", paste A, paste B → assert both apply and offsets are correct with nonzero text before the first chip (covers the general mapping, not just offset 0).

**R3 · Removal happy path (kills bug 2).** Paste A, click × on the dock chip → assert `consumeToken` returned `true`, the occurrence is gone from `InputState.occurrences`, `detectText` shrank by exactly one U+FFFC, the dock chip is **removed** (assert the rendered dock does not contain the label and contains no `unavailable` text), and `records` no longer has the ref.

**R4 · Removal conflict path (kills the bookkeeping half of bug 2).** Paste A; between the plugin's `getSnapshot()` and its `consumeToken` call, inject a concurrent host edit that bumps `this.rev` (e.g. `setDraft` from another listener) → assert `consumeToken` returns `false`, the plugin **keeps** the record, the dock chip still renders its size label (not `unavailable`), and the failure is surfaced (toast/retry) rather than silently swallowed.

**R5 · Remove-then-repaste coordinate refresh.** Paste A, paste B, remove chip A, paste C → assert all three operations succeed (the occurrence list shrank; the conversion must be recomputed from the *current* snapshot, not cached).

**R6 · Middle-chip removal.** Paste A, B, C; remove B → assert only B's occurrence disappears and A/C offsets/lengths in the refreshed `InputState` remain consistent (clipboard interval of the remaining chips maps through the shrunken detect text).

**R7 · Paste immediately after removal.** Remove the only chip, then paste before any re-render → assert the insert succeeds on the now chip-less composer (detect and clipboard lengths coincide again; guards against caching a stale converted endpoint).

R1+R3 are the minimum pair that makes both reported bugs unable to return silently; R4–R7 pin the surrounding contract so refactors cannot reintroduce the class.

## 5. Routine host-source checks before calling input-machine verbs (unscored, guidance)

- **Read the verb's guard, not just its signature.** For each parameter, find where the facade body *uses* it: `insertReference` slices `projection.detectText` at `span.end` — that one line tells you `TokenSpan` is in detect coordinates even before the JSDoc does.
- **Name the coordinate system of every published field.** The contract JSDocs say "Offset in the clipboard-text projection" / "chips expanded to their clipboard form" / "chip = one U+FFFC". Before any arithmetic on `draft.length` or `occurrence.offset/length`, write down which projection those numbers live in and which projection the verb consumes; if they differ, convert at the boundary.
- **Check the return-value contract of boolean verbs.** `insertReference` / `consumeToken` return *whether the edit applied*; a `false` is a rejected CAS/splice, not an error to ignore. Every call site must branch on it before mutating local mirrors of host state.
- **Check the CAS currency.** `span.draftRev` compares against `this.rev`; any intermediate verb call (`setDraft`, another insert) invalidates a previously taken snapshot — re-snapshot after every mutation, as `add()` already does.
- **Watch for "coincidentally correct" values.** Anything that works on an empty document but fails after state accumulates is a coordinate/units suspect: add a two-item interaction test to the pre-release checklist (this fixture's whole failure mode would have been caught by R1).
- **Do not trust comments over source.** The plugin's own comment ("must span occurrence.length, not one character") encodes the misread; the host splice is the authority.

---

## Compliance notes

- Mode A (read-only inspection) per the plugin-upgrade skill; the fixture was read, never executed or modified.
- No migrations, installs, git operations, publishes, or external accesses were performed.
- Coordinate-conversion arithmetic cross-checked against the captured session numbers (`29 − (28−1) = 2`).
