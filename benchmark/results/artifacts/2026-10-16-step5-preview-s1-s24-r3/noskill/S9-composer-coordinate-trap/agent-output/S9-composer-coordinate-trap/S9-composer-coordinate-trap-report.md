# S9 · Composer Coordinate Trap — diagnosis for `@org/dsh-attach-input` v0.2.3

**Verdict:** both symptoms are **one** defect. The plugin reads the composer in the
**clipboard-text projection** (`InputState.draft`, `Occurrence.offset/length`) but feeds those
numbers to verbs whose guards are expressed in the **detect-text projection** (`TokenSpan`,
`EditorProjection.detectText`). A chip is `clipboardText.length` characters wide in the first
projection and exactly **one `U+FFFC`** in the second, so every offset the plugin computes is
correct only while the document contains no chips — which is exactly the first paste.

Everything below is derived from the four fixture files; no host behaviour is guessed. A
behavioural model of `host-input-facade.ts` was built from the excerpts and reproduces
`console-session.txt` line-for-line (paste #1 OK, paste #2 toast, × → `unavailable`), then
confirms the fix across 3 750 remove/paste sequences. See *Appendix A*.

---

## 0. The two coordinate spaces (the contract the code misread)

From `host-input-contract.ts`:

| Field | Projection | Chip width |
|---|---|---|
| `InputState.draft` | clipboard text ("chips expanded to their clipboard form") | `clipboardText.length` |
| `InputState.occurrences[].offset / .length` | "clipboardText coordinates" | `clipboardText.length` |
| `EditorProjection.detectText` | detect text, "chip = one U+FFFC" | **1** |
| `TokenSpan` (`insertReference(ref, span)`, `consumeToken({kind:'span'})`) | "pick-time span snapshot (**detect coordinates**)" | **1** |

From `host-input-facade.ts`, the two verbs are unambiguously detect-space:

* `insertReference`: `const tail = this.projection.detectText.slice(span.end, span.end + 1)` and
  `$replaceDetectSpanWithNodes(span, nodes)` — both operate on **detect** text.
* `consumeToken`: `$replaceDetectSpanWithText(guard.span, '')` — again **detect** text.
* The bare-token branch is the counter-proof: it compares against
  `this.projection.clipboardText` and calls `this.setDraft('')`, i.e. `setDraft` /
  `InputState.draft` are **clipboard** space. The plugin's two spaces are therefore not
  interchangeable — one verb family is detect, the other clipboard.

`draftRev` is *not* part of the mismatch: the contract annotates it "span CAS compares against
this", so `snapshot.draftRev` and `this.rev` are the same counter (see §1.4).

---

## 1. Why the FIRST paste succeeds and every later paste fails

### 1.1 The exact mismatch

`plugin-client.js:29-30`

```js
start: snapshot.draft.length,   // ← clipboard-text length
end:   snapshot.draft.length,   // ← clipboard-text length
```

`snapshot.draft.length` is a **clipboard-text offset**. `insertReference` expects a
**detect-text offset** and guards the splice with it. The plugin therefore asks the editor to
splice at a position measured in the wrong ruler.

### 1.2 Arithmetic (reproduces `console-session.txt` exactly)

| step | clipboard draft | `snapshot.draft.length` (what the plugin sends) | detect text | detect length (what the host needs) | result |
|---|---|---|---|---|---|
| paste #1 | `""` | **0** | `""` | **0** | in range → **applied** |
| paste #2 | `"[attachment: screenshot.png] "` | **29** | `"\uFFFC "` | **2** | 29 > 2 → out-of-range splice → `applied = false` |

Paste #1: the guard passes (`phase === 'plain'`, `span.draftRev === this.rev`), `tail =
detectText.slice(0,1) === ''` so the host appends `[chip, ' ']`, `$replaceDetectSpanWithNodes`
splices `[0,0)` — valid. The draft becomes `"[attachment: screenshot.png] "` (29 chars) and the
occurrence is `{offset: 0, length: 28}`. The log records exactly this.

Paste #2: the draft already ends in whitespace, so no `setDraft` runs and `snapshot` is the
post-insert one (`draftRev` fresh). The plugin sends `{start: 29, end: 29}`. `tail =
detectText.slice(29,30) === ''` (past the end of a 2-char string), so the host still builds
`[chip, ' ']`, then `$replaceDetectSpanWithNodes` must splice `[29,29)` into a 2-character
document. That is out of range, the splice does not apply, `applied` stays `false`, the verb
returns `false`, and `plugin-client.js:33-36` throws the toast. The log records exactly this.

**Drift is monotonic and compounding:** each chip costs `clipboardText.length + 1` characters in
the clipboard projection but `1 + 1 = 2` in detect, i.e. the plugin overshoots by
`28 + 1 - 2 = 27` per existing chip:

| chips | plugin's `end` | correct detect `end` | detect doc length | outcome |
|---|---|---|---|---|
| 0 | 0 | 0 | 0 | applied |
| 1 | 29 | 2 | 2 | rejected |
| 2 | 58 | 4 | 4 | rejected |
| 3 | 87 | 6 | 6 | rejected |

### 1.3 Why "first works, later fails" is the *signature* of this mismatch

An empty document is the one state where the two projections are **identical**: both are the
empty string, so offset 0 is simultaneously a valid clipboard offset and a valid detect offset.
The moment one chip exists the projections diverge permanently, and the plugin's ruler is wrong
by `27 × (number of chips)`. Hence the failure is **deterministic, content-dependent and
monotonic** — never the first paste, always every later one, and worse the more attachments
there are. That fingerprint (correct at empty, wrong by a per-chip constant afterwards) is
unique to a coordinate-space confusion; it is *not* the fingerprint of a race or of stale state.

### 1.4 Ruling out the obvious red herring (stale `draftRev`)

The same toast is thrown for a `draftRev` CAS failure, so it is worth proving which guard fires:

* The plugin re-reads the snapshot after every insert (`plugin-client.js:37`), so at paste #2 it
  holds `draftRev = 1`, which *is* `this.rev`. The CAS passes.
* A stale-rev failure would be **timing-dependent** (it would also hit the first paste whenever
  anything else edited the composer in between) and would not scale with attachment count.
* The arithmetic above shows the span itself is out of range for the detect document regardless
  of the revision.

So the failing guard is the **coordinate validity of the span inside the detect projection**
(whether it manifests as the `tail` lookup reading past the end, or as `$replaceDetectSpan…`
refusing an out-of-range splice — both are consequences of the same wrong ruler). Note also that
the plugin's own error message ("The DSH composer changed…") actively misleads here: nothing
changed; the plugin simply addressed the document in the wrong units. Reporting the computed vs.
expected span in that message would have made this a five-minute bug.

---

## 2. Why the × click turns the chip into `unavailable` instead of removing it

Two independent bookkeeping errors stack on the same coordinate defect.

### 2.1 The removal is rejected by the host (same wrong ruler)

`plugin-client.js:49`

```js
const end = occurrence.offset + (occurrence.length ?? 1);
```

`occurrence.offset`/`occurrence.length` are **clipboard** coordinates (contract:
"clipboardText coordinates"). `consumeToken`'s span guard splices **detect** text. For the
captured chip that is `{start: 0, end: 28}` against a 2-character detect document — out of
range again, so `$replaceDetectSpanWithText` does not apply and the verb returns `false`.

Note the `?? 1` fallback: it encodes the *detect*-space intuition ("an occurrence is one
character"), while the non-null branch uses the *clipboard* length. The line mixes both spaces,
which is the fingerprint of the misread contract rather than a typo.

The `else` branch (`plugin-client.js:56`) is the legacy `setDraft` path and is
**self-consistent in clipboard space** — `setDraft` is clipboard space (§0). But it is gated
behind `typeof input.consumeToken === 'function'`, which is true on 0.1.2-alpha.3, so the
correct path is dead code and the wrong-space path is the live one.

### 2.2 The record is deleted unconditionally, so the chip degrades to `unavailable`

The dock renders **existence** from the host's occurrences and **metadata** from the plugin's
`records` map (`plugin-client.js:63-65`: `records.get(occurrence.ref)`, `record === undefined
? 'unavailable' : humanBytes(record.total)`). `remove` does:

```js
input.consumeToken({...});      // return value discarded
records.delete(occurrence.ref); // unconditional
changed();
```

The return value is never inspected, so a rejected removal is treated as a successful one. The
host occurrence survives (the log confirms: "composer chip still present"), the record is gone,
and `changed()` re-renders a chip that now has no record → the size label becomes
`unavailable` and the chip can never be dismissed. The log line "records no longer contains the
ref" confirms the deletion happened despite the failed consume.

### 2.3 Secondary: the span is built from a render-time occurrence against a fresh revision

`remove` fetches a **fresh** `snapshot` and uses `snapshot.draftRev` from it, but takes
`occurrence.offset/length` from the **render-time** object passed in by the dock. That is a
half-fresh read: a current CAS token with a stale offset. Offsets shift after any earlier
insert/remove, so the occurrence must be re-resolved from the fresh snapshot (by
`occurrenceId`, the "shell-assigned stable identity", falling back to `ref`) before its range
is converted.

**One root cause, two symptoms:** both the insert and the removal pass clipboard-text numbers
into detect-text guards; the removal additionally ignores the verb's `false` and deletes its
bookkeeping anyway, which converts the still-live chip into an `unavailable` chip.

---

## 3. Fix direction

### 3.1 The conversion rule (derived from the host excerpts)

Each occurrence occupies `length` characters in the clipboard projection and exactly **1**
character (`U+FFFC`) in the detect projection. Therefore a clipboard offset maps to a detect
offset by subtracting `length - 1` for **every occurrence that ends at or before that offset**:

```text
detectOffset(clipOffset) = clipOffset − Σ (occurrence.length − 1)
                           over occurrences with occurrence.offset + occurrence.length ≤ clipOffset
```

Equivalently, walk the clipboard draft segment by segment: copy plain text 1:1, and collapse
each chip to one `U+FFFC`. The invariant that makes it checkable is
`detectText.length === draft.length − Σ(length − 1)`.

```js
// clipboard (InputState) offset -> detect (TokenSpan) offset
const toDetectOffset = (snapshot, clipOffset) => {
  let detect = 0, consumed = 0;
  for (const occ of snapshot.occurrences) {          // sorted by offset
    if (occ.offset + occ.length <= clipOffset) { detect += 1; consumed += occ.length; }
    else break;                                      // point is inside/before this chip
  }
  return detect + (clipOffset - consumed);
};
const toDetectRange = (snapshot, clipOffset, clipLength) => ({
  start: toDetectOffset(snapshot, clipOffset),
  end:   toDetectOffset(snapshot, clipOffset + clipLength),
});
```

Guardrails: if the clipboard offset falls *inside* an occurrence, refuse (do not silently
clamp); assert `start ≤ end ≤ detectText.length` before calling the verb.

### 3.2 Call site A — the insert path (`plugin-client.js:21-32`)

```js
const at = toDetectOffset(snapshot, snapshot.draft.length);   // detect coordinate, NOT draft.length
const accepted = input.insertReference({ source: SOURCE, ref, label: item.path,
  appearance: 'file', clipboardText: `[attachment: ${item.path}]` },
  { start: at, end: at, draftRev: snapshot.draftRev });
```

Also drop the `setDraft(`${snapshot.draft} `)` normalisation at `plugin-client.js:13-16`: it
rewrites the whole document (and the fixture does not establish that `setDraft` round-trips
chips), and it is unnecessary because `insertReference` already appends the separating space
"unless one is already next". If a separator really is wanted, let the host add it.

### 3.3 Call site B — the removal path (`plugin-client.js:43-60`)

```js
const remove = (sessionId, occurrence) => {
  const input = inputFor(sessionId);
  const snapshot = input.state.getSnapshot();
  if (snapshot.phase !== 'plain') return;
  // re-resolve from the FRESH snapshot: occurrenceId is the stable identity,
  // ref is the plugin-scoped key; never trust the render-time offsets.
  const live = snapshot.occurrences.find(o => o.occurrenceId === occurrence.occurrenceId)
            ?? snapshot.occurrences.find(o => o.ref === occurrence.ref);
  if (!live) { records.delete(occurrence.ref); changed(); return; }   // already gone host-side
  const { start, end } = toDetectRange(snapshot, live.offset, live.length);
  if (start === end) return;                                          // host rejects empty spans
  const consumed = input.consumeToken({ kind: 'span',
    span: { start, end, draftRev: snapshot.draftRev } });
  if (!consumed) {
    // host refused: keep the record and the chip, surface the failure, re-sync from the snapshot
    changed();                                    // re-render from live state, label stays a real size
    throw new Error('The DSH composer changed before the attachment could be removed');
  }
  records.delete(live.ref);
  changed();
};
```

Three changes, all required: (1) clipboard → detect conversion; (2) re-resolve the occurrence
from the fresh snapshot; (3) **check the return value** and delete the record only on `true`.
(3) is what makes `unavailable` impossible as a steady state.

### 3.4 Secondary defects worth fixing in the same change

* **Leftover separator space.** `consumeToken`'s span guard replaces exactly the chip's
  `U+FFFC`, so the space `insertReference` appended stays behind: removing the only chip
  leaves a draft of spaces rather than `""`. Decide deliberately — extend the span by one
  character when the next detect character is a space (verify against the host's own pick path
  first), or normalise the draft afterwards via `setDraft` — and pin the exact expected draft
  string in tests. (The fixture does not say whether the host trims, so this is flagged, not
  asserted.)
* **`unavailable` as a render state.** The dock should never render `unavailable` for a live
  occurrence. Reconcile `records` against `snapshot.occurrences` on every render and treat a
  record-less occurrence as a plugin bug (log it), not as a display state.
* **Invariant.** After every `changed()`, assert `records.size === occurrences.length` and that
  every occurrence's `ref` resolves. That single assertion would have caught bug #2 on the
  first click.

---

## 4. Regression test plan

Model the host from `host-input-facade.ts` (phase guard, `draftRev` CAS, `tail` lookup,
`$replaceDetectSpanWith…` bounds, detect/clipboard projection) — the fixture excerpts are
sufficient — and run these sequences. Each assertion below is one that would have failed on
v0.2.3.

**T1 — repeat interaction (bug #1)**

1. Fresh session, empty composer → paste `a.png`. Assert `insertReference` **accepted**; draft
   `"[attachment: a.png] "`; one occurrence `{offset: 0, length: 28}`; dock chip shows
   `humanBytes(size)`.
2. Paste `b.png` (no other interaction). Assert **accepted**, **no toast**; draft
   `"[attachment: a.png] [attachment: b.png] "`; two occurrences sorted by offset; both dock
   chips show their own sizes. *(fails on v0.2.3 — the toast)*
3. Paste `c.png`, then `d.png` back-to-back. Assert 4 chips, no toast, clipboard offsets
   `0 / 29 / 58 / 87`.
4. Type `"hello"` (no trailing space) then paste. Assert the separator is inserted by the host,
   the chip lands at the end, and no `setDraft` rewrite of the whole document occurs.
5. Paste while the composer already ends in whitespace. Assert exactly one separator space, not
   two.

**T2 — removal (bug #2)**

1. With ≥ 3 chips, click × on the **first** chip. Assert `consumeToken` returned `true`; the
   occurrence is gone from `occurrences`; the dock chip is **absent** (not `unavailable`); the
   record is deleted; the surviving chips keep correct labels/sizes. *(fails on v0.2.3)*
2. Click × on the **last** chip. Assert removed, and assert the **exact** resulting draft string
   (this is the leftover-separator-space guard from §3.4).
3. Click × on a **middle** chip. Assert the other chips survive with re-derived offsets.
4. After any removal, **paste again**. Assert the new chip lands at the true end of the document
   (catches the stale render-time offset in §2.3).
5. **Double-click** × on the same chip (two clicks before re-render). Assert the second click is
   a no-op: no exception, no `unavailable`, no phantom record, no duplicate `consumeToken`.
6. Remove the **only** chip. Assert `occurrences` is empty, `records` is empty, and a
   subsequent paste still works (offset 0 again — the state that hides the bug).
7. **Host refuses** (stub `consumeToken` to return `false`, or hold a snapshot across an
   external edit). Assert the record is **kept**, the chip still shows a real size label, an
   error is surfaced, and the UI re-syncs from the fresh snapshot. *(fails on v0.2.3)*
8. Invariant after **every** step of T1/T2: `records.size === occurrences.length` and every
   occurrence's `ref` resolves to a record.

**T3 — coordinate conformance (unit level, no host)**

* Property test over random drafts (0–4 chips, `clipboardText` of varying length, typed text
  before/between/after): for every occurrence, `toDetectRange` yields
  `0 ≤ start ≤ end ≤ detectText.length`, and mapping back returns the original clipboard range.
* Assert the invariant `detectText.length === draft.length − Σ(length − 1)` after every edit.
* Spy on the facade: record every `TokenSpan` handed to `insertReference`/`consumeToken` and
  assert it is in range for the current `detectText` — this is the assertion that makes the
  whole class of defect impossible to reintroduce.
* Assert the `draftRev` used in a span comes from the **same** snapshot as the offsets (no
  half-fresh reads).

---

## 5. What to check in the host source before calling input-machine verbs (maintainer routine)

1. **Identify the coordinate space of every value you pass.** For each verb, read its body and
   ask which projection it touches. `insertReference`/`consumeToken` splice **detect** text
   (`detectText`, `$replaceDetectSpan…`); `setDraft`/`InputState.draft`/`occurrences` are
   **clipboard** text. The JSDoc on `TokenSpan` ("detect coordinates") and on `detectText`
   ("chip = one U+FFFC") states this outright.
2. **Read the guard, not the signature.** Both verbs return `boolean` and can refuse for
   several reasons (phase, `draftRev` CAS, empty span, out-of-range splice). Always branch on
   the result; never fire-and-forget.
3. **Diff the contract types on every host upgrade.** `input.ts` and `projection.ts` define the
   meaning of `offset`/`length`/`draftRev`; a silent change there redefines numbers you
   already pass. Re-read them per release, not once.
4. **Copy the host's own caller.** Grep for other consumers of `insertReference`/`consumeToken`
   (the pick path) and mirror exactly how they build their spans — that is the reference
   implementation of the coordinate mapping.
5. **Watch version-gated fallbacks.** `typeof input.consumeToken === 'function'` silently
   promoted a clipboard-space fallback into a detect-space verb. Re-test every fallback branch
   on the current host, and prefer feature *detection with a conformance probe* over
   `typeof`.
6. **Make the error message diagnostic.** Include the computed span, the expected range and the
   revision in the thrown message; "the composer changed" cost a debugging cycle here.
7. **Keep a per-field coordinate note in the code** (`// detect coords` / `// clipboard coords`)
   next to every value crossing the plugin/host boundary, and assert it in tests (T3).

---

## Appendix A — how the diagnosis was verified

A behavioural model of `host-input-facade.ts` was written from the two excerpts (phase guard,
`draftRev` CAS, `detectText.slice(end, end+1)` tail lookup, `$replaceDetectSpanWithNodes/…WithText`
with out-of-range rejection, and the detect↔clipboard projection from `host-input-contract.ts`).

* Running the plugin's v0.2.3 logic against it reproduces `console-session.txt` exactly:
  paste #1 OK (draft `"[attachment: screenshot.png] "`, occurrence `{offset: 0, length: 28}`),
  paste #2 → `"The DSH composer changed before the attachment could be inserted"`, × →
  `consumeToken` returns `false`, record deleted, dock renders
  `[screenshot.png · unavailable · ×]` with the composer chip still present.
* Applying §3.1–§3.3: pastes #1–#4 all succeed with detect offsets `0 / 2 / 4 / 6`; removing the
  first, middle, last and only chip all succeed with no `unavailable`; a stubbed host refusal
  keeps the record and the chip.
* Property sweep: **3 750** remove operations across drafts of 1–4 chips with typed text before
  and after the chips — **0 failures**; the invariant
  `detectText.length === draft.length − Σ(length − 1)` holds in 400 randomized cases.

**Known limitation of the evidence:** the excerpts do not show `setDraft`'s parsing behaviour
(whether it round-trips chips), nor whether the host trims the separator space left behind by a
span consume. Both are called out as flagged questions in §3.2/§3.4 rather than assumed.

