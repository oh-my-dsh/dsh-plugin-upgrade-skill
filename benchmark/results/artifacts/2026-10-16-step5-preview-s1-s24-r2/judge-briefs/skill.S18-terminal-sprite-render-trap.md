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

# S18 · The Terminal Sprite Render Trap — Root-Cause Report

**Subject:** half-block whale sprite (25 rows × 40 cols of palette chars → 13 terminal rows) that
developed phantom edge pixels, ghost pixels after frame switches, one drifted frame, and a
"PASS but never exits" CI job after the animation feature was flipped default-on.

**Evidence used (read-only fixture):**

| File | What it gave us |
|---|---|
| [`fixture/renderer-excerpt.ts`](../fixture/renderer-excerpt.ts) | the renderer exactly as it shipped |
| [`fixture/symptom-log.txt`](../fixture/symptom-log.txt) | user-visible symptoms and their positions |
| [`fixture/frames-digest-report.txt`](../fixture/frames-digest-report.txt) | per-frame sha256 vs. source art |
| [`fixture/ci-hang-evidence.txt`](../fixture/ci-hang-evidence.txt) | the hung job's process state |
| [`fixture/README.md`](../fixture/README.md) | pack contents |

**Method note (honesty).** The fixture ships the renderer excerpt only — no frame arrays, no
palette, no writer/text-pipeline code. To avoid guessing, I re-executed the shipped renderer
*verbatim* (copied byte-for-byte out of `renderer-excerpt.ts`) inside this session against
reconstructed sprites and a minimal ANSI-aware cell grid, and read the resulting escape streams.
Every claim marked **[verified]** below is an observed output of that re-execution; claims about
the digest report and the CI hang are taken directly from the evidence files. Nothing in
`fixture/` was modified.

---

## 1. Phantom pixels at the right edges

### The mechanism

The half-block technique needs **both** SGR colour channels in *every* cell:

* `SGR 38;2;r;g;b` — foreground → the **upper** pixel of the glyph
* `SGR 48;2;r;g;b` — background → the **lower** pixel of the glyph

The shipped renderer emits a *partial* pair in two of its three branches
([`renderer-excerpt.ts`](../fixture/renderer-excerpt.ts)):

```ts
if (up !== undefined && lo !== undefined) { seq = fg(up) + bg(lo); ch = '▀' }  // complete
else if (up !== undefined)               { seq = fg(up);            ch = '▀' }  // NO background
else if (lo !== undefined)               { seq = fg(lo);            ch = '▄' }  // NO background
else                                     { seq = '';                ch = ' ' }  // RESET
```

**The SGR state that persists across cells is the background (`48;2;…`).** Only the full-cell
branch ever emits a background, and SGR is *sticky*: once `48;2;r;g;b` has been written it stays
in force for every subsequent cell until another `48` or a reset. The `current` cache
(`if (seq !== current)`) makes this worse rather than better — after one full cell has set the
background, later half-filled cells emit *nothing* for the background channel, so the stale value
is carried silently, cell after cell.

**The cells that expose it are the half-filled cells** — cells where exactly one of the two
vertical pixels is painted. For those cells the unpainted half of the glyph is painted with the
*inherited* background of the last cell that set one:

* `▀` (upper painted, lower transparent) → the phantom is in the **lower** half
* `▄` (lower painted, upper transparent) → the phantom is in the **upper** half

**[verified]** Reconstructed sprite row-pair (upper `BBBBBBBBDBBB…`, lower `BBBBBBBBD……`) —
body block, dark outline at col 8, then a 3-cell single-pixel taper at cols 9–11:

```
col  8  ESC[38;2;40;44;52m  ESC[48;2;40;44;52m  ▀     <- full cell: sets BOTH channels
col  9  ESC[38;2;120;170;220m                  ▀     <- half-filled: foreground only
col 10  (no escape)                            ▀     <- cache suppresses re-emission
col 11  (no escape)                            ▀
col 12  ESC[0m                                        <- trailing reset, too late
```

Cols 9–11 never touch the background, so all three `▀` glyphs paint their **lower** halves with
the outline's `40;44;52` inherited from col 8 → a 1-cell-wide column of dim dark noise sitting
directly to the right of the outline. That is symptom 1 in
[`symptom-log.txt`](../fixture/symptom-log.txt) exactly: the artifact hugs the dark outline, the
sleep-Z symbols and the heart glyph — all places where the sprite tapers into single pixels — and
it moves with the animation because each pose makes a different set of cells half-filled.

Two secondary details worth recording:

* **The per-row `let current = ''` reset does not protect.** It only stops the *renderer* from
  re-emitting; the *terminal's* background is still whatever the last `48` in that row set. The
  row-final `RESET` (and the `if (!row.endsWith(RESET)) row += RESET` fallback) only cleans up
  **after** the row has been painted — it cannot retroactively un-paint the phantom.
* **Fully transparent cells are safe** (`seq === ''` differs from the cached colour, so `RESET`
  is emitted). That is why the artifact is confined to the sprite's edge and reads as "noise next
  to the outline" rather than a full-width smear — and why it is easy to mistake for frame data.

### The precise escape fix

Emit a **complete** fg+bg pair for **every** cell, substituting the terminal defaults for the
transparent half so nothing is ever inherited:

```ts
const FG_DEFAULT = '\x1b[39m'   // default foreground
const BG_DEFAULT = '\x1b[49m'   // default background

// per cell:
const f = up === undefined ? FG_DEFAULT : fg(up)
const b = lo === undefined ? BG_DEFAULT : bg(lo)
if (f !== curF) { out += f; curF = f }
if (b !== curB) { out += b; curB = b }
out += up !== undefined ? '▀' : (lo !== undefined ? '▄' : ' ')
```

`39`/`49` are the precise, minimal fix: they clear exactly the channel that is transparent without
clobbering other attributes, and they make the half-filled cell's empty half render as the
terminal's own background instead of a stale colour. (A blunter `\x1b[0m` before each cell is also
correct but noisier.) Keep the unconditional row-final `\x1b[0m`.

**[verified]** With that change the same row emits `…ESC[38;2;120;170;220m ESC[49m ▀ ESC[39m ␣␣␣…`
— the empty half is explicitly defaulted, and the phantom column disappears.

---

## 2. Ghost pixels after a frame switch

### What the renderer drops

```ts
let row = out.replace(/[ ]+$/, '')      // <-- trailing transparent cells are DELETED
if (!row.endsWith(RESET)) row += RESET
```

Every trailing space glyph — i.e. exactly the padding cells that would overwrite the previous
frame's wider columns — is trimmed off. The emitted row is therefore only as long as the
**current** frame's content.

### What the text pipeline does

The downstream writer/normalizer strips trailing whitespace from each line (`trimEnd` /
right-trim as part of line normalisation) before it reaches the terminal. So even if the renderer
had emitted padding, it would be dropped in flight — which is why a "just don't trim in the
renderer" fix is not durable on its own.

### Why ghosts survive

A terminal is **not** erase-on-write. Writing a shorter row leaves the cells to the right of the
last written column untouched, still holding the previous frame's glyph *and* its SGR colours. So
a wide pose → narrow pose switch repaints only the narrow frame's columns and the wide tail's
surplus columns stay on screen at their old positions — symptom 2.

**[verified]** Wide row (tail out to col 30) → narrow row (tail at cols 8–9):

| variant | cells written by the narrow frame | result |
|---|---|---|
| shipped renderer | 10 | `BBBBBBBDTTTTTTTTTTTTTTTTTTTTTTTT` — 20 tail cells of the wide frame survive |
| padded to full width, pipeline preserves | 40 | `BBBBBBBDTT________________________` — clean |
| padded, but pipeline strips trailing blanks | 10 | ghosts return — the padding never reaches the terminal |
| explicit erase of the sprite row first | 40 | `BBBBBBBDTT________________________` — clean regardless |

### The two-part fix

1. **Renderer — pad, never trim.** Every row is emitted at the sprite's full declared width with
   explicit clear cells (`ESC[39m ESC[49m` + `' '`) for the transparent tail (this is the same
   code path as the §1 fix, so one change fixes both symptoms). A narrower frame then paints the
   whole rectangle and overwrites the previous frame's pixels.
2. **Writer / frame switch — stop dropping the padding, and erase the viewport.** Preserve
   trailing whitespace in the sprite's own row strings (or express the clear cells so they cannot
   be trimmed), **and** actively erase the sprite's cell rectangle at the start of each frame —
   e.g. position at the sprite's top-left and issue `ESC[2K` for each of the 13 sprite rows, or a
   scoped `ESC[<top>;<left>H` + erase-to-end-of-display. Erase to
   `max(previousFrameWidth, currentFrameWidth)` columns, because the previous frame may be wider
   than the sprite's nominal width if the frames are not uniform.

Part 1 alone is defeated by the pipeline's trailing-whitespace strip; part 2 alone works but
leaves the renderer emitting content-length rows, which is fragile for any future consumer
(diffing, tests, logging). Ship both.

---

## 3. Frame data drift (`tail2`)

### What the digest report says

[`frames-digest-report.txt`](../fixture/frames-digest-report.txt) compares sha256 of each frame's
25 rows against the source art the sprite was ported from. Every frame is **OK** except
**`tail2` — MISMATCH**, 23 differing cells, **all in the upper-right spout / tail-tip area**:

* row 2: ported `D` at col 26, source `D` at col 27 — a 1-column left shift
* row 3: ported has an extra `D` at col 25; the `DBD` run at cols 26–28 is shifted left 1; an extra
  `DD` at cols 36–37
* rows 4–6: the whole upper-right cluster is shifted 1 column left throughout

Cause stated in the report: *"The ported tail2 was hand-copied during conversion."* This is
symptom 3 — the misplaced 6-pixel tail-tip cluster.

### Why the existing regression missed it

The regression is **excerpt-based**: it asserts on a named slice of rows/columns rather than the
whole frame, and it was *"added later for a different frame"*, so its excerpt simply does not
cover `tail2`'s upper-right region. Three consequences:

* The drifted cells were never looked at — an excerpt only checks the cells it names.
* An excerpt that asserts *presence* of characters (rather than exact coordinates) cannot see a
  uniform 1-column shift at all.
* An excerpt cannot see insertions/deletions — the extra `D` at col 25 and the extra `DD` at
  36–37 shift everything to their right, which a whole-rectangle digest catches immediately.

In short: the test's coverage was narrower than the data's defect surface, and it pinned
*positions it happened to sample* instead of *the frame as a whole*.

### The gate that prevents recurrence

1. **Full-rectangle digest per frame, in CI.** A golden sha256 over the complete 25 × 40
   rectangle of *every* frame — `standard`, `blink`, `fin1`, `fin2`, `spout1-6`, `tail1-4`,
   `heart1-3`, `sleep1-5` — generated from the source art and re-checked on any commit that
   touches frame data or the palette. Transparent cells (`.`) must be **inside** the hashed
   region, otherwise shifts and insertions outside the painted bounding box are invisible.
2. **Structural invariants alongside the digest:** every row exactly 40 chars; only palette keys
   appear; the bounding box is within the sprite; frame count and dimensions match the declared
   sprite geometry. These catch a "fix" that edits the golden file to match bad data.
3. **Rendered-stream snapshot:** hash the *escape output* (`renderSpriteRows` result) per frame as
   well, so a renderer change and a data change cannot cancel each other out.
4. **Process gate, not just a test:** frames must be **generated** from the source art by a
   script, never hand-copied. Any hand-pasted frame requires a digest plus reviewer sign-off, and
   the digest report becomes a required CI step so the mismatch fails the build instead of
   shipping. Re-run the existing report now to confirm `tail2` is the only drift and then correct
   it from source art.

---

## 4. The hang: PASS, then the job never exits

### The mechanism

[`ci-hang-evidence.txt`](../fixture/ci-hang-evidence.txt) records: all scene checks PASS, then the
process sits idle; it never exits and is killed at the runner timeout (a job that used to finish
in ~3 minutes; one local run idled 19 minutes). At kill time there is **no running test and no
pending assertion** — the only live handles are of kind **Timeout**, one per tick of the sprite
animation planner, **each re-arming the next**.

Node exits when the event loop has no pending work. A self-rescheduling planner is a perpetual
handle:

```ts
tick() { /* advance frame, repaint */ this.timer = setTimeout(() => this.tick(), this.interval) }
```

Each expiry enqueues the next timeout, so the loop never drains. The work is *finished* — every
test passed, every assertion resolved — but "loop empty" is never reached, so the process never
exits and the runner waits for its timeout.

### Which hosts, and why only after the flip

* The planner reschedules `setTimeout` **for as long as its component stays mounted**.
* The hosts in question — the CI scene-check hosts — **mount the header component and finish
  WITHOUT unmounting it**, so the planner's cancellation path never runs and the timer chain is
  never torn down.
* With the animation default **off**, no CI host ever started the planner, so the leak was latent.
  Flipping the default **on** started it in those hosts — which is why the hang first appeared in
  the same push that flipped the default (the timeline in the evidence confirms this).

### Why the interactive terminal is unaffected

The interactive product's process is kept alive by the **TTY/stdin handles** regardless of the
timer chain. An extra never-ending timer changes nothing about a process that already cannot
exit — and the user ends it by closing the terminal. That is precisely why the bug was invisible
locally and only showed up in a non-interactive host: **the leak is masked wherever something else
already pins the loop open.**

### The one-line fix

`unref()` the planner's timer so it no longer holds the event loop open:

```ts
this.timer = setTimeout(() => this.tick(), this.interval)
this.timer.unref()          // <-- the one line: the chain keeps running but no longer blocks exit
```

This is the fix that works *even when the host never unmounts* — which is the case that actually
bit CI. The complementary hygiene, which should ship with it:

* `clearTimeout(this.timer)` in the component's unmount/dispose path (so the animation genuinely
  stops, not merely stops blocking exit), and
* every host that mounts an animated component must unmount it (or call `planner.stop()`) when its
  work is done.

**Detection gate:** a CI step that asserts the job exits by itself (a generous watchdog, e.g. "the
process must be gone 30 s after the last assertion"), or an explicit
`process._getActiveHandles()` / `--detectOpenHandles` assertion after the scene checks. "All tests
passed" must never again be mistaken for "the job finished".

---

## 5. Prevention

### 5a. Renderer contract checklist — ship with every terminal sprite implementation

| # | Contract item | Why (maps to) |
|---|---|---|
| 1 | **Complete SGR per cell.** Every cell emits both `38;2` and `48;2`; a transparent half uses `39`/`49` (or `0m`). No cell may rely on inherited state. | §1 phantom pixels |
| 2 | **Sticky-state discipline.** Any fg/bg cache mirrors the terminal exactly and tracks the two channels *independently*; the row-final `ESC[0m` is emitted unconditionally, never conditionally on `endsWith`. | §1 |
| 3 | **Full-width rows.** Every row is padded to the sprite's declared width with explicit clear cells; **no trailing-whitespace trimming anywhere** — renderer *or* writer. | §2 ghost pixels |
| 4 | **Frame-switch erase.** The sprite viewport is erased (or the previous frame's bounding box fully repainted) at each frame, to `max(prevWidth, curWidth)` columns. | §2 |
| 5 | **Geometry invariants.** Uniform row width (40); an odd row count pads the final lower pixel with an explicit transparent value; glyph choice is *derived* from which halves are painted (`▀` upper, `▄` lower, space for none). | §1, §2 |
| 6 | **Deterministic output.** The escape stream for a given frame+palette is byte-stable (no clock, terminal size or cursor position in the output), so it can be snapshotted and diffed. | §3 |
| 7 | **Generated, not transcribed, frame data.** Frames come from a script over the source art; every frame is digest-pinned over its **full rectangle** including transparent cells. | §3 |
| 8 | **Lifecycle hygiene.** Every recurring timer is `unref()`'d **and** cancelled on unmount/dispose; no component keeps a rescheduling handle alive after its work is done. | §4 |
| 9 | **Test matrix.** (a) full-rectangle digest per frame vs. source art; (b) rendered-stream snapshot per frame; (c) wide→narrow frame-switch residue test asserting the viewport equals the new frame exactly; (d) SGR-hygiene test asserting every glyph is preceded by an explicit fg *and* bg for that cell; (e) a CI "process exits on its own" test. | §1–§4 |

### 5b. The audit to run BEFORE flipping an animation feature default-on

1. **Visual, at default-on, in a real terminal.** Render *every* frame and diff against
   default-off. Inspect the right edges specifically — outline, sleep-Z, heart — for phantom
   columns. This is the one check that would have caught symptom 1 on day one.
2. **Automated SGR hygiene.** Parse the emitted stream and assert that no glyph is painted while
   either colour channel is unset for that cell (i.e. every cell's stream contains an explicit
   fg and bg before its glyph).
3. **Full-frame digest gate on the flip commit.** Run the digest report over all frames and the
   whole rectangle against source art — not excerpts — and require it green.
4. **Frame-switch sweep.** For every ordered pair of frames (at minimum every wide→narrow and
   narrow→wide transition), render into a grid and assert the viewport equals the new frame
   exactly, with zero residue cells.
5. **Handle/liveness audit.** Run the CI job and assert it exits by itself; assert no `Timeout`
   handles remain after the checks; grep the animation path for `setTimeout`/`setInterval` and
   confirm each has both an `unref()` and a cancel.
6. **Host audit.** Enumerate every host that mounts the animated component and confirm each has an
   unmount/dispose (or explicit `stop()`) path. The CI scene hosts in particular must not "mount
   and finish" — that pattern is what turned a latent timer leak into a hung pipeline.
7. **Interactive-parity check.** Confirm the interactive terminal still behaves — and note that it
   will, because TTY handles mask timer leaks. The audit must therefore be run in the
   **non-interactive host**, never locally, or it proves nothing.
8. **Staged rollout.** Flip behind the flag, run once in CI on the same commit, and promote the
   default only after 1–7 pass; keep the old default reachable for one release so a rollback is a
   config change, not a revert.

Items 3–6 are the structural analogue of the plugin-upgrade skill's *pre-flight* discipline — a
read-only, executable self-check run **before** the change lands (see
[`skills/plugin-upgrade/references/pre-flight.md`](../../../skills/plugin-upgrade/references/pre-flight.md)
and its `ghost-host-check.mjs` running-host probe). The same shape applies here: a small, scripted,
mandatory gate that runs before the default flips, rather than a post-incident postmortem.

---

## Summary table

| Symptom | Root cause | Fix |
|---|---|---|
| Phantom pixels hugging right edges | Half-filled cells emit foreground only; the **background (`48;2`) persists** from the last full cell, so the empty half of the glyph is painted with a stale colour | Emit a complete fg+bg pair per cell, using `ESC[39m`/`ESC[49m` for transparent halves; track the two channels separately |
| Ghost pixels after wide→narrow switch | Renderer trims trailing spaces (`replace(/[ ]+$/, '')`) and the text pipeline strips trailing whitespace, so the narrow row is shorter than the wide one and the terminal never erases the surplus columns | (1) pad every row to the full sprite width with explicit clear cells and stop trimming; (2) erase the sprite viewport on frame switch, to `max(prev, cur)` width |
| `tail2` tail tip misplaced | Hand-copied frame; 23 cells drifted in the upper-right area | Full-rectangle sha256 digest per frame in CI (transparent cells included), frames generated from source art, not transcribed |
| CI job PASS but never exits | Self-rescheduling planner `setTimeout` keeps a live Timeout handle forever; CI hosts mount the header and never unmount; interactive terminals are masked by TTY/stdin handles | `this.timer.unref()` (one line) + `clearTimeout` on unmount + a CI watchdog asserting the process exits |


## Required output (JSON only)
{"decisions":[{"id":"<criterion-id>","verdict":"pass|partial|fail|missing","reason":"short"}],"caps":[{"id":"<cap-id>","triggered":false,"reason":"short"}]}
Every criterion and cap exactly once. pass=full points, partial=half, fail/missing=0; a triggered cap caps the total.