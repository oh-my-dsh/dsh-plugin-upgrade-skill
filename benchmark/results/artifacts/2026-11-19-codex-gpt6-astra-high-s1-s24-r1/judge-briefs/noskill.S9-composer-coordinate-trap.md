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
#### FILE: S9-composer-coordinate-trap/report.md

# S9: Composer coordinate contract diagnosis

## Evidence and scope

This is a static diagnosis of the five provided fixture files for DSH 0.1.2-alpha.3. No fixture was executed or modified, no installation or migration was performed, no network was used, and no skill was loaded. The regression cases below are a proposed plan, not executed tests. The provided facade omits the implementation of the detect-span replacement helpers, so the exact internal out-of-range rejection branch cannot be verified here.

## One contract mismatch explains both symptoms

`host-input-contract.ts` defines `InputState.draft` as clipboard text, and `Occurrence.offset` and `Occurrence.length` as clipboard-text coordinates. A chip expands to its whole `clipboardText` in that projection. In contrast, `EditorProjection.detectText` represents each chip as exactly one U+FFFC character. The facade's `insertReference` accepts a TokenSpan in detect coordinates and calls `$replaceDetectSpanWithNodes`; the span branch of `consumeToken` calls `$replaceDetectSpanWithText` in the same coordinate system.

The plugin supplies clipboard coordinates to both verbs. Its insert endpoints are `snapshot.draft.length`; its removal endpoints are `occurrence.offset` and `occurrence.offset + occurrence.length`. These are not detect coordinates once expanded chips are present.

### First paste versus subsequent pastes

In a fresh empty composer, clipboard and detect coordinates both end at zero. The first insertion uses `[0, 0)`, with the current `draftRev`, and succeeds. The host adds a chip and a separating space. The captured snapshot reports clipboard length 29, with one occurrence at offset 0 of length 28. The detect projection is only U+FFFC plus a space, length 2.

The next paste therefore passes `[29, 29)` where the intended append span is `[2, 2)`. The revision can still be completely current: the plugin takes a fresh snapshot, and the existing space means no `setDraft` is needed in this reproduction. The host checks phase (`plain` or `claimed`) and `span.draftRev === this.rev`, then reads the tail from `projection.detectText` and applies the detect-coordinate replacement. The returned false is reported by the capture; an invalid detect span explains it. The displayed toast is the plugin's generic response to any false return, not proof that the composer changed concurrently.

Precisely, the explicit guard compares the revision with the host's editor revision; it does NOT compare `draft.length` with another length. The coordinate error reaches the detect-span edit helper. The excerpt does not show that helper's bounds check, so claiming a specific explicit facade length guard would overstate the evidence.

The first successful chip makes the two coordinate spaces diverge by 27 in the capture. Later appends remain wrong while that expanded chip exists. This is the characteristic repeat-interaction failure; it is not an assertion that all later pastes must fail after the document is cleared or that a chip with clipboard length one creates the same divergence. Multiple items in one paste have the same problem after the first insertion because the loop refreshes the snapshot but still uses its clipboard length.

### Why the cross produces `unavailable`

`remove()` gets a current snapshot and, in plain phase, computes the captured occurrence's clipboard range `[0, 28)`. With `consumeToken` present it sends that range as a detect span; the intended chip-only detect range is `[0, 1)`.

The span guard rejects stale revisions and empty spans, but neither is the coordinate conversion. Here it proceeds to `$replaceDetectSpanWithText`. The observed result is that the composer chip survives. The log does not record the return value, so it does not directly prove its value; the static flow and unchanged chip are consistent with the invalid edit not applying.

Regardless of the edit's boolean result, the plugin executes `records.delete(occurrence.ref)` and `changed()`. The occurrence still exists in the host document, so the dock continues rendering it. Its lookup now finds no record, selecting the `record === undefined ? 'unavailable'` branch. The in-composer chip retains its cached display label. Thus the failed coordinate edit plus unconditional record deletion explains the complete symptom.

The `setDraft` fallback is a different path: string slicing uses clipboard coordinates, so those endpoints must remain clipboard coordinates there. It is not the captured consumeToken failure path. Its behavior with surviving structured chips cannot be established from the excerpts; do not assume rewriting the clipboard string preserves their identities.

## Fix direction derived from the source

For a valid clipboard boundary p outside chip interiors, map it to detect coordinates by:

    detect(p) = p - sum(o.length - 1 for all occurrences o with o.offset + o.length <= p)

Each preceding complete chip occupies `o.length` clipboard units and exactly one detect unit; ordinary text retains its width. Use the complete current snapshot occurrence list, including chips from other plugins, and the same JavaScript string coordinate units used by `length` and `slice`. Do not filter the conversion to this plugin's records. Interior positions inside an expanded chip have no unique corresponding character boundary; reject them or use a deliberate whole-chip boundary policy. Never scale all offsets by a ratio.

Insert path:

- After any `setDraft`, take a fresh snapshot, as the code already does. Compute the detect end as `snapshot.draft.length - sum(o.length - 1)` over that snapshot's occurrences.
- Pass that value as both start and end to `insertReference`, with that same snapshot's `draftRev`.
- Refresh and recompute after EACH successful item in a multi-item paste. For the captured snapshot, 29 - (28 - 1) = 2.
- Keep rejecting failed edits and rolling back only the newly staged record. Ensure a partially successful batch still refreshes the dock before reporting a later failure.

Removal path:

- Resolve the clicked occurrence in the current snapshot by stable `occurrenceId`, checking source/ref as appropriate, rather than combining stale event offsets with a fresh revision. If it no longer exists, do not blindly remove a record still used elsewhere.
- Compute start = detect(currentOccurrence.offset), then end = start + 1. Equivalently convert BOTH clipboard boundaries; converting the end subtracts this chip's own length-minus-one too. The captured range becomes `[0, 1)`. For a later chip, start must subtract every preceding chip's expansion as well.
- Send this detect span and the same snapshot's revision to `consumeToken`, inspect its boolean return, and delete the record only after a confirmed successful removal. On false, preserve bookkeeping and report or reconcile the unchanged state.
- If multiple occurrences share a ref, retain the backing record until no remaining relevant occurrence uses it. A single occurrence deletion does not necessarily justify deleting shared data.
- Keep clipboard endpoints for any clipboard-string slicing fallback; do not feed converted detect offsets into `draft.slice`. Prefer a supported structured-edit path, and verify fallback preservation semantics before relying on it.

## Regression interaction plan

Use the real host editor or a faithful projection-aware integration fixture; a mock that accepts any span will hide this defect. Assert both projections, revision usage, host occurrences, backing records, dock chips and composer chips.

1. Start empty; paste screenshot A. Assert one record and one chip in each UI, correct size, one occurrence, detect chip plus separator, and an accepted insertion at zero. Paste B, then C in separate events without intervening edits. Assert all succeed, no changed-composer toast, three records and three occurrences/chips, and each insertion span equals the current detect end. Check the second append uses 2 rather than the captured clipboard length 29.
2. Start empty and paste two or more files in ONE event. Assert every file appears, and each iteration uses the post-previous-insertion revision and recalculated detect end. Repeat with pre-existing ordinary text and mixed chips with different clipboard lengths, including another source's chip; check whitespace handling and ordering.
3. Start with A and B, click A's dock cross, then click B's cross. After each click assert exactly the selected occurrence and both corresponding UI chips disappear, its unshared record is deleted, remaining content and sizes are intact, and no `unavailable` ghost appears. Repeat removing B first to exercise a nonzero offset after a preceding expanded chip. Repeat with a single chip at offset zero.
4. Use text before, between, and after multiple chips. Remove a middle chip and assert only its one detect unit is consumed; adjacent text and chips survive. Check clipboard expansion lengths differ, and include Unicode text to catch inconsistent string units. Click a surviving chip after another edit shifts its offset, verifying current occurrence resolution.
5. Paste A, paste B, remove A, paste C, remove B, remove C, then paste again into the resulting document. Assert successful repeated insertion/removal, no ghosts, correct counts/records and no accidental text loss throughout. Separating spaces may remain because removal targets only the chip.
6. Force a genuinely stale revision or a false `consumeToken` result. Assert the host occurrence and record both remain and the dock does not switch to unavailable. Force a failed insertion and assert only its staged record is rolled back. For multi-item partial failure, assert earlier successful chips remain visible and consistent.
7. If shared refs are supported, create two occurrences with one ref, remove one and verify the survivor keeps its metadata; remove the last and verify cleanup. If the fallback is supported, separately test its preservation of remaining chips and records; do not infer this from the consumeToken cases.

These are planned assertions; there is no executed runtime validation in this report.

## Routine source checks before release

Read both the public types and the concrete verb implementation for the target host version. Trace each field's projection and units through to the actual replacement helper; confirm whether positions address clipboard text, detect text, or another representation. Inspect phase and revision guards, return values, chip width/serialization, automatic separators, and structured-edit versus `setDraft` semantics. Keep endpoint calculations and their revision tied to one snapshot. Check occurrence identity and record lifetime separately, and make repeated operations, mixed-source chips and failed-edit bookkeeping part of release regression coverage.

No blocker to the static diagnosis. The omitted helper implementations and absence of an executable host limit exact internal-branch attribution and runtime verification.


## Required output (JSON only)
{"decisions":[{"id":"<criterion-id>","verdict":"pass|partial|fail|missing","reason":"short"}],"caps":[{"id":"<cap-id>","triggered":false,"reason":"short"}]}
Every criterion and cap exactly once. pass=full points, partial=half, fail/missing=0; a triggered cap caps the total.