# S18 · The Terminal Sprite Render Trap — Diagnostic Report

**Scope:** read-only analysis of `/app/fixture/` (renderer-excerpt.ts, symptom-log.txt, frames-digest-report.txt, ci-hang-evidence.txt). The fixture was not modified. All conclusions below are grounded in the shipped code and the evidence pack; the renderer logic was additionally re-simulated cell-by-cell to verify the escape-sequence behavior.

**System recap:** the whale sprite is 25 pixel-rows × 40 pixel-cols of palette chars (`'.'` = transparent). The renderer packs two pixel rows into one terminal row (13 terminal rows): foreground (fg) paints the UPPER pixel via `▀`, background (bg) paints the LOWER pixel; a lower-only pixel is drawn as `▄` with fg; a fully transparent cell is a space.

---

## 1. Phantom pixels — persistent SGR background painted into the EMPTY half of half-filled cells

### The code path

Per cell the renderer computes one of four states:

| cell kind | emitted seq | glyph |
|---|---|---|
| upper + lower pixel present | `fg(up) + bg(lo)` → `ESC[38;2;r;g;bm ESC[48;2;r;g;bm` | `▀` |
| upper pixel only | `fg(up)` → `ESC[38;2;r;g;bm` | `▀` |
| lower pixel only | `fg(lo)` → `ESC[38;2;r;g;bm` | `▄` |
| transparent | `` (empty) | space |

and applies run-length state tracking:

```ts
if (seq !== current) {
  out += seq === '' ? RESET : seq   // RESET only on transition to TRANSPARENT
  current = seq
}
out += ch
```

### The mechanism

- **Which SGR state persists:** the truecolor **background**, `ESC[48;2;r;g;bm`, set by a "full" (upper+lower) cell. Every non-empty seq begins with an `fg(...)` code, so the foreground is always overwritten and never leaks; **bg is set in exactly one of the three non-empty variants and is cleared by nothing except a full RESET**. The transition-to-transparent branch does emit `ESC[0m`, but a transition **full cell → fg-only cell** takes the other branch: it emits only the new `ESC[38;2;...`m and **inherits the previous cell's bg**.
- **Which cells expose it:** the **half-filled cells** — upper-only `▀` and lower-only `▄` — that **immediately follow a full (fg+bg) cell**. In such a cell one half is painted by the glyph (fg) and the other half is supposed to be empty (terminal default). Because the stale bg is still active, the terminal paints the whole cell background with the previous cell's LOWER-pixel color, so the empty half shows a pixel that exists nowhere in the frame data. Fully transparent cells are immune (they force `ESC[0m`), which is why the artifacts are strictly one-cell-wide and hug edges instead of forming open fields.
- **Why at the right edges / next to the outline, sleep-Z, heart:** the dark outline is a vertical stroke — where it spans both packed pixel rows, its cells are full `fg(D)+bg(D)` cells. Directly to their right (and around the sparse single-row features: the Z diagonals, the heart's top/bottom rows, the tail tip at cols ~25–37) sit half-filled cells where only ONE of the two pixel rows carries an accent pixel. Each such cell's empty half glows with the dark outline's bg → "a 1-cell-wide column of dim colored noise". Which outline cells are full vs half-filled changes per frame, so the noise "appears and moves with the animation". The left edge stays clean because those cells are preceded by transparent runs (RESET).

**Verified by simulation** of the shipped logic: for pixel data `upper="..D..."`, `lower="..DH.."` the output is
`ESC[38;2;1m ESC[48;2;1m ▀ ESC[38;2;2m ▄ ESC[0m` — the `▄` cell re-sets only fg; `48;2;1` (the D-dark bg) survives into it and paints its empty upper half.

### The precise escape fix

Clear the SGR state on **every** attribute change, not just on transition to transparent:

```ts
if (seq !== current) {
  out += RESET + seq   // ESC[0m before each new seq; identical to old behavior when seq === ''
  current = seq
}
```

Equivalent minimal-byte variant: append the explicit default-background code to every seq that does not set bg — `fg(up) + '\x1b[49m'` and `fg(lo) + '\x1b[49m'` — so no cell can inherit a background. The `ESC[0m`-on-change form is preferred as the contract ("every cell fully specifies its own appearance").

---

## 2. Ghost frames — trailing-space trimming defeats the overwrite-on-switch model

### What the renderer drops from each row

```ts
let row = out.replace(/[ ]+$/, '')   // strips ALL trailing spaces
```

Every transparent tail cell of a row is a space; this trim **drops the entire transparent right margin**, so each emitted row's length varies with the frame's ink extent. A narrow pose emits physically shorter lines than a wide pose.

### What the text pipeline does to trailing whitespace

The trim regex IS the string pipeline step here (and any downstream line writer that strips trailing whitespace compounds it): trailing whitespace never reaches the terminal. The renderer repaints frames **in place, by overwriting cells**. When the animation switches from a WIDE pose (tail swung out) to a NARROWER pose, the narrow frame's lines stop short of the columns the wide frame had painted — **nothing is ever written to those cells, so nothing erases them**: the previous frame's tail glyphs remain on screen as ghosts. (Colors don't leak — each row still ends with `ESC[0m` — only the old glyphs survive, exactly as reported.)

### The two-part fix (both parts needed for a guaranteed clean switch)

1. **Constant full width — never trim:** render every row to the sprite's full column count (40 cells; pad short/missing pixel rows with spaces) so a frame switch overwrites the entire sprite bounding box. Remove the `replace(/[ ]+$/,'')` step.
2. **Explicit terminal erase at EOL:** terminate every rendered line with the Erase-in-Line code **`ESC[K`** (`\x1b[K`, erase cursor→end of line) after the closing RESET:
   `rows.push(out + RESET + '\x1b[K')`
   This makes the clean switch independent of any whitespace trimming that still happens downstream: even if a line arrives shortened, the terminal itself clears everything to the right of the last written cell. (For full-frame teardowns, `ESC[J`/`ESC[2J` plays the same role for the whole region.)

---

## 3. Frame data drift — hand-ported `tail2`, missed by an excerpt-only regression

### What the digest report says

The report sha256-digests **each frame's full 25 rows** and compares against the source-art frames. Verdicts: all frames OK — standard, blink, fin1/2, spout1–6, tail1, tail3/4, heart1–3, sleep1–5 — **except `tail2`: MISMATCH**, with **23 differing cells, all in the upper-right spout/tail-tip area**:

- row 2: ported `D` at col 26, source at col 27 (1-column left shift);
- row 3: extra `D` at col 25; the `DBD` run at cols 26–28 shifted left 1; extra `DD` at cols 36–37;
- rows 4–6: the whole upper-right cluster shifted 1 column left.

This is the user's "misplaced tail tip": the 6-pixel cluster of rows 4–6 drawn one column off. Root cause stated in the report: **`tail2` was hand-copied during conversion** from the source art.

### Why the existing per-excerpt regression missed it

The regression that existed was **excerpt-based and had been added later for a different frame**: it asserted only on a small sub-region of one frame's rows. `tail2` was not covered at all, and even a "similar" excerpt would not have helped — a 1-column shift inside the upper-right cluster only shows up when the **entire frame** is compared cell-for-cell (or digest-for-digest) against the source. Partial golden tests give partial coverage; hand-porting errors live exactly in the untested remainder.

### The gate that prevents recurrence

A **full-frame digest gate in CI**: for every frame, canonically serialize all 25 rows and compute sha256; compare against a **committed digest manifest generated from the source art** (the report's format is already the right shape). Any mismatch — any frame, any cell — fails the build. Supporting rules: frames must be **machine-converted** from source art (never hand-copied); any intentional hand edit must regenerate the manifest and be diff-reviewed; the per-frame golden **byte** tests of the rendered output should likewise cover ALL frames, not excerpts.

---

## 4. The CI hang — a self-rearming setTimeout chain pinning the event loop

### The mechanism (from ci-hang-evidence.txt)

- The job "channel-ui" prints PASS for all scene checks, then the process **sits idle and never exits** (one local observation: 19 minutes idle before manual kill; runners kill at timeout). The same job finished in ~3 minutes before the flag flip; the hang appeared in the very push that flipped the animation feature default-on.
- **What reschedules forever:** the sprite animation planner. On every tick it calls `setTimeout` again for the next tick, **for as long as its component stays mounted** — a self-rearming timer chain. In Node, a pending (ref'd) `setTimeout` is a live **Timeout handle on the event loop; the process exits only when the loop has no live handles left**. With the chain re-arming itself, there is always exactly one pending Timeout — the loop never drains, so the process cannot exit even though zero tests are running and zero assertions are pending. That is the "finished but hanging" state.
- **Which hosts mount without unmounting:** the CI/scene-check hosts (the channel-ui group). They mount the **header component** — which now contains the animated sprite — run their checks, and **finish WITHOUT unmounting it**. Nothing ever calls the planner's stop/`clearTimeout`, so nothing breaks the chain. These are "run to completion, then exit" hosts: the stray timer is the ONLY thing keeping them alive, and it is fatal there.
- **Why the interactive terminal is unaffected:** the real terminal product's process is kept alive by its **TTY/stdin handles regardless of the timer chain**. One more ref'd timer changes nothing observable there — the app was never going to exit on its own while the user session is open, and when the session ends the process is torn down. The bug only *manifests* in hosts whose exit depends on the loop draining.

### The one-line fix

Make the animation timer non-ref'd so a pending tick can never hold the event loop open:

```ts
this.timer = setTimeout(this.tick, this.intervalMs).unref()   // Node: pending tick no longer pins the loop
```

(equivalently `setTimeout(tick, ms).unref()` at the planner's reschedule site). The CI host then exits the moment its real work is done; the animation still runs normally wherever a TTY or other live handle keeps the loop alive.

**Complementary hygiene (not the one-liner, but should ship with it):** the planner must `clearTimeout` on unmount/stop; test hosts should unmount mounted components in teardown; and a feature flag must never change process-lifetime semantics of its hosts.

---

## 5. Prevention

### 5a. Renderer contract checklist (ship with any terminal sprite implementation)

1. **Per-cell attribute closure:** every cell fully specifies its own SGR state. Emit `ESC[0m` before each attribute change (or explicit `ESC[39m`/`ESC[49m` defaults in any seq that doesn't set fg/bg). Never rely on inherited state; remember `48;2` bg persists until reset or overwritten.
2. **Constant geometry:** every frame renders the same number of lines at the sprite's full column width; transparent margin cells are emitted as padded spaces. **No trailing-whitespace trimming anywhere** in renderer or transport (lint against `.replace(/\s+$/,'')` on frame rows).
3. **Erase discipline:** every line ends with `ESC[K`; frame switches repaint the full bounding box; region teardowns use `ESC[J`/`ESC[2J`. A narrower frame must be *able* to erase a wider predecessor.
4. **Line hygiene:** every line ends with `ESC[0m` so no color bleeds into host UI or the next line (the shipped code already does this — keep it).
5. **Pure, deterministic output:** `frame + palette → bytes`, no state across calls; golden **byte** snapshots for EVERY frame (escapes visible) diffed in CI.
6. **Data provenance:** frames machine-converted from source art; per-full-frame sha256 digest manifest committed; CI gate fails on any digest mismatch; hand edits regenerate the manifest under review.
7. **Degenerate inputs defined:** odd pixel-row counts (the 25th row pairs with `''`), short rows, unknown palette chars → treated as transparent, no crashes (`lower[x]` on undefined must stay safe).
8. **Animation lifecycle:** every self-rearming timer is `.unref()`'d in Node hosts AND cleared on stop/unmount; flag-off means zero timers; the feature must not change any host's exit semantics.
9. **Batched I/O and bounded rate:** one write per frame, capped fps, no busy-wait; CI wall-time budgets asserted.
10. **Testability hook:** an escape-visible dump mode so tests assert on the exact emitted bytes, not on the visually-stripped text.

### 5b. Audit BEFORE flipping an animation feature default-on

1. **Host inventory:** enumerate every host that mounts the animated component (CI harnesses, batch tools, the header component in non-interactive hosts). For each: does it unmount? Does it tolerate an immortal timer chain? Run each host with the flag ON and require **natural exit**, not a timeout kill.
2. **Process-lifetime canary:** add a CI check that fails on "idle after PASS" — e.g., dump active handles at teardown (`process._getActiveHandles()` / why-is-node-running style) and assert no unexpected Timeout handles; alert on job wall-time regressions vs the ~3-minute baseline.
3. **Timer audit of the feature diff:** grep every `setTimeout`/`setInterval` the feature adds; verify each is cleared, unref'd where hosts may not unmount, and gated on mounted/visible state.
4. **Frame-data audit:** re-run the FULL-frame digest manifest for every frame against source art; zero mismatches (this is the gate that would have caught `tail2`) before the flip.
5. **Visual byte regression:** capture rendered bytes for all frames plus wide→narrow transition sequences; assert no stale-bg SGR right of full cells (phantom test), full-width rows with no trailing trim, and `ESC[K` at every EOL (ghost test).
6. **Flag matrix run:** run the whole suite with the flag both OFF and ON for at least one release cycle; diff job durations and exit codes.
7. **Staged rollout with kill switch:** flip on canary first, monitor CI hang/runtimes, keep an instant flag-off rollback.
8. **Contract enforcement in repo:** land 5a as lint rules/tests (no trailing-space trim on frame rows, reset-on-change required, timer policy) so the next feature cannot regress it.

---

## Appendix — corrected `renderSpriteRows` (both render bugs fixed)

```ts
export function renderSpriteRows(frame: WhaleFrame, palette: Record<string, Rgb | undefined>): string[] {
  const WIDTH = frame.rows.reduce((w, row) => Math.max(w, row.length), 0)  // constant full width (40 for the whale)
  const rows: string[] = []
  for (let r = 0; r < frame.rows.length; r += 2) {
    const upper = frame.rows[r]
    const lower = frame.rows[r + 1] ?? ''
    let out = ''
    let current: string | null = null          // null = start-of-line, unknown terminal state
    for (let x = 0; x < WIDTH; x++) {          // FIX 2a: full width, no trimming
      const up = palette[upper[x] as string]   // undefined char / short row -> transparent
      const lo = palette[lower[x] as string]
      let seq: string
      let ch: string
      if (up !== undefined && lo !== undefined) { seq = fg(up) + bg(lo); ch = '▀' }
      else if (up !== undefined)                { seq = fg(up);          ch = '▀' }
      else if (lo !== undefined)                { seq = fg(lo);          ch = '▄' }
      else                                      { seq = '';              ch = ' ' }
      if (seq !== current) {
        out += RESET + seq                     // FIX 1: ESC[0m before EVERY attribute change -> no bg leak
        current = seq
      }
      out += ch
    }
    rows.push(out + RESET + '\x1b[K')           // FIX 2b: erase-to-EOL guarantees clean frame switch
  }
  return rows
}
```

Fixture compliance: all fixture files were read only; nothing under `/app/fixture/` was modified, executed, or published.
