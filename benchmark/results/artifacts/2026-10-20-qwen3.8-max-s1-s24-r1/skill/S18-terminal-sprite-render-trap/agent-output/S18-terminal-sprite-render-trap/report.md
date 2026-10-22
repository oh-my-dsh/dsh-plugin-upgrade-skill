# S18 · The Terminal Sprite Render Trap — Diagnostic Report

**Mode (per plugin-upgrade skill):** Mode A · inspect — read-only investigation and report; no fixture,
skill, evaluator, or reference modification; no installs/migrations executed; no external services.
The DSH version-corridor cards are not applicable (this task has no DSH host/plugin version boundary);
the skill's read-only discipline and report structure are what apply here.

**Evidence base (read-only):** `fixture/renderer-excerpt.ts` (renderer as shipped), `fixture/symptom-log.txt`,
`fixture/frames-digest-report.txt`, `fixture/ci-hang-evidence.txt`, `fixture/README.md`.
Fixture integrity: sha256 of all 5 files verified equal to `fixture-hash-before.json` before and after this
analysis (fixture untouched).

**Verification method:** besides code reading, the shipped `renderSpriteRows` logic was replicated verbatim in a
throwaway simulation (no fixture execution) and the emitted ANSI was interpreted cell-by-cell against the frame
data. As shipped, every half-filled cell to the right of a full cell shows a phantom pixel in its EMPTY half and
the contamination persists transitively across consecutive half-filled cells; with the escape fix below, zero
phantom cells. Simulation output is summarized inline in §1/§2.

Sprite geometry: 25 pixel rows × 40 pixel columns → ceil(25/2) = 13 terminal rows × up to 20 cells;
`'.'` = transparent (palette lookup yields `undefined`); half-block: `▀` = fg paints UPPER half, cell background
shows through the LOWER half; `▄` = fg paints LOWER half, cell background shows through the UPPER half.

---

## 1. Phantom pixels — persistent SGR background bleeds into the empty half of half-filled cells

### Mechanism: which SGR state persists

SGR is **stateful and additive**: `\x1b[38;2;r;g;bm` sets ONLY the foreground; `\x1b[48;2;r;g;bm` sets ONLY the
background; any parameter not re-sent keeps its previous value until `\x1b[0m` (RESET) or the explicit defaults
`39`/`49`. The renderer's change-detection (renderer-excerpt.ts L35–38) emits a new sequence only when the
*string* differs from the last one (`if (seq !== current)`), and the per-branch sequences are **relative** — they
do not fully specify the cell's state:

- FULL cell (both pixels opaque, L22–24): `seq = fg(up) + bg(lo)`, glyph `▀` → sets fg AND bg.
- HALF cell, upper only (L25–27): `seq = fg(up)`, glyph `▀` → sets fg ONLY. **The bg set by an earlier full cell
  survives** and shows through the glyph's empty LOWER half.
- HALF cell, lower only (L28–30): `seq = fg(lo)`, glyph `▄` → sets fg ONLY. The surviving bg shows through the
  empty UPPER half.
- EMPTY cell (L31–33): `seq = ''` → the diff branch emits `RESET` (L36), which is why the leak stops at the first
  fully transparent cell and never escapes into other UI (row end is also RESET-terminated, L42 — matching
  symptom-log L16–17 "strictly inside/at the edge of the sprite's cell area").

So the persisting state is the **48;2 truecolor background** of the nearest full cell to the left. Because a
half cell's seq updates only fg, that stale bg bleeds **transitively** through any run of consecutive half cells
until a RESET — confirmed by simulation: with upper row `.DDDBB..` / lower row `.D..B...`, cells x=2, x=3 (half,
right of full outline cell x=1) and x=5 (half, right of full cell x=4) all render their empty half in the left
neighbor's lower-pixel color instead of terminal default.

### Which cells expose it

Exactly the **half-filled cells (one of the two vertical pixels transparent) that sit to the RIGHT of a
bg-setting full cell with no intervening empty cell**. That geometry is why the noise "hugs the right edges":

- **Dark outline:** the outline's vertical runs are full cells (outline pixel in both pixel rows); at the right
  boundary of a diagonal/edge the next column is half-filled (outline in one pixel row only) → a 1-cell-wide
  column of dim colored noise directly right of the outline (symptom-log #1). Its color is the neighbor's lower
  pixel (dark/body color) seen at partial glyph coverage → "dim noise" that "moves with the animation" as the
  left neighbors change.
- **Sleep-Z and heart glyphs:** small opaque symbols whose boundary columns are half cells adjacent to full cells
  of the same glyph → same leak.
- Left edges are immune: the empty cells to the left force a RESET before the first painted cell, so state is
  clean entering a shape from the left.

The frame data is clean at those columns (rows end in `'.'` per symptom-log #1) — the pixels are pure render-state
leakage, not data.

### Precise escape fix

Make every emitted SGR **absolute** — a half-filled cell must explicitly restore the DEFAULT background with
`49` (or be preceded by a full reset):

```ts
// upper-only cell:  \x1b[38;2;r;g;b;49m   (fg set, bg forced to default)
// lower-only cell:  \x1b[38;2;r;g;b;49m
else if (up !== undefined) { seq = fg(up) + '\x1b[49m'; ch = '▀' }
else if (lo !== undefined) { seq = fg(lo) + '\x1b[49m'; ch = '▄' }
```

(equivalently one combined CSI `\x1b[38;2;r;g;b;49m`, or emit `\x1b[0m` before each changed non-empty seq).
Simulation with `fg(..)+'\x1b[49m'`: **0 phantom cells**. Contract note: the `seq !== current` string-diff
optimization is only sound when every candidate seq fully specifies the state it claims to establish — that is
the invariant the shipped code broke.

---

## 2. Ghost frames — row trimming + a text pipeline that eats trailing whitespace + no erase semantics

### What the renderer drops from each row

renderer-excerpt.ts L41: `let row = out.replace(/[ ]+$/, '')` — **every trailing run of empty cells is trimmed
off each row**, then only a RESET is appended (L42). A narrow pose's rows therefore become physically shorter
strings: the cells between the narrow row's end and the wide row's end are *never emitted at all*.

### What the text pipeline does to trailing whitespace

Trailing whitespace does not survive the pipeline: the renderer itself strips it (L41), and any downstream
line-oriented text layer (line writers, snapshot serializers, editors, loggers) strips or collapses trailing
spaces too. So even "fixing" this by removing the trim and padding rows with spaces is fragile — padded spaces
can be eaten before they reach the screen. Trailing whitespace can never be the coverage mechanism.

### Why ghosts survive a wide→narrow switch

Terminal writes **overwrite in place**; nothing implicitly clears cells to the right of the written text. On a
frame switch the renderer repositions and rewrites all 13 rows, but each narrow row covers fewer cells than the
wide frame it replaces (simulation: wide row covers 7 cells, narrow row covers 4 → cells x=4..6 are never
written). The previous frame's swung-out tail keeps its old cells = ghost pixels (symptom-log #2). The narrow
frame itself "renders fine" because the bug is in what is NOT written.

### The two-part fix that guarantees a clean frame switch

1. **Explicit per-row erase (the guarantee):** terminate every row with `RESET` then **EL** — `'\x1b[0m\x1b[K'`
   (CSI K = erase cursor→end of line). RESET first so EL paints the surplus with the DEFAULT background, not the
   current one. This clears leftover wide-frame cells regardless of how short the row string is, and is immune
   to whitespace stripping because it is a control sequence, not spaces.
2. **Fixed-width canvas coverage (stop depending on whitespace):** render to a constant canvas (25×40 px →
   13×20 cells) and treat the **union of old and new frame width** as the redraw region per row — either pad rows
   to the canvas width or (equivalently, given part 1) always end rows with EL. A frame switch must rewrite ALL
   rows and clear ALL columns the previous frame may have painted; partial/diff painting must account for
   shrinking widths.

With both parts, a wide→narrow switch leaves zero surviving cells; part 1 alone already guarantees it, part 2
makes the contract explicit and keeps the trim (bandwidth optimization) safe.

---

## 3. Frame data drift — hand-ported `tail2` and the digest gate

### What the digest report says

frames-digest-report.txt: sha256 of each frame's 25 rows compared against the **source-art** frames →
every frame OK except **`tail2` = MISMATCH**: 23 differing cells, all in the upper-right spout/tail-tip area —
row 2: ported `D` at col 26 vs source col 27 (1-col left shift); row 3: extra `D` at col 25, `DBD` at cols 26–28
shifted left 1, extra `DD` at cols 36–37; rows 4–6: the whole upper-right cluster shifted 1 column left. The
frame was **hand-copied during conversion**. User-visible effect: the misplaced 6-pixel tail-tip cluster of
symptom-log #3 ("one drifted frame") — a DATA bug, distinct from the two RENDER bugs above.

### Why the existing per-excerpt regression missed it

The regression was **excerpt-based and added later for a DIFFERENT frame** (report L14–15): it asserts a small
excerpt of one frame, so it structurally cannot see (a) other frames at all — `tail2` was simply out of its
coverage — or (b) cells outside the excerpted region. Sampled coverage of one frame is not a data-integrity gate
for a 20-frame port; a hand-copy error anywhere else is invisible to it.

### The gate that prevents recurrence

A **checked-in golden-digest gate over ALL frames** in CI, exactly generalizing the report itself:

1. Mechanically convert frames from the source art (no hand-copying); the converter output is the only accepted
   provenance for frame data.
2. For every frame, compute sha256 over the normalized full 25×40 row text (canonical order/separators,
   pre-render — independent of renderer state) and compare against golden digests generated from the source art.
3. **Fail closed on any mismatch**, printing the per-cell diff (row/col/expected/actual) like the tail2 detail,
   so drift is localized immediately.
4. Goldens may only be regenerated from source art through the converter — never from hand-edited or
   renderer-output data (otherwise the gate launders the drift it exists to catch).

Coverage is then exhaustive (every frame, every cell) instead of sampled, and any future hand-port is caught at
CI time rather than by a user symptom.

---

## 4. The hang — a self-re-arming timer chain pins the event loop of a finished job

### Mechanism: what reschedules forever

Node exits only when its event loop has no live (ref'd) handles. The sprite **animation planner re-arms a
`setTimeout` on every tick for as long as its component stays mounted** (ci-hang-evidence L8–11): each Timeout
handle is replaced by the next one before the loop can drain, so the chain is self-renewing and the loop never
goes idle. Result: the channel-ui job shows PASS for all scene checks, then sits idle — no running test, no
pending assertion — and never exits on its own; it is killed at the runner timeout (~3 min historically; one
observed 19 min of idle before manual kill).

### Which hosts mount without unmounting

The **channel-ui headless CI scene hosts**: they mount the header component (which now contains the default-on
animation planner), finish their checks, and exit **WITHOUT unmounting it** — no unmount → no stop/cleanup of the
planner → the timer chain outlives the test run. This only surfaced when the feature flipped default-on: with
the flag off, no planner was created, so the same missing-unmount host behavior was harmless (timeline: hang
first appeared in the very push that flipped the default).

### Why the interactive terminal is unaffected

The interactive product's process is **kept alive by TTY/stdin handles regardless of the timer chain**
(evidence L12–13). There the animation is wanted behavior, the timer adds nothing observable to process
lifetime, and exit is explicit (stdin closes / process killed). The hang only manifests on hosts whose *sole*
remaining reason to stay alive is the stray timer.

### The one-line fix

```ts
this.timer = setTimeout(tick, delayMs).unref();   // timer no longer pins the event loop
```

`.unref()` on the re-armed timeout lets a finished process exit naturally while leaving the animation running
normally wherever real I/O handles (TTY/stdin/server) keep the loop alive. Complementary hygiene (not the
one-liner): `clearTimeout` in the component's unmount/dispose, and make headless hosts unmount before finishing.

---

## 5. Prevention

### 5a. Renderer contract checklist (ship with any terminal sprite implementation)

1. **Absolute SGR per cell.** Every emitted sequence fully specifies the cell state: fg AND bg (explicit `39`/`49`
   defaults where a half is transparent). Sequence-diffing (`seq !== current`) is allowed only over absolute
   seqs — never emit partial SGR after a state that set more parameters.
2. **Row termination contract.** Every row ends with `\x1b[0m\x1b[K` (RESET, then EL erase-to-EOL with default
   bg) so a narrower frame always clears surplus cells of the previous frame.
3. **No reliance on trailing whitespace.** Whitespace is trimmed by the renderer and stripped/collapsed by text
   pipelines; coverage must come from control sequences (EL) or an explicit fixed-width canvas, never from
   padded spaces.
4. **Frame switch = full coverage of union(old, new).** Rewrite all rows; when diffing/partial-painting, include
   the shrink region; a switch must be indistinguishable from erase-then-paint.
5. **Geometry & transparency semantics pinned.** pixels→cells mapping (ceil(rows/2) × ceil(cols/2)); odd row
   count (25 → last terminal row has no lower pixel, `lower[x]` undefined); `'.'` → palette miss → skipped cell.
6. **Data integrity gate.** Frames produced mechanically from source art; golden sha256 digests of ALL frames
   checked in; CI fails closed with per-cell diff on mismatch; goldens regenerable only via the converter.
7. **Lifecycle discipline.** Any interval/timeout re-armed while mounted must be `.unref()`'d AND cleared on
   unmount/dispose; a UI component must never be the only thing holding a headless process's event loop open.
8. **Byte-level output regression.** Golden snapshots of the raw ANSI byte stream (not just visual/excerpt
   checks) for the trap cases: right-edge half-filled cells (phantom-pixel canary), wide→narrow switch
   (ghost canary), and process-exit assertion in headless CI (job must exit naturally within a timeout, not be
   runner-killed).

### 5b. Rollout audit BEFORE flipping an animation feature default-on

1. **Host inventory.** Enumerate every host that mounts the animated component (interactive terminal, headless
   CI scene hosts, unit/integration harnesses, embedders). For each: does an unmount path actually run at
   teardown? If not, are all re-arming timers unref'd? The flag flip changes WHICH hosts instantiate the
   planner — audit the newly-reached ones, especially headless hosts that mount-and-finish.
2. **Flag-on dry run in CI.** Run the full suite with the flag on in a branch/sandbox and assert **natural
   process exit** per job (no runner-timeout kills); on PASS, inspect live handles
   (`process._getActiveHandles()` / why-is-node-running) for stray Timeout/Immediate handles.
3. **Job-duration baseline.** Compare against pre-flip baselines (channel-ui ≈ 3 min); alert on an idle tail
   after the last assertion — "PASS then hangs" is the signature of a pinned loop.
4. **Visual gates green.** All-frame digest gate (§3), ANSI-byte golden snapshots, and a scripted wide→narrow
   frame-switch test asserting zero painted cells outside the new frame's coverage.
5. **Flag-off path emits zero timers** (verify the off state stays inert, so a revert fully restores the old
   process-lifetime behavior).
6. **Ship the flip alone, with a revert plan.** The hang landed in the same push as the flip; a default-on
   change is a release — canary it, keep the one-line revert ready, and land the unref/digest fixes
   independently so they survive the revert.

---

## Summary of the four root causes

| Symptom | Root cause | Fix |
|---|---|---|
| Phantom pixels at right edges | Partial (relative) SGR: half cells set fg only; earlier full cell's `48;2` bg persists and shows through the glyph's empty half | Emit absolute SGR: `fg + \x1b[49m` (default bg) on half cells |
| Ghost pixels after wide→narrow switch | Trailing-space trim (L41) + pipeline strips whitespace + writes never clear uncovered cells | End every row `\x1b[0m\x1b[K`; fixed-width canvas / union-region redraw |
| Misplaced tail-tip cluster (drifted frame) | Hand-copied `tail2` (23 cells off vs source art); excerpt regression covered a different frame only | Mechanical conversion + golden sha256 digest gate over ALL frames, fail-closed |
| CI job PASSes then hangs | Planner re-arms `setTimeout` per tick while mounted; channel-ui hosts mount header and finish without unmounting → timer chain pins the event loop (TTY/stdin masks it interactively) | `setTimeout(tick, ms).unref()` (+ clearTimeout on unmount) |

*Fixture remained byte-identical throughout (sha256 verified against fixture-hash-before.json before and after).*
