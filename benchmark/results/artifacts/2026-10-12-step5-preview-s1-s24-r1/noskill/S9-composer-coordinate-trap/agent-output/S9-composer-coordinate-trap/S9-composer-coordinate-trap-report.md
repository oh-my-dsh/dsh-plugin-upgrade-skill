# S9 · Composer Coordinate Trap — Diagnosis Report

**Plugin:** `@org/dsh-attach-input` v0.2.3 · **Host:** DSH 0.1.2-alpha.3
**Evidence:** `fixture/plugin-client.js`, `fixture/console-session.txt`, `fixture/host-input-facade.ts`, `fixture/host-input-contract.ts` (read-only)

---

## 0. Executive summary

Both reported symptoms are **one defect, not two**: the plugin feeds **clipboard-text-projection coordinates** into host verbs whose `TokenSpan` guards operate in the **detect-text projection**. The DSH input contract publishes two coordinate spaces (`host-input-contract.ts:34-42`), every `TokenSpan` passed to `insertReference` / `consumeToken` indexes `detectText` where a chip is a single U+FFFC (`host-input-facade.ts:18,24,41`), while everything the plugin reads — `InputState.draft.length`, `Occurrence.offset/length` — indexes `clipboardText` where a chip is its full `clipboardText` string. The two spaces coincide only at `0`, which is why the first paste works and everything after fails; and because the removal verb silently fails while the plugin deletes its own record anyway, the dock chip degrades to `unavailable` instead of disappearing.

---

## 1. Bug #1 — first paste succeeds, every later paste toasts

### The exact mismatch

The insert path (`plugin-client.js:21-32`):

```js
const accepted = input.insertReference(
  { source: SOURCE, ref, label: item.path, appearance: 'file',
    clipboardText: `[attachment: ${item.path}]` },
  { start: snapshot.draft.length, end: snapshot.draft.length,   // ← clipboardText coordinates
    draftRev: snapshot.draftRev }
);
```

- `snapshot` is an `InputState`: `draft` is "Clipboard-text projection of the editor document (chips expanded to their clipboard form)" and `occurrences[].offset/length` are "Offset/Length in the **clipboard-text** projection" (`host-input-contract.ts:25-31`). So `snapshot.draft.length` is a **clipboard-space** index.
- But the second argument of `insertReference` is `span: TokenSpan`, documented as "pick-time span snapshot (**detect coordinates**)" (`host-input-facade.ts:11,14`), and the verb body indexes the detect space directly:

```ts
if (span.draftRev !== this.rev) return false
const tail = this.projection.detectText.slice(span.end, span.end + 1)      // detectText index
applied = $replaceDetectSpanWithNodes(span, nodes)                        // splices the DETECT text
```

- `EditorProjection.detectText` is "Trigger/TokenSpan coordinate text (**chip = one U+FFFC**)", whereas `clipboardText` is "chip = clipboardText" (`host-input-contract.ts:36-41`).

So the plugin computes a position in the space where this chip is 28 characters, and hands it to a guard that splices the space where this chip is **1** character.

### Why "first works, later fails" is the signature of this mismatch

The divergence between the two projections is **0 on an empty composer** and grows by `(clipboardText length − 1) = 27` per inserted chip. Work it through the capture (`console-session.txt`):

| Step | composer content | `draft` (clipboard) | `detectText` | span the plugin sends | outcome |
|---|---|---|---|---|---|
| paste #1 | empty | `""` (0) | `""` (0) | `{start:0, end:0, rev}` | valid in **both** spaces → `$replaceDetectSpanWithNodes` inserts chip + space → `accepted = true` |
| after #1 | one chip | `"[attachment: screenshot.png] "` (29) | `"\uFFFC "` (2) | — | — |
| paste #2 | one chip | — | — | `{start:29, end:29, rev}` | detect document is only **2** long; `detectText.slice(29,30)` = `""`, and the splice of `[29,29)` is out of range → `applied = false` |

Note the revision CAS is *not* the culprit: the plugin re-reads a fresh snapshot before the call (`plugin-client.js:11`, and again after each accepted insert, `plugin-client.js:37`), and nothing edited the composer between 12:39:41 and 12:40:05, so `span.draftRev === this.rev` holds. The only guard that can fail is the detect-space splice — deterministically, because the sent index is past the end of the detect document.

That determinism is the signature. A stale-revision race would fail *intermittently* and could hit the first paste too; a coordinate-space mismatch fails **exactly when the two projections have diverged**, i.e. never on the first interaction of a fresh composer and always afterwards. `insertReference` returning `false` makes `add` delete the just-created record and throw the fixed message (`plugin-client.js:33-36`) — hence "no second chip anywhere" and the toast that blames a "changed composer" (the host's `false` is overloaded: phase, rev, *or* splice range; the plugin maps all of them to one message, which is why the real cause is invisible from the toast).

---

## 2. Bug #2 — × click turns the chip into `unavailable`

Trace of `remove()` (`plugin-client.js:43-60`) against the facade:

1. Dock × → `remove(sessionId, occurrence)` reads a fresh snapshot; `phase === 'plain'` so it proceeds.
2. `end = occurrence.offset + (occurrence.length ?? 1)` = `0 + 28 = 28`. The inline comment ("the occurrence owns its whole inline range, so the removal must span `occurrence.length`") shows the author treating the clip string's length as the inline length. But `occurrence.length = 28` is a **clipboard-space** length (`host-input-contract.ts:16-17`); in `detectText` the same chip is one U+FFFC occupying `[0, 1)`.
3. `input.consumeToken({ kind: 'span', span: { start: 0, end: 28, draftRev } })`. In the facade, the span guard runs `$replaceDetectSpanWithText(guard.span, '')` — again **detect** coordinates (`host-input-facade.ts:37-42`). `start(0) !== end(28)` and the rev matches, so the guards pass and the splice is attempted on a 2-character detect document with range `[0, 28)` → out of range → `applied = false`, `consumeToken` returns `false`. **The composer chip is never removed.**
4. **The plugin ignores the return value** ("returned (not inspected by the plugin code)" — `console-session.txt:18`) and unconditionally runs `records.delete(occurrence.ref)` then `changed()` (`plugin-client.js:58-59`).
5. On re-render, the dock still walks the host's occurrences (the host edit never applied, so the occurrence survives), looks up `records.get(occurrence.ref)`, gets `undefined`, and the render rule `record === undefined ? 'unavailable' : humanBytes(record.total)` (`plugin-client.js:65`) prints **`unavailable`**.

So the visible symptom is the *combination* of the same coordinate misread (chip spans 28 in clipboard space, 1 in detect space — the `?? 1` fallback on line 49 is accidentally the detect-space truth) plus bookkeeping that mutates plugin state regardless of the verb's boolean result. Symptom #3 is therefore the same root cause as symptom #2, observed on the removal verb.

---

## 3. Fix direction

### The conversion rule (derived from the host excerpts)

From `host-input-contract.ts` and `host-input-facade.ts`:

- `TokenSpan` (every `span` passed to `insertReference` / `consumeToken`) indexes `EditorProjection.detectText`; each chip occupies exactly **1** (U+FFFC) there (`host-input-facade.ts:11,18,24,41`; `host-input-contract.ts:36`).
- `InputState.draft` and `Occurrence.offset/length` index the clipboard projection; a chip occupies `clipboardText.length` there (`host-input-contract.ts:14-17,26-27,38`).
- The set of chips and their clipboard-space extents is published: `InputState.occurrences`, sorted by offset (`host-input-contract.ts:30-31`).

Therefore, for occurrences `O` (sorted by offset) and any clipboard coordinate `c`:

```
detect(c) = c − Σ over occurrences o with (o.offset + o.length ≤ c) of (o.length − 1)
```

(each chip entirely before `c` collapses from `o.length` clipboard chars to 1 detect char). If `c` falls inside a chip's range, the detect coordinate is that chip's single position (before → chip index, after → chip index + 1). Sanity invariant: `detect(draft.length) = draft.length − Σ_o (o.length − 1) = detectText.length`, verifiable in the capture: `29 − 27 = 2` ✓.

One shared, unit-tested helper — `toDetect(coord, occurrences)` — should own this rule; nothing else in the plugin may compute spans.

### Call sites

**a) Insert path — `add` (`plugin-client.js:29-31`).** Replace `snapshot.draft.length` with the converted coordinate before building the span:

```js
const end = toDetect(snapshot.draft.length, snapshot.occurrences);
const accepted = input.insertReference(refInsert, {
  start: end, end,                       // detect coordinates, as TokenSpan requires
  draftRev: snapshot.draftRev,
});
```

Keep the post-insert snapshot refresh (`plugin-client.js:37`) so multi-item loops convert against the freshest state. For paste #2 this yields `{start: 2, end: 2}` on `detectText = "\uFFFC "` → `tail = ""` → chip + separator space appended → accepted.

**b) Removal path — `remove` (`plugin-client.js:49-54`).** Convert the occurrence to detect space; the chip is always exactly one detect char wide:

```js
const start = toDetect(occurrence.offset, snapshot.occurrences);
const end = start + 1;                   // chip = one U+FFFC in detectText
const accepted = input.consumeToken({
  kind: 'span', span: { start, end, draftRev: snapshot.draftRev },
});
```

(Optional polish: if `detectText` at `end` is the auto-inserted separator space the host appends on insert — `host-input-facade.ts:18-24` — extend `end` by 1 to swallow it; this only needs the projection/detect text, not the model.)

**c) Keep the `setDraft` fallback in clipboard space.** The `else` branch (`plugin-client.js:56`) slices `snapshot.draft` with `occurrence.offset`/`end` — that is correct *because* `setDraft` and `draft` are clipboard-space. Do not "fix" it to detect coordinates.

**d) Gate all bookkeeping on the verb result.** `add` already deletes the record when `!accepted` (`plugin-client.js:33-36`); make `remove` symmetric — delete the record and call `changed()` only on success, and for the `setDraft` fallback verify by re-reading the snapshot and checking the occurrence is gone (`occurrences` is the published view; if the host applied the edit, the occurrence is absent). This is what makes an unavailable-verb failure a no-op instead of a `unavailable` chip.

---

## 4. Regression test plan

**Insert path (repeat-interaction sequences):**

1. **Fresh composer → paste #1:** assert `insertReference` receives a span with `start = end = 0`, `draftRev =` current rev; accepted `true`; chip in composer, dock chip + record present.
2. **Immediately → paste #2 (no other action):** assert accepted `true` and **no toast**; span equals the converted detect end (`2` in the capture scenario); two chips in composer, two dock chips. This is the exact reported sequence — it must pass deterministically.
3. **Pastes #3…#N:** all accepted; invariant asserted on every call: `0 ≤ span.start ≤ span.end ≤ detectLength` where `detectLength = draft.length − Σ_o (o.length − 1)`, and `span.end − span.start` grows by exactly the inserted chip's detect width.
4. **Multi-item single `add` call** (two items in `items`): both accepted; the second span is computed from the post-first-insert snapshot.
5. **Draft with leading text before the first chip** (`"hello "` then paste): conversion with text preceding chips; inserted chip lands at the detect end, not past it.
6. **Negatives preserved:** phase ≠ `plain` → throws before any verb call; simulated `insertReference → false` → record rolled back and the original error thrown (no dock chip).

**Removal path:**

1. **One chip → ×:** assert `consumeToken` returns `true`, span `= {start: detect(offset), end: start + 1, draftRev: rev}`; chip gone from the composer; record deleted; dock chip removed entirely (never rendered with `unavailable`).
2. **Two chips → remove the first:** remaining chip intact, still resolvable; then **remove the second:** both gone. Catches off-by-one in the collapse arithmetic after a prior removal.
3. **Chip surrounded by text** (`"a [chip] b"`): only the chip removed; surrounding text intact in both projections.
4. **Host refuses the removal** (simulate stale `draftRev` / non-plain phase / verb absent so the `setDraft` fallback fails verification): assert `remove` is a **no-op** — record kept, dock chip still shows its size (not `unavailable`), no unhandled throw.
5. **Paste again after a successful removal:** guard against coordinate drift after removals (fresh conversion still correct).

**Cross-cutting:**

6. **Full user-report replay as one E2E:** paste → paste → × → paste; asserts both original symptoms absent.
7. **Guard-shape assertions on every verb call:** `start !== end` for span `consumeToken` (host rejects empty spans — `host-input-facade.ts:38`), `draftRev` always equals the rev read in the same synchronous turn, and span bounds within `detectText` per the invariant from insert-test 3.
8. **Helper unit tests:** `toDetect` over a table — 0 chips, 1 chip, N chips, chips with different `clipboardText` lengths, coordinates before/between/after chips; plus the identity `toDetect(draft.length) = detectText.length`.

---

## 5. Maintainer routine: what to check in host source before calling input-machine verbs

(Unscored guidance, included for completeness.)

1. **For every field you consume, find which projection it indexes.** The contract (`contract/input.ts`) labels them: `draft`/`occurrences` → clipboard; `detectText` → TokenSpan. A field's *name* never tells you the space; the doc comment does.
2. **Read the verb body, not just its signature.** Both verbs return `boolean` meaning "edit applied", with overloaded causes (phase, rev CAS, splice range). Always branch on the return before mutating plugin-side bookkeeping; never map `false` to a single user-facing cause without logging the span vs. the projection length.
3. **Treat coordinate conversion as a single owned point** (`toDetect`), with the invariant `toDetect(draft.length) === detectText.length` unit-tested; no ad-hoc `draft.length` arithmetic at call sites.
4. **On host upgrades, diff the facade and contract** for changed guards and for projection changes — this class of bug is born when the host split one draft string into two projections (clipboard vs. U+FFFC detect) while plugin code kept assuming one.
5. **Never trust the first interaction:** empty-state coordinates make both projections agree at 0, so the first paste of a fresh session can never catch a divergence. Any suite for input-machine verbs must start with the *second* interaction.
