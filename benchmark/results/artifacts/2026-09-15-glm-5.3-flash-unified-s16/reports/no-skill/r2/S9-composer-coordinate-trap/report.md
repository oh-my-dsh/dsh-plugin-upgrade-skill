# S9 diagnosis · `@org/dsh-attach-input` v0.2.3 on DSH 0.1.2-alpha.3 — composer coordinate trap

Evidence: `/app/fixture/plugin-client.js`, `/app/fixture/host-input-facade.ts`,
`/app/fixture/host-input-contract.ts`, `/app/fixture/console-session.txt`. Fixture untouched.

**Both symptoms are one bug**: the plugin computes `TokenSpan` coordinates in the
**clipboard-text projection** (`InputState.draft` / `Occurrence.offset|length`), but the host
verbs `insertReference` and `consumeToken` resolve every span against the
**detect-text projection** (`EditorProjection.detectText`), where a chip is a *single U+FFFC
character*. The two projections are identical only while the composer contains no chips.

---

## 1. Why paste #1 succeeds and every later paste fails

### The exact mismatch

`add()` builds the insert span from the published snapshot (plugin-client.js:28–31):

```js
start: snapshot.draft.length,
end:   snapshot.draft.length,
draftRev: snapshot.draftRev,
```

`InputState.draft` is explicitly the *clipboard-text* projection — "chips expanded to their
clipboard form" (host-input-contract.ts:28). But the facade consumes that span in *detect*
coordinates (host-input-facade.ts:18,24):

```ts
const tail = this.projection.detectText.slice(span.end, span.end + 1)   // detect space
...
applied = $replaceDetectSpanWithNodes(span, nodes)                      // detect space
```

and `EditorProjection.detectText` is "Trigger/TokenSpan coordinate text (**chip = one
U+FFFC**)" (host-input-contract.ts:37). So the plugin feeds clipboard-space offsets into a
guard/splice that indexes a detect-space string. The units are simply wrong.

### The numbers from the capture

| moment | clipboard `draft` (plugin's unit) | `detectText` (host's unit) |
|---|---|---|
| before paste #1 | `""` (0) | `""` (0) |
| after paste #1 | `"[attachment: screenshot.png] "` (29) | `"\uFFFC "` (2) |

- **Paste #1** — empty composer, no chips: both projections are the empty string, so
  `start = end = 0` is simultaneously valid in *both* coordinate systems. The revision CAS
  (`span.draftRev !== this.rev`, facade:17) passes, the splice at [0,0) succeeds, and the chip
  goes in. The bug is invisible precisely because nothing diverges yet.
- **Paste #2** — fresh `getSnapshot()` gives `draft.length = 29`, so the plugin sends
  span `[29, 29)`. The phase guard passes and the `draftRev` CAS **also passes** (nothing
  actually changed — the snapshot was read milliseconds earlier). The verb then probes
  `detectText.slice(29, 30)` → `""` and asks `$replaceDetectSpanWithNodes` to splice [29,29)
  inside a **2-character** document. The span does not resolve; `applied = false`;
  `insertReference` returns `false`; the plugin throws
  `The DSH composer changed before the attachment could be inserted` and rolls back the record
  (plugin-client.js:33–36). That toast text is itself a misdiagnosis baked into the plugin:
  a `false` return does not imply the revision changed — an unresolvable span produces the
  same `false`.

### Why "first works, later fails" is the signature of this mismatch

Clipboard and detect projections are character-for-character identical **only when the
document contains zero chips**. The first paste is the only paste that ever runs in that
state, so it is the only call where a wrong-unit coordinate happens to be numerically
correct. The first chip makes the projections diverge by `clipboardLen − 1` characters per
chip (here 29 vs 2), and from then on *every* `draft.length`-derived span lands past the end
of the detect document → deterministic rejection. A genuine race ("composer changed") would
be intermittent and order-dependent; a units mismatch is exactly this — first call clean,
every repeat call fails identically, forever.

---

## 2. Why the × click turns the chip into `unavailable` instead of removing it

Same misread, removal flavor, plus one bookkeeping defect. Step by step:

1. The dock hands `remove()` an `Occurrence`. Per contract (host-input-contract.ts:15–17),
   `occurrence.offset/length` are **clipboard-text** coordinates: `{offset: 0, length: 28}`
   for `[attachment: screenshot.png]`. The comment at plugin-client.js:47–48 — "the removal
   must span occurrence.length, not one character" — is true *in clipboard space* and is the
   author's contract misread: it is applied to a verb that consumes detect space.
2. The plugin sends `consumeToken({kind:'span', span:{start: 0, end: 28, draftRev}})`
   (plugin-client.js:50–54). In detect space the chip occupies exactly `[0, 1)` — one U+FFFC
   — inside a 2-char document.
3. Host guard (facade:38): `draftRev === this.rev` ✔ and `start !== end` ✔ — the cheap guards
   pass, so the verb attempts the splice: `$replaceDetectSpanWithText(span[0,28), '')` over a
   2-char detect document. The end bound is out of range, the edit does not apply, and
   `consumeToken` returns **false**. (The capture confirms no clamp-to-end happened: the
   composer chip is still present.) Had the geometry been different — e.g. plain text before
   the chip — the wrong-unit span could instead resolve and delete the *wrong* character
   range; both outcomes stem from the same wrong units.
4. The plugin **never inspects the return value** (the capture literally notes "not inspected
   by the plugin code"). Unconditionally it runs `records.delete(occurrence.ref)` and
   `changed()` (plugin-client.js:58–59).
5. Re-render: the dock iterates the snapshot's `occurrences` — the occurrence still exists
   because the composer chip was never removed — and looks up `records.get(occurrence.ref)`
   (plugin-client.js:63–65). The record was just deleted, so `record === undefined` and the
   meta branch renders **`unavailable`** instead of `humanBytes(record.total)`.

So the user sees: chip not removed (host rejected the span), dock chip still rendered (the
occurrence still exists), label now `unavailable` (local record deleted anyway), and the
composer chip untouched. The `?? 1` fallback on `occurrence.length` (plugin-client.js:49) is a
red herring — `length` is a required `number` in the contract; the problem is never its
absence, only its units.

Note the asymmetry with bug 1: in `add()` the plugin *does* handle `!accepted` (rolls the
record back); in `remove()` it treats the verb as fire-and-forget, which converts a rejected
edit into permanent dock/model desync.

---

## 3. Fix direction

### The conversion rule (derived from the host excerpts, not guesswork)

The contract defines the two spaces (host-input-contract.ts:15–17, 26–28, 35–42):

- detect space (`detectText`): a chip contributes exactly **1** character (U+FFFC);
- clipboard space (`InputState.draft`, `Occurrence.offset/length`): a chip contributes
  **`occurrence.length`** characters (= `clipboardText.length`, insert-time cache).

Therefore, for any clipboard-space offset `x`:

```
toDetect(x) = x − Σ (occ.length − 1)   for every occurrence occ fully at or before x
                                       (occ.offset + occ.length ≤ x)
```

i.e. subtract one phantom character per chip that precedes the point. Sanity check against the
capture: end-of-draft for paste #2 → `toDetect(29) = 29 − (28 − 1) = 2 = detectText.length` ✔.

Corollary for removal: a chip's detect-space extent is **always exactly 1 character** —
never `occurrence.length`. That is the rule the plugin's comment gets backwards.

If the host exposes the published `EditorProjection` to plugins, prefer reading
`detectText` directly and deriving spans from it; otherwise the arithmetic above on
`snapshot.occurrences` is exact and needs no extra API.

### Call site 1 — insert path (`add`, plugin-client.js:21–32)

Replace the clipboard-length span with a converted detect span, recomputed from the *fresh*
snapshot on every loop iteration (the snapshot is re-read at plugin-client.js:37, so
conversion must happen after that too):

```js
snapshot = input.state.getSnapshot();
const detectEnd = toDetect(snapshot.draft.length, snapshot.occurrences); // 29 → 2 after chip #1
const accepted = input.insertReference({ /* ...unchanged... */ }, {
  start: detectEnd,
  end: detectEnd,
  draftRev: snapshot.draftRev,
});
```

Keep the existing `!accepted` rollback (it already deletes the record); after this fix a
`false` really does mean a lost revision race, and the toast text becomes accurate. Optionally
compute the tail-space case the way the host does (`detectText` char at `end`) if the
projection is reachable, but the host already handles separator insertion.

### Call site 2 — removal path (`remove`, plugin-client.js:49–54)

Span the chip's single detect character, not the clipboard range:

```js
const start = toDetect(occurrence.offset, snapshot.occurrences);
const accepted = input.consumeToken({
  kind: 'span',
  span: { start, end: start + 1, draftRev: snapshot.draftRev },  // 1 U+FFFC, NOT occurrence.length
});
```

(Optional polish: extend `end` by 1 when the following detect char is `' '`, to also swallow
the host-inserted separator — but `start+1` alone is already correct.)

### Bookkeeping fix (required so the dock can never lie)

Honor the verb result in `remove()`: only `records.delete(occurrence.ref)` + `changed()` when
`consumeToken` returned `true`; on `false`, leave the record intact (optionally re-sync the
dock from a fresh snapshot). With correct coordinates `false` becomes rare, but the
`unavailable` state must be unreachable by construction, not by hope.

---

## 4. Regression test plan

Assertion targets: `insertReference`/`consumeToken` return values, snapshot
(`draft`, `occurrences.length`, offsets/lengths), rendered dock chips and their meta labels,
and absence of the toast.

**A. Repeat-paste sequence (bug 1)**
1. Fresh session, empty composer → paste screenshot #1: assert return `true`, 1 occurrence
   `{offset:0, length:28}`, `draft === "[attachment: screenshot.png] "`, one dock chip with a
   byte-size label, no toast.
2. **Without clearing**, paste screenshot #2: assert return `true`, **no toast**, 2
   occurrences in offset order, both chips present in the composer *and* the dock, `draft`
   contains both clipboard expansions separated by one space.
3. Paste #3 with two chips present: same assertions (generalize to n pastes → n occurrences).
4. Paste into a non-empty typed draft (`"hello "` then paste; and once with no trailing
   space): chip appended after the draft, draft text preserved, single separator space.
5. Multi-item single paste (2 files in one `add` call): both chips inserted, both records kept.
6. Negative control (guard must still work): mutate the composer between `getSnapshot()` and
   `insertReference` (stale `draftRev`) → assert return `false`, toast shown, **no orphan
   record and no orphan dock chip**.

**B. Removal sequence (bug 2)**
1. Insert two chips → click × on chip #1: assert `consumeToken === true`, chip #1 gone from
   composer, chip #2 intact, `occurrences.length === 1`, dock shows exactly one chip whose
   meta is the **byte size** (the string `unavailable` must never appear), record map empty.
2. Insert three chips → remove the middle one: only the middle chip gone; remaining
   occurrences' offsets/lengths re-published correctly.
3. Remove-last chip: composer draft `=== ''`, zero occurrences, dock empty.
4. Remove then re-paste in the same session: the new insert succeeds (catches residual
   offset drift after removal).
5. Stale-guard unit case: force `draftRev` mismatch for a removal → assert return `false`,
   record **kept**, dock still shows the byte-size label (no `unavailable`), chip still in
   composer.

**C. Converter invariants (unit/property tests)**
1. For any snapshot, `toDetect(draft.length) === detectText.length` (end always maps to end).
2. For every occurrence, its detect span is `[toDetect(occ.offset), toDetect(occ.offset)+1)`.
3. Property test: random interleavings of inserts/removes/typed edits; after each step assert
   clipboard `draft` and detect projection remain consistent with `occurrences`, and every
   subsequent verb call succeeds.

**D. Exact reported reproductions must pass verbatim**
- capture lines 4–10 and 12–15 (paste, paste → no toast, 2 chips);
- capture lines 17–21 (paste, × → chip removed everywhere, label stays `48.2 KiB`-style bytes,
  never `unavailable`).

---

## 5. Routine host-source checks before calling input-machine verbs (unscored guidance)

1. **Pin the coordinate space of every coordinate-bearing argument** by reading the verb's
   implementation, not its name: here one grep for `detectText` / `$replaceDetectSpanWith*`
   in the facade would have shown both verbs splice the *detect* projection.
2. **Cross-check the published types' doc comments against verb arguments**:
   `InputState.draft` = clipboard projection, `Occurrence.offset/length` = clipboard
   projection, `detectText` = TokenSpan space. If a snapshot field and a verb parameter
   don't cite the same projection, a conversion is mandatory — write one named helper
   (`toDetect`) with a comment citing the host file and lines.
3. **Enumerate every `return false` path in the verb** and decide in the plugin what each
   means; never treat `false` as a single "composer changed" condition (the toast text here
   was wrong for the invalid-span case), and never ignore a verb's boolean (`remove()` did).
4. **Read the splice helpers' behavior for out-of-range spans** (fail vs clamp vs throw) so
   you know which wrong-unit failure mode to expect.
5. **Test the second and later interaction, not just the first**: coordinate/unit bugs are
   masked while the document has zero projection-diverging entities (chips). "First call
   works, every repeat fails" should be a recognized release-blocker signature.
6. **Re-verify on every host upgrade** (you're on an alpha, `0.1.2-alpha.3`): diff the
   contract/facade excerpts for changes to span semantics, guard order, or return semantics
   before re-releasing the plugin.
