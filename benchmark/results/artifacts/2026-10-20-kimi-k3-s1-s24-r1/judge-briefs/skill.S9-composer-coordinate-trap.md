# JUDGE BRIEF · skill.S9-composer-coordinate-trap

## Criteria (sealed rubric)
- [projection-contract] (20pt) Use host-input-contract.ts and host-input-facade.ts to distinguish published draft/Occurrence clipboard-text offsets from the detect-coordinate spans used by insertReference and consumeToken. A chip expands to clipboardText in the former and occupies one U+FFFC in the latter; ordinary text and separating spaces still contribute their normal width. Equivalent descriptions without exact type names are valid.
- [repeat-paste-failure] (20pt) Locate snapshot.draft.length in plugin-client.js add and connect the captured first-success/second-failure behavior to the host detect-span splice. With an initially empty composer both coordinates coincide; after a chip, clipboard length overshoots the detect span and insertReference returns false, which the plugin turns into its changed-composer toast. Do not infer a real concurrent edit from the toast or require inconsistent hardcoded character counts from the capture.
- [removal-and-bookkeeping] (20pt) Trace plugin-client.js remove: occurrence.offset/length are passed unconverted to consumeToken, its false result is ignored, and records.delete runs anyway. The live occurrence remains, while missing record data renders unavailable in the dock and the composer chip stays. Tie both symptoms to the same coordinate mismatch, rather than treating unavailable as a separate upload failure.
- [conversion-and-success-gate] (20pt) Derive and apply the conversion at BOTH call sites: subtract the sum of (occurrence.length - 1) for preceding chips; for insertion at draft end account for all preceding occurrences, and for removal map occurrence.offset then use a one-detect-character span. Keep the revision guard; retire records only after successful consumption or a verified successful clipboard-coordinate fallback. Equivalent correct mapping/pseudocode is sufficient; merely saying convert offsets is incomplete.
- [regression-sequences] (20pt) Propose two successive pastes with both occurrences/chips present, then remove a chip with another preceding chip and assert composer occurrence, dock chip and record are removed together while the other chip survives. Declined-consumption bookkeeping, first/last-chip and empty-again variants are valid additions. Code assertions and natural language are equivalent. Score only task items 1-4; item 5 host-source-reading discipline is explicitly unscored.

## Caps (score ceilings; judge returns each with triggered true/false)
(none)

## Candidate report(s)
#### FILE: S9-composer-coordinate-trap/report.md

# S9 · Composer Coordinate Trap — Diagnosis Report

**Subject:** `@org/dsh-attach-input` v0.2.3 on DSH `0.1.2-alpha.3` — two user reports, one root cause.
**Evidence (read-only fixture, unchanged):** `fixture/plugin-client.js`, `fixture/host-input-facade.ts`, `fixture/host-input-contract.ts`, `fixture/console-session.txt`.
**Verdict in one line:** both symptoms are a single contract misread — the plugin computes every `TokenSpan` in **clipboard-text (draft) coordinates**, while the host's span-guarded verbs (`insertReference`, `consumeToken`) splice and bounds-check in **detect coordinates**; the ×-click symptom is that same misread plus an ignored boolean return value.

---

## 1. Why paste #1 succeeds and every later paste fails with the toast

### The exact mismatch

The plugin's insert call site (`plugin-client.js:21-32`) builds the span as:

```
start: snapshot.draft.length, end: snapshot.draft.length, draftRev: snapshot.draftRev
```

`snapshot.draft` is the **clipboard-text projection** of the document — each chip is expanded to its full `clipboardText` (`host-input-contract.ts:26`, `EditorProjection.clipboardText`, line 38: "chip = clipboardText"). But `insertReference(ref, span)` documents and implements `span` as **detect coordinates**: "pick-time span snapshot (detect coordinates)" (`host-input-facade.ts:12`), and the verb slices/splices `this.projection.detectText` (`host-input-facade.ts:18,24`) — the projection where **one chip = exactly one U+FFFC** (`host-input-contract.ts:37`).

So the plugin hands the verb a span measured in a text where the chip costs 28 characters, into a guard that applies it to a text where the same chip costs 1 character.

### Replaying the capture

- **Paste #1 (empty composer):** `draft === ""` and `detectText === ""`. Both coordinate systems coincide at 0, so `{start:0, end:0, draftRev}` is a valid span in *either* space. The `draftRev` CAS passes (the plugin just read the snapshot) and `$replaceDetectSpanWithNodes` succeeds. After the edit, `draft = "[attachment: screenshot.png] "` (29 units) but `detectText = "\uFFFC "` (2 units). The coordinate spaces have now diverged by 27.
- **Paste #2:** the plugin computes `start = end = snapshot.draft.length = 29`. The rev guard still passes — the capture shows the snapshot was fresh, so the toast's own wording ("the composer changed") is a red herring. The real rejection happens one guard later: `$replaceDetectSpanWithNodes({start:29, end:29}, …)` is asked to splice a 2-unit `detectText` at offset 29 → out of range → `applied = false` → `insertReference` returns `false` → the plugin deletes the record and throws the toast (`plugin-client.js:33-36`).

### Why "first works, later fails" is the signature of this mismatch

Clipboard and detect coordinates are identical **only while the document contains no chips before the insertion point** (every prior chip contributes `length − 1` of divergence; a trailing space contributes nothing). An empty composer is the one state where the wrong formula is indistinguishable from the right one. The moment paste #1 leaves a chip behind, every draft-derived offset overshoots `detectText`, and every subsequent insert deterministically fails the splice guard. A draftRev bug, by contrast, would fail intermittently or after external edits — not with this clockwork "exactly the first paste works" pattern. The clean, reproducible first-success/later-failure split is the fingerprint of a coordinate-space mismatch that is masked at offset 0.

---

## 2. Why × turns the chip into `unavailable` instead of removing it

### The removal path, step by step

1. The dock chip's × calls `remove(sessionId, occurrence)` (`plugin-client.js:43`). The `occurrence` comes from the published `InputState.occurrences`, whose `offset`/`length` are **clipboard-text coordinates** (`host-input-contract.ts:14-17`). From the capture: `{ offset: 0, length: 28 }`.
2. The plugin computes `end = occurrence.offset + (occurrence.length ?? 1) = 28` and calls `consumeToken({ kind:'span', span:{ start:0, end:28, draftRev } })` (`plugin-client.js:49-54`).
3. `consumeToken`'s span guard (`host-input-facade.ts:38`) passes — `draftRev` is fresh and `start !== end`. The verb then runs `$replaceDetectSpanWithText(guard.span, '')` (`host-input-facade.ts:41`): it tries to erase **[0, 28) of a 2-unit detectText** → out of range → `applied = false` → returns `false`. The composer chip is never touched.
4. **The plugin never reads the return value** (capture line: "consumeToken(...) returned (not inspected by the plugin code)"). It unconditionally runs `records.delete(occurrence.ref); changed();` (`plugin-client.js:58-59`).

### Why the visible state is exactly "chip stays + label = unavailable"

The dock renders one chip **per occurrence** and looks up plugin bookkeeping by ref (`plugin-client.js:63-65`):

```
const record = records.get(occurrence.ref);
… : record === undefined ? 'unavailable' : humanBytes(record.total);
```

After the click: the host edit failed, so the composer chip (and therefore its occurrence) **still exists** → the dock still renders the chip; but the plugin has deleted its own record → `record === undefined` → the meta label degrades to `unavailable`. The × appears to "half work" because the plugin's bookkeeping and the host's document have been driven out of sync by an unchecked guarded verb. Same coordinate misread as bug 1 — second call site — compounded by fire-and-forget error handling.

---

## 3. Fix direction — what to convert, by what rule, at which call sites

### The rule, derived from the host source (not trial and error)

The host publishes two projections of the same document (`host-input-contract.ts:35-42`):

- `detectText` — "Trigger/TokenSpan coordinate text (chip = one U+FFFC)";
- `clipboardText` — "chip = clipboardText";
- `occurrences` — offsets/lengths in clipboardText coordinates, sorted by offset.

Therefore each occurrence occupies `occurrence.length` units in clipboard space and exactly **1** unit in detect space. For any clipboard offset `p`:

```
detectOffset(p) = p − Σ (o.length − 1)        over all occurrences o with o.offset + o.length ≤ p
```

and a chip's detect-space span is exactly `[detectOffset(o.offset), detectOffset(o.offset) + 1)`.

Since `InputState` does not expose `detectText` directly (`host-input-contract.ts:25-32`: only `draft`, `draftRev`, `occurrences`), the plugin must derive detect coordinates from the snapshot's occurrence list — never from `draft.length` / `occurrence.length` alone.

### Call site 1 — insert (`plugin-client.js:21-32`)

Append-at-end must use the **detect length**, not `draft.length`:

```
const detectEnd = snapshot.draft.length
  - snapshot.occurrences.reduce((acc, o) => acc + (o.length - 1), 0);
input.insertReference(ref, { start: detectEnd, end: detectEnd, draftRev: snapshot.draftRev });
```

(General insertion at a caret: convert the caret's draft offset with the formula above.) The `draftRev` argument is already correct — `draftRev` is the revision the span CAS compares against (`host-input-contract.ts:29`), and the plugin re-reads the snapshot after its own `setDraft` (`plugin-client.js:14-16`). Also: keep the `accepted === false` cleanup, but make the error message name the real rejection (span guard), not only "composer changed".

### Call site 2 — removal (`plugin-client.js:43-59`)

`occurrence.offset`/`length` are clipboard coordinates, so convert before calling the verb — the chip is exactly one detect unit:

```
const before = snapshot.occurrences.filter(o => o.offset < occurrence.offset);
const detectStart = occurrence.offset - before.reduce((acc, o) => acc + (o.length - 1), 0);
const ok = input.consumeToken({ kind:'span',
  span: { start: detectStart, end: detectStart + 1, draftRev: snapshot.draftRev } });
if (ok) { records.delete(occurrence.ref); changed(); }   // never fire-and-forget
else   { /* keep the record; surface a retryable error — no 'unavailable' state */ }
```

The existing comment "removal must span occurrence.length, not one character" is true **in clipboard space only** (e.g., for the `setDraft` fallback, which slices `draft` — that fallback is already coordinate-consistent because `setDraft` consumes clipboard-projection text). For `consumeToken`'s span the truth is the inverse: in detect space the chip is exactly one character.

### One defect class, two repairs

Do not ship the insert fix alone: the same misread lives in the removal path, and the unchecked boolean return is what converts any future guard rejection into corrupt plugin state. Fix the coordinate conversion **and** gate every `records` mutation on the verb's `true`.

---

## 4. Regression test plan (must assert these exact sequences)

**Insert path**

- **T1 · Double paste, empty composer:** paste f1 → assert composer chip + dock chip + occurrence `{offset:0, length:clipboardText.length}`; paste f2 → assert **no toast**, second chip present in both surfaces, two occurrences sorted by offset. Assert the second `insertReference` received `span.start === span.end === draft.length − (len₁ − 1)` (detect length), not `draft.length`.
- **T2 · Paste over non-empty draft:** type text without trailing whitespace → paste → assert separating space and success; paste again → success. Covers the `setDraft` re-snapshot branch (`plugin-client.js:13-16`).
- **T3 · Three pastes:** after each paste, recompute from a fresh snapshot; assert monotonically increasing `draftRev` and three occurrences — guards against caching `detectEnd` across inserts.
- **T4 · Genuine stale revision (negative):** snapshot → external draft mutation → insert → assert `false`, toast shown, **and** `records` entry removed (no leak on the cleanup path).

**Removal path**

- **T5 · Single chip ×:** paste → click × → assert `consumeToken` called with `end − start === 1` (detect span), returned `true`, occurrence list empty, composer chip gone, dock chip gone, `records` empty.
- **T6 · Remove the FIRST of two chips:** paste A, paste B → remove A → assert span `{start:0, end:1}` in detect coordinates; A's chip and dock entry gone; B's chip intact; B's occurrence offset correctly shifted to 0; B's dock label still `humanBytes(total)`.
- **T7 · Remove the SECOND of two chips:** paste A, paste B → remove B → assert `span.start === 1, end === 2` (A's chip collapses B's clipboard offset 30 → detect offset 1); A untouched. This is the case that fatally distinguishes detect from clipboard math.
- **T8 · Forced removal failure (negative):** make `consumeToken` return `false` (bump `draftRev` via a concurrent edit) → click × → assert the `records` entry is **retained**, the chip meta never degrades to `unavailable`, and an error/retry affordance surfaces. This pins the unchecked-return fix.
- **T9 · Interleaved lifecycle:** paste → remove → paste again → the third operation must succeed (proves coordinates are recomputed from the live snapshot each time, not cached).

T1 + T6/T7 are the minimal pair: T1 fails whenever insert spans drift into clipboard space; T6/T7 fail whenever removal spans do; T8 fails whenever the return value is ignored. Together they make both reported bugs impossible to reintroduce silently.

---

## 5. Maintainer's routine: what to check in host source before calling input-machine verbs (guidance)

1. **Which projection the guard slices.** Read the verb body, not just its signature: `insertReference` reads `this.projection.detectText` (`host-input-facade.ts:18`) and its JSDoc states "(detect coordinates)" (`host-input-facade.ts:12`). Whenever the host publishes two projections of one document (`EditorProjection.detectText` vs `clipboardText`, chip = U+FFFC vs chip = clipboardText), find the explicit coordinate-space note for **every field you read and every parameter you pass** — `InputState.draft` and `Occurrence.offset/length` are clipboard space; `TokenSpan` verb arguments are detect space.
2. **What the CAS compares.** Confirm the revision identity (`span.draftRev !== this.rev` vs published `InputState.draftRev`, `host-input-contract.ts:29`) so a `false` return can be attributed to the right guard — and don't let your own error message pre-blame the revision when the span can also reject.
3. **The return-value contract.** Both verbs return `boolean applied`. A guarded verb that is fire-and-forget turns every host-side rejection into silent plugin/host state divergence (the `unavailable` chip). Gate all local bookkeeping on the result.
4. **On every host upgrade, re-read the facade and contract files before assuming the contract held.** For this corridor: the 0.1.2-alpha.2 → 0.1.2-alpha.3 cards (DSH-0.1.2-A3-01 keyed-slot settings capability; DSH-0.1.2-A3-02 SQLite persistence provider removal) do **not** touch the input facade — so on the users' version the contract was unchanged and this defect was plugin-side from the start, not a host regression. (Related input-state surface earlier in the corridor: API-10 keyed chat snapshots in the alpha.2 API ledger.) The trap here was never a version bump — it was reading `InputState` (clipboard space) and feeding `TokenSpan` verbs (detect space) without reading the projection types in between.
5. **Pre-release gate:** add the cheap smoke sequence — paste, paste again, remove first chip, remove remaining chip — against a real host build. It exercises both coordinate conversions and the return-value path in under a minute and would have caught this defect class before either user did.

---

## Evidence index

| Claim | Source |
|---|---|
| Verb spans are detect coordinates; splice on `detectText`; rev CAS | `fixture/host-input-facade.ts` lines 12, 14-27, 36-47 |
| draft/occurrences are clipboard coordinates; chip = U+FFFC vs clipboardText | `fixture/host-input-contract.ts` lines 14-17, 26-31, 36-41 |
| Plugin computes spans from `draft.length` / `occurrence.length`; ignores `consumeToken` return; unconditional `records.delete` | `fixture/plugin-client.js` lines 21-38, 43-59, 63-65 |
| First-paste success, second-paste toast, × → `unavailable`, return value uninspected | `fixture/console-session.txt` lines 4-21 |
| Corridor cards for 0.1.2-alpha.3 (no input-facade change) | skill `references/v0.1.2-alpha.3.md` — DSH-0.1.2-A3-01 / DSH-0.1.2-A3-02 (key points only) |

*Fixture directory verified read-only: analysis performed entirely from reads; no fixture file was modified, no installs or migrations run.*


## Required output (JSON only)
{"decisions":[{"id":"<criterion-id>","verdict":"pass|partial|fail|missing","reason":"short"}],"caps":[{"id":"<cap-id>","triggered":false,"reason":"short"}]}
Every criterion and cap exactly once. pass=full points, partial=half, fail/missing=0; a triggered cap caps the total.