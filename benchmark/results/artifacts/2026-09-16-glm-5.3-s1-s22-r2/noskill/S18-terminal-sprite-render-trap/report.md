# S18 · The Terminal Sprite Render Trap — Analysis Report

Scope: read-only analysis of the evidence pack under
`E:\deepseek-harness\dsh-plugin-upgrade-skill\benchmark\tasks\S18-terminal-sprite-render-trap\environment\fixture`
(`renderer-excerpt.ts`, `symptom-log.txt`, `frames-digest-report.txt`, `ci-hang-evidence.txt`).
The fixture was not modified.

---

## 1. Phantom pixels at the sprite's right edges (SGR state persistence)

### Mechanism

The renderer packs two vertical pixels per terminal cell: foreground color = upper pixel,
background color = lower pixel. For **half-filled** cells it emits only *half* the SGR state:

- upper pixel set, lower transparent → `seq = fg(up)`, glyph `▀` — **the background SGR
  parameter is never set or reset for this cell**;
- lower pixel set, upper transparent → `seq = fg(lo)`, glyph `▄` — again only the
  foreground parameter is touched, and the glyph fills only the *lower* half.

ANSI SGR parameters are **persistent modal state**: whatever `48;2;r;g;b` (background) a
*previous* cell emitted stays active until something else changes or resets it. So in a
half-filled cell, the **empty half of the glyph** is painted by whatever background color is
still active from earlier in the scan:

- a `▀` cell shows its blank lower half in the stale background color;
- a `▄` cell shows its blank upper half in the stale background color.

The `current` string-tracking optimization makes it worse only in appearance, not in kind:
it merely avoids re-emitting an identical sequence; it never *clears* the half of the SGR
pair a cell does not use.

### Which cells expose it

Exactly the half-filled cells on color/transparent boundaries — and the sprite's right
edges are full of them: the symptom log notes the frame rows **end in `.` (transparent)
at those columns**, i.e. outline cells, sleep-Z cells, and heart cells sit directly next to
transparent pixels, so their boundary columns are half-filled (upper colored/lower `.`, or
the reverse). Each such cell leaks the previous cell's background into its empty half,
producing the observed 1-cell-wide column of dim colored noise that "appears and moves
with the animation" (each frame has different boundary columns, so the noise moves). The
artifacts are not in any frame's data — they are synthesized by the terminal from stale
SGR state.

### Precise escape fix

Every emitted cell must specify **both** SGR halves explicitly; never rely on inherited
state. For transparent halves, set the default for that parameter instead of omitting it:

- full cell:  `\x1b[38;2;Ur;Ug;Ub;48;2;Lr;Lg;Lbm\x1b[0m▀` (or the two separate sequences as now)
- upper only: `fg(up)` **+ `\x1b[49m`** (default background) → `▀`
- lower only: `\x1b[39m` (default foreground) + `bg(lo)` → `▄` (or keep `fg(lo)` with `▄`
  and additionally reset the *previous* background with `\x1b[49m`, since `▄`'s blank upper
  half renders in the background)
- both transparent: `\x1b[39;49m` + ` ` (or plain RESET + space)

Equivalently, always emit `fg(x) + bg(y)` where a transparent pixel maps to the default
value (`39`/`49`), so no cell can inherit the neighbor's color. The trailing `RESET` the
renderer already appends per row only protects the *next* row's start, not the empty halves
inside the current row.

---

## 2. Ghost frames after switching wide → narrow

### What the renderer drops from each row

`let row = out.replace(/[ ]+$/, '')` — the renderer **trims trailing blank cells** from
every rendered row. Transparent tail pixels are emitted as plain spaces (with `seq = ''`,
i.e. reset state), and then the regex deletes them, so a narrow frame's rows are written
**shorter** than a wide frame's rows.

### What the text pipeline does

Terminals do not store trailing whitespace: a line's cells beyond the last non-blank
written character are erased/never committed. Consequently, even if the renderer *had*
padded the narrow row with trailing spaces to the sprite width, the pipeline would drop
them and the old wide-frame tail pixels in the surplus columns would still never be
overwritten. When the animation switches from a wide pose (tail swung out, rows reaching
further right) to a narrower pose, the surplus columns keep showing the previous frame's
tail — exactly symptom 2.

### Two-part fix that guarantees a clean frame switch

1. **Erase, don't rely on padding**: after writing each row's last content cell, emit
   `\x1b[K` (EL — erase to end of line), which *does* commit an erase of everything to the
   right regardless of whitespace-trimming semantics. (Alternative equivalent: always
   write the full bounding-width row and terminate with a non-blank sentinel followed by
   the erase.)
2. **Render to a fixed bounding box, not per-frame width**: compute the maximum width
   across all frames in the animation and write every frame into that constant cell
   region (transparent cells written as fully-attributed blank cells per the fix in §1,
   then `\x1b[K`), or track the previously painted region and explicitly clear any cells
   the new frame no longer covers before/while drawing it. Combined with (1) this makes a
   frame switch idempotent: every cell of the animation region is either rewritten or
   erased on every frame, so no pixel of a previous frame can survive.

---

## 3. Frame data drift (tail2)

### What the digest report says

Of all frames, only **tail2** mismatches its source art: 23 differing cells concentrated in
the upper-right spout/tail-tip area — a 1-column left shift of the upper-right cluster
(e.g. row 2 ported `D` at col 26 vs source col 27; row 3 has an extra `D` at col 25, the
`DBD` run shifted left 1, plus extra `DD` at cols 36–37; rows 4–6 shifted throughout).
tail2 was **hand-copied** during conversion — classic manual-porting drift.

### Why the existing regression missed it

The regression added for the frames was **excerpt-based and frame-specific**: it pinned an
excerpt of a *different* frame, so tail2 had no coverage at all. An excerpt assertion can
only vouch for the substring it pins; nothing compared each ported frame against the
source-art frames wholesale.

### Gate that prevents recurrence

A **golden full-frame digest gate**: sha256 (or any stable hash) of each frame's complete
25-row content, computed for the source-art frames once and stored as fixtures, then
recomputed for the ported frames in CI. Any single-cell drift (like tail2's 23-cell shift)
fails the gate. Key properties: it must cover **every** frame (digests are cheap — pin all
of them, not excerpts), and it must run against the same cell-level representation the
renderer consumes, so drift is caught at data level independent of rendering changes.

---

## 4. The CI hang (timer-pinned event loop)

### Mechanism

The CI evidence shows the channel-ui job **passing all scene checks** and then sitting
idle until the runner timeout (~19 min observed vs the usual ~3 min). At kill time there
is no running test and no pending assertion — but the event loop still holds live handles
of kind **Timeout, one per animation tick, each re-arming the next**. The animation
planner drives the sprite with a `setTimeout` chain that reschedules for as long as its
component stays **mounted**. Node exits only when the event loop drains; a self-re-arming
timer chain is a live handle that never drains, so the "finished" process cannot exit.
The hang appeared in the same push that flipped the animation default **off → on** —
previously the planner never ran, so the hosts' omission was invisible.

### Which hosts mount without unmounting

The **channel-ui group hosts**: they mount the header component (which contains the
animated sprite planner) and finish their scene **without unmounting it**. The component's
lifetime — and therefore the timer chain's — outlives the test logic.

### Why the interactive terminal is unaffected

The interactive terminal product is a long-lived process: its **TTY/stdin handles** keep
the event loop alive by design, so the extra timer chain changes nothing observable. Only
hosts that expect to *exit* (CI jobs) are pinned by the timer. Same bug, invisible in one
host, fatal in the other.

### One-line fix

Unmount/dispose the component (which clears the pending timeout and stops the re-arm) in
the host's teardown — e.g. add `headerComponent.unmount()` at the end of the channel-ui
scene/afterAll. (An alternative one-liner is `.unref()` on the planner's timeout so it
never pins the loop, but the correct fix is the unmount: the leak is the missing
teardown, not the timer API.)

---

## 5. Prevention

### Renderer contract checklist (ship with any half-block sprite renderer)

1. **Complete SGR state per cell**: every cell explicitly sets *both* foreground and
   background (using `39`/`49` defaults for transparent halves); no cell may inherit
   color state from a neighbor. (§1 phantom fix)
2. **No inherited state across cells, rows, or frames**: a row ends with RESET; a frame
   switch starts from a fully-reset state.
3. **Erase semantics over whitespace padding**: trailing surplus cells are cleared with
   `\x1b[K` (or an explicit full-region clear), never relied upon to be overwritten by
   spaces — the text pipeline drops trailing blanks.
4. **Constant bounding region**: all frames of an animation render into the same fixed
   width/height region; per-frame dimensions must not shrink the painted area.
   (§2 ghost fix)
5. **Frame-switch idempotence invariant**: painting frame B over frame A must leave the
   exact cell state as painting B on a clean screen (testable: render A→B and
   clean→B, compare cell buffers).
6. **Frame data integrity**: every frame carries a golden full-content digest pinned
   against the source art; CI recomputes and compares all of them. (§3)
7. **Deterministic teardown**: any timer/scheduler the renderer or its animation planner
   owns is disposed on unmount; mounting hosts must always unmount. (§4)
8. **No assumptions about host lifetime**: the renderer/planner must leave zero live
   handles after teardown, so headless hosts (CI) can exit.

### Audit to run BEFORE flipping an animation feature default-on

1. **Handle inventory under headless hosts**: run each host with `--exit`/wtfnode-style
   handle dumps after the flip; verify zero lingering Timeout/TTY handles at "finish".
2. **Host mount/unmount audit**: enumerate every host that mounts the animated
   component; confirm each one has a teardown path that unmounts it (CI hosts, story
   hosts, screenshot hosts — not just the interactive terminal).
3. **Frame-transition visual test**: automated cell-buffer diff across every consecutive
   frame pair (especially wide→narrow transitions) asserting no surviving previous-frame
   pixels and no phantom cells at edges.
4. **Full-frame digest gate green**: all frames pinned and matching before the flip ships.
5. **Timing/exit budget**: measure job wall-clock before/after the flip in CI; a jump
   (3 min → timeout) is the smoke signal of a pinned loop.
6. **Default-off parity check**: diff behavior with the feature off vs on in each host to
   confirm the only delta is the animation itself — no extra persistent state, no extra
   handles, no changed process-exit behavior.

---

## Summary of root causes

| Symptom | Root cause | Fix |
|---|---|---|
| Phantom pixels at right edges | Half-filled cells emit only half the SGR pair; background (or foreground) persists from prior cells into the empty glyph half | Always emit both SGR params (`39`/`49` defaults for transparent) |
| Ghost pixels after wide→narrow switch | Trailing blank cells trimmed from rows + terminal drops trailing whitespace → surplus columns never overwritten | `\x1b[K` erase after content + render to a fixed bounding region |
| tail2 drift (23 cells, 1-col shift) | Hand-copied frame; excerpt-based regression covered a different frame | Golden full-frame digest gate for every frame |
| CI job finished-but-hanging | Planner's self-re-arming `setTimeout` chain stays live while mounted; channel-ui hosts never unmount; TTY handles masked it in the interactive terminal | `unmount()` the component in host teardown |

No blockers were encountered; all analysis derives from the read-only fixture.
