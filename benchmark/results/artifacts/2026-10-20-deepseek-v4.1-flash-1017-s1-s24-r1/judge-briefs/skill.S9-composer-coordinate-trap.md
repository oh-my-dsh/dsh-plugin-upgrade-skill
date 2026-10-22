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

# S9 · Composer Coordinate Trap — diagnosis and fix plan

**Subject**: `@org/dsh-attach-input` v0.2.3 on DSH `0.1.2-alpha.3` (Web Client)
**Evidence**: read-only fixture pack only (`README.md`, `plugin-client.js`, `console-session.txt`, `host-input-facade.ts`, `host-input-contract.ts`). No host execution was possible in this run; every statement below is traced to a line in that pack, and the numbers are the ones in the capture.
**Mode**: read-only diagnosis (plugin-upgrade Mode A). No file in `fixture/` was touched.

---

## 0. Verdict

Both symptoms are **one** contract misread, not two bugs.

The host input machine keeps the composer document in **two different text projections** and the plugin treats them as one:

| Projection | What a chip is | Who uses it |
|---|---|---|
| `clipboardText` / `InputState.draft` | the full clipboard string, e.g. `[attachment: screenshot.png]` (28 chars) | persistence, `InputState`, `Occurrence.offset` / `Occurrence.length` |
| `detectText` | **exactly one** `U+FFFC` object-replacement char | every `TokenSpan` argument: `insertReference(ref, span)`, `consumeToken({span})`, and the internal `$replaceDetectSpan*` splices |

`host-input-contract.ts:14` and `:16` say `Occurrence.offset` / `length` are "Offset/Length **in the clipboard-text projection**"; `:26` says `InputState.draft` is the "clipboard-text projection"; the verb JSDoc in `host-input-facade.ts:11` says the span is a "**pick-time span snapshot (detect coordinates)**", and `:18` slices `this.projection.detectText`; `:36-43` hands the guard span straight to `$replaceDetectSpanWithText`, which splices the **detect** text (per the header comment at `:3-4`).

The plugin computes **every** span from `snapshot.draft.length` / `occurrence.offset` / `occurrence.length` — i.e. in clipboard coordinates — and passes those numbers to detect-coordinate verbs (`plugin-client.js:29-31, 49-53`). A chip is 28 chars wide in one space and 1 char wide in the other, so the numbers agree **only while the composer holds no chip at all**.

- Symptom 1 is that identity collapsing: empty composer ⇒ offset 0 == 0 ⇒ paste #1 works; one chip ⇒ 27 chars of drift ⇒ every later span is out of range ⇒ verb returns `false` ⇒ the "composer changed" toast.
- Symptom 2 is the same arithmetic on the way out: a removal span of `[0, 28)` is fed into a 2-char detect document; the splice cannot apply and returns `false`, and the plugin **ignores that return value** and deletes its bookkeeping record anyway ⇒ the host occurrence survives (chip stays) while `records` no longer has the ref ⇒ the dock renders its "no record" fallback, `unavailable`.

The rev currency is *not* wrong: `InputState.draftRev` is documented as the very value "span CAS compares against" (`host-input-contract.ts:28-29`), and the host compares it to the same `this.rev` (`host-input-facade.ts:17, 38`). Only the **geometry inside the span** is in the wrong space. That distinction is what makes the failure reproducible on the second paste instead of randomly.

---

## 1. Why paste #1 succeeds and every later paste fails

### 1.1 The exact mismatch

`plugin-client.js:29-31` sends:

```js
{
  start: snapshot.draft.length,   // 29 after paste #1  (clipboard text, chips expanded)
  end:   snapshot.draft.length,   // 29
  draftRev: snapshot.draftRev,    // correct currency
}
```

and `host-input-facade.ts:17-18` evaluates it against a different string:

```ts
if (span.draftRev !== this.rev) return false
const tail = this.projection.detectText.slice(span.end, span.end + 1)
...
applied = $replaceDetectSpanWithNodes(span, nodes)   // splices the DETECT text
```

So the mismatch is precisely: **the plugin supplies a clipboard-text index where the host compares a detect-text index.** The host never validates the range; it just splices, and the splice is a no-op/failure at offset 29 of a 2-character string, so `applied` stays `false` and `insertReference` returns `false` (`host-input-facade.ts:24-26`).

The plugin maps that single `false` to the message "The DSH composer changed before the attachment could be inserted" (`plugin-client.js:33-36`). That sentence is a *guess*: the facade returns `false` for three unrelated reasons — wrong phase (`:15-16`), rev mismatch (`:17`), or splice failure (`:24`) — and in this capture it is the third. Phase was `plain` (the plugin's own check at `plugin-client.js:12` passed) and the rev matched (the plugin had just re-read the snapshot). The toast therefore mislabels a coordinate error as a race, which is why reading the plugin code alone cannot reproduce the logic: nothing "changed" between snapshot and verb.

### 1.2 Why "first works, later fails" is the signature

Both projections agree **iff there is no chip**, because with zero occurrences `draft` and `detectText` are the same characters. Each chip injects a constant drift:

```
detectOffset(p) = p - Σ (occurrence.length - 1)   over occurrences wholly before p
```

With `clipboardText = "[attachment: screenshot.png]"` the drift is **27 chars per chip**. In an empty composer every term is zero and `start = end = 0` is simultaneously a legal detect span — the plugin's buggy formula is accidentally correct exactly once. From the second interaction onward the endpoint it computes always lands past the end of `detectText`, so **every** subsequent paste fails, regardless of what the user does, and it fails at the *same* place every time (deterministic, not flaky). A genuine rev race would be intermittent and would also fail paste #1 sometimes; a coordinate-space error fails monotonically after the first chip. That asymmetry is the fingerprint.

Replaying the capture:

| Step | `draft` (clipboard) | `len` | occurrences (clipboard) | drift Σ(len−1) | `detectText` | `len` | span the plugin sends | span that would be legal |
|---|---|---|---|---|---|---|---|---|
| fresh | *(empty)* | 0 | [] | 0 | *(empty)* | 0 | `{0,0}` | `{0,0}` ✔ (identity — this is why #1 works) |
| after paste #1 | `[attachment: screenshot.png] ` | 29 | `[{0,28}]` | 27 | `U+FFFC + " "` | 2 | — | — |
| paste #2 | 29 | 29 | `[{0,28}]` | 27 | 2 | 2 | `{29,29}` → **invalid** | `{2,2}` |
| after a fixed #2 | 58 | 58 | `[{0,28},{29,28}]` | 54 | `U+FFFC " " U+FFFC " "` | 4 | — | `{4,4}` |

(The capture's own numbers corroborate the model: `console-session.txt:8-9` reports `draft` length 29 with an occurrence `offset 0, length 28` — 29 − (28−1) = 2, and the host's detect text after one chip is exactly one `U+FFFC` plus the separator space the facade appends at `host-input-facade.ts:23`.)

### 1.3 Three secondary defects on the same path (same root cause)

1. **Batch paste partially commits.** `add()` loops over `items` (`plugin-client.js:17-38`). Item 1 gets the empty-composer span and lands; item 2 reuses the freshly re-read snapshot but still computes `draft.length`, so it fails, throws out of `add()`, and `changed()` (`:39`) never runs. Result: one chip in the host document, one record in `records`, and a dock that has not re-rendered — a state the user cannot reconcile by hand. So "paste one file works, paste two files is broken" is the same bug one keystroke earlier.
2. **The entity that fails is not identified.** Because `false` is reported as "composer changed", a user retries the paste, which cannot work, and support gets a race report instead of a geometry report.
3. **Record rollback is right on insert** (`records.delete(ref)` before throwing) — which is why paste #2 leaves no orphan chip anywhere: the plugin's half is clean, the host's half was never touched. That asymmetry (insert rolls back, remove does not — §2.3) is itself evidence that the author believed the verb had not applied, not that the coordinates were wrong.

---

## 2. Why the × click yields `unavailable` instead of removal

### 2.1 The trace, line by line

1. `remove()` takes a fresh snapshot (`plugin-client.js:45`) and requires `phase === 'plain'` (`:46`) — satisfied here.
2. It computes the removal span from the occurrence (`:47-49`): `end = occurrence.offset + occurrence.length = 0 + 28 = 28`, span `{start: 0, end: 28, draftRev}`. The in-code comment states the misread explicitly: *"The occurrence owns its whole inline range, so the removal must span occurrence.length, not one character."* That sentence is true **in clipboard coordinates** and false in detect coordinates, where the chip is exactly one `U+FFFC`.
3. It calls `consumeToken({ kind: 'span', span })` (`:50-54`) and **discards the boolean**. The capture records exactly this: `console-session.txt:18` — "consumeToken(...) returned (not inspected by the plugin code)".
4. Host side (`host-input-facade.ts:36-43`): the span guard is only **rev CAS** (`:38`) plus **non-empty** (`guard.span.start === guard.span.end`). It performs **no range validation against `detectText`**. Here `0 !== 28` and the rev matches, so the guard passes and execution reaches `$replaceDetectSpanWithText({0,28}, '')` inside `applyEdit`. A 28-char span on a 2-char detect string cannot be applied ⇒ `applied` is `false` ⇒ `consumeToken` returns `false`. **No occurrence changed.**
5. The plugin nevertheless runs `records.delete(occurrence.ref)` (`plugin-client.js:58`) and `changed()` (`:59`).
6. The dock re-renders from the **host occurrence list**, not from `records` (`:63-65`): `const record = records.get(occurrence.ref)` … `record === undefined ? 'unavailable' : humanBytes(record.total)`. The occurrence is still there, its record is gone ⇒ the chip stays mounted and its size label degrades to `unavailable`; the composer chip is untouched because no edit ever applied. That is `console-session.txt:19-20` verbatim: chip STILL rendered, meta `unavailable`, composer chip still present, `records` no longer contains the ref.

### 2.2 Same misread, not a second bug

The removal span is wrong for the identical reason the insert span is wrong: a length that counts clipboard characters (28) is used where the document counts one character per chip (1). Both numbers come from the same two fields the host publishes in clipboard coordinates, and both verbs consume detect coordinates. The insertion formula's error is `draft.length` vs `detectText.length`; the removal formula's error is `occurrence.length` vs `1`. Both are the drift `Σ(clipboardText.length − 1)`, measured at one point (insert) or over one chip (remove). Fix the mapping once and both symptoms disappear; fix them separately and one of them will regress.

### 2.3 The bookkeeping half (which makes it look like a second bug)

The misread alone would be a silent no-op. What turns it into "the chip lies to me" is the plugin's state discipline:

- **Remove commits on failure; insert rolls back on failure.** `add()` deletes the record only when the verb *refused* (`:33-36`), while `remove()` deletes it unconditionally (`:58`). Same file, opposite assumption about what a `false` return means.
- **`records` is treated as the source of truth instead of a cache.** The dock renders one chip per **host occurrence** and reads `records` only for the meta (`:63-65`), so any divergence shows up as permanent `unavailable` rather than as a missing chip.
- **The fallback hides the defect.** `'unavailable'` is the renderer's "no record" branch, but it is displayed in the position where a size belongs; a user reads it as "the file became unavailable", and a developer reads it as a host-side data problem. Had that branch rendered nothing, or logged "`orphan occurrence`", the desync would have pointed at `records` immediately.
- **There is no reconciliation in the other direction either.** If the host removes a chip by any route that is not this × (select-all + delete, `setDraft('')`, undo, session reset), the occurrence disappears while the record stays ⇒ a leaked `Map` entry holding `item.file` bytes for the life of the page. `records` is module-level (`:3-5`) and nothing in the excerpt clears it on session change.
- **The record key is the bare `ref`**, not `(source, ref)`; the occurrence is also addressable by `occurrenceId`, which is described as the shell-assigned stable identity (`host-input-contract.ts:8-10`). Two pluggable sources can mint colliding refs, and a ref is owner-scoped by contract (`:12-13`) — worth tightening while in this code.
- **`remove()` returns silently when `phase !== 'plain'`** (`:46`): the × does nothing at all, with no user feedback, during exactly the window in which a chip most needs removing.

---

## 3. Fix direction

### 3.1 The rule (derived from the host source, not from experiment)

From `host-input-contract.ts:36-41` the host itself publishes the two projections side by side and states in the type comments what each one is: a chip is one `U+FFFC` in `detectText` and its `clipboardText` in `clipboardText`; and `projection.occurrences` is the "**InputState-compatible** occurrence view (**clipboardText coordinates**)". From `host-input-facade.ts:11` and `:3-4` the `TokenSpan` parameter of both verbs, and the splice that consumes it, are in detect coordinates. The conversion is therefore a pure document-space change of basis:

```
// clipboard-text index -> detect index. A chip collapses from clipboardText.length chars
// to exactly one U+FFFC, so subtract (length - 1) for every chip that ends at or before p.
// occurrences are sorted by offset (InputState JSDoc).
function toDetect(occurrences, p) {
  let drift = 0
  for (const o of occurrences) {
    if (o.offset + o.length <= p) drift += o.length - 1
    else if (o.offset < p) return o.offset - drift   // p inside a chip: snap to its lead char
    else break
  }
  return p - drift
}

// end of document in detect coordinates; == projection.detectText.length
const detectEnd = (s) => toDetect(s.occurrences, s.draft.length)
```

Two invariants make it checkable at runtime rather than by eye:

- `toDetect(s.occurrences, s.draft.length) === s.draft.length - Σ(o.length - 1)`, i.e. **detect length = draft length − total chip drift**; with the capture's numbers 29 − 27 = 2.
- A chip's detect width is **exactly 1**: for occurrence `o`, the removal span is `[toDetect(o.offset), toDetect(o.offset) + 1)`.

If the plugin can reach the host's `EditorProjection` (it is the published projection product, `host-input-contract.ts:34-42`), read `detectText.length` directly instead of deriving it — that is the only value the host itself splices. The derivation above is the fallback for the published `InputState`, which does not carry `detectText` (`:25-32`); it is not a heuristic, it is the same mapping the host applies when it builds the two strings.

**What must *not* be converted**: `draftRev`. It is the host's monotonic editor revision and the verb compares it to the same `this.rev` (`host-input-contract.ts:28-29`, `host-input-facade.ts:17, 38`). It travels as-is; converting or re-deriving it would turn a deterministic bug into a real race.

### 3.2 Call site 1 — insert (`plugin-client.js:21-37`)

```js
for (const item of items) {
  const ref = id()
  const record = { ref, sessionId, items: [item], total: item.file.size, label: item.path, status: 'ready' }
  records.set(ref, record)

  const snap = input.state.getSnapshot()          // fresh per item: every insert bumps rev and length
  const at = detectEnd(snap)                      // <-- detect coordinates, not snap.draft.length
  const accepted = input.insertReference(
    { source: SOURCE, ref, label: item.path, appearance: 'file', clipboardText: '[attachment: ' + item.path + ']' },
    { start: at, end: at, draftRev: snap.draftRev },
  )
  if (!accepted) {
    records.delete(ref)                           // rollback stays: the host applied nothing
    throw new Error(describeRefusal(snap, input.state.getSnapshot()))
  }
  changed()
}
```

- Move the snapshot read **inside** the loop; the pre-loop snapshot is only good for the first item (it is also what makes the batch case in §1.3 fail).
- Keep the trailing-space normalisation (`:13-16`) but re-read after it, as today; it changes `draft.length` by one and therefore changes `detectEnd`.
- Replace the fixed message with a discriminator: re-read the snapshot and report *phase*, *rev advanced* (span.draftRev ≠ new draftRev ⇒ genuine concurrent edit, one bounded retry is defensible) or *geometry* (rev unchanged, verb still refused ⇒ the span was not legal). The current text asserts the one cause that did not happen.
- If a retry is added, bound it to a single re-derive-and-retry on rev advance and never loop: the verb's only side effect on failure is none, so one retry is idempotent.

### 3.3 Call site 2 — remove (`plugin-client.js:43-60`)

```js
const remove = (sessionId, occurrence) => {
  const input = inputFor(sessionId)
  const snap = input.state.getSnapshot()
  if (snap.phase !== 'plain') return fail('input busy, attachment not removed')

  const start = toDetect(snap.occurrences, occurrence.offset)   // chip lead char in detect space
  const ok = input.consumeToken({
    kind: 'span',
    span: { start, end: start + 1, draftRev: snap.draftRev },    // exactly one U+FFFC
  })

  const after = input.state.getSnapshot()
  const stillThere = after.occurrences.some((o) => o.source === occurrence.source && o.ref === occurrence.ref)
  if (ok || !stillThere) {          // host truth is authoritative either way
    records.delete(occurrence.ref)
    changed()
    return true
  }
  // refused and the chip is still in the document: keep the record, surface it, do not lie
  changed()
  return fail('attachment chip could not be removed; retry or clear the composer')
}

// invariant guard, dev builds: host truth must be mirrored, never invented
const reconcile = (snap) => {
  const live = new Set(snap.occurrences.map((o) => o.ref))
  for (const ref of records.keys()) if (!live.has(ref)) records.delete(ref)   // host removed it elsewhere
}
```

Three changes, all required together:

1. **geometry**: `start = toDetect(...)`, `end = start + 1` (the chip is one char here — delete the comment that says the opposite).
2. **return value**: the boolean is now part of the contract; `records.delete` only on success, or on proof from the host snapshot that the occurrence is gone.
3. **reconciliation**: `records` becomes a cache over `snapshot.occurrences`. Prune on every render/snapshot, and drive the dock from occurrences alone. That also fixes the reverse desync (host-side clear/undo/session reset leaking `File` handles) and makes `unavailable` unreachable in normal operation, which is the state you want: if it ever appears, it is a real bug signal, not a user-facing label.

The same `toDetect` helper must be the *only* place that converts, exported for tests, with no second copy of the arithmetic at either call site.

### 3.4 Also worth fixing while there

- Key `records` by `(sessionId, source, ref)`, and drop entries when the session is disposed.
- Have `remove()` report the `phase !== 'plain'` case instead of returning `undefined` silently (`:46`).
- Add the dev-only assertion `toDetect(s.occurrences, s.draft.length) === detectedLength(s)` at the entry of both paths, so a future host change fails loudly at the boundary rather than as a toast.

---

## 4. Regression test plan

### 4.1 Layers

1. **Projection-contract unit tests** (fast, no host). A test double must model the host faithfully: a document of text nodes and chip nodes; `draft` = chips expanded to `clipboardText`; `detectText` = chips as one `U+FFFC`; `insertReference` / `consumeToken` **splice the detect string and return a boolean**, with the host's real guard order (phase → rev → non-empty → splice). A double whose "detect text" is just `draft` would make every test below pass while the shipped bug remains — that is the single most important property of the harness.
2. **Real-host e2e** (scripted browser against a real DSH Web profile): paste from the clipboard, click the dock ×, and assert on the **host document and the rendered DOM**, never on the plugin's own `records` (a test that reads the plugin's map cannot see a desync between map and document).
3. **Assertion style**: every assertion states the expected detect geometry as a number, so the test fails on the arithmetic and not merely on "an error was shown".

### 4.2 Test matrix — the sequences that must exist

| ID | Exact sequence | Assertions (host-side where possible) | Locks |
|---|---|---|---|
| T1 | paste file A into empty composer | `insertReference` received `{0,0,draftRev}`; returns true; detect = `U+FFFC + " "`; `draft` = `[attachment: A] `; one occurrence `{0, len(A)}` | baseline |
| T2 | paste file A, then file B (same tab, no edit in between) | second span is `{toDetect(...), toDetect(...)}` = **2**, not 29; accepted; two occurrences; dock shows two chips with sizes, **no toast** | symptom 1 |
| T3 | three consecutive pastes | accepted spans follow `0, 2, 4, …`; `draft.length` − Σ(len−1) equals the emitted endpoint each time | drift accumulates |
| T4 | type `hello`, then paste | span = 5; chip lands after the text; `draft` = `hello[attachment: A] ` | conversion on plain text |
| T5 | one paste event carrying two files | both chips land in order; two records; dock rendered once (assert `changed()` ran); no partial commit | §1.3 batch |
| T6 | paste A, click × on the single chip | `consumeToken` got `{start, start+1}` (1-char span); returns true; occurrence gone; `draft` = `""`; dock chip unmounted | symptom 2 |
| T7 | paste A, paste B, click × on the **second** chip | span = `[2,3)`; only B's occurrence removed; A's chip, A's size label and `draft` intact | offset ≠ 0 |
| T8 | paste A, type ` tail`, click × | only the chip is removed; the trailing text survives verbatim (guards against an over-wide span) | data loss |
| T9 | force a refusal (stale `draftRev`, or `phase = 'claimed'`) on × | returns false; **record retained**; chip still rendered **with its size**, never `unavailable`; a user-visible error or retry; dock and host agree | bookkeeping |
| T10 | **paste A → × → paste A again** | × succeeds; the re-paste computes span 0 again and is accepted; exactly one chip and one record at the end | the cross-sequence; both bugs in one test |
| T11 | paste A → × → one paste of B and C | both accepted; chips at 0 and 2 `U+FFFC`; no toast | interaction of both paths |
| T12 | snapshot, type a char from outside the plugin, then paste | refused with a **rev** diagnosis (not "geometry"); no orphan record, no chip; exactly one bounded retry path exercised | keeps the race case honest |
| T13 | paste A, then clear the composer host-side (select-all delete / `setDraft('')`) | occurrence gone ⇒ dock chip gone, record pruned; `records.size` back to 0; no `unavailable` | reverse desync / leak |
| T14 | sessions S1 and S2, chip in each; × in S1 | S2's chip and record untouched; no cross-session delete | key scoping |
| T15 | property test: ~200 random documents (k chips, random labels/lengths, random text runs) | for every insertion point p: `toDetect` is monotonic, maps each chip to exactly 1, and equals the double's `detectText.length` at the end; every generated removal span deletes exactly one chip | the rule itself |

### 4.3 The three tests that must block a release

T2 (second paste), T6 (× on the only chip) and T10 (paste → × → paste) — because T2 and T6 each reproduce one shipped symptom and T10 is the only one that proves both fixed paths compose. T7, T8 and T9 must also be green before publishing, since they are the ones that distinguish "the offset happened to be 0" and "the span happened to be the whole draft" from a correct fix.

### 4.4 What the plan must not rely on

- Not on the absence of a toast: a plugin that swallows the refusal passes that check (that is exactly the shipped × behavior).
- Not on `records`: assert the host document and the DOM.
- Not on a single-paste happy path: it is the one case where the wrong formula is right.

---

## 5. Routine host-source check before calling input-machine verbs (guidance, unscored)

1. **Open the verb, not the docs.** Read the facade body (`.../client/input/facade.ts`) top to bottom and write down, per line: the phase gate, the rev CAS, the coordinate space of every string it slices, and every condition that returns `false`. Here `host-input-facade.ts:17-18` is the whole answer in two lines — `span.draftRev` against `this.rev`, and `span.end` against `this.projection.detectText`.
2. **Read the field JSDoc, and record the projection as part of the field's type.** Every value in the contract names its space ("in the clipboard-text projection", "detect coordinates", "InputState-compatible"). Treat "which projection" as part of the unit, like milliseconds vs seconds: never infer it from the variable name — `draft.length` reads like an editor offset and is not one.
3. **Check whether the verb validates geometry at all.** These two do not: the span guard is rev + non-empty only (`host-input-facade.ts:38`). With no range check, a wrong span fails silently or, on a clamping build, deletes the wrong range. Ownership of range validity is therefore the caller's.
4. **Ask what a chip is worth in each space, and assert it in a test.** One `U+FFFC` here, `clipboardText.length` there. Two numbers, one document.
5. **Read the return type as part of the contract.** Boolean verbs must have their result consumed; document at the call site which of the verb's failure branches the message means, or print the discriminator (phase / rev / geometry) as in §3.2.
6. **Check the mutation surface between snapshot and verb.** Every `setDraft` / insert / consume bumps `draftRev` and changes lengths, so a snapshot taken before a mutation is stale for both rev and geometry: re-read after every plugin-side edit and per loop iteration.
7. **Check the addressing identity.** `occurrenceId` is the shell-assigned stable identity; `ref` is owner-scoped; offsets are coordinates, not ids. Key cross-render bookkeeping by identity and treat the host's occurrence list as the only truth.
8. **Re-run the two-paste + × + re-paste smoke after every host bump**, and do it in a real browser: the nearest ledger cards — **DSH-0.1.2-A1-28** (the composer edit surface moved to a contenteditable implementation; plugin code that reasons about the old textarea/whole-text model keeps compiling) and **DSH-0.1.3-A1-08** (composer/upload surfaces churn at runtime with no client API change) — both warn that green typecheck is not evidence for this area. Neither card documents the two-projection `TokenSpan` split, so per the skill's rule (cards are a curated list, not a complete diff) this edge must be treated as **pending/unsupported** and closed from primary source, not from memory.
9. **Install one runtime invariant in dev builds** — `detectLength === draft.length − Σ(len−1)`, and every emitted span satisfies `0 ≤ start ≤ end ≤ detectLength` — so the next contract drift raises on the boundary instead of surfacing as a user-facing toast.
10. **Prefer the host's own projection over a re-derivation** wherever it is reachable: the plugin should echo `detectText.length`, not rebuild it. A derived coordinate can be wrong in exactly one place and stay wrong silently; a read coordinate cannot.

---

## Appendix A · Confidence and gaps

- Every claim above is anchored in one of the five fixture files; the arithmetic is checked against `console-session.txt:8-9` (draft 29 / occurrence 28 ⇒ detect 2), which independently confirms the rule.
- Not observable from a static pack: the exact behavior of `$replaceDetectSpanWithNodes` / `$replaceDetectSpanWithText` when the span exceeds the document (no-op vs clamp). The capture proves the effect — occurrence unchanged, `consumeToken` false, chip still present (`console-session.txt:20`) — so the diagnosis does not depend on which variant the host implements. If it clamps, the same bug becomes a **data-loss** bug instead of a no-op; that is an argument for fixing the geometry, not against.
- `plugin-client.js:12, 46` read `snapshot.phase`, while the facade reads `this.core.state.phase` (`host-input-facade.ts:15`) and the trimmed `InputState` does not list a `phase` field. Treated as an artefact of the excerpt's trimming ("trimmed to the fields the plugin reads", `host-input-contract.ts:3-4`); worth confirming against the full published type before release, but it is not part of either reported symptom.
- Fixture left byte-identical; no host process, install, network, or skill/evaluator file was touched.


## Required output (JSON only)
{"decisions":[{"id":"<criterion-id>","verdict":"pass|partial|fail|missing","reason":"short"}],"caps":[{"id":"<cap-id>","triggered":false,"reason":"short"}]}
Every criterion and cap exactly once. pass=full points, partial=half, fail/missing=0; a triggered cap caps the total.