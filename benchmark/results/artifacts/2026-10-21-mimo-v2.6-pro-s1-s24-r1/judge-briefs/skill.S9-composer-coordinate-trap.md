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

# S9 — Composer Coordinate Trap: root-cause report

Target: community plugin **@org/dsh-attach-input v0.2.3** against **DSH 0.1.2-alpha.3**.
Evidence consulted (read-only fixture, byte-unchanged): **plugin-client.js** (insert + remove + dock render excerpt), **console-session.txt** (reproduction capture), **host-input-facade.ts** (input verbs + guards), **host-input-contract.ts** (InputState / Occurrence / EditorProjection types).

## 0. Summary — one defect, two symptoms

Both reported symptoms are one contract misread: **the plugin computes span coordinates in the clipboard-text projection, while the host verbs interpret every span in the detect projection.** Per the published contract (host-input-contract.ts):

- **InputState.draft** — "Clipboard-text projection of the editor document (chips expanded to their clipboard form)"; **Occurrence.offset/length** — "Offset/Length in the clipboard-text projection". A chip is as wide as its full clipboardText here: "[attachment: screenshot.png]" = **28 chars** (the capture: occurrence {offset:0, length:28}, draft length 29 = 28 + separator).
- **EditorProjection.detectText** — "Trigger/TokenSpan coordinate text (chip = one U+FFFC)": a chip is exactly **1 char** here.

So the same chip is 28 characters wide in the coordinate system the plugin computes and 1 character wide in the coordinate system the host guards and splices. A secondary contract miss amplifies symptom 2: both facade verbs **return a boolean meaning "did the edit apply"**, and the removal path ignores that boolean and advances its own bookkeeping anyway.

## 1. Why the FIRST paste succeeds and every later paste fails with the toast

**The exact mismatch.** In plugin-client.js, add() builds the span from the InputState snapshot:

~~~
start: snapshot.draft.length, end: snapshot.draft.length, draftRev: snapshot.draftRev
~~~

snapshot.draft is the **clipboard-text projection** (contract wording above) — chips count as their full clipboardText. But host-input-facade.ts documents the parameter as "**@param span — pick-time span snapshot (detect coordinates)**" and uses it against the detect projection both for the tail check (this.projection.detectText.slice(span.end, span.end + 1)) and for the edit itself ($replaceDetectSpanWithNodes(span, nodes), which "splice[s] the DETECT text"). detectText is the projection where a chip is one U+FFFC.

So the plugin feeds **draft/clipboard offsets** into a **TokenSpan (detect offsets)** parameter. Note what is *not* wrong: draftRev is the correct CAS currency ("Monotonic editor revision (span CAS compares against this)") and in both captured pastes the snapshot is fresh, so **the revision guard passes** — the toast names the one guard that actually passed and hides the one that failed (the offset no longer sits inside the detect document).

**Numeric trace from the capture.**

- Paste #1, chip-free composer: draft "" (len 0) and detectText "" (len 0) coincide, so the computed span {0,0} is accidentally correct in *both* systems. The tail peek yields no trailing space, so the facade inserts [chip, " "]. Result: draft = "[attachment: screenshot.png] " (29 = 28 + 1), detectText = "U+FFFC + space" (2), occurrence {0,28}. Matches the capture exactly → OK.
- Paste #2: snapshot.draft.length = 29 → span {start:29, end:29, draftRev: fresh}. The detect document is 2 characters ("U+FFFC + space"). detectText.slice(29,30) = "" and the splice target [29,29) lies outside the detect document, so $replaceDetectSpanWithNodes cannot apply the edit ("returns whether the edit applied" — the capture shows it returned false), insertReference returns false, add() rolls back the record and throws "The DSH composer changed before the attachment could be inserted".

**Why "first works, later fails" is the signature of this mismatch (and not of a stale-revision race).**

1. Chips are the *only* construct in which the two projections differ. On a chip-free document detectText equals clipboardText character-for-character, so the wrong-coordinate number is accidentally right — any first operation on a chip-free document succeeds (including a first paste after plain typed text).
2. Each inserted chip widens the gap by exactly occurrence.length − 1 characters (28 − 1 = 27 here; the separator space is a real character in both projections). The offset error is therefore **deterministic and monotonic in the chip count**: computed end − true detect end = Σ(occurrence.length − 1) = 27 × chips present. Every insert after the first chip overshoots the detect document by more, so the splice can never apply again → "every later paste fails".
3. A stale-draftRev race would fail intermittently and could equally fail the very first paste; here draftRev is fresh in both captured calls and the failure is precisely at the offset the plugin computed. The toast text misattributes a coordinate error to concurrency — nothing changed between getSnapshot() and insertReference.
4. Corollaries predicted by the code (beyond the capture): a multi-item add([a, b]) fails on item 2 (item 1 already inserted a chip), and the very first add() of a session fails if the composer already holds a chip (restored draft / pick-path chip). The true invariant is "works iff the document is chip-free at call time", which is why it reads as "first works, later fails".

## 2. Why the × click turns the chip into "unavailable" instead of removing it

Removal path trace (plugin-client.js remove()):

1. The occurrence arrives in **clipboard coordinates** (contract: "Offset/Length in the clipboard-text projection"; capture: {offset:0, length:28}).
2. The plugin computes end = occurrence.offset + (occurrence.length ?? 1) = 28 — correct *in clipboard coordinates* (its comment "the removal must span occurrence.length, not one character" is right for the draft text) — and calls consumeToken({kind:'span', span:{start:0, end:28, draftRev: snapshot.draftRev}}).
3. Host consumeToken span guard: "guard.span.draftRev !== this.rev || guard.span.start === guard.span.end" — the fresh rev passes and 0 ≠ 28, so it proceeds to $replaceDetectSpanWithText(guard.span, ''), which splices the **detect** text ("U+FFFC + space", 2 chars) over [0, 28). Again a clipboard-coordinate span against a detect-coordinate splice: the target does not sit inside the detect document, the edit does not apply, applied stays false, and consumeToken **returns false**. The capture confirms the host state never moved: "composer chip still present" and the same occurrence remains in the snapshot.
4. Plugin-side bookkeeping ignores that boolean: records.delete(occurrence.ref); changed(); run **unconditionally**. The host kept the occurrence; the plugin deleted its record.
5. Dock rendering joins occurrences → records (render excerpt: records.get(occurrence.ref); meta = ... : record === undefined ? "unavailable" : humanBytes(record.total)). The dock still enumerates the occurrence, so the chip is **still rendered**, but the lookup is now undefined → the meta label flips to **unavailable**. The composer chip stays because no edit was ever applied.

So symptom 2 is the same coordinate misread (clipboard span sent to a detect splice) plus one aggravating miss: both verbs return "did the edit apply", and remove() treats consumeToken as fire-and-forget, letting the plugin's state race ahead of the host's. Evidence that only the verb boundary conflated the systems: the setDraft fallback right below slices snapshot.draft with clipboard offsets — internally consistent — and the capture's "consumeToken(...) returned (not inspected by the plugin code)" pinpoints the unchecked result.

## 3. Fix direction (rule derived from the host source, not guesswork)

**Conversion rule** (from host-input-contract.ts: detectText is "chip = one U+FFFC"; draft/clipboardText is "chip = clipboardText"; occurrences are "InputState-compatible (clipboardText coordinates)"):

A chip contributes occurrence.length characters to clipboard coordinates but exactly **1** to detect coordinates. For a boundary offset d in clipboard coordinates (a point not strictly inside a chip):

~~~
detect(d) = d − Σ (o.length − 1)   over all occurrences o with o.offset + o.length ≤ d
detectEnd = snapshot.draft.length − Σ (o.length − 1)   over all occurrences
~~~

Prefer reading the very projection the guard consumes — projection.detectText.length (host-input-facade.ts itself reads this.projection.detectText) — over arithmetic; use the formula when only state.getSnapshot() is exposed. draftRev stays as-is: the contract states the span CAS compares against InputState.draftRev, and the plugin already passes a freshly-read snapshot.draftRev.

**Call sites.**

1. **Insert path (add)** — replace "start: snapshot.draft.length, end: snapshot.draft.length" with detect coordinates: start = end = detect(snapshot.draft.length) (equivalently projection.detectText.length), computed **per loop item from the refreshed snapshot** (the snapshot refresh already happens; the conversion must happen after it). Keep draftRev: snapshot.draftRev. Hardening: on false, re-snapshot and retry once (a genuine concurrent change is the only legitimate CAS failure) before toasting, and make the message distinguish "composer changed (CAS)" from "span rejected"; today's text blames the one guard that passed.
2. **Removal path (remove)** — the occurrence is clipboard → detect: start = detect(occurrence.offset), end = start + 1 (equivalently detect(occurrence.offset + occurrence.length); a chip is exactly one U+FFFC). Keep the fresh snapshot.draftRev. The setDraft fallback is already coordinate-consistent and can stay.
3. **Bookkeeping (both paths)** — gate on the verbs' boolean results. remove() must run records.delete(occurrence.ref); changed(); **only when consumeToken(...) returns true**; on false keep the record (chip keeps its size label), take a fresh snapshot, re-locate the occurrence **by ref** (offsets may have shifted), retry once with converted coordinates, then surface a failure toast. add()'s rollback on false is right; only its message overclaims. Keep the invariant records.size === snapshot.occurrences.length after every operation. The "unavailable" render branch may remain as a genuine fallback, but it must not be reachable through the removal path.

Suggested shape: one shared helper used by both call sites — toDetect(snapshot, clipboardOffset) and detectSpanOf(snapshot, occurrence) — plus a dev assertion span.end ≤ detectText.length so a future coordinate slip fails loudly instead of producing this toast.

## 4. Regression test plan

Assert the exact sequences below; a facade spy captures every insertReference/consumeToken span and a toast spy captures the failure string. After **every** step also assert records.size === snapshot.occurrences.length and that no dock chip shows "unavailable" while its record is "ready".

**A. Repeat paste (bug 1).**
1. Fresh session, empty composer → paste A. Assert: dock chip A **and** composer chip A; insertReference span {start:0, end:0} (detect), draftRev = current rev, returns true; snapshot draft = "[attachment: A] ", one occurrence {0, lenA}.
2. No other interaction → paste B. Assert: returns true; both chips for B appear; **no toast**; captured span is {start:2, end:2} — the detect document end, not any draft-length value.
3. Paste C → span {4,4}; continue to 3–5 chips; assert the toast never fires and each captured span equals the detect end at call time.
4. Variant (plain draft): type "hello", paste D → span {6,6}, succeeds.
5. Variant (pre-chipped first call): seed one chip (pick path or restored draft), then run the session's **first** add with item E → must succeed (kills the "first call works" accident).
6. Multi-item: one add(sessionId, [F, G]) → both inserted; the second item's span comes from the post-first-insert snapshot in detect coordinates.

**B. Removal (bug 2).**
1. With chips A and B present → click × on dock chip A. Assert consumeToken guard {kind:'span', span:{start:0, end:1, draftRev:current}} (detect coordinates!), returns true; occurrence A gone from the snapshot; dock chip A fully removed with no "unavailable" meta at any render; record A deleted; chip B and record B intact.
2. Click × on the last chip B → composer empty, dock empty, records empty.
3. Surrounding text: state "x [attachment: A] y [attachment: B]" → × on B then × on A; assert the surviving text is exact ("x [attachment: A] y " after the first removal) — proves offsets are mapped, not literal.
4. Failure path: stub consumeToken → false. Assert: record **not** deleted, dock chip still shows its size label (never "unavailable"), composer chip unchanged, a failure is surfaced, invariant holds.
5. Concurrent edit: mutate the composer between render and × click → remove() re-snapshots, re-finds the occurrence by ref, retries with fresh draftRev and converted coordinates, succeeds; no stale-CAS toast.

**C. Converter unit/property tests.** detect(0) = 0; with occurrence {0,28}: detect(28) = 1, detect(29) = 2; property detect(draft.length) === detectText.length over randomized chip/text states; every occurrence's detect span has length exactly 1.

**D. Toast regression.** "The DSH composer changed before the attachment could be inserted" must **not** fire for the plain two-pastes-in-a-row sequence (A.1–A.3); it may fire only for the injected-CAS case.

## 5. Routine host-source checks before calling input-machine verbs (guidance, unscored)

1. **Read each verb's @param coordinate declaration** — the facade literally says "span — pick-time span snapshot (detect coordinates)"; treat any JSDoc coordinate word as normative.
2. **Read the published type docs for every value you touch**, noting which projection each field lives in and the chip width in each (detectText: chip = one U+FFFC; draft/clipboardText/Occurrence: chip = full clipboardText).
3. **Check the guard lines themselves** — phase whitelist (plain/claimed), CAS currency (draftRev vs this.rev) and which token the CAS compares, and the empty-span rejection (start === end for consumeToken).
4. **Check what the splice splices** ($replaceDetectSpanWithNodes/$replaceDetectSpanWithText splice the DETECT text) — the operative coordinate system is wherever the splice happens, not wherever your data comes from.
5. **Treat the boolean return as part of the contract** — false means the host state did not change; your own bookkeeping must not advance.
6. **Prefer the guard's own projection** (read projection.detectText) over arithmetic mapping; when mapping is unavoidable, derive it from Occurrence.length and unit-test the property detect(draft.length) === detectText.length.
7. **Make failure messages truthful** — distinguish CAS failure from coordinate rejection so the next diagnosis is not sent chasing concurrency.

Skill alignment (plugin-upgrade, Mode A read-only): the 0.1.2-alpha.3 corridor card index (DSH-0.1.2-A3-01, DSH-0.1.2-A3-02) covers settings/persistence only — no input-machine card — so host-input-facade.ts / host-input-contract.ts remain the authoritative sources here; per the skill's discipline the correction rule above is derived from those primary sources (and the observed capture), not from trial and error. Fixture was read-only throughout and is unchanged.

## run-stats

- toolcalls 总数: 12 leaf tool calls (6 read, 1 glob directory listing, 4 write, 1 send_message), issued via 7 run_code invocations
- token 用量: n/a (not exposed by this harness)
- 完成时间: 2026-10-21T06:43:08.617Z (UTC ISO; turn-start sampled clock 2026-10-21T14:31:30+08:00[Asia/Shanghai])


#### FILE: report.md

# S9 — Composer Coordinate Trap: root-cause report

Target: community plugin **@org/dsh-attach-input v0.2.3** against **DSH 0.1.2-alpha.3**.
Evidence consulted (read-only fixture, byte-unchanged): **plugin-client.js** (insert + remove + dock render excerpt), **console-session.txt** (reproduction capture), **host-input-facade.ts** (input verbs + guards), **host-input-contract.ts** (InputState / Occurrence / EditorProjection types).

## 0. Summary — one defect, two symptoms

Both reported symptoms are one contract misread: **the plugin computes span coordinates in the clipboard-text projection, while the host verbs interpret every span in the detect projection.** Per the published contract (host-input-contract.ts):

- **InputState.draft** — "Clipboard-text projection of the editor document (chips expanded to their clipboard form)"; **Occurrence.offset/length** — "Offset/Length in the clipboard-text projection". A chip is as wide as its full clipboardText here: "[attachment: screenshot.png]" = **28 chars** (the capture: occurrence {offset:0, length:28}, draft length 29 = 28 + separator).
- **EditorProjection.detectText** — "Trigger/TokenSpan coordinate text (chip = one U+FFFC)": a chip is exactly **1 char** here.

So the same chip is 28 characters wide in the coordinate system the plugin computes and 1 character wide in the coordinate system the host guards and splices. A secondary contract miss amplifies symptom 2: both facade verbs **return a boolean meaning "did the edit apply"**, and the removal path ignores that boolean and advances its own bookkeeping anyway.

## 1. Why the FIRST paste succeeds and every later paste fails with the toast

**The exact mismatch.** In plugin-client.js, add() builds the span from the InputState snapshot:

~~~
start: snapshot.draft.length, end: snapshot.draft.length, draftRev: snapshot.draftRev
~~~

snapshot.draft is the **clipboard-text projection** (contract wording above) — chips count as their full clipboardText. But host-input-facade.ts documents the parameter as "**@param span — pick-time span snapshot (detect coordinates)**" and uses it against the detect projection both for the tail check (this.projection.detectText.slice(span.end, span.end + 1)) and for the edit itself ($replaceDetectSpanWithNodes(span, nodes), which "splice[s] the DETECT text"). detectText is the projection where a chip is one U+FFFC.

So the plugin feeds **draft/clipboard offsets** into a **TokenSpan (detect offsets)** parameter. Note what is *not* wrong: draftRev is the correct CAS currency ("Monotonic editor revision (span CAS compares against this)") and in both captured pastes the snapshot is fresh, so **the revision guard passes** — the toast names the one guard that actually passed and hides the one that failed (the offset no longer sits inside the detect document).

**Numeric trace from the capture.**

- Paste #1, chip-free composer: draft "" (len 0) and detectText "" (len 0) coincide, so the computed span {0,0} is accidentally correct in *both* systems. The tail peek yields no trailing space, so the facade inserts [chip, " "]. Result: draft = "[attachment: screenshot.png] " (29 = 28 + 1), detectText = "U+FFFC + space" (2), occurrence {0,28}. Matches the capture exactly → OK.
- Paste #2: snapshot.draft.length = 29 → span {start:29, end:29, draftRev: fresh}. The detect document is 2 characters ("U+FFFC + space"). detectText.slice(29,30) = "" and the splice target [29,29) lies outside the detect document, so $replaceDetectSpanWithNodes cannot apply the edit ("returns whether the edit applied" — the capture shows it returned false), insertReference returns false, add() rolls back the record and throws "The DSH composer changed before the attachment could be inserted".

**Why "first works, later fails" is the signature of this mismatch (and not of a stale-revision race).**

1. Chips are the *only* construct in which the two projections differ. On a chip-free document detectText equals clipboardText character-for-character, so the wrong-coordinate number is accidentally right — any first operation on a chip-free document succeeds (including a first paste after plain typed text).
2. Each inserted chip widens the gap by exactly occurrence.length − 1 characters (28 − 1 = 27 here; the separator space is a real character in both projections). The offset error is therefore **deterministic and monotonic in the chip count**: computed end − true detect end = Σ(occurrence.length − 1) = 27 × chips present. Every insert after the first chip overshoots the detect document by more, so the splice can never apply again → "every later paste fails".
3. A stale-draftRev race would fail intermittently and could equally fail the very first paste; here draftRev is fresh in both captured calls and the failure is precisely at the offset the plugin computed. The toast text misattributes a coordinate error to concurrency — nothing changed between getSnapshot() and insertReference.
4. Corollaries predicted by the code (beyond the capture): a multi-item add([a, b]) fails on item 2 (item 1 already inserted a chip), and the very first add() of a session fails if the composer already holds a chip (restored draft / pick-path chip). The true invariant is "works iff the document is chip-free at call time", which is why it reads as "first works, later fails".

## 2. Why the × click turns the chip into "unavailable" instead of removing it

Removal path trace (plugin-client.js remove()):

1. The occurrence arrives in **clipboard coordinates** (contract: "Offset/Length in the clipboard-text projection"; capture: {offset:0, length:28}).
2. The plugin computes end = occurrence.offset + (occurrence.length ?? 1) = 28 — correct *in clipboard coordinates* (its comment "the removal must span occurrence.length, not one character" is right for the draft text) — and calls consumeToken({kind:'span', span:{start:0, end:28, draftRev: snapshot.draftRev}}).
3. Host consumeToken span guard: "guard.span.draftRev !== this.rev || guard.span.start === guard.span.end" — the fresh rev passes and 0 ≠ 28, so it proceeds to $replaceDetectSpanWithText(guard.span, ''), which splices the **detect** text ("U+FFFC + space", 2 chars) over [0, 28). Again a clipboard-coordinate span against a detect-coordinate splice: the target does not sit inside the detect document, the edit does not apply, applied stays false, and consumeToken **returns false**. The capture confirms the host state never moved: "composer chip still present" and the same occurrence remains in the snapshot.
4. Plugin-side bookkeeping ignores that boolean: records.delete(occurrence.ref); changed(); run **unconditionally**. The host kept the occurrence; the plugin deleted its record.
5. Dock rendering joins occurrences → records (render excerpt: records.get(occurrence.ref); meta = ... : record === undefined ? "unavailable" : humanBytes(record.total)). The dock still enumerates the occurrence, so the chip is **still rendered**, but the lookup is now undefined → the meta label flips to **unavailable**. The composer chip stays because no edit was ever applied.

So symptom 2 is the same coordinate misread (clipboard span sent to a detect splice) plus one aggravating miss: both verbs return "did the edit apply", and remove() treats consumeToken as fire-and-forget, letting the plugin's state race ahead of the host's. Evidence that only the verb boundary conflated the systems: the setDraft fallback right below slices snapshot.draft with clipboard offsets — internally consistent — and the capture's "consumeToken(...) returned (not inspected by the plugin code)" pinpoints the unchecked result.

## 3. Fix direction (rule derived from the host source, not guesswork)

**Conversion rule** (from host-input-contract.ts: detectText is "chip = one U+FFFC"; draft/clipboardText is "chip = clipboardText"; occurrences are "InputState-compatible (clipboardText coordinates)"):

A chip contributes occurrence.length characters to clipboard coordinates but exactly **1** to detect coordinates. For a boundary offset d in clipboard coordinates (a point not strictly inside a chip):

~~~
detect(d) = d − Σ (o.length − 1)   over all occurrences o with o.offset + o.length ≤ d
detectEnd = snapshot.draft.length − Σ (o.length − 1)   over all occurrences
~~~

Prefer reading the very projection the guard consumes — projection.detectText.length (host-input-facade.ts itself reads this.projection.detectText) — over arithmetic; use the formula when only state.getSnapshot() is exposed. draftRev stays as-is: the contract states the span CAS compares against InputState.draftRev, and the plugin already passes a freshly-read snapshot.draftRev.

**Call sites.**

1. **Insert path (add)** — replace "start: snapshot.draft.length, end: snapshot.draft.length" with detect coordinates: start = end = detect(snapshot.draft.length) (equivalently projection.detectText.length), computed **per loop item from the refreshed snapshot** (the snapshot refresh already happens; the conversion must happen after it). Keep draftRev: snapshot.draftRev. Hardening: on false, re-snapshot and retry once (a genuine concurrent change is the only legitimate CAS failure) before toasting, and make the message distinguish "composer changed (CAS)" from "span rejected"; today's text blames the one guard that passed.
2. **Removal path (remove)** — the occurrence is clipboard → detect: start = detect(occurrence.offset), end = start + 1 (equivalently detect(occurrence.offset + occurrence.length); a chip is exactly one U+FFFC). Keep the fresh snapshot.draftRev. The setDraft fallback is already coordinate-consistent and can stay.
3. **Bookkeeping (both paths)** — gate on the verbs' boolean results. remove() must run records.delete(occurrence.ref); changed(); **only when consumeToken(...) returns true**; on false keep the record (chip keeps its size label), take a fresh snapshot, re-locate the occurrence **by ref** (offsets may have shifted), retry once with converted coordinates, then surface a failure toast. add()'s rollback on false is right; only its message overclaims. Keep the invariant records.size === snapshot.occurrences.length after every operation. The "unavailable" render branch may remain as a genuine fallback, but it must not be reachable through the removal path.

Suggested shape: one shared helper used by both call sites — toDetect(snapshot, clipboardOffset) and detectSpanOf(snapshot, occurrence) — plus a dev assertion span.end ≤ detectText.length so a future coordinate slip fails loudly instead of producing this toast.

## 4. Regression test plan

Assert the exact sequences below; a facade spy captures every insertReference/consumeToken span and a toast spy captures the failure string. After **every** step also assert records.size === snapshot.occurrences.length and that no dock chip shows "unavailable" while its record is "ready".

**A. Repeat paste (bug 1).**
1. Fresh session, empty composer → paste A. Assert: dock chip A **and** composer chip A; insertReference span {start:0, end:0} (detect), draftRev = current rev, returns true; snapshot draft = "[attachment: A] ", one occurrence {0, lenA}.
2. No other interaction → paste B. Assert: returns true; both chips for B appear; **no toast**; captured span is {start:2, end:2} — the detect document end, not any draft-length value.
3. Paste C → span {4,4}; continue to 3–5 chips; assert the toast never fires and each captured span equals the detect end at call time.
4. Variant (plain draft): type "hello", paste D → span {6,6}, succeeds.
5. Variant (pre-chipped first call): seed one chip (pick path or restored draft), then run the session's **first** add with item E → must succeed (kills the "first call works" accident).
6. Multi-item: one add(sessionId, [F, G]) → both inserted; the second item's span comes from the post-first-insert snapshot in detect coordinates.

**B. Removal (bug 2).**
1. With chips A and B present → click × on dock chip A. Assert consumeToken guard {kind:'span', span:{start:0, end:1, draftRev:current}} (detect coordinates!), returns true; occurrence A gone from the snapshot; dock chip A fully removed with no "unavailable" meta at any render; record A deleted; chip B and record B intact.
2. Click × on the last chip B → composer empty, dock empty, records empty.
3. Surrounding text: state "x [attachment: A] y [attachment: B]" → × on B then × on A; assert the surviving text is exact ("x [attachment: A] y " after the first removal) — proves offsets are mapped, not literal.
4. Failure path: stub consumeToken → false. Assert: record **not** deleted, dock chip still shows its size label (never "unavailable"), composer chip unchanged, a failure is surfaced, invariant holds.
5. Concurrent edit: mutate the composer between render and × click → remove() re-snapshots, re-finds the occurrence by ref, retries with fresh draftRev and converted coordinates, succeeds; no stale-CAS toast.

**C. Converter unit/property tests.** detect(0) = 0; with occurrence {0,28}: detect(28) = 1, detect(29) = 2; property detect(draft.length) === detectText.length over randomized chip/text states; every occurrence's detect span has length exactly 1.

**D. Toast regression.** "The DSH composer changed before the attachment could be inserted" must **not** fire for the plain two-pastes-in-a-row sequence (A.1–A.3); it may fire only for the injected-CAS case.

## 5. Routine host-source checks before calling input-machine verbs (guidance, unscored)

1. **Read each verb's @param coordinate declaration** — the facade literally says "span — pick-time span snapshot (detect coordinates)"; treat any JSDoc coordinate word as normative.
2. **Read the published type docs for every value you touch**, noting which projection each field lives in and the chip width in each (detectText: chip = one U+FFFC; draft/clipboardText/Occurrence: chip = full clipboardText).
3. **Check the guard lines themselves** — phase whitelist (plain/claimed), CAS currency (draftRev vs this.rev) and which token the CAS compares, and the empty-span rejection (start === end for consumeToken).
4. **Check what the splice splices** ($replaceDetectSpanWithNodes/$replaceDetectSpanWithText splice the DETECT text) — the operative coordinate system is wherever the splice happens, not wherever your data comes from.
5. **Treat the boolean return as part of the contract** — false means the host state did not change; your own bookkeeping must not advance.
6. **Prefer the guard's own projection** (read projection.detectText) over arithmetic mapping; when mapping is unavoidable, derive it from Occurrence.length and unit-test the property detect(draft.length) === detectText.length.
7. **Make failure messages truthful** — distinguish CAS failure from coordinate rejection so the next diagnosis is not sent chasing concurrency.

Skill alignment (plugin-upgrade, Mode A read-only): the 0.1.2-alpha.3 corridor card index (DSH-0.1.2-A3-01, DSH-0.1.2-A3-02) covers settings/persistence only — no input-machine card — so host-input-facade.ts / host-input-contract.ts remain the authoritative sources here; per the skill's discipline the correction rule above is derived from those primary sources (and the observed capture), not from trial and error. Fixture was read-only throughout and is unchanged.

## run-stats

- toolcalls 总数: 12 leaf tool calls (6 read, 1 glob directory listing, 4 write, 1 send_message), issued via 7 run_code invocations
- token 用量: n/a (not exposed by this harness)
- 完成时间: 2026-10-21T06:43:08.617Z (UTC ISO; turn-start sampled clock 2026-10-21T14:31:30+08:00[Asia/Shanghai])


#### FILE: tool-transcript.txt

1. read E:\deepseek-harness\dsh-plugin-upgrade-skill\skills\plugin-upgrade\SKILL.md  (run_code #1, tools.read)
2. glob pattern=**/* path=E:\deepseek-harness\dsh-plugin-upgrade-skill\benchmark\results\artifacts\2026-10-21-mimo-v2.6-pro-s1-s24-r1\skill\S9-composer-coordinate-trap  (run_code #2, tools.glob)
3. read E:\deepseek-harness\dsh-plugin-upgrade-skill\benchmark\results\artifacts\2026-10-21-mimo-v2.6-pro-s1-s24-r1\skill\S9-composer-coordinate-trap\fixture\README.md  (run_code #3, tools.read)
4. read E:\deepseek-harness\dsh-plugin-upgrade-skill\benchmark\results\artifacts\2026-10-21-mimo-v2.6-pro-s1-s24-r1\skill\S9-composer-coordinate-trap\fixture\console-session.txt  (run_code #3, tools.read)
5. read E:\deepseek-harness\dsh-plugin-upgrade-skill\benchmark\results\artifacts\2026-10-21-mimo-v2.6-pro-s1-s24-r1\skill\S9-composer-coordinate-trap\fixture\host-input-contract.ts  (run_code #4, tools.read)
6. read E:\deepseek-harness\dsh-plugin-upgrade-skill\benchmark\results\artifacts\2026-10-21-mimo-v2.6-pro-s1-s24-r1\skill\S9-composer-coordinate-trap\fixture\host-input-facade.ts  (run_code #4, tools.read)
7. read E:\deepseek-harness\dsh-plugin-upgrade-skill\benchmark\results\artifacts\2026-10-21-mimo-v2.6-pro-s1-s24-r1\skill\S9-composer-coordinate-trap\fixture\plugin-client.js  (run_code #4, tools.read)
8. write E:\deepseek-harness\dsh-plugin-upgrade-skill\benchmark\results\artifacts\2026-10-21-mimo-v2.6-pro-s1-s24-r1\skill\S9-composer-coordinate-trap\agent-output\S9-composer-coordinate-trap\report.md  (run_code #5, tools.write; new Date() probe for run-stats)
9. write E:\deepseek-harness\dsh-plugin-upgrade-skill\benchmark\results\artifacts\2026-10-21-mimo-v2.6-pro-s1-s24-r1\skill\S9-composer-coordinate-trap\agent-output\report.md  (run_code #5, tools.write; identical fallback copy)
10. send_message agent_id=session-5d3ebe0e-127d-4dc4-a3b9-cb2199b04f8e (S9 result summary)  (run_code #6)
11. write E:\deepseek-harness\dsh-plugin-upgrade-skill\benchmark\results\artifacts\2026-10-21-mimo-v2.6-pro-s1-s24-r1\skill\S9-composer-coordinate-trap\agent-output\tool-transcript.txt  (run_code #7, tools.write)
12. write E:\deepseek-harness\dsh-plugin-upgrade-skill\benchmark\results\artifacts\2026-10-21-mimo-v2.6-pro-s1-s24-r1\skill\S9-composer-coordinate-trap\agent-output\transcript-manifest.txt  (run_code #7, tools.write)


#### FILE: transcript-manifest.txt

R E:\deepseek-harness\dsh-plugin-upgrade-skill\skills\plugin-upgrade\SKILL.md
R E:\deepseek-harness\dsh-plugin-upgrade-skill\benchmark\results\artifacts\2026-10-21-mimo-v2.6-pro-s1-s24-r1\skill\S9-composer-coordinate-trap
R E:\deepseek-harness\dsh-plugin-upgrade-skill\benchmark\results\artifacts\2026-10-21-mimo-v2.6-pro-s1-s24-r1\skill\S9-composer-coordinate-trap\fixture\README.md
R E:\deepseek-harness\dsh-plugin-upgrade-skill\benchmark\results\artifacts\2026-10-21-mimo-v2.6-pro-s1-s24-r1\skill\S9-composer-coordinate-trap\fixture\console-session.txt
R E:\deepseek-harness\dsh-plugin-upgrade-skill\benchmark\results\artifacts\2026-10-21-mimo-v2.6-pro-s1-s24-r1\skill\S9-composer-coordinate-trap\fixture\host-input-contract.ts
R E:\deepseek-harness\dsh-plugin-upgrade-skill\benchmark\results\artifacts\2026-10-21-mimo-v2.6-pro-s1-s24-r1\skill\S9-composer-coordinate-trap\fixture\host-input-facade.ts
R E:\deepseek-harness\dsh-plugin-upgrade-skill\benchmark\results\artifacts\2026-10-21-mimo-v2.6-pro-s1-s24-r1\skill\S9-composer-coordinate-trap\fixture\plugin-client.js
W E:\deepseek-harness\dsh-plugin-upgrade-skill\benchmark\results\artifacts\2026-10-21-mimo-v2.6-pro-s1-s24-r1\skill\S9-composer-coordinate-trap\agent-output\S9-composer-coordinate-trap\report.md
W E:\deepseek-harness\dsh-plugin-upgrade-skill\benchmark\results\artifacts\2026-10-21-mimo-v2.6-pro-s1-s24-r1\skill\S9-composer-coordinate-trap\agent-output\report.md
W E:\deepseek-harness\dsh-plugin-upgrade-skill\benchmark\results\artifacts\2026-10-21-mimo-v2.6-pro-s1-s24-r1\skill\S9-composer-coordinate-trap\agent-output\tool-transcript.txt
W E:\deepseek-harness\dsh-plugin-upgrade-skill\benchmark\results\artifacts\2026-10-21-mimo-v2.6-pro-s1-s24-r1\skill\S9-composer-coordinate-trap\agent-output\transcript-manifest.txt


## Required output (JSON only)
{"decisions":[{"id":"<criterion-id>","verdict":"pass|partial|fail|missing","reason":"short"}],"caps":[{"id":"<cap-id>","triggered":false,"reason":"short"}]}
Every criterion and cap exactly once. pass=full points, partial=half, fail/missing=0; a triggered cap caps the total.