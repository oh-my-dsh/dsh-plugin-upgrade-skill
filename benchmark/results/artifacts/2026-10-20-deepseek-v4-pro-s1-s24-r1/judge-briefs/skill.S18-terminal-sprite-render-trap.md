# JUDGE BRIEF · skill.S18-terminal-sprite-render-trap

## Criteria (sealed rubric)
- [half-cell-background] (20pt) Locate the upper-only/lower-only branches in renderer-excerpt.ts: they emit foreground only, leaving a previous cell’s SGR background active and painting the transparent half. Reset background on each half-filled cell with ESC[49m or an equivalent reset followed by restoring the intended foreground. A row-end reset alone occurs too late. Tie the mechanism to the edge symptoms rather than blaming artwork or the terminal emulator.
- [frame-clearing] (20pt) Explain the renderer’s trailing transparent-space trim and downstream whitespace handling: a narrower frame does not overwrite the previous frame’s surplus columns. Propose full-sprite-width row output plus erase-to-EOL (ESC[K), or a demonstrably equivalent explicit clearing procedure that survives whitespace trimming. Keep SGR state controlled. Merely adding spaces without accounting for the pipeline is incomplete.
- [frame-data-integrity] (20pt) Use frames-digest-report.txt to identify the hand-ported tail2 mismatch (23 changed cells; the visible shifted cluster is not the full diff count), distinguish data drift from renderer artifacts, and explain that a different-frame excerpt test missed it. Compare/assert every frame against trusted source art using digests or exact rows. Testing one excerpt or hashing against the already-drifted port is insufficient.
- [timer-liveness] (20pt) Use ci-hang-evidence.txt: mounted probe hosts never unmount, the planner continuously rearms referenced setTimeout handles, so finished checks cannot exit. Interactive TTY/stdin already keeps the product alive. Unref each newly scheduled planner timeout (timer.unref or equivalent) so animation continues while another handle is live but does not keep probes alive by itself. Extending CI timeouts or stopping animation globally does not fix the lifecycle contract.
- [renderer-and-rollout-prevention] (20pt) Consolidate background reset, full-width/erase behavior, balanced SGR state and source-backed all-frame integrity into a renderer checklist. Before default-on rollout audit timers and every mounting host, especially probes that finish without unmounting, and propose an exit/liveness regression. No actual render or CI execution is required.

## Caps (score ceilings; judge returns each with triggered true/false)
- CAP [contradictory-render-advice] ceiling=0 The final advice denies the need to reset the half-cell background, retains trailing trimming without equivalent clearing, rejects source-backed frame checks, or says the repeating planner timer should remain referenced / unref is harmful. Blaming the terminal emulator instead of fixing the demonstrated renderer defect also triggers this cap. Apply only to affirmative final advice or conclusions. Quoted, hypothetical or explicitly rejected bad examples do not trigger the cap; read the whole report.

## Candidate report(s)
#### FILE: S18-terminal-sprite-render-trap/report.md

# S18 · The Terminal Sprite Render Trap — Diagnosis & Fix Report

Methodology: read-only inspection (plugin-upgrade skill, Mode A). Evidence read from the
fixture pack only; nothing in the fixture was modified. The sprite is 25 rows x 40 columns
of palette characters ('.' = transparent) rendered with the half-block technique: each
terminal cell packs two vertical pixels into one glyph, foreground = upper pixel,
background = lower pixel.

---

## 1. Phantom pixels (the empty half of a half-filled cell)

**Root cause: the background SGR state is sticky across cells and is never reset for a
half-filled cell.**

SGR (Select Graphic Rendition) is *stateful* in ANSI terminals: once set, a color remains
active until another SGR changes it or a reset (ESC[0m / a specific reset) is emitted. The
renderer sets two kinds of state:

- foreground  ESC[38;2;R;G;Bm  — set by fg()
- background  ESC[48;2;R;G;Bm  — set by bg()

(here and below 'ESC' denotes the literal escape byte 0x1b.)

For a **full** cell (upper *and* lower pixel both opaque) the renderer emits
fg(up) + bg(lo) and prints ▀ (UPPER HALF BLOCK). The glyph ▀ paints its top half with the
foreground and its **bottom half with the background** — exactly what a full cell wants.

For a **half-filled** cell — one pixel opaque, the other transparent — the renderer emits
*only* a foreground sequence and prints the corresponding half-block glyph:

- upper-only (up defined, lo undefined): seq = fg(up), glyph ▀ — top half = fg,
  **bottom half = whatever background is currently active**;
- lower-only (up undefined, lo defined): seq = fg(lo), glyph ▄ — bottom half = fg,
  **top half = whatever background is currently active**.

Because seq for these cells never touches the background, the background color left by the
*previous* cell persists. The transparent half of a half-block glyph is therefore painted
with the prior cell's background instead of the terminal default, producing a solid, dim
colored pixel where the frame data says 'transparent'.

**Which cells expose it:** half-filled cells that immediately follow a cell which set a
non-default background — i.e. a preceding full (opaque) cell. At the sprite's right edges
the dark outline, the sleep-Z strokes, and the heart all taper off through exactly this
pattern: a full outline cell (both pixels dark → sets 48;2 to the dark outline color) is
left-adjacent to a half-filled cell carrying the outline's last single pixel. That cell's
empty half inherits the dark outline background, which is why the noise sits in a 1-cell
column *to the right of* the dark outline cells, next to the sleep-Z, and to the right of
the heart. The noise is 'dim' because it is a solid background half-block in the leftover
color, and it appears/disappears with the animation because it depends on the moving edge.

The dedup logic does not save it: `current` compares the whole seq string, so a half cell
following a full cell emits a redundant fg(...) and still leaves the background untouched.

**Precise escape fix:** for every half-filled cell, explicitly reset the background to
default so the glyph's transparent half is painted with the terminal default, not the
inherited color. Use the SGR default-background sequence ESC[49m:

    // upper-only (▀): empty LOWER half must be default background
    seq = fg(up) + '\x1b[49m'; ch = '▀';
    // lower-only (▄): empty UPPER half must be default background
    seq = fg(lo) + '\x1b[49m'; ch = '▄';

(Equivalently: always emit an explicit background for every cell — bg(lo) for a full cell
and ESC[49m for the transparent half — so no cell ever relies on inherited background
state.)

---

## 2. Ghost frames (previous frame survives a narrower frame switch)

**What the renderer drops from each row:** trailing spaces. Line 41 trims the assembled
row before returning it:

    let row = out.replace(/[ ]+$/, '')   // strips every trailing transparent cell

A transparent cell is emitted as a plain space (ch = ' '), so replace(/[ ]+$/,'') removes
every trailing transparent cell, shortening the row to its last opaque glyph. A *narrow*
pose (tail tucked in, rows ending further left) therefore renders strictly fewer columns
than a *wide* pose (tail fully swung out).

**What the text pipeline does to trailing whitespace:** it never writes it. The animation
redraw reprints the (already trimmed) rows onto the same terminal cells; trailing
whitespace carries no glyphs and is dropped, and no erase sequence is issued. Writing a
shorter row leaves the cells to its right untouched — the terminal keeps whatever glyphs
the previous frame left there. So the wide pose's tail, which occupied surplus columns, is
never overwritten by the narrow frame and 'survives' the switch.

**Two-part fix for a clean frame switch:**

1. **Uniform full-width rendering** — do not trim; emit every row at the sprite's fixed
   width (40 columns), padding narrow rows with transparent cells (spaces) so each frame
   paints the *entire* cell span, explicitly writing transparent cells over the previous
   frame's surplus columns.
2. **Explicit region erase between frames** — before drawing each frame, clear the
   sprite's bounding box (or issue erase-to-end-of-line ESC[K per row) so any leftover
   columns are removed even if widths ever differ. Part 1 fixes the root cause; part 2
   guarantees correctness independent of frame geometry.

---

## 3. Frame data drift (hand-ported tail2)

**What the digest report says:** every frame's 25-row sha256 matches the source art
(standard, blink, fin1-2, spout1-6, tail1, tail3-4, heart1-3, sleep1-5 all OK) **except
tail2 (MISMATCH)**. The tail2 diff is 23 cells, all in the upper-right spout/tail-tip
area: row 2 has the D one column left of source (col 26 vs 27); row 3 has an extra D at
col 25, the DBD at cols 26-28 shifted one column left, and an extra DD at cols 36-37;
rows 4-6 have the whole upper-right cluster shifted one column left. This is a systematic
1-column-left misplacement introduced when tail2 was hand-copied during porting.

**Why the existing per-excerpt regression missed it:** the only regression was an
*excerpt-based* check — it asserted a selected subset of rows/cells for a *different* frame
and never covered tail2. Because it validated an excerpt rather than the full 25×40 grid
of every frame, the drift landed in an unchecked region (tail2's upper-right corner) and
slipped through.

**The gate that prevents recurrence:** pin the sha256 of each frame's *complete* 25-row
content against the source-art digest in CI (a full-frame digest gate, exactly what the
frames-digest report represents). Any hand-port drift in any cell of any frame then fails
the hash comparison instead of depending on a human-chosen excerpt.

---

## 4. The hang (finished but never exits)

**Mechanism:** the sprite animation planner runs a per-tick setTimeout loop — each tick
re-arms the next setTimeout as long as its component stays mounted. In Node a pending
setTimeout is a *live event-loop handle*, so while the component remains mounted there is
always one pending timer and the event loop never drains. After every scene check passes,
the job has no test work and no pending assertion — yet the process cannot exit because the
timer chain still pins the loop. Result: channel-ui shows PASS everywhere and then sits
idle until the runner timeout (≈3 min before the flip, one recording 19 min idle).

**What reschedules forever:** the animation planner's tick timer — one live Timeout handle
per tick, each re-arming the next.

**Which hosts mount without unmounting:** the headless CI/test hosts running the
channel-ui group. They mount the header component (which owns the sprite animation) to run
their scene checks and finish *without* unmounting it, so the planner never stops and the
timer chain persists past the last assertion.

**Why the interactive terminal is unaffected:** its process is already kept alive by its
TTY/stdin handles — a terminal is a long-running process by design — so the timer chain
adds no visible 'hang', and closing it releases those handles regardless of the timer.

**One-line fix:** unref the tick timer so a pending animation timer no longer keeps the
event loop alive:

    const h = setTimeout(tick, delay); h.unref();

.unref() removes the timer from the loop's ref count, so the process exits as soon as all
real work is done even if the component never unmounts. (The complete lifecycle fix also
stops the chain — clearTimeout — in the component's unmount/dispose, but .unref() is the
single line that actually resolves the 'finished but hanging' symptom on hosts that never
unmount.)

---

## 5. Prevention

### Renderer contract checklist (ship with any terminal sprite implementation)

1. **Explicit per-cell color state** — every cell emits a complete color set; the
   transparent half of a half-block glyph must be explicitly defaulted with ESC[49m (never
   rely on inherited background).
2. **Fixed-width output** — render every frame to the full sprite width; pad, never trim
   trailing spaces, so every cell is always written.
3. **Region erase on frame switch** — clear the sprite bounding box (or ESC[K per row)
   between frames so surplus columns cannot ghost.
4. **Full-frame data pinning** — sha256 each frame's complete grid against source art; a
   drift gate runs in CI on every frame, not excerpts.
5. **Timer hygiene** — animation tickers .unref() their setTimeout and clearTimeout on
   unmount; assert the process exits cleanly after work completes.
6. **Terminal state restoration** — end each draw with ESC[0m and restore cursor/colors.

### Audit to run BEFORE flipping an animation feature default-on

1. **Renderer-contract compliance** — verify items 1-3 (explicit bg default, full-width
   rows, region erase) with a wide↔narrow↔wide frame-switch test that asserts zero ghost
   pixels and a right-edge/half-cell test that asserts zero phantom pixels.
2. **Full-frame digest gate** — confirm every ported frame, not just an excerpt, passes the
   sha256 comparison against source art.
3. **Event-loop drain / exit gate** — run the CI scene checks and assert the process exits
   within the historical budget with no live timer handles at completion (catches the
   'PASS then hang' before rollout).
4. **Headless-host coverage** — include the headless hosts that mount-and-finish-without-
   unmounting, since the interactive terminal masks the timer leak.
5. **Rollback plan** — keep the feature flag off-by-default and a one-flag revert verified,
   so a bad flip can be undone without a code change.



## Required output (JSON only)
{"decisions":[{"id":"<criterion-id>","verdict":"pass|partial|fail|missing","reason":"short"}],"caps":[{"id":"<cap-id>","triggered":false,"reason":"short"}]}
Every criterion and cap exactly once. pass=full points, partial=half, fail/missing=0; a triggered cap caps the total.