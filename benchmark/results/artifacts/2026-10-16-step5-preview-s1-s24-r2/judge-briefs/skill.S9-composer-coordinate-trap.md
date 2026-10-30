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

# S9 · Composer Coordinate Trap — diagnosis report

**Subject:** `@org/dsh-attach-input` v0.2.3 running on DSH `0.1.2-alpha.3`
**Evidence (read-only, unchanged):** [fixture/plugin-client.js](fixture/plugin-client.js) · [fixture/console-session.txt](fixture/console-session.txt) · [fixture/host-input-facade.ts](fixture/host-input-facade.ts) · [fixture/host-input-contract.ts](fixture/host-input-contract.ts)
**Verdict:** **one** root cause, not two bugs. The plugin computes span geometry in the host's
**clipboard-text projection** and feeds it to verbs whose guards splice the **detect-text
projection**. The insert path happens to *check* the verb's boolean, so the mismatch surfaces as
a toast; the removal path *discards* it, so the same mismatch surfaces as a permanently stuck
`unavailable` chip. Both reported symptoms are the two observable faces of one contract misread.

---

## 1. The two coordinate spaces the host keeps

| | **detect text** | **clipboard text** |
|---|---|---|
| host field | `EditorProjection.detectText` | `EditorProjection.clipboardText` ≡ `InputState.draft` |
| one chip is | exactly **one `U+FFFC`** | its full `clipboardText` string (28 chars for `[attachment: screenshot.png]`) |
| who consumes it | `TokenSpan` guards — `insertReference` and `consumeToken` both splice the **detect** text | persistence, and the published `Occurrence.offset` / `Occurrence.length` |
| can the plugin read it? | **no** — `InputState` publishes no detect geometry | **yes** — `snapshot.draft`, `snapshot.occurrences[i].offset/length` |

Evidence: [host-input-contract.ts:36-41](fixture/host-input-contract.ts#L36-L41) — `detectText` is "Trigger/TokenSpan coordinate text (chip = one U+FFFC)", `clipboardText` is "Persistence/InputState draft text (chip = clipboardText)", `occurrences` is the "InputState-compatible occurrence view (clipboardText coordinates)"; [host-input-contract.ts:14-17](fixture/host-input-contract.ts#L14-L17) — "Offset in the clipboard-text projection … the occurrence occupies exactly `[offset, offset+length)`"; [host-input-contract.ts:26](fixture/host-input-contract.ts#L26); [host-input-facade.ts:3-4](fixture/host-input-facade.ts#L3-L4) — "`$replaceDetectSpanWithText` / `$replaceDetectSpanWithNodes` splice the DETECT text"; [host-input-facade.ts:11](fixture/host-input-facade.ts#L11) — "@param span - pick-time span snapshot **(detect coordinates)**".

**The asymmetry that creates the bug:** everything the plugin can *read* is clipboard-space;
everything the verbs *accept* is detect-space. The snapshot API publishes no detect geometry, so
the conversion has to be derived (§4.1) — there is nothing to copy.

---

## 2. Item 1 — why the FIRST paste succeeds and every later paste fails

### 2.1 The exact mismatch

[plugin-client.js:29-30](fixture/plugin-client.js#L29-L30) computes the insertion span as
`start = end = snapshot.draft.length` — the length of the **clipboard-text projection**
([host-input-contract.ts:26](fixture/host-input-contract.ts#L26): "Clipboard-text projection of the
editor document (chips expanded to their clipboard form)"). The host's `insertReference` consumes
that span against the **detect text**: it slices `this.projection.detectText`
([host-input-facade.ts:18](fixture/host-input-facade.ts#L18)) and splices it
([host-input-facade.ts:24](fixture/host-input-facade.ts#L24)). So the plugin hands the host a
**clipboard-space offset where a detect-space offset is required**.

`draftRev` is the one field already in the right currency — "Monotonic editor revision (span CAS
compares against this)" ([host-input-contract.ts:28](fixture/host-input-contract.ts#L28)) against
`span.draftRev !== this.rev` ([host-input-facade.ts:17](fixture/host-input-facade.ts#L17)). The
`start`/`end` pair is not. **The mismatch is: clipboard-text offsets and lengths fed into
detect-coordinate span guards.**

### 2.2 The numbers, straight from the capture

Fresh, empty composer: `draft = ""` and `detectText = ""` — both length 0, so the span `{0,0}`
is valid in *either* space and the insert applies.

After paste #1 ([console-session.txt:8-9](fixture/console-session.txt#L8-L9)): `draft =
"[attachment: screenshot.png] "`, length **29**, one occurrence `{offset: 0, length: 28}`. The
*same document* in detect space is `"\uFFFC "` — length **2**. Paste #2 therefore sends
`{start: 29, end: 29, draftRev: 1}` into a 2-character detect text: **27 characters past the end
of the document**. The inflation is exactly `Σ(occurrence.length − 1)` = 28 − 1 = 27 — the
clipboard projection counts 28 characters where the detect projection counts 1.

I re-implemented the facade from the two excerpts and ran the plugin's `add` verbatim against it;
it reproduces the capture byte-for-byte (draft length 29, occurrence `[0,28]`) and reports
`insertReference → false` because the span lies outside the detect text (Appendix A).

### 2.3 Why the host returns a silent `false`, and why the toast blames the wrong thing

The guard order in `insertReference` ([host-input-facade.ts:15-26](fixture/host-input-facade.ts#L15-L26)) is:
**phase → `draftRev` CAS → detect-space splice**.

- The plugin's `draftRev` is read from a snapshot taken at the top of `add` and refreshed after
  every insert ([plugin-client.js:11](fixture/plugin-client.js#L11),
  [plugin-client.js:37](fixture/plugin-client.js#L37)), so the CAS guard **passes**. It must: the
  identical CAS mechanism is exercised by paste #1 and succeeds.
- The only guard whose outcome differs between paste #1 and paste #2 is the one sensitive to
  document *content* — the detect-text splice. `$replaceDetectSpanWithNodes` cannot apply a span
  that does not map into the document, so `applied` stays `false`
  ([host-input-facade.ts:19,24,26](fixture/host-input-facade.ts#L19-L26)) and the verb returns
  `false`.

The plugin then converts that `false` into *"The DSH composer changed before the attachment could
be inserted"* ([plugin-client.js:33-36](fixture/plugin-client.js#L33-L36)) — i.e. it **assumes a
stale-revision race**. That is exactly why the failure logic cannot be recovered by reading the
plugin alone: the plugin's own bookkeeping (ref, record, snapshot refresh, rollback on failure) is
internally consistent and its revision handling is correct. The wrong assumption lives entirely
outside the plugin, in the host's coordinate space.

### 2.4 Why "first works, later fails" is the signature of *this* mismatch

The two projections agree **only where the measured prefix contains no chip**. An empty composer is
the degenerate case where both are `""`, so offset 0 is correct in either space; the first
successful insertion immediately makes them diverge, and every later offset computed from
`draft.length` is inflated by `Σ(length − 1)` over the chips preceding the insertion point. The
error grows monotonically with each chip, so it never self-corrects. Two consequences worth stating
plainly, because they explain the "I cannot reproduce it" experience:

- **"First paste works" is not a property of the plugin — it is an artifact of the empty-composer
  repro.** If the composer already holds a chip from *any* source (another plugin, a restored
  session, a `/command` reference), the very first paste fails identically. Verified in simulation:
  with one foreign chip present, the unfixed plugin's first `insertReference` asks for detect
  offset 3 in a 2-character document and is rejected.
- The same divergence silently corrupts **mid-document** offsets: a chip anywhere before the
  insertion point shifts every later offset. When the insertion point is preceded by typed text but
  *no* chip, `draft.length` happens to be correct — which is why the failure looks intermittent to
  users rather than deterministic.

---

## 3. Item 2 — why the × click turns the chip into `unavailable` instead of removing it

Trace of `remove` ([plugin-client.js:43-60](fixture/plugin-client.js#L43-L60)) against the
capture's state (`occurrence = {offset: 0, length: 28}`, `draftRev = 1`, detect text `"\uFFFC "`):

1. `end = occurrence.offset + (occurrence.length ?? 1)` = 0 + 28 = **28**
   ([plugin-client.js:49](fixture/plugin-client.js#L49)). `offset`/`length` are clipboard-space by
   contract ([host-input-contract.ts:14-16](fixture/host-input-contract.ts#L14-L16)), and 28 *is* the
   chip's width — in the clipboard projection.
2. `consumeToken({kind:'span', span:{start:0, end:28, draftRev:1}})`
   ([plugin-client.js:51-54](fixture/plugin-client.js#L51-L54)). The host's span guard
   ([host-input-facade.ts:38,41](fixture/host-input-facade.ts#L38-L41)) is a `draftRev` CAS followed
   by `$replaceDetectSpanWithText(guard.span, '')` — a **detect-space** splice. `[0,28)` is 26
   characters past the end of a 2-character detect text, so the splice cannot apply and the verb
   returns `false`. (In detect space the chip is exactly one `U+FFFC`; the correct span is
   `[0,1)`.)
3. **The return value is discarded** — not assigned, not checked, not logged
   ([plugin-client.js:51-54](fixture/plugin-client.js#L51-L54); the capture itself notes "returned
   (not inspected by the plugin code)", [console-session.txt:18](fixture/console-session.txt#L18)).
4. `records.delete(occurrence.ref)` runs **unconditionally**
   ([plugin-client.js:58](fixture/plugin-client.js#L58)), then `changed()` re-renders
   ([plugin-client.js:59](fixture/plugin-client.js#L59)).

The plugin has now deleted its own bookkeeping for a chip the host still owns. The dock render
([plugin-client.js:63-65](fixture/plugin-client.js#L63-L65)) looks the occurrence up in `records`
and falls back to the literal string `unavailable` when the record is gone. Because the host chip
was never removed, the occurrence is still in the next snapshot, so the chip is re-rendered from a
record that no longer exists → `unavailable`
([console-session.txt:19-20](fixture/console-session.txt#L19-L20)). The chip is now permanently
stuck: the dock entry has no record left to act on, and the composer chip survives forever.

**The two symptoms are one defect seen through two different error-handling habits:**

| path | host returns | plugin does with it | user sees |
|---|---|---|---|
| insert | `false` | checks it, rolls back its record, throws | toast; no second chip |
| remove | `false` | ignores it, deletes its record anyway | chip stays; label becomes `unavailable` |

Three further observations on the removal path:

- **The `?? 1` is the smoking gun.** `occurrence.length ?? 1`
  ([plugin-client.js:49](fixture/plugin-client.js#L49)): one character *is* the chip's width — in the
  **detect** projection. The author applied the detect-space width to a clipboard-space offset. The
  comment above it ([plugin-client.js:47-48](fixture/plugin-client.js#L47-L48)) states the true but
  clipboard-space premise ("the occurrence owns its whole inline range") and draws the wrong
  conclusion for the verb actually being called.
- **The legacy `setDraft` fallback is a second, unverified coordinate path.**
  [plugin-client.js:56](fixture/plugin-client.js#L56) is *self-consistent* clipboard-space
  arithmetic, but the fixture never establishes which space `setDraft` consumes — the only
  documented use in the host excerpt is the bare-token clear `this.setDraft('')`
  ([host-input-facade.ts:46](fixture/host-input-facade.ts#L46)). If `setDraft` is detect-space (as
  its sibling verbs are), that fallback would splice the *expanded* chip text back into the document
  as literal text. It is dead code on this host version (the `consumeToken` branch is taken), so the
  safe fix is to correct the span path and **delete** the fallback rather than keep two coordinate
  paths.
- **`unavailable` is a catch-all, not a diagnosis.** It renders for *any* occurrence with no local
  record, so a foreign source's chip renders as `unavailable` too (verified in simulation). The dock
  should distinguish "another source's chip" from "my chip whose record I dropped"; today both look
  identical, which is what let a state desync present as a rendering quirk.

---

## 4. Item 3 — the fix direction

### 4.1 The rule (derived from the host source, not guessed)

From [host-input-contract.ts:36-41](fixture/host-input-contract.ts#L36-L41): every chip occupies
**exactly one `U+FFFC`** in `detectText` and **`occurrence.length`** characters in
`clipboardText`, and occurrences are sorted by offset. Therefore, for a snapshot `s`:

```js
// detect-space length of the whole document
const detectLen = (s) =>
  s.draft.length - s.occurrences.reduce((n, o) => n + (o.length - 1), 0)

// clipboard-space offset -> detect-space offset (occurrences sorted by offset)
const toDetect = (s, off) => {
  let c = 0, d = 0                       // clipboard / detect chars consumed
  for (const o of s.occurrences) {
    const gap = o.offset - c             // plain text before this chip
    if (off <= c + gap) return d + (off - c)   // plain region, or the chip's own start
    c = o.offset + o.length              // skip the chip, clipboard space
    d = d + gap + 1                      // skip the chip, detect space (one U+FFFC)
  }
  return d + (off - c)                   // trailing plain text
}

// the chip's detect span — width is 1, never `length`
const detectSpanOf = (s, o) => {
  const start = toDetect(s, o.offset)
  return { start, end: start + 1 }
}
```

Verified against the fixture numbers: after paste #1, `29 − 27 = 2` = length of `"\uFFFC "`; after
three pastes, `81 − (27+27+21) = 6` = length of `"\uFFFC \uFFFC \uFFFC "`; with occurrences at
clipboard offsets 0/29/58 the removal spans are `{0,1}`, `{2,3}`, `{4,5}` — exactly what the
detect text requires, and removing the middle one leaves the other two chips and all typed text
byte-identical.

### 4.2 Call site 1 — the insert path (`plugin-client.js:27-32`)

Replace `snapshot.draft.length` with the detect-space end of the document:

```js
for (const item of items) {
  const ref = id()
  records.set(ref, { ref, sessionId, items: [item], total: item.file.size, label: item.path, status: 'ready' })
  const at = detectLen(snapshot)                 // detect-space insertion point
  const accepted = input.insertReference({
    source: SOURCE, ref, label: item.path, appearance: 'file',
    clipboardText: `[attachment: ${item.path}]`,
  }, {
    start: at,
    end: at,
    draftRev: snapshot.draftRev,                 // already the right currency — do NOT "convert" this
  })
  if (!accepted) { records.delete(ref); throw new Error('The DSH composer changed before the attachment could be inserted') }
  snapshot = input.state.getSnapshot()           // keep: refresh before the next item
}
```

For an insertion anywhere other than the end of the draft, use `toDetect(snapshot, clipboardOffset)`
for both `start` and `end`.

**Also delete the separator synthesis at [plugin-client.js:13-15](fixture/plugin-client.js#L13-L15).**
The host already appends the separating space itself — "followed by a separating space unless one is
already next" ([host-input-facade.ts:8-9](fixture/host-input-facade.ts#L8-L9), implemented at
[:21-23](fixture/host-input-facade.ts#L21-L23)) — so `input.setDraft(\`\${snapshot.draft} \`)` is
redundant *and* it feeds a clipboard-space string back into a verb whose space is unverified, which
would duplicate the chip as literal text if `setDraft` is detect-space. It is not exercised in the
capture (the draft already ends with a space), which makes it a **latent third instance of the same
defect**.

### 4.3 Call site 2 — the removal path (`plugin-client.js:49-58`)

```js
const remove = (sessionId, occurrence) => {
  const input = inputFor(sessionId)
  const snapshot = input.state.getSnapshot()
  if (snapshot.phase !== 'plain') return
  const span = detectSpanOf(snapshot, occurrence)          // { start, end: start + 1 }
  const removed = input.consumeToken({
    kind: 'span',
    span: { ...span, draftRev: snapshot.draftRev },
  })
  if (!removed) return        // host still owns the chip: keep the record, re-render, surface the error
  records.delete(occurrence.ref)
  changed()
}
```

Three things change: the span is **converted** (`offset` → detect start, `length` → **1**); the
boolean is **checked**; and the local bookkeeping is mutated **only after** the host confirms. On
`false`, re-read the snapshot and retry once (a stale `draftRev` is the one legitimate cause), and
if it still fails, surface an error instead of silently diverging. Delete the `setDraft` fallback at
[plugin-client.js:55-57](fixture/plugin-client.js#L55-L57) (§3).

Optional polish: because the host puts a separator space next to each chip, removing one can leave a
stray space (a double space when a middle chip goes, a leading space when the first does). If you
want tidy text, widen the detect span by one adjacent space **in detect space** and re-check the
boolean — never by re-deriving from `draft.length`.

### 4.4 The invariant to encode in the plugin

```
s.draft.length − Σ(occ.length − 1) === detectText.length      (every snapshot)
toDetect(s, occ.offset) + 1 <= detectText.length              (every chip's span is in range)
```

The first is checkable from the published snapshot alone and is the cheapest possible regression
guard.

### 4.5 Host-side request, so the next plugin need not derive this

The root cause is an API asymmetry: `InputState` publishes clipboard-space geometry only, while the
verbs consume detect-space geometry. Either add `detectStart`/`detectEnd` (or a `detectLength`) to
`Occurrence`/`InputState`, or let `insertReference`/`consumeToken` accept a
`space: 'detect' | 'clipboard'` discriminator and convert internally. Until then every plugin must
carry the mapping in §4.1 — derived from the contract, exactly as above.

---

## 5. Item 4 — regression test plan

Both bugs are consequences of one coordinate misread, so the plan has two layers: **unit tests that
pin the mapping**, and **interaction tests that pin the sequences the users actually performed**.

### 5.1 Unit tests for the coordinate mapping (pure, no host)

Table-driven, each case asserting `detectLen` / `toDetect` / `detectSpanOf` against a
hand-computed expectation:

| # | snapshot | expectation |
|---|---|---|
| U1 | empty draft, no occurrences | `detectLen = 0`; insertion span `{0,0}` |
| U2 | one chip `[0,28]`, draft len 29 | `detectLen = 2`; `detectSpanOf = {0,1}` |
| U3 | two chips `[0,28] [29,28]`, draft len 58 | `detectLen = 4`; spans `{0,1} {2,3}` |
| U4 | typed prefix `"see this "` + chip `[9,19]` | `detectLen = 11`; span `{9,10}`; `toDetect(9) = 9` |
| U5 | chip + typed suffix `"note"` | end-of-draft insert maps to `detectLen`, **not** `draft.length` |
| U6 | offset strictly *inside* a chip's clipboard range | maps to that chip's detect start, never past it |
| U7 | foreign-source chip interleaved with own chips | foreign chips participate in the mapping (they occupy one `U+FFFC` too) |
| U8 | degenerate `length === 0` occurrence | never sent as a zero-width `{x,x}` span (the host rejects those in `consumeToken`) |

Plus a **property test** over randomized operation sequences (insert / remove / type / foreign
insert): after every operation assert `detectLen(snapshot) === detectText.length` and that each
chip's detect span lies in `[0, detectText.length)`.

### 5.2 Interaction sequences that must be asserted

**R1 — the captured repro, verbatim.** Empty composer → paste #1 → paste #2. Assert: two dock chips
and two composer chips; `occurrences.length === 2`; the second `insertReference` returns `true`;
**no toast**. Spy on the verb and assert `span.start === detectLen(prevSnapshot)` and — as the
regression guard — `span.start !== prevSnapshot.draft.length`.

**R2 — repeat paste (≥3 pastes, mixed files).** Paste #1, #2, #3 in one session. Assert all three
chips exist, `occurrences` stays sorted by offset, and `detectLen(snapshot) === detectText.length`
after each paste. This is the direct guard against "first works, later fails" coming back.

**R3 — paste with typed text before *and* after the chip.** Type `see this `, paste, type `note`,
paste. Assert the second chip lands *after* `note` (not at `draft.length`) and the first chip's
`clipboardText` is unchanged. A `draft.length`-derived offset either inserts in the wrong place or
is rejected; this case catches both.

**R4 — paste when the draft does not end in whitespace.** Assert the host adds exactly one separator
space, the draft never contains a duplicated `[attachment: …]` literal, and the plugin issues **no**
`setDraft` call on the insert path.

**R5 — first paste into a non-empty composer (foreign chip present).** Insert a chip from another
source, then paste. Assert the plugin's insert succeeds. This kills the "first paste is special"
assumption that made the bug look intermittent.

**R6 — × click on a single chip.** Assert `consumeToken` returns `true`; the composer chip
disappears; `occurrences.length` drops to 0; the dock chip disappears **entirely** (assert no chip
renders with meta `unavailable`); and `records` loses the ref only *after* the host confirmed.

**R7 — × click on the *second* of two chips (offset ≠ 0).** The key case for an off-by-N conversion.
Assert the span sent is `detectSpanOf` for that occurrence (`{2,3}` in the three-chip fixture), the
removed chip is gone, and the surviving chip plus all typed text are byte-identical. An
`offset + length` span eats the neighbouring chip or the typed text.

**R8 — host rejection must not mutate plugin bookkeeping.** Force `consumeToken` /
`insertReference` to return `false` (stub the verb, or bump `draftRev` between snapshot and call).
Assert: `records` still contains the ref; the dock still renders a real chip with a size label
(never `unavailable`); the plugin retries once with a fresh snapshot; and if it still fails it
surfaces an error rather than deleting the record.

**R9 — remove then re-add.** Remove a chip, then paste again. Assert the new chip's detect offset is
recomputed from the *current* snapshot (no cached geometry) and the resulting draft is exactly the
remaining `clipboardText` + the new one, separated by one space.

**R10 — the `unavailable` invariant.** After every interaction in R1–R9, assert: for every
occurrence in the host snapshot, either the dock renders a record-backed label, or that occurrence's
`source` is not the plugin's — and **never** a plugin-owned occurrence rendering `unavailable`.
Equivalently: `records` keys and the plugin's own occurrences stay in lockstep.

### 5.3 Static / dev-mode guard

Wrap both verbs in a development-only assertion that runs before every call:
`0 <= span.start <= span.end <= detectLen(snapshot)` and `span.draftRev === snapshot.draftRev`. A
coordinate regression then fails loudly at the call site instead of silently returning `false` —
which is precisely how this defect reached two users. Add a lint/CI rule banning
`snapshot.draft.length`, `occurrence.offset` and `occurrence.length` from appearing as direct
arguments to `insertReference`/`consumeToken`; they must go through `detectLen`/`toDetect`/
`detectSpanOf`.

---

## 6. Item 5 — what to check in the host source before calling input-machine verbs (unscored)

Not part of the grade, but this is the discipline that would have caught it:

1. **Read the verb's own doc comment for its coordinate space before writing the call.**
   `insertReference` states it in one line — "@param span - pick-time span snapshot (detect
   coordinates)" ([host-input-facade.ts:11](fixture/host-input-facade.ts#L11)). That single sentence
   is the whole fix.
2. **Read the contract's field comments, not just the field names.** `Occurrence.offset` says
   "Offset in the clipboard-text projection"
   ([host-input-contract.ts:14](fixture/host-input-contract.ts#L14)) and `EditorProjection` names
   both spaces explicitly ([:36-41](fixture/host-input-contract.ts#L36-L41)). A field called
   `offset` tells you nothing about its space; the comment does.
3. **Identify which projection each verb splices**, and confirm the helpers it uses
   ([host-input-facade.ts:3-4](fixture/host-input-facade.ts#L3-L4)).
4. **Enumerate the guard chain and decide, for each `false`, what the plugin will do:** phase
   ([:16](fixture/host-input-facade.ts#L16) — note the host accepts `plain` **or** `claimed`, while
   the plugin's `snapshot.phase !== 'plain'` checks at
   [plugin-client.js:12](fixture/plugin-client.js#L12) and
   [:46](fixture/plugin-client.js#L46) are stricter and bail early on a claimed input), `draftRev`
   CAS ([:17](fixture/host-input-facade.ts#L17), [:38](fixture/host-input-facade.ts#L38)), degenerate
   span ([:38](fixture/host-input-facade.ts#L38) — `consumeToken` rejects `start === end`,
   `insertReference` does not), then the splice.
5. **Treat the boolean as authoritative.** Every one of these verbs returns "whether the edit
   applied" ([:12](fixture/host-input-facade.ts#L12), [:34](fixture/host-input-facade.ts#L34)). Local
   bookkeeping must be a *consequence* of the return value, never a parallel assumption.
6. **Check what the host does for you so you don't duplicate it:** it appends the separator space
   itself ([:8-9](fixture/host-input-facade.ts#L8-L9)), which makes the plugin's
   `setDraft(draft + ' ')` both redundant and hazardous.
7. **Re-derive on every host upgrade, and do not trust the migration cards alone.** The curated
   change cards for `0.1.2-alpha.3`
   ([skills/plugin-upgrade/references/v0.1.2-alpha.3.md](E:\deepseek-harness\dsh-plugin-upgrade-skill\skills\plugin-upgrade\references\v0.1.2-alpha.3.md))
   cover only the settings-card capability and the SQLite persistence removal — the input facade and
   its projection types are **not carded**, so the cards' silence is not evidence of stability. For
   these verbs the facade/contract source is the only source of truth.
8. **Prefer verbs whose geometry the host owns.** Where a higher-level form exists —
   `consumeToken`'s bare-token guard compares `clipboardText.trim()` and clears
   ([host-input-facade.ts:45-47](fixture/host-input-facade.ts#L45-L47)) — it removes the coordinate
   question entirely; use it when the semantics fit.

---

## Appendix A — verification performed

I re-implemented the host facade from the two excerpts (detect text with `U+FFFC` chips, the three
guard steps in order, the host-appended separator, the `draftRev` CAS) and ran the plugin's
`add`/`remove` **verbatim** against it. Results:

- **Unfixed plugin, captured sequence** — reproduces [console-session.txt](fixture/console-session.txt)
  exactly: paste #1 yields `draft` length 29 with occurrence `[0,28]` and dock meta `48.2 KiB`;
  paste #2 fails with the span `[29,29)` lying outside a 2-character detect text (toast); the ×
  click fails with `[0,28)`, the plugin deletes its record anyway, and the dock re-renders the
  still-present chip as `unavailable`.
- **Fixed plugin** — three successive pastes all succeed, with `detectLen` 2 → 4 → 6 matching
  `detectText.length` at each step; removals use spans `{0,1}`, `{2,3}`, `{4,5}`; removing the
  middle chip leaves the other two and all typed text byte-identical.
- **Counterexample to "first paste is safe"** — with one foreign chip already in the composer, the
  unfixed plugin's *first* paste asks for detect offset 3 in a 2-character document and is rejected,
  while the fixed plugin's first paste succeeds.

## Appendix B — source index

| claim | source |
|---|---|
| span is detect-space | [host-input-facade.ts:11,18,24](fixture/host-input-facade.ts#L11) and [:3-4](fixture/host-input-facade.ts#L3-L4) |
| occurrence `offset`/`length` are clipboard-space | [host-input-contract.ts:14-17,26,36-41](fixture/host-input-contract.ts#L14-L17) |
| host appends the separator space | [host-input-facade.ts:8-9,21-23](fixture/host-input-facade.ts#L8-L9) |
| guard chains | [host-input-facade.ts:15-17,37-43,45-47](fixture/host-input-facade.ts#L15-L17) |
| plugin's insert span | [plugin-client.js:27-32](fixture/plugin-client.js#L27-L32) |
| plugin's toast | [plugin-client.js:33-36](fixture/plugin-client.js#L33-L36) |
| removal span, discarded boolean, unconditional delete | [plugin-client.js:49,51-54,58](fixture/plugin-client.js#L49) |
| `unavailable` render | [plugin-client.js:63-65](fixture/plugin-client.js#L63-L65) |
| captured numbers | [console-session.txt:8-9,13-14,18-20](fixture/console-session.txt#L8-L9) |
| input facade not covered by the 0.1.2-alpha.3 cards | [v0.1.2-alpha.3.md](E:\deepseek-harness\dsh-plugin-upgrade-skill\skills\plugin-upgrade\references\v0.1.2-alpha.3.md) |


## Required output (JSON only)
{"decisions":[{"id":"<criterion-id>","verdict":"pass|partial|fail|missing","reason":"short"}],"caps":[{"id":"<cap-id>","triggered":false,"reason":"short"}]}
Every criterion and cap exactly once. pass=full points, partial=half, fail/missing=0; a triggered cap caps the total.