# S18 · The Terminal Sprite Render Trap — Diagnosis Report (read-only)

**Scope**: static diagnosis of the shipped half-block sprite renderer (`fixture/renderer-excerpt.ts`,
46 lines), the user symptom log, the frame digest report, and the CI hang evidence. No fixture
file was read-modified (fixture is untouched); no install, migration, or service was executed.
Analysis discipline follows the `plugin-upgrade` skill's read-only inspection mode (Mode A:
read-only investigation and report, then stop), with the seven-class touchpoint self-check
(`references/pre-flight.md`, UI + subprocess/output classes) and the layered validation/report
structure used as the organizing frame. Card/reference IDs are cited by ID only.

**Verdict in one line**: the renderer treats terminal SGR as a per-cell value when it is sticky
state, trims away the very space glyphs that would overwrite the previous frame, hands off frame
data without digests, and its animation planner re-arms a timer that pins the Node event loop
alive in hosts that never unmount the component.

---

## 1. Phantom pixels — sticky SGR background bleeding into the empty half of half-filled cells

**Conclusion**: the background color (SGR `48;2;r;g;b`) set by one cell persists into every
following cell; the renderer's `current` cache compares only the last *emitted sequence string*,
so a cell that needs *less* state than its predecessor silently keeps the predecessor's background
— which then fills the empty (lower) half of a `▀` half-block at the sprite's right edges.

### 1.1 The mechanism

SGR is **sticky state**: once a cell emits `\x1b[48;2;…m`, every subsequent cell — including cells
that emit no background at all — inherits that background until something explicitly clears it
(`\x1b[49m` or `\x1b[0m`). The half-block contract (stated in the code header: foreground = upper
pixel, background = lower pixel) makes this fatal:

- For a fully-packed cell (`up` and `lo` both colored) the renderer emits `fg(up)+bg(lo)` and
  the glyph `▀` (U+2580). The glyph's ink (upper half) paints the foreground; the cell's background
  area (lower half) paints `bg(lo)`. Correct.
- For a **half-filled cell with only an upper pixel** (`up` colored, `lo` transparent) the renderer
  emits **only** `fg(up)` (line 26-27: `seq = fg(up); ch = '▀'`). Nothing clears the background.
  The glyph `▀` paints the upper half correctly, but the **empty lower half is the cell background —
  which is still the previous cell's `bg(lo)`**. That leftover color is exactly a pixel the frame
  data does not contain: a phantom pixel inside the empty half of a half-filled cell.

The `current` cache (lines 16, 35-38) is the enabler: it stores the last **emitted sequence string**
and compares the new cell's sequence against it, instead of tracking the terminal's actual
attribute state (foreground and background as two independent channels). Two consequences:

1. When a cell's sequence drops an attribute (upper-only after a both-colored cell), the cache
   updates to the shorter sequence and **never emits the clearing escape for the dropped attribute**.
2. The cache also cannot notice a leak it did not cause: once the background is stale, every later
   upper-only cell in the same row keeps it, because their sequences compare equal to `current`
   and nothing is re-emitted. (Verified by simulation: an upper-only cell following another
   upper-only cell with a different foreground emits only the new fg and still inherits the stale bg.)

Symmetric defect in the lower-only branch (lines 28-30): it emits `bg(lo)` with glyph `▄` (U+2584).
Under the stated contract that is wrong twice over — `▄`'s ink is the **lower** half painted in the
**foreground**, so the cell paints the lower pixel's color into the empty **upper** half (misplaced
pixel) and paints the glyph's own lower half with whatever foreground is still active (a second
stale-attribute leak). The correct lower-only emission is `fg(lo)` with `▄`. This branch is the
mirror image of the same root cause and must be fixed by the same rule.

### 1.2 Which cells expose it

Any cell whose **lower** pixel is transparent (`lo === undefined`) that appears anywhere after a
cell in the same row that set a background (a both-colored cell, or a lower-only cell). Because
`current` is re-initialized per row (line 16) and each row is terminated with an appended `RESET`
(line 42), the leak never crosses a row boundary — it is strictly intra-row, which is why the
artifacts are a **1-cell-wide column hugging the right edges**: at the sprite's right edge, rows
transition from fully-packed pixel pairs to a trailing upper-only pixel, immediately after the dark
outline pairs (`D`/`D`), adjacent to the sleep-`Z` symbols, and at the top of the heart glyph —
precisely the three positions in `fixture/symptom-log.txt` §1. The phantom "appears and moves with
the animation" because the stale background is re-derived from each new frame's edge cells, and
the symptom log confirms the phantom columns are cells where the frame's pixel rows are `.`
(transparent) — the phantom fills exactly the transparent half.

### 1.3 The precise escape fix

Track the two SGR channels separately and always emit the state the cell actually needs, clearing
what it does not:

```ts
let curFg: string | null = null   // last emitted foreground sequence, or null if default
let curBg: string | null = null   // last emitted background sequence, or null if default
// per cell:
if (needFg && curFg !== fgSeq) { out += fgSeq; curFg = fgSeq }
if (!needFg && curFg !== null) { out += '\x1b[39m'; curFg = null }
if (needBg && curBg !== bgSeq) { out += bgSeq; curBg = bgSeq }
if (!needBg && curBg !== null) { out += '\x1b[49m'; curBg = null }
```

The **precise escape** that closes the reported bug: for an upper-only cell, emit the default
background `\x1b[49m` before (or with) `fg(up)` whenever a background is active — i.e. the upper-only
branch becomes `out += (curBg ? '\x1b[49m' : '') + fg(up)` (with `curBg` reset to null); and the
lower-only branch becomes `out += (curBg ? '\x1b[49m' : '') + fg(lo)` with glyph `▄`. The robust
form is to drop the single-string `current` cache entirely and emit the per-cell sequence from the
structured `(fg|null, bg|null)` state; an equally safe (if noisier) fallback is to emit `RESET +
fg(up) + bg(lo)` for every cell unconditionally. What must **never** ship is a cache that compares
emitted strings while the terminal compares attributes.

## 2. Ghost frames — trailing-whitespace trim + terminal erase semantics

**Conclusion**: the renderer strips trailing space glyphs from every assembled row, and a terminal
never erases cells it does not write, so every column beyond a narrower frame's row keeps the
previous (wider) frame's glyphs; the fix is fixed-width rows (never trim) **plus** an explicit
erase-to-end-of-line per row.

### 2.1 What the renderer drops from each row

Line 41: `let row = out.replace(/[ ]+$/, '')`. Every fully-transparent cell was rendered as a
single space glyph (line 33, `seq = ''; ch = ' '`), and this trim strips **all trailing space
glyphs** — i.e. the renderer deliberately does not write the transparent cells at the right end of
each row. The subsequent `if (!row.endsWith(RESET)) row += RESET` (line 42) only appends an SGR
reset; it does not restore any column. So each emitted row is only as long as its last non-space
cell, and its byte stream ends clean — but the *cells* it covers are fewer than the row it replaces.

### 2.2 What the text pipeline does to trailing whitespace

Two layers cooperate:

1. **The renderer's own trim** (`/[ ]+$/`, line 41) removes the trailing spaces before they ever
   reach the terminal. A half-block renderer's transparent cells *are* spaces, so "trim trailing
   whitespace" is exactly "drop the transparent tail of the sprite".
2. **The terminal/line pipeline** never materializes unwritten cells: writing a shorter line only
   overwrites the columns actually written; columns beyond the write keep their previous glyphs and
   colors. Terminals have no implicit "clear the rest of the line" on a newline or on a short write.

Combined: switching from a WIDE pose (rows reaching column N) to a NARROWER pose (rows reaching
column M < N) writes only columns 0..M; columns M+1..N still display the wide frame's tail glyphs
and colors — the ghost pixels of `fixture/symptom-log.txt` §2. The narrow frame itself renders
correctly; the residue is purely "columns never rewritten". Note the residue survives even though
each row ends with `RESET`: SGR state and cell contents are different things — resetting colors
does not erase glyphs.

### 2.3 The two-part fix that guarantees a clean frame switch

1. **Fixed-width rows, never trimmed.** Render every row to the *maximum* width the sprite area can
   occupy (the widest frame width, or the declared grid width), emitting a space glyph — under
   default SGR — for every transparent cell, so every column of the sprite area is overwritten on
   every frame. Concretely: delete the `replace(/[ ]+$/, '')` trim (or pad each row to the fixed
   width instead of trimming).
2. **Explicit erase to end of line.** Terminate each row with `RESET` (or at least `\x1b[49m`, since
   xterm's EL erases using the *current* SGR background — erasing with a stale background would
   paint the ghost columns in the stale color) followed by `\x1b[0K` (erase from cursor to end of
   line). This actively clears any column beyond the written content, so a clean switch holds even
   if some future frame is wider than the current padding width, or if a previous frame painted
   further right than the current one.

Either part alone has a hole: fixed width alone breaks the moment a wider frame is introduced (or
if rows differ per frame), and erase alone is unsafe if a background is active at erase time.
Together — fixed-width overwrite *plus* reset + `\x1b[0K` — every column is either rewritten with
the current frame or explicitly erased, which is the guarantee the frame switch needs. (The frame
loop must also reposition the cursor to each row's origin before writing; that is part of the
contract in §5.) — hand-ported `tail2`, uncovered by an excerpt-only regression

**Conclusion**: the digest report shows `tail2` shifted 1 column left (23 differing cells in the
upper-right spout/tail-tip area); the later, excerpt-based regression only sampled a different
frame's slice, so `tail2` was never compared; the gate is full-frame sha256 digests for **every**
frame, enforced fail-closed in CI.

## 3. Frame data drift — hand-ported `tail2`, uncovered by an excerpt-only regression

### 3.1 What the digest report says

`fixture/frames-digest-report.txt` hashes each frame's full 25 rows (sha256) and compares against
the source-art frames the sprite was ported from. Every frame matches — `standard`, `blink`,
`fin1`, `fin2`, `spout1-6`, `tail1`, `tail3`, `tail4`, `heart1-3`, `sleep1-5` — **except
`tail2`, which MISMATCHES**. The detail shows a coherent single defect, not noise: the ported
frame's upper-right spout/tail-tip area is shifted **1 column left** relative to the source art
(ported `D` at col 26 where the source has it at col 27; an extra `D` at col 25; the `DBD` cluster
at cols 26-28 also shifted left; extra `DD` at cols 36-37), totalling **23 differing cells, all in
the upper-right spout/tail-tip area**. That is the "misplaced tail tip: a 6-pixel cluster drawn at
the wrong position" the user reported (`fixture/symptom-log.txt` §3): a hand-copy off-by-one during
conversion, with duplicated cells at the seam.

### 3.2 Why the per-excerpt regression missed it

The report states it directly: "The ported `tail2` was hand-copied during conversion; an
excerpt-based regression (added later for a different frame) did not cover it." Mechanically:

- **Wrong frame**: the regression was added later *for a different frame*, so its expected bytes
  belong to another pose; `tail2` was never in its coverage set at all.
- **Excerpt, not frame**: even aimed at `tail2`, an excerpt samples a slice (a row region or a few
  columns) rather than the frame's full 25 rows. The 23-cell defect lives at cols 25-37 in the
  upper-right area; an excerpt that does not span those columns cannot observe a 1-column shift,
  and an excerpt anchored relative to nearby content can match shifted content while the absolute
  geometry is wrong. A per-excerpt test can pass on a frame whose absolute layout has drifted.

### 3.3 The gate that prevents recurrence

- **Full-frame digests, fail-closed**: sha256 over **all 25 rows of every frame**, with expected
  digests generated from the source art and committed to the manifest; CI compares every rendered
  frame against its digest and **fails on any frame missing from the digest table** (an unknown or
  new frame is a failure, not a skip). This is the `frames-digest-report.txt` mechanism promoted
  from a one-off report to a permanent gate.
- **No hand-porting**: frames must be *generated* from the source art by a script (the same script
  that produces the digests), so a hand-copied off-by-one cannot enter the repository at all; the
  digest gate then also catches any manual edit to a frame file.
- The gate belongs in the same CI job that renders the sprite, so a frame-data change can never
  ship without a digest update — and a digest update is reviewed as a data change, not code. — a self-rescheduling `setTimeout` pinning the event loop

**Conclusion**: the animation planner re-arms a `setTimeout` every tick; each armed timer is a
live `Timeout` handle that keeps the Node process alive after all checks pass, and the channel-ui
hosts mount the header component without ever unmounting it; the interactive product is immune
because TTY/stdin already keep its process alive; the one-line fix is `t.unref()` on the (re-armed)
planner timer.

## 4. The CI hang — a self-rescheduling `setTimeout` pinning the event loop

### 4.1 What reschedules forever

The animation planner runs a **self-rescheduling `setTimeout` tick**: each tick performs the frame
step and arms the *next* `setTimeout` before returning. In Node, every armed `setTimeout` is a live
`Timeout` handle, and a live `Timeout` keeps the **event loop** alive — the process will not exit
while any timer is pending, no matter how much work has finished. `fixture/ci-hang-evidence.txt`
confirms this forensically: all scene checks PASS, then the process sits idle; at kill time the
event loop holds live handles "of kind Timeout - one per tick of the sprite animation planner,
each re-arming the next." The chain has no exit condition of its own — it ends only when the
component unmounts (or the process is killed).

### 4.2 Which hosts mount without unmounting

The channel-ui group hosts: they **mount the header component and finish WITHOUT unmounting it**
(the evidence's own words). The planner is (correctly) written to reschedule "for as long as its
component stays mounted" — a rule that assumes every host eventually unmounts. Test/CI harnesses
that mount the header to run scene checks, pass, and simply finish violate that assumption: no
unmount event ever fires, so the timer chain is never stopped and the finished job never exits
(killed at the runner timeout; one local observation recorded 19 minutes of idle before a manual
kill, versus the historical ~3-minute runtime).

### 4.3 Why the interactive terminal is unaffected

Its process is kept alive by the **TTY/stdin handles** regardless of the timer chain (the evidence
states this explicitly). An interactive terminal process would never exit on its own anyway —
a lingering animation timer adds nothing to its lifetime and changes nothing observable. The
timer-pinning only becomes visible in hosts whose lifetime is otherwise bounded by their work:
CI jobs and other headless hosts that expect "all work done ⇒ process exits".

### 4.4 The one-line fix

`t.unref()` on the (re-armed) planner timer — i.e. every time the tick arms its next
`setTimeout`, mark that handle as unreffed so it no longer keeps the event loop alive:

```ts
const t = setTimeout(tick, intervalMs); t.unref()
```

The process can then exit as soon as the real work (and any other live handles) is done, whether or
not the component is ever unmounted. (The complementary hygiene fix — stopping the planner on
unmount — is necessary for correctness but insufficient here, because these hosts never unmount;
`unref()` is the fix that covers every host shape. Both belong in the contract, §5.) — renderer contract checklist + pre-flip rollout audit

**Conclusion**: ship the renderer with an explicit SGR-state, full-width/erase, frame-digest, and
animation-lifecycle contract, and before flipping the animation default-on run a lifecycle census,
a headless exit gate, and the full golden/digest suite.

## 5. Prevention — renderer contract checklist + pre-flip rollout audit

### 5.1 Renderer contract checklist (ship with the implementation)

1. **SGR state hygiene.** Terminal SGR is sticky state, not per-cell values. The renderer must
   track foreground and background as two independent channels (or emit the full sequence per cell)
   and emit `\x1b[39m` / `\x1b[49m` (or `RESET`) whenever a cell does not use an attribute the
   terminal still holds. Never compare emitted strings and assume the terminal agrees.
2. **Half-block glyph/color pairing, documented.** `▀` ⇒ `fg` = upper pixel, `bg` = lower pixel;
   `▄` ⇒ `fg` = lower pixel (never `bg` = lower pixel); a transparent half must be the terminal
   default, never a leaked color.
3. **Full-width rows.** Every row is rendered to the declared/maximum grid width; transparent cells
   are emitted as space glyphs under default SGR; **trailing whitespace is never trimmed** from an
   assembled row.
4. **Explicit erase semantics.** Each row ends with `RESET` (or `\x1b[49m`) followed by `\x1b[0K`;
   the cursor is repositioned to each row's origin at the start of every frame; the erase must run
   with the background cleared, since EL honors the current SGR background.
5. **Frame data integrity.** Every frame carries a full-frame sha256 digest (all rows) generated
   from the source art by a script; digests are committed and enforced in CI fail-closed (unknown
   frame = failure); frames are never hand-ported.
6. **Golden tests.** Byte-identical rendering snapshots for **every** frame (whole frame, not
   excerpts); a wide→narrow frame-switch residue test asserting zero surviving columns; an SGR
   property test asserting no cell inherits an attribute it does not set.
7. **Animation lifecycle.** The planner's (re-armed) timer is `unref()`'d so it can never pin a
   headless process; the component stops the planner on unmount; a headless smoke test renders one
   animation path and asserts the process exits within a bound.
8. **Dimension contract.** The renderer takes explicit width/height and pads; it never derives row
   length by trimming data.

### 5.2 Audit to run BEFORE flipping the animation feature default-on

1. **Lifecycle census.** Enumerate every mount site of the animated component across all hosts
   (interactive product, header hosts, CI harnesses) and classify each as *unmounts* vs *never
   unmounts*. Require the planner to be safe under never-unmount (`unref`) — do not rely on
   unmount as the stop mechanism.
2. **Headless exit gate.** A CI job that drives the animation path headlessly and asserts the
   process exits (with open-handle detection) — the exact check that would have caught this hang
   *before* the flip. Verify job duration returns to baseline (~3 min), with no lingering Timeout
   handles.
3. **Golden/digest suite green.** Full-frame digests for every frame, the wide→narrow residue
   test, and the SGR property test all pass on the frames the default-on path will actually render.
4. **Flag-reader census.** Enumerate every reader of the feature flag's default value and every
   process that constructs the animated component under the default — the hang shipped precisely
   because the default changed which hosts construct the planner.
5. **Canary rollout.** Flip default-on for a canary profile/cohort first; watch CI for
   idle-after-PASS hangs and the interactive product for phantom/ghost pixels; flip globally only
   after both stay clean.

---

## Appendix · evidence and method

- Read (read-only): `fixture/README.md`, `fixture/renderer-excerpt.ts` (46 lines),
  `fixture/symptom-log.txt`, `fixture/frames-digest-report.txt`, `fixture/ci-hang-evidence.txt`;
  skill `skills/plugin-upgrade/SKILL.md` (Mode A read-only discipline, validation/report structure;
  touchpoint classes per `references/pre-flight.md` cited by ID only). Fixture left byte-identical.
- Mechanism verification: an inline (in-memory, no fixture writes) re-implementation of
  `renderSpriteRows` reproduced all three renderer behaviors — stale `bg` surviving into the empty
  lower half of an upper-only cell (and into later same-fg upper-only cells), the `▄`-branch stale
  `fg`/wrong-half painting, and the un-overwritten surplus columns on a wide→narrow switch.
- Fixes are stated against the shipped code's exact lines: §1 → lines 16/35-38 (state cache) and the
  upper/lower-only branches (lines 25-30); §2 → line 41 (trim); §4 → the planner's re-armed
  `setTimeout` (`unref`).
