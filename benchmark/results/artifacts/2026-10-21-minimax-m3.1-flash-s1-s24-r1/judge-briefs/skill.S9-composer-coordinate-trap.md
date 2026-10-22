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
#### FILE: S9-composer-coordinate-trap/S9-composer-coordinate-trap-report.md

# S9 · Composer Coordinate Trap — diagnosis report

**Subject:** `@org/dsh-attach-input` v0.2.3 (client half) against DSH host `0.1.2-alpha.3`
**Mode:** A · inspect (read-only). No fixture, skill, or host file was modified.
**Evidence base (this report is derived only from these):**

| Fixture file | What it proves |
|---|---|
| `fixture/plugin-client.js` | the plugin's insert path (`add`) and removal path (`remove`) + the dock-chip rendering excerpt |
| `fixture/host-input-facade.ts` | the host verbs `insertReference(ref, span)` and `consumeToken(guard)` and their guards/splices |
| `fixture/host-input-contract.ts` | the published contract: `InputState` (clipboard projection), `EditorProjection` (detect text vs clipboard text vs occurrences) |
| `fixture/console-session.txt` | the capture: paste #1 OK, paste #2 toast, × click → `unavailable` |

---

## 0. Root cause in one line

**The plugin speaks the *clipboard-text* coordinate space; the host verbs speak the *detect-text* coordinate space.** Every span the plugin hands to `insertReference` / `consumeToken` is expressed in `InputState.draft` / `Occurrence.offset|length` units, while the host guards and splices those spans against `EditorProjection.detectText`, where a chip is **exactly one U+FFFC character**. Both user-visible bugs are the same misread; the second one is only shaped differently because the plugin discards the verb's return value.

The revision (`draftRev`) is **not** the mismatch — it is the one value shared by both spaces (see §3.1).

---

## 1. Why paste #1 succeeds and every later paste fails

### 1.1 The two projections the host maintains

From `host-input-contract.ts`:

* `EditorProjection.detectText` — *"Trigger/TokenSpan coordinate text (chip = one U+FFFC)"*.
* `EditorProjection.clipboardText` / `InputState.draft` — *"Clipboard-text projection of the editor document (chips expanded to their clipboard form)"*.
* `InputState.occurrences[].offset|length` — *"Offset/Length in the clipboard-text projection; the occurrence occupies exactly [offset, offset+length)"*.

So one chip is **28 characters** in the clipboard space and **1 character** in the detect space. The two documents have different lengths and different offsets for the same editor content.

From `host-input-facade.ts`, the verbs are *detect-space only*:

* `insertReference(ref, span)` — the doc comment says *"@param span - pick-time span snapshot (**detect coordinates**)"*; the body reads `this.projection.detectText.slice(span.end, span.end + 1)` and splices via `$replaceDetectSpanWithNodes(span, nodes)` ("splice the DETECT text").
* `consumeToken({kind:'span', span})` — splices via `$replaceDetectSpanWithText(guard.span, '')`, again over the DETECT text.

### 1.2 What the plugin computes

`plugin-client.js`, insert path:

```js
const snapshot = input.state.getSnapshot();      // InputState → CLIPBOARD space
...
const accepted = input.insertReference({ ... }, {
  start: snapshot.draft.length,                   // ← clipboard offset
  end:   snapshot.draft.length,                   // ← clipboard offset
  draftRev: snapshot.draftRev,                    // ← shared counter (correct)
});
```

The span's `start`/`end` are **clipboard** offsets; the host interprets them as **detect** offsets.

### 1.3 The arithmetic, step by step (values taken from the capture)

**Paste #1 — composer empty**

| Quantity | Value |
|---|---|
| clipboard `draft` | `""` (length 0) |
| detect `detectText` | `""` (length 0) |
| plugin span | `start=0, end=0` |
| correct detect span | `start=0, end=0` |

The empty composer is the **only** state in which clipboard offset 0 and detect offset 0 are the same number. The span is accidentally right; `span.draftRev === this.rev` also holds (the snapshot was taken immediately before, and the plugin made no edit since); `tail = detectText.slice(0,1) === ""` so the host inserts `[chip, " "]`; the splice applies → `accepted === true`. **Paste #1 works.**

Afterwards the capture shows:

* clipboard `draft = "[attachment: screenshot.png] "` → **29** chars (28-char chip text + 1 space)
* clipboard `occurrences = [{ offset: 0, length: 28 }]`
* by the contract's own rule, the detect text is `"<U+FFFC> "` → **2** chars (one U+FFFC for the chip at `[0,1)`, one space at `[1,2)`)

**Paste #2 — one chip already present**

| Quantity | Value |
|---|---|
| clipboard `draft.length` | 29 |
| detect `detectText.length` | 2 |
| plugin span | `start = end = 29` |
| correct detect span | `start = end = 2` |
| **coordinate error injected** | **+27** = `occurrence.length − 1` (28 − 1) |

Host evaluation of that call:

1. `phase === 'plain'` → passes.
2. `span.draftRev !== this.rev` → **passes** (the plugin re-read the snapshot; no edit happened in between). *The toast blames this guard, but it is not the failing one.*
3. `tail = detectText.slice(29, 30) === ""` → nodes = `[chip, " "]`.
4. `$replaceDetectSpanWithNodes({start:29, end:29}, nodes)` against a **2-character** detect text → the span is past the end of the document; the splice does not apply → `applied === false`.
5. `insertReference` returns `false` → the plugin deletes its record and throws → **toast**: *"The DSH composer changed before the attachment could be inserted"*.

The capture confirms step 4 rather than step 2: *"insertReference returned false; no second chip anywhere"* — a revision mismatch and a failed splice both return `false`, but a clamped/successful splice would have produced a chip somewhere. It did not. (The composer never changed — the toast is the plugin's own misdiagnosis, and it will mislead every future debugging session.)

### 1.4 Why "first works, later fails" is the signature of this mismatch

* The error injected into the detect space is exactly `Σ over chips already present of (occurrence.length − 1)` — the total expansion of the clipboard projection relative to the detect projection.
* With **zero** chips that sum is **0** → the bug is invisible.
* With the first chip it is **27** → the detect offset lands 27 characters past the end of a 2-character document → the splice cannot apply.
* The error is **not a constant** — it grows with each additional chip and differs per chip (it depends on each chip's `clipboardText` length). That is why the bug cannot be tuned away with a constant offset, why it appears exactly on the *second* interaction in a fresh composer, and why "paste the same file twice" always breaks while "paste once" always works.

**Predicate:** the defect is invisible iff every chip's `clipboardText.length === 1` (then `length − 1 === 0`). Any real attachment label makes the space diverge.

---

## 2. Why the × click turns the chip into `unavailable` instead of removing it

### 2.1 The removal path, traced

`plugin-client.js`:

```js
const end = occurrence.offset + (occurrence.length ?? 1);      // 0 + 28 = 28 → CLIPBOARD space
if (typeof input.consumeToken === 'function') {
  input.consumeToken({
    kind: 'span',
    span: { start: occurrence.offset, end, draftRev: snapshot.draftRev },   // [0,28) in CLIPBOARD space
  });
} else {
  input.setDraft(snapshot.draft.slice(0, occurrence.offset) + snapshot.draft.slice(end));
}
records.delete(occurrence.ref);      // ← unconditional
changed();
```

Note the comment shipped with the code: *"The occurrence owns its whole inline range, so the removal must span `occurrence.length`, not one character."* — **that comment is the bug, written down.** It is true in the clipboard projection and false in the detect projection, which is the only one the verb splices.

Host evaluation of `consumeToken({kind:'span', span:{start:0, end:28, draftRev}})`:

1. `guard.span.draftRev !== this.rev` → false (fresh snapshot).
2. `guard.span.start === guard.span.end` → `0 === 28` is false → **guard passes**.
3. `$replaceDetectSpanWithText({start:0, end:28}, '')` against `"<U+FFFC> "` (2 chars) → out of range → the edit does not apply → `applied === false`.
4. `consumeToken` returns `false`.

The correct detect span for that chip is `{start: 0, end: 1}` — exactly one U+FFFC.

The capture confirms it: *"composer chip still present"*. The chip was never removed because the span it named does not exist in the document the verb edits.

*(Note the asymmetry with §1: for the insert the coordinate **start** was already wrong; for the removal of the very first chip the **start** coincidentally matched (0), but the **length** is wrong — 28 instead of 1. Both call sites are wrong for the same reason.)*

### 2.2 Why the chip turns into `unavailable` instead of disappearing

Two independent facts combine:

1. **The chip's existence is driven by host state, not by the plugin's map.** The dock chip is rendered per composer occurrence. The composer occurrence survived (step 3 above), so the chip is still rendered.
2. **The chip's metadata comes from the plugin's map.** The rendering excerpt is:

   ```js
   // const record = records.get(occurrence.ref);
   // const meta = ... : record === undefined ? 'unavailable' : humanBytes(record.total);
   ```

   `records.delete(occurrence.ref)` runs **unconditionally** — the plugin never inspects `consumeToken`'s boolean (the capture says so explicitly: *"consumeToken(...) returned (not inspected by the plugin code)"*). So `records.get(ref)` is now `undefined` → the meta branch falls through to `'unavailable'`.

Hence: **the composer chip is alive, the plugin's record for it is dead.** The renderer has no other way to express "I know this occurrence exists but I have no metadata for it", so it prints `unavailable`. The size label is not a status of the attachment — it is the absence of plugin bookkeeping.

The two symptoms are therefore one bug with two shapes:

| | Insert path (§1) | Removal path (§2) |
|---|---|---|
| wrong space | clipboard offsets | clipboard offset **and** length |
| host verdict | `insertReference → false` | `consumeToken → false` |
| visible outcome | toast, no chip | chip survives, meta = `unavailable` |
| aggravating plugin-side defect | error message blames the wrong cause | return value ignored + unconditional `records.delete` |

---

## 3. Fix direction

### 3.1 The conversion rule (derived from the host source, not from trial and error)

Sources: `host-input-contract.ts` (chip = one U+FFFC in detect space, chip = `clipboardText` of `occurrence.length` in clipboard space) + `host-input-facade.ts` (`insertReference`/`consumeToken` splice the DETECT text; the span doc says "detect coordinates").

**Rule.** For every chip, the clipboard projection is longer than the detect projection by exactly `occurrence.length − 1`. Therefore:

```text
detectOffset(clipboardOffset) = clipboardOffset − Σ (occurrence.length − 1)   // over chips entirely before that offset
detectLength(chip)            = 1                                            // one U+FFFC
detectSpan(chip)              = { start: detectOffset(chip.offset), end: detectOffset(chip.offset) + 1 }
```

Worked example from the capture (one chip, `length = 28`):

* detect end-of-draft insert point = `29 − (28 − 1) = 2` → `{start:2, end:2}` (end of `"<U+FFFC> "`) ✔
* detect span of the chip = `{start: 0, end: 1}` ✔

**Do not convert `draftRev`.** The contract says `InputState.draftRev` is the *"Monotonic editor revision (span CAS compares against this)"* — a single counter shared by both projections. Copy it verbatim. It is the one field that is already in the right space; converting it would introduce a new bug.

### 3.2 The call sites to change (all in `lib/client.js`)

**Site A — insert path (`add`, the second argument of `insertReference`).** Today `start = end = snapshot.draft.length`. Replace with the converted end-of-draft position:

```js
const detectEnd = detectOffset(snapshot.draft.length, snapshot.occurrences)
const accepted = input.insertReference({ ... }, {
  start: detectEnd,
  end: detectEnd,                    // empty span is legal for insert (only consumeToken rejects empty spans)
  draftRev: snapshot.draftRev,       // verbatim
})
```

Re-read the snapshot inside the per-item loop (the code already does) so that each item's conversion is computed from a single coherent snapshot (`draft` + `occurrences` + `draftRev` must come from the *same* snapshot — mixing a fresh `draftRev` with stale `occurrences` is a new way to get this wrong).

**Site B — removal path (`remove`, the span guard of `consumeToken`).** Today `start = occurrence.offset, end = occurrence.offset + occurrence.length`. Replace with the chip's 1-character detect span:

```js
const occ = snapshot.occurrences.find(o => o.source === SOURCE && o.ref === occurrence.ref)  // re-resolve from the FRESH snapshot
const start = detectOffset(occ.offset, snapshot.occurrences)
const span = { start, end: start + 1 }
const consumed = input.consumeToken({ kind: 'span', span: { ...span, draftRev: snapshot.draftRev } })
```

**Site C — bookkeeping in the removal path (the `unavailable` half of symptom 2).** Honour the verb's verdict:

```js
if (!consumed) {
  // do NOT delete the record; surface an error and keep the chip's metadata
  return
}
records.delete(occurrence.ref)
changed()
```

**Site D — the conversion helper must use the host's full occurrence list.** Compute the delta from `snapshot.occurrences` (every chip in the composer, from every source), **not** from the plugin's own `records` map. Other trigger sources and other plugins can put chips in the same composer; a plugin-local count silently mis-computes the delta as soon as a foreign chip exists.

**Site E — the error message.** `"The DSH composer changed before the attachment could be inserted"` is wrong (the composer did not change) and it hides the real cause. Distinguish at least: revision mismatch (`snapshot.draftRev !== current.draftRev`) → "the composer changed"; otherwise → "our span did not apply", i.e. a plugin-side coordinate error.

**Site F — the `setDraft` fallback branch** (`else` in `remove`, taken only when `consumeToken` is absent). It slices `snapshot.draft` — clipboard space — so it is *self-consistent*, but it overwrites the whole document as plain text and destroys chip nodes/identity. It must not stay as a silent fallback for a broken span path. (Exact `setDraft` chip semantics are not in the fixture → see §6.)

### 3.3 Resulting behaviour after the fix

* Paste #1 → chip inserted at detect offset 0; detect text `"<U+FFFC> "`, clipboard draft `"[attachment: screenshot.png] "`.
* Paste #2 → converted insert point `{start:2, end:2}` → detect text `"<U+FFFC> <U+FFFC> "`, clipboard draft `"[attachment: screenshot.png] [attachment: screenshot.png] "` — one separating space, no double space (the host's `tail` check sees the existing space in detect space and does not add another; the plugin's own "append a space if the draft does not end in whitespace" branch works in clipboard space and agrees).
* × on chip 1 → `consumeToken` span `{start:0, end:1}` → chip removed; record deleted only after a `true` verdict; the surviving chip keeps its real size.

### 3.4 What is **not** the bug (checked and cleared)

* **Revision CAS** — `draftRev` is the same counter in both projections; the plugin copies it correctly.
* **Phase guard** — the plugin's own `phase !== 'plain'` check is *stricter* than the host's (`insertReference` also accepts `'claimed'`; `consumeToken` has no phase check). A divergence worth noting, but not the cause of either report.
* **Host-side regression on this edge** — the `0.1.2-alpha.2 → 0.1.2-alpha.3` corridor carries only **DSH-0.1.2-A3-01** (additive `settings.plugin.item` slot) and **DSH-0.1.2-A3-02** (optional SQLite session-persistence removal). Neither touches the input facade, and that edge's own verification record states the 17-plugin batch re-validation passed with zero code changes. So this is a **plugin-side contract misread**, not an alpha.3 breaking change — meaning it is very likely present on earlier hosts too (unconfirmed; see §6).

---

## 4. Regression test plan

Two layers: **pure conversion tests** (no host; they pin the rule) and **host-backed interaction sequences** (they pin the user-visible behaviour). Both must be in CI; the interaction layer is the one that would have caught both user reports.

### 4.1 Conversion unit tests (pure function over `snapshot.occurrences`)

| # | Input | Assert |
|---|---|---|
| U1 | empty composer, `draft = ""` | `detectOffset(0) === 0`; insert span `{0,0}` |
| U2 | one chip `length 28`, draft length 29 | detect end-of-draft = `29 − 27 = 2`; chip detect span = `{start:0, end:1}` |
| U3 | two chips (`length 28`, `length 30`) | detect end-of-draft = `(29+31) − (27+29) = 4`; chip#2 detect span = `{start:2, end:3}` (not `{start:29, end:30}`) |
| U4 | a chip whose `clipboardText.length === 1` | delta contribution is `0` — pins that the rule is `length − 1` per chip, not "1 per chip" |
| U5 | a chip **not owned by the plugin** among the occurrences | it still contributes its `length − 1` to the delta (the conversion must use the host list, not `records`) |
| U6 | text + chip + text | chip detect span is exactly 1 char; the neighbouring text offsets shift by `length − 1` only |
| U7 | `draftRev` | the helper **must not** transform `draftRev`; assert it is passed through byte-identical |

### 4.2 Host-backed interaction sequences (the regressions that matter)

**R1 · first paste (fresh session, empty composer)**
*Action:* paste one clipboard file.
*Assert:* `insertReference` returns `true`; exactly **one** new composer chip exists; `occurrences` length `0 → 1`; `draft` contains the attachment's `clipboardText` and ends with exactly one separator; the dock chip shows the **real size** (e.g. `48.2 KiB`) and **not** `unavailable`.

**R2 · second paste into the same composer (direct regression for symptom 1)**
*Action:* immediately paste a second clipboard file — *no page reload, no new session, no clearing of the first chip*.
*Assert:* **no toast**; `insertReference` returns `true`; a **second** composer chip exists (`occurrences` length `1 → 2`); `draft` contains **both** `clipboardText` values separated by a single space; **no** double space; both dock chips show their real sizes. *(This is the exact user sequence that fails today.)*

**R3 · third paste (drift must not accumulate)**
*Action:* paste a third file.
*Assert:* `occurrences` length `2 → 3`; no toast; the three chips' detect spans are non-overlapping and each is exactly 1 char; each occurrence's `offset` in the *clipboard* projection equals the expected `detectStart + Σ(length−1)` — i.e. the **cumulative** delta is applied, not just the first chip's.

**R4 · paste with a typed draft**
*Action:* type `hello` (no trailing space) → paste; then paste again into `"hello "` (trailing space).
*Assert:* the typed text is preserved in both cases; the chip lands after the typed text in both cases; exactly one space separates text and chip (the "append a space" branch is exercised in both directions and must not double-space).

**R5 · paste into a composer that already contains a foreign chip**
*Action:* produce a chip from another source (or a built-in trigger), then paste.
*Assert:* the attachment chip lands after the foreign chip; the foreign chip is untouched; the attachment's detect span = `foreignDetectStart + 1`.

**R6 · × on the FIRST chip of a two-chip composer (direct regression for symptom 2, shape 1)**
*Action:* paste twice (R2), then click × on the **first** dock chip.
*Assert:* `consumeToken` returns `true`; that chip **disappears** from the composer; the **second** chip survives with its real size label; the first dock chip is **gone from the DOM** (not rendered with `unavailable`); `records` no longer contains the removed `ref`; the surviving record is still present.

**R7 · × on the SECOND chip (non-zero offset — pins the conversion)**
*Action:* paste twice, click × on the **second** dock chip.
*Assert:* only the second chip is removed; the first chip survives with its real size; the draft equals the first chip's `clipboardText` plus the separator; the removal span used was `{start:2, end:3}` in detect space (assert via the host's applied edit or by observing that the *first* chip was not damaged).

**R8 · × on a chip surrounded by text (pins the span LENGTH)**
*Action:* produce `"a <chip> b"` (type text, paste, type more text), click ×.
*Assert:* the chip disappears; the text `"a "` and `" b"` are both preserved **exactly**; if the span had been `occurrence.length` (28) instead of 1, the trailing text would be eaten — this assertion is the one that kills the class of bug.

**R9 · failed removal must not degrade the chip (direct regression for symptom 2, shape 2)**
*Action:* force `consumeToken` to fail (e.g. mutate the composer between the snapshot and the click so `draftRev` is stale, or stub the verb to return `false`), then click ×.
*Assert:* the plugin **does not** delete the record; the dock chip still shows its **real size** (never `unavailable`); an error is surfaced to the user instead of a silent metadata loss.

**R10 · removal of a foreign chip**
*Action:* click × on a chip the plugin does not own.
*Assert:* no exception; the plugin's own chips and records are unaffected.

**R11 · records ⇔ occurrences invariant**
*Action:* after every insert/remove in the sequence above.
*Assert:* `#records === #occurrences owned by the plugin` at all times; every owned occurrence has a record and every record has an occurrence. *(This invariant is what R9 broke: the record was deleted while the occurrence survived.)*

**R12 · version pinning**
*Action:* run the whole suite against the host version the users run (`0.1.2-alpha.3`) and against the plugin's declared minimum host version.
*Assert:* identical results; the coordinate contract is read from the host source **at that version**, not from memory.

---

## 5. Routine checks before calling input-machine verbs (guidance, not scored)

1. **Read the contract of the face you call, and identify the coordinate space of the *value you read* and of the *verb you call*.** The published contract carries the answer in one line: `Occurrence.offset` says "in the clipboard-text projection"; `EditorProjection.detectText` says "chip = one U+FFFC"; the facade doc comment says "detect coordinates". Three lines, and the bug class disappears.
2. **Read the verb body, not just its signature.** `insertReference` / `consumeToken` tell you which projection they touch (`this.projection.detectText`, `$replaceDetectSpanWithNodes`, `$replaceDetectSpanWithText`). A helper whose name starts with `$replaceDetectSpan` edits the **detect** text — the name is the contract.
3. **Enumerate the verb's guards and its failure modes before calling it**: phase check, revision CAS, empty-span rejection, out-of-range span, and the meaning of the boolean return. Then **always check the return value** — a bare `consumeToken(...)` whose result is discarded is a latent "unavailable" bug.
4. **Do not treat coordinates as identity.** `Occurrence.occurrenceId` / `(source, ref)` are the stable handles; `offset`/`length` are a CAS currency that expires the moment the document changes. Keep them apart.
5. **Do arithmetic cross-checks against a known capture.** After one chip, the clipboard draft is 29 characters and the detect text is 2. If your derived offsets do not reconcile with that, you are in the wrong space — no live host needed.
6. **Prefer the host's own projection over a reconstructed one.** If the facade exposes `EditorProjection`, use `detectText` directly instead of deriving detect offsets from clipboard offsets.
7. **When the plugin keeps its own bookkeeping, make the delete conditional on the host's acknowledgement**, and assert the "my records ⇔ host occurrences" invariant in tests.
8. **Record, in the plugin's changelog, the host version whose contract you read.** The composer/input plane churns without a client API change (DSH-0.1.3-A1-08), so "it worked last release" is not evidence.

---

## 6. Evidence status, open items and residual risk

**Confirmed by the fixture:** the two coordinate spaces and their units; the detect-space-only splices and guards in both verbs; the plugin's clipboard-space spans at both call sites; the arithmetic that makes paste #1 succeed and paste #2 fail (`+27`); that `consumeToken`'s span `[0,28)` cannot apply to a 2-char detect text; that the plugin ignores the verb's boolean and deletes its record unconditionally; that `record === undefined` is what renders `unavailable`; that the composer chip survives both failures.

**Unconfirmed (needs a live host / tagged source — not derivable from the fixture, and deliberately not probed here):**

* Whether the facade exposes `EditorProjection` (or `detectText`) to plugin code — the fixture shows `this.projection` as an internal field only. If it is exposed, use it instead of the derived conversion; if not, the §3.1 rule is the fallback.
* The exact semantics of `input.setDraft` w.r.t. chip nodes (the `remove` fallback branch).
* Whether `$replaceDetectSpanWithNodes` / `$replaceDetectSpanWithText` clamp or reject out-of-range spans. The capture proves the edit does **not** apply in the reproduced case; the general clamp behaviour is inferred, not read.
* Whether the same defect reproduces on hosts older than `0.1.2-alpha.3` — the fixture contains only the alpha.3-era facade. Since the `alpha.2 → alpha.3` edge has no input-face card, the defect is very likely older than alpha.3, but that is an inference.
* The exact numeric value of `draftRev` across edits (the shared-counter reading comes from the contract's own wording).

**Skipped / out of scope:** no live-host probing (`dsh --version`, `--dump-config`, `cordis_inspect_*`) was performed — the installed host is a different version and would be out of scope; no migrations or installs were executed; the fixture tree was left byte-identical.

**Rollback:** none required — this was a read-only inspection; no plugin source, host source, configuration, or dependency was touched.

---

## 7. Card / reference index (IDs and key points only)

* **DSH-0.1.2-A1-25** — `@deepseek-ai/dsh-client-runtime` removed; client symbols migrated by domain. Relevant because the input contract/facade types now live in their domain packages (`@deepseek-ai/dsh-client-ui-conversation/client`).
* **DSH-0.1.2-A1-27** — session content reads via `SessionBinding`; its source note records that the input-machine face (`conversation.input.for(actx)` / `setDraft` / `state.getSnapshot().draft`) **keeps its signatures**. ⇒ the plugin's call *shapes* are still valid; only the coordinate *units* are wrong.
* **DSH-0.1.2-A1-28** — composer edit surface changed from `<textarea>` to a contenteditable DIV (same corridor, composer plane). Reminder that the composer substrate churns independently of the verb contracts.
* **DSH-0.1.2-A3-01 / DSH-0.1.2-A3-02** — the `alpha.2 → alpha.3` edge itself: one additive settings-slot capability, one opt-in SQLite provider removal. **Neither touches the input facade** ⇒ this is a plugin-side misread, not an alpha.3 breaking change.
* **DSH-0.1.3-A1-08** — composer/upload surfaces churn **without a client API change**; input-area plugins must re-verify at runtime. ⇒ §5.8 (record which host version's contract you read) and §4.2 R12 (version pinning).
* **DSH-0.1.2-A1-03** — session-view internals split (context for reading published contracts in the new layout).


## Required output (JSON only)
{"decisions":[{"id":"<criterion-id>","verdict":"pass|partial|fail|missing","reason":"short"}],"caps":[{"id":"<cap-id>","triggered":false,"reason":"short"}]}
Every criterion and cap exactly once. pass=full points, partial=half, fail/missing=0; a triggered cap caps the total.