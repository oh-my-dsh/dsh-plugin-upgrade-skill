# S18 · The Terminal Sprite Render Trap — Analysis Report

Mode: read-only inspection (fixture unchanged). Evidence: renderer-excerpt.ts (as shipped), symptom-log.txt, frames-digest-report.txt, ci-hang-evidence.txt.

## 1. Phantom pixels — SGR background persistence bleeding into the empty half of a half-filled cell

**Mechanism.** In renderSpriteRows, the escape sequence emitted per cell is chosen by which of the two packed pixels exist:

- both pixels: `fg(up) + bg(lo)` + '▀'  (complete state)
- upper only:  `fg(up)` + '▀'            (**no background set**)
- lower only:  `fg(lo)` + '▄'            (**no background set**)
- neither:     RESET + ' '

SGR attributes are **sticky**: a `48;2;r;g;b` set by one cell stays in force for every following cell until a RESET or another background sequence replaces it. The dedup loop (`if (seq !== current)`) only emits `seq` when it changes, and the half-cell sequences *never contain a background term at all* — so nothing ever clears a background set earlier in the row.

The '▀' glyph paints its **upper half in the foreground color and its lower half in the current background color**; '▄' is the mirror image. Therefore a cell that should be half-empty renders its EMPTY half with whatever background the last full cell left behind.

**Which cells expose it.** Exactly the half-filled cells that follow a full (both-pixels) cell mid-row. At the sprite's right edges the dark outline cells are full cells (`fg+bg`); immediately to their right, or interleaved with them, sit single-pixel cells — the sleep-Z strokes and the heart are isolated pixels on a transparent field, i.e. upper-only / lower-only cells. Each such cell inherits the outline's (or a neighbor's) background and paints a phantom colored pixel into the half of the cell that frame data says is '.'. Because the leading edge of a row starts from default background, the artifact appears mid-row / at right edges — precisely where the symptom log puts the "1-cell-wide column of dim colored noise" that "moves with the animation" and is "NOT part of any frame's data."

**Precise fix.** Make every cell's SGR state complete: the empty half of a half-filled cell must be explicitly set to the default background instead of inheriting stale state:

- upper-only: `seq = fg(up) + '\x1b[49m'`, ch '▀'
- lower-only: `seq = fg(lo) + '\x1b[49m'`, ch '▄'

(`49m` = default background; equivalently emit `bg(transparentPaletteEntry)`.) The string-dedup against `current` then still works, because the full-state sequences dedupe correctly. Contract rule: **no cell may rely on inherited SGR state; foreground AND background are always both specified (or both reset).**

## 2. Ghost frames — trimmed rows + whitespace-eating pipeline = no erase

**What the renderer drops.** After building a row, the shipped code runs `out.replace(/[ ]+$/, '')`: it strips the trailing transparent cells (the space glyphs at the row's right end) entirely. A narrow frame therefore emits *shorter* row strings than the wide frame that preceded it.

**What the pipeline does.** The terminal text pipeline additionally trims trailing whitespace from each line, so even if the renderer had padded rows with spaces, the padding would be eaten before reaching the screen.

**Why ghosts survive.** A terminal is destructive-write only for the cells you actually write: overwriting a row with a shorter string repaints the left columns but leaves the surplus right columns untouched. No erase-in-line (`ESC[K`) or erase-region sequence is ever emitted, and the trimmed-away trailing spaces were the only thing that could have overwritten the old wide tail. Result: switching WIDE → NARROW leaves the previous frame's tail pixels on screen at their old positions — the ghost frame of the symptom log.

**Two-part fix (both halves are required).**

1. **Render the full rectangle every frame** — stop trimming; pad every row to the sprite's full 40-column width with transparent cells (space + complete/reset SGR state), so every cell in the sprite area is overwritten on every frame regardless of frame width. (This alone is necessary but not sufficient, because of the pipeline's trailing-whitespace trimming.)
2. **Emit an explicit erase that survives trimming** — append erase-to-end-of-line `\x1b[K` after each row's last visible cell (and/or erase the whole sprite rect / cursor-home + clear before drawing the new frame). A CSI erase sequence is control bytes, not whitespace, so the text pipeline cannot strip it; it guarantees any leftover from a wider predecessor is wiped even where the current row emits nothing.

## 3. Frame data drift — tail2 MISMATCH, excerpt regression blind spot, digest gate

**What the digest report says.** Per-frame sha256 over each frame's full 25 rows, compared against the source art: every frame OK **except tail2 — MISMATCH, 23 differing cells, all in the upper-right spout/tail-tip area**: row 2 has 'D' at col 26 where source has it at col 27 (1-col left shift); row 3 has an extra 'D' at col 25, the 'DBD' run at cols 26–28 shifted left 1, and extra 'DD' at cols 36–37; rows 4–6 have the whole upper-right cluster shifted one column left. tail2 was **hand-copied during conversion** — a classic transcription slip, not a renderer bug. (The renderer's rows-are-truth design faithfully renders the drifted data.)

**Why the existing regression missed it.** The only frame-data regression was excerpt-based and was added later **for a different frame**; it never covered tail2. Per-excerpt checks prove only that the sampled slices match — an unsampled frame is completely unguarded.

**The gate.** Pin **every frame by a whole-frame digest** (sha256 of all 25 rows) against the source art, stored as a golden digest manifest, and compare **all frames in CI** — fail the build on any mismatch. Whole-frame, all-frames coverage means a one-cell hand-port slip in any frame fails immediately at port time; digests, not excerpts, because excerpts define their own blind spots.

## 4. The CI hang — a self-rescheduling timer chain pins the event loop

**Mechanism.** After the animation feature flipped default-on, the sprite animation planner's tick is implemented as a `setTimeout` that **re-arms the next tick at the end of every callback, for as long as its component stays mounted** — an unbounded self-rescheduling timer chain. Each pending `setTimeout` is a live `Timeout` handle that **refs the Node.js event loop**: while any such handle is alive, the process will not exit, even with zero work remaining.

**Which hosts hang.** The CI "channel-ui" hosts **mount the header component and finish WITHOUT unmounting it**. Every scene check PASSes, no test or assertion is pending — but the planner chain is still armed, so the event loop has live Timeout handles forever, the process sits idle, and the runner eventually kills it at timeout (previously ~3 min, one observation: 19 min idle before manual kill). Timeline confirms causality: first failure in the same push that flipped the default.

**Why interactive is unaffected.** The interactive terminal product's process is kept alive by its **TTY/stdin handles regardless of the timer chain** — the extra ref'd timers change nothing about its lifetime (and it exits via user quit, which tears the UI down). Only a host that mounts-without-unmount and would otherwise exit exposes the pin.

**One-line fix.** `unref()` the planner timer: `timer = setTimeout(tick, delay); timer.unref();` — an unref'd timer still fires while the process is alive but does not, by itself, keep the event loop from exiting. (The structural companion is clearing the timer on unmount, but the one-line fix for "finished but hanging" is `.unref()`.)

## 5. Prevention — renderer contract + default-on rollout audit

**Renderer contract checklist** a terminal half-block sprite implementation should ship with:

1. **Complete SGR state per cell** — every emitted cell specifies foreground AND background (or both reset); half-filled cells explicitly set the empty half to default background (`\x1b[49m`); no reliance on sticky inherited SGR; dedup compares full state.
2. **Fixed-rectangle rendering** — every frame renders the full sprite bounding box; trailing transparent cells are emitted, not trimmed away.
3. **Erase semantics independent of whitespace** — `\x1b[K` per row (or region erase before redraw); never depend on trailing spaces surviving the text pipeline, and treat pipeline trailing-whitespace trimming as guaranteed-hostile.
4. **Frame data pinned by whole-frame digests** — sha256 per frame over all rows against source art, all frames, enforced in CI; excerpt tests are documentation, not gates.
5. **Animation timers are cancellable and non-pinning** — every self-rescheduling timer is `.unref()`'d and cleared on unmount; no component leaves a live timer chain after teardown.
6. **Deterministic redraw** — cursor positioning + full-rect overwrite per frame; visual snapshot test of the sprite's edge columns (where SGR bleed and ghosts appear first).

**Audit to run BEFORE flipping an animation feature default-on:**

- **Lifecycle audit**: enumerate every host that mounts the animated component; for each, prove an unmount path exists. Flag mount-without-unmount hosts (exactly the CI channel-ui pattern).
- **Handle audit**: after the host's work completes, dump active event-loop handles (`process._getActiveHandles()` / why-is-node-running); any live Timeout owned by the animation planner is a hang-in-waiting.
- **Timer audit**: grep for `setTimeout`/`setInterval` chains introduced by the feature; verify each is `unref()`'d or tied to teardown.
- **CI baseline comparison**: compare job wall-time distribution before/after the flip on the same runner pool; a PASS-then-idle tail is the signature.
- **Data gate**: whole-frame digest manifest green in CI before the flag moves.
- **Visual regression**: render wide→narrow frame switch headlessly and assert the terminal grid, including right-edge columns, matches expected — catches phantom/ghost classes that unit tests on strings miss.

---
*Skill note: work performed under the plugin-upgrade skill's read-only inspect discipline (Mode A) — fixture untouched; report written only under agent-output/.*
