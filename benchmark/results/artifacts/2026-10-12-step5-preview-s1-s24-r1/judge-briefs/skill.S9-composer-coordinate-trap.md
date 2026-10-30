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
#### FILE: S9-composer-coordinate-trap/S9-composer-coordinate-trap.md

# S9 · Composer Coordinate Trap — Diagnosis Report

**Subject**: `@org/dsh-attach-input` v0.2.3 against DSH `0.1.2-alpha.3`
**Evidence pack (read-only, unmodified)**: `fixture/plugin-client.js`, `fixture/console-session.txt`, `fixture/host-input-facade.ts`, `fixture/host-input-contract.ts`

## TL;DR

Both symptoms are **one contract misread at two call sites**: the plugin hands the host input-machine verbs
(`insertReference`, `consumeToken`) a `TokenSpan` expressed in **clipboardText-projection** coordinates, while the
host's guards compare/splice in **detectText-projection** coordinates (chip = one U+FFFC character).
The insertion path fails because of the raw coordinate mismatch; the removal path fails for the same mismatch **plus**
a plugin-side bookkeeping defect — the plugin deletes its own record without checking whether the host verb actually
applied, which is what renders the chip as `unavailable`.

---

## 1. Why the first paste succeeds and every later paste fails with that toast

### The exact mismatch

- The plugin computes the insertion span from `snapshot.draft.length` (`plugin-client.js:29-30`):
  `{ start: snapshot.draft.length, end: snapshot.draft.length, draftRev: snapshot.draftRev }`.
  Per the published contract, `InputState.draft` is the **clipboardText projection** — "chips expanded to their
  clipboard form" (`host-input-contract.ts:27`).
- The host verb `insertReference(ref, span)` consumes that span as **detectText / TokenSpan coordinates**:
  its JSDoc says `@param span - pick-time span snapshot (detect coordinates)` (`host-input-facade.ts:11`), it slices
  `this.projection.detectText.slice(span.end, span.end + 1)` (`host-input-facade.ts:18`), and it applies the edit via
  `$replaceDetectSpanWithNodes(span, nodes)` (`host-input-facade.ts:24`), a helper that (per the file header comment,
  `host-input-facade.ts:3-4`) "splice[s] the DETECT text".
- The contract makes the two coordinate systems explicit: `EditorProjection.detectText` is
  "Trigger/TokenSpan coordinate text (chip = one U+FFFC)" (`host-input-contract.ts:37`), while `clipboardText` is
  "Persistence/InputState draft text (chip = clipboardText)" (`host-input-contract.ts:39`), and
  `occurrences` are published in "clipboardText coordinates" (`host-input-contract.ts:41, 14-17`).

**The mismatch: the plugin passes a clipboardText offset (`draft.length`) into a verb whose guard compares and splices
at the same numeric offset in detectText.**

### Which guard actually rejects paste #2

`insertReference` has three sequential checks (`host-input-facade.ts:14-27`): phase (`plain`/`claimed`), the
`span.draftRev !== this.rev` CAS, and the splice's `applied` result.

- The rev CAS **passes**: `add` re-reads a fresh snapshot at entry (`plugin-client.js:11`), nothing writes between that
  read and the call, and the capture shows a 24-second idle gap — not a race.
- The splice **fails**: after paste #1 the state is (per `console-session.txt:8-9`)
  `draft = "[attachment: screenshot.png] "` (29 chars) with one occurrence `{offset: 0, length: 28}`. Therefore
  `detectText` is 2 characters long (one U+FFFC + the separating space). Paste #2 computes
  `start = end = snapshot.draft.length = 29` and hands it to the host, which treats 29 as a **detectText** offset
  into a 2-character text. `$replaceDetectSpanWithNodes` cannot apply a splice at offset 29 of a 2-char document, so
  `applied` stays `false` and the verb returns `false` (`host-input-facade.ts:24-26`). The plugin's generic handling of
  `accepted === false` (`plugin-client.js:33-36`) throws the toast
  `The DSH composer changed before the attachment could be inserted` — even though nothing changed.

### Why "first works, later fails" is the signature of this mismatch

The two projections **coincide only at offset 0 of a composer that contains no chips**. On an empty composer,
`draft.length === detectText.length === 0`, so paste #1's span `{0,0}` is valid in both systems and the insert applies.
From that moment on the projections diverge permanently and cumulatively: every chip contributes **1** character to
detectText but **`clipboardText.length`** characters to the draft. Each successful paste therefore widens the plugin's
computed offset by `clipboardText.length − 1` (27 per screenshot chip, here). Paste #2 overshoots the real detectText
end by exactly 27 characters (`29` vs `2`); had paste #2 landed, paste #3 would overshoot by 56 — the gap grows by 27
per prior successful insertion.

That is the fingerprint: the failure is **deterministic, order-dependent, and worsening with each prior insertion** —
not timing-dependent. A genuine "composer changed" race would fail whenever *something* actually rewrote the draft
between snapshot and insert (rare, non-monotonic). A coordinate misread fails exactly on "the first operation after any
chip exists." The misleading toast text is itself part of the defect: the plugin maps every `false` to a concurrency
story, hiding the real cause.

---

## 2. Why the × click turns the chip into `unavailable` instead of removing it

### Trace of the removal path

1. `remove(sessionId, occurrence)` (`plugin-client.js:43-60`) reads a fresh snapshot and computes
   `end = occurrence.offset + (occurrence.length ?? 1)` (`plugin-client.js:49`).
   Per the contract, `occurrence.offset` is the "Offset in the clipboard-text projection" and `occurrence.length` the
   "Length in the clipboard-text projection" (`host-input-contract.ts:14-17`) — i.e. this is a **clipboardText-space**
   range. The inline comment at `plugin-client.js:47-48` ("span occurrence.length, not one character") is correct for
   clipboardText and wrong for the verb it is about to call.
2. It calls `input.consumeToken({ kind: 'span', span: { start: occurrence.offset, end, draftRev: snapshot.draftRev } })`
   (`plugin-client.js:50-54`). The host's span guard (`host-input-facade.ts:36-44`) passes the span straight into
   `$replaceDetectSpanWithText(guard.span, '')` (`host-input-facade.ts:41`), which **splices the detectText**. So the
   span must be a detectText range — but it is a clipboardText range.
3. For the captured session the occurrence is `{offset: 0, length: 28}` (`console-session.txt:9`), while the chip's true
   detectText span is `[0, 1)` (one U+FFFC in a 2-char detectText). The plugin sends `[0, 28)`. The span is non-empty
   and the rev matches, so the guard proceeds — but `$replaceDetectSpanWithText` cannot splice a 28-wide range into a
   2-character detectText and returns without applying. `consumeToken` returns `false`, **the composer chip is never
   removed** (`console-session.txt:20`). This is the same coordinate misread as the insert path, read in reverse.
4. **Plugin-side bookkeeping defect (the second half of this bug):** the plugin never inspects
   `consumeToken`'s return value (`console-session.txt:18` explicitly notes "not inspected by the plugin code") and
   unconditionally executes `records.delete(occurrence.ref)` (`plugin-client.js:58`) followed by `changed()`
   (`plugin-client.js:59`).
5. The dock render is driven by the **host's** occurrences (the chip is still in the composer), while the record lookup
   is **plugin-side** and is now empty. The render excerpt resolves `record === undefined` to the literal
   `'unavailable'` meta (`plugin-client.js:63-65`). Hence: chip stays in the composer, dock row cannot disappear
   (occurrence-driven), record is gone (deleted without confirmation) → meta flips to `unavailable`.

So the × symptom is the composite of (a) the same detect/clipboard coordinate misread making the host removal a no-op,
and (b) the plugin mutating its own bookkeeping without the verb's boolean confirmation. Note the
`else` fallback branch (`plugin-client.js:55-57`) slices `snapshot.draft` — clipboard-consistent for raw text — but it
bypasses the input machine entirely; on this tag `consumeToken` exists (`host-input-facade.ts:36`), so the buggy
detect-coordinate path is what runs, and "fixing" the removal by switching to the fallback would be the wrong cure.

---

## 3. Fix direction

### The rule, derived from the host source

From `host-input-contract.ts:37` and `host-input-facade.ts:3-4, 11, 18, 24, 41`: **every offset/length handed to
`insertReference` or `consumeToken` (as a `TokenSpan` / span guard) is a detectText coordinate, where each chip is
exactly one U+FFFC.** `InputState.draft`, `occurrence.offset`, and `occurrence.length` are clipboardText coordinates
(`host-input-contract.ts:14-17, 27, 41`). Therefore the conversion the plugin must implement, using only the published
snapshot (`draft`, `draftRev`, `occurrences` — sorted by offset, `host-input-contract.ts:30-32`):

- **clipboardText offset → detectText offset**: for an insertion/caret point `p`,
  `detectOffset(p) = p − Σ over occurrences whose range ends at or before p of (occurrence.length − 1)`.
  (Plugins only ever insert at the end of the draft, where this reduces to
  `detectEnd = draft.length − Σ(occurrence.length − 1)`.)
- **a whole-occurrence removal**: the chip's detectText span is **always `[d, d + 1)`** — one character, regardless of
  its clipboardText length — where `d = occurrence.offset − Σ over occurrences entirely before it of (occurrence.length − 1)`.

### Call sites

1. **Insert path** (`plugin-client.js:29-30`): replace `start: snapshot.draft.length, end: snapshot.draft.length` with
   `start = end = detectOffset(snapshot.draft.length)` computed from `snapshot.occurrences` via the prefix-sum rule
   above. The existing per-item snapshot refresh (`plugin-client.js:37`) then keeps multi-item pastes correct
   automatically, because the refreshed snapshot re-lists the just-inserted occurrence. The host's tail check
   (`host-input-facade.ts:18-23`) will then correctly decide the trailing separator space.
2. **Removal path** (`plugin-client.js:49-54`): pass `{ start: d, end: d + 1 }` where `d` is the converted detectText
   start of that occurrence. Drop both `occurrence.length` and the `?? 1` fallback from the *span* computation — in
   detectText an occurrence is always one character.
3. **Bookkeeping on removal** (`plugin-client.js:58-59`): condition the local mutation on the verb's result. Only
   `records.delete(occurrence.ref); changed()` when `consumeToken` returned `true`. On `false`, keep the record (the
   dock keeps showing the real size), re-read the snapshot, and surface an explicit error — the dock must never flip to
   `unavailable` because of unconfirmed local state.
4. **Single shared helper**: implement one `toDetectOffset(snapshot, clipboardOffset)` (and an
   `occurrenceDetectSpan(snapshot, occurrence)`) used by both paths, so the conversion is written and tested once.
   Never mix projections inside one call.
5. **Do not** "fix" the removal by routing to the `setDraft` fallback (`plugin-client.js:55-57`): that path deletes the
   chip's text but bypasses the input machine. Keep it only as a pre-`consumeToken` compatibility branch.
6. On the insert path, also stop attributing every `false` to staleness: after the fix, a `false` can only mean the
   phase guard, the rev CAS, or a host-side splice failure; the error copy should distinguish "composer changed"
   (rev) from the other cases, so a future coordinate regression cannot hide behind the same toast again.

---

## 4. Regression test plan

Assert against the facade verbs with spies/fakes that record the exact spans handed over, plus the published
`InputState` after each step. All sequences run in one session, no reloads.

**Insert path**

- **T1 — minimal repro of the reported bug**: fresh empty composer → paste one screenshot. Assert `insertReference`
  returned `true`; spy recorded span `{start: 0, end: 0}`; dock has 1 chip; snapshot:
  `draft = "[attachment: screenshot.png] "`, `occurrences = [{offset: 0, length: 28}]`.
- **T2 — repeat paste (the regression anchor)**: without reload, paste a second screenshot. Assert `insertReference`
  returned `true` — **no toast**; the spy recorded `{start: 2, end: 2}` (detectText end, not `draft.length = 29`);
  2 dock chips; 2 composer chips; second occurrence `{offset: 29, length: 28}` in clipboardText space.
- **T3 — N pastes and multi-item paste**: paste files 3 and 4 individually, then one paste event carrying two files in
  one `items` array. All succeed; each recorded span equals the current detectText length (3, 4, then 5 and 6);
  occurrence count grows 1→4→5 with no toast or missing chip.
- **T4 — non-empty plain draft branch** (exercises `plugin-client.js:13-16`): set draft `hello` → paste. Assert the
  separating space was appended, insert recorded at detect offset 6, success; paste again → success at detect offset 7.
- **T5 — rev CAS must survive the fix**: bump `draftRev` between snapshot and `insertReference` (simulated concurrent
  edit). Assert the verb still returns `false` and the plugin still raises the composer-changed error — proving the
  coordinate fix did not weaken the staleness guard.

**Removal path**

- **T6 — minimal repro of the reported bug**: after T1, click ×. Assert `consumeToken` returned `true`; the recorded
  span was the chip's detectText range `{start: 0, end: 1}`; afterwards `draft === ""`, `occurrences` is empty,
  `records` no longer holds the ref; dock row and composer chip are both gone; **the meta never rendered
  `unavailable` at any intermediate render**.
- **T7 — order-sensitive removal**: after T1+T2 (occurrences `[{offset: 0, length: 28}, {offset: 29, length: 28}]`,
  detectText length 4), run both removal orders. *First-then-second*: remove chip 1 with span `{start: 0, end: 1}`;
  the surviving occurrence is re-published at offset 0 with the dock still showing one row at the real byte size
  (not `unavailable`); then remove it — success, composer empty. *Second-with-first-alive* (the prefix-sum case):
  in a fresh T1+T2 state, remove the **second** chip — the span must be `{start: 2, end: 3}` (detect start
  `d = 29 − (28 − 1) = 2`), **not** the clipboardText range `[29, 57)` the current code sends; assert the first chip
  survives untouched and the dock keeps exactly one row.
- **T8 — failed-removal bookkeeping (anti-`unavailable` guard)**: bump `draftRev` between snapshot and `consumeToken`.
  Assert it returns `false`; assert the plugin kept the record (dock still shows the real size, never `unavailable`),
  keeps the composer chip, and surfaces an explicit error instead of silently desyncing.
- **T9 — invariant property test**: randomized sequence of pastes and removals (seeded). After every step assert:
  (a) `detectText === clipboardText` with each occurrence's `[offset, offset+length)` collapsed to one U+FFFC;
  (b) every span handed to either verb lay within `[0, detectText.length]`; (c) `#dock rows === #occurrences ===
  #records`; (d) every dock row's meta resolved to a real record — i.e. the string `unavailable` never appears.

T2, T6, T7, T8 are the load-bearing anchors for the two reported bugs; T4/T5/T9 close the adjacent holes the same
misread leaves open.

---

## 5. Maintainer routine: what to check in the host source before calling input-machine verbs

(Completeness guidance — not scored.)

1. **Read the verb implementation at the exact target tag, not its name or the changelog.** In
   `host-input-facade.ts` the decisive evidence is three lines of code — which projection the helper splices
   (`detectText`), which text the guard slices/splices with the span, and what the boolean `applied` means — none of
   which the verb name or the `TokenSpan` type (plain numbers) reveals.
2. **For every numeric parameter, identify its projection** before use: `TokenSpan`/span guards here are
   **detectText** coordinates; `InputState.draft`, `occurrence.offset`, `occurrence.length` are **clipboardText**
   coordinates (`host-input-contract.ts:14-17, 27, 30-32, 37-42`). The cardinality rule ("chip = one U+FFFC" vs
   "chip = clipboardText") is the conversion contract.
3. **Treat a verb's boolean return as the authority for plugin-side state.** Never delete local bookkeeping that
   mirrors host state without the verb confirming (`plugin-client.js:58` ignored it); reconcile from the published
   snapshot after each verb instead.
4. **Verify at runtime, not only by typecheck.** Coordinate systems are invisible to TypeScript (both are `number`),
   and composer-adjacent surfaces churn without client API changes (cf. DSH-0.1.3-A1-08, v0.1.2-alpha.3 corridor
   review). A two-paste-then-remove sequence in a real session is the minimum smoke for any input-machine caller.
5. **Re-read the host excerpt whenever the DSH cohort moves** — the contract file and the facade are the seam; a
   migration card may not card an unchanged-looking verb's coordinate semantics.

---

### Evidence map

| Claim | Source |
|---|---|
| draft/occurrences are clipboardText coordinates | `host-input-contract.ts:14-17, 27, 30-32, 41` |
| detectText = TokenSpan coordinates, chip = one U+FFFC | `host-input-contract.ts:37` |
| verbs splice detectText; span is detect coordinates | `host-input-facade.ts:3-4, 11, 18, 24, 41` |
| insert guard: phase, rev CAS, splice `applied` | `host-input-facade.ts:14-27` |
| consume-token span guard: rev CAS, non-empty, splice | `host-input-facade.ts:36-44` |
| paste #1 state: draft len 29, occurrence [0,28) | `console-session.txt:8-9` |
| paste #2 span computed as `draft.length` → rejected | `plugin-client.js:29-30` vs `host-input-facade.ts:18, 24` |
| toast raised on any `false` | `plugin-client.js:33-36` |
| removal sends clipboardText span; return ignored; record deleted | `plugin-client.js:49-59` |
| dock renders `unavailable` when record lookup misses | `plugin-client.js:63-65` |
| consumeToken return not inspected | `console-session.txt:18` |

**Fixture integrity**: only read; nothing under `fixture/` was modified. No code was executed; this report is the sole
artifact produced, at `agent-output/S9-composer-coordinate-trap/S9-composer-coordinate-trap.md`.


## Required output (JSON only)
{"decisions":[{"id":"<criterion-id>","verdict":"pass|partial|fail|missing","reason":"short"}],"caps":[{"id":"<cap-id>","triggered":false,"reason":"short"}]}
Every criterion and cap exactly once. pass=full points, partial=half, fail/missing=0; a triggered cap caps the total.