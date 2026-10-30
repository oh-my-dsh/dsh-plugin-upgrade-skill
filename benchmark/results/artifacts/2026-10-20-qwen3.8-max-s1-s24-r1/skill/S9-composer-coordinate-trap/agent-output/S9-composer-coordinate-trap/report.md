# S9 · Composer Coordinate Trap — Diagnosis Report

**Plugin:** `@org/dsh-attach-input` v0.2.3 · **Host:** DSH `0.1.2-alpha.3` · **Mode:** read-only diagnosis (report only; fixture untouched)
**Evidence:** `fixture/plugin-client.js`, `fixture/console-session.txt`, `fixture/host-input-facade.ts`, `fixture/host-input-contract.ts` (all cited by line below).

**Headline:** the two user-reported bugs are NOT two defects. Both are one contract misread: the plugin computes edit coordinates in the **clipboard-text projection** (where a chip is its full `clipboardText`, 28 chars here) and feeds them to host verbs whose span guards/splices operate in the **detect projection** (where a chip is exactly one `U+FFFC` char). The removal path then compounds it by ignoring the verb's boolean result and deleting its own bookkeeping unconditionally.

---

## 1. Why paste #1 succeeds and every later paste fails with the toast

### 1.1 The host has two coordinate currencies (published contract)

`host-input-contract.ts` documents both projections on `EditorProjection` (L34–42):

| Projection | Chip representation | Who consumes it |
|---|---|---|
| `detectText` — "Trigger/TokenSpan coordinate text (chip = one U+FFFC)" (L36–37) | 1 char (`U+FFFC`) per chip | the facade's span verbs: `insertReference`'s `TokenSpan` ("pick-time span snapshot (detect coordinates)", facade L11) and `consumeToken`'s span guard — both splice via `$replaceDetectSpanWith*` (facade L3–4, L24, L41) |
| `clipboardText` — "Persistence/InputState draft text (chip = clipboardText)" (L38–39) | full `occurrence.clipboardText` (28 chars for `[attachment: screenshot.png]`) | everything the plugin reads: `InputState.draft` (L26–27) and `Occurrence.offset/length` — explicitly "Offset/Length **in the clipboard-text projection**" (L14–17), occurrences are "InputState-compatible … (clipboardText coordinates)" (L40–41) |

Non-chip text is identical in both projections; only chips diverge, by `length − 1` per chip.

### 1.2 The exact mismatch

`plugin-client.js` `add()` computes the insert span from the **InputState snapshot** and passes it to the **detect-space verb**:

```js
// add(), L21–32
const accepted = input.insertReference({ … }, {
  start: snapshot.draft.length,   // ← clipboard-space offset (chips expanded)
  end:   snapshot.draft.length,   // ← clipboard-space offset
  draftRev: snapshot.draftRev,    // ← fine: one monotonic revision, same currency for the CAS
});
```

The host verb (facade L14–27) checks phase (`plain`/`claimed`, L15–16), then the revision CAS `span.draftRev !== this.rev` (L17) — **the plugin's rev is correct**: `InputState.draftRev` is documented as "Monotonic editor revision (span CAS compares against this)" (contract L28–29), and the snapshot is taken fresh in the same tick, so the CAS passes. The verb then computes `tail = this.projection.detectText.slice(span.end, span.end + 1)` (L18) and splices **detectText** via `$replaceDetectSpanWithNodes(span, nodes)` (L24). The mismatch is here: `span.start/end` must be offsets into `detectText`, but the plugin supplied offsets into `draft` (clipboard projection). When the splice cannot map the span onto the detect document, `applied` stays `false` and `insertReference` returns `false` (L19, L26) — which the plugin turns into its own toast (plugin L33–36).

### 1.3 Walkthrough against the capture (exact numbers)

* **Paste #1** (console L4–10): fresh session, empty composer. `draft = ""`, `detectText = ""` → `start = end = 0` is simultaneously valid in both currencies (they coincide exactly at the empty document). CAS passes; `tail = ""` → nodes = chip + separating space (facade L21–23); splice at detect offset 0 applies → `true`. Chip + dock chip render. **The bug is present but invisible.**
* **After paste #1**: `draft = "[attachment: screenshot.png] "` (29 chars: chip clipboardText 28 + host-added separator space), occurrence `{offset: 0, length: 28}` (console L8–9). In detect space the same document is `"\uFFFC "` — **2 chars**. The projections have diverged by `28 − 1 = 27`.
* **Paste #2** (console L12–15): `add()` sends `start = end = snapshot.draft.length = 29` into a detect document of length 2. CAS still passes (fresh snapshot, no concurrent edit); the detect-space splice at offset 29 is unmappable → `applied = false` → `insertReference` returns `false` → toast, no chip. Deterministic, and the same arithmetic breaks every later paste (with N chips the overshoot is `Σ(lengthᵢ − 1)`).

### 1.4 Why "first works, later fails" is the signature of THIS mismatch

The two currencies are **identical only while the document contains no chips** (both projections equal the plain text; offset 0 = offset 0). The first successful insert is precisely what creates the first chip and therefore the first divergence (`clipboardText.length − 1` per chip). So a coordinate-currency error is *self-masking on the first interaction and deterministic on every subsequent one* — failure appears exactly at the second stateful operation, every time, independent of timing. That distinguishes it from the alternative readings of the same toast: a revision-CAS race would be flaky (could hit paste #1, would succeed on retry) and a phase-guard rejection would be transient and tied to in-flight operations — neither matches "first always OK, second always fails, no concurrency involved."

---

## 2. Why the × click yields `unavailable` instead of removal

Trace of `remove()` (plugin L43–60) against the capture (console L17–21):

1. Dock × passes the **occurrence from `InputState.occurrences`** — offsets/lengths in clipboard coordinates (contract L14–17, L30–31).
2. Plugin builds the span: `end = occurrence.offset + (occurrence.length ?? 1)` → `[0, 28)` (plugin L47–49), `draftRev` fresh → CAS passes; and `start !== end`, so the empty-span rejection (facade L38) does not fire.
3. `input.consumeToken({kind:'span', …})` → host splices **detectText** with `$replaceDetectSpanWithText(guard.span, '')` (facade L41). `[0, 28)` is unmappable in a 2-char detect document → `applied = false` → returns `false`. **The composer chip is untouched.**
4. Plugin-side bookkeeping ignores the result — console L18 says it outright: "consumeToken(...) returned (**not inspected by the plugin code**)". `remove()` unconditionally runs `records.delete(occurrence.ref)` and `changed()` (plugin L58–59).
5. The dock renders by iterating host occurrences and looking up plugin records: `record === undefined → 'unavailable'` (plugin L63–65). The host occurrence still exists (chip never removed), the record is now gone → **the dock chip re-renders with meta `unavailable` and the composer chip stays**. That is user report #3 exactly (console L19–20).

So the same coordinate misread causes the host to refuse the removal; the "chip stuck at `unavailable`" presentation is the plugin's own second defect on that path — deleting its record without conditioning on the verb's boolean — which converts "host refused, state unchanged" into "desynchronized bookkeeping."

---

## 3. Fix direction — conversion rule and call sites

### 3.1 The conversion rule (derived from the host excerpts, not guessed)

Facts the rule is built from: chip = exactly one `U+FFFC` in detect space (contract L36–37; facade L18/L24/L41 splice detectText); chip = `occurrence.length` chars at `occurrence.offset` in clipboard space, occupying exactly `[offset, offset+length)` (contract L16–17); occurrences are sorted by offset (contract L30–31); all other text is 1:1 between projections; `draftRev` is one monotonic revision used by the CAS (contract L28–29) — **rev needs no conversion, only coordinates do**.

Therefore, for a clipboard-space position `p` not strictly inside an occurrence:

```
toDetect(p) = p − Σ (o.length − 1)   over all occurrences o with o.offset + o.length ≤ p
```

and an occurrence `o` itself occupies the detect span:

```
[ toDetect(o.offset),  toDetect(o.offset) + 1 )     // chip = 1 × U+FFFC — never o.length
```

Helper sketch (pure function over the published snapshot — unit-testable):

```js
const toDetectPos = (snapshot, p) =>
  p - snapshot.occurrences.reduce((n, o) => n + (o.offset + o.length <= p ? o.length - 1 : 0), 0);
const detectEnd  = (s) => toDetectPos(s, s.draft.length); // = detectText.length
```

Capture check: after paste #1, `detectEnd = 29 − (28 − 1) = 2` — the true end of `"\uFFFC "`. Removal detect span for the chip: `[0, 1)`.

If the host exposes the projection's `detectText` to plugins through a published accessor, prefer reading detect coordinates directly; the subtraction rule above is the guaranteed-correct derivation from the published `InputState` alone, and is what the excerpt supports.

### 3.2 Call sites to change

1. **Insert path — `add()` (plugin L21–32):** replace `start/end: snapshot.draft.length` with the converted detect-space end: `start = end = detectEnd(snapshot)` (or the converted caret position if inserting mid-document later). Keep `draftRev: snapshot.draftRev` unchanged. Leave the record-rollback on `accepted === false` (L33–36) as is — it is already correct.
2. **Removal path — `remove()` (plugin L47–54):** build the span in detect coordinates: `start = toDetectPos(snapshot, occurrence.offset)`, `end = start + 1`. Do **not** pass `occurrence.length`. (Optional UX refinement: extend `end` by 1 when the adjacent detect char is the separator space the host added at insert time — facade L21–23 — to avoid leaving double spaces; verify against detectText before relying on it.)
3. **Removal path — result bookkeeping (plugin L50–59):** capture the boolean: `const consumed = input.consumeToken(…)`; only `records.delete(ref)` + `changed()` when `consumed === true`; on `false`, keep the record (dock chip keeps its size label), surface a user-visible error, and allow retry. A host `false` means "not applied, state unchanged" (facade L12, L26, L34, L43) — plugin state must not diverge from it.
4. **Fallback branch (plugin L55–57):** `setDraft(snapshot.draft.slice(0, offset) + slice(end))` is written in clipboard currency, which matches `setDraft`'s InputState-draft currency — but confirm in host source whether `setDraft` re-parses chip clipboardText back into chip nodes (clipboardText is a persistence projection, "never the model form", contract L20–21) before depending on this branch. Same review note for the pre-insert `setDraft(draft + ' ')` at L13–16, which round-trips the whole clipboard projection (dormant in this repro because the host guarantees the trailing space).
5. **Hardening:** after each successful verb call, re-sync `records` against the fresh `snapshot.occurrences` (prune records with no occurrence, flag occurrences with no record) so a refused edit can never again present as `unavailable`.

---

## 4. Regression test plan (exact interaction sequences)

Guards for bug #1 (insert currency):

* **T1 — first paste (baseline, empty composer):** fresh session → paste file A. Assert: `insertReference` returned true (spy the boolean); no toast; dock chip shows name + byte size; composer contains the chip; snapshot has 1 occurrence; `draft === A.clipboardText + ' '`.
* **T2 — second paste (the repeat-interaction kill-shot):** immediately paste file B (different label length than A, so a hard-coded shift cannot pass). Assert: no toast; insert returned true; 2 occurrences; 2 composer chips; both dock chips show sizes (never `unavailable`). Extend to a **third paste** to pin the cumulative `Σ(length−1)` shift.
* **T3 — mixed text and chips:** type plain text, paste A, type more text, paste B (insert-at-end with chips mid-document). Assert both inserts applied and detect/clipboard projections stay consistent (occurrence offsets sorted, no overlap, `draft` equals expected concatenation).
* **T4 — converter unit tests (golden values from the projection rule):** empty doc → identity; one 28-char chip at offset 0 → detect end 2; chip + trailing text; two chips → shift = Σ(length−1); position strictly inside an occurrence is rejected/flagged, never silently mapped.

Guards for bug #2 (removal currency + bookkeeping):

* **T5 — remove single chip:** after T1, click × on the dock chip. Assert: `consumeToken` returned true (spy); composer chip gone; occurrences empty; **dock chip removed entirely** (not re-rendered as `unavailable`); record deleted only after success.
* **T6 — remove with neighbors:** paste A, B, C → remove the middle chip B. Assert: B's composer chip gone, A and C intact, remaining occurrence offsets re-sorted and consistent; then paste D → insert still applies (proves removal left detect coordinates aligned); then remove A and C.
* **T7 — removal-failure bookkeeping (pins the second half of bug #2):** stub/spy the host so `consumeToken` returns false (e.g., bump the editor revision between snapshot and call, or an out-of-range span injected at unit level). Assert: record NOT deleted; dock chip still renders its byte size; user-visible error surfaced; retry with a fresh snapshot succeeds.
* **T8 — interleaved soak:** paste A → paste B → remove A → paste C → remove C → remove B → paste D. Assert every verb returned true, no toast ever appears, and final state = only D (1 occurrence, 1 dock chip with size). This sequence re-diverges and re-converges the two projections at every step — any residual currency confusion fails it deterministically.

Assertion mechanics: spy on `insertReference`/`consumeToken` booleans (both bugs hide behind ignored/false results); assert against published snapshot state (`draft`, `draftRev`, `occurrences`) after every step, not just final render; run T2/T5/T8 as E2E in a real DSH Web client per the paste event, plus the T4/T7 unit level.

---

## 5. Routine host-source discipline before calling input-machine verbs (maintainer guidance; unscored)

For every host verb the plugin calls, read and record, at the pinned host version:

1. **Coordinate currency of every span/offset parameter** — which projection does the splice operate on (`detectText` vs `clipboardText`), and what does the type doc say (`TokenSpan` = "detect coordinates")? Never assume a field read from `InputState` can be passed straight back into a verb.
2. **The guard chain and failure semantics** — phase guard (`plain`/`claimed`), revision CAS (which rev, compared to what), degenerate-input rejection (`start === end`, empty token), and the meaning of the return value: `false` = "not applied, state unchanged" → plugin bookkeeping must be conditional on it, never optimistic.
3. **Projection invariants** — how each node type renders in each projection (chip: 1×U+FFFC vs full clipboardText), which projection is persistence ("never the model form"), and how the host post-processes edits (separator-space addition after insert) so plugin-side text surgery doesn't fight it.
4. **Currency of every setter too** (`setDraft`) — whether it parses clipboard projections back into nodes, before round-tripping `snapshot.draft` through it.
5. **On every DSH upgrade** — re-read these guards in the new tag's source and check the skill's corridor cards / API ledgers for input-contract drift (no card in the 0.1.2 corridor references documents this facade — 0 hits for `insertReference/consumeToken/detectText/TokenSpan` in the card set — so the exact-tag source remains the primary source); keep a pinned peer range and add T2/T5/T8 to the release checklist as the behavioral canaries.

---

## Appendix · fixture integrity

Read-only discipline observed: no file under `fixture/` was created, modified, or deleted; all commands were reads/hashes. SHA-256 of the five fixture files re-verified against `fixture-hash-before.json` at report time (see verification note appended by the run).
