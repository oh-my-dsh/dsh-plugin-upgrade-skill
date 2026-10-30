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
#### FILE: S18-terminal-sprite-render-trap/report.md

# S18 · The Terminal Sprite Render Trap — Diagnosis & Fix Report

## 1. Phantom pixels (empty half of a half-filled cell bleeds stale color)

**Half-block geometry.** Each terminal cell packs two vertical pixels into one glyph:
- `▀` (UPPER HALF BLOCK): **upper half = foreground**, **lower half = background**.
- `▄` (LOWER HALF BLOCK): **lower half = foreground**, **upper half = background**.

**What the renderer actually emits.** `renderSpriteRows` only writes a **background** SGR
(`\x1b[48;2;r;g;bm`) in the *both-pixels* branch (`fg(up)+bg(lo)`). The two half-filled
branches emit **foreground only** and rely on the ambient background:

- upper-only → `seq = fg(up)`, glyph `▀` → the empty **lower** half is whatever background is active;
- lower-only → `seq = fg(lo)`, glyph `▄` → the empty **upper** half is whatever background is active.

**Which SGR state persists.** SGR attributes are *sticky*: a `48;2;…` background, once emitted,
keeps applying to every following cell until a `\x1b[0m` (RESET), a new `48;2;…`, or
`\x1b[49m` (default background) intervenes. The renderer's `current` tracker only re-emits a
`seq` when the *whole string* changes, and neither half-filled branch includes a background — so
the previously set **background** is never cleared when the next cell is half-filled.

**Which cells expose it.** A filled cell sets the background; the half-filled cell immediately to its
right paints only one pixel and leaves its empty half to that persisted background. In the whale:
the dark outline is a full vertical stroke (both pixels → sets `bg(dark)`); the edge cell hugging
its right is upper-only (lower pixel = `.` transparent). That edge cell's empty lower half therefore
renders in the *stale dark background*, producing a 1-cell-wide column of dim color to the right of
the outline. The same occurs beside the sleep-Z glyphs and the heart — their filled cells set a
background that bleeds into the empty half of the adjacent half-filled edge cell. The artifacts are
*not* in the frame data because the empty half really is `.`; they move with the animation because
the fill cell and its exposed edge cell move together.

**Precise escape fix.** Give the empty half an explicit background instead of inheriting ambient
state. Make the half-filled branches emit a background for the empty half:

- upper-only → `fg(up) + bg(clear)` + `▀` (equivalently `fg(up) + "\x1b[49m"` + `▀`), and
- lower-only → `fg(lo) + bg(clear)` + `▄`,

where `clear` is the canvas/terminal default background. More robustly, track **foreground** and
**background as independent state**, emitting either whenever it changes, and treat the transparent
pixel (`.`) as an explicit "canvas background" color that is always written. This guarantees no
cell's empty half ever inherits a stale SGR background.

## 2. Ghost frames (previous frame's wide columns survive a narrower frame)

**Why the surplus columns persist.** On a switch from a WIDE pose (tail swung out, rows reaching
further right) to a NARROWER pose, the new frame's rows are shorter. The previous frame's tail cells
live in columns the new frame no longer writes, and nothing erases them, so the old tail stays on
screen.

**What the renderer drops from each row.** `renderSpriteRows` runs `out.replace(/[ ]+$/,'')`,
stripping the trailing transparent cells (spaces) from every row. So a narrower row carries no blank
glyphs at all for the columns it has given up.

**What the text pipeline does to trailing whitespace.** The display/write path prints each row's
(already-trimmed) string at the sprite origin and does **not** clear to end-of-line — it emits no
trailing spaces and no `\x1b[K` (EL). The terminal therefore retains whatever glyphs were in the
cells beyond the new row's rightmost non-space, i.e. the previous wide frame's tail.

**Two-part fix (both required for a clean switch):**
1. *Renderer* — never trim to zero width. Emit the **full fixed canvas width** for every row,
   padding transparent cells as explicit spaces (a space under RESET) so each row overwrites the
   entire sprite width on every frame.
2. *Text pipeline* — after writing each row, append `\x1b[K` (erase to end of line), or clear the
   whole sprite region once before repainting, so any residual columns left by a previously wider
   frame are guaranteed blanked.

## 3. Frame data drift (hand-ported tail2 is shifted)

**What the digest report says.** Of all frames, only **tail2** is a MISMATCH against the source art:
the ported frame's upper-right spout/tail-tip cluster is shifted **1 column left** (source `D` at
col 27 is drawn at col 26; row 3 gains a stray `D` at col 25 and two extra `DD` at cols 36-37;
rows 4-6 shifted left throughout) — 23 differing cells, all in that one region. This is the
"misplaced tail tip" the user sees.

**Why the existing regression missed it.** The only regression was **excerpt-based** (it compared a
small sub-region, and it was added later for a *different* frame). It never covered tail2's
upper-right spout/tail-tip area, so a 1-column drift confined to that region passed untouched.

**The gate that prevents recurrence.** Replace excerpt checks with a **whole-frame digest pin**: hash
each frame's full 25 rows (e.g. sha256 per frame) and compare against the golden source-art digests
already in `frames-digest-report.txt`. A full-frame digest fails on any diff anywhere in the frame,
so a hand-ported drift in an uncovered corner can no longer slip through. (Optionally also pin
per-cell/per-region content for a precise failure location, but the full-frame digest is the gate.)

## 4. The hang (timer pins the event loop after the job "finishes")

**Mechanism that keeps the finished job alive.** The sprite animation planner drives each tick with a
**self-rescheduling `setTimeout`**: the callback re-arms the next tick for as long as its component
is mounted. A *ref'd* timer is a live handle, and Node keeps the process alive while any ref'd handle
exists. Because the header component is mounted and **never unmounted** in these hosts, the timer
chain re-arms forever, the event loop always has a pending `Timeout` handle, and the process never
exits — even though every scene check has already printed PASS. The job then sits idle until the
runner's timeout kills it (one observation: ~19 minutes idle).

**What reschedules forever.** The animation planner's tick `setTimeout` re-arming the next tick.

**Which hosts mount without unmounting.** The channel-ui group's test hosts that mount the **header
component** and finish without unmounting it.

**Why the interactive terminal is unaffected.** That process is already kept alive by its own
TTY/stdin (readline) handles, so the timer chain is irrelevant to its liveness — it would not exit
anyway. The bug only surfaces in headless CI hosts whose only remaining handles are the animation
timers.

**The one-line fix.** Make the animation tick non-ref'd so it never holds the process open:
`setTimeout(nextTick, delay).unref()` (one line). (The more complete fix is clearing the timer in
the component's unmount/effect-cleanup, but `.unref()` is the single-line change that guarantees a
clean process exit.)

## 5. Prevention

### Renderer contract a terminal sprite implementation should ship with

1. **SGR self-sufficiency** — every emitted cell fully specifies foreground *and* background; never
   rely on ambient SGR state. "Transparent" is an explicit color (canvas background), always written.
2. **Independent fg/bg tracking** — emit foreground and background separately whenever either
   changes; clear the empty half of any half-filled cell.
3. **Row termination** — every row ends in `\x1b[0m` so no attribute leaks across rows.
4. **Fixed canvas + erase semantics** — a fixed cell width/height; every frame paints the full extent
   (pad short rows with spaces); erase-to-end-of-line (`\x1b[K`) or a full-region clear on each
   repaint so narrower frames leave no ghost columns.
5. **Palette/transparency contract** — `.` ⇒ transparent ⇒ canvas background; unknown palette chars
   handled without leaving SGR state dirty.
6. **Event-loop contract** — any self-rescheduling animation timer must `.unref()` (and be cleared
   on unmount) so it never pins the process.
7. **Frame integrity** — pin a whole-frame digest (sha256 of the 25 rows) per frame against the
   source art, not excerpts.
8. **Determinism** — identical frame input ⇒ identical byte output (pure function, no hidden state).

### Audit to run BEFORE flipping an animation feature default-on

1. **Clean-exit smoke test** — after the scene checks pass, assert the process actually exits; watch
   for residual live handles (e.g. assert no ref'd timers remain).
2. **Host mount/unmount review** — enumerate every host that mounts the animated component and confirm
   each either unmounts it or the timer is `.unref()`-ed.
3. **Full frame-digest regression in CI** — all frames (including hand-ported ones) match golden
   digests; any drift fails the gate.
4. **Right-edge visual sweep** — snapshot/golden-image the sprite's right edge columns (outline, Z,
   heart) and diff against the source art to catch phantom/ghost half-pixels.
5. **Frame-switch cycle test** — drive wide→narrow→wide poses and assert no residual columns remain.
6. **SGR-hygiene snapshot** — capture the emitted escape bytes and verify no cell depends on persisted
   background state.
7. **Time-budget check** — confirm the CI job still finishes within its historical time (e.g. ~3 min),
   with no idle tail before the runner timeout.
8. **Canary rollout** — enable the feature on a subset first and watch for hang/timeout regressions
   before flipping the global default.

---

*All conclusions are derived solely from the four evidence files under the fixture directory.*


## Required output (JSON only)
{"decisions":[{"id":"<criterion-id>","verdict":"pass|partial|fail|missing","reason":"short"}],"caps":[{"id":"<cap-id>","triggered":false,"reason":"short"}]}
Every criterion and cap exactly once. pass=full points, partial=half, fail/missing=0; a triggered cap caps the total.