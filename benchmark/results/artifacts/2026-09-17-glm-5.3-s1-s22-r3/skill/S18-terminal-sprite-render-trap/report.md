# S18 · The Terminal Sprite Render Trap — Analysis Report

Mode: read-only inspection (plugin-upgrade skill, Mode A discipline). No files inside the
fixture were modified; no migrations, installs, or package scripts were executed. Evidence
reviewed: renderer-excerpt.ts, symptom-log.txt, frames-digest-report.txt,
ci-hang-evidence.txt (fixture directory
E:\deepseek-harness\dsh-plugin-upgrade-skill\benchmark\tasks\S18-terminal-sprite-render-trap\environment\fixture).

Context recap: the whale sprite is 25 pixel rows x 40 palette-character columns, packed
into 13 terminal rows x 40 cells with the half-block technique — each cell's glyph '▀'
draws the upper pixel with SGR foreground (38;2;…) and the lower pixel with SGR
background (48;2;…); '.' in a frame row means "no pixel" (transparent) for that half.

## 1 · Phantom pixels at the sprite's right edges

### Mechanism

SGR 38;2 (foreground) and 48;2 (background) are **independent, sticky pen states**. The
renderer's cell loop only emits the SGR parameters for the halves that have a pixel:

- both halves: `fg(up) + bg(lo)`, glyph '▀'
- upper only: `fg(up)`, glyph '▀'
- lower only: `fg(lo)`, glyph '▄'
- neither: `seq = ''`, glyph ' ' (RESET emitted only when the previous cell had color)

In a **half-filled** cell the glyph still covers the *whole* cell: '▀' paints the lower
half with the **current background color**, and '▄' paints the upper half with the
**current background color**. Because `fg(up)` / `fg(lo)` change only the foreground
parameter, whatever background was last set by an earlier cell in the same row persists
and bleeds into the empty half of the half-filled cell. Symmetrically, a lower-only cell
leaves the previous foreground active, but with '▄' the foreground paints only the lower
half, so the visible bleed is via the background channel in both cases.

Which cells expose it: exactly the thin, one-pixel-wide features at the sprite's right
edge listed in the symptom log — the dark outline cells, the sleep-Z strokes, and the
heart glyph. Their data rows end in '.' at those columns, so each such cell is
half-filled; the neighbor to its left in the same terminal row (body fill, spout, Z
color, heart body) had set a 48;2 background that was never cleared. The result is the
reported 1-cell-wide column of dim colored noise hugging the right edges, moving with the
animation because each frame shifts which neighbor set which background. The artifacts
are not in any frame's data — they are pure residual SGR state.

Note the code's own trailing hygiene cannot help: `row.replace(/[ ]+$/, '')` and the
appended RESET only act at the end of the row, after the bleed has already been encoded
in the emitted glyphs.

### Precise escape fix

For every half-filled cell, explicitly set the empty half to the terminal default
instead of letting it ride the previous background: emit the default-background SGR
**49** (and, for full symmetry against foreground bleed, 39 when the upper half is
empty):

- upper only: `seq = fg(up) + '\\x1b[49m'` (glyph '▀', lower half = default bg)
- lower only: `seq = '\\x1b[39m' + fg(lo) + '\\x1b[49m'` — 39 makes the upper
  half's background irrelevant because '▄' renders the *upper* half in background;
  the operative part is again `49` so the empty upper half takes the default
  background rather than the persisted one.

Equivalent one-liner formulation: always emit both pens per cell, using SGR 39/49 for
the missing pixel, e.g. `seq = (up ? fg(up) : '\\x1b[39m') + (lo ? bg(lo) : '\\x1b[49m')`
with glyph '▀' throughout (the '▄' special case then disappears). A heavier-handed
variant — emitting RESET before every style change — also works but loses the run-length
compression the `seq !== current` guard provides.

## 2 · Ghost pixels surviving a switch to a narrower frame

### Mechanism — two cooperating omissions

**What the renderer drops:** each emitted row is trimmed with
`row.replace(/[ ]+$/, '')`. A transparent cell produces ' ' (plus, at most, one RESET);
all trailing transparent cells at the right end of a row are deleted, so the row string
only extends to the rightmost non-transparent pixel of the *current* frame. The 40-column
bounding width of the sprite is not preserved in the output.

**What the text pipeline does:** the terminal writer diffs lines as text, and
text-diff/trailing-whitespace normalization treats a trimmed shorter line as
"line ends here" — it does not interpret the missing trailing columns as cells that must
be overwritten with blanks. Combined effect: when the wide pose (tail swung out) switches
to the narrower pose, the narrow frame's rows are emitted only up to the new rightmost
pixel; the surplus columns of the wide tail are never written again, never erased, and
the previous frame's pixels stay on screen at their old positions. The narrow frame
renders "fine" and the surplus is stale glass.

### Two-part fix

1. **Stop trimming / keep the full frame width:** emit every row padded to the sprite's
   fixed width (40 cells) so transparent columns are explicit space cells that the
   pipeline must diff and rewrite; if a trailing-bleed guard is needed, keep the row's
   final RESET but never drop the padding columns themselves.
2. **Erase the previous frame's bounding box on switch:** before (or while) drawing a
   new frame, explicitly clear the region the previous frame occupied — minimally, at
   the end of each row emit EL (`\\x1b[K`, erase-to-end-of-line) after the last
   content cell, or track the maximum frame extent and repaint that extent with
   blanks/RESET for one frame after any width shrink. EL is the cheap guaranteed form:
   it erases from the cursor to the end of the line with the current background, killing
   every surplus column regardless of how much wider the old pose was.

Part 1 fixes the data model; part 2 fixes the transition semantics. Either alone leaves a
hole (padding without erase still relies on the diff writer choosing to rewrite; erase
without padding re-trims on the next static repaint).

## 3 · Frame-data drift (tail2)

What the digest report says: `tail2` is the single MISMATCH among all 24 frames — 23
differing cells, all in the upper-right spout/tail-tip area: a 1-column left shift of the
cluster (row 2: D at col 26 vs source col 27; row 3: extra D at col 25, DBD at 26–28
shifted, extra DD at cols 36–37; rows 4–6 shifted throughout). This is the misplaced
6-pixel tail-tip cluster the user saw (symptom 3). The report states the frame was
hand-copied during conversion.

Why the regression missed it: the existing regression was **excerpt-based** — it checked
selected excerpts of a *different* frame, not the full row data of every frame. An
excerpt check verifies only the rows/columns it quotes, so a wholesale 1-column shift and
stray cells in an unexcerpted frame are invisible to it.

The gate that prevents recurrence: a **complete per-frame digest regression** — for every
frame, sha256 (or equivalent) over the frame's full 25x40 character data, compared
against digests computed from the source art (exactly what frames-digest-report.txt did
forensically, promoted to a checked-in test). Any port/conversion edit that changes even
one cell of any frame fails the gate; new frames must be added with their source-derived
digest, making hand-porting verifiable instead of trust-based.

## 4 · The CI hang (finished job that never exits)

Mechanism, from ci-hang-evidence.txt: the animation feature's planner reschedules a
`setTimeout` for the next tick **for as long as its component stays mounted** — the
timer chain is self-re-arming (each callback schedules the next Timeout). In Node, a live
timer handle keeps the event loop from draining. The channel-ui CI hosts **mount the
header component and finish without unmounting it**, so after all scene checks PASS there
is no running test and no pending assertion — only the perpetual Timeout chain (the kill
state confirms: "live handles of kind Timeout — one per tick, each re-arming the next").
The process therefore sits idle until the runner timeout kills it (~3 min historically;
19 min observed once locally).

Why the interactive terminal is unaffected: its process is deliberately kept alive by
its TTY/stdin handles regardless of the timer chain — an always-live handle set that
masks the leak. The leak only becomes observable in a host whose only remaining handles
would otherwise be the timers, i.e. a CI driver that mounts, runs checks, and expects the
loop to drain. Timeline matches: the hang first appeared in the same push that flipped
the animation default from off to on.

One-line fix: unmount/dispose on teardown — clear the timer when the component unmounts,
i.e. in the component's dispose/unmount path call `clearTimeout(this.timer)`
(equivalently `timer.unref()` on each scheduled tick, but the unmount-time clear is the
correct ownership fix; `unref()` is the acceptable one-line variant when unmount hooks
are unavailable).

## 5 · Prevention

### Renderer contract checklist (ship with any half-block sprite implementation)

1. **Both pens per cell:** every cell sets foreground AND background explicitly (SGR
   39/49 for the empty half of half-filled cells). No cell may rely on SGR state left by
   a previous cell.
2. **Sticky-state audit:** SGR parameters are persistent modal state; run-length
   compression (`seq !== current`) is allowed only between cells whose *empty halves*
   are pinned by rule 1.
3. **Fixed output geometry:** emitted rows always span the sprite's declared bounding
   width; no trailing-whitespace trimming of cell padding inside the sprite region.
4. **Erase-on-shrink:** every row ends with EL (\\x1b[K) after its last content cell, or
   the renderer explicitly clears the previous frame's bounding box before drawing a
   narrower one; frame switching must be visually atomic (no stale columns).
5. **Row-final reset:** each row terminates with RESET so state cannot leak into
   subsequent UI written after the sprite.
6. **Frame-data integrity gate:** full-frame digests (sha256 over all rows/columns) of
   every frame checked against source-derived digests in CI; excerpt-based checks are
   supplementary only.
7. **Animation lifecycle ownership:** every scheduler (timer/raf/interval) created by the
   renderer or its planner is owned by the mounting component and disposed on unmount;
   the component must not outlive its host's interest in it.

### Pre-flip audit (run BEFORE flipping an animation feature default-on)

1. **Inventory all mounts** of the animated component across every host (interactive
   terminal, CI scene runners, headless/smoke hosts, screenshot/preview harnesses) and
   verify each has a matching unmount/dispose path that actually clears timers.
2. **Event-loop drain test in CI:** run a representative host with the feature on and
   assert the process exits after checks complete (fail on lingering Timeout/interval
   handles, not on job wall-time) — this is the test that would have caught the hang
   before the flip.
3. **Frame-switch sweep:** render every ordered frame pair (wide→narrow included) into a
   virtual terminal buffer and diff the full cell grid against the expected frame —
   catches ghost columns and phantom-pen artifacts per pair.
4. **Pen-state assertion:** for every emitted cell in the sweep, assert the effective
   foreground/background are the intended ones (including default for empty halves).
5. **Digest gate green** for all frames including hand-ported ones.
6. **Default-off soak first:** ship the feature dark-flipped (default off, opt-in) through
   one CI cycle, then flip; the flip commit then isolates the behavior change.

## Report per skill structure

- **pre-existing**: not collected (read-only static analysis; no baseline suite run — the
  fixture is static evidence and executing it is prohibited).
- **Completed**: full mechanism analysis of all four defects plus the contract/audit
  deliverable, from renderer-excerpt.ts and the three evidence files.
- **Skipped**: runtime reproduction (prohibited by the read-only fixture contract);
  migration planner / version cards (not applicable — this is a renderer defect analysis,
  not a DSH corridor migration; no version-boundary APIs are involved).
- **Pending/residual risk**: the precise SGR emission of the shipped terminal pipeline
  (diff writer internals) is inferred from the symptom log and evidence text, not from
  its source; the proposed EL/padding fix should be validated against that writer when
  the team implements it.
- **Rollback**: N/A — no files were modified anywhere in the fixture or benchmark
  repository; only this report file was written to the designated output directory.
- **Recommendations**: adopt the checklist in section 5 as review criteria; promote the
  digest report into a CI gate; add the event-loop drain assertion to the channel-ui job.
