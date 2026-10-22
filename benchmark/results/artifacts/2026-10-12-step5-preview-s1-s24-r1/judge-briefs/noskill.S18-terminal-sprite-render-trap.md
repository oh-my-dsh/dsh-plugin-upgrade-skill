# JUDGE BRIEF · noskill.S18-terminal-sprite-render-trap

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

# S18 — Terminal Sprite Render Trap: Root-Cause Report

**Scope:** read-only analysis of the fixture evidence pack (`renderer-excerpt.ts`,
`symptom-log.txt`, `frames-digest-report.txt`, `ci-hang-evidence.txt`) under
`fixture/`. The fixture was not modified. Line numbers below refer to
`fixture/renderer-excerpt.ts`.

**Verdict up front.** Four independent defects, all latent behind the animation
feature flag (which is why the default-on flip is what exposed them):

1. **Phantom pixels** — the renderer writes a *partial* SGR state per cell, so the
   sticky background color of the previous cell bleeds into the empty half of a
   half-filled half-block cell at the sprite's right edge.
2. **Ghost frames** — the renderer trims trailing transparent cells off each row
   and never issues an erase, so a narrower frame cannot blank the columns a wider
   previous frame painted.
3. **Frame-data drift** — `tail2` was hand-ported with a systematic 1-column left
   shift plus stray cells; the regression was excerpt-based and added for a
   different frame, so it never covered it.
4. **CI hang** — a self-rescheduling `setTimeout` chain in the animation planner
   holds a live libuv Timeout handle while its component stays mounted; the CI
   hosts mount the component and never unmount it, so the process can't exit.

---

## 1. Phantom pixels at the right edges

### The mechanism (a partial SGR state per cell)

Half-block rendering packs two vertical pixels into one cell: foreground = upper
pixel, background = lower pixel. The invariant that makes this safe is: **every
cell must fully specify the SGR state it depends on**, because SGR attributes are
*sticky* — a `38;2` (foreground) or `48;2` (background) select persists across
cells until overwritten or reset.

The renderer breaks that invariant in both single-pixel branches:

```ts
} else if (up !== undefined) {
  seq = fg(up)            // L26 — sets 38;2 ONLY. Background NOT touched.
  ch = '▀'                // L27 — upper half = fg, LOWER half = current background
} else if (lo !== undefined) {
  seq = fg(lo)            // L29 — sets 38;2 ONLY. Background NOT touched.
  ch = '▄'                // L30 — lower half = fg, UPPER half = current background
}
```

- The **both-pixels** branch (L23) is correct: `fg(up) + bg(lo)` sets both
  channels, so the glyph is fully determined.
- The **upper-only** branch (`▀`) paints the upper half with the new foreground
  and the **empty lower half with the terminal's current background** — which is
  still the previous cell's `48;2` background, because nothing cleared it.
- The **lower-only** branch (`▄`) is the same trap with halves swapped: it uses
  the foreground channel for the lower pixel and leaves the **empty upper half**
  showing the stale background.

**Which SGR state persists across cells:** the **background color** (`\x1b[48;2;r;g;b`,
L6). The foreground state is not the culprit here, because the only cells that
don't set a foreground are fully-transparent spaces, which emit `RESET` at L36.

**Which cells expose it:** any half-filled cell that *immediately follows a
background-setting cell in the same row* — i.e., exactly the boundary where a
full cell (fill, or the dark right-edge outline) is followed by a column holding
only one pixel. That is precisely where the symptom log reports the noise:
"a 1-cell-wide column of dim colored noise directly to the right of the dark
outline cells, next to the sleep-Z symbols, and to the right of the heart glyph"
— one cell wide (one column of leaked background), and it "appears and moves with
the animation" because the leaked background is whatever the last fill/outline
cell of the previous pose left set. The frame data is innocent: those columns are
`'.'`, but `'.'` maps to *undefined* in the palette, which routes the cell into a
single-pixel branch (L25/L28) whenever the paired row half holds a color — the
"empty" half then renders the previous cell's background instead of blank.

Note the L35 cache compounds the diagnosis: `current` keys on the emitted
sequence string, and for single-pixel cells that string doesn't encode the
background at all, so the cache can't detect that the inherited background is
wrong.

The per-row `RESET` (L42) does not save this: the leak is **intra-row**, cell to
cell, and `RESET` only runs at the row's end.

### The precise escape fix

Make every cell specify **both** channels, using the terminal default (or the
pane's designated transparent/backdrop color) for the missing half:

```ts
} else if (up !== undefined) {
  seq = fg(up) + '\x1b[49m'   // 49m = default background, explicitly clears the leak
  ch = '▀'
} else if (lo !== undefined) {
  seq = fg(lo) + '\x1b[49m'   // same: ▄'s empty UPPER half becomes default, not stale bg
  ch = '▄'
}
```

Equivalently (and more robustly): always emit `fg + bg`, mapping the missing
pixel to a single canonical `TRANSPARENT` rgb (the pane backdrop) so no branch
ever relies on inherited state — and, if any cell still emits a partial state,
prefix it with `RESET`. The fix is one escape per half-filled branch
(`\x1b[49m`, default background); a full-state rewrite is the durable version.

---

## 2. Ghost pixels across frame switches (wide → narrow)

### What the renderer drops, and what the pipeline does to it

```ts
let row = out.replace(/[ ]+$/, '')   // L41 — strips ALL trailing space cells
if (!row.endsWith(RESET)) row += RESET   // L42 — attribute reset only; erases nothing
```

- **Dropped from each row:** every trailing *transparent* cell. A row's emitted
  width is adaptive — it ends at the last non-transparent cell instead of the
  sprite's fixed 40 columns.
- **What the text pipeline does with trailing whitespace:** it is *removed before
  it ever reaches the terminal*. The trim at L41 guarantees the write for a row
  is exactly as wide as that frame's last colored cell — the transparent
  "blanking" cells that would have painted spaces over a previous frame's wider
  content are never written. (Any downstream logger/normalizer that also trims
  trailing whitespace reinforces this, but the renderer itself is the source.)
- **Why the old frame survives:** a terminal maps row-by-row, but writing a
  *shorter* line over a previously *longer* one leaves the surplus columns
  untouched. The narrow frame renders correctly; the columns to its right still
  hold the previous wide pose's tail cells — glyphs *and* colors — because
  nothing in the new frame addressed them. `RESET` (L42) resets SGR state; it
  does not erase cells.

So the "ghost" is not a render bug in the new frame at all — it is *stale state
outside the new frame's written rectangle* that the renderer assumes the terminal
will forget. It won't.

### The two-part fix

1. **Stop trimming; render the full declared width.** Emit every row at the
   sprite's fixed column count (40) — transparent tail cells as spaces (after a
   `RESET`, so they paint default blanks) — so every frame's write covers the
   identical cell rectangle regardless of pose. Row width must be a constant of
   the frame contract, not a function of the frame's content.
2. **Explicitly erase what a previous frame could have written.** End (or begin)
   each row with `\x1b[K` (EL — erase from cursor to end of line) so any residue
   beyond the written content is blanked by the terminal itself; if frames can
   differ in *height*, also erase the leftover terminal rows (`\x1b[K` per
   remaining row, or `\x1b[J` below the cursor, / `\x1b[2J` for a full-frame
   repaint).

Part 1 alone fails if any frame is ever narrower/taller than the constant width
(typos, future poses); part 2 alone leaves the renderer silently dependent on
erase ordering. Together they make a clean switch a property of the renderer
rather than of the frame data.

---

## 3. Frame-data drift (the misplaced tail tip)

### What the digest report says

A per-frame sha256 over each frame's 25 rows, compared against the source-art
frames the sprite was ported from, reports **exactly one bad frame: `tail2`** —
all others (standard, blink, fin1-2, spout1-6, tail1/3/4, heart1-3, sleep1-5)
match. The `tail2` detail:

- **23 differing cells, all in the upper-right spout/tail-tip area** — a clean
  localization to the hand-ported region, not a global corruption.
- **A systematic 1-column left shift:** row 2 ported `D` at col 26 vs source col
  27; row 3 `DBD` at cols 26-28 shifted left; rows 4-6 upper-right cluster
  shifted 1 column left throughout — consistent with an off-by-one column
  introduced while hand-copying.
- **Two transcription artifacts on top of the shift:** an extra `D` at row 3 col
  25 and an extra `DD` at row 3 cols 36-37 — cells that exist in no source frame.

This matches the user symptom exactly: "a 6-pixel cluster drawn at the wrong
position" — the shifted tail-tip cluster, rows 2-3, ~6 cells.

### Why the existing regression missed it

The regression was **excerpt-based and added later, for a different frame**. An
excerpt test samples a subset of frames and/or a subset of rows/columns. `tail2`
fails every axis that would have caught it: it wasn't the frame the test was
written for, and (per the report) it "did not cover it" — neither the frame nor
the upper-right region was in the sampled window. Sampling cannot detect drift
in the unsampled complement; the drift sat in exactly that complement.

### The gate that prevents recurrence

- **Pin 100% of frames by full-content digest, not excerpts.** Commit the sha256
  of each frame's canonical serialization (all 25 rows, exactly as the digest
  report computes it) in a manifest; CI recomputes and fails on any mismatch.
  New/hand-edited frames must regenerate digests through review — a silent
  hand-edit fails the gate.
- **Kill the hand-copy step:** port from source art programmatically (the digest
  pipeline is the evidence that a programmatic port is reproducible), so drift
  has no author.
- Extend the regression from *excerpts* of one frame to *every frame × every
  cell*, with the digest as the cheap invariant plus exact source-art fixtures
  for the frames it covers.

---

## 4. The CI hang: "finished but alive"

### The mechanism

From `ci-hang-evidence.txt`: all scene checks PASS, then the job idles until the
runner timeout (~19 min observed locally vs a ~3 min baseline). At kill: no
running test, no pending assertion — the event loop holds **live `Timeout`
handles, one per tick of the sprite animation planner, each re-arming the next**.

That is the classic **self-rescheduling timer**:

```ts
tick() { /* advance one animation frame */ this.t = setTimeout(() => this.tick(), dt) }
```

Every `setTimeout` that fires schedules its successor, so the chain *never runs
out of work* — as long as something keeps calling the planner. The planner
reschedules "for as long as its component stays mounted," and these particular CI
hosts **mount the header component and finish without unmounting it**. Node exits
only when the event loop has no more handles; one live `Timeout` is enough to
pin the loop open forever. The work is done; the *handle* is not.

### Why the interactive terminal is unaffected

There, the process is kept alive by the **TTY/stdin handles** regardless of the
timer chain — a long-lived interactive process is *supposed* to have a permanent
stdin handle, so the animation timers are irrelevant to its lifetime and the
hang is invisible. The bug is not "the timer is long-running" (that's fine in a
TTL-pinned app); it's "the timer is the *only* thing keeping a batch process
alive after its work completed" — which only manifests where nothing else pins
the loop, i.e. headless CI. Defaulting the feature **on** is what moved the
planner into the CI host mount set; before the flip, CI never mounted an
animating component.

### The one-line fix

`unref()` the rescheduled timeout so it no longer counts toward event-loop
liveness:

```ts
this.t = setTimeout(() => this.tick(), dt); this.t.unref()   // timer keeps firing while anything else keeps the process alive; never blocks exit
```

(The interactive product doesn't notice: stdin/TTY still pins its loop. The
correct *complementary* hygiene is `clearTimeout` on unmount, but the one-line fix
for the hang is `unref()`.)

---

## 5. Prevention

### A. Renderer contract checklist (ship this with the implementation)

1. **Complete SGR state per cell.** Every emitted cell specifies both channels
   — `38;2` **and** `48;2` (or explicit defaults `39m`/`49m`) — and no cell relies
   on state inherited from a previous cell. Test: for each cell, the rendered
   color is a pure function of that cell's data.
2. **Empty halves are painted, not inherited.** In every half-block branch, the
   pixel-less half is explicitly the designated transparent/backdrop color
   (`\x1b[49m` or a `TRANSPARENT` palette entry). There is an explicit test case
   for upper-only and lower-only cells adjacent to full cells.
3. **Transparent cells reset.** Any cell rendering a space after colored state
   emits `RESET` (or explicit default fg+bg) before the space — and state caches
   key on the *full* effective state (fg × bg), not on the emitted-sequence
   string alone.
4. **Fixed row width.** Rows are always rendered at the declared frame width;
   trailing transparent cells are *written* (as blanks) or explicitly erased —
   never silently trimmed from the outgoing stream.
5. **Explicit erase semantics per frame.** A redraw always covers the previous
   frame's full rectangle: end-of-line erase (`\x1b[K`) on every row plus
   leftover-row erase (`\x1b[J`/`\x1b[K` rows) when frame height can vary.
6. **Validated frame dimensions.** Every frame is checked against the declared
   size (25×40) and the sequence's max width at load, not trusted.
7. **100% frame digests in CI.** Full-content sha256 per frame (not excerpts),
   committed as a manifest, generated programmatically from source art.
8. **Golden-stream/golden-grid rendering tests.** Render each frame — and each
   *frame-switch pair* (wide→narrow especially) — through a reference terminal
   model or escape-stream snapshot and diff the resulting cell grid, asserting
   zero residue and zero phantom cells.
9. **Timer/lifecycle discipline.** Every recurring timer is `unref()`'d and/or
   cleared in the component's unmount/destroy path; CI asserts the process can
   exit (exit-time budget or open-handle detection).

### B. Audit to run BEFORE flipping an animation feature default-on

1. **Render the contract checklist above against the actual shipped renderer**
   (it exists and is reviewable before the flip — the checklist is written for
   that review).
2. **Run the full-frame digest gate over every frame**, not the excerpt set;
   regenerate and re-review any frame that was hand-ported; prove the gate fails
   when a frame is intentionally perturbed.
3. **Exercise frame transitions in a headless terminal model**: for every
   ordered pair of poses, render A then B and diff the cell grid for stale cells
   (ghost pixels), including all wide→narrow transitions and the final
   half-row (odd row count).
4. **Replicate the CI mount topology locally and measure exit time**: mount the
   animated components exactly as CI does (mount → finish → exit, *without*
   unmount), confirm the process exits under a timeout budget, and inspect open
   handles (`--trace-event`/open-handle tooling) for self-rescheduling Timeouts.
   Compare exit time before/after the flip — the ~3 min baseline is the
   regression tripwire.
5. **Confirm CI actually exercises the default-on path.** The default-off flag
   meant none of this ran in CI; a flip must first make CI run the feature, and
   the audit must be green *with the flag on* before the default changes.
6. **Check palette/type coverage of the half-block branches** (both / upper-only
   / lower-only / transparent × adjacency to background-setting cells) — phantom
   pixels live in the untested branch-adjacency combinations.

---

## Appendix: defect → evidence map

| Symptom | Root cause | Fixture evidence |
|---|---|---|
| Phantom pixels at right edges (outline, Zs, heart) | Single-pixel branches emit only `38;2`; sticky `48;2` background leaks into the empty half of `▀`/`▄` | `renderer-excerpt.ts` L29-30, L25-27; `symptom-log.txt` §1 |
| Ghost tail after wide→narrow switch | Trailing-space trim (L41) shrinks each row's write; no erase; `RESET` (L42) doesn't blank cells | `renderer-excerpt.ts` L41-42; `symptom-log.txt` §2 |
| Misplaced 6-pixel tail-tip cluster | `tail2` hand-ported: 1-col left shift, rows 2-6 upper-right, +3 stray `D` cells | `frames-digest-report.txt`; `symptom-log.txt` §3 |
| CI job passes, then hangs until runner timeout | Self-rescheduling `setTimeout` planner pinned by mounted-but-never-unmounted header component; TTY/stdin handles mask it interactively | `ci-hang-evidence.txt` |


## Required output (JSON only)
{"decisions":[{"id":"<criterion-id>","verdict":"pass|partial|fail|missing","reason":"short"}],"caps":[{"id":"<cap-id>","triggered":false,"reason":"short"}]}
Every criterion and cap exactly once. pass=full points, partial=half, fail/missing=0; a triggered cap caps the total.