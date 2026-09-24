# S18 · The Terminal Sprite Render Trap — Report

Fixture analyzed (read-only): renderer-excerpt.ts, symptom-log.txt, frames-digest-report.txt, ci-hang-evidence.txt.

Sprite model: 25 rows x 40 columns of palette characters, rendered as 13 terminal rows x up to 40 cells.
Each cell packs two vertical pixels into one glyph: `▀` (foreground = upper pixel, background = lower pixel)
or `▄` (foreground = lower pixel, background = upper pixel). `.` = transparent.

---

## 1. Phantom pixels at the right edges (SGR state persistence)

### Mechanism

The renderer tracks only the *last emitted SGR string* in `current` and emits a new sequence only when
`seq !== current`. Critically, the half-filled branches set **only the foreground**:

- `up` defined, `lo` transparent → `seq = fg(up)`, glyph `▀`
- `lo` defined, `up` transparent → `seq = fg(lo)`, glyph `▄`

But a preceding full cell (both pixels defined) emitted `fg(up) + bg(lo)`, and SGR state — specifically the
**background color (`48;2;r;g;b`)** — persists across cells until a RESET. So when the renderer later emits
just `fg(x)` for a half-filled cell, the **stale background from an earlier cell in the same row is still active**.

In a half-block glyph the *empty* half is painted by the other pen:

- `▀` (up-only): foreground paints the upper half; the empty **lower** half is painted by the lingering bg.
- `▄` (lo-only): foreground paints the lower half; the empty **upper** half is painted by the lingering bg.

### Which cells expose it

Cells at the sprite's right edges where exactly one of the two stacked pixels is opaque (the other is `.`):
the dark outline cells, the sleep-Z symbols, and the heart glyph all end in `.` at those columns
(symptom-log point 1). Whichever earlier cell in the row last set a `bg` donates its color to the empty half,
producing the 1-cell-wide column of dim colored noise that moves with the animation (each frame ends its
opaque run at a slightly different column, so the stale bg source changes per frame). The trailing-RESET at
row end does not help — the damage happens *before* it, mid-row.

### Precise fix

Every half-filled cell must explicitly define the pen for its empty half instead of inheriting state.
Since `.` is transparent, the empty half must be set to the **default background**:

```ts
} else if (up !== undefined) {
  seq = fg(up) + '\x1b[49m'   // ▀: bg paints the empty lower half → default bg
  ch = '▀'
} else if (lo !== undefined) {
  seq = fg(lo) + '\x1b[49m'   // ▄: bg paints the empty upper half → default bg
  ch = '▄'
}
```

(`49` = default background; `39` = default foreground if a symmetric case ever appears.)
Equivalently: never emit a partial pen — each cell emits a complete fg+bg pair, so no SGR state needs to
survive between cells. The `seq !== current` dedup then also stays correct because sequences are complete.

---

## 2. Ghost pixels surviving a frame switch to a narrower pose

### What the renderer drops

`let row = out.replace(/[ ]+$/, '')` — the renderer **trims trailing blank cells off every row** before
appending RESET. Transparent cells at the row tail are emitted as plain spaces (`ch = ' '`, `seq = ''`)
and then deleted.

### What the text pipeline does

Writing a row string to a terminal only touches the columns the string actually covers; trailing whitespace
is semantically insignificant in the text pipeline, and after trimming the string simply *ends* — nothing
erases the columns beyond it. Terminals do not clear cells that receive no characters.

### Failure chain

A WIDE pose (tail fully swung out) paints cells out to column ~40. The next NARROW pose's rows, after
trimming, end at an earlier column. The repaint writes only up to the trimmed length, so the wide tail's
surplus columns are never overwritten nor erased — the previous frame's tail pixels remain on screen at
their old positions (symptom-log point 2).

### Two-part fix

1. **Explicit erase instead of relying on blanks**: end every row with `\x1b[K` (EL — erase to end of line,
   in default colors) before the RESET, so anything previously painted beyond the new content is destroyed
   on every frame switch — regardless of the new frame's width.
2. **Fixed canvas width**: render to a constant cell width (the sprite's declared 40 columns / canvas width)
   rather than content-trimmed rows, so every switch fully repaints the same rectangle and row length is
   frame-invariant. Trimming to content is only safe if an EL follows; keep the invariant "one frame switch =
   full repaint or explicit erase of the whole sprite rectangle".

Together: trailing-space trimming may stay for byte economy, but only when each row is terminated by `\x1b[K`
and the sprite geometry (origin + width) is pinned across frames.

---

## 3. Frame data drift (tail2)

### What the digest report says

The hand-ported `tail2` frame mismatches the source art: 23 differing cells, all in the upper-right
spout/tail-tip area — a 1-column left shift of the `D` cluster (row 2: D at col 26 vs source col 27),
extra `D`s, and the upper-right cluster shifted 1 column left throughout rows 4–6. This is the misplaced
tail tip the user sees (symptom-log point 3). All other 20 frames digest OK.

### Why the existing regression missed it

The regression was **excerpt-based and added for a different frame** — it pinned only a selected excerpt of a
selected frame, so `tail2` (hand-copied during conversion, not covered by the excerpt) had no coverage.
Excerpt checks verify the renderer; they do not verify the frame data itself.

### Gate that prevents recurrence

Pin **every** frame with a full-content digest: sha256 over each frame's complete 25 rows, committed as
canonical expected digests (exactly what frames-digest-report.txt computes) and verified in CI for all frames,
not excerpts. Any hand-edit or bad port of any frame fails the gate at commit time. Complement: port frames
mechanically (generator/converter from source art) instead of hand-copying, with the digest gate as the
safety net for the mechanical step.

---

## 4. The CI hang (finished but never exits)

### Mechanism

The animation feature's planner reschedules a `setTimeout` for the next tick **for as long as its component
stays mounted** — each firing arms the next timer. These live `Timeout` handles **pin the Node.js event
loop**: the process cannot exit while a handle is pending. The channel-ui CI hosts mount the header component
(containing the planner) and **finish without unmounting it**, so the timer chain never stops. All scene
checks PASS, no test is running, no assertion is pending — the job is logically done but the event loop is
held open by the self-re-arming timeouts, until the runner kills it at the timeout (3 min normally; one
observed 19 min of idle). The hang appeared exactly in the push flipping the animation default from off to on.

### Why the interactive terminal is unaffected

The interactive terminal process is intentionally long-lived — it is kept alive by its TTY/stdin handles
regardless of the timer chain, and its lifecycle properly spans the session. The extra pinned timer handles
change nothing observable there; only short-lived processes (CI hosts) that expect the loop to drain when
work "finishes" are bitten.

### One-line fix

Unref the rescheduling timer in the planner so it never pins the loop:

```ts
setTimeout(tick, interval).unref()
```

The animation still runs while the host lives, but a finished host exits even if it forgot to unmount.
(Complementary hygiene: hosts/tests unmount the header component in teardown — `afterEach`/`afterAll` —
but `unref()` is the one-line fix that makes the hang structurally impossible.)

---

## 5. Prevention

### Renderer contract checklist (ship with any half-block sprite implementation)

1. **Complete pens per cell**: every emitted cell sets both fg and bg explicitly; the empty half of a
   half-filled cell gets the default pen (`49`/`39`), never inherited SGR state. No SGR attribute may
   depend on what an earlier cell emitted.
2. **Statelessness**: a cell's rendering must be a pure function of its two pixels; `current`-style
   sequence dedup is a byte optimization only and must not change rendered colors.
3. **Erase semantics on frame switch**: every row ends with `\x1b[K` (or the sprite rectangle is fully
   repainted at a fixed canvas width); trailing-blank trimming is allowed only behind an explicit erase.
4. **Frame-invariant geometry**: origin column/row and canvas width are fixed across frames of one sprite;
   narrower frames must still clear the wider frames' columns.
5. **Frame data integrity**: sha256 digests of every frame's full rows are committed and verified in CI;
   frames are ported mechanically, never hand-copied without the digest gate.
6. **Timer hygiene**: any animation timer is `.unref()`-ed (or owned by a disposable component) so it can
   never pin a host's event loop; every mount site has a matching unmount in teardown.

### Audit before flipping an animation feature default-on

1. **Inventory every host** that mounts the animated component (interactive product, CI scene hosts, preview
   harnesses, screenshots) and check each one's teardown: does anything finish without unmounting? Any timer,
   interval, or listener that outlives the host?
2. **Event-loop accounting**: run each affected CI job and confirm it exits on its own (no live `Timeout`
   handles at idle) — not just that tests pass.
3. **Visual diff across the animation cycle**: capture every frame (or a digest thereof) and diff against
   source art — phantom-edge and ghost-column artifacts are per-frame-pair phenomena; test at least one
   wide→narrow transition, not just single stills.
4. **Edge audit of the sprite**: cells where exactly one of the stacked pixels is opaque (outlines, glyphs
   like Z and the heart) are where SGR leakage shows; assert their empty halves render the default background.
5. **Digest gate green for all frames** before the flip, and the regression covers frames, not excerpts.
6. **Confirm blast radius of the default change**: which environments get the feature implicitly, and which
   of them have different process-lifecycle expectations (short-lived CI vs long-lived TTY).

---

## Summary of root causes and fixes

| Symptom | Root cause | Fix |
|---|---|---|
| Phantom pixels at right edges | bg SGR persists across cells; half-filled cells set only fg, so the empty half inherits a stale bg | Emit complete pens: `fg(x) + \x1b[49m` for half-filled cells |
| Ghost pixels after wide→narrow switch | Trailing spaces trimmed per row; nothing erases columns beyond the new row length | `\x1b[K` per row + fixed canvas width / full-rectangle repaint |
| tail2 drift (23 cells, 1-col shift) | Hand-copied frame; excerpt regression only covered a different frame | Full-frame sha256 digest gate in CI for every frame; mechanical porting |
| CI hang (PASS then idle) | Planner re-arms `setTimeout` while mounted; hosts finish without unmounting → timer chain pins the event loop | `.unref()` the timer (one line); unmount in host teardown |
