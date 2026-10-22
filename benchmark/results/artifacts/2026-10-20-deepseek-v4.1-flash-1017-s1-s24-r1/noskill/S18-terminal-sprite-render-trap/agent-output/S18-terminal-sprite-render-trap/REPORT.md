# S18 · The Terminal Sprite Render Trap — Root-Cause Report

**Evidence read (read-only):** `fixture/renderer-excerpt.ts`, `fixture/symptom-log.txt`,
`fixture/frames-digest-report.txt`, `fixture/ci-hang-evidence.txt`, `fixture/README.md`.
**Method:** static review of the shipped loop, plus a faithful re-implementation of
`renderSpriteRows` (same branches, same trim, same RESET placement) driven through an ANSI
state machine that records the fg/bg actually in effect at each written cell. Script:
`repro-halfblock.mjs`; captured output: `halfblock-trace.txt`. The fixture was not modified,
nothing was installed, nothing from it was executed, and no network was used.

Line references below are to `fixture/renderer-excerpt.ts` (46 lines).

---

## 0. Symptom → mechanism → fix at a glance

| # | Reported symptom | Actual mechanism (one line) | Fix |
|---|---|---|---|
| 1 | 1-cell column of phantom colour right of the dark outline, the sleep-Z and the heart | The cell is half-filled: only `fg` is emitted, so the empty half is painted with the **background SGR left over from the last cell on that row that had a lower pixel** (lines 25-30). | Emit an explicit background for every half-cell: SGR `49` (default bg) or the canvas colour, i.e. `fg(up) + '\x1b[49m'`. |
| 2 | Wide pose's tail keeps showing after the switch to a narrower pose | The renderer **deletes** every trailing transparent cell of a row (line 41), so row width is data-dependent (40 cells wide pose vs 28 narrow); the text pipeline then right-trims blank columns, so the surplus columns are never written and the terminal keeps the old glyphs. | (a) fixed-canvas-width rows, no trim; (b) explicit `ESC[K` (erase-to-end-of-line) / region clear on every frame. |
| 3 | One hand-ported frame has a 6-pixel tail tip in the wrong place | `tail2` was hand-copied; 23 cells in the upper-right cluster are shifted one column left. The regression that existed was an *excerpt* snapshot of a *different* frame, so it never looked at those cells. | Checked-in per-frame sha256 manifest generated from the source art, exhaustive in CI, plus a scripted conversion. |
| 4 | CI job passes every check, then idles until the runner timeout | The animation planner re-arms a `setTimeout` on every tick; the chain is only cancelled by unmount. Test hosts mount the header and never unmount, so a ref-ed `Timeout` handle stays in the libuv loop and Node can never exit. | `timer.unref()` (one line); keep `clearTimeout` on unmount. |

Two of the four defects are *the same class*: state that is inherited from the previous cell
instead of being stated absolutely (SGR state in #1, frame width/coverage in #2). Section 5
turns that into a contract.

---

## 1. Phantom pixels — an unpinned background SGR bleeding into the empty half of a half-cell

### 1.1 What the renderer is supposed to do

The excerpt's own header (lines 1-4) states the encoding: a terminal cell holds two vertical
pixels, foreground = upper pixel, background = lower pixel, glyph `▀`. The consequence is
absolute: **a cell's appearance is a function of two channels, and both must be stated for
every cell.** A cell that sets only one channel does not paint a half block — it paints half a
block in the requested colour and the other half in *whatever colour the terminal is still
holding*.

### 1.2 Where the code states only one channel

Four branches, only one of which emits a complete cell (lines 22-34):

- both pixels opaque (22-24): `fg(up) + bg(lo)` — complete, correct;
- upper only (25-27): `fg(up)` — **background unstated**;
- lower only (28-30): `fg(lo)` — **background unstated**;
- fully transparent (31-33): `seq = ''` — no escape at all, so the space is also painted in
  the inherited fg *and* bg (it is only saved by the `RESET` that line 36 emits when the
  previous cell was coloured).

So the glyph is right and the colour of the missing half is whatever the last `bg()` on that
row happened to be. That is the phantom.

### 1.3 Which SGR state persists, and why the delta tracker cannot see it

The persisting state is the **background colour, SGR `48;2;r;g;b`**. Foreground is safe by
accident — every drawn glyph re-emits `fg()` first — but background is only ever emitted
together with a lower pixel, and no `SGR 49` (default background) is ever emitted when the
lower pixel is transparent. The value therefore survives across cells, across foreground
changes, and across palette transitions until the next both-opaque cell, or until the row's
closing `RESET` (line 42).

The emitter's state tracker cannot catch this: `current` (line 16) holds the **whole escape
string** and is compared for string equality (line 35). When the encoder moves from a
both-opaque cell (`fg(A) + bg(B)`) to an upper-only cell (`fg(A)`), the new seq *is different*,
so it is emitted — but it is a strictly **narrower** escape than the state it replaces. The
tracker conflates “the state changed” with “the state became less specific”, so it happily
downgrades a full state to a partial one and leaves the background at `B`. A tracker that
modelled fg and bg as two independent channels would have had to emit `SGR 49` here; a
string-equality tracker never will.

A second, quieter instance of the same idea: `current` is reset to `''` at the start of every
row (line 16) while the *terminal* is not reset — the two are only reconciled because every
row happens to end with `RESET` (line 42). That is an undocumented, load-bearing invariant;
it holds today and breaks the moment a row is composed, reordered, or trimmed by anyone else.

### 1.4 Which cells expose it — and why the symptom is a right-edge column

Every cell where exactly one of the two pixel rows is opaque:

- upper-only cells (`up` defined, `lo` transparent, glyph `▀`) — the phantom appears **below**
  the glyph, in the lower half;
- lower-only cells (`lo` defined, `up` transparent, glyph `▄`) — the phantom appears **above**
  the glyph, in the upper half;
- the last band of the sprite: 25 pixel rows pair into 13 terminal rows, and row 24 has
  `lower = ''` (line 14), so *every* cell of the bottom band is upper-only by construction.
  It stays clean only because row 23 ends with `RESET`; it is one leaked state away from
  smearing the full width of the sprite's bottom row.

Why a *column* at the right edge, and why *only* there: the right silhouette edge is exactly
where a two-pixel-tall band becomes one-pixel-tall, so the cell just inside the edge is
both-opaque and the cell at/after the edge is a half-cell. The half-cell inherits the
background from its **left** neighbour — i.e. the leak propagates rightwards, into the empty
column outside the shape. Left edges are half-cells too, but they inherit from blank cells to
their left, so the inherited value is the default and nothing is visible. That asymmetry is
exactly the reported shape of the bug, and it explains why the artefacts are “strictly
inside/at the edge of the sprite's cell area” and why nothing else on screen is affected.

The colour match follows the same logic: the phantom is painted in the **lower-pixel colour of
the last both-opaque cell on that row** — the body/outline shade just inside the edge — not in
the colour of the neighbour. That is why it reads as dim coloured noise rather than as a copy
of the sprite, and why a heart or a Z glyph next to the edge produces a smudge in the body
shade. The trace shows it directly: at cells 12-14 the foreground switches from the dark
outline to the heart red, yet the background stays `rgb(40,120,190)` (body blue) for all three
cells — the empty halves of the last two are painted in the colour of a cell that is nine
columns to the left.

```
cell  up lo  glyph  fg-at-write       bg-at-write       verdict
  11   D   B     ▀    rgb(26,28,38)     rgb(40,120,190)
  12   D   .     ▀    rgb(26,28,38)     rgb(40,120,190)   half-cell <== PHANTOM (empty lower half)
  13   H   .     ▀    rgb(220,50,70)    rgb(40,120,190)   half-cell <== PHANTOM (fg changed, bg did not)
  14   H   .     ▀    rgb(220,50,70)    rgb(40,120,190)   half-cell <== PHANTOM
  15   .   .     (sp) default           default           RESET finally emitted here
```

Note the last row of the trace: the `RESET` that would have prevented the leak is only emitted
**after** the phantom cells have already been painted. Resetting later cannot un-paint a cell.

### 1.5 The precise escape fix

Pin the background for every half-cell. SGR `49` is “default background”; if the sprite sits on
a themed canvas (panel fill, alternate screen background), use that fixed colour instead —
never an inherited one.

```ts
const DEFAULT_BG = '\x1b[49m'      // SGR 49: default background

if (up !== undefined && lo !== undefined) {
  seq = fg(up) + bg(lo);          ch = '▀'
} else if (up !== undefined) {
  seq = fg(up) + DEFAULT_BG;      ch = '▀'   // empty lower half is now explicitly default
} else if (lo !== undefined) {
  seq = fg(lo) + DEFAULT_BG;      ch = '▄'   // empty upper half is now explicitly default
} else {
  seq = DEFAULT_BG + '\x1b[39m';   ch = ' '   // or simply RESET
}
```

Three deliberate details:

1. the tracker must compare the two channels separately, not the concatenated string
   (`seqFg !== curFg || seqBg !== curBg`), otherwise the same downgrade is still expressible;
2. each row should begin with `RESET` (or with the explicit default pair) so the row does not
   depend on the previous row's trailing `RESET` surviving whatever the host does to the
   string;
3. a cheap belt-and-braces assertion: after generating a row, walk it with an ANSI state
   machine and fail if any glyph cell's `bg` came from inheritance rather than from that
   cell's own escape. That is a unit test, not a screenshot.

The invariant to write into the contract: **a cell's appearance must be a pure function of its
two pixels; no cell may inherit SGR state from a neighbour.**

---

## 2. Ghost frames — the renderer drops row width, the text pipeline drops the padding

### 2.1 What the renderer drops from each row

Line 41: `out.replace(/[ ]+$/, '')`. Every **trailing transparent cell is deleted**, not
replaced by a blank. It is deleted in the strong sense: the character is removed from the
string, so it occupies no column when the line is written, and the `RESET` appended afterwards
(line 42) occupies zero columns.

Consequences:

- a row's visible width collapses to `last opaque column + 1`;
- that width is **data-dependent and differs per frame**: a wide pose whose tail pixels reach
  column 39 emits 40 cells, the narrower pose emits 28;
- the trim only fires when a transparent run follows an emitted escape, so rows that end in a
  coloured cell keep full width while rows that end in background shrink — the row width
  flickers between frames as a function of the artwork, which is exactly what makes this hard
  to attribute to a trimming bug.

The mirror image of the same line: because transparent cells are removed rather than painted,
a frame can only ever *add* cells. Nothing in the renderer can ever *remove* a cell that an
earlier, wider frame put on screen.

### 2.2 What the text pipeline does to trailing whitespace

The row string is not written to the terminal verbatim. It goes through the framework's text
renderer, which lays out lines, diffs them against the previously written frame, and emits
only changed cells. That renderer **right-trims trailing whitespace on every line** before the
diff: trailing blank cells carry no layout information, and a full-width line would otherwise
trigger terminal autowrap on the last column.

Therefore:

- a trailing space is indistinguishable from an absent cell; padding a row with spaces to the
  full width does **not** paint those columns;
- a newline moves the cursor down and to column 0 — it does not erase the cells it passes;
- the only thing that changes a terminal cell is a written glyph (or an erase sequence).

### 2.3 Why the previous frame's tail survives

Frame N (wide) wrote glyphs into columns 28-39. Frame N+1 (narrow) produces a 28-cell row; the
diff sees 28 changed cells and writes them; columns 28-39 are not in the diff at all, so the
terminal leaves them exactly as they were — frame N's tail. The narrow frame does render
correctly; it simply never claims the columns where the old tail lives. Repeat this over an
oscillating animation and you get exactly the reported “pixels of the wide tail REMAIN at
their old positions”, alternating with the pose that overwrites them.

The residue is horizontal here only because every frame is a fixed 13 terminal rows. The same
mechanism applies vertically the moment a host renders a shorter block than the previous one:
the rows below the new block are never written, so they keep the old frame's content.

### 2.4 The two-part fix

**Part A — renderer: fixed canvas width, no trailing trim.**
Pad every row to the frame set's canvas width (the maximum over all frames in the set, not the
current frame's width), with the padding written in default colours. Rows become a constant
rectangle: the cursor always ends at the same column, borders and centring stop jittering, and
the erase point in Part B is predictable.

**Part B — emitter: erase the remainder explicitly.**
Because the pipeline strips trailing blanks, the erase must be an ANSI erase sequence, not
spaces. Append `ESC[K` (erase in line: cursor to end of line) to every row, or clear the sprite
region on every frame (`ESC[2K` per line across the union of old and new bounds, or clear and
redraw the frame box). `ESC[K` is not whitespace, so it survives the pipeline's trim; the
columns beyond the new frame's content are blanked rather than merely “not written”.

```ts
const CANVAS_W = Math.max(...allFrames.map(f => f.cols))   // union width, not per-frame

// cells = number of glyph cells emitted for this row
let row = out                                   // Part A: no trailing trim
if (cells < CANVAS_W) row += RESET + ' '.repeat(CANVAS_W - cells)
rows.push(row + '\x1b[K')                        // Part B: erase to end of line
```

### 2.5 Why both parts are needed

Measured with the reproduction script:

```
wide pose   visible cells: 40
narrow pose visible cells: 28  -> columns 28..39 never written, wide tail survives
naive pad with 12 spaces -> visible cells after pipeline trim: 28  (padding stripped)
narrow + ESC[K           -> ESC[K survives the trim: yes
```

Part A alone is defeated by the text pipeline (the padding is trimmed and the ghosts persist).
Part B alone removes the ghosts, but row widths stay data-dependent: cursor arithmetic,
centring, and any border drawn to the right of the sprite still jump between poses, and the
erase point moves with the artwork. A + B together give the guarantee the symptom asks for:
every frame covers the same rectangle, and every column it does not use is explicitly erased.

---

## 3. Frame data drift — a hand-port that no whole-frame check was watching

### 3.1 What the digest report says

Its scope is the right one: a sha256 per frame over that frame's 25 rows, compared against
the source art the sprite was ported from. Twenty-one of the twenty-two frames match
(`standard`, `blink`, `fin1-2`, `spout1-6`, `tail1`, `tail3-4`, `heart1-3`, `sleep1-5`); `tail2`
is the single `MISMATCH`, and the detail is decisive:

- 23 differing cells, all in the upper-right spout / tail-tip area;
- row 2: the ported `D` sits at column 26, the source has it at 27;
- row 3: an extra `D` at column 25, the `DBD` run at 26-28 shifted one column left, and an
  extra `DD` pair at columns 36-37;
- rows 4-6: the upper-right cluster shifted one column left throughout.

That profile — a whole cluster displaced by exactly one column, plus a couple of stray cells at
the seam — is the signature of a **manual transcription error**, not of a renderer or palette
bug: the person copying the frame lost a column at a cluster boundary and duplicated the
glyphs that fell across it. It is also exactly the “6-pixel cluster at the wrong position” in
the symptom log, and it is a *data* defect: the frame renders perfectly, it just renders the
wrong shape.

### 3.2 Why the existing per-excerpt regression missed it

Five independent reasons, and any one of them would have been enough:

1. **Coverage.** It was an *excerpt* — a rectangular sub-region — and it was written for a
   *different* frame. Assertions can only fail for cells inside the excerpt; `tail2`'s
   upper-right corner was outside it and `tail2` itself was not a case at all.
2. **Granularity.** A per-excerpt expectation is a partial oracle. It can distinguish “the
   part I look at is right” from “the part I look at is wrong”, but it cannot distinguish a
   correct frame from an incorrect one.
3. **Level.** It asserted *rendered output*. Rendering is a pure function of the frame data, so
   a coherently wrong frame renders flawlessly — the test proves the renderer, not the data.
   Worse, if such a golden is ever regenerated from the ported data, it blesses the error.
4. **Moment of introduction.** The drift entered through a manual step (hand-copied during
   conversion). No automated comparison existed at the point where the error was created, so
   nothing could have caught it early; the check has to exist at the boundary where data
   enters the repo.
5. **Signal size.** 23 cells out of 40 x 25, in one frame, is below the threshold of any coarse
   check — a low-fidelity screenshot comparison, a width or pixel-count sanity check, or a
   reviewer's eye.

### 3.3 The gate that prevents recurrence

A checked-in **frame digest manifest** plus a conversion gate:

```json
// frames/digests.json  (generated, committed, reviewed like source)
{ "standard": {"cols":40,"rows":25,"sha256":"…"},
  "tail2":    {"cols":40,"rows":25,"sha256":"…"} }
```

- **Generated from the source art, never from the ported frames.** The generator is the only
  writer of the manifest; it refuses to run unless each frame is exactly 40 x 25 and uses only
  palette characters, so a bad port cannot become its own oracle.
- **Exhaustive, both directions.** CI recomputes sha256 over the canonical serialization (rows
  joined with a single newline, no trailing newline) for every frame and fails on mismatch; and
  it fails if a frame file has no manifest entry *or* a manifest entry has no frame file. There
  is no such thing as an uncovered frame — which is precisely the property an excerpt cannot
  have.
- **Cell-level diagnosis.** On mismatch the test prints the differing cells per row (the same
  format as the digest report), so a one-column shift is immediately legible rather than “hash
  mismatch”.
- **Data and rendering are separate oracles.** The manifest pins the *data*; renderer tests pin
  the *transform*. They must not share a golden, or a consistent error passes both.
- **Changes are explicit.** Touching a frame requires regenerating its digest from the source
  art in the same commit, so any data diff is visible in review and a silent one-column drift
  becomes impossible.
- **No hand-typing.** Frames are emitted by the conversion script; the manual step that produced
  this bug is removed rather than documented.
- **Dimension/palette lint as a second net.** Uniform 25 x 40, `.` as the only transparent
  sentinel, unknown characters rejected rather than silently transparent (which is also the
  failure mode that would turn a typo into an invisible hole).

---

## 4. The hang — a finished job that could not exit

### 4.1 The mechanism

The animation planner drives frames with a **self-re-arming timer**: every tick schedules the
next one (`setTimeout(tick, frameMs)` inside `tick`). The chain has no natural end — it is a
looping animation — and its only cancellation path is the component's teardown
(`clearTimeout` in the unmount cleanup).

Every pending `setTimeout` is a libuv `Timeout` handle and, by default, a **ref-ed** one: while
it exists, Node's event loop has work to wait for, so the process will not exit. Once the last
assertion has passed and the suite has nothing left to do, the only thing keeping the process
alive is one armed timer — which is guaranteed to re-arm itself. Nothing is deadlocked and
nothing is “running”: the exit condition is simply unreachable. That is exactly the reported
process state: no running test, no pending assertion, live handles of kind `Timeout`, one per
tick, each re-arming the next, killed only by the runner timeout (3 minutes of work followed by
19 minutes of idle in the recorded observation).

### 4.2 Which hosts hang, and why

The **channel-ui** group's scene checks: they mount the header component, render and assert,
and then finish **without unmounting**. That was correct before the feature existed — a
component with no timers needs no teardown — so the missing `unmount()` was never a bug. The
same shape recurs in every non-interactive host: in-process scene/snapshot harnesses, static or
docs exporters, and one-shot CLI renderers all do “mount → render → let the process end”.
Anything that mounts the header now also mounts the planner and inherits the pinned loop.

So there are two independent contributors, and both must be addressed:

- the planner will re-arm forever for as long as its component is mounted (it has no reason to
  stop and no knowledge of whether anyone is watching);
- the hosts never unmount, so the only cancellation path is never taken.

### 4.3 Why the interactive terminal is unaffected

Its process is kept alive by the TTY/stdin handles anyway: with a terminal attached, the loop
already has a reason to stay alive, so an extra ref-ed timer changes nothing about process
lifetime. The user quits deliberately and teardown happens at exit. The defect is therefore
structural and CI-only — “the job that finished but stayed alive” — and it is invisible in the
product because the symptom (process does not exit) is masked by a legitimate keep-alive.

### 4.4 Why the default flip surfaced it, and not before

Flag off → the planner is never scheduled → no timers → the loop drains → the job exits after
~3 minutes, for the entire time the flag was off. Flag on → the planner starts on mount in
**every** host, so at least one chain is always armed. The regression was latent in the feature
itself; the flip merely moved the feature onto the default path of hosts that never unmount.
That is the general lesson for step 5: a default change is a code change to every host, and it
must be audited as one.

### 4.5 The one-line fix

```ts
const t = setTimeout(tick, frameMs); (t as unknown as { unref?: () => void }).unref?.()
```

`unref()` tells the loop “this handle alone must not keep me alive”. The animation still ticks
while anything else holds the process open (a TTY, a server, other work); it simply stops being
a reason to stay alive, so a finished job exits on its own. The `?.` guard keeps the same code
working where timers have no `unref` (browsers, fake-timer shims). Measured in the reproduction
script:

```
mounted, flag OFF        -> ref-ed Timeouts: 0
mounted, flag ON (as is)-> ref-ed Timeouts: 1 => loop pinned, job cannot exit
unmount() clears         -> ref-ed Timeouts: 0
mounted, flag ON + unref -> ref-ed Timeouts: 0 => animation still ticks, loop drains, exits
```

Companions (not the one-liner, but needed so the class cannot come back): keep `clearTimeout`
in the unmount cleanup; give the planner an injectable clock so test hosts can run it inert
(feature flag or driver injection, not a global); make the hosts unmount explicitly; and add a
post-suite liveness assertion (`--detectOpenHandles`, `why-is-node-running`, or
`process.getActiveResourcesInfo()`) with a watchdog timeout well below the runner's, so a
“passed then idled” job fails in seconds with a diagnosis instead of burning the slot.

---

## 5. Prevention

### 5.1 The renderer contract a terminal sprite implementation should ship with

Each item is written so it can be *tested*, not just agreed to.

1. **Fixed canvas.** Every frame in a set declares the same `cols x rows`; every emitted row is
   exactly `cols` cells. Test: all rows of all frames have equal visible width.
2. **Both channels pinned.** Every cell emits foreground *and* background — the pixel colours or
   the explicit defaults (`SGR 39` / `SGR 49`, or the canvas colour). No half-block glyph may
   rely on inherited background. Test: walk the escape stream; every glyph cell must have
   received an explicit background since the last reset.
3. **Self-contained rows.** A row starts from a known SGR state (leading `RESET` or explicit
   defaults) and ends with `RESET`. No state may leak between rows, frames, or into another
   component's output.
4. **Absolute frames.** Rendering a frame is a complete description of its rectangle, never a
   patch of the previous frame. Independence means frame N+1 can be drawn after *any* frame.
5. **Trailing blanks are not addressable.** Nothing meaningful is encoded in trailing spaces;
   the text pipeline trims them. Erasure is always an ANSI erase (`ESC[K`, `ESC[2K`), never
   spaces.
6. **Height pairing is explicit.** Odd pixel-row counts pair with an empty lower row; the final
   band is upper-only by construction and must still pin its background.
7. **Data identity.** Per-frame sha256 over the canonical rows, committed, generated from the
   source art, verified in CI, exhaustive in both directions; no hand-typed frames; dimension
   and palette lint alongside.
8. **Determinism.** No timestamps or randomness in frame data; the animation index comes from an
   injected clock, so tests can freeze it or switch it off.
9. **Bounded lifecycle.** Every timer the renderer or planner creates is cancelled on teardown
   **and** unref-ed; animation is opt-in and inert without a driver.
10. **Bounded output.** A hard cap on escape sequences per row and per frame (e.g. “no more than
    one fg + one bg transition per cell, no redundant repeats”). A regression in state tracking
    then shows up as a byte-count failure instead of a visual one.

### 5.2 The audit to run BEFORE flipping an animation feature default-on

Run in this order; each step has a pass criterion, and a default flip is blocked until all pass.

1. **Inventory every mount site.** Product TUI, CI scene checks, snapshot/exporter harnesses,
   docs/gallery, benchmarks. For each: does it unmount? what else keeps its process alive? The
   list *is* the blast radius of the default change.
2. **Prove liveness per host.** Run each host with open-handle detection and assert zero timers
   after the last assertion. Wrap the job in a child process with a timeout shorter than the
   runner's, so a hang is a fast, attributed failure.
3. **Freeze the clock.** Run the suite with fake timers or `animation: false` / injected driver
   and assert the planner is inert — no timers scheduled at all — unless a driver is supplied.
4. **Render the extremes.** Widest pose, narrowest pose, and every transition between them; diff
   the **union** of both frames' bounds plus a one-column margin on each edge. The phantom/ghost
   class is precisely an edge-column defect, so a diff scoped to the new frame's bounds cannot
   see it.
5. **Check terminal state.** Every frame's escape stream starts from defaults and ends at
   defaults; no glyph cell carries an inherited background (contract items 2-3).
6. **Run the data gate.** Digest suite and conversion script: every frame listed, every entry
   backed by a frame, no mismatch.
7. **Run the flag matrix.** CI legs for flag-on *and* flag-off, plus a leg that changes the
   default — because the default is the thing being changed.
8. **Time-box and watch.** Record baseline wall-clock per job; treat “passes, then idles” as a
   failure, and make exit code *and* duration part of the pass criterion. Alert on any job over
   ~1.5x baseline or with no progress for 60 s.
9. **Stage the rollout.** Default-on behind an environment kill switch for one release; canary a
   single host; require sign-off from the owners of every mount site from step 1; keep the flag
   reversible without a release.

---

## Appendix A · Evidence map and line references

| Claim | Evidence |
|---|---|
| Half-block protocol, fg=upper, bg=lower | `renderer-excerpt.ts:1-4` |
| Only the both-opaque branch pins both channels | `renderer-excerpt.ts:22-24` vs `25-30` |
| Tracker compares whole escape strings | `renderer-excerpt.ts:16, 35-38` |
| Trailing transparent cells deleted | `renderer-excerpt.ts:41` |
| `RESET` only at row end (after the phantom is painted) | `renderer-excerpt.ts:42` |
| 25 pixel rows → 13 terminal rows; odd final row is upper-only | `renderer-excerpt.ts:12-14`; `symptom-log.txt` header |
| Phantom columns sit right of outline / Z / heart, not in frame data | `symptom-log.txt` item 1 |
| Wide-pose tail survives narrow switch | `symptom-log.txt` item 2 |
| `tail2` 23-cell, one-column drift; hand-ported; excerpt regression elsewhere | `frames-digest-report.txt` |
| `Timeout` handles, re-arming, hosts that never unmount, TTY unaffected | `ci-hang-evidence.txt` |
| 3 min baseline vs 19 min idle, timed with the default flip | `ci-hang-evidence.txt` timeline |

## Appendix B · Reproduction

`repro-halfblock.mjs` is a self-contained Node script: it ports `renderSpriteRows` verbatim
(only the frame data is synthetic), walks the emitted string with an ANSI state machine, and
prints (A) the inherited background of half-filled cells, (B) the wide→narrow width collapse
and the fate of padding vs `ESC[K` under a trailing-whitespace trim, (C) the ref-ed vs
unref-ed `Timeout` counts that decide whether the process can exit. Output is captured in
`halfblock-trace.txt`. Nothing in `fixture/` is read by the script; the fixture was not
modified.