# JUDGE BRIEF · skill.S18-terminal-sprite-render-trap

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

# S18 · The Terminal Sprite Render Trap — root causes, fixes, and gates

**Scope.** Read-only analysis of the evidence pack (renderer excerpt, symptom log, frame digest
report, CI hang evidence) plus local reproductions written only under `agent-output/`.
`fixture/` was read, never written; no installs, no network, no repository commands were run.

**Verdict in one line.** All four symptoms are independent defects in one 46-line renderer plus the
hosts that embed it: (1) an SGR *background* left over from the previous cell paints the empty half
of the cell; (2) the renderer truncates rows and never erases, so a wider frame's surplus columns
survive; (3) one hand-ported frame (`tail2`) drifted off the source art and the excerpt-based
regression never looked at it; (4) the animation planner re-arms a *ref'd* `setTimeout` forever,
which keeps an otherwise-finished Node process alive, and only hosts that mount the header and never
unmount it are exposed.

| # | Symptom | Root cause | Fix | Gate |
|---|---|---|---|---|
| 1 | Phantom pixels at right edges | Upper-only (`▀`) / lower-only (`▄`) branches emit a foreground escape only; the previous cell's `48;2;…m` background stays active and paints the transparent half | Emit `\x1b[49m` (default background) inside the one-sided `seq` | Cell-level state-completeness check; render one row through a terminal emulator and compare both pixel slots against frame data |
| 2 | Ghost pixels after WIDE→NARROW | `out.replace(/[ ]+$/,'')` drops trailing transparent cells; downstream text trimming drops padded spaces; nothing ever erases to end of line | (a) fixed-width, trim-free rows; (b) explicit `\x1b[0K` per row before the reset | Full-frame dimension invariant + right-edge visual snapshot; render WIDE then NARROW in an emulator and assert zero non-frame pixels |
| 3 | `tail2` tail-tip drift | Hand transcription during the port, 1 column left, 23 cells | Correct the 23 cells against the source art | Per-frame full-grid sha256 manifest, enforced for every frame |
| 4 | CI job "finished but hanging" | Planner re-arms `setTimeout` for the lifetime of a component that is never unmounted; each pending timer is a ref'd handle | `t.unref()` on the scheduled timer | Headless host must exit on its own within a hard deadline; no unref'd/uncancelled timers in render paths |

---

## 1. Phantom pixels — the exact mechanism

### 1.1 The model the code implements

One terminal cell carries two vertical pixels: `▀` (U+2580, upper half) draws the
**foreground** in the upper half and the **background** in the lower half; `▄` (U+2584) draws
the foreground in the lower half and the **background** in the upper half. Therefore, in *both*
half-block glyphs, the pixel the renderer is not currently setting belongs to the **background SGR
channel**. A cell is only visually complete if its sequence either sets both channels or explicitly
restores the untouched one to "default".

The shipped code passes one `seq` string per cell and remembers the last one in `current`:

```ts
if (up !== undefined && lo !== undefined) { seq = fg(up) + bg(lo); ch = '▀' }
else if (up !== undefined)                { seq = fg(up);           ch = '▀' }   // ← no background reset
else if (lo !== undefined)                { seq = fg(lo);           ch = '▄' }   // ← no background reset
else                                      { seq = '';              ch = ' ' }   // ← RESET, safe
```

`fg()` is `\x1b[38;2;r;g;bm`, `bg()` is `\x1b[48;2;r;g;bm`.

### 1.2 Which SGR state persists, and why

Within one row string, SGR state is *cumulative*: an escape changes one attribute and leaves the rest
alone. The `fg(up)`-only branch never emits `48;…` and never emits `49m`, so the most recent
`bg(lo)` emitted earlier in the same row is still in force when the `▀` glyph is drawn. The
lower half of that glyph is therefore filled with the *previous* cell's lower-pixel colour.

Two details hide this from review:

* `current` is compared against the whole `seq` string, and `fg(up)` can never equal a
  previous `fg(up)+bg(lo)`, so the branch always takes the `if (seq !== current)` path and always
  emits something. The code *looks* like it flushes its state on every transition; what it flushes is
  only the foreground.
* Rows end with `RESET` (`if (!row.endsWith(RESET)) row += RESET`), so nothing leaks into the
  next row. The corruption is strictly *inside* a row, between two adjacent cells — the smallest
  possible blast radius, and the one nobody diffs.

Concretely, the stale background is the `bg(lo)` of the **last cell in that row that had both
halves opaque** (an all-transparent cell emits `RESET` and clears it, which is why the artefact
never becomes a full column).

### 1.3 Which cells expose it

A cell shows a phantom pixel exactly when:

1. it is drawn as a half-block glyph, i.e. **exactly one** of its two frame pixels is a palette
   character and the other is `'.'` (transparent), and
2. it is preceded, in the same row, by a cell whose two halves were both opaque (so a background was
   set and never cleared), and
3. the glyph survives the trailing-space trim — always true, because the glyph is `▀`/`▄`, not a space.

At the sprite's right edge, condition 1 is structural: the shape's silhouette ends at a different
column on the upper and lower scanline of a cell pair. The three reported shapes are precisely the
three cases in the art:

* **Dark outline, upper scanline longer** → last outline cell is `▀` with lower `'.'` → its lower
  half is painted with the *outline colour* of the neighbour (`#12121a`), which is why the log
  describes the column as "dim coloured noise";
* **sleep-Z, lower scanline longer** → `▄` cells whose *upper* half is transparent → the upper half
  is painted with the stale background (white in the Z's stroke neighbourhood);
* **heart, upper lobe wider** → `▀` with lower `'.'` → half a cell of pink below the lobe.

The colour tracks the animation frame because the stale background is a *neighbouring cell's* colour:
when the tail swings, the neighbour's lower pixel changes and the phantom changes with it. That is
also why the artefact moves with the animation while the frame data is clean (rows genuinely end in
`'.'` at those columns, as the symptom log states).

### 1.4 The precise escape fix

Restore the *background* channel (the one that owns the empty half) as part of the cell's own
sequence, before the glyph is emitted:

```ts
const BGDEF = '\x1b[49m'                       // SGR 49 = default background

if (up !== undefined && lo !== undefined) { seq = fg(up) + bg(lo); ch = '▀' }
else if (up !== undefined)                { seq = BGDEF + fg(up);  ch = '▀' }
else if (lo !== undefined)                { seq = BGDEF + fg(lo);  ch = '▄' }
else                                      { seq = '';             ch = ' ' }   // RESET on change, as before
```

Notes that matter:

* `49m` is the correct channel for **both** one-sided branches: for `▀` the empty half is the
  background (lower), for `▄` the empty half is also the background (upper). `39m` would fix
  nothing here — the foreground is already being overwritten on every branch.
* Keep the `current` cache keyed on the full `seq`; with `49m` inside the string, a background change
  now also changes the key, so the delta optimisation stays correct instead of merely looking correct.
* A post-hoc reset at end of row cannot fix this: the phantom is committed to the grid at the moment
  the glyph is written; a later `RESET` only affects cells drawn afterwards.
* Equivalent, more audit-friendly variant: emit a *complete* state for every cell
  (`fg(up)+bg(lo)` / `49m` / `39m`) and drop the delta cache entirely; at 40 cells × 13 rows the
  extra bytes are irrelevant, and "every cell is self-contained" is a property a reviewer or a test
  can check mechanically.
* The all-transparent branch already emits `RESET`, which is what stops the leak at a gap; do not
  "optimise" that branch to emit nothing.

### 1.5 Measured proof (reproduction, `agent-output/probe-render.mjs`)

Rows fed through the shipped algorithm and through the contract-fixed version, then replayed into a
small terminal emulator that decodes SGR and reconstructs the two pixel slots of every cell; a slot
is a phantom when it holds a colour while the frame says `'.'`:

| probe row (upper / lower) | shipped renderer | contract-fixed |
|---|---|---|
| `BBBBKKKKKKKK` / `BBBBKKKKKKK.` | cell 11 lower = `#12121a` (outline colour, should be transparent) | clean |
| `BBBBKKKKKKK.` / `BBBBKKKKKKKK` | cell 11 upper = `#12121a` | clean |
| `WWWWW.......` / `WWWWWWWWWWW.` | cells 5–10 upper = `#f0f0fa` | clean |
| `PPPPPPP.....` / `PPPPPP......` | cell 6 lower = `#e66ea0` | clean |
| `BBBBBBBBBBBB` / `BBBBBBBBBBBB` (control) | clean | clean |

Totals over the five shapes: **9 deviating pixel slots shipped, 0 with the one-line `49m` fix.**

---

## 2. Ghost frames — what is dropped, and why the old pixels survive

### 2.1 What the renderer drops

`renderSpriteRows` returns one string per terminal row, and the last statement that touches the row
is:

```ts
let row = out.replace(/[ ]+$/, '')      // strip every trailing SPACE from the row
if (!row.endsWith(RESET)) row += RESET
```

Two consequences:

* A fully transparent cell is rendered as a literal space and then **deleted** from the end of the
  row. Rows are therefore *variable width*: a narrow pose produces short strings, a wide pose long
  ones, and the last character of a row is the last *glyph*, never padding.
* The `RESET` that follows is a state change, not an erase. There is no `EL` (`\x1b[K`),
  no `ED` (`\x1b[J`), no cursor-address clear anywhere in the excerpt.

Padded transparent cells are never emitted, and the surplus columns of the previous frame are never
touched.

### 2.2 What the text pipeline does to trailing whitespace

The row strings are handed to a line-oriented writer (line buffer / frame diff / terminal write),
and that layer trims trailing whitespace again on every line — `trimEnd`, `RTRIM`, a wrapping
step, or a snapshot differ that normalises trailing blanks. Even if the renderer had *not* trimmed,
the spaces would die one stage later. Trailing blanks are the one class of output a text pipeline
feels free to delete, because they are "invisible".

So the narrow frame is drawn over the first N columns and nothing is written to columns N…39. Those
columns still contain the previous, wider frame's cells — which is exactly the reported artefact:
"the pixels of the wide tail REMAIN on screen at their old positions … the surplus columns keep
showing the previous frame's tail."

### 2.3 Why it is a *frame switch* symptom, not a first-paint symptom

On the very first paint the region is empty, so short rows are harmless; ghosts only appear when the
same screen area is reused with a *different* row width. That is why the defect arrived with the
animation feature: before it, one frame was painted once onto a blank screen.

### 2.4 The two-part fix (both parts are required)

**Part 1 — geometry: render every row at the full canvas width, with no trimming.**
Every row must emit exactly 40 cells (25 rows → 13 terminal rows, the last one upper-only), with
transparent cells emitted as real spaces. Width becomes a property of the *canvas*, not of the pose,
so column N means the same pixel in every frame, and a frame switch never changes how many cells are
written.

**Part 2 — erasure: erase to end of line as part of every row.**
After the last cell of a row and before the trailing reset:

```ts
row += '\x1b[0K'      // EL 0: erase from the cursor to the end of the line
row += RESET
```

`\x1b[K` is not whitespace, so no pipeline stage trims it away, and it removes exactly the
surplus columns no matter what the previous frame looked like. For whole-frame repaints, belt and
braces: park the cursor at the sprite origin and emit `\x1b[J` (ED 0) or one `\x1b[K` per row before
drawing.

Why neither part suffices alone: padding alone is deleted by the trailing-whitespace trim of §2.2, so
the terminal never receives spaces to overwrite with; `EL` alone does clear the tail, but any
diff-based or clipped writer still needs a stable, identical cell count on both sides of a switch to
know which rows it is redrawing. Together they make the invariant "the sprite rect on screen is a
function of the current frame only" true for every pipeline, not just for the happy one.

### 2.5 Measured proof (`agent-output/probe-render.mjs`, section B)

Synthetic 4×32 wide pose (body + full tail sweep to column 31) followed by a narrow pose padded with
transparent cells, replayed through the emulator with trailing-space stripping enabled:

* shipped renderer: the narrow frame paints 59 pixels, the screen still carries **43 pixel slots the
  narrow frame does not own** — they sit in the columns the wide tail used to occupy;
* fixed width + `\x1b[K`: **0 ghost slots**.

---

## 3. Frame data drift (`tail2`)

### 3.1 What the digest report says

The report compares `sha256` of each frame's 25 rows against the source art the whale was ported
from. Every frame is `OK` — `standard`, `blink`, `fin1`/`fin2`, `spout1-6`, `tail1`,
`tail3`/`tail4`, `heart1-3`, `sleep1-5` — **except** `tail2`: `MISMATCH`.

`tail2` detail: 23 differing cells, all in the upper-right spout / tail-tip area —

* row 2: ported `D` at col 26 where the source has it at col 27 (one column left);
* row 3: an extra `D` at col 25, `DBD` at 26–28 shifted one column left, and an extra `DD` at
  36–37;
* rows 4–6: the whole upper-right cluster shifted one column left.

This is a *data* defect, not a renderer defect: the renderer faithfully draws the wrong cells. The
error pattern (uniform −1 column plus a couple of duplicated cells) is the signature of hand-copying
a rectangular cluster out of the source art, mis-aligning the clipboard origin, and re-typing the
row ends.

### 3.2 Why the per-excerpt regression missed it

The regression that exists was "added later for a different frame" and is **excerpt-based**: it pins
a sub-rectangle — some rows and a column window of one frame — rather than the whole grid. Three
independent reasons it cannot see this drift:

1. **Coverage:** `tail2` is not one of the excerpted frames, so it is never rendered through the
   check at all.
2. **Window:** even if it were, the drifted cluster lives in the upper-right corner (rows 2–6,
   columns 25–37). An excerpt bounded by the body/fin area does not contain those cells, so the
   comparison grid never reaches them.
3. **Expectation source:** an excerpt regression typically compares against an *inline copy of the
   excerpted characters*. That copy is derived from the ported data, so the check agrees with itself
   — it can catch a renderer regression, never a transcription error in the data it was copied from.

The lesson generalises: any assertion whose scope is a hand-picked sample of the data can only ever
prove that the sample is unchanged.

### 3.3 The gate that prevents recurrence

**Full-frame digest manifest, enforced for every frame:**

1. Canonical serialisation of a frame: the 25 rows joined by a single LF, characters exactly as
   the source art (palette chars, `'.'` for transparent), no trailing newline.
2. A checked-in manifest `frames.digest.json`: `{ frameId: { sha256, width: 40, height: 25 } }` for
   *all* frames (`standard`, `blink`, `fin1`…`sleep5`), generated once from the source art.
3. A test that recomputes every digest and fails with the frame id plus the differing cells (same
   shape as the report's `tail2` detail: row, column, ported vs expected) — a failing digest must
   point at the drift, not just say "hash mismatch".
4. **No implicit blessing:** a `--update-digests` path exists but is separate, explicit, and reviewed
   against the source art; a normal test run never rewrites the manifest. A digest change in a diff
   is a data change that must be justified, not noise to be regenerated.
5. Structural validation as a second, cheaper layer that catches whole classes of porting accident
   before hashing: exactly 25 rows × 40 columns for every frame; alphabet restricted to the palette
   plus `'.'`; no stray spaces/Unicode look-alikes; and cross-frame invariants for animated
   sequences (a limb's bounding box must move monotonically across `tail1`→`tail4`; a pose's pixel
   mass should change smoothly), which would have flagged a one-column jump in the tail tip even
   without a digest.

Bumping a digest must be a deliberate act in the same commit as a visual/source-art check — that is
the property that turns "the art drifted" into "someone chose to change the art".

---

## 4. The hang — a ref'd timer chain behind "finished but hanging"

### 4.1 Mechanism

The animation feature added a planner that schedules the next animation tick, and the tick schedules
the next one:

```ts
function tick() {
  draw(nextFrame())
  setTimeout(tick, frameDelay)     // re-armed for as long as the component is mounted
}
```

Node exits only when the event loop has **no ref'd handles** left. A pending `setTimeout` is a
ref'd libuv handle (`Timeout`), so as long as the chain keeps re-arming, the loop never drains.
The component is never unmounted in these hosts, so there is no `clearTimeout` path and no
`unref()`; the chain is self-sustaining.

That produces exactly the observed signature:

* all scene checks PASS, then the process **sits idle** — not a deadlock (no CPU), not a failing
  assertion (no pending test), not a leaked socket;
* the process does not exit and is killed at the runner timeout — the same job that had always taken
  ~3 minutes, with a locally observed 19 minutes of idle before a manual kill;
* the handle inventory at kill time is "live handles of kind `Timeout` — one per tick of the sprite
  animation planner, each re-arming the next": the evidence names the exact residue;
* the first appearance coincides with the push that flipped the feature default from off to on — the
  planner code path had simply never run in these hosts before, so a latent liveness bug became a
  release blocker.

### 4.2 Which hosts are exposed

Any host that **mounts the header component and finishes without unmounting it**:

* the `channel-ui` CI scene-check host — the reported victim: renders scenes, asserts, prints PASS,
  then has nothing left to do but wait for the loop to drain;
* other headless render / snapshot / export hosts that share the same composition (server-side or
  one-shot renderers, scene harnesses);
* test runners that import the component tree once per process and do not tear the tree down.

The flip made the animation the *default*, so every one of those hosts started running the planner;
previously only the interactive product did.

### 4.3 Why the interactive terminal product is unaffected

The interactive app's process stays alive anyway — it is anchored on the TTY/stdin handles and the
user's session, so an extra ref'd timer is invisible: the loop was never going to drain while the
user was sitting in front of it, and when the user quits, the process is terminated by the session
rather than by loop exhaustion. The bug is therefore unobservable exactly where the feature was
developed and tested, and fatal exactly where nobody looks: short-lived, non-interactive hosts whose
only exit path is "the event loop drains".

### 4.4 The one-line fix

```ts
const t = setTimeout(tick, frameDelay)
t.unref()          // one line: a pending tick must not keep the process alive
```

`unref()` tells libuv this handle alone is not a reason to stay alive; if the process has other
work (a TTY, a server socket, a pending request) the timer still fires normally, so interactive
behaviour is unchanged. Complementary hygiene, not substitutes:

* return a cleanup from the effect that owns the chain (`return () => clearTimeout(t)`) so a real
  unmount stops the animation; the CI hosts never unmount, so this cannot be the only fix;
* keep a single re-armed timeout rather than `setInterval` + a scheduler, so there is exactly one
  handle to unref and to reason about;
* if a host genuinely needs the animation to finish before exiting, give it an explicit
  `await animationIdle()` instead of relying on the loop staying alive.

**Measured proof** (`agent-output/timer-hang.mjs` vs `agent-output/timer-unref.mjs`): two identical
programs that print `12/12 scene checks PASS` and "main finished"; the only difference is the
`unref()`.

| variant | exited within 2.5 s | observed |
|---|---|---|
| chain without `unref()` | **no** — killed at 2572 ms | prints PASS, then idle forever |
| chain with `unref()` | **yes** — exited at 174 ms | same output, same first tick at +76 ms |

The same failure reproduced unintentionally during this analysis: the first probe run omitted
`unref()` and its harness job had to be killed, exactly like the CI job — "PASS, then idle".

---

## 5. Prevention

### 5.1 Renderer contract checklist (ship this with any terminal sprite renderer)

**Cell state**

- [ ] Every emitted cell is *state-complete*: either it sets both foreground and background, or it
      explicitly restores the untouched channel (`39m` / `49m`). No cell relies on a neighbour.
- [ ] The half-block glyph mapping is written down: `▀` = upper fg / lower bg, `▄` = lower fg /
      upper bg, and the transparent-half rule follows from it in one sentence.
- [ ] State caching (dirty-tracking) keys on the *complete* attribute set, so a change in any channel
      invalidates it.
- [ ] A cell whose two halves are both transparent emits an explicit reset (and, at row end, an
      erase — see geometry).

**Geometry / rows**

- [ ] Rows have a fixed canvas width, independent of the pose; transparent cells are emitted as real
      cells.
- [ ] No trailing-whitespace trimming at any stage; if a downstream layer trims, the renderer must
      not depend on spaces for correctness.
- [ ] Odd row counts are handled explicitly (last terminal row is upper-half only) and documented.
- [ ] The renderer never indexes a string by UTF-16 unit if the palette could ever contain non-BMP
      glyphs; palette chars today are BMP, but the contract should say so.

**Erase semantics**

- [ ] Every painted row ends with `\x1b[0K` (EL 0) before its reset.
- [ ] Full repaints erase the sprite rect (`\x1b[J` from the origin, or one `EL` per row) before
      drawing; frame switches never assume the previous frame was the same size.
- [ ] "Reset" and "erase" are treated as different operations in review: `SGR 0` restores colours,
      it does not delete glyphs.

**Testability**

- [ ] A headless harness renders a frame into a terminal emulator and compares **both** pixel slots
      of **every** cell against the frame data (this catches §1 in one assertion).
- [ ] A WIDE→NARROW→WIDE sequence asserts zero pixels that the current frame does not own (this
      catches §2).
- [ ] Rightmost-column and last-row snapshots exist, since that is where both classes of defect land.

### 5.2 The audit to run BEFORE flipping an animation feature default-on

1. **Liveness.** Grep every render/animation path for `setTimeout`, `setInterval`,
   `requestAnimationFrame`, `setImmediate`, worker ports and streams: each must be `unref()`d,
   cancelled in cleanup, or owned by a host that is guaranteed to outlive it. Record the owner.
2. **Run every host to completion.** For each consumer (CI scene checks, snapshot/export, SSR,
   tests, CLI, interactive), run it with the feature **on** and require the process to exit on its
   own within a hard deadline (e.g. 5 s after "done"); add that deadline assertion to CI so a
   liveness regression fails as a timeout, not as an infrastructure flake.
3. **Mount/unmount lifecycle test.** Mount the component, unmount it, assert no timer/frame callback
   survives; then mount it in a host that never unmounts, and assert the process still exits.
4. **Default-path parity.** The flip changes which code runs where; diff the enabled path against the
   previously enabled path per host and confirm each host actually exercised it (the hang survived
   because no non-interactive host had ever run the planner).
5. **Frame-data gate.** Full-frame digest manifest for all frames + structural validation (§3.3) —
   before the flip, not after, so the animation cannot ship on drifted art.
6. **Render contract gate.** The emulator-based cell assertions (§5.1) — phantom and ghost classes
   are cheap to test and currently untested.
7. **Rollout controls.** Keep the flag a real kill switch (env/config/feature flag, off by default in
   non-interactive hosts if the animation is cosmetic), flip per host cohort with a canary job, and
   have a rollback that is a config change, not a revert. The CI job that hung was a canary by
   accident; make it one on purpose.
8. **Known-good baseline.** Before flipping, record the previous CI wall-clock and exit status for
   the same job; "finished in ~3 minutes" is the baseline that turns "hanging" into a measurable
   regression instead of a hunch.

### 5.3 Order of remediation

Data first, then renderer, then liveness, then gates: `tail2` is wrong on screen regardless of the
renderer, the SGR and erase fixes are one-liners in the same function, the `unref()` unblocks CI
immediately, and the digest + contract tests are what stop the next instance of each. Ship the
failing tests first (they demonstrably fail on the shipped code) and the fixes with them.

---

## Appendix A · Reproduction artefacts (all under `agent-output/`)

| file | purpose | result |
|---|---|---|
| `probe-render.mjs` | shipped vs contract-fixed renderer through a terminal emulator; WIDE→NARROW ghost replay; active-handle inventory | 9 vs 0 phantom slots; 43 vs 0 ghost slots |
| `timer-hang.mjs` | planner chain without `unref()` | prints PASS, never exits (killed at 2572 ms) |
| `timer-unref.mjs` | identical program plus `t.unref()` | exits at 174 ms |
| `out-timer-*.txt` | captured stdout of the two runs | shows identical application output |

Run with `node probe-render.mjs` etc. from `agent-output/`; nothing outside it was written.

## Appendix B · Read-only guarantee

`fixture/` was opened with read-only file reads only (README, symptom log, renderer excerpt, digest
report, CI evidence). No file under `fixture/` was created, modified, moved, or executed; no
installation, network access, or repository command was performed. All generated files live under
`agent-output/`, and all conclusions above are traceable to the five fixture documents plus the
reproductions listed in Appendix A.


#### FILE: out-timer-hang.mjs.txt

channel-ui: 12/12 scene checks PASS
planner: tick 1 at +63ms, next timer armed
main: finished; process should exit now


#### FILE: out-timer-unref.mjs.txt

channel-ui: 12/12 scene checks PASS
planner: tick 1 at +76ms, next timer armed
main: finished; process should exit now


## Required output (JSON only)
{"decisions":[{"id":"<criterion-id>","verdict":"pass|partial|fail|missing","reason":"short"}],"caps":[{"id":"<cap-id>","triggered":false,"reason":"short"}]}
Every criterion and cap exactly once. pass=full points, partial=half, fail/missing=0; a triggered cap caps the total.