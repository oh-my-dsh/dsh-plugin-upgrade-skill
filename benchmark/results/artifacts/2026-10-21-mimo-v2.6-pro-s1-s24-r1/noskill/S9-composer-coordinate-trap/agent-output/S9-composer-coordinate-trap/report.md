# S9 · Composer Coordinate Trap — Root-Cause & Fix Report

**Plugin:** `@org/dsh-attach-input` v0.2.3 · **Host:** DSH 0.1.2-alpha.3
**Evidence (read-only fixture, cited by file + key doc phrase only):** `plugin-client.js`, `console-session.txt`, `host-input-facade.ts`, `host-input-contract.ts`.

## 0. Verdict — one contract misread, two symptoms

Both user reports are the **same defect**: the plugin computes span coordinates in the
**clipboard-text projection** (`InputState.draft` / `Occurrence.offset|.length`, where a chip
occupies its whole `clipboardText` string — 28 chars for `[attachment: screenshot.png]`), but
every input-machine verb takes **detect coordinates** (`EditorProjection.detectText`, where a
chip occupies **exactly one U+FFFC**). The host's edit helper refuses each splice and returns
`false`; the insert path turns that `false` into the toast, and the removal path drops the
`false` on the floor, desyncs its own `records` map, and renders `unavailable`.

The two projections (per `host-input-contract.ts`):

| Published value | Doc anchor | Projection | A chip counts as |
|---|---|---|---|
| `InputState.draft` | "chips expanded to their clipboard form" | clipboard-text | `clipboardText.length` = 28 chars |
| `InputState.occurrences[].offset/.length` | "in the clipboard-text projection" | clipboard-text | 28 chars, `[offset, offset+length)` |
| `EditorProjection.detectText` | "chip = one U+FFFC" | detect | 1 char |
| `TokenSpan` (insert span, consume-token `guard.span`) | facade: "pick-time span snapshot (detect coordinates)" | detect | 1 char |
| `InputState.draftRev` | "span CAS compares against this" | — | equals `facade.this.rev` → the CAS is **not** what fails |

## 1. Why paste #1 succeeds and every later paste toasts

**What my code computes** (`plugin-client.js`, `add`): `snapshot = input.state.getSnapshot()`,
then `{ start: snapshot.draft.length, end: snapshot.draft.length, draftRev: snapshot.draftRev }`.
`snapshot.draft` is the **clipboard** projection, so `start/end` are clipboard offsets.

**What the host compares against** (`host-input-facade.ts`, `insertReference`):
(1) phase guard — passes (`plain`); (2) `span.draftRev !== this.rev` — **passes**, the snapshot is
read fresh in the same tick (and the identical pattern passed on paste #1); (3) then the body
reads `this.projection.detectText.slice(span.end, span.end + 1)` and `$replaceDetectSpanWithNodes`
**splices the DETECT text** — the span is bounds-checked against `detectText`, not against `draft`.
`span.end = 29` while the detect document ends at 2 → the splice cannot apply → `applied = false`
→ my code throws `'The DSH composer changed before the attachment could be inserted'`.

**Exact mismatch:** my code computes the span in **clipboard coordinates** (`snapshot.draft.length`,
`occurrence.offset + occurrence.length`); the host verb's guard/body compares the span against the
**detect projection** (`projection.detectText`, chip = 1 U+FFFC). The revision CAS matches — only
the coordinate space is wrong.

**Numbers from the capture** (`console-session.txt`):

| | clipboard projection (`draft`) | detect projection (`detectText`) |
|---|---|---|
| after paste #1 | `"[attachment: screenshot.png] "` len **29** | `"\uFFFC "` len **2** |
| occurrence #1 | `offset 0, length 28` | chip = 1 char |
| span sent for paste #2 | **29** ← wrong space | **2** ← what the splice needs |

**Why the "first works, later fails" signature:** with an empty composer both projections are the
empty string, so clipboard offset 0 == detect offset 0 and the two coordinate systems happen to
coincide. Paste #1 inserts at `[0,0)`, valid in both spaces, and succeeds. After the first chip
they diverge and never re-converge: each chip adds `clipboardText.length` (28) chars to `draft`
but 1 char to `detectText`, i.e. the gap widens by `length − 1` (27) per chip. Paste #2's
end-of-draft offset is 29 in clipboard space vs 2 in detect space, paste #3's is 58 vs 4, and so
on — every later paste is refused, deterministically. That determinism also rules out the toast's
own explanation (a stale `draftRev` CAS would fail intermittently, not "always after the first");
the CAS passes and the message misattributes a coordinate-space violation as staleness. An
N-item single paste fails from item 2 onward for the same reason (the loop re-snapshots
`draft.length` each iteration).

## 2. Why the × turns the chip into `unavailable` instead of removing it

Removal path trace (`plugin-client.js`, `remove`, then `host-input-facade.ts`, `consumeToken`):

1. Dock × → `remove(sessionId, occurrence)`; the occurrence comes from the published view:
   `offset 0, length 28` — **clipboard** units (contract: "in the clipboard-text projection").
2. `end = occurrence.offset + (occurrence.length ?? 1)` = 28 — the plugin's comment
   ("the removal must span occurrence.length, not one character") is right about *what* must go
   (the whole inline range) but applies a clipboard length to a detect splice. In detect space the
   occurrence's whole inline range **is** one character (the U+FFFC).
3. `consumeToken({ kind: 'span', span: { start: 0, end: 28, draftRev } })`.
4. Host guard: `draftRev` CAS **passes**, `start === end` is false →
   `$replaceDetectSpanWithText(guard.span, '')` splices **detectText** over `[0, 28)`. The detect
   document is only `"\uFFFC "` (2 chars) and the chip's detect span is `[0, 1)`; the requested
   span is out of range / does not match the chip → **no edit**, `false` returned
   (capture: "composer chip still present", "consumeToken(...) returned (not inspected)").
5. **Plugin-side bookkeeping runs unconditionally:** `records.delete(occurrence.ref); changed();`
   — the boolean is never inspected, so the record is dropped even though no edit applied.
6. `changed()` re-renders the dock from the occurrence list. The occurrence still exists (the
   composer chip was never spliced) → the chip row still renders, but `records.get(occurrence.ref)`
   is now `undefined` and the render falls through to `record === undefined ? 'unavailable'` →
   the size label flips to **`unavailable`** and both chips stay. That is exactly user report #3.

So symptom 2 = the same coordinate misread **plus** one bookkeeping rule violation: the plugin
treats `consumeToken`'s boolean as fire-and-forget and mutates `records` independently of the edit.

## 3. Fix direction (rule derived from the host source)

**Conversion rule** (derived from `host-input-contract.ts` + the facade's splice helpers): the
editor document is published twice — non-chip characters map 1:1 in both, but every chip is
**one U+FFFC in detect space** and **`occurrence.length` characters in clipboard space**. Hence
for a clipboard coordinate `p`:

    detect(p) = p − Σ (o.length − 1)   over every occurrence o with o.offset + o.length ≤ p

and a chip boundary collapses: `detect(o.offset + o.length) = detect(o.offset) + 1` (a chip is
exactly one detect char). Sanity invariant: `detect(draft.length) === projection.detectText.length`.
Worked example (capture): `detect(29) = 29 − (28 − 1) = 2 = detectText.length` ✓. If the plugin
can read `EditorProjection.detectText`, `projection.detectText.length` is the same value and can
be used directly for end-of-draft insertion.

**Call sites:**

- **Insert path (`add`):** `start = end = detect(snapshot.draft.length)`, computed from the *same*
  snapshot that supplies `draftRev` (keep the CAS pairing; recompute each loop iteration). For an
  empty composer this is still 0 — behavior for the working first paste is unchanged.
- **Removal path (`remove`):** `start = detect(occurrence.offset)`, **`end = start + 1`** — the
  chip's single detect char — **not** `occurrence.length`. Optionally extend `end` by 1 when
  `detectText[end] === ' '` to also consume the separator space that `insertReference` inserted
  ("followed by a separating space unless one is already next"), so removal does not strand a
  space; pick one behavior and pin it with the exact-text test in `4. The `setDraft` fallback path
  may keep clipboard numbers (it slices the clipboard `draft`) — it is the only call site where
  clipboard units are correct.
- **Both paths:** inspect the returned boolean; only on `true` do `records.delete(ref)` and
  `changed()`. On `false`: re-snapshot and retry once (fresh coordinates + `draftRev`) or surface
  an explicit error; **never** drop the record while the occurrence survives. Also fix the toast
  text (or split diagnostics) so a coordinate rejection is not reported as "the composer changed" —
  the CAS actually passed.
- Note the guard asymmetry while touching this: insert accepts an empty span `[p,p)`; `consumeToken`
  rejects `start === end` (so the removal span must be non-empty — `start+1` guarantees that).

## 4. Regression test plan (exact interaction sequences)

Instrument the host calls: record every `TokenSpan` sent to `insertReference` / `consumeToken`
and assert against **detect** numbers (chip = 1 char). Use the capture's label so numbers are
loud: `clipboardText = "[attachment: screenshot.png]"` (28), occurrence length 28.

**A. Repeat-insert sequence (bug 1 cannot silently return)**
1. Empty composer → paste A → assert span `{start:0, end:0, draftRev:R0}`; returns true;
   assert `draft = "[attachment: A.png] "` (clipboard) **and** `detectText = "\uFFFC "` (len 2),
   `occurrences[0].length === clipboardText.length`.
2. Immediately paste B (no other edits) → assert **no toast**, span `{start:2, end:2, draftRev:R1}`
   where 2 = live `detectText.length`; assert the literal **2** (and `!== draft.length = 29`) so a
   revert to `draft.length` fails the test; returns true; `detectText = "\uFFFC \uFFFC "` (len 4).
3. Paste C → span `{start:4, end:4}` succeeds (covers divergence growth).
4. One paste carrying items `[A, B, C]` on an empty composer → 3 chips (the add-loop's "later
   inserts" are the same failure mode).
5. Paste A → type text → paste B → both chips present; per-insert span equals the live
   `detectText.length` each time.
6. CAS still enforced: inject a stale `draftRev` → `insertReference` returns false, toast shown,
   record rolled back (`records.delete`) — the fix must not weaken the guard.

**B. Removal sequence (bug 2 cannot silently return)**
1. Paste A → click × on the dock chip → assert `consumeToken` called with `{start:0, end:1}`
   (assert literally **end: 1** and `end !== occurrence.length = 28`), returns true; assert the
   composer draft is empty (or exactly the leftover separator per the chosen rule), `occurrences`
   empty, dock chip **gone**, `records` empty, and the string `unavailable` never rendered.
2. Paste A, paste B → × on the **first** chip → span `{start:0, end:1}`; afterwards exactly one
   chip (B) remains, `records` still holds B's ref with its real size label (`humanBytes`), the
   composer contains only B's clipboardText.
3. Paste A, paste B → × on the **second** chip first → span `{start:2, end:3}`
   (`detect(29) = 2`); afterwards only A remains with its label (proves offset mapping, not
   "removal always hits the first char").
4. Failure handling: force `consumeToken` → false (stale rev) → assert `records` **still** contains
   the ref and the chip still shows its real label (or a defined error state); composer unchanged.
   This locks in "the boolean is checked; bookkeeping follows the edit".
5. Round trip users actually hit: paste A → × → paste B → both succeed; spans `{0,0}` then `{0,0}`.

**C. Cross-cutting assertions (make the bug loud)**
- With one chip of clipboardText length L: assert `detectText.length === 2` while
  `draft.length === L + 1`, and (mock-level) that **every** outgoing span satisfies
  `0 ≤ start ≤ end ≤ detectText.length` — any clipboard-space number fails immediately.
- Assert every verb call site inspects the boolean and mutates `records` only on true
  (unit test with a rejecting mock for both `add` and `remove`).
- Golden fixture from `console-session.txt`: paste #1 OK → paste #2 no toast, second chip in both
  views → × removes chip **and** record, no `unavailable`.

## 5. Routine source-reading checklist before calling input-machine verbs (guidance, not scored)

1. For each verb parameter, find its `@param` doc in the facade **and** its type in the contract;
   record the projection and what a chip counts as there (detect: 1 U+FFFC · clipboard:
   `clipboardText.length`).
2. Read the guard literally: phase whitelist (`plain` vs `plain|claimed`), which field the CAS
   compares (`span.draftRev` vs `this.rev`), and empty-span rules (insert allows `[p,p)`,
   `consumeToken` rejects `start === end`).
3. Identify which projection the verb **splices** (usually `detectText`) vs which published view
   your code reads (`InputState.draft`/occurrences = clipboard).
4. Check return semantics: do these verbs throw or return `false` silently? Never mutate local
   state before the verb's boolean is true.
5. Note side-effect parity (insert adds a separator space "unless one is already next" — removal
   should mirror it).
6. Keep this coordinate table in the plugin repo and assert at dev time that every outgoing span
   lies inside `detectText` bounds.

## run-stats

- toolcalls 总数: 21 (8 次 run_code 顶层调用 + 13 次内部工具调用 glob/read/write/send_message)
- token 用量: n/a（本会话未暴露用量计数）
- 完成时间: 2026-10-21T06:30:11.243Z（UTC；会话起始采样 2026-10-21T14:16:36+08:00[Asia/Shanghai]）
