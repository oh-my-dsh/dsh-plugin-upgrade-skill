# S9 · Composer Coordinate Trap — diagnosis report

**Plugin:** `@org/dsh-attach-input` v0.2.3 on DSH `0.1.2-alpha.3`
**Evidence:** `fixture/plugin-client.js`, `fixture/console-session.txt`, `fixture/host-input-facade.ts`, `fixture/host-input-contract.ts` (read-only; nothing in `fixture/` was modified)
**Verdict:** both reported symptoms are one defect — the plugin builds `TokenSpan` values in the **clipboard-text** coordinate space while the host verbs apply and validate every span in the **detect-text** coordinate space, where a chip is exactly one U+FFFC character. The alpha.2→alpha.3 corridor card (skill reference `v0.1.2-alpha.3.md`) confirms this edge changed no composer/input surface, so this is a contract misread in the plugin, not a host regression.

---

## The two coordinate spaces (derived from the host source, not guesswork)

The published contract (`host-input-contract.ts`) declares two projections of the same composer document:

| Projection | Chip renders as | Used by |
|---|---|---|
| `EditorProjection.detectText` — "Trigger/TokenSpan coordinate text (**chip = one U+FFFC**)" | 1 char | `TokenSpan` coordinates consumed by the facade verbs |
| `EditorProjection.clipboardText` / `InputState.draft` — "chips **expanded to their clipboard form**" (`[attachment: …]`) | full clipboard text | `snapshot.draft`, `Occurrence.offset`, `Occurrence.length` ("in the clipboard-text projection") |

The facade (`host-input-facade.ts`) proves which space each verb consumes:

- `insertReference` reads `this.projection.detectText.slice(span.end, span.end + 1)` (line 18) and splices via `$replaceDetectSpanWithNodes(span, nodes)` (line 24) → **`span` is detect-space**.
- `consumeToken` with `kind: 'span'` splices via `$replaceDetectSpanWithText(guard.span, '')` (line 41) → **same, detect-space**.
- Guards, in order: `phase !== 'plain' && phase !== 'claimed'` → false; `span.draftRev !== this.rev` → false; then `applied = $replaceDetectSpanWith*`(…), i.e. the splice's own success flag, which is `false` when the span does not name a real range of the detect document.

The plugin (`plugin-client.js`) computes every span from `snapshot.draft.length` and `occurrence.offset / occurrence.length` — all clipboard-space per the contract. That is the whole bug.

Concrete divergence after paste #1 (values from `console-session.txt`): clipboard draft = `"[attachment: screenshot.png] "` (29 chars), detect text = `"\uFFFC "` (2 chars). Same document; offsets differ by `occurrence.length − 1 = 27`.

---

## 1. Why the FIRST paste succeeds and every later paste fails

**The exact mismatch.** `add()` inserts with

```js
input.insertReference({ … }, {
  start: snapshot.draft.length,     // clipboardText space (chip = 28 chars)
  end:   snapshot.draft.length,
  draftRev: snapshot.draftRev,
});
```

but the host applies that span against `detectText` (chip = 1 U+FFFC).

- **Paste #1 (empty composer):** `draft = ""` → the plugin sends `start = end = 0`. In a chip-free document the two projections are character-for-character identical (both are the plain text, length 0), so 0 is a valid coordinate in *both* spaces. The splice succeeds; the host creates the chip node and appends the separating space itself (the `tail === ' '` branch). Post-state: clipboard 29 chars, detect 2 chars.
- **Paste #2:** the plugin re-snapshots, so `draftRev` is fresh and the revision CAS (`span.draftRev !== this.rev`) **passes**. It then sends `start = end = snapshot.draft.length = 29` — but the detect document is only 2 characters long. Span [29, 29) names no range of `$replaceDetectSpanWithNodes`' document, so the splice reports failure, `applied` stays `false`, and `insertReference` returns `false`. The plugin throws "The DSH composer changed before the attachment could be inserted".

So the failing comparison is **span-vs-`detectText` bounds**, not the revision CAS — the toast's wording ("the composer changed") is the plugin misattributing a coordinate-space rejection to a concurrent-edit guard. The same failure hits item 2+ of a multi-file single paste inside the `for` loop, because the loop recomputes `snapshot.draft.length` after each insert.

**Why "first works, later fails" is the signature of exactly this mismatch.** The clipboard and detect projections coincide if and only if the document contains zero chips (no occurrence has been collapsed yet). Therefore any span derived from `draft.length` is accidentally correct for the first insert — and the first successful insert is precisely what makes the projections diverge by Σ(occurrence.length − 1). From then on every plugin-computed offset points past the end of the detect text and every paste fails deterministically. It is not a race or flaky state: one success per clean composer, then guaranteed failure — the exact "works once, never again" pattern in the capture. (It also self-heals if the user deletes all chips, which is why it can look intermittent across a session.)

## 2. Why the × click turns the chip into `unavailable` instead of removing it

Removal path in `remove()`:

```js
const end = occurrence.offset + (occurrence.length ?? 1);          // 0 + 28, clipboard space
input.consumeToken({ kind: 'span', span: { start: occurrence.offset, end, draftRev } });
records.delete(occurrence.ref);                                     // unconditional
changed();
```

- `Occurrence.offset/length` are **clipboard-space** (contract says so explicitly; capture: `offset 0, length 28`). `consumeToken`'s span guard splices the **detect** text, where the single chip occupies [0, 1) of `"\uFFFC "`. The plugin passes [0, 28) — a span running 26 characters past the end of a 2-character document. `$replaceDetectSpanWithText` cannot apply it → `consumeToken` returns `false`, and **nothing is removed from the composer**. (The `start === end` and revision sub-guards pass; the bounds kill it, same as bug 1.)
- The plugin **never inspects the return value** (the capture even notes "not inspected by the plugin code"). It unconditionally runs `records.delete(occurrence.ref)` and re-renders the dock.
- On re-render, `records.get(occurrence.ref)` is now `undefined`, and the renderer excerpt maps exactly that state to the new label: `… : record === undefined ? 'unavailable' : humanBytes(record.total)`.

So: host said "no" (composer chip stays), plugin bookkeeping said "yes" (record deleted), and the dock's missing-record branch — designed for foreign/unknown occurrences — is what prints `unavailable`. The chip "not going away" and the `unavailable` label are one skipped return-value check plus one wrong coordinate space; the same root cause as bug 1, expressed on the removal path.

Two side notes for the fix: (a) the `?? 1` fallback misreads the contract — `length` is always present, and "1" is the *detect*-space size of a chip, not a default clipboard length; (b) the plugin's own `setDraft` fallback branch is actually coordinate-correct (`setDraft` consumes clipboard text), which shows the author already used clipboard coordinates where they were right and detect coordinates where they were required — the two spaces were never separated explicitly.

## 3. Fix direction

**Rule (derived from `host-input-contract.ts` + `host-input-facade.ts`):** every `TokenSpan` handed to a facade verb (`insertReference`'s `span`, `consumeToken`'s `guard.span`) must be in **detect coordinates: each occurrence contributes exactly 1 (U+FFFC)**. Everything read from `InputState` — `draft`, `Occurrence.offset`, `Occurrence.length` — and everything given to `setDraft` is in **clipboard coordinates**. Conversion, using only published `InputState` data (an occurrence's clipboard span collapses to one char):

```
detectPos(p) = p − Σ (o.length − 1)   over every occurrence o entirely before p
```

**Insert call site** (`add`, plugin-client.js:29–31): insert at end-of-draft in detect space:

```js
const detectEnd = snapshot.occurrences.reduce(
  (pos, o) => pos - (o.length - 1), snapshot.draft.length);
const accepted = input.insertReference({ … }, {
  start: detectEnd, end: detectEnd, draftRev: snapshot.draftRev,
});
```

Check against the capture: paste #2 → 29 − 27 = 2 = end of `"\uFFFC "`. Correct. Keep the existing `if (!accepted) { records.delete(ref); throw … }` transactional cleanup (optionally fix the message — the composer did not change; the insert was rejected).

**Removal call site** (`remove`, plugin-client.js:49–58): convert the occurrence's clipboard span to its detect span — start converted by the same rule, end = start + 1 (the chip is one U+FFFC, **not** `+ occurrence.length`):

```js
const start = snapshot.occurrences
  .filter(o => o.offset + o.length <= occurrence.offset)
  .reduce((pos, o) => pos - (o.length - 1), occurrence.offset);
const consumed = input.consumeToken({
  kind: 'span', span: { start, end: start + 1, draftRev: snapshot.draftRev },
});
if (!consumed) return;            // keep the record; chip stays functional/retryable
records.delete(occurrence.ref);
changed();
```

Check: single chip → span [0, 1) of `"\uFFFC "` → chip removed; second chip at clipboard offset 29 with first chip length 28 → start = 29 − 27 = 2, end = 3 = the second U+FFFC. Correct. Drop the `occurrence.length ?? 1` default (`length` is non-optional per contract). Keep the `setDraft` fallback as-is — it is already clipboard-correct — but treat it as the legacy fallback, not the primary path.

**Bookkeeping rule (both paths):** the verb's boolean is the only authority on whether the composer changed. Local state mutations (`records.set/delete`, re-render, toasts) must be conditional on it. This single rule removes the `unavailable` ghost even if a guard legitimately rejects again.

## 4. Regression test plan (assert exactly these sequences)

**A · Repeat-paste sequence (bug 1 must not return)**
1. Fresh session, empty composer. Paste screenshot A → assert `insertReference` returned true, no toast, exactly one composer chip, `occurrences.length === 1`, dock chip shows the real byte size.
2. **Without clearing**, paste screenshot B → assert no toast, `insertReference` true, composer = chip A then chip B, clipboard draft = `` `[attachment: A] [attachment: B] ` ``, detect text = `"\uFFFC \uFFFC "` (4 chars), `records.size === 2`, both dock chips show real sizes.
3. Paste screenshot C → three chips, same assertions (proves the fix is not "second paste only").
4. One paste event carrying two files → both chips inserted (the in-loop re-snapshot path).
5. Reset-by-removal: paste A, remove it, paste B → B must insert (guards against a fix that special-cases "first insert" instead of converting coordinates).

**B · Removal sequence (bug 2 must not return)**
6. Chips A + B. Click × on A's dock chip → assert `consumeToken` returned true, `occurrences` = [B] only, clipboard draft = `` `[attachment: B] ` ``, A's dock chip **gone** (not `unavailable`), B's label unchanged, `records` has no A.
7. Click × on B → composer empty, `occurrences === []`, `records` empty, dock empty.
8. Order independence: insert A, B, C; remove C, then A, then B (each click must recompute from a fresh snapshot — asserts the "sum over preceding occurrences" conversion, not cached offsets).
9. Text-adjacent removal: type `hello `, paste a chip, type ` world`, click × on the chip → assert the chip's detect char is removed and the surrounding `hello ` / ` world` text survives intact (the old clipboard-space span would have eaten 28 detect characters of neighboring content).
10. Transactional bookkeeping (the `unavailable` guard): stub/race the host so `consumeToken` returns false, click × → assert the record is **not** deleted, the dock chip keeps its real size label, the composer chip is still present, and a subsequent click (host restored) removes it cleanly.

**Unit-level invariants (spy on the facade):** every span passed to `insertReference`/`consumeToken` satisfies `end ≤ detectText.length` and `end − start === 1` per removed chip; every call site checks the boolean return (mutation test: force a verb to return `false` and assert zero local state mutation).

## 5. Maintainer discipline: what to read in host source before calling input-machine verbs

Guidance (not scored), aligned with the plugin-upgrade skill's Mode A principle that root-cause confirmation rests on the target tag's source:

1. **Read the verb's guard chain in the target tag's source, not your call site.** Enumerate every `return false` condition (phase, revision CAS, `start === end`) and find what the splice helper (`$replaceDetectSpanWith*`) validates its span against — that operand, not your `snapshot`, defines the coordinate space.
2. **Treat per-field coordinate annotations in the contract as normative.** "Offset in the clipboard-text projection" vs "Trigger/TokenSpan coordinate text (chip = one U+FFFC)" is a conversion requirement. Whenever one document has two published projections, tag every offset variable with its space at the call site and never pass `draft.length` straight into a span.
3. **Check the verb's return semantics.** A boolean "applied" means the edit can fail *even when your revision was fresh* — bookkeeping must be transactional with the return value.
4. **Re-diff the facade + contract files on every corridor edge and re-run one real interaction flow** (repeat-interaction + removal) on a mounted host before release — static typecheck cannot catch a coordinate-space unit mismatch (the types here are all `number`). This alpha.3 edge changed none of it (per the corridor card), but the check is per-edge and cheap; the capture-level probe is one paste → snapshot → second paste.
