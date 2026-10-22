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
#### FILE: S18-terminal-sprite-render-trap/S18-report.md

# S18 · The Terminal Sprite Render Trap — Analysis Report

Fixture inspected: renderer-excerpt.ts, symptom-log.txt, frames-digest-report.txt,
ci-hang-evidence.txt (read-only; unchanged).

## 1. Phantom pixels — SGR background-state persistence

**Mechanism.** Each cell packs two vertical pixels into one half-block glyph:
foreground paints the upper half, background paints the lower half. The renderer
has three painted cases:

- both halves painted: emits `fg(up) + bg(lo)` + `▀`
- only upper painted: emits **only** `fg(up)` + `▀`
- only lower painted: emits **only** `fg(lo)` + `▄`

The bug is in the two half-filled cases. ANSI SGR color state is *sticky*: a
`48;2;r;g;b` background set by an earlier cell stays in force until explicitly
changed or reset. A half-filled cell (`fg(up)` only, or `fg(lo)` only) changes
the foreground but **leaves the previous cell's background SGR active**. The
glyph `▀` or `▄` paints only one half of the cell with the foreground; the
other, supposedly EMPTY half is filled with the terminal's current background
color — which is the stale background of the last fully-painted cell to its
left, not the terminal default. The run-length coalescing (`seq !== current`)
makes it worse in appearance but is not the cause: even when `seq` changes and
`fg(up)` is re-emitted, nothing clears the background.

**Which cells expose it.** Any half-filled cell that immediately follows a
fully-painted (`fg+bg`) cell in the same terminal row. That is exactly where
the symptom log reports the noise: the dark outline of the whale body is a
solid painted region whose right edge transitions from full cells to half cells
(outline pixel in one half, '.' transparent in the other), and the same applies
to the sleep-Z symbols and the heart — sparse 1-cell-wide shapes whose cells are
half-filled after the preceding full cell. The "1-cell-wide dim colored column
directly to the right of the edge" is the stale background bleeding into the
empty half of those half-filled cells. Because `fg`-only sequences are also
emitted only when they differ from `current`, the phantom color tracks the
animation (the preceding full cell's bg changes with the pose), matching "they
appear and move with the animation".

**The precise escape fix.** Every half-filled cell must explicitly reset the
background to the terminal default with `\x1b[49m`:

```
} else if (up !== undefined) {
  seq = fg(up) + '\x1b[49m'   // kill any stale background SGR
  ch = '▀'
} else if (lo !== undefined) {
  seq = fg(lo) + '\x1b[49m'
  ch = '▄'
}
```

(Equivalently emit `bg(defaultColor)`, but `49m` is the portable "default
background" escape and keeps the run-length comparison honest since the
sequence now fully describes the cell's SGR state.)

## 2. Ghost frames — row trimming vs. erase semantics

**What the renderer drops.** Line 41: `let row = out.replace(/[ ]+$/,'')` strips
trailing spaces from every rendered row. The transparent tail columns at the
right of a narrow pose (painted as reset + space) are silently removed, so the
row becomes physically shorter on screen. Additionally, most terminal text
pipelines (string builders, snapshot serializers, log writers, and even some
UI text components) trim or ignore trailing whitespace, so the spaces would be
lost downstream even if the renderer kept them.

**Why the previous frame survives.** A frame switch redraws only what the new
frame emits. A WIDE pose's tail reached, say, column 38; the NARROWER pose's
row now ends at column 30 after trimming. Columns 31–38 of that row are never
written — the wide tail's glyphs from the previous frame stay on screen because
nothing overwrites or erases them. Terminal cells are persistent: absent an
explicit erase or overwrite, old output remains.

**Two-part fix for a guaranteed clean switch.**
1. **Deterministic row width:** stop trimming; pad every row to the sprite's
   full cell width (40 cells) with `RESET + ' '` so every column of the
   sprite's bounding box is rewritten on every frame — or, equivalent and
   cheaper, append `\x1b[K` (EL, erase-to-end-of-line) after each row's last
   painted cell so leftover cells to the right are erased without emitting 40
   spaces.
2. **Region clear on switch:** when the pose/frame changes, clear the sprite's
   full cell area (the 40-col × 13-row bounding rectangle — reposition the
   cursor over each sprite row and emit `\x1b[K`/`\x1b[2K`, or erase the
   region before painting). Part 1 alone fixes steady-state rows but does not
   cover frames whose *height* or vertical placement changes; clearing the
   bounding box on every switch does.

## 3. Frame data drift — digest report findings

**What the digest report says.** SHA-256 of each frame's 25 rows was compared
against the source art the sprite was ported from. All frames match **except
`tail2`**: MISMATCH, 23 differing cells, all in the upper-right spout/tail-tip
area — row 2's `D` one column left, row 3 with an extra `D` and a shifted
`DBD` cluster plus extra `DD` at cols 36–37, and rows 4–6's upper-right
cluster shifted 1 column left throughout. The symptom log's "6-pixel cluster at
the wrong position" is the visible tip of this 23-cell drift. `tail2` was
**hand-copied** during the port.

**Why the existing regression missed it.** The only frame regression was an
excerpt-based check added later, for a *different* frame. It pinned a substring/
excerpt of one frame, so it neither covered `tail2` at all nor would a
spot-excerpt reliably cover all 25 rows of every frame. Hand-ported data plus
partial-coverage regression = undetected silent drift.

**The gate.** Check in a digest manifest: for every frame, the expected SHA-256
of its full 25-row data (derived from the source art at port time), verified in
CI on every change to frame data or the porting tooling. Whole-frame, all-frames
digest equality — not excerpts — makes any drift, added row, or shifted cell a
hard build failure at the moment it is introduced.

## 4. The hang — a timer-pinned event loop

**Mechanism.** The animation feature's planner schedules a `setTimeout` for
its next tick, and each tick re-arms the next one — an infinite timer chain
that lives as long as its component stays mounted. In Node, every live
`Timeout` handle keeps the event loop alive and thus keeps the process from
exiting.

**Why CI hangs.** The "channel-ui" job's hosts mount the header component
(containing the sprite/animation planner) and finish their checks **without
unmounting it**. All scene checks PASS, but the still-mounted planner keeps
rescheduling `setTimeout` forever; the event loop has live Timeout handles;
the process never exits and is killed at the runner timeout (previously ~3 min;
observed 19 min idle after the flip). The hang appeared in the exact push that
flipped the animation default from off to on — before the flip the planner
never started in CI.

**Why interactive is unaffected.** In the interactive terminal product the
process is kept alive anyway by its TTY/stdin handles, so an extra live timer
changes nothing observable; the app *wants* to run until the user quits.

**One-line fix.** Unreference the timer so it cannot pin the event loop:

```ts
const t = setTimeout(tick, delay)
t.unref()   // <- the one line
```

(The structural complement — `clearTimeout` in the component's unmount/
cleanup path — is good hygiene, but `unref()` is the single-line change that
unblocks CI even when hosts never unmount.)

## 5. Prevention

### Renderer contract checklist (ship with any terminal sprite implementation)
1. **Full SGR description per cell:** every painted or half-painted cell emits
   a complete state (fg + bg or explicit `49m`/`39m` defaults); never rely on
   inherited SGR state; every row ends with `\x1b[0m`.
2. **Deterministic row geometry:** every row renders to a known cell width (pad
   or `\x1b[K`); never trim trailing whitespace that carries erase semantics.
3. **Erase semantics:** define and test the bounding-box clear on frame switch;
   redraw must overwrite or erase every cell of the union of old and new frames.
4. **Data integrity:** all frame data pinned by whole-frame digests (sha256)
   against source art in CI; hand-ported data is forbidden without a digest
   match; excerpt/spot checks are documentation, not gates.
5. **Lifecycle:** every timer/interval/listener is `unref()`'d or paired with a
   cleanup that provably runs on unmount; "finished but hanging" is a test: the
   render test harness must assert the event loop drains.
6. **Golden output tests:** full rendered-output snapshots (including escape
   sequences) per frame and per frame-switch pair, not just per-frame excerpts.

### Pre-flip audit (before an animation feature goes default-on)
1. **Digest sweep:** run the whole-frame digest gate over *all* frames, not the
   ones already covered by existing regressions.
2. **Visual diff of every transition:** render every frame→frame pair in a real
   terminal (or terminal emulator capture) and diff cell grids — catches phantom
   (SGR bleed) and ghost (stale cells) artifacts that string-level tests miss.
3. **Lifecycle audit:** enumerate every host that mounts the animated component;
   verify each unmounts it, or verify timers are `unref()`'d; run the CI suites
   with the feature force-enabled and assert processes exit promptly.
4. **Non-interactive smoke:** run headless/CI entry points with the feature on
   and a watchdog; the absence of a TTY is exactly the environment where timer
   pinning shows up.
5. **Rollback plan:** keep the flag flippable back, with the digest gate and
   transition diff wired as required checks on any re-flip.


## Required output (JSON only)
{"decisions":[{"id":"<criterion-id>","verdict":"pass|partial|fail|missing","reason":"short"}],"caps":[{"id":"<cap-id>","triggered":false,"reason":"short"}]}
Every criterion and cap exactly once. pass=full points, partial=half, fail/missing=0; a triggered cap caps the total.