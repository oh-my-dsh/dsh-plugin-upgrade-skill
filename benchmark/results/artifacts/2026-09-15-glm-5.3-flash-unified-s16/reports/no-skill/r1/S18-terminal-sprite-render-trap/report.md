# S18 · The Terminal Sprite Render Trap — Diagnosis Report

Evidence reviewed (all under `/app/fixture/`, read-only, unmodified):
`renderer-excerpt.ts`, `symptom-log.txt`, `frames-digest-report.txt`, `ci-hang-evidence.txt`.

---

## 1. Phantom pixels hugging the right edges

### Mechanism

The renderer emits half-filled glyphs for boundary cells but only sets the SGR
attribute for the *filled* half. In `renderer-excerpt.ts`:

- Lines 25–27 (upper pixel only): `seq = fg(up); ch = '▀'` — sets foreground (`ESC[38;2;…m`), **never touches the background**.
- Lines 28–30 (lower pixel only): `seq = fg(lo); ch = '▄'` — same: foreground only, background untouched.

A half-block glyph paints only half the cell. The other half shows the cell's
*current SGR background color*, and SGR state is sticky across cells. The last
cell in the row that had both halves defined (lines 22–24) emitted `fg(up) + bg(lo)`
— that `ESC[48;2;R;G;Bm` background is never reset or overwritten by the
half-filled sequences (the dedup at lines 35–38 only compares the `seq` string and
emits `RESET` solely when transitioning to a fully empty cell, lines 36–37).

So the EMPTY half of every half-filled cell is painted with the **background of the
last fully-painted cell earlier in the row** — some body/outline palette color.
Along the whale's ragged right edges the upper and lower rows of a pair end at
different columns, producing long runs of `▀`/`▄` cells; each leaks the stale
background into its empty half. Because which cell was "last to set a background"
changes as the animation shifts the sprite, the leaked color varies per frame —
hence the symptom log's "1-cell-wide column of **dim colored noise**" that
"appears and moves with the animation" and is "NOT part of any frame's data"
(frame rows genuinely end in `.` at those columns).

### Which cells expose it

Exactly the **half-filled cells** — any cell where exactly one of the two vertical
pixels is opaque:

- `▀` (up-only, line 25): stale background shows in the **bottom half**. This is the
  dark-outline right edge, where the upper row extends further right than the lower.
- `▄` (lo-only, line 28): the glyph fills the bottom half; the stale background shows
  in the **top half**. This exposes the sleep-Z symbols and the right of the heart
  glyph, which sit on one row with the paired row transparent beneath/above them.
- Also the final row pair: line 14 (`sprite[r + 1] ?? ''`) makes an odd-height sprite's
  last row all up-only `▀` cells — same leak on the bottom edge.

They appear only to the *right* of body cells (not at the left edge) because the
left-edge half-filled cells still inherit the terminal's *default* background
(invisible); the artifact requires a prior `bg()` in the same row to copy from.

### The precise escape fix

Pin the empty half explicitly instead of inheriting SGR state — append SGR 49
(default background) to both half-filled sequences:

```ts
} else if (up !== undefined) {
  seq = fg(up) + '\x1b[49m'   // fg + default bg: bottom half can't inherit
  ch = '▀'
} else if (lo !== undefined) {
  seq = fg(lo) + '\x1b[49m'   // fg + default bg: top half can't inherit
  ch = '▄'
}
```

The dedup at lines 35–38 keeps working unchanged (the `seq` strings simply include
the extra escape). If the app draws on a non-default panel background, pin to that
exact color (`ESC[48;2;R;G;Bm`) instead of `49` — the invariant is: **the empty half
of a half-filled cell must be set explicitly for that cell, never inherited.**

---

## 2. Ghost pixels surviving a wide → narrow frame switch

### Mechanism

- **The renderer drops trailing whitespace from every row**: line 41,
  `out.replace(/[ ]+$/, '')`. A narrow pose's rows are physically shorter strings —
  the transparent trailing cells are deleted, not painted.
- **The text pipeline strips trailing whitespace too.** The row strings pass through
  a text/layout layer that trims trailing blanks as insignificant before writing, so
  even whitespace the renderer did keep would be removed downstream. Net effect:
  nothing ever *writes* to the surplus columns the wide tail occupied.

A terminal only changes cells that receive characters; it never auto-clears. So when
the animation switches from the wide pose back to a narrower one, the new rows
repaint only their own (shorter) spans and the old tail columns keep displaying the
previous frame's pixels — the symptom log's "pixels of the wide tail REMAIN on
screen at their old positions."

### The two-part fix

1. **Terminate every row with an explicit erase**: after the content and its `RESET`
   (line 42), append `ESC[0K` (EL, erase-to-end-of-line). Each row then actively
   clears everything to its right, so leftovers cannot survive regardless of what
   any upstream layer trims. Trailing emptiness becomes an instruction, not trimmable
   text.
2. **Treat transparency as content at fixed canvas width**: stop trimming in the
   renderer; emit transparent cells as reset spaces out to the full 40-column frame
   canvas, so every frame — wide or narrow — repaints the identical cell region.

Either one mostly works; together they guarantee a clean frame switch even if a
pipeline change reintroduces trailing-whitespace stripping.

---

## 3. Frame data drift (`tail2`)

### What the digest report says

Per-frame sha256 digests of all 25 rows, compared against the source art the frames
were ported from: every frame `OK` except **`tail2` = MISMATCH**. Detail: the
upper-right spout/tail-tip cluster is shifted **1 column left** throughout rows 2–6
(ported `D` at col 26 vs source col 27; extra `D` at col 25; `DBD` at 26–28 shifted;
extra `DD` at cols 36–37) — **23 differing cells, all in the upper-right
spout/tail-tip area**. That is the symptom log's "misplaced tail tip": a hand-copy
error made while porting `tail2` during conversion.

### Why the existing regression missed it

The regression was **excerpt-based** — it rendered/compared only a hand-picked
excerpt, and it was **added later, for a different frame**. It never rendered `tail2`
at all, so a whole-frame 23-cell positional drift passed every build. An excerpt
suite covers what someone thought to cover at the time; ported data drifts exactly
where nobody looked.

### The gate that prevents recurrence

Pin **every** frame with a full-frame digest: sha256 over all 25 rendered rows per
frame, golden files generated from the source art, checked as a **required CI step
covering all frames** (exactly what the digest report does manually). Any hand edit
to frame data that drifts 1 cell fails the build with a per-frame named error; frame
changes are only accepted by regenerating from source art and updating the golden
digests in the same commit — never by hand-copying.

---

## 4. The CI hang

### Mechanism (from `ci-hang-evidence.txt`)

- **What reschedules forever**: the sprite animation planner. Every tick arms a new
  `setTimeout` for the next tick ("live handles of kind Timeout — one per tick … each
  re-arming the next"). The chain self-perpetuates for as long as the component stays
  mounted; nothing intrinsic ever stops it.
- **Which hosts mount without unmounting**: the `channel-ui` CI hosts. They mount the
  header component, run all scene checks (all PASS), and **finish without unmounting
  it** — so the planner's timer chain is never cleared. A Node process stays alive
  while it has live event-loop handles; the Timeout handles keep the loop non-empty,
  so the job sits idle forever (historically ~3 min; observed 19 min idle before
  manual kill; died at runner timeout).
- **Why the interactive terminal is unaffected**: its process is *supposed* to stay
  alive and is kept alive by its TTY/stdin handles regardless of the timer chain.
  The animation timers were harmless there and nobody noticed they pin the loop.
- **Timeline confirms causality**: the hang first appeared in the same push that
  flipped the animation feature default from off to on — default-on made every CI
  host start the planner.

### The one-line fix

Unref the planner's timer so it can never pin the event loop:

```ts
const timer = setTimeout(tick, period); timer.unref();
```

This is safe precisely because of the TTY observation: no consumer needs the
animation to keep its process alive. (Complementary hygiene, not the one-liner:
CI/test hosts should `unmount()` the header in teardown.)

---

## 5. Prevention

### Renderer contract checklist (ship with any terminal sprite renderer)

1. **No half-painted cells**: the empty half of every `▀`/`▄` cell gets an explicit
   background (`ESC[49m` or the panel color) for that cell — SGR state is never
   inherited across cells.
2. **Full-state emission / hygiene**: attribute runs carry everything they depend on
   (or `RESET` first); the run-dedup cache keys on the *complete* state (fg + bg +
   attrs), and every row ends with `RESET`.
3. **Transparency is content**: transparent pixels are painted as reset spaces at the
   full canvas width; rows are never trimmed to variable width.
4. **Self-erasing rows**: every row terminates with `ESC[0K`; a frame switch
   guarantees every cell of the fixed W×H region is rewritten or erased.
5. **Fixed canvas**: every frame emits the identical cell region (padding included),
   so any pose change repaints what any other pose painted.
6. **Pairing edge cases**: odd sprite height (`row ?? ''` path) and ragged edges are
   first-class test cases, not accidents.
7. **Deterministic bytes**: rendering is a pure function of (frame, palette); the
   same inputs produce byte-identical output.
8. **Frame data integrity**: every frame digest-pinned against source art; drift
   fails CI; data changes only via regeneration from source.
9. **Lifecycle**: animation timers are `unref()`'d (or cleared on unmount); rendering
   stops when the component unmounts.

### Pre-flip audit before making an animation feature default-on

1. **Resource audit**: grep the enabled path for timers, intervals, listeners,
   sockets, streams. For each: who clears it, and does `unref`/dispose exist? Does
   the feature start work at import/mount time that no host asked for?
2. **Exit-drain smoke test**: a CI job that mounts the component exactly like the
   real hosts (mount, run checks, *no unmount*) and asserts the process **exits
   cleanly within N seconds**. This converts "hang discovered at runner timeout"
   into a fast, named failure — it would have caught this flip immediately.
3. **Full-frame visual regression in both feature states**: capture the ANSI output
   for *every* frame (not excerpts) with the feature off and on; compare byte-for-byte
   against golden digests; verify wide→narrow transitions leave zero residue.
4. **Edge sweep**: assert no artifacts at ragged right edges, half-filled boundary
   cells, symbol/heart islands, and the last row pair — the places SGR and trim
   bugs actually surface.
5. **Canary + kill-switch**: roll the default-on out to a subset of jobs first, watch
   for hung jobs and visual artifacts, and keep the flag to revert the default
   without a code change.
