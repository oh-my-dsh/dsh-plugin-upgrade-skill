# S18 · The Terminal Sprite Render Trap — Diagnosis Report

Evidence base (read-only, unchanged): `fixture/renderer-excerpt.ts`, `fixture/symptom-log.txt`,
`fixture/frames-digest-report.txt`, `fixture/ci-hang-evidence.txt`.

Model: each terminal cell packs two vertical sprite pixels into one half-block glyph —
`▀` paints the upper half with the *foreground* color, `▄` paints the lower half with the
*foreground* color, and in both cases the *other* half is painted with the current
**background** color. SGR state (SGR 38;2 foreground, SGR 48;2 background) is sticky per
cell until changed or reset; the terminal never invents an "empty" half — something is
always painted there.

---

## 1. Phantom pixels at the right edges

### Mechanism

In `renderSpriteRows` there are four per-cell branches (lines 22–34):

| case | emitted sequence | glyph | which half is "empty" |
|---|---|---|---|
| `up` + `lo` defined | `fg(up) + bg(lo)` | `▀` | none |
| only `up` defined | `fg(up)` | `▀` | **lower half** |
| only `lo` defined | `fg(lo)` | `▄` | **upper half** |
| neither | `` (RESET) | ` ` | both |

The one-sided branches set **only the foreground** (`SGR 38;2;…`). They never touch the
background, and they do not emit RESET (the change-detection at lines 35–38 only emits
something when `seq !== current`). SGR 48;2 background is **sticky**: it survives from
cell to cell until a RESET or a new `bg()`.

So when a one-sided cell directly follows a fully filled cell (or follows a run of
one-sided cells downstream of a filled cell, with no empty cell in between):

- The glyph paints the defined half with the new foreground — correct.
- The **empty half is painted with the previous cell's background color** — a phantom
  pixel. The terminal cannot leave a half blank; a half-block glyph always fills both
  halves, and the code never told the terminal what the empty half should be.

Concretely: cell *x−1* is the dark outline with both pixels defined → emits
`fg(outline)+bg(outline)`. Cell *x* has an upper pixel only (the frame data ends in `.`
below/after it) → emits only `fg(up)` and `▀`. The lower half of cell *x* renders in the
stale outline background → a 1-cell-wide colored artifact hugging the outline. This is why
the symptom log locates the noise **strictly adjacent to filled areas** — right of the dark
outline cells, beside the sleep-Z symbols (one-sided glyphs drawn next to the body), and to
the right of the heart — and why it "moves with the animation" (edge geometry changes per
frame) while being "not part of any frame's data" (the frame rows are `.` at those columns;
the color comes from SGR state, not from frame data). It reads as "dim noise" because the
inherited background is whatever the neighboring body/outline pixel was.

Two supporting observations from the code:

- Empty cells *do* emit RESET (line 36), which is why phantoms only appear after filled
  runs — an empty cell cleans state, so the next one-sided cell's empty half is the
  default background (invisible). The leak window is exactly "filled cell → one-sided cell".
- The author already knew state must not leak across **rows**: line 42 appends RESET if the
  trimmed row doesn't end with it. Nothing prevents the leak across **cells within a row**.

### Precise escape fix

Make every one-sided cell pin its empty half to the default background explicitly:

```ts
} else if (up !== undefined) {
  seq = fg(up) + '\x1b[49m'   // SGR 49 = default background; lower half guaranteed clean
  ch = '▀'
} else if (lo !== undefined) {
  seq = fg(lo) + '\x1b[49m'   // upper half guaranteed clean
  ch = '▄'
}
```

(Symmetric variant: emit `RESET + fg(...)` or include `SGR 39/49` defaults for whichever
half is transparent. Equally valid is "never emit a `bg()` that the current glyph does not
consume".) Because the fix changes the composite `seq` strings, the existing
`seq !== current` dedup still works unchanged — two adjacent same-color one-sided cells
still emit one escape. Invariant to enforce: **after every cell, both halves' colors are a
function of that cell's own emission, never of the preceding cell.**

---

## 2. Ghost pixels surviving a switch to a narrower frame

### Mechanism

- **What the renderer drops from each row:** line 41, `out.replace(/[ ]+$/, '')` strips the
  trailing run of space cells (the transparent right margin) from every row before it is
  returned. The row that reaches the terminal simply *stops short* of the sprite's full
  40-column width — the surplus columns are never written at all.
- **What the text pipeline does to trailing whitespace:** the pipeline treats trailing
  whitespace as insignificant and trims/ignores it as well, so even if the renderer kept
  the spaces they would not survive as writes. Crucially, *absence of a write is not an
  erase*: no cells are cleared, and no erase-to-end-of-line (`EL`, `CSI K`) is emitted.

The renderer implicitly assumes "cells I don't write are empty." In a text-redraw loop
(cursor moves back up over the sprite area, new rows printed over the old), that assumption
is false: a terminal cell keeps displaying whatever was last written there until it is
overwritten or erased. So when a WIDE pose (tail swung out, rows reaching further right) is
replaced by a NARROWER pose, the new rows end left of the old tail, the surplus columns are
neither overwritten nor erased, and the previous frame's tail pixels remain on screen —
exactly symptom 2.

### The two-part fix

1. **Every row must erase its own tail — with an escape, not spaces.** After the row
   content, emit `RESET` followed by `EL` (`\x1b[0m\x1b[K`); equivalently stop trimming and
   pad each row to the fixed 40-column width with explicitly written spaces. Since both the
   renderer and the pipeline drop trailing *characters*, erasure must be expressed as an
   explicit escape sequence (or as writes the pipeline cannot distinguish from content —
   fixed-width padding). The RESET before `EL` matters: with BCE (background-color-erase)
   the erase would otherwise paint the stale background into the cleared cells.
2. **Frame switch must clear the previous frame's bounding box.** Track the previous
   frame's extent (max width/height actually drawn) and, before/while repainting, blank the
   surplus region — per-row `\x1b[K` covers narrower successors on repainted rows, and an
   erase-below (`\x1b[0J`) or explicit blanking of the old bounding box covers any cells
   outside the new repaint area. Repainting only "what the new frame contains" is the bug;
   repaint + erase must cover the *union* of what any frame has ever drawn.

Together: part 1 guarantees each printed row is clean to its right edge; part 2 guarantees
no cell of the old frame survives outside the new frame's rows. That is what "clean frame
switch" has to mean for variable-width frames.

---

## 3. Frame data drift (tail2)

### What the digest report says

`frames-digest-report.txt`: sha256 of each frame's 25 rows vs. the source art. 23 of 24
frame groups are OK; **`tail2` is MISMATCH** — 23 differing cells, all in the upper-right
spout/tail-tip area: rows 2–6 shifted 1 column left (ported `D` at col 26 vs. source col
27), an extra `D` at col 25, and extra `DD` at cols 36–37. This is the "6-pixel cluster
drawn at the wrong position" of symptom 3: a copy error, not a rendering bug — the frame
*data* itself is wrong, so no escape-sequence fix can repair it.

### Why the existing regression missed it

The report states the tail2 frame was **hand-copied** during the port, and the regression
that exists is an **excerpt-based** test "added later for a different frame": it asserts a
few rows/cells of one frame only. tail2's divergent cells (rows 2–6, cols ~25–37) were never
executed by any assertion. An excerpt test has two failure modes, both present here: it
covers a subset of frames, and a subset of each frame's area. Hand-copying is exactly the
kind of edit that silently lands a 1-column shift plus extras that no spot-check catches.

### The gate that prevents recurrence

Pin **every** frame with a **whole-frame content digest**: `sha256` over the canonical
25×40 row text of each frame, generated from the source art (as the digest report already
does) and checked in CI — fail the build on any single-cell difference, with the same
per-cell diff the report prints. Rules that make the gate stick:

- All frames are enumerated by the suite (tail1–tail4, blink, fin1/2, spout1–6, heart1–3,
  sleep1–5, standard) — **no excerpt-only coverage, no "a different frame" exemptions**.
- Frames are ported by script from the source art, never hand-copied; a port either
  regenerates the digest via the same script or it is not merged.
- Digest updates require the source art to change in the same commit (digest drift must
  always be explainable).

---

## 4. The CI hang

### Mechanism (from `ci-hang-evidence.txt`)

- The job passes all scene checks, then sits idle forever (killed at runner timeout;
  ~3 min baseline vs. 19 min idle observed). At kill: no running test, no pending
  assertion — but **live event-loop handles of kind `Timeout`, one per animation tick,
  each re-arming the next**.
- The sprite animation planner **reschedules a `setTimeout` for as long as its component
  stays mounted** — a self-re-arming timer chain (setInterval-by-setTimeout). The chain
  only stops when the component is unmounted. In Node, a pending/re-arming `Timeout` handle
  keeps the event loop alive; `handle.close()`/`clearTimeout` is the only thing that retires
  it.
- **Which hosts mount without unmounting:** the `channel-ui` scene-check hosts in CI —
  they mount the header component, run their checks, and *finish without unmounting it*.
  The last scheduled tick fires, re-arms, fires, re-arms… forever. The process is
  "finished but pinned": PASS on screen, event loop never drains, runner timeout kills it.
  Timeline confirms causality: the hang first appeared in the same push that flipped the
  animation default off→on (before the flip the timer chain never existed in these hosts).
- **Why the interactive terminal is unaffected:** its process is *supposed* to stay alive
  and is kept alive by TTY/stdin handles regardless; a leaked timer chain changes nothing
  about its lifetime. The timer leak is only fatal in hosts whose correct end-state is
  "zero live handles, process exits."

### The one-line fix

Make the CI scene-check host tear down what it mounts — one line at the end of each
scene check (after the assertions):

```ts
header.unmount();   // stops the planner's re-arm; the Timeout chain retires and the job exits
```

(defensive equivalent, if teardown exists but misses the timer: clear the stored handle in
the unmount path — `onUnmount(() => clearTimeout(this._tick))` — or guard the re-arm with
`if (!this.mounted) return;`). The design contract "reschedules while mounted" is fine;
the CI host violates it by never unmounting.

---

## 5. Prevention

### Renderer contract checklist (ship with any terminal sprite implementation)

1. **Half-closure invariant:** after every cell, both glyph halves are determined by that
   cell's own escape sequence. One-sided glyphs pin the empty half explicitly
   (`SGR 49`/`SGR 39` or full reset). No half ever inherits SGR state from a neighbor.
2. **Row closure:** every emitted row ends with RESET (no SGR leaks across rows) and erases
   its own tail with `EL` (`\x1b[K`) or fixed-width padding — erasure is never expressed as
   trailing spaces, which every text pipeline drops.
3. **Frame-switch closure:** switching frames erases the union bounding box of the previous
   and next frame (per-row `EL` plus erase-below/blanking of surplus columns and rows).
   "Draw the new frame" is never the whole spec; "leave the region exactly as the new frame
   implies" is.
4. **Erase-vs-write discipline:** with BCE in mind, erase sequences are always preceded by
   a background RESET so cleared cells take the default background.
5. **Data integrity:** every frame is digest-pinned (sha256 of canonical rows) against the
   source art; frames are generated by script, never hand-copied; CI checks **all** frames,
   whole-frame, with per-cell diff output on failure.
6. **Lifecycle contract:** every animation timer is owned by the mounted component and is
   cleared on unmount; a mounted-without-unmount host must still be able to reach a
   zero-handle end state. CI asserts job exit (e.g., fail if live handles remain after
   tests: `process._getActiveHandles()` audit / why-is-node-running check).

### Audit to run BEFORE flipping an animation feature default-on

1. **Host lifecycle census:** enumerate every CI suite/host that mounts the animated
   component (not just the ones you remember); for each, verify it unmounts on completion
   or the timer is cleared, then prove the process actually exits. Any host that "mounts
   and finishes" is a future hang.
2. **Whole-frame visual/data regression:** run every frame through the digest gate (§5.5)
   and capture real terminal output for phantom/ghost scans — empty halves next to filled
   runs, and wide→narrow switch screens diffed cell-by-cell.
3. **Switch matrix:** explicitly test wide→narrow and narrow→wide transitions between all
   adjacent animation frames, plus first-draw and final-teardown.
4. **Rollout shape:** flip behind a kill-switch on one canary CI group first; compare job
   duration/exit against baseline (the ~3-min job must still exit); keep the off-flip one
   config line away, and wire the timeout-kill signal ("PASS but doesn't exit") as an
   alert, since PASS-status dashboards hide exactly this failure.

---

## Summary of root causes

| Symptom | Root cause | Fix |
|---|---|---|
| Phantom pixels at right edges | one-sided branches emit `fg()` only; sticky SGR 48;2 background from the previous filled cell paints the empty half | pin empty half: `fg(x) + '\x1b[49m'` |
| Ghost pixels after wide→narrow switch | renderer trims trailing spaces (line 41); pipeline drops trailing whitespace; nothing writes or erases surplus columns; old pixels persist | per-row `RESET + \x1b[K` (or fixed width) + erase previous frame's bounding box on switch |
| tail2 misplaced tail tip | hand-copied frame drifted 1 column left + extras (23 cells); excerpt regression covered a different frame | whole-frame sha256 digest gate over all frames, script-generated ports |
| CI job PASS then hangs | planner re-arms `setTimeout` while mounted; channel-ui scene-check hosts mount the header and finish without unmounting; Timeout handles pin the event loop | unmount in the CI host after checks (one line) |
