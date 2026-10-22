# S18 - The Terminal Sprite Render Trap - Analysis Report

**Scope:** read-only analysis of the evidence pack in `/app/fixture/` (renderer excerpt, symptom log,
frame digest report, CI hang evidence). Nothing in the fixture was modified: SHA-256 digests of all
five fixture files were verified against `fixture-seal.pre.json` before the analysis and re-verified
afterwards (all OK).

**Fixture files used**

- `fixture/renderer-excerpt.ts` - the half-block sprite renderer exactly as it shipped
- `fixture/symptom-log.txt` - the three user-visible symptoms
- `fixture/frames-digest-report.txt` - per-frame digest comparison against the source art
- `fixture/ci-hang-evidence.txt` - the 'finished but hanging' CI job

---

## 0. Summary of the five findings

| # | Symptom | Root cause | Fix |
|---|---------|-----------|-----|
| 1 | Phantom pixels hugging the right edges | Background colour (SGR 48) is set only on *full* cells and never reset on *half* cells, so the empty half of a half-block inherits a stale background | Emit an explicit default-background escape (ESC[49m) on every half-filled cell, or set an explicit background for every cell |
| 2 | Ghost pixels survive a frame switch | The renderer trims trailing whitespace off each row and nothing erases the rest of the line, so columns the new narrower frame no longer covers keep the previous frame's glyphs | (a) Write a fixed-width row every frame (pad with explicit-default-background blanks); (b) erase the line (ESC[2K / ESC[K) and anchor the cursor before drawing |
| 3 | One drifted frame (`tail2`) | The hand-port shifted a cluster 1 column left (23 differing cells); the only regression was an *excerpt* test for a *different* frame | Golden SHA-256 digests for ALL frames, asserted in CI, with a manifest-completeness check |
| 4 | CI job hangs after the flip | The animation planner re-arms a setTimeout per tick for as long as its component stays mounted; the CI scene hosts mount the header component and never unmount it, so a pending Timeout pins the event loop | `setTimeout(...).unref()` (plus clear-on-unmount as hygiene) |
| 5 | Prevention | - | Renderer contract checklist + pre-default-on rollout audit (section 5) |

---

## 1. Phantom pixels - stale background colour in the empty half of a half-filled cell

### 1.1 The mechanism, read off the renderer

`renderSpriteRows` packs two vertical pixels per cell: **foreground = upper pixel, background = lower
pixel**. For each cell it computes one of four SGR sequences and one glyph:

| upper pixel | lower pixel | `seq` emitted | glyph | cell kind |
|---|---|---|---|---|
| set | set | `fg(up) + bg(lo)` | U+2580 (upper half block) | full - both halves painted |
| set | transparent (`.`) | `fg(up)` **only** | U+2580 | half - **lower half empty** |
| transparent | set | `fg(lo)` **only** | U+2584 (lower half block) | half - **upper half empty** |
| transparent | transparent | `RESET` (ESC[0m) | space | empty (safe) |

In a terminal, the **empty half of a half-block glyph is painted with the current background colour**.
So the correctness of a half-filled cell depends entirely on what background colour is in effect when the
glyph is written. Now look at what the renderer does about that background:

- It sets the background **only** in the full-cell branch (`bg(lo)`).
- In the two half-cell branches it emits **only a foreground colour** - no `bg`, no `ESC[49m`.
- Therefore the background colour from the **previous cell** is still in effect when the half-block is
  written, and the empty half of that glyph is filled with it.

**The SGR state that persists across cells is the BACKGROUND colour** (SGR `48;2;r;g;b`). Foreground never
leaks: every non-empty branch sets `fg(...)` explicitly, and the fully transparent branch emits a full
`ESC[0m`. Only the background is left stale - which is exactly why the artifact is a *background-coloured*
phantom rather than a wrong foreground.

A second-order amplifier is the renderer's change detection (`if (seq !== current) ...`): a sequence is
emitted only when it *changes*. So the stale background is not merely left in place - it is deliberately
*kept* as the 'current' state, and the following half cells inherit it with no escape emitted at all.

### 1.2 Which cells expose it

Only cells where a **run of full cells is immediately followed by a half cell** within the same row. The
first half cell of a row is safe (the background is still the default from the preceding `ESC[0m]`), but
every half cell that follows a full cell inherits that full cell's background.

Concretely, the exposed cells are exactly the sprite's **tapering right edges**, where the last column
has only one of the two vertical pixels present:

- the **dark outline** column: upper pixel = outline colour, lower pixel transparent -> U+2580 whose
  *lower* half is painted with the previous cell's background;
- the **sleep-Z symbols** and the **heart glyph**: the same shape - a single-pixel column at the end of a
  previously full-bodied run;
- the tail tips, for the same reason.

This matches symptom 1 exactly: a **1-cell-wide column of dim coloured noise directly to the right of the
outline / Z / heart**, moving with the animation and not present in any frame's data (the frame rows end
in `.` at those columns). The 'dim' tone is simply the background colour of the cell to the left (body or
outline colour), and it is wrong because the underlying pixel is *transparent* and must show the
terminal's / theme's background.

I reproduced this with a faithful replica of the shipped renderer plus a small SGR-interpreting screen
buffer: a row that ends with bg-set cells followed by a half cell yields a half cell whose background is
still the previous cell's background - i.e. a coloured block in the empty half. Adding ESC[49m to the
half-cell branches makes that last cell's background the default while the full cells keep their
intended background.

### 1.3 The precise escape fix

The empty half must be told explicitly to use the *default/transparent* background, because a half-block's
empty half cannot 'inherit the right colour' by accident.

**Minimal, precise fix - reset the background on half-filled cells:**

```ts
} else if (up !== undefined) {
  seq = fg(up) + DEFAULT_BG   // DEFAULT_BG = '\x1b[49m' (default background)
  ch = '\u2580'               // upper half block; lower half now = default background
} else if (lo !== undefined) {
  seq = fg(lo) + DEFAULT_BG
  ch = '\u2584'               // lower half block; upper half now = default background
}
```

**Equivalent, arguably cleaner - always set an explicit background for every cell**, treating a
transparent pixel as the default background:

```ts
const bgOf = (c: Rgb | undefined) => (c === undefined ? DEFAULT_BG : bg(c))
seq = fg(up) + bgOf(lo)        // full cell
seq = fg(up) + bgOf(undefined) // === fg(up) + '\x1b[49m'
```

Both produce a cell whose empty half is guaranteed to be the terminal default rather than a neighbour's
colour.

**Caveat that must be respected (part of the contract):** `ESC[49m` means 'the terminal's *default*
background'. If the app draws the sprite on a **themed background** (a coloured panel), the correct
'transparent' escape is that theme's background colour (`ESC[48;2;r;g;bm`), not `ESC[49m`. The fix must
therefore be a single named constant (`DEFAULT_BG`) chosen per rendering context - the *bug* is the
absence of an explicit background for the empty half, not the particular escape chosen. Note also that the
trailing `ESC[0m` is too late: the phantom is already painted by the time the row ends.

---

## 2. Ghost frames - why the previous frame survives a switch to a narrower frame

### 2.1 What the renderer drops from each row

At the end of every row the renderer does:

```ts
let row = out.replace(/[ ]+$/, '')
if (!row.endsWith(RESET)) row += RESET
```

The trailing transparent cells of a row are emitted as plain **space characters** (the `else` branch:
`seq = ''`, `ch = ' '`), and the final `replace(/[ ]+$/, '')` **deletes that run of trailing spaces**.
Because the transparent branch emits `RESET` before the spaces, the trimmed row still ends with `ESC[0m`,
so the reset is preserved - but the **cell count of the emitted row is now shorter than the sprite width**.
The row covers only the columns up to the last non-transparent pixel.

(The trim is a plain-space regex, so it never removes the escapes themselves; the surviving tail is
`...ESC[0m`. That is correct hygiene for the *reset* but wrong for the *geometry*.)

### 2.2 What the text pipeline does to trailing whitespace

Trailing whitespace is exactly the mechanism a renderer relies on to *overwrite* cells that the current
frame no longer draws - but here it is **trimmed before it is ever written**. Nothing is emitted for those
columns, so the cells keep whatever the **previous frame** put there.

Two independent facts combine:

1. **No overwrite:** the narrow frame writes only its own (shorter) span of columns. The surplus columns to
   the right are not written at all.
2. **No erase:** nothing in the row or in the frame protocol clears the remainder of the line (no
   `ESC[2K` / `ESC[K`, no 'erase to end of line', no explicit blank cells). The old glyphs - and their old
   colours - are still on screen.

The result is symptom 2: when the animation switches from a **wide** pose (tail swung out, rows reaching
further right) back to a **narrower** pose, the wide tail's pixels remain at their old positions, while the
narrow frame itself renders correctly. The artifacts are strictly inside / at the edge of the sprite's cell
area - because that is the only region the renderer ever touches.

The simulation separates the two failure modes cleanly: trimming **without** erase leaves the old glyphs
(the ghost); erase **without** a fixed footprint blanks the surplus columns but still leaves the row's
extent dependent on how many characters were emitted (layout jitter on frame switches).

### 2.3 The two-part fix that guarantees a clean frame switch

**Part 1 - every frame writes the full declared width (no silent narrowing).**

Do not drop the trailing transparent cells. Emit them as *real blank cells* with an explicit default
background so they overwrite whatever was there, and pad every row to the declared frame width (40 columns
for this sprite) so the footprint never changes between frames:

```ts
// transparent cell => RESET + ' ' (or DEFAULT_BG + ' '), emitted like any other cell
for (let x = 0; x < upper.length; x++) { ... }   // never trimmed
// then: pad the row to the declared frame width with DEFAULT_BG + ' '
```

**Part 2 - erase the row before (or after) drawing it.**

```ts
const CSI = '\x1b['
row = CSI + '2K' + row            // erase entire line, then draw
// or: draw the row, then append CSI + 'K'   // erase from cursor to end of line
```

and reposition the cursor to the row's left edge first (`ESC[<row>;1H`, or `\r` + `ESC[<n>C`) so each
row always starts at the same column regardless of how many characters the previous row emitted.

Together: **Part 1** guarantees that every column of the sprite area is *overwritten* on every frame;
**Part 2** guarantees that any column not covered by the frame is *erased*. Either alone leaves a hole
(the ghost, or a layout jump); together they make a frame switch clean by construction - including the
wide -> narrow -> wide transitions where the surplus columns change size from frame to frame.

The `ESC[0m` that ends every row is still required (no colour/attribute leak into the next row or into the
surrounding UI), but it is *not* a substitute for Part 1/2: it restores state, it does not clear pixels.

---

## 3. Frame data drift - the hand-ported `tail2` frame

### 3.1 What the digest report says

The report is a **per-frame SHA-256 digest of each frame's 25 rows**, compared against the source-art
frames the sprite was ported from. Every frame matches except one:

- `standard OK | blink OK | fin1 OK | fin2 OK | spout1-6 OK | tail1 OK | **tail2 MISMATCH** | tail3 OK |
  tail4 OK | heart1-3 OK | sleep1-5 OK`

The `tail2` detail shows the nature of the drift - a **1-column left shift of the upper-right cluster**:

- row 2: ported `D` at col 26, source `D` at col 27 (1 col left);
- row 3: ported extra `D` at col 25; `DBD` at cols 26-28 shifted left by 1; extra `DD` at cols 36-37;
- rows 4-6: the upper-right cluster is shifted 1 column left throughout;
- **total: 23 differing cells, all in the upper-right spout/tail-tip area.**

This is exactly symptom 3 ('a 6-pixel cluster drawn at the wrong position'): the port was **hand-copied**
during conversion and, in the upper-right spout/tail-tip area, the copy went in one column to the left.
Because the shift is local and the row count and overall silhouette are unchanged, it is invisible to
casual review and to any check that only counts rows or samples a region.

### 3.2 Why the existing per-excerpt regression missed it

The report states the reason directly: the ported `tail2` was hand-copied during conversion, and an
**excerpt-based regression (added later for a different frame) did not cover it**. Two independent gaps:

1. **Wrong subject.** The regression was *per-excerpt* and was added **for a different frame**; it never
   covered `tail2` at all. A test that pins one frame says nothing about the others.
2. **Wrong oracle.** Even had the excerpt touched `tail2`, an *excerpt* comparison only asserts the cells
   inside the excerpt bounds. A shift that moves a cluster out of the excerpt window, or that leaves the
   excerpt's cells looking plausible, is not detected. Excerpt tests are structurally blind to *whole-row
   geometry* errors - exactly the class of error a column shift produces - because they never assert the
   **row width, the column index of a feature, or the whole-row digest**.

A frame-level SHA-256 digest has the opposite property: it is sensitive to *any* cell change, including a
one-cell column shift, because the hash covers the entire 25 x 40 frame.

### 3.3 The gate that prevents recurrence

**A golden full-frame digest manifest, asserted in CI, covering every frame - not excerpts.**

1. For each frame, compute SHA-256 over its **25 rows** (the same normalisation the report uses) and store
   it in a committed manifest (e.g. `frames.sha256`) keyed by frame name, next to the frame set.
2. In CI, recompute the digest for **every** frame in the registry and fail on mismatch, printing the
   per-cell diff (row/column, expected vs actual) so a shift is diagnosable without manual art comparison.
3. **Manifest completeness is part of the gate:** a frame that is not in the manifest is a test failure, so a
   newly added or hand-ported frame cannot escape coverage. This is exactly what the excerpt test failed to do.
4. **Re-baselining is explicit and reviewed:** updating a digest must be a deliberate, visible change to the
   manifest (with the art diff attached), never a silent regeneration. A drift that is 'accepted' becomes a
   reviewed decision rather than an accident.
5. Complement it with a **screen-buffer golden test** for the renderer: render each frame into a simulated
   terminal and compare the cell grid. That catches renderer bugs (stale background, ghosts) *and* data
   drift (shifted clusters) in one pass, at the level the user actually sees.

---

## 4. The CI hang - a timer-pinned event loop behind a 'finished but hanging' job

### 4.1 What the evidence says

- The job `channel-ui` shows **PASS for all scene checks**, then the process **sits idle** and never exits;
  it is eventually killed at the runner timeout. The same job had always finished in ~3 minutes; one local
  observation recorded **19 minutes of idle** before a manual kill.
- **Process state at kill:** no running test, no pending assertion. The event loop has **live handles of kind
  `Timeout`** - one per tick of the sprite animation planner - **each re-arming the next**.
- The planner **reschedules a `setTimeout` for as long as its component stays mounted**, and these
  particular hosts mount the header component and finish **WITHOUT unmounting it**.
- The **interactive terminal product is unaffected**: its process is kept alive by the TTY/stdin handles
  *regardless of* the timer chain.
- The hang first appeared in the same push that **flipped the animation feature's default from off to on**.

### 4.2 The mechanism

This is the classic 'the work is done but the process refuses to exit' failure. It is **not** a test failure,
a deadlock, or a pending assertion:

1. The animation planner is a self-rescheduling timer: each tick schedules the next tick
   (`setTimeout(planNextTick, delay)`) - one live `Timeout` handle per tick.
2. The planner's lifetime is bound to **component mount state**, not to the test's lifetime. As long as the
   component is 'mounted', it keeps re-arming.
3. The CI scene-check hosts **mount the header component** (which hosts the sprite/animation) and, when the
   scene checks are done, **finish without unmounting it**. The planner therefore never stops re-arming.
4. Node's event loop stays alive as long as at least one handle is referenced and pending. A pending
   `Timeout` **counts**: it keeps the loop alive even though it does nothing useful. The process never
   reaches the 'no more work -> exit' state, so the test runner never exits, and the job sits idle until
   the runner's timeout kills it.

**Why the flip triggered it:** with the feature default-off the CI hosts never started the planner, so there
was no timer, so the event loop drained and the process exited. Turning the animation on by default started
the planner in a host that never unmounts, so the timer chain outlived the job's actual work. The timing
correlation in the evidence ('the same push that flipped the default') is therefore causal, not coincidental.

**Why the interactive terminal product is unaffected:** it is a long-lived, interactive process whose stdin
is a TTY - the event loop is *already* pinned by the stdin/TTY handles, so it is supposed to stay alive.
An extra timer handle changes nothing observable there: the product keeps running until the user quits. The
defect is only visible where the process is expected to **exit on its own** (CI, tests, one-shot commands),
which is exactly where the CI hosts are. This asymmetry is why the bug survived: the product 'looks fine',
and only the non-interactive host exposes it.

### 4.3 The one-line fix

**Unref the planner's timer so it can never pin the event loop:**

```js
const t = setTimeout(planNextTick, delay)
t.unref()          // <- the one-line fix
```

An unref'd timer still fires while the loop is alive for other reasons, but it does **not** keep the loop
alive by itself. With the timer unref'd, the CI host's event loop drains as soon as the scene checks
finish and the process exits normally - even though the component was never unmounted. This is why
`unref()` and not 'unmount properly' is *the* one-line fix: the affected hosts never unmount, so a
cleanup-only fix would leave the CI hang in place.

**Complementary hygiene (should ship alongside, but is not the one-liner):**

- `clearTimeout(t)` in the component's unmount/cleanup, plus a `stopped` flag so a tick already in flight
  cannot re-arm (the classic 'rescheduled after unmount' race);
- register `return () => { clearTimeout(t); stopped = true }` as the teardown on mount;
- guard the re-arm: `if (!stopped) t = setTimeout(planNextTick, delay)`.

---

## 5. Prevention

### 5.1 Renderer contract checklist a terminal sprite implementation should ship with

**SGR / colour state**

1. **Every cell emits a complete SGR state.** Foreground *and* background are set explicitly for every
   cell. A cell that must show through is written with an explicit default background (`ESC[49m`, or the
   app's themed background) - never left to inherit the previous cell's state.
2. **Half-block cells never inherit a background.** The empty half of U+2580 / U+2584 is the transparent
   region and must be explicitly backgrounded. This is the single biggest source of phantom pixels.
3. **Rows end with a full reset** (`ESC[0m`) so no colour or attribute leaks into the next row or into the
   surrounding UI; prefer targeted resets (`39` / `49`) where clobbering unrelated attributes (bold,
   underline, dim) matters.
4. **'Transparent' is an explicit palette value**, not an `undefined` that silently means 'keep the previous
   colour'.

**Geometry / erase semantics**

5. **Fixed footprint.** Every frame renders to the same declared width and height; a renderer that emits
   fewer cells than declared is a bug and must fail loudly (assert `cells === width`).
6. **No silent trimming of the sprite area.** Trailing transparent cells are written as real blank cells (or
   the row is padded to the declared width) so every frame overwrites the same columns.
7. **Explicit erase + cursor anchoring.** Each row is erased (`ESC[2K` or `ESC[K`) and the cursor is
   repositioned to the row's left edge before writing, so a narrower frame cannot inherit the previous
   frame's pixels.

**Data**

8. **Golden digests for every frame** (SHA-256 of the full frame) with a completeness check that every
   registered frame is in the manifest, plus a screen-buffer golden render per frame.

**Tests**

9. **Screen-buffer tests, not string comparisons.** Simulate a terminal (track fg/bg per cell) and assert:
   no cell carries a background it should not have; every row covers exactly W cells; after rendering
   frame A then a narrower frame B, no cell contains A's leftover glyphs.
10. **Leak test:** after unmount/teardown, assert that no live handles remain (Node: active-handle /
    `why-is-node-running` inspection) and that the process exits within a bounded time.

### 5.2 The audit to run BEFORE flipping an animation feature default-on

**A. Renderer correctness (dry-run the contract above against the shipped code)**

- Does every branch of the cell encoder set an explicit background? (Expect: **no** - this is the phantom bug.)
- Does any row get trimmed or shortened? (Expect: **yes** - this is the ghost bug.)
- Is each row erased and cursor-anchored before drawing? (Expect: **no**.)
- Is the 'transparent' palette entry explicit?

**B. Frame-data integrity**

- Regenerate digests for **all** frames and confirm the manifest is complete (no frame outside it).
- Investigate every mismatch as a *data* bug first (`tail2`: 23 cells, 1-column left shift in the
  upper-right spout/tail-tip area). Only re-baseline deliberately, with the art diff attached and reviewed.
- Confirm the regression suite covers *whole frames*, not excerpts; add the missing coverage before the flip.

**C. Lifecycle / teardown**

- Every component that starts a timer or an animation loop must (i) unref its timer, (ii) clear it on
  unmount, and (iii) guard the re-arm against a late tick.
- Enumerate the hosts that mount the component **without unmounting** (the `channel-ui` scene hosts mount
  the header component) and make sure the timer cannot pin their event loop even then.
- Add an explicit **'the process exits'** assertion / bounded-time check to the affected CI group - scene
  checks passing is not the same as the job exiting.

**D. CI hardening and canary**

- Set a **tight job timeout** (far below the runner's kill timeout) so a hang fails fast and loudly with a
  stack/handle dump, instead of idling for 19 minutes.
- Dump active handles on timeout (Node: `process._getActiveHandles()` / `why-is-node-running` / `--trace-exit`).
- Run the group with the feature **on** in a canary job **before** flipping the default for everyone, and
  compare wall-clock against the pre-flip baseline (~3 minutes).
- Verify **both** flag states (off and on) exit cleanly on every affected host.

**E. Rollout**

- Ship the flag default-off with the timer unref'd from day one; a feature must never be able to pin a CI
  event loop.
- Flip default-on only after A-D pass; keep the flag (and the ability to turn the animation off) as the
  rollback lever; watch wall-clock and idle time in the canary, not just pass/fail.

---

## Appendix - evidence to conclusion map

| Evidence | Conclusion drawn |
|---|---|
| Renderer: `seq = fg(up)` / `fg(lo)` branches carry no background | Stale background paints the empty half of half-blocks -> phantom pixels (section 1) |
| Renderer: `out.replace(/[ ]+$/, '')` | Rows shrink to the last non-transparent pixel; the pipeline never writes the surplus columns -> ghost pixels (section 2) |
| Renderer: no erase / no cursor anchoring in the emitted rows | The previous frame's cells are never cleared -> the same ghost (section 2) |
| Symptom log 1 (1-cell coloured column right of outline / Z / heart, moves with the animation) | Boundary cells where a full run is followed by a half cell (section 1.2) |
| Symptom log 2 (wide -> narrow leaves the old tail) | Frame-switch geometry plus no erase (section 2) |
| Digest report: only `tail2` MISMATCH, 23 cells, 1-column left shift | Hand-port drift in the upper-right spout/tail-tip area (section 3.1) |
| Digest report: 'excerpt-based regression ... for a different frame' | Coverage gap plus oracle gap; excerpt tests cannot see column shifts (section 3.2) |
| CI evidence: live `Timeout` handles, one per planner tick, each re-arming | A pending Timeout pins the event loop -> the process never exits (section 4.2) |
| CI evidence: hosts 'mount the header component and finish WITHOUT unmounting' | The planner's mount-scoped lifetime outlives the job -> the flip exposed it (section 4.2) |
| CI evidence: 'interactive terminal ... unaffected', kept alive by TTY/stdin | The defect only shows where the process must exit on its own (section 4.2) |
| CI evidence: hang appeared in the same push as the default flip | Causal link: default-on started the planner in hosts that never unmount (section 4.2) |

*Fixture integrity: all five fixture files' SHA-256 digests match `fixture-seal.pre.json`; nothing under
`fixture/` was modified. The fixture contains no reference/answer documents, so this report cites only the
four evidence files listed above.*
