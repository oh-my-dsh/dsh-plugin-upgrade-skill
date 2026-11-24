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
#### FILE: S9-composer-coordinate-trap/diagnosis.md

# S9: one coordinate-contract error explains both symptoms

Mode A, read-only diagnosis of @org/dsh-attach-input v0.2.3 on DSH 0.1.2-alpha.3. The supplied source excerpts and captured reproduction are the evidence; no fixture code, installation, or migration was executed. BENCHMARK-AUTH-v1 authorizes this report.

## 1. Why insertion works once

There are two different projections of the same editor document:

- InputState.draft expands each chip to clipboardText. Occurrence.offset and Occurrence.length use those clipboard-text coordinates (host-input-contract.ts:14–17, 25–31).
- EditorProjection.detectText replaces each chip with exactly one U+FFFC character. TokenSpan uses these detect coordinates (host-input-contract.ts:34–41; host-input-facade.ts:11).

The plugin passes snapshot.draft.length as BOTH span.start and span.end at plugin-client.js:29–30. That is a clipboard-projection end offset, but insertReference consumes a detect-projection span. Its phase guard accepts plain/claimed, its revision CAS compares span.draftRev with this.rev, and its tail lookup and replacement use detectText / $replaceDetectSpanWithNodes (host-input-facade.ts:14–26). Thus the exact error is the span's coordinate currency, not a mismatch between the supplied revision and the current revision. The visible facade does not compare draft.length with a host length explicitly; the actual detect splice helper is omitted. Its documented coordinate contract and the recorded false return explain the failure without inventing an additional guard implementation.

With no existing chips, clipboard and detect text coincide. An empty composer has end offset 0 in both, so the first insertion succeeds. Afterwards the capture reports a 29-unit draft containing a 28-unit attachment projection plus one space. Detect text is now U+FFFC plus a space: length 2. The second insertion requests [29,29) where [2,2) is required. It is outside the detect document and the edit does not apply. The plugin deletes the newly created record and emits its generic “composer changed” toast (plugin-client.js:33–35); that message does not prove a concurrent edit.

The plugin already refreshes its snapshot after every successful insertion (line 37). Refreshing again or retrying the same arithmetic cannot repair this mismatch. Later attempts retain the first chip, hence retain the mismatch and keep failing. The same signature appears on the second item in a multi-item paste. “First works, later fails” is conditional on the existing expanded chips remaining in the composer, not a lifetime limit of one attachment.

## 2. Why × produces unavailable

The remove handler also treats clipboard coordinates as detect coordinates: it computes end = occurrence.offset + occurrence.length and sends that interval to consumeToken(kind: 'span') (plugin-client.js:49–54). A chip's clipboard range may span 28 units, while its detect range spans one. For the captured first chip it sends [0,28), rather than [0,1), into a two-unit detect document.

consumeToken first checks revision equality and nonempty span, then calls $replaceDetectSpanWithText and returns whether the edit applied (host-input-facade.ts:36–43). Correct revision and nonempty span are necessary but do not make a wrong-coordinate range valid. Here the editor chip remains, consistent with the captured failure. In a longer mixed draft, a wrong range can also target unintended text; this is not merely an out-of-bounds problem.

The plugin ignores consumeToken's boolean and unconditionally deletes records[occurrence.ref], then calls changed() (plugin-client.js:58–59). The occurrence still exists in input state, so the dock still renders its chip; records.get(ref) now yields undefined, selecting the literal 'unavailable' metadata branch (lines 62–65). The composer chip is untouched too. Thus both symptoms share the coordinate mistake; unconditional local cleanup adds the visible inconsistent state.

The setDraft fallback is not taken on this host because consumeToken exists. Its string slicing is in clipboard coordinates and must remain so if that fallback is retained. Do not mechanically convert offsets passed to clipboard string slicing. The excerpts do not establish whether setDraft preserves unrelated chip identities; validate that separately or avoid this fallback where unsupported.

## 3. Derived correction and call sites

Each preceding complete occurrence contracts from length L to one detect unit, removing L - 1 units. For a clipboard position p at a text/chip boundary:

    detectOffset(p) = p - sum(o.length - 1 for every o with o.offset + o.length <= p)

Use the current snapshot's complete, sorted occurrence list, including other sources, rather than only this plugin's attachments. Text between chips keeps its length. Preserve the host's string-offset units; do not substitute bytes, code points, or grapheme counts. Positions inside an expanded chip do not correspond to arbitrary editable positions inside the atomic chip: reject or explicitly snap such positions according to the intended operation. The two call sites here only require boundaries.

Insertion: compute detectEnd = snapshot.draft.length - sum(o.length - 1 for all snapshot.occurrences). Pass start = end = detectEnd and draftRev from that same snapshot. Recompute after the whitespace normalization at lines 13–15 and after each accepted item at line 37. Do not hard-code 2 or subtract only one attachment's expansion.

Removal: re-resolve the current occurrence by its stable occurrenceId (and expected source/ref) from the fresh snapshot; do not combine a stale callback occurrence with a fresh revision. If absent, stop safely. Compute start = current.offset - sum(o.length - 1 for occurrences before current); end = start + 1. Equivalently convert both endpoints of the current clipboard range using the boundary rule. This both shifts the start past earlier chips correctly and gives the target chip its one-unit detect width. Changing length to 1 alone fails for chips after another expanded chip.

Check the consumeToken boolean. On false, preserve the record and show a recoverable error; obtain a fresh snapshot before any subsequent user-driven attempt. On true, refresh input state and confirm the intended occurrence disappeared before cleanup. If several occurrences share a ref, retain the record while a live occurrence still depends on it. Keep insertion's existing rollback of a newly created record on rejected insertion. Never bypass revision CAS to hide the defect.

## 4. Regression interaction plan

Run against the actual target host input facade/editor, not solely a mock that accepts every numeric span. At every step assert both composer occurrences and dock metadata, record presence, return values, revision behavior, and unchanged neighboring text.

1. Fresh empty composer → paste A → paste B → paste C, with different clipboard lengths. Assert each insert succeeds, no toast, three unique chips in both surfaces, and all three records retain correct sizes. Capture the second call's detect end (2 for the supplied A plus space), not clipboard end 29. Repeat with several files in one paste to verify per-item snapshot refresh.
2. Fresh composer → paste A → click its dock ×. Assert consumeToken succeeds, the occurrence disappears from both surfaces, and its record is removed only after success. Allow the separator space to remain: the specified chip deletion span does not include it. Paste B afterwards and remove B; repeat to exercise reset/reuse.
3. Type a non-whitespace-ended prefix → paste A → type ordinary text → paste B → paste C. Remove the middle B, then C, then A using each dock ×. Assert only the selected chip disappears each time, intervening text and spaces survive, and all remaining chips retain available metadata. Include another source's chip before the target to catch source-filtered offset conversion. Include a Unicode label/text case and differing clipboard projection lengths.
4. After the first successful paste, force insertion rejection via a real revision change between snapshot and verb invocation. Assert the new record is rolled back, A remains intact, and a subsequent fresh interaction succeeds. Separately force removal CAS rejection: assert false causes no record deletion, no unavailable chip, and no damage; retry via a fresh user interaction and assert successful removal.
5. Capture an occurrence, edit the draft before it, then invoke removal from the old UI callback. Assert current occurrence lookup and current coordinate mapping remove only that identity, or safely decline if it no longer exists. If shared refs are supported, remove one occurrence and assert the others retain their backing record until the last removal.

These tests are a proposed plan, not claimed executions. The supplied capture establishes the broken interaction sequence; the fixture is static and incomplete as an executable application.

## 5. Routine source checks and disposition

Before adopting an input-machine verb, read the exact target-version contract types, projection producer, facade, and splice implementation together. Record the unit and projection of every offset/length, whether spans are half-open, the atomic width of references, revision ownership, accepted phases, boolean failure behavior, and surrounding-space behavior. Distinguish span guards from consumeToken's bare-token branch: only the latter compares against clipboardText.trim() and clears the whole draft (facade:45–47). Never replace targeted removal with that whole-draft path.

The plugin-upgrade skill and its pre-flight UI guidance and troubleshooting reference were read. DSH-0.1.2-A1-28 provides adjacent composer history and recommends checking actual host source, but its textarea/contenteditable migration is not this defect and is not a justification for a DOM workaround. The supplied alpha.3 contract/facade are the decisive evidence.

Completed: both source traces, coordinate derivation, call-site corrections, and regression plan. Pre-existing baseline: not collected (read-only static diagnosis). Skipped: installs, migrations, source edits, lifecycle scripts, builds, and real-host tests; none are needed or authorized for this evidence-pack task. Pending: executing the regression plan and examining full splice internals in the maintainer's target build. Source identity here is the supplied excerpt/capture; installed resolution, Node version, Git SHA, and a broader version corridor are not supplied and are not inferred. Rollback: no fixture changes; only this report was created. No blocker to the requested diagnosis.


## Required output (JSON only)
{"decisions":[{"id":"<criterion-id>","verdict":"pass|partial|fail|missing","reason":"short"}],"caps":[{"id":"<cap-id>","triggered":false,"reason":"short"}]}
Every criterion and cap exactly once. pass=full points, partial=half, fail/missing=0; a triggered cap caps the total.