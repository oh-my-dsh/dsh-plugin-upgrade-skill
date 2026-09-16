# S18 · The Terminal Sprite Render Trap — Diagnosis Report

Evidence base (all read-only, under `fixture/`): `renderer-excerpt.ts` (the half-block
renderer as shipped), `symptom-log.txt`, `frames-digest-report.txt`, `ci-hang-evidence.txt`.
Line references below are to `renderer-excerpt.ts`.

Executive summary — four independent defects, one rollout mistake:

| # | Symptom | Root cause | Fix |
|---|---------|-----------|-----|
| 1 | Phantom pixels hugging right edges | Half-filled cells emit only a foreground SGR; the previous cell's **background** SGR (`48;2`) persists and paints the empty half | Emit `\x1b[49m` (default background) in the single-pixel branches |
| 2 | Ghost pixels of previous wide frame survive a switch to a narrower frame | Renderer trims trailing spaces (L41); the text pipeline writes the shorter rows but never clears the surplus columns | Full-width rows + reset-then-erase-to-EOL (`ESC[0m ESC[0K`) per row |
| 3 | One frame (tail2) drawn with a misplaced tail tip | Hand-porting drift: 23 cells shifted/extra; only an excerpt regression for a *different* frame exists | Whole-frame sha256 digests for **all** frames as a blocking CI gate |
| 4 | CI job PASSes then hangs until timeout | Self-rescheduling `setTimeout` chain in the animation planner; CI hosts mount the header and never unmount → live Timeout handles pin the event loop | `.unref()` the planner's timer (one line) |

Plus the rollout gap: the feature was flipped default-on without an event-loop/lifecycle
audit (item 5).

---

## 1. Phantom pixels — stale background SGR painted into the empty half of a half-filled cell

### Mechanism

The renderer's per-cell branches (L22–34):

- both pixels defined → `seq = fg(up) + bg(lo)`, glyph `▀` — sets **fg** (38;2) **and bg** (48;2);
- only upper defined → `seq = fg(up)`, glyph `▀` — sets **fg only**; the cell's **lower half is
  empty** and is painted by the terminal with the *current* background SGR;
- only lower defined → `seq = fg(lo)`, glyph `▄` — sets **fg only**; the **upper half is empty**
  and is painted with the *current* background SGR;
- both transparent → `seq = ''` → emits `RESET` (L36), so state is wiped only *there*.

SGR state is sticky per cell in a terminal: an escape sequence stays in effect until
overridden or reset. The single-pixel branches override the foreground but **never the
background**. So any half-filled cell that follows (within the same row) a cell that emitted
`bg(lo)` — or a run of same-`seq` half cells after one — paints its **empty half** with the
*previous cell's lower-pixel color*: a phantom pixel.

The dedup logic (L35–38, `current`) makes this worse-looking, not better: a run of identical
half-cells emits the fg escape once and then relies on the terminal state — including the
stale bg — for every following cell in the run.

### Which cells expose it

Any cell where exactly one of the two pixels is defined, rendered after a bg-setting cell in
the same row with no intervening fully-transparent cell (the only place RESET is emitted).
Verified by tracing the shipped algorithm on a staggered right edge (`upper="...KK"`,
`lower="...K."`), producing:

```
   ESC[38;2;40;40;40m ESC[48;2;40;40;40m ▀   ESC[38;2;40;40;40m ▀   ESC[0m
   cell 3: fg=K bg=K            (full cell — correct)
   cell 4: fg=K bg=K (STALE)    (half cell — lower half should be default,
                                 is painted K: phantom pixel)
```

That is exactly the symptom log's geometry: sprite rows end in `.` at those columns (no frame
data there), yet a **1-cell-wide column of dim colored noise** appears directly to the right
of the dark outline. It hugs the outline, the sleep-Z symbols and the heart because those are
precisely where the art has *staggered* edges — a full (fg+bg) cell adjacent to a half-filled
cell. It "moves with the animation" because the stale color is whatever pixel the previous
cell of the *current frame* set. Left edges are spared: before any `bg()` is emitted in a row
the "phantom" is default-on-default, i.e. invisible — the artifact only exists **after** a
bg-carrying cell, i.e. at trailing/right edges and glyph interiors.

### The precise escape fix

In both single-pixel branches, explicitly reset the background to the terminal default —
**SGR 49** — alongside the foreground, so the empty half is unpainted and the emitted
sequence fully describes the cell:

```ts
} else if (up !== undefined) {
  seq = fg(up) + '\x1b[49m'   // fg for the upper pixel, DEFAULT BG for the empty lower half
  ch = '▀'
} else if (lo !== undefined) {
  seq = fg(lo) + '\x1b[49m'   // fg for the lower pixel, DEFAULT BG for the empty upper half
  ch = '▄'
}
```

`\x1b[49m` (default background) is the minimal, precise fix; a full `RESET + fg(...)` also
works but is heavier and more disruptive to the `current` dedup. With `seq` now carrying the
bg state, the dedup comparison (L35) remains sound because `seq` fully specifies the cell's
SGR needs. (The fully-transparent branch is already correct — it emits RESET. The odd-row
tail case `sprite[r+1] ?? ''` on L14 is safe for the same reason once 49m is added, since its
half cells now pin the bg explicitly.)

---

## 2. Ghost frames — trimmed rows + a pipeline that never erases the surplus columns

### Why previous-frame pixels survive

- **What the renderer drops:** L41, `out.replace(/[ ]+$/, '')`, strips every trailing
  transparent cell from each row. A narrower pose therefore produces *shorter* row strings —
  the columns its predecessor painted simply do not exist in the new output.
- **What the text pipeline does:** it writes the row strings as-is. A terminal cell changes
  only when something is written to it; writing a shorter line does **not** erase to end of
  line (neither an implicit EOL nor a newline clears anything). So when the animation
  switches from the wide pose (tail swung out, rows reaching further right) to a narrower
  one, every column beyond the new row's end keeps the old glyph **and** the old fg/bg SGR —
  the wide tail remains on screen at its old positions. The narrow frame itself renders fine,
  which is why it looks like "ghost pixels" rather than a render failure.

The bug is a contract mismatch: the renderer emits *minimal* rows (an optimization that
assumes something else clears), while the pipeline assumes rows are *complete* (an assumption
that would be true if nothing was trimmed).

### The two-part fix that guarantees a clean frame switch

1. **Renderer side — stop dropping the whitespace.** Emit every row at the sprite's full
   width (40 columns): remove the trailing-space trim (or pad back to width), letting the
   trailing transparent cells be written as RESET-followed spaces. Then every frame rewrite
   overwrites *all* columns of the sprite area, and a narrow pose actively repaints the
   columns the wide pose used.
2. **Pipeline side — erase what you don't write.** After each row, emit
   `ESC[0m ESC[0K` (reset SGR, then erase-to-end-of-line). This clears any cells beyond the
   row content regardless of width differences — a future pose wider than today's, layout
   changes, or any path that re-trims rows.

Both halves matter, and there is an ordering hazard worth codifying: **reset before erase**.
With BCE (background-color erase) behavior, `ESC[K` fills the erased cells with the *current*
background SGR — if the erase runs while a sprite bg is active, the "cleanup" itself paints a
colored bar (phantom pixels again). `ESC[0m` must land first. Together, part 1 makes the
common case an overwrite and part 2 makes the switch idempotent for any width — no cell of
the previous frame can survive.

---

## 3. Frame data drift — tail2 was hand-ported wrong and nothing whole-frame ever checked it

### What the digest report says

`frames-digest-report.txt` compares sha256 of each frame's 25 rows against the source art:
17 frame groups OK, **tail2 MISMATCH** — 23 differing cells, all in the upper-right
spout/tail-tip area:

- row 2: the `D` at col 26 instead of col 27 (1-column left shift);
- row 3: an extra `D` at col 25, `DBD` at cols 26–28 shifted left 1, extra `DD` at cols 36–37;
- rows 4–6: the whole upper-right cluster shifted 1 column left.

This is symptom 3: the misplaced tail tip is a 6-pixel cluster drawn one column off, plus
invented pixels. The report states the cause directly: **tail2 was hand-copied during
conversion** — transcription drift, not a renderer bug. (This also explains why no renderer
fix can ever address it: the *data* is wrong.)

### Why the existing regression missed it

The only regression in place is **excerpt-based** and was **added later, for a different
frame**. It never rendered or hashed tail2, so 23 wrong cells shipped unnoticed from the day
of the hand-copy. Excerpt testing is structurally blind to this failure mode: a 1-column
shift inside a region nobody excerpted looks identical to "passing" — and even an excerpt of
the *right* region written by the same hand that made the drift would bake the drift in as
the expected value.

### The gate that prevents recurrence

Promote the digest comparison from a one-off audit to a **blocking CI gate over every frame**:

- a checked-in golden file of per-frame sha256 digests of all 25 rendered rows vs. source
  art — **all** frames, whole-frame, no excerpts;
- any digest mismatch fails the build; updating a digest requires a deliberate, reviewed
  regeneration (so drift can never masquerade as a test update);
- source of truth stays the source-art frames: hand edits to ported frame data are treated
  as code changes and must go through the same gate.

One drift incident is enough to show the rule: *frames are data; data gets hashed, not
spot-checked.*

---

## 4. The hang — a timer-pinned event loop in hosts that never unmount

### Mechanism (from `ci-hang-evidence.txt`)

- Job `channel-ui` shows **PASS for all scene checks**, then idles until the runner timeout
  (~3 min historically; one local run idled 19 minutes before a manual kill).
- At kill: no running test, no pending assertion — but the event loop holds **live handles of
  kind Timeout, one per tick of the sprite animation planner, each re-arming the next**. The
  planner runs a self-rescheduling `setTimeout` chain: each tick schedules the next for as
  long as the component stays mounted.
- Node keeps a process alive while the event loop has work. These CI hosts **mount the header
  component and finish without ever unmounting it**, so the chain never stops re-arming. After
  the checks finish, the *only* live handles left are the animation timers — nothing signals
  "done", the loop never empties, and the process sits idle forever. Before the flip the
  animation timers didn't exist (feature default-off), so the loop drained and the job
  exited; the hang appears in exactly the push that flipped the default.

### Why the interactive terminal is unaffected

The interactive product is *supposed* to stay alive: its process is anchored by
TTY/stdin handles for its whole lifetime regardless of the timer chain, and it ends via an
explicit user-driven exit path. A pending animation timer changes nothing observable there —
the process was long-lived anyway (and its teardown can unmount the component). Only
short-lived, non-interactive hosts — CI, scripts, batch jobs — expose the pin, because after
their work completes the animation timers are the last thing keeping the loop non-empty.

### The one-line fix

Unpin the timer from the event loop — `.unref()` it in the planner's scheduling site (covers
both initial schedule and every re-arm, since all timers flow through it):

```ts
const t = setTimeout(nextTick, TICK_MS)
t.unref()   // the timer still fires while the app is alive, but can no longer keep a process alive by itself
```

With the timer unref'd, CI hosts whose checks have finished drain the loop and exit; the
animation keeps ticking in the interactive product exactly as before. (Unmount-safety and a
mounted-guard are worth adding for hygiene, but `unref()` is the one-liner that fixes the
hang — the evidence shows the failing hosts never unmount, so a cleanup-hook-only fix would
not have helped them.)

---

## 5. Prevention

### A. Renderer contract checklist (ship this with any terminal sprite renderer)

*Cell/SGR correctness*

1. Every emitted cell sequence must **fully specify** its visual state: fg **and** bg. A
   half-filled cell emits its pixel's fg plus `\x1b[49m` (default bg) for the empty half —
   never rely on sticky SGR from a previous cell.
2. Compression/dedup is only allowed when the cached sequence fully describes fg+bg (the
   `current` optimization is safe only under rule 1).
3. Fully transparent cells must reset (`ESC[0m`) when any SGR is active; the first and last
   bytes of every row must leave the terminal in default state (row ends with RESET).
4. Erase operations come **after** a reset: `ESC[0m` then `ESC[0K`/`ESC[2J` — EL/ED fill with
   the current background under BCE, so erasing in color paints phantoms.
5. Odd pixel-row counts are defined behavior: the unpaired row renders with the lower pixel
   explicitly transparent (bg default), not "whatever was set".

*Frame-switch correctness*

6. Rows are emitted at **fixed full width** (no trailing-whitespace trimming), so any frame
   rewrite overwrites every column of the sprite area.
7. The writer terminates every row with `ESC[0m ESC[0K` so cells beyond the content are
   cleared — a frame switch is guaranteed clean for any width change.
8. Tests assert the **painted cell grid** (every cell's glyph, fg, bg — including empty
   halves and cells beyond each row's content) via a terminal emulator, for a pose-pair
   switch wide→narrow; string equality of row arrays is not sufficient.

*Frame data correctness*

9. Whole-frame sha256 digests against source art for **every** frame, checked into the repo
   and enforced as a blocking CI gate; digest regeneration is a reviewed, deliberate act.
10. Frame data changes are code changes: hand-edited ported frames go through the same gate
    as renderer changes.

*Lifecycle correctness*

11. Animation timers are `unref()`'d (or otherwise cannot pin the event loop) **and** are
    cancelled on unmount; mounting is idempotent, unmounting is always optional — the code
    must be correct for hosts that never unmount.
12. A CI-level "process exits" test exists: run a headless host that mounts the animated
    component and asserts the process terminates on its own (event loop drains) with the
    feature enabled.

### B. The audit to run BEFORE flipping an animation feature default-on

1. **Consumer inventory.** Enumerate every host/process that mounts the animated component:
   interactive app, CI jobs, scripts, servers, watch modes. For each, answer: does it
   unmount on completion, or does it just finish? Anything that "mounts and finishes" is a
   hang candidate.
2. **Event-loop drain test.** With the feature ON, run each non-interactive entry point
   headless and assert the process exits by itself; when it doesn't, dump live handles
   (`process._getActiveHandles()`, `why-is-node-running`-style) to find what pins the loop.
   This single check would have caught S18's hang before the push.
3. **Full-frame visual diff.** Run the entire frame matrix (all frames, and pose switches
   wide↔narrow) through a terminal-emulator grid compare with the feature on — catches
   phantom halves (SGR persistence) and ghost cells (switch residue) that row-string tests
   miss.
4. **Digest gate green.** Whole-frame digests for all frames pass against source art — no
   unreviewed data drift rides along with the behavior change.
5. **Rollout mechanics.** Flip behind the flag with a canary set of hosts/jobs, watch CI job
   durations for idle-tail regressions (a job whose runtime grows by "timeout" is the hang
   signature), and keep an immediate kill switch back to default-off.

---

*Diagnosis performed read-only against the fixture pack; no fixture file was modified and no
migration or installation was executed. A cell-by-cell trace of the shipped algorithm
(reproduced in section 1) confirms the stale-background mechanism and the row strings it
produces.*
