# S9 — Composer Coordinate Trap: Diagnosis Report

Target: `@org/dsh-attach-input` v0.2.3 on DSH `0.1.2-alpha.3`
Evidence: `fixture/plugin-client.js`, `fixture/host-input-facade.ts`, `fixture/host-input-contract.ts`, `fixture/console-session.txt`

**One-sentence root cause:** both reported bugs are the same contract misread — the plugin computes spans in the **clipboardText projection** (chips expanded to their full clipboard form), while the host verbs `insertReference` and `consumeToken` splice spans against the **detect projection** (each chip = exactly one U+FFFC). Bug 2 is then amplified by ignoring `consumeToken`'s boolean return.

---

## 1. Why paste #1 succeeds and every later paste fails

### The two coordinate systems (from the host contract)

`host-input-contract.ts` publishes two projections of the same editor document:

- `EditorProjection.detectText` — "Trigger/TokenSpan coordinate text (**chip = one U+FFFC**)" (line 37).
- `InputState.draft` / `EditorProjection.clipboardText` — "chips expanded to their clipboard form" (lines 26, 39), and `Occurrence.offset`/`length` are explicitly "in the clipboard-text projection" (lines 14–17).

The verbs the plugin calls take spans in **detect coordinates** and splice the detect text:

- `insertReference(ref, span)`: "@param span - pick-time span snapshot (**detect coordinates**)" (`host-input-facade.ts:11`); it reads `this.projection.detectText.slice(span.end, …)` (line 18) and applies `$replaceDetectSpanWithNodes(span, nodes)` (line 24).
- `consumeToken({kind:'span', span})`: applies `$replaceDetectSpanWithText(guard.span, '')` (line 41) — again detect coordinates.

### The exact mismatch

In `add()` (`plugin-client.js:29-31`) the plugin computes:

```js
start: snapshot.draft.length,
end:   snapshot.draft.length,
draftRev: snapshot.draftRev,
```

`snapshot.draft` is the **clipboardText** projection. The host compares/splices that span against **`detectText`**. So the mismatch is: *clipboard-projection offset supplied where a detect-projection offset is required*.

Numbers from the session log: after paste #1, `draft = "[attachment: screenshot.png] "` (length **29**), but `detectText` is `"\uFFFC "` (length **2**). For paste #2 the plugin passes `{start: 29, end: 29}`; `detectText.slice(29, 30)` is `''` and `$replaceDetectSpanWithNodes` cannot splice at offset 29 in a 2-char text, so it returns `false`. `insertReference` returns `false` (line 26), the plugin throws its "composer changed" toast (`plugin-client.js:35`) — a message that misattributes the failure to the revision CAS. Note the CAS itself (`span.draftRev !== this.rev`, `host-input-facade.ts:17`) is *not* the failing check here: the plugin re-snapshots right before the call, so the rev matches. The failure is the out-of-range span in the wrong coordinate space, surfaced through the same `false` return.

### Why "first works, later fails" is the signature

With **zero chips** in the composer, the two projections are identical (plain text maps 1:1 in both), so a clipboard-derived offset equals the detect offset and the call succeeds by coincidence. The first chip makes the projections diverge: each occurrence contributes `clipboardText.length` (28) chars to `draft` but exactly **1** char to `detectText` — a divergence of 27 per chip. Every coordinate derived from `draft.length` (or `occurrence.offset`) therefore overshoots the detect text from that point on, and the overshoot grows with each chip. A coordinate bug that only manifests once state exists, and worsens with accumulated state, produces exactly the observed pattern: first paste OK, every repeat paste toasts.

## 2. Why × turns the chip into `unavailable` instead of removing it

Removal path (`plugin-client.js:43-59`):

1. `end = occurrence.offset + (occurrence.length ?? 1)` → `0 + 28 = 28`. Same misread: `occurrence.offset/length` are clipboard-projection values (contract lines 14–17), but `consumeToken` splices `detectText`. The chip's true detect span is `[0, 1)`, not `[0, 28)`.
2. `consumeToken({kind:'span', span:{start:0, end:28, draftRev}})` → the rev CAS passes (`host-input-facade.ts:38`), but `$replaceDetectSpanWithText` cannot honor a 28-char span over a 2-char detect text, so the edit does not remove the chip; the verb returns `false`. The session log confirms: "`consumeToken(...) returned (not inspected by the plugin code)`" and "composer chip still present".
3. **The plugin never checks that boolean.** It unconditionally runs `records.delete(occurrence.ref)` and `changed()` (`plugin-client.js:58-59`), so the plugin-side bookkeeping now claims the attachment is gone while the host-side occurrence still exists.
4. The dock renders one chip per host occurrence and looks up `records.get(occurrence.ref)`; per the rendering excerpt (`plugin-client.js:63-65`), `record === undefined ? 'unavailable' : humanBytes(record.total)`. The orphaned occurrence now has no record → meta label flips to `unavailable`.

So the × click doesn't "fail to remove" in one step — it fails the host edit (wrong coordinates) *and* commits the bookkeeping delete anyway, which is precisely what produces a lingering dock chip labeled `unavailable` plus a lingering composer chip.

## 3. Fix direction

### The conversion rule (derived from the host source)

From `host-input-contract.ts`: plain text is 1:1 across projections; each occurrence spans `[offset, offset+length)` in the clipboard projection (line 16) and exactly **one U+FFFC** in the detect projection (line 37). Therefore, for a clipboard-projection offset `c`, the detect offset is:

```
toDetect(c) = c − Σ (occ.length − 1)   over all occurrences with occ.offset + occ.length <= c
```

(occurrences are sorted by offset per the contract, line 31). The inverse rule for an occurrence: its detect span is `[toDetect(occ.offset), toDetect(occ.offset) + 1)` — a chip always consumes exactly one detect character, which also obsoletes the `?? 1` fallback at `plugin-client.js:49` (in detect space the length is *always* 1).

### Call sites to fix

- **Insert path** (`plugin-client.js:29-31`): replace `start: snapshot.draft.length, end: snapshot.draft.length` with `const d = toDetect(snapshot, snapshot.draft.length); start: d, end: d`. (End-of-draft in detect space = `draft.length − Σ(occ.length − 1)`; for the logged state, 29 − 27 = 2, matching `detectText` length.) Compute from the same snapshot whose `draftRev` is sent, so the CAS and the coordinates stay consistent.
- **Removal path** (`plugin-client.js:49-54`): send `span: { start: toDetect(snapshot, occurrence.offset), end: toDetect(snapshot, occurrence.offset) + 1, draftRev: snapshot.draftRev }`.
- **Removal bookkeeping** (`plugin-client.js:51-59`): branch on the return value. Only `records.delete(occurrence.ref)` + `changed()` when `consumeToken` (or the `setDraft` fallback) actually applied; on `false`, keep the record and surface an error, so the dock can never show an `unavailable` ghost chip for an occurrence that still exists. Same discipline already exists on the insert path (`records.delete(ref)` rollback at line 34) — apply it symmetrically.
- Also check the return of `setDraft`-based fallback removal, or drop the fallback in favor of the span verb.

## 4. Regression test plan

Repeat-interaction (insert):

1. **Cold paste:** fresh session, empty composer → paste A. Assert: no toast; one dock chip; one composer chip; `draft === "[attachment: A] "`; occurrence `{offset:0, length:clipboardText.length}`.
2. **Second paste (the reported bug):** paste B immediately → assert: no toast; `insertReference` returned true; two dock chips, two composer chips; draft contains both clipboard texts in order; occurrences sorted with correct non-overlapping ranges.
3. **Nth paste:** paste C → same assertions with three chips (divergence now 2×27, catches off-by-N errors, not just off-by-one).
4. **Mixed content:** type plain text before/after/between chips, then paste → assert insert lands at the true end in both projections (covers text+chip offset arithmetic).
5. **Trailing-space branch:** make draft non-space-terminated → paste (exercises the `setDraft(draft + ' ')` + re-snapshot path), then paste again → both succeed.
6. **Genuine stale-rev injection:** force a host-side edit between snapshot and call → assert toast *and* `records` rollback (no orphan record).

Removal:

7. **Remove after two pastes:** click × on chip 1 → assert `consumeToken` returned `true`; composer chip 1 gone, chip 2 intact at its shifted offset; dock chip 1 gone; record deleted; label of chip 2 unchanged.
8. **Remove last chip:** × on the remaining chip → composer empty (modulo the separator space), dock empty.
9. **Remove middle of three:** × on chip 2 → then paste D → assert the new insert uses the re-mapped end offset correctly (cross-path consistency of the conversion).
10. **Failed-removal bookkeeping:** stub `consumeToken` → `false` → click × → assert the record is *not* deleted, the dock chip keeps its real size label (never `unavailable`), composer chip untouched, and an error is surfaced.
11. **Unit test the converter** with the session-log fixture: draft length 29, one occurrence `{offset:0, length:28}` → `toDetect(29) === 2`; occurrence detect span `[0,1)`; empty composer → identity mapping.

## 5. Routine host-source discipline before calling input-machine verbs (guidance)

- **Read the guard body of every verb you call** and identify what each span/offset is compared or spliced *against* (`$replaceDetectSpanWith*` → detect text; draft-equality → clipboardText). The parameter's doc comment ("detect coordinates") is the contract — treat it as normative.
- **Classify every published field by projection before use.** In this contract: `InputState.draft`, `Occurrence.offset/length`, `EditorProjection.clipboardText` are clipboard space; `EditorProjection.detectText` and all `TokenSpan` values are detect space. Never mix fields from two projections in one call.
- **Treat boolean-returning verbs as checked results.** Guards (rev CAS, range validation, phase) fail *silently* via `return false`; never mutate local bookkeeping on an unchecked call.
- **Understand what the revision versions and when it bumps** (`draftRev` vs `this.rev`); snapshot, compute, and call atomically so the CAS and the coordinates derive from the same state.
- **On every host upgrade, re-diff the verbs' guards and the projection/type docs** (e.g., `facade.ts`, `contract/input.ts`, `editor/projection.ts`) — span semantics and projection products are exactly the kind of contract that changes silently between alphas like `0.1.2-alpha.3`.
