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
#### FILE: S9-composer-coordinate-trap/S9-composer-coordinate-trap-report.md

# S9 · Composer Coordinate Trap — diagnosis & fix plan

**Package under test:** `@org/dsh-attach-input` v0.2.3 against DSH `0.1.2-alpha.3`
**Evidence:** `fixture/host-input-contract.ts` (K), `fixture/host-input-facade.ts` (F), `fixture/plugin-client.js` (P), `fixture/console-session.txt` (L)
**Verdict:** both user reports are **one** defect — the plugin computes insert/remove spans in the **clipboard-text projection** and hands them to host verbs that index the **detect-text projection**. The removal report has one additional, independent aggravator: the verb's boolean result is discarded and the record is deleted optimistically.

---

## 0. The contract in two sentences

The editor publishes **two different strings over the same document** (K:34-42):

| Projection | One chip occupies | Who indexes it |
|---|---|---|
| `EditorProjection.detectText` | exactly **one** `U+FFFC` (OBJECT REPLACEMENT CHARACTER) | `TokenSpan` / insertReference / consumeToken / $replaceDetectSpan* (F:11, F:18, F:41, F:3-4) |
| `EditorProjection.clipboardText` = `InputState.draft` | the whole `clipboardText`, e.g. `[attachment: screenshot.png]` (28 code units) | every offset/length in `InputState.occurrences` / `EditorProjection.occurrences` (K:15-16, K:31, K:38-41) |

So for a document with `n` chips and `t` units of plain text:

```
detectLength    = t + n                       // chip == 1 unit
clipboardLength = t + SUM clipboardText.length // chip == its whole clipboard form
clipboardLength - detectLength = SUM (length_i - 1)   // the "expansion delta"
```

Everything the plugin reads (`snapshot.draft`, `occurrence.offset`, `occurrence.length`) is clipboard-space. Everything the host splices (`span.start`, `span.end`) is detect-space. That single conflation is the bug.

---

## 1. Why paste #1 succeeds and every later paste fails

### 1.1 The exact mismatch

Insert path (P:21-32) computes:

```js
start: snapshot.draft.length,
end:   snapshot.draft.length,        // P:29-30  -> clipboard-space offset
draftRev: snapshot.draftRev,
```

`insertReference(ref, span)` is documented as taking the *"pick-time span snapshot (**detect coordinates**)"* (F:11) and proves it in its own body — the trailing-space probe reads the span against `detectText`:

```ts
const tail = this.projection.detectText.slice(span.end, span.end + 1)   // F:18
```

`$replaceDetectSpanWithNodes(span, nodes)` (F:24) then splices **that same** `detectText` (F:3-4: *"$replaceDetectSpanWithText / $replaceDetectSpanWithNodes splice the DETECT text"*). The revision CAS `span.draftRev !== this.rev` (F:17) is a *separate* guard, and it **passes**: the plugin refreshes `snapshot` after every accepted insert (P:37) and at call entry (P:11), and `draftRev` is documented as the same currency the CAS compares (K:28-29). So the failure is not a revision race — it is the span coordinates.

Concretely from the capture (L:7-9): after paste #1 the clipboard draft is 29 units, one occurrence of clipboard length 28, therefore `detectText` is `"\uFFFC "` — **2** units. Paste #2 asks the host to splice at `[29, 29]` inside a 2-unit detect document:

```
plugin:  start = end = 29          (clipboard)
host:    detectText.length = 2     (detect)
overshoot = 29 - 2 = 27 = 28 - 1   (exactly the expansion delta)
```

The tail probe at `detectText.slice(29, 30)` returns `''`, and the splice target lies past the end of the detect document, so the edit cannot apply: `applied` stays `false`, `insertReference` returns `false` — exactly L:14. The plugin's `!accepted` branch (P:33-36) deletes the record *before* `changed()`, so nothing is ever rendered — hence "the second chip never appears" *anywhere* (L:14).

### 1.2 Why "first works, later fails" is the signature of exactly this mismatch

The error term is `SUM (length_i - 1)` over the chips already in the document. It is **exactly zero iff the document contains no chip yet**:

* **Paste #1, empty composer.** `draft === ''` (P:13's trailing-space branch is skipped because `draft === ''`), so `start = end = 0`. Zero is the one offset that is identical in *both* projections — an empty document is empty in detect space and in clipboard space. The wrong code is right by coincidence, and the insert applies.
* **Every later paste.** The document now holds at least one chip, so the two projections differ by at least `length_i - 1` = 27 units here, and the computed offset lands **at or beyond** the end of the detect document. This is deterministic and monotone in chip count, not intermittent: it is a function of document *content*, not of timing, focus, or upload state. A revision race, a phase race, an async-upload ordering bug, or a React key collision would all be flaky and could fire on paste #1 — this one cannot, because the error term is identically 0 on the first paste. That asymmetry is the fingerprint.
* Corollary: the toast is also mislabelled. The host is not saying "the composer changed"; it is saying "your span is not addressable in my document". Nothing changed.

### 1.3 Hypotheses ruled out (so the fix is not over-scoped)

| Hypothesis | Why it is not the cause |
|---|---|
| `draftRev` stale / CAS race | Plugin re-reads the snapshot before each span (P:11, P:37); the capture is 100 % reproducible on paste #2 and never on paste #1. |
| `phase !== 'plain'` | `insertReference` itself allows `plain` *and* `claimed` (F:16); the capture shows no phase error. |
| Trailing-space pre-step (P:13-16) | No-op here (`draft` already ends with the separator space the host added). Even when it runs it is in the correct space (`setDraft` takes clipboard text) and shifts by 1. |
| Duplicate `ref` / dock key collision | `ref = id()` is fresh per item (P:18); the record is deleted, so nothing renders. |
| Upload/async ordering | `insertReference` returns `false` *synchronously*; `file.size` is read synchronously before any await (P:19). |

---

## 2. Why the × turns the chip into `unavailable` instead of removing it

The removal path has the same misread, plus a discarded return value and an optimistic `records.delete`.

### 2.1 Step-by-step trace (L:17-20)

1. **Span computed in the wrong space (P:49).** `const end = occurrence.offset + (occurrence.length ?? 1)` gives `0 + 28 = 28`. Both operands are documented as *clipboard-text projection* quantities (K:15-16: *"Offset in the clipboard-text projection"*, *"the occurrence occupies exactly [offset, offset+length)"*). P:47-48's own comment ("the removal must span `occurrence.length`, not one character") is therefore correct **for the draft text** and wrong **for the verb it is fed to**.
2. **The guard the code assumes will save it does not (F:36-44).** `consumeToken` checks `span.draftRev !== this.rev` (passes) and `span.start === span.end` (passes, 0 != 28), then calls `$replaceDetectSpanWithText(guard.span, '')` — which per F:3-4 splices the **detect** text. The detect document is 2 units long; the requested range is `[0, 28)`. The splice cannot apply, `applied` stays `false`, and `consumeToken` **returns `false`**.
3. **The return value is thrown away (P:50-54).** The call is a bare statement — `consumeToken(...)` — with no `if (!ok)`. The capture says so explicitly: *"consumeToken(...) returned (not inspected by the plugin code)"* (L:18). So a failed mutation is indistinguishable from a successful one to everything downstream.
4. **Bookkeeping is committed anyway (P:58-59).** `records.delete(occurrence.ref)` then `changed()`.
5. **Result: a zombie chip with no record (L:19-20, P:63-65).** Nothing was spliced, so the host's occurrence list still contains the chip and the composer still shows it. The dock iterates live occurrences (that is why `remove` receives an `Occurrence` at all), so the chip is still rendered — but the meta line now does `records.get(occurrence.ref)` -> `undefined` -> the `'unavailable'` fallback (P:65). That is the reported symptom *exactly*: chip stays, size label becomes `unavailable`.
6. **`'unavailable'` is a lie about the wrong thing.** It reports "we lost track of the attachment", while the truth is "the host rejected our span". The two failure modes are conflated, which is why the bug looks like a data-loss / bookkeeping bug instead of a coordinate bug.

### 2.2 Why this is the same defect, not a second one

The plugin's **fallback** branch is the tell (P:55-57): `snapshot.draft.slice(0, occurrence.offset) + snapshot.draft.slice(end)`. That slice operates on `draft` with clipboard offsets — and it is **correct**. The identical numbers are only wrong at the host-verb boundary. So the plugin's internal model is consistently clipboard-space; the defect exists purely in the call sites that cross into detect-space. One root cause, two symptoms:

```
                 clipboard-space (what the plugin knows)
                    |                        |
        insert: draft.length        remove: occurrence.offset+length
                    |                        |
                    v                        v
        insertReference(span)      consumeToken({span})      <-- both index detectText
                    |                        |
                 returns false            returns false  (ignored)
                    |                        |
            throws toast, deletes      deletes record, keeps chip
                 the record                 -> "unavailable"
```

The removal path additionally needs the **result check** fixed (P:50-59), and the dock needs to stop letting a missing record masquerade as "unavailable" (P:63-65). Those are two-line hardening changes, not a second root cause.

---

## 3. Fix direction

### 3.1 The conversion rule (derived from the host contract, not guessed)

Derivation, entirely from the published docs:

* K:28 `draftRev` — *"span CAS compares against this"* -> the only revision `span.draftRev` may carry.
* K:16 + K:31 — occurrence `offset`/`length` are **clipboard** coordinates, and the occurrence *"occupies exactly `[offset, offset+length)`"* there.
* K:36 + K:41 — `detectText` is the *"Trigger/TokenSpan coordinate text (chip = one U+FFFC)"*, and `occurrences` is *"InputState-compatible"* — i.e. still clipboard coordinates. There is **no** published occurrence view in detect coordinates; the conversion must be done by the caller.
* F:18 + F:3-4 — the host's spans index `detectText` for both verbs.
* F:21-23 — the host supplies the separating space itself, judged on the *detect* tail.

Therefore: **clipboard boundary offset `c` maps to detect offset `c - SUM (length_i - 1)`, summed over the occurrences that lie entirely at or before `c`** — because a chip is *one* detect code unit but consumes its whole `clipboardText` in clipboard space.

```js
const CHIP = '\uFFFC'   // K:36 — a chip is exactly one code unit of detectText

/**
 * Convert a boundary offset from InputState/clipboard coordinates to
 * TokenSpan/detect coordinates.  snapshot.occurrences is contract-sorted
 * by offset (K:31), so a single prefix walk is enough.
 */
const toDetect = (snapshot, clipOffset) => {
  let delta = 0;
  for (const occ of snapshot.occurrences) {
    if (occ.offset + occ.length > clipOffset) break;   // occ starts at/after c
    delta += occ.length - 1;                            // chip: length -> 1 unit
  }
  return clipOffset - delta;
};

// Optional but strongly recommended: assert against the authoritative string
// when the projection is reachable, so a drifting contract fails loudly.
const assertDetect = (projection, snapshot) => {
  if (!projection) return;
  const end = toDetect(snapshot, snapshot.draft.length);
  if (end !== projection.detectText.length) {
    throw new Error('detect/clipboard conversion out of sync');
  }
};
```

Properties worth stating in the code so the compiler/test can enforce them:

* `toDetect(snapshot, snapshot.draft.length) === detectText.length` — the end of the draft is the end of both strings.
* `toDetect(snapshot, occ.offset)` is the index of that chip's `U+FFFC` in `detectText`, and `detectText[toDetect(s, occ.offset)] === CHIP`.
* `toDetect(s, occ.offset + occ.length) - toDetect(s, occ.offset) === 1` — a chip is always exactly one detect unit, which is why `consumeToken`'s `start === end` guard must not fire.
* Lengths are **UTF-16 code units** on both sides (`String.prototype.length`, and K/F never speak of code points). Do not `Array.from` / spread the strings before measuring, or astral characters (emoji in a filename) will shift every offset by the number of surrogate pairs before it.
* No published API accepts a detect-space occurrence, so the plugin must own this helper and use it *everywhere* it crosses the boundary.

### 3.2 Insert call site (P:21-32)

```js
// before (clipboard offset handed to a detect-space verb)
start: snapshot.draft.length,
end:   snapshot.draft.length,

// after
const at = toDetect(snapshot, snapshot.draft.length);   // == detectText.length
const accepted = input.insertReference({ ...ref payload... }, {
  start: at,
  end: at,
  draftRev: snapshot.draftRev,          // same snapshot the offset came from
});
```

Notes:

* Insert-at-end can equivalently be written `start = end = projection.detectText.length`; keep the `toDetect` form so one helper serves both call sites (and so a future mid-draft insert cannot silently regress).
* Keep the P:37 refresh **inside** the loop and recompute `toDetect` per item: each accepted insert appends a chip *and* possibly a space, so both projections change between items of one multi-file paste. Converting once outside the loop would make item 2 of a two-file paste fail in exactly the reported way.
* Keep the P:13-16 trailing-space pre-step as is (it is clipboard-space `setDraft`, and correct), but do not treat it as a substitute for the host's own detect-tail rule (F:21-23) — the host already adds the separator, so the pre-step is belt-and-braces.
* Do not "fix" this by clamping the offset into `[0, detectText.length]`. Clamping would land the chip at the document end for the append case and *appear* to work, while still being wrong for any non-terminal insert — and it would silently corrupt the trailing-space logic. Convert, do not clamp.

### 3.3 Removal call site (P:43-59)

```js
const remove = (sessionId, occurrence) => {
  const input = inputFor(sessionId);

  // 1. Re-read: the click handler may be a frame behind the editor.
  const snapshot = input.state.getSnapshot();
  if (snapshot.phase !== 'plain') return;

  // 2. Re-resolve the occurrence in the *current* snapshot (offset may have
  //    shifted since render); fall back to the rendered one if it is gone.
  const live = snapshot.occurrences.find(
    o => o.occurrenceId === occurrence.occurrenceId) ?? occurrence;

  // 3. Convert both endpoints into detect space.
  const start = toDetect(snapshot, live.offset);
  const end   = toDetect(snapshot, live.offset + live.length);   // start + 1 for a chip

  // 4. Optionally mirror insertReference's tail rule (F:18): eat the separator
  //    space the insert added, so removing the last chip leaves no widow space.
  //    const dEnd = projection.detectText[end] === ' ' ? end + 1 : end;

  // 5. Only mutate bookkeeping when the host confirms the edit.
  let consumed = false;
  if (typeof input.consumeToken === 'function') {
    consumed = input.consumeToken({
      kind: 'span',
      span: { start, end, draftRev: snapshot.draftRev },
    });
  } else {
    // clipboard-space fallback stays clipboard-space (P:55-57) — unchanged
    input.setDraft(snapshot.draft.slice(0, live.offset)
                 + snapshot.draft.slice(live.offset + live.length));
    consumed = true;
  }

  if (!consumed) {
    // keep the record; the chip is still in the document, so its meta is valid
    reportError('Could not remove the attachment from the composer; please retry');
    return;
  }
  pruneRecords(input.state.getSnapshot());   // reconcile, do not blind-delete
  changed();
};
```

Removal-path bookkeeping changes (these are what make the `unavailable` symptom impossible):

1. **Check the boolean.** `consumeToken` is a guard that fails closed (F:36-44); ignoring it is what converted "nothing happened" into "the attachment is gone but the chip is not".
2. **Delete after confirmation, never before** (replaces P:58).
3. **Reconcile instead of blind delete.** Derive `records` from the live occurrence view: drop records whose `(source, ref)` no longer appears in `snapshot.occurrences` (this also fixes the reverse leak — the user backspaces over a chip and the record is never freed — which the current code has too), and never render a chip from a record that has no occurrence.
4. **Render the chip from the occurrence, not from the record join** (P:63-65). The occurrence already carries `label` and `clipboardText` (K:18-21), so a chip can always be drawn; use the record only to *enrich* it (`humanBytes(total)`, upload progress). A missing record can then no longer blank out a live chip, and `'unavailable'` stays reserved for a genuine unknown-state case with a real error affordance.
5. If the separator space is intentionally kept, assert the resulting draft string in tests so the choice is explicit rather than accidental.

### 3.4 Not a fix

Bumping `draftRev`, retrying the insert, wrapping the call in try/catch, or clamping the span will all *appear* to help on the append case (the end of the draft is reachable by clamping) while leaving mid-draft inserts and every removal broken. The revision guard already passes; the only defect is the coordinate space.

---

## 4. Regression test plan

Two fixture-level pieces make these tests cheap and honest: (a) a **fake host** that implements F verbatim — `detectText` with `U+FFFC` chips, `clipboardText` with expanded chips, the rev CAS, the `start === end` guard, and *fail-closed* splices that return `false` for out-of-range spans; (b) a **span recorder** that captures every `TokenSpan` the plugin passes, so assertions can be made on the *arguments*, not only on the outcome.

### 4.1 Coordinate conversion (unit) — the layer that was missing

| # | Input | Assertion |
|---|---|---|
| A1 | empty draft, no occurrences | `toDetect(s, 0) === 0` |
| A2 | draft `"[a]"` (3), occ `{0,3}` | `toDetect(s, 3) === 1` (delta 2) |
| A3 | draft `"[a] "` (4), occ `{0,3}` | `toDetect(s, 4) === 2` |
| A4 | 2 chips + typed text between/after | `toDetect(s, draft.length) === detectText.length` |
| A5 | every occurrence | `detectText[toDetect(s, o.offset)] === '\uFFFC'` and `toDetect(s, o.offset+o.length) - toDetect(s, o.offset) === 1` |
| A6 | emoji / CJK / astral filename, multi-line draft | offsets stay in UTF-16 units; no `Array.from` drift; A5 invariants hold |
| A7 | boundary *inside* a chip (`o.offset < c < o.offset+o.length`) | documented snapping (to `o.offset`'s detect position) or explicit rejection — must not emit a mid-chip detect offset |
| A8 | property/fuzz: 200 random sequences of pastes, typed text, removals | A5 invariant plus `draft.slice(o.offset, o.offset+o.length) === o.clipboardText` hold at every step |

### 4.2 Insert sequences (bug #1 cannot return)

| # | Sequence | Must assert |
|---|---|---|
| B1 | fresh empty composer -> paste A | returns `true`; draft `"[attachment: A] "`; 1 occurrence; detect `"\uFFFC "`; **span passed was `[0,0]`** |
| B2 | paste B immediately after B1 | returns `true` (the reported bug); 2 occurrences; detect `"\uFFFC \uFFFC "`; **span passed was `[2,2]`, not `[29,29]`** |
| B3 | 5 sequential pastes, no reload, no re-mount | 5 successes, 5 dock chips, 5 composer chips, 0 toasts, 0 `unavailable` |
| B4 | type `"hello"` -> paste | `true`; chip after `hello`; occurrence offset 5 |
| B5 | paste -> type more text -> paste | `true`; second offset = first clipboard length + typed length; span converted |
| B6 | one `add()` call with **two** items (multi-file paste) | both accepted; per-iteration `toDetect` recomputed from the refreshed snapshot |
| B7 | every insert above | recorded span satisfies `0 <= start === end <= detectText.length` — a *guard-level* assertion that fails even if the fake host were lenient |
| B8 | snapshot -> `setDraft()` (bump rev) -> insert with the stale `draftRev` | `false`, record rolled back (`records.size === 0`), and the error surfaced as a genuine "composer changed" — proves the plugin still distinguishes a real rev conflict from a coordinate error |
| B9 | insert, then `getSnapshot()` | `draft` and `occurrences` agree with the fake host's `clipboardText`/`occurrences` — catches future divergence between the projections |

### 4.3 Removal sequences (bug #2 cannot return)

| # | Sequence | Must assert |
|---|---|---|
| C1 | paste A -> click × | `consumeToken` returned `true`; occurrence gone from `state.occurrences`; composer chip gone; dock chip gone; no `records` entry for the ref |
| C2 | same, span recorded | span was `[d(o.offset), d(o.offset)+1)` — e.g. `[0,1]`, **not `[0,28]`** — and `detectText[start] === '\uFFFC'` |
| C3 | `consumeToken` stubbed to return `false` | record **retained**; dock chip still shows `humanBytes(total)` (never `unavailable`); composer chip untouched; an error surfaced; `records.size` unchanged |
| C4 | 2 chips -> remove the first -> remove the second | after first: 1 occurrence whose `offset === 0` (re-offset asserted); separator-space rule asserted on the exact draft string; after second: draft equals the pre-paste baseline (`''` or the typed text) |
| C5 | paste A -> remove A -> paste B | succeeds; converter handles a *shrinking* delta (catches any "delta only grows" assumption) |
| C6 | `phase !== 'plain'` -> click × | no-op; record **not** deleted; no `unavailable` |
| C7 | chip removed externally (select-all + Backspace, or undo/redo) | record pruned by reconciliation; no orphan `records` entry; dock renders no ghost chip |
| C8 | full scripted replay of `console-session.txt` | paste #1 OK, paste #2 OK, × OK — the capture that used to fail now logs three successes and zero toasts |

### 4.4 Standing invariants (cheap, highest leverage)

Assert after **every** plugin mutation, in unit tests *and* in a DEV-only runtime check:

```js
const s = input.state.getSnapshot();
for (const o of s.occurrences) {
  assert(s.draft.slice(o.offset, o.offset + o.length) === o.clipboardText); // right space
}
assert(countChips(detectText) === s.occurrences.length);                    // 1 chip == 1 unit
assert(toDetect(s, s.draft.length) === detectText.length);                  // endpoints agree
```

These three lines fail on the *first* paste that today "works", which is what the current suite lacks: paste #1 passes, so no test ever exercised a document containing a chip.

---

## 5. Routine host-source checks before calling input-machine verbs

1. **Locate the projection the verb indexes.** Read the verb body for the string it slices/splices (`detectText` vs `clipboardText`). If it never names one, read the `$replace*` helpers it calls (F:3-4) — the comment there is often the *only* place the space is stated, which is exactly how this misread survives review.
2. **Read the JSDoc on the parameter, not just its type name.** `TokenSpan` is not self-describing; F:11 says "detect coordinates". `InputState.draft` is not "the text you see"; K:26 says "clipboard-text projection".
3. **Check the revision currency.** Confirm `span.draftRev` is compared to the same counter the snapshot publishes (K:28), and re-read the snapshot immediately before building any span.
4. **Check what a chip is worth in each projection.** One `U+FFFC` vs the full `clipboardText`. Any constant that conflates them is a bug seed.
5. **Check whether occurrences are published in the verb's space.** K:38-41 says the projection's occurrence view is *"InputState-compatible"* — i.e. **not** detect-space. Assume the conversion is yours unless a detect-space view is explicitly documented.
6. **Check the failure mode of an invalid span.** Here it is a `false` return, not a throw (F:24, F:41) — so a discarded return value is a silent failure. Every boolean-returning verb must have its result checked and must gate bookkeeping.
7. **Check side effects the host already performs.** `insertReference` adds the separator space itself (F:21-23); don't duplicate it, and mirror the same tail rule on removal so the two stay symmetric.
8. **Check unit granularity.** Both projections are UTF-16 code-unit strings; never normalise to code points.
9. **Diff the contract on every supported-version bump.** Diff `contract/input.ts` and `input/facade.ts` against the previous pin; any change to chip encoding, occurrence coordinates, or guard order is breaking for this plugin. Record the pinned host version in the plugin README.
10. **Encode the space in your own types.** Brand the offsets (`type DetectOffset = number & { readonly __detect: unique symbol }`, plus `ClipboardOffset`) so a raw `draft.length` cannot be passed to a detect-space parameter; the compiler then enforces what review missed. A one-line helper named `toDetect()` at the boundary is the durable form of this checklist.

---

## Appendix · Evidence index

| Ref | Location | What it establishes |
|---|---|---|
| K:15-16 | `host-input-contract.ts` | occurrence offsets/lengths live in clipboard coordinates, half-open `[offset, offset+length)` |
| K:26-31 | K | `InputState.draft` = clipboard projection; `draftRev` is the CAS currency |
| K:34-41 | K | `detectText`: chip = one `U+FFFC`; `clipboardText`: chip = clipboard form; occurrence view is InputState-compatible |
| F:3-4 | `host-input-facade.ts` | both `$replace*` helpers splice the **detect** text |
| F:11, F:18 | F | `span` is documented as detect coordinates and is indexed against `detectText` |
| F:16-17 | F | phase guard and rev CAS — the two guards that were *not* the problem |
| F:21-23 | F | host adds the separator space based on the detect tail |
| F:36-44 | F | consumeToken: rev CAS + non-empty guard, then detect-space splice, fail-closed |
| P:29-31 | `plugin-client.js` | insert span built from `snapshot.draft.length` (clipboard) |
| P:33-36 | P | the toast; record deleted before render |
| P:49 | P | removal `end = offset + length` (clipboard) |
| P:50-54 | P | `consumeToken` result discarded |
| P:55-57 | P | clipboard-space fallback — correct, and proof the plugin's own model is clipboard-based |
| P:58-59 | P | optimistic `records.delete` commits the lie |
| P:63-65 | P | dock meta -> `'unavailable'` when the record is missing |
| L:7-9 | `console-session.txt` | draft 29 / occurrence length 28 -> detect 2 |
| L:12-15 | L | paste #2 `insertReference` -> `false`, no chip anywhere |
| L:17-20 | L | × -> consumeToken result uninspected, chip persists, meta `unavailable`, record gone |


## Required output (JSON only)
{"decisions":[{"id":"<criterion-id>","verdict":"pass|partial|fail|missing","reason":"short"}],"caps":[{"id":"<cap-id>","triggered":false,"reason":"short"}]}
Every criterion and cap exactly once. pass=full points, partial=half, fail/missing=0; a triggered cap caps the total.