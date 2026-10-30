# S18 · Terminal sprite render trap — root-cause report (read-only)

Task: read the shipped half-block sprite renderer (`fixture/renderer-excerpt.ts`) against its
visual symptoms (`fixture/symptom-log.txt`), the frame digest report
(`fixture/frames-digest-report.txt`), and the CI hang evidence (`fixture/ci-hang-evidence.txt`).
This report is the deliverable; the fixture was not modified.

## Summary

| # | Symptom | Root cause | Fix | Gate |
|---|---|---|---|---|
| 1 | Phantom pixels hugging right edges | SGR background color persists across cells; half-filled cells (`▀`/`▄`) emit `fg` only, leaving the empty half painted with the stale background | Emit a complete `(fg,bg)` state per cell; explicit default background `\x1b[49m` (or `RESET`) on the missing half of every half-filled cell | Cell-state test: parse render output, assert the transparent half of every cell is default-bg |
| 2 | Ghost pixels after wide→narrow frame switch | Renderer strips trailing spaces (`replace(/[ ]+$/, '')`), so rows are written shorter than the frame width; pipeline trims trailing whitespace, so surplus columns of the previous frame are never overwritten and never erased | (1) Pad every row to the full frame width with explicit blank space cells (no trailing trim); (2) stop trimming trailing whitespace in the pipeline — or append an erase-to-EOL `\x1b[K` after the last glyph | Frame-switch test in a real cell buffer: wide frame → narrow frame, assert zero surviving pixels |
| 3 | `tail2` tail tip misplaced | Hand-ported frame drifted: 23 cells differ from the source art, upper-right cluster shifted 1 column left plus extra `D` cells | Re-port mechanically from the source art; pin a per-frame sha256 manifest | Full-frame digest manifest checked in CI (excerpts are smoke tests, never the gate) |
| 4 | CI job "passes then hangs" | Self-re-arming `setTimeout` chain in the animation planner pins the event loop; the scene-check hosts mount the header component and finish without unmounting, so the chain never stops | `unref()` the re-armed timer (one line in the planner tick); plus `clearTimeout` in the unmount/dispose path for hosts that do dispose | Exit test: every CI profile must exit after the suite; job-duration guard vs. baseline |

---

## 1. Phantom pixels — SGR background leaking into the empty half of a cell

### The half-block contract

Each cell packs two vertical pixels: `▀` (U+2580, upper half block) paints the **upper**
pixel with the cell's **foreground** and leaves the **lower** half of the cell to the cell's
**background**; `▄` (U+2584) is the mirror. So in the half-block model the background is not
decoration — it *is* one of the two pixels.

### What the renderer does (renderer-excerpt.ts:22–40)

Four cell cases:

- both pixels colored → `seq = fg(up) + bg(lo)`, glyph `▀` (complete state);
- **upper only** (`up !== undefined`, `lo === undefined`) → `seq = fg(up)` — background never
  touched;
- **lower only** → `seq = fg(lo)` — background never touched;
- transparent → `seq = ''`, which emits `RESET` when the previous state was non-empty.

### Which SGR state persists

Per ECMA-48 / VT100 semantics, SGR attributes are **sticky**: `\x1b[48;2;r;g;bm` set at cell *x*
stays in effect for cell *x+1*, *x+2*, … until overwritten or reset. The renderer never emits
`\x1b[49m` (default background) anywhere, and the only `RESET` it emits is at transparent cells
and row ends. The delta cache at `renderer-excerpt.ts:35–38` compares the *emitted `seq`
string*, not the terminal's actual state — so it believes a half-filled cell is `fg(up)`-only
while the terminal still holds the previous cell's `bg(lo)`.

### Which cells expose it

Any half-filled cell that follows a background-setting cell (in practice, any full `fg+bg`
body cell to its left):

- **`▀` up-only cell** (line 25–27): the glyph covers only the top half; the bottom half paints
  the **stale background**. At the sprite's right edge this is a colored pixel under a
  transparent lower pixel — the 1-cell-wide dim column hugging the dark outline, the sleep-Z,
  and the heart.
- **`▄` lo-only cell** (line 28–30): mirror image — the top half paints the stale background.

This matches `symptom-log.txt` exactly: artifacts sit *to the right of* the outline / Z / heart
(the last cell of each colored run, typically half-filled at the edge), they appear and move
with the animation (because which cell last set `bg` changes per frame), and they are in no
frame's data (`'.'` there).

### The precise escape fix

Every emitted `seq` must be a **complete `(fg, bg)` state**:

```ts
if (up !== undefined && lo !== undefined) { seq = fg(up) + bg(lo); ch = '▀' }
else if (up !== undefined)               { seq = fg(up) + '\x1b[49m'; ch = '▀' }  // default bg on the empty lower half
else if (lo !== undefined)               { seq = fg(lo) + '\x1b[49m'; ch = '▄' }  // default bg on the empty upper half
else                                     { seq = ''; ch = ' ' }                  // unchanged: emits RESET
```

`\x1b[49m` (restore default background) — equivalently `RESET + fg(up)` / `RESET + fg(lo)` — is
the precise escape; the point is that a half-filled cell must *explicitly clear* the background
it is not using. With a complete `seq` per cell, the `seq !== current` delta cache becomes sound
again (it is an optimization over a full state specification, and must only ever be fed one).
The transparent case is already correct because `seq=''` always differs from any colored state
and triggers `RESET`.

## 2. Ghost frames — why the previous frame survives a switch to a narrower frame

### What the renderer drops

`renderer-excerpt.ts:41`: `let row = out.replace(/[ ]+$/, '')` — the trailing-blank cells of
every row are stripped. The sprite is 40 columns wide (`symptom-log.txt`); a wide pose (tail
fully swung out, colored cells far right) emits rows that reach the tail tip; a narrower pose
emits rows that end earlier. Each row string therefore ends at its last painted glyph.

### What the text pipeline does

The pipeline between renderer and terminal trims/collapses trailing whitespace on each line
(the usual `trimEnd` / join step when assembling the write). So even a renderer that padded its
rows to the full width would have the padding eaten one layer later. The net effect after both
layers: **rows are written shorter than the frame's cell area.**

### Why ghosts survive

A terminal keeps a cell's glyph and attributes until something overwrites it; writing a short
row does **not** clear the rest of the line, and the row-end `RESET` (line 42) only clears SGR
state — it erases nothing. When the animation redraws all 13 rows at the sprite origin, the
narrow frame's rows stop before the wide frame's tail columns; those surplus columns are never
overwritten and never erased, so the previous frame's tail pixels remain visible at their old
positions — exactly the ghost-pixel report. This needs no new mechanism beyond "write = copy
glyphs; erase = explicit."

### The two-part fix

1. **Renderer**: never trim trailing cells — pad every row to the frame's fixed column count
   with explicit blank space cells (`\x1b[49m` + `' '`, or plain spaces after the reset), so the
   new frame *overwrites* the surplus columns with blanks. Belt-and-braces, append erase-to-EOL
   (`\x1b[K`) after the last glyph of each row so the terminal wipes anything beyond the row
   itself.
2. **Pipeline**: stop trimming trailing whitespace between renderer and terminal — pass rows
   through byte-for-byte (the trailing blanks are now *render data*, not stray whitespace). If
   some consumer must trim, then part 1 must carry the `\x1b[K` erase so the line is cleared by
   the terminal rather than by overwrite.

Both parts are required: either one alone re-introduces ghosts (padding without pipeline
preservation is trimmed away; erase-line without removing the trim still fights the writer).

## 3. Frame-data drift — what the digest report says, and the gate

### What the digest report says

`frames-digest-report.txt`: per-frame sha256 over each frame's 25 rows, compared to the source
art. All frames OK **except `tail2` — MISMATCH, 23 differing cells, all in the upper-right
spout/tail-tip area**:

- row 2: ported `D` at col 26, source `D` at col 27 (1-column left shift);
- row 3: extra `D` at col 25; `DBD` at cols 26–28 shifted left 1; extra `DD` at cols 36–37;
- rows 4–6: the whole upper-right cluster shifted 1 column left.

So `tail2` was not merely shifted — it also carries duplicated/misplaced `D` cells (extra `D`
at 25, extra `DD` at 36–37). The report states the cause: `tail2` was **hand-copied** during
conversion. This matches `symptom-log.txt` symptom 3 (misplaced 6-pixel tail-tip cluster).

### Why the per-excerpt regression missed it

The regression was excerpt-based and was **added later, for a different frame** — so `tail2`
was never covered at all, and the mechanism behind the miss generalizes: an excerpt only pins
the cells inside its window. A whole-cluster 1-column left shift can pass an excerpt check
whose window happens to land on a region that looks similar, and cells *outside* the excerpt
(the extra `D`/`DD` at cols 25 and 36–37) are invisible to it by construction. Excerpt equality
is a smoke test, not a coverage gate.

### The gate that prevents recurrence

1. **Pin full-frame digests**: sha256 over *all 25 rows* of every frame, stored as a manifest
   derived from the source art, and **verified in CI** — any mismatch fails the build (the same
   digest scheme that caught `tail2`, but applied to every frame as a gate rather than a
   one-off audit).
2. **Full-frame golden snapshots** in the render tests — compare complete frames, never
   excerpts; excerpts may remain as fast smoke tests alongside.
3. **No hand-ported frames**: port frames mechanically from the source-of-truth art so drift
   cannot be introduced; when the art legitimately changes, the manifest is re-pinned through
   review (a visible, intentional diff — never silently accepted).

## 4. The hang — "finished but hanging" CI job

### The mechanism

From `ci-hang-evidence.txt`: the job passes every scene check, then sits idle until the runner
timeout kills it. Process state at kill: no running test, no pending assertion — the event loop
holds live handles of kind **Timeout, one per tick of the sprite animation planner, each
re-arming the next**. The planner reschedules a `setTimeout` for as long as its component stays
mounted. In Node a pending (ref'd) timer keeps the event loop alive, so a self-perpetuating
timer chain pins the process forever after the work is done: PASS everywhere, but no exit.

The flip from default-off to default-on is what took this from "unreachable code path" to
"runs in every scene-check host" — which is why a job that had always finished in ~3 minutes
suddenly idled to the runner timeout (one local observation: 19 minutes idle before a manual
kill).

### Which hosts hit it

The **scene-check / CI hosts** — "these particular hosts mount the header component and finish
WITHOUT unmounting it." Their lifecycle is mount → assert → finish, with no teardown, so the
planner's timer chain never stops. The interactive terminal product is a different host shape.

### Why the interactive terminal is unaffected

Its process is kept alive by the **TTY/stdin handles** regardless of the timer chain, so a
lingering ref'd timer is masked there — the symptom cannot reproduce locally. That asymmetry is
precisely why the hang only appeared in CI (a non-TTY host) and why local runs gave false
confidence before the flip.

### The one-line fix

In the planner's tick, `unref()` the re-armed timer so the chain cannot pin the event loop:

```ts
const t = setTimeout(tick, ms); t.unref()   // a self-re-arming planner must never hold the process open
```

Complementary hygiene (not a substitute): `clearTimeout` the pending tick in the component's
unmount/dispose hook — but note that on the hosts in this evidence the unmount hook never runs,
so dispose-time cleanup alone would *not* have fixed this hang; `unref()` is the line that
covers the observed failure, with dispose-time clearing closing the loop for well-behaved hosts.

## 5. Prevention

### Renderer contract checklist (what a terminal sprite implementation should ship with)

1. **Complete per-cell state.** Every emitted escape fully specifies fg *and* bg; a half-filled
   cell explicitly declares the default background for the half it does not paint
   (`\x1b[49m`/`RESET` + `fg`). No cell may inherit a color from its left neighbor.
2. **Transparency table pinned by test.** `▀`+bg(default) / `▄`+bg(default) / `▀`+bg(lo) /
   space+reset, asserted by a cell-state test that parses the output and checks the empty half
   of every half-filled cell is default.
3. **Delta caches keyed on full state.** Any `seq !== current` optimization is fed complete
   states only — never a partial state that "assumes" the terminal remembered something.
4. **Full-width rows; trailing blanks are data.** Rows are padded to the frame's column count
   with blank space cells (and/or end-of-line erase `\x1b[K`); the renderer strips nothing, and
   nothing downstream trims trailing whitespace (no `trimEnd`, no whitespace collapse).
5. **Row-end invariant.** Each row starts and ends in a known state; every row ends with
   `RESET`.
6. **Frame-switch test.** Render a wide frame then a narrower frame into the same real
   terminal-emulator cell buffer; assert zero pixels from the first frame survive (and the
   reverse, and every pair of animation frames — not just one pair).
7. **Deterministic, digest-pinned frames.** Render output is pure (no wall-clock input); every
   frame's full rows carry a sha256 against the source art in a manifest checked in CI; frames
   are generated mechanically from the source art, hand-edits are forbidden; manifest changes
   are intentional, reviewed diffs.
8. **Lifecycle/handle test.** Mounting and finishing a host without unmounting must not keep
   the process alive: the planner's timers are `unref()`'d and cleared on dispose; a test
   asserts the process exits.
9. **Geometry contracts.** Odd sprite heights (`lower = sprite[r+1] ?? ''`) and uniform widths
   are asserted, not assumed.

### Audit to run BEFORE flipping an animation feature default-on

1. **Handle/timer inventory** (static): grep the feature's code paths for `setTimeout` /
   `setInterval` / listeners / streams; for each, prove its cancel path (dispose hook, `clear*`,
   `unref`) — and prove it runs on **every** host that mounts, including hosts that mount and
   never unmount.
2. **Lifecycle/exit smoke per CI profile** (not just the interactive one): run the suite in
   each profile and assert the process *exits* with a clean code. "All checks pass" is not
   "job finished" — a green suite that does not exit is a failure (this is the exact failure
   the CI evidence shows).
3. **Duration guard**: record the job's baseline duration and fail if a profile exceeds a small
   multiple of it — a hang-at-timeout surfaces fast instead of at the runner timeout.
4. **Render contract run**: execute the checklist above — cell-state/phantom test, full-width +
   no-trim assertion, frame-switch test over all frame pairs in a real cell buffer, full-frame
   digest manifest check for every frame (excerpts alone do not count).
5. **Canary before default-on**: run the feature default-off with the flag forced on in one CI
   job plus one local run, apply fixes, and only then flip the default. The flip itself should
   be a one-line, reviewable diff (flag default) with this audit attached; rollback is reverting
   that one line.
6. **First flip watch**: watch the first CI runs after the flip for duration regressions before
   considering the rollout done.

---

**Evidence mapping**: `renderer-excerpt.ts` lines 22–40 (cell cases), 35–38 (delta cache),
41 (trailing-space trim), 42 (row-end RESET); `symptom-log.txt` symptoms 1–3; `frames-digest-report.txt`
(`tail2` mismatch, 23 cells, hand-copied port, excerpt regression note); `ci-hang-evidence.txt`
(Timeout handles, planner re-arm, mount-without-unmount hosts, TTY-masked interactive run,
timeline tie to the default flip).
