# S9 · Composer coordinate trap

## Scope and pre-existing baseline

Mode A: read-only compatibility diagnosis, following the supplied plugin-upgrade skill. The user's task authorizes this report, not a migration, installation, or fixture change. All five fixture files and the complete task instruction and skill were read. No fixture code, package scripts, installation, browser reproduction, or external service was executed. No source/configuration changes were made.

Evidence identity: the capture identifies DSH 0.1.2-alpha.3 and @org/dsh-attach-input v0.2.3. These are separate host and plugin versions. The fixture is an anonymized static excerpt, not an installed plugin checkout. Git SHA, working-tree baseline, actual installation source, Node version, manifest, dependency graph, lockfile and profile activation are not established by this evidence. Pre-existing mechanical failures: **not collected** (Mode A, no mechanical suite run). The two captured failures are the subject of this diagnosis, not newly introduced failures.

All relative evidence paths below refer to E:/deepseek-harness/dsh-plugin-upgrade-skill/benchmark/tasks/S9-composer-coordinate-trap/environment/fixture/.

## Completed: one underlying contract misread

Both defects pass **clipboard-text coordinates into verbs whose TokenSpan is in detect-text coordinates**. Revision CAS and coordinate validity are distinct requirements; a fresh draftRev cannot make clipboard offsets valid detect offsets.

The host explicitly publishes two projections in host-input-contract.ts:35–41:

- detectText is the trigger/TokenSpan coordinate text: each chip occupies one U+FFFC character.
- clipboardText expands each chip to its clipboardText string.
- InputState.draft is the expanded clipboard projection (lines 24–29); occurrence.offset and occurrence.length are also clipboard coordinates (lines 14–17, 30–31).

The facade's insertReference span is documented as detect coordinates (host-input-facade.ts:6–12), reads the next character from projection.detectText (line 18), and applies $replaceDetectSpanWithNodes (line 24). consumeToken's span branch similarly calls $replaceDetectSpanWithText (lines 36–43). The bare-token branch instead compares clipboardText.trim() with guard.token (lines 45–46); that is a separate operation, not a reference-removal substitute.

### 1. Why the first paste works and subsequent pastes fail

plugin-client.js:29–31 submits start = end = snapshot.draft.length with the current draftRev. This computes the length of the **expanded clipboard projection**, not the editor's detect projection.

At a fresh empty composer, both projections have length zero. Therefore [0,0) happens to be a valid insertion span. The host inserts one chip and a separating space unless the following detect character is already a space (host-input-facade.ts:18–24). The first paste succeeds and creates an occurrence and plugin record, so both composer and dock chips appear.

The captured first result is draft length 29, with a chip at clipboard offset 0 of clipboard length 28 (console-session.txt:7–9). The corresponding detect text is U+FFFC followed by a space: length **2**. The second paste passes **[29,29)** where the valid append span is **[2,2)**, overshooting by 27. The plugin's preparatory whitespace code does not repair this: the draft already ends in a space, so plugin-client.js:13–16 leaves it alone.

Precisely, the explicit facade rejection guards check phase and revision (host-input-facade.ts:15–17), not equality with draft.length. The subsequent replacement operation interprets/bounds the span in detect coordinates, and its applied result is returned. The replacement helper's implementation is not included, so an exact internal bounds-check expression cannot be quoted. The supplied declaration, facade calls, computed overrun, and captured false result establish the coordinate mismatch without inventing such a guard.

On rejection the plugin deletes only the newly allocated record and throws the generic composer-changed error (plugin-client.js:33–35). No second occurrence exists to render. The error does **not** prove an intervening edit or stale revision; coordinate rejection also returns false. Because the first chip remains, retrying from the same state repeats the mismatch. This explains the first-works/later-fails signature: plain text has identical coordinates in both projections until the first expanded chip appears. It is not a universal claim that insertion must fail forever after any first paste; clearing/removing the chip would eliminate that particular divergence.

### 2. Why × yields unavailable instead of removal

The dock passes an occurrence into remove. plugin-client.js:49–54 computes the clipboard interval [occurrence.offset, occurrence.offset + occurrence.length) and passes it directly to consumeToken as a span. In the captured state this is **[0,28)**, but removing the chip alone requires detect span **[0,1)**. Although start 0 happens to agree in both projections for this first chip, the end is wrong. For later chips, the start also needs conversion because earlier expanded chips shift its clipboard offset.

With current draftRev and a nonempty span, the explicit revision/empty-span guard can pass; the detect replacement still cannot apply the supplied out-of-range interval to the two-character detect document. The capture does not log the returned boolean value, but does show the composer chip remains (console-session.txt:18–20), consistent with this rejected replacement. In a longer document, an unconverted interval could instead target extra content, so the bug is not merely an out-of-bounds edge case.

The plugin ignores the boolean returned by consumeToken, then unconditionally executes records.delete(occurrence.ref) and changed() (plugin-client.js:50–59). The host occurrence still exists and drives the dock chip, but records.get(occurrence.ref) now returns undefined. The dock's rendering expression explicitly chooses 'unavailable' for the missing record (lines 62–65). Thus bookkeeping is removed while the editor reference survives; both visible chips remain and the dock loses the file metadata. These are two symptoms of the same coordinate misread, compounded by unchecked removal success.

## Fix direction (proposed, not applied)

### Derive the conversion from the two host projections

A clipboard occurrence of length L contributes L characters to draft but exactly one character to detectText. Crossing a whole chip therefore subtracts L − 1 from the clipboard position. For a clipboard boundary b outside chip interiors:

    detectBoundary(b) = b − sum(o.length − 1 for each occurrence o
                                with o.offset + o.length <= b)

Use all occurrences in the snapshot, including other plugins' chips, not just SOURCE-owned records. Use the host's JavaScript string coordinate units consistently (the plugin already uses string.length/slice); do not substitute byte lengths, grapheme counts or visual widths. The rule maps chip starts and ends correctly and leaves ordinary text lengths unchanged. An interior position within expanded clipboardText has no distinct editable position inside the atomic chip; do not interpolate or clamp it without an explicit policy. Neither append nor whole-occurrence removal needs interior positions.

### Insert call site

At plugin-client.js:21–32, replace both draft.length span endpoints with:

    detectEnd = snapshot.draft.length
                − sum(o.length − 1 for every occurrence in snapshot.occurrences)
    span = { start: detectEnd, end: detectEnd, draftRev: snapshot.draftRev }

The captured second paste then uses [2,2). Keep the occurrence data, draft and draftRev from the **same** current snapshot. Refresh after any edit, including the preparatory setDraft and each successful insertion in a multi-item paste. The existing line 37 refresh is necessary but insufficient until the endpoints are converted. Retain the newly created record only if insertion succeeds, as the current rejection branch already does.

### Removal call site and bookkeeping

At plugin-client.js:49–54, resolve the selected occurrence in the current snapshot by its stable occurrenceId (host-input-contract.ts:8–9), rather than trusting an occurrence captured before intervening edits. Convert both clipboard boundaries, or equivalently compute:

    detectStart = occurrence.offset
                  − sum(o.length − 1 for occurrences wholly before this occurrence)
    detectEnd = detectStart + 1
    span = { start: detectStart, end: detectEnd, draftRev: snapshot.draftRev }

For the first screenshot this removes [0,1), leaving the host-added separating space unless whitespace cleanup is separately specified. The source comment asserting that removal must span occurrence.length confuses coordinate systems. The host publishes length as required; a default of 1 does not repair the unit mismatch.

Capture consumeToken's boolean. Delete the plugin record and notify the dock only after confirmed editor removal; on false preserve the record and handle/reconcile the failure without reporting a successful deletion. If refs can have several live occurrences, remove only the selected occurrence and retain its record while another occurrence still uses it. The excerpt creates fresh refs on add, but owner-scoped ref and occurrence identity should not be conflated in future behavior.

The legacy fallback at plugin-client.js:55–56 slices snapshot.draft, which is **clipboard** text. Do not feed converted detect endpoints into that string slice. Its original clipboard endpoints select the right textual substring, but setDraft's preservation of other chip nodes/identities is not shown. Prefer the verified span-removal verb; if an older host lacks it, explicitly gate support or investigate a documented chip-preserving API. Do not silently use whole-draft replacement and claim it preserves remaining attachments. Similarly, audit the preparatory setDraft whitespace path when references already exist; its node-preservation behavior is outside these excerpts.

## Regression test plan

These are proposed assertions, not tests executed in this read-only task. Run projection/unit tests and integration tests against a real mounted target-host input machine; a permissive mock accepting arbitrary spans would hide the defect.

1. **Exact two-paste reproduction:** start with an empty composer, paste screenshot.png, assert one occurrence, one ready record and both chips. Assert clipboard length 29 versus detect length 2. Paste another screenshot.png, assert the submitted append span is [2,2) at the current revision, no error toast, two distinct refs/occurrences, two ready records and both chips in each surface. Paste a third file to verify accumulation rather than a one-time special case.
2. **Same-call repetition:** paste two or three clipboard files in one items batch. Assert every iteration refreshes the snapshot and uses its converted end/revision, and every item appears exactly once. Include different clipboardText lengths so a fixed subtraction cannot pass.
3. **Original × reproduction:** from a fresh composer, paste one file and click its dock ×. Assert the submitted removal span is [0,1), consumeToken succeeds, the occurrence and both visible chips disappear, and the record is removed. The dock must never render unavailable as the result of a failed removal being treated as success. Assert the separator policy separately; do not assume the whole draft becomes empty.
4. **Multiple-chip removal in both orders:** paste A then B with different clipboard lengths. In one run remove B first (its start needs conversion), verify A and its ready record remain, then remove A. In another remove A first, verify B and all surrounding text survive, then remove B using its updated position. Assert occurrence identities and records throughout, not just chip counts. Repeat with three chips and remove the middle one to expose over-deletion.
5. **Text and other sources:** start with ordinary text without a trailing space, paste A; type text after it, paste B; include an independently inserted chip from another source. Assert appending occurs at the true detect end and removals preserve surrounding text and foreign chips. Exercise both an existing trailing space and no trailing space. Include Unicode text and varying clipboard forms while comparing the same string units as the host.
6. **Failure atomicity and stale views:** force a revision change between snapshot and insertion/removal, and separately return false from the span verb. Rejected insertion leaves no orphan newly allocated record. Rejected removal keeps the existing record and chip metadata, never unavailable. Re-render after intervening edits, click an older rendered occurrence, and verify identity-based re-resolution selects only the current intended chip or safely declines. No blind repeat with stale endpoints.
7. **Recovery/lifecycle sequence:** paste A, remove A, then paste B and C and remove both. Assert fresh refs and no stale records, broken spans or duplicate chips. If shared refs are supported, remove one of two occurrences and verify the surviving occurrence retains usable metadata.
8. **Fallback policy:** simulate a host without consumeToken. Assert explicit unsupported behavior leaves editor/records intact, or, if a separately verified compatible API is supplied, test preservation of all remaining chip nodes and identities. Do not bless a lossy setDraft fallback with text-only assertions.

## Routine host-source checks before release

Trace every input verb from its public types/JSDoc through the facade guards to the actual editor splice helper. Record the coordinate projection of every endpoint, the chip width in that projection, valid boundaries, revision CAS, phase restrictions, return semantics and separator behavior. Contrast draft/occurrence coordinates with TokenSpan coordinates instead of assuming all numeric offsets are interchangeable. Inspect snapshot update timing and stable occurrence identity, and treat a false return as a failed edit before changing plugin-owned state. For any whole-draft setter fallback, verify how it reconstructs or preserves nodes. Test a repeated interaction and removal after earlier chips shift offsets, not just the empty-composer happy path.

## Skipped

No migration or dynamic Cordis plugin was created: this is a static read-only diagnosis, not a request for runtime extension. No update target or host upgrade was proposed. Dependency installation, composition editing, mechanical build/typecheck, profile cold-start, package packing, browser mount and external source lookup were inapplicable or prohibited by task scope. A narrow search of skill references for detectText, detect coordinates, U+FFFC, TokenSpan and clipboardText found no matching card; no unrelated version corridor was treated as authority. The supplied target-host excerpts provide the primary coordinate evidence.

## Pending / residual risk

The actual replacement helper implementation, full TokenSpan declarations, setDraft implementation, runtime installation and full plugin lifecycle are absent. Bounds rejection is supported by the observed false insertion and stated detect splice semantics, but its exact helper implementation was not reproduced. The removal return value was explicitly not captured. Proposed fixes and test sequences have not been applied or executed; no runtime, platform or dependency validation is claimed.

## Rollback

No fixture/source/config/dependency paths changed, so there is no migration to roll back. Only the requested report was written outside the fixture and benchmark repository. No Git or dependency rollback baseline is asserted for this static evidence pack. A future approved implementation should record its real checkout/version, lockfile and owned configuration before changes and roll back only those owned paths.

## Recommendations

Implement one shared, snapshot-based clipboard-boundary-to-detect conversion helper with explicit boundary tests, use it at both span call sites, and make plugin record deletion conditional on successful editor removal. Prefer an authoritative public host conversion/removal seam if one exists in the exact supported release; the fixture does not establish such an API, so no invented method is recommended. Keep this compatibility fix and the plugin's own eventual SemVer decision separate from the DSH host version.
