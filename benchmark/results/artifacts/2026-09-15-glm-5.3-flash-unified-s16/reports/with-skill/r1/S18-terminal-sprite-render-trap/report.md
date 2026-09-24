# S18 · The Terminal Sprite Render Trap — Diagnosis Report

Scope: read-only analysis of `/app/fixture/` (unchanged) against the four reported
symptoms. Every finding cites its evidence: `renderer-excerpt.ts`, `symptom-log.txt`,
`frames-digest-report.txt`, `ci-hang-evidence.txt`. A scratch re-run of the renderer's
exact logic on synthetic edge rows (temporary file, not part of the fixture) was used to
confirm the escape-sequence traces quoted below.

Evidence keys used below:

- **RE** = `fixture/renderer-excerpt.ts` (line refs as shipped)
- **SL** = `fixture/symptom-log.txt`
- **FD** = `fixture/frames-digest-report.txt`
- **CI** = `fixture/ci-hang-evidence.txt`

---

## 1. Phantom pixels — stale SGR background painted into the empty half of a half-filled cell

**Symptom (SL §1):** a 1-cell-wide column of dim colored noise hugging the sprite's right
edges — beside the dark outline, the sleep-Z symbols, and the heart — not present in any
frame's data (those columns are `.` in the source rows).

### Mechanism

The renderer emits one escape run per *state change*, not per cell (RE lines 35–38):

```ts
if (seq !== current) {
  out += seq === '' ? RESET : seq
  current = seq
}
```

SGR state is sticky: whatever foreground/background the last escape set stays in effect
for every subsequent glyph until changed or reset. The bug is that the three "painted"
branches do not emit the *same amount* of state:

| Cell pair (up, lo)        | seq emitted (RE lines 22–30) | glyph |
|---------------------------|------------------------------|-------|
| both defined              | `fg(up) + bg(lo)`            | `▀`   |
| up only                   | `fg(up)`  — **no `bg`**      | `▀`   |
| lo only                   | `fg(lo)`  — **no `bg`**      | `▄`   |
| both transparent          | `RESET`                      | space |

When the cell is half-filled, the glyph paints only one half with the *foreground*; the
other half shows the cell's **background**, and the single-sided branches never declare
one. The background left over from the previous fully-filled cell — its `bg(lo)`, SGR
`48;2;r;g;b` — therefore bleeds into the empty half. The `seq !== current` dedup makes it
worse conceptually: `fg(up)` alone is treated as a *complete* new state, so the renderer
believes it has re-specified everything when it has only re-specified the foreground.

Confirmed trace (scratch re-run of RE's exact loop on rows `..BDD.` / `..BB..`, B = dim
body, D = dark outline — cell x=4 is up=`D`, lo=`.`):

```
... \x1b[38;2;20;20;20m\x1b[48;2;90;90;90m▀   ← cell 3: fg=D, bg=B (full cell)
... \x1b[38;2;20;20;20m▀                       ← cell 4: fg=D ONLY; bg is STILL 48;2;90;90;90
```

At paint time the terminal still holds `48;2;90;90;90` from cell 3, so cell 4 renders
dark outline on top and **body-fill color on the bottom half** — a phantom pixel that is
in no frame's data. Because the stale color is the previous cell's lower pixel (usually
the dim body fill next to the dark outline), it reads as "dim colored noise" (SL §1).

### Which SGR state persists

The **background** set by `bg(lo)` (`ESC[48;2;…m`) of the last fully-filled cell. The
foreground always gets re-emitted for painted cells, so it is specifically the `48;2`
state that leaks across the cell boundary.

### Which cells expose it

Any half-filled cell that **directly follows a `bg()`-emitting cell in the same output
row with no intervening fully-transparent cell** (a transparent cell emits `RESET`, which
clears the leak — that is why the artifact "hugs" the edges instead of appearing
everywhere):

- the run of cells at the sprite's right edge where one pixel row has tapered to `.`
  while the other still carries the dark outline — exactly the 1-cell column of noise
  right of the outline cells (SL §1);
- the sleep-Z symbols and the heart, whose glyph pixels sit in one half of their cell
  adjacent to other painted cells — same leak in their empty halves;
- the entire run of consecutive half-filled cells shares the first stale background —
  the leak persists until a full cell re-emits `bg()`, a transparent cell emits `RESET`,
  or the row ends (the trailing `RESET` on RE line 42 arrives too late: the phantom has
  already been painted);
- latent same-class bug: an odd sprite height (25 rows → last terminal row has
  `lower = ''`, RE line 14) makes every cell of the bottom row an up-only `▀` cell, so
  the bottom row leaks identically.

### The precise escape fix

Make every emitted `seq` a **complete SGR state** so no component can persist by
accident. Add a default-background escape and include it in the single-sided branches:

```ts
const BG_DEFAULT = '\x1b[49m'          // SGR 49: default background

// up only:
seq = fg(up) + BG_DEFAULT              // '▀' bottom half = default bg, not the neighbor's pixel
// lo only:
seq = fg(lo) + BG_DEFAULT              // '▄' top half  = default bg
```

`RESET` already implies `49`, so the empty branch stays as is, and the existing
`seq !== current` dedup now compares *full* state (fg+bg) instead of partial state.
(Emitting a bare `ESC[0m` before each painted run would also work but defeats the dedup
and churns the output; `49m` is the minimal precise fix.)

---

## 2. Ghost frames — the previous frame survives a switch to a narrower frame

**Symptom (SL §2):** switching from a wide pose back to a narrower one leaves the wide
tail's pixels on screen at their old positions; the narrow frame itself renders fine.

### Mechanism

The terminal is a persistent grid: a cell keeps its content until something writes to it
or erases it. The renderer emits each row only up to its last painted cell and then
**drops the trailing transparent cells** (RE line 41):

```ts
let row = out.replace(/[ ]+$/, '')
```

So a narrow frame's row string simply *stops* after its last painted column. The
trailing transparent cells became spaces, the trim deletes them, and the row carries **no
erase-to-end-of-line** — the appended `RESET` (RE line 42) fixes colors only; it erases
nothing. Downstream, the text pipeline applies ordinary text hygiene and **strips
trailing whitespace from each line** before writing it to the terminal. The combined
effect: the surplus columns where the wide tail used to be are never written by the
narrow frame — no glyph, no space, no `ESC[0K` — so the previous frame's pixels remain in
the grid. Ghost tail.

Confirmed trace: wide row → `…fg(B)▀▀▀▀▀▀ESC[0m` (paints cols 2–7); narrow row →
`…fg(B)▀▀▀ESC[0m` (paints cols 2–4). Nothing in the narrow row addresses cols 5–7.

### The two-part fix that guarantees a clean frame switch

1. **Renderer side — explicit erase, not whitespace.** End every row with an explicit
   erase-to-end-of-line *after* the color reset, so the erase uses the default
   background: `row + RESET + '\x1b[0K'` (EL / `ESC[0K`). Optionally assert/pad to the
   fixed canvas width (40 cols) so every frame paints or erases the same extent. EL is
   not whitespace, so no downstream trim can remove it.
2. **Pipeline side — renderer output is verbatim.** Mark sprite rows as
   preformatted/verbatim so the text pipeline does not trim, wrap, or re-flow them
   (whitespace-stripping text hygiene must not apply to renderer rows).

Together: every row of *every* frame actively clears everything to its right, so a
wide→narrow switch can never leave old cells behind — the guarantee no longer depends on
trailing spaces surviving an unpredictable pipeline.

---

## 3. Frame data drift — the hand-ported `tail2` is wrong, and the excerpt regression could not see it

**What the digest report says (FD):** of all ported frames, only `tail2` is
`MISMATCH` against the source art — **23 differing cells, all in the upper-right
spout/tail-tip area**: row 2 has its `D` at col 26 instead of 27 (1-column left shift);
row 3 has an extra `D` at col 25, the `DBD` at cols 26–28 shifted left 1, and extra `DD`
at cols 36–37; rows 4–6 shift the whole upper-right cluster 1 column left. This is the
"misplaced tail tip / 6-pixel cluster drawn at the wrong position" of SL §3: the frame
was hand-copied during conversion and the copy drifted (shift + stray pixels).

**Why the existing per-excerpt regression missed it (FD):** the excerpt-based regression
was **added later and covers a different frame** — it asserts only on an excerpt (a
subset of rows/columns of one frame), so `tail2`'s drifted region was outside everything
it checks. Worse, excerpt regressions of this kind typically snapshot the *ported* data
itself, so a transcription error introduced at port time is frozen into the baseline and
passes forever; only a comparison **against the source art** can catch port drift.

**The gate that prevents recurrence:** a **whole-frame digest gate in CI** — the exact
mechanism the report used to catch it, promoted from a one-off report to a required
check:

- for **every** frame (all 25+ frames, not excerpts), compute a digest — sha256 of the
  canonical 25-row frame text — from the ported data **and** from the source art;
- CI fails on any mismatch (as FD does for `tail2` today), with a per-cell diff in the
  failure message;
- adding or hand-editing a frame requires updating its digest **from the source art in
  the same change** — never re-snapshotting the ported output;
- the gate runs on every change to frame data *or* the port/palette pipeline.

---

## 4. The hang — a self-rescheduling timer pins the CI event loop after the job finished

**Mechanism (CI):** after the animation feature flipped default-on, the sprite animation
planner runs a tick loop: **one `Timeout` handle per tick, each callback re-arming the
next `setTimeout`** — it "reschedules a setTimeout for as long as its component stays
mounted" (CI §2). A Node process exits only when its event loop has no live handles;
an always-re-armed timer is a permanent live handle. Job "channel-ui" prints PASS for all
scene checks, has "no running test, no pending assertion", and then sits idle until the
runner kills it (~3 min before the flip; one local run idled 19 minutes) — because the
only thing left "running" is the animation timer chain.

**Which hosts mount without unmounting (CI §2):** the channel-ui group's hosts **mount
the header component and finish WITHOUT unmounting it** — the component hosting the
planner is never torn down in that environment, so the planner never stops rescheduling.
Before the flip the planner was off, there was no timer, and the job exited normally;
the hang first appears in exactly the push that flipped the default (CI timeline).

**Why the interactive terminal is unaffected (CI §3):** the interactive product's process
is meant to stay alive and is held open by its **TTY/stdin handles** regardless of the
timer chain — the animation timer changes nothing about its exit semantics.

**The one-line fix:** unref the animation timer so it can never pin the event loop:

```ts
const t = setTimeout(tick, interval)
t.unref()            // ← the one line
```

The animation keeps ticking wherever the app is alive for its own reasons (TTY, server),
but a host that finished its work — like the channel-ui job — can now exit. (Same for a
`setInterval`-based planner; the alternative of unmount-teardown alone would also work
but is not a one-liner and depends on every host ever unmounting.)

---

## 5. Prevention

### Renderer contract checklist (ship this with any terminal sprite renderer)

1. **Complete SGR state per run.** Every emitted escape run specifies fg **and** bg
   (use `ESC[49m`/`ESC[39m` defaults for transparent halves). No output may depend on
   SGR state persisting from a previous cell. Cover the odd-height last row explicitly.
2. **Erase-complete rows.** Every row ends with an explicit `ESC[0K` after `RESET`
   (or paints a fixed canvas width). Trailing whitespace is never load-bearing.
3. **Verbatim transport.** Renderer rows bypass text hygiene: no trailing-whitespace
   stripping, wrapping, or re-flow downstream.
4. **Full-frame repaint semantics.** A frame switch paints or erases every cell of the
   canvas; nothing on screen is allowed to predate the current frame.
5. **Whole-frame digests.** Every frame has a checked-in digest computed from source
   art; CI recomputes and fails on drift; excerpt tests are allowed only *in addition
   to*, never instead of, the digest gate.
6. **Grid-model tests.** Assertions run against a terminal-grid model (per-cell fg/bg/
   glyph after applying the escape stream), not substring matching on raw output —
   substring tests cannot see sticky-state leaks.
7. **Timer hygiene.** Every timer/interval the renderer or its planners create is
   `.unref()`-ed (or torn down deterministically on unmount), and the contract states
   that hosts may mount the component **without ever unmounting** it.
8. **Golden frames.** A wide→narrow→wide switch sequence is a golden test: assert the
   grid contains no pixel outside the current frame's extent.

### The audit to run BEFORE flipping an animation feature default-on

1. **Liveness audit (pre-answers the hang).** Enumerate every host/context that mounts
   the component: CI scene tests, batch renderers, static generation, daemons. For each:
   can the process still exit with the feature on? Grep for `setTimeout`/`setInterval`/
   `setImmediate`/rAF chains introduced by the feature; require `.unref()` or teardown;
   and actually run the CI suite with the flag **on** locally, asserting the job
   **self-exits** within N seconds of PASS (add that as a CI assertion, not a habit).
2. **Frame-data audit.** Run the whole-frame digest gate over ALL frames against source
   art before the flip — it is the only thing that would have caught `tail2` (FD).
3. **Transition audit.** Exercise wide→narrow and narrow→wide switches on a persistent
   grid model; assert zero surviving cells outside the new frame's extent (§2's fix).
4. **Edge audit.** Exercise every right/left edge shape — half-filled cells adjacent to
   filled runs, floating glyphs (Zs, heart), the odd-height bottom row — against the
   grid model, asserting empty halves are the default background (§1's fix).
5. **Rollout plan.** Flip the default with a canary cohort, keep the flag as an instant
   kill-switch, and require the liveness assertion (self-exit after PASS) green on the
   canary before full rollout.

---

## Summary

| Symptom | Root cause | Evidence | Fix |
|---|---|---|---|
| Phantom pixels at right edges | `bg()` (SGR 48;2) of the previous full cell persists; single-sided branches emit `fg()` only, so the stale bg paints the glyph's empty half | RE lines 22–34, 35–38; SL §1; scratch trace | `seq = fg(...) + '\x1b[49m'` in both single-sided branches (complete SGR state) |
| Ghost tail after narrow frame | Renderer trims trailing spaces (RE line 41) and emits no EL; the pipeline strips trailing whitespace, so surplus columns are never addressed | RE line 41–42; SL §2; scratch trace | Row-final `ESC[0K` after `RESET` + verbatim (non-trimming) pipeline transport |
| `tail2` drift | Hand-port shifted the upper-right cluster 1 col left + stray pixels (23 cells); excerpt regression covers a different frame only | FD; SL §3 | Whole-frame sha256 digest gate in CI, expected digests derived from source art |
| Finished CI job hangs | Planner re-arms a `setTimeout` per tick forever while mounted; channel-ui hosts mount the header and never unmount; live Timeout handles keep the event loop alive; interactive product is held by TTY/stdin anyway | CI §1–3, timeline | `timer.unref()` (one line) |
