# S18 — Terminal sprite rendering and animation rollout audit

## Scope and evidence

This is a single-attempt, static, no-skill analysis of the five supplied fixture files. No fixture was executed or changed, and no skills, network, other repository content, grading tools, or prior answers were used. The renderer excerpt directly establishes the ANSI and trimming defects. The supplied digest and CI reports establish the reported data mismatch and timer behavior; neither the complete frame data, text-layout pipeline, nor planner implementation is present, so those were not independently reproduced.

## 1. Phantom pixels: stale background in a half-filled cell

`fg()` emits SGR `38;2;R;G;B`, which changes only the foreground. `bg()` emits SGR `48;2;R;G;B`, which sets a background that remains active until explicitly reset or replaced. Setting another foreground does not clear that background.

A fully occupied cell emits `fg(up) + bg(lo)` and `▀`. A following upper-only cell emits only `fg(up)` and `▀`; its lower, supposedly empty half therefore displays the previous cell's background. A lower-only cell emits `fg(lo)` and `▄`; in this orientation its upper empty half displays that same stale background. The colored part of either half-block is foreground, and the complementary half is background. The JavaScript `current` string caches intended sequences, not the actual independent foreground/background state. A change from a full-cell sequence to a foreground-only sequence still leaves the background set.

For example, a full cell with dark lower pixel followed by an upper-only edge pixel leaves a dark lower half under the edge pixel. Further foreground-only cells can carry that background forward. Silhouette boundaries, the outline, sleep-Z edges, and heart edges expose this because adjacent vertical pixels have unequal occupancy. It is not necessary for frame data to contain a colored pixel in that empty half. The odd final source row also needs this rule: the absent 26th row is transparent.

The precise fix is to reset the background in BOTH single-pixel branches:

```ts
const DEFAULT_BG = '\x1b[49m'
// upper only
seq = fg(up) + DEFAULT_BG
ch = '▀'
// lower only
seq = fg(lo) + DEFAULT_BG
ch = '▄'
```

SGR 49 restores the terminal default background; it does not force black. If the containing UI promises a specific nondefault surface background, explicitly set that surface color instead. A full SGR reset before setting foreground also works but must occur before the glyph, not merely at row end. Keep the state cache aligned with the sequences actually emitted.

A both-empty cell uses a space and resets attributes when transitioning out of colored content. Thus the excerpt does not support blaming stale background for a newly emitted, fully transparent cell following colored content: that path emits RESET. Phantom fill is specifically in the empty HALF of a partly occupied cell. Old content in omitted fully empty trailing columns is the separate ghost-frame defect below. Row starts should establish known attributes too; initializing `current = ''` alone does not reset inherited terminal state.

## 2. Ghost frames: omitted overwrites and missing erase coverage

`out.replace(/[ ]+$/, '')` drops the trailing ASCII spaces generated for transparent cells at the right of each row. The logical frame remains 40 columns wide, but the printed row ends at its last retained content/control sequence. RESET changes drawing attributes; it neither erases pixels nor advances through those omitted columns. When a wide frame is followed by a narrow one, old cells beyond the new printed width receive no replacement and remain visible.

There is also a text-pipeline boundary: a layout/normalization path that trims trailing whitespace can remove right padding even after this explicit renderer trim is removed. The task flags that hazard, but the fixture supplies no pipeline implementation or trace, so its exact trimming stage cannot be identified or verified here. Simply removing this one regex is not evidence that spaces survive to the terminal.

Use a two-part frame-switch contract:

1. Preserve the complete 40-column by 13-terminal-row footprint through the final output pipeline. Remove renderer trimming and disable or bypass downstream trailing-space trimming for sprite rows. If that pipeline requires a whitespace-resistant blank such as a nonbreaking space, verify its width and preservation in the actual terminal/layout stack; do not assume it. Include fully empty rows and the padded lower half of source row 25. Reset backgrounds before writing blank cells.
2. Explicitly clear the previously occupied sprite rectangle before repainting, or have the compositor guarantee equivalent complete overwrite of every previously occupied cell. Clear all 40 columns on all 13 rows, including rows now empty. Reset to the intended background before clearing and position the cursor for each row. A bounded `CSI 40 X` erase-character operation at each sprite-row origin is appropriate when supported; then repaint from the origin. `CSI K` can clear a line remainder only if the sprite owns that remainder, since otherwise it may erase neighboring UI. A complete fixed-width overwrite also supplies the erase guarantee, but only after verifying the final pipeline actually emits all blanks.

Preserving row dimensions makes layout stable; explicit previous-footprint invalidation ensures old tail pixels cannot survive. SGR reset alone provides neither guarantee.

## 3. Frame drift: whole-frame identity, not selected excerpts

The supplied SHA-256 report says standard, blink, fin1/2, spout1–6, tail1, tail3/4, heart1–3, and sleep1–5 match their source-art frames. Only `tail2` mismatches. It lists 23 differing cells in the upper-right spout/tail-tip area:

- Row 2: D at ported column 26 instead of source column 27.
- Row 3: an extra D at column 25, DBD at source columns 26–28 shifted left one, and extra DD at columns 36–37.
- Rows 4–6: upper-right cluster shifted one column left throughout.

The symptom log's visible six-pixel cluster is not a replacement for the digest report's 23-cell difference count. These describe the visible symptom and the source comparison respectively.

The frame was hand-copied. The existing excerpt regression was added for a different frame and did not cover `tail2`; passing that assertion could not establish identity for all frames or all rows. Restore `tail2` from authoritative source art rather than guessing from the symptom, then gate all frame imports with full-frame digests generated from that source. Validate the complete expected frame-name set, exactly 25 rows of exactly 40 palette characters, and allowed symbols. Specify canonical serialization (row order, separators, newline convention and encoding) so source and port hash identical bytes. Compare every complete frame against independently sourced expected hashes in CI. Expected hashes must not be regenerated blindly from the port being checked; deliberate art changes require reviewed source and digest updates. Prefer deterministic conversion to hand-copying.

The supplied report contains no actual digest values or full source art, so this analysis cannot calculate hashes or reconstruct the correct frame independently.

## 4. Finished CI job held alive by a timer chain

`ci-hang-evidence.txt` reports that channel-ui scene checks all pass, with no test or assertion still pending. The mounted sprite animation planner schedules a `setTimeout`, whose callback schedules the next timeout, indefinitely while the component stays mounted. These timeout handles are referenced by default in Node and therefore keep its event loop alive. There need not be a growing timer leak: one continually renewed referenced timeout is sufficient.

The affected channel-ui/scene-check hosts mount the header component and finish without unmounting it, so unmount cleanup never cancels the chain. The evidence names this host category, not individual source files or additional host names. The default-off configuration previously avoided activating that chain; default-on makes it present in those hosts and explains the timing of the regression. The report records an approximately three-minute former runtime, an eventual runner timeout, and one local observation of 19 idle minutes before manual kill.

One-line Node fix, applied whenever the next animation timeout is created:

```ts
timer.unref()
```

Equivalently, `setTimeout(tick, delay).unref()` at the common scheduling site. Unref every re-armed timeout, not only the first handle. It permits natural process exit when no other referenced work remains without disabling animation while the process is otherwise live. If the code shares a browser runtime, account for numeric browser timer handles separately; the evidence concerns Node Timeout handles. The actual variable name and scheduling site are not supplied.

The interactive product already has TTY/stdin handles keeping its process alive; an unreferenced animation timer still fires while those handles exist, so this fix preserves interactive animation. Continue to cancel timers on unmount and prevent scheduling after disposal, but unmount cleanup alone cannot solve hosts that never unmount.

## 5. Renderer contract and pre-default-on audit

The renderer should ship with an explicit contract covering:

- Palette and geometry: complete frame set; 25-by-40 source grids; known palette symbols and transparent marker; exactly 13 output rows; absent final lower row treated as empty.
- All four occupancy cases: full uses foreground upper/background lower; upper-only uses `▀` with default/surface background; lower-only uses `▄` with default/surface background; empty clears with a blank and known background.
- ANSI state: independent foreground/background lifetime; deterministic row-entry state and row-exit reset; cache accurately tracks emitted attributes; no color leakage into adjacent UI.
- Layout and erase: glyphs are one terminal column; ANSI sequences consume no columns; all 40 columns survive the text pipeline; old rectangles are invalidated, with clearing confined to sprite ownership; cursor positioning and wrap behavior are defined.
- Frame integrity: every frame is checked against source-derived full-frame digests, with structural validation and reviewed expected-hash updates.
- Animation lifecycle: bounded scheduling, cancellation on teardown, no rescheduling after disposal, and unreferenced Node animation timers so decorative work cannot alone keep a process alive.

Before default-on, inventory every host that mounts the header: interactive terminal, channel-ui scene checks, snapshots, batch commands, and other noninteractive consumers where applicable. Verify actual host lifecycles rather than assuming all mount paths unmount. Exercise default-on and off, non-TTY execution, and mount-without-unmount process termination in a subprocess with a bounded exit deadline. Inspect remaining handles on failure. Confirm unref happens on every reschedule and interactive animation still runs.

Audit final terminal output, not just the renderer's intermediate strings: use a stateful terminal emulator or captured screen to check full-to-upper-only and full-to-lower-only transitions, all-transparent rows, odd-height padding, wide-to-narrow and reverse switches, default/light/dark surface backgrounds, and neighboring text protection. Include sleep-Z, heart, and tail extremes. Check every frame's full source digest before enabling the feature. These checks catch visual-state, data-integrity, and process-lifecycle regressions that an excerpt assertion or a PASS-only test result misses.

No implementation was changed. There are no blockers to this static report. Independent reproduction, exact pipeline attribution, actual digest computation, and verification of the concrete timer fix require source/runtime evidence beyond this fixture.
