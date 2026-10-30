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
#### FILE: S18-terminal-sprite-render-trap/S18-terminal-sprite-render-trap.md

# S18 · The Terminal Sprite Render Trap — Root-Cause Report

**Scope:** read-only analysis of the evidence pack in
`fixture/` (`renderer-excerpt.ts`, `symptom-log.txt`, `frames-digest-report.txt`,
`ci-hang-evidence.txt`). The fixture was never modified or executed; every claim below is
either quoted from those files or verified with a throw-away re-implementation of the shipped
cell loop (see Appendix — script deleted after the run).

**The one-sentence story:** three of the four defects are the same bug in three different
scopes — *state that outlives its scope*. SGR color state outlives a cell (phantom pixels),
painted cells outlive a frame (ghost pixels), and a timer outlives its component's mount (the
CI hang). The fourth defect is frame data that was hand-ported without a full-frame digest
gate (tail2 drift).

---

## 1. Phantom pixels — a persistent SGR background leaks into the EMPTY half of a half-filled cell

### 1.1 How the technique is supposed to work

Each terminal cell packs two vertical sprite pixels into one glyph
(`renderer-excerpt.ts:1-4`):

| sprite pixels | glyph | foreground | background |
|---|---|---|---|
| upper + lower both opaque | `▀` (U+2580) | upper pixel | lower pixel |
| upper opaque, lower transparent | `▀` | upper pixel | **default background** |
| lower opaque, upper transparent | `▄` (U+2584) | lower pixel | **default background** |
| both transparent | space | — | default background |

The whole technique rests on one rule: **every glyph must carry a complete color state.**
A half-block glyph paints *both* halves of the cell — the ink half with the foreground, the
other half with the background. If either color is left unset, the terminal keeps whatever
that attribute was set to previously.

### 1.2 The exact mechanism

SGR state is *persistent*: once `\x1b[48;2;r;g;bm` (24-bit background) is emitted, it stays
in effect for every following cell until another background is set or a reset arrives. The
shipped renderer exploits this for caching (lines 35-38 suppress re-emitting an identical
sequence) but then breaks the invariant in two branches:

* **`up`-only branch (lines 25-27):** `seq = fg(up)` — sets the foreground, says **nothing
  about the background**. The glyph is `▀`, so the upper half is correct, but the *lower
  (empty) half* is painted with the background color left over from the previous cell —
  typically the dark outline color of the cell just to the left.
* **`lo`-only branch (lines 28-30):** `seq = fg(lo)` with glyph `▄` — the mirror-image bug:
  the *upper (empty) half* inherits the stale background.

The `current` diff cache (line 35) makes this worse, not better: because the cached sequence
never contained a background for these branches, the renderer *believes* the cell is fully
specified and suppresses any state emission for following cells with the same (incomplete)
sequence.

### 1.3 Which cells expose it

Exactly the **boundary cells where one half of the pair is opaque and the other is `.`** —
i.e. the columns where the sprite's opaque pixels stop mid-cell. At the whale's right edges
that is a single 1-cell-wide column:

* the last column of the dark outline where the lower pixel row is already transparent
  (upper pixel opaque) → phantom sliver *below* the outline's right edge;
* the last column of the sleep-Z symbols and of the heart glyph, same shape;
* symmetric `▄` cells (upper pixel transparent, lower opaque) leak a phantom into the upper
  half wherever the art is cut that way.

This matches `symptom-log.txt:3-6` exactly: *"a 1-cell-wide column of dim colored noise
  directly to the right of the dark outline cells, next to the sleep-Z symbols, and to the
  right of the heart glyph … frame rows end in '.' at those columns."* The phantom is not in
  any frame's data — it is the previous cell's background color bleeding through the empty
  half of the boundary cell. It moves with the animation because the leaking source (the
  outline cell to its left) moves with the animation. The per-row trailing `RESET`
(line 42) keeps the leak from crossing row boundaries, which is why it stays a tidy
1-cell-wide column instead of smearing downward.

### 1.4 The precise escape fix

Make **every emitted sequence complete** — pair each foreground with an explicit background,
using `\x1b[49m` ("default background") for a transparent half:

```ts
if (up !== undefined && lo !== undefined) {
  seq = fg(up) + bg(lo);                 ch = '▀'   // both halves explicit
} else if (up !== undefined) {
  seq = fg(up) + '\x1b[49m';             ch = '▀'   // <-- was: fg(up) only
} else if (lo !== undefined) {
  seq = fg(lo) + '\x1b[49m';             ch = '▄'   // <-- was: fg(lo) only
} else {
  seq = RESET;                           ch = ' '
}
```

`\x1b[49m` is the SGR "default background" selector — it restores the terminal's own
background for the transparent half without needing to know what that color is. With this
change the `current` diff cache becomes sound again (identical *complete* sequences may be
suppressed; incomplete ones can no longer exist).

**Verified** (re-implemented cell loop, 5-column right edge: cols 0-1 dark outline, col 2
upper pixel `W` + lower pixel `.`, cols 3-4 transparent):

```
shipped: <ESC>[38;2;40;40;40m<ESC>[48;2;40;40;40m▀▀<ESC>[38;2;240;240;240m▀<ESC>[0m
  cell 2: ▀ fg=rgb(240,240,240) bg=rgb(40,40,40)   <-- bg never set for this cell, leaked
fixed:   <ESC>[38;2;40;40;40m<ESC>[48;2;40;40;40m▀▀<ESC>[38;2;240;240;240m<ESC>[49m▀ ...
  cell 2: ▀ fg=rgb(240,240,240) bg=default         <-- no phantom
```

---

## 2. Ghost frames — trimmed rows meet a whitespace-stripping pipeline

### 2.1 What the renderer drops from each row

Line 41: `let row = out.replace(/[ ]+$/, '')` — the renderer **right-trims every trailing
space cell** from the assembled row. A row whose sprite content ends at column 20 of the
40-column box is emitted as a 21-cell string; columns 21-39 are never written at all. (Line
42 then appends a trailing `RESET` if the trim didn't already leave one.) The renderer's
contract silently changed from "paint the sprite box" to "paint up to the last opaque
pixel" — which is only safe if something else guarantees the rest of the box is clean.

### 2.2 What the text pipeline does to trailing whitespace

The layer that feeds these row strings into the terminal strips/normalizes **trailing
whitespace** on every line (the same trim the renderer does, applied again downstream). So
even a renderer that padded rows back out to the full box width with spaces would have that
padding **removed before it reaches the screen**. Consequence: *trailing spaces can never
clear a stale cell.* Only a non-whitespace, terminal-executed erase can.

### 2.3 Why the wide → narrow switch leaves ghosts

The wide pose's rows reach further right, so they paint more cells. When the animation
switches to a narrower pose:

1. the narrow row string is shorter — it simply never addresses the columns beyond its last
   opaque cell (renderer trim), and
2. even if it did address them, the pipeline would strip the padding spaces away,
3. and nothing ever issues an erase for those columns.

The terminal therefore keeps displaying the wide tail's cells at their old positions: the
narrow frame renders fine *and* the surplus columns keep showing the previous frame — exactly
`symptom-log.txt:8-11`.

### 2.4 The two-part fix that guarantees a clean frame switch

* **Part A — never trim; paint the whole box.** Treat the sprite's cell area as a
  fixed-size box (13 rows × 40 cols here). Every frame emits **every cell of the box**, padding
  the tail with space cells that carry an explicit default background (`\x1b[49m` + space, or
  spaces following a `RESET`). A frame can then never leave a box cell unaddressed.
* **Part B — erase explicitly, because the pipeline eats whitespace.** End each painted row
  with an erase-to-end-of-line (`\x1b[K`, EL), or clear the whole box (`\x1b[H\x1b[2J` /
  per-row `\x1b[2K`) before drawing the frame. `\x1b[K` is an escape *command*, not
  whitespace, so it survives the pipeline and the terminal itself blanks everything past the
  painted content.

Together: every cell inside the box is either explicitly painted this frame or explicitly
erased this frame — a wide→narrow switch cannot leave a survivor, regardless of what the
pipeline trims. (Part A alone is defeated by the pipeline's trailing-whitespace strip; Part B
alone is defeated by any renderer change that paints past the erase point. You need both.)

**Verified** (wide 7-cell row, then narrow 3-cell row, onto one terminal line):

```
shipped: after WIDE   -> 0:▀ 1:▀ 2:▀ 3:▀ 4:▀ 5:▀ 6:▀
         after NARROW -> 0:▀ 1:▀ 2:▀ 3:▀ 4:▀ 5:▀ 6:▀   (cells 3-6 = ghost tail)
fixed:   after WIDE   -> 0:▀ 1:▀ 2:▀ 3:▀ 4:▀ 5:▀ 6:▀
         after NARROW -> 0:▀ 1:▀ 2:▀ 3:' ' 4:' ' 5:' ' 6:' '   (clean switch)
```

---

## 3. Frame data drift — the hand-ported `tail2`

### 3.1 What the digest report says

`frames-digest-report.txt` hashes each frame's full 25 rows (sha256) and compares against the
source-art frames the sprite was ported from. Every frame is `OK` except:

* **`tail2` — MISMATCH, 23 differing cells, all in the upper-right spout/tail-tip area:**
  * row 2: `D` at col 26 in the port vs col 27 in the source (a 1-column left shift);
  * row 3: an extra `D` at col 25, the `DBD` cluster at cols 26-28 shifted 1 left, plus two
    extra `DD` pixels at cols 36-37;
  * rows 4-6: the upper-right cluster shifted 1 column left throughout.

That is the user-visible *"misplaced tail tip: a 6-pixel cluster drawn at the wrong
position"* (`symptom-log.txt:13-14`). Cause per the report: *"The ported tail2 was
hand-copied during conversion."*

### 3.2 Why the existing per-excerpt regression missed it

The regression that existed was **excerpt-based and was added later for a different frame**
(`frames-digest-report.txt:14-15`). Two independent holes:

1. **Coverage:** it never covered `tail2` at all — the drift sat in a frame no test looked at;
2. **Granularity:** an excerpt only compares a slice of a frame, so even for the frame it did
   cover, any drift outside the excerpted region (like this upper-right cluster) would pass
   unnoticed.

An excerpt test proves "this corner of this frame didn't change"; it cannot prove "this frame
matches the source art".

### 3.3 The gate that prevents recurrence

A **full-frame, all-frames digest gate in CI**:

1. For every frame in the shipping set, compute sha256 over the **complete frame** — all 25
   rows × all 40 columns, no excerpting, no sampling;
2. Pin those digests against digests of the **source art** (computed once, at conversion
   time, from the art itself);
3. CI fails the build on **any** mismatch, for **any** frame — including newly added frames,
   which must be pinned before they can ship;
4. Regression tests cover **every frame in full** (a table-driven test over the whole frame
   set), never an excerpt.

Better still, remove the failure mode at the source: **generate the ported frames from the
source art programmatically** instead of hand-copying, and treat the digest gate as the
backstop for the cases where hand-porting is unavoidable.

---

## 4. The hang — a self-rescheduling timer pins the event loop

### 4.1 The mechanism

From `ci-hang-evidence.txt`:

* The job **passes every scene check**, then sits idle and never exits; it is killed at the
  runner timeout (a job that used to finish in ~3 minutes; one observation recorded 19
  minutes of idle before a manual kill).
* At kill time: **no running test, no pending assertion** — but the event loop holds live
  handles of kind **`Timeout`, one per tick of the sprite animation planner, each re-arming
  the next**.

That is a **self-rescheduling `setTimeout` chain**: the planner's tick callback schedules the
next tick before it returns (tick → `setTimeout(tick, dt)` → tick → …). In Node/libuv a
pending `setTimeout` is a **ref'd handle**: while at least one timer is armed, the event loop
has work and **the process cannot exit**. The chain is infinite by construction, so the loop
never drains. The job is *finished* (all assertions passed) but the *process* cannot exit —
"finished but hanging".

### 4.2 Which hosts mount without unmounting

The `channel-ui` CI hosts: they **mount the header component (which starts the planner) and
finish the scene checks WITHOUT unmounting it**. Because the component is never unmounted, the
planner's cleanup (the `clearTimeout` in its teardown path) never runs, so nothing ever
breaks the chain. The hang appeared in the same push that flipped the animation feature's
default from off to on — before the flip, no host ever mounted the planner, so no chain
existed.

### 4.3 Why the interactive terminal is unaffected

The TTY product's process is **kept alive by its stdin/TTY handles regardless of the timer
chain** — an interactive terminal waits for user input forever and was never going to exit on
its own. Adding a ref'd timer chain changes nothing about its lifetime. The bug only manifests
in hosts whose lifetime is *supposed* to end when their work ends (test/CI processes): there,
the timer chain is the only thing keeping the loop alive.

### 4.4 The one-line fix

**Unref the timer so it can never pin the event loop:**

```ts
const t = setTimeout(tick, DT);
t.unref();          // one line: a pending unref'd Timeout no longer keeps the process alive
```

(`unref()` every time the chain re-arms — it is a property of the handle, not a one-time
setting.) Defense in depth on top of it: the component should still `clearTimeout` on unmount
so the planner stops burning CPU in long-lived hosts — but the *hang* is fixed by the unref,
because an unref'd timer lets the event loop drain and the process exit once the real work is
done.

---

## 5. Prevention

### 5.1 Renderer contract checklist (ship this with every terminal sprite implementation)

1. **Complete SGR per cell.** Every emitted cell sequence sets *both* foreground and
   background explicitly, or emits an explicit default-background reset (`\x1b[49m`). No cell
   ever inherits a color attribute from a neighbor. Transparent pixel → explicit default
   background, never "leave whatever was set".
2. **Fixed half-block mapping, enforced.** `▀` = fg upper / bg lower; `▄` = fg lower / bg
   upper. Never emit a half-block with only one color set (this alone kills phantom pixels).
3. **Row-scoped state.** Each row starts from a known state and ends with `RESET`; no SGR
   state may leak across rows.
4. **Fixed-size box.** The sprite's cell box (rows × cols) is a constant; every frame
   addresses **every cell of the box**. Rows are never right-trimmed.
5. **Explicit erase semantics.** End each row with EL (`\x1b[K`) or clear the box before
   drawing. Never rely on trailing spaces to clear cells — the text pipeline strips trailing
   whitespace.
6. **Padding cells carry explicit default background** (`\x1b[49m` + space, or post-`RESET`
   spaces), so padding is visually inert and survives trimming as a no-op.
7. **Column loop bounded by the sprite's column count** (or `max(upper.length, lower.length)`),
   never by the upper row's length alone — the shipped `x < upper.length`
   (`renderer-excerpt.ts:17`) silently drops lower-row pixels when rows differ in length.
8. **Frame-data integrity gate.** Every frame pinned by a whole-frame sha256 (all rows × all
   columns) against the source art; CI fails on any mismatch; the regression covers **all
   frames in full** — never an excerpt.
9. **Port programmatically.** Derive ported frames from the source art by script; hand-porting
   is an exception that must go through the digest gate.
10. **No pinned timers in renderable components.** Animation timers are `unref()`'d *and*
    cleared on unmount; components must clean up after themselves in hosts that do unmount.
11. **Golden-cell tests through the real pipeline.** Render frames into a cell buffer via the
    actual text pipeline (not the renderer's return value) and diff cell-by-cell — this is the
    only test that catches both SGR leaks and ghost cells, because it sees what the terminal
    would see.
12. **Frame-switch test.** Render every adjacent frame pair — and explicitly the widest →
    narrowest pair — into one buffer and assert zero stale cells.

### 5.2 The audit to run BEFORE flipping an animation feature default-on

1. **Digest audit:** hash every shipping frame in full (25 × 40) against the source art; 100%
   must match; no excerpt sampling. Add the pin for any frame not yet covered.
2. **SGR completeness audit:** scan the emitted escape stream and assert every cell sequence
   fully specifies fg and bg; run the golden-cell diff (item 11 above) end-to-end through the
   real pipeline, including transparent-half boundary cells at every sprite edge.
3. **Ghost/frame-switch audit:** render all adjacent frame pairs plus widest→narrowest into one
   buffer; assert no cell survives from the previous frame.
4. **Erase-semantics audit:** verify what the pipeline does to trailing whitespace, and prove
   the renderer's clearing (EL / full-box painting) survives it — test through the pipeline,
   not against the renderer's return value.
5. **Timer/lifecycle audit:** in a headless host, mount the component and finish *without*
   unmounting; assert the process exits (all timers unref'd / no live `Timeout` handles after
   the work is done). Separately confirm the interactive TTY path still behaves.
6. **Flip discipline:** land the flag default change as its own reviewed commit, run the full
   suite (digests + golden cells + ghost pairs + process-exit) on it, and only then flip
   default-on — with the flag still available as an immediate kill switch.

The common thread of all four defects — state outliving its scope — is exactly what items
1-3 and 10 of the contract, and items 2-5 of the audit, exist to enforce: *every piece of
renderer/planner state must have an explicit, tested end-of-life* (per cell, per frame, per
mount).

---

## Appendix — method & hygiene

* Evidence read (read-only, unchanged): `fixture/renderer-excerpt.ts` (46 lines),
  `fixture/symptom-log.txt`, `fixture/frames-digest-report.txt`,
  `fixture/ci-hang-evidence.txt`, `fixture/README.md`.
* The fixture was never executed or modified. All verification used a throw-away
  re-implementation of the shipped cell loop plus a tiny SGR-state-machine "terminal" written
  to `agent-output/S18-terminal-sprite-render-trap/temp-sim.js`, run once with `node`, and
  deleted afterwards. No migrations, installs, network access, or writes outside the
  designated output directory.


## Required output (JSON only)
{"decisions":[{"id":"<criterion-id>","verdict":"pass|partial|fail|missing","reason":"short"}],"caps":[{"id":"<cap-id>","triggered":false,"reason":"short"}]}
Every criterion and cap exactly once. pass=full points, partial=half, fail/missing=0; a triggered cap caps the total.