# S18 · Terminal Sprite Render Trap — Analysis Report

Task: S18-terminal-sprite-render-trap (read-only diagnosis)
Skill mode: Mode A · inspect (read-only investigation and report; no writes to the fixture, no migrations, no installs).
Evidence: `environment/fixture/` — `renderer-excerpt.ts`, `symptom-log.txt`, `frames-digest-report.txt`, `ci-hang-evidence.txt`, `README.md`.

Subject: a terminal sprite renderer (whale, 25 pixel rows × 40 pixel columns → 13 terminal rows × 40 cells) using the half-block technique: one terminal cell packs two vertical pixels into one glyph — `▀` with foreground = upper pixel and background = lower pixel (or `▄` with foreground = lower pixel when only the lower half is set). '.' = transparent. An animation feature was added around the sprite; flipping it default-on exposed four independent defects.

---

## 1. Phantom pixels at the sprite's right edges

### Mechanism

The renderer maintains a one-entry SGR cache `current` and emits an escape sequence only when the *desired* sequence `seq` differs from `current`:

```ts
if (up !== undefined && lo !== undefined) { seq = fg(up) + bg(lo); ch = '▀' }
else if (up !== undefined)               { seq = fg(up);        ch = '▀' }   // lower pixel transparent
else if (lo !== undefined)               { seq = fg(lo);        ch = '▄' }   // upper pixel transparent
else                                     { seq = '';            ch = ' ' }   // both transparent
if (seq !== current) { out += seq === '' ? RESET : seq; current = seq }
out += ch
```

The bug is what the half-filled cases **omit**. `fg(up)` is a *partial* SGR: it sets only the foreground (38;2;…) and leaves the background color exactly as the previous cell's SGR state left it. `▀` paints the cell's **lower half with the current background color** — which is not "transparent", not the terminal default: it is the *background of whatever cell came before*.

The sprite's right edge is precisely where half-filled cells cluster: a pair of pixel rows where the upper pixel is opaque (dark outline pixel, the last stroke of a sleep-Z, the tip of the heart) and the lower pixel is '.' transparent. Sequence of cells at that edge:

1. A full cell (e.g. outline or heart body) emits `fg(a) + bg(b)` — the background `b` (outline/heart color) is now the *terminal's active SGR background*.
2. The next cell has `up` set, `lo` transparent → emits only `fg(up)`. The glyph `▀` upper half = `up` (correct pixel), but its **lower half is painted with the stale background `b`** — a phantom pixel in the EMPTY half of a half-filled cell.
3. If the following cell(s) are fully transparent, `seq = ''`… but only after the `seq !== current` check fires `RESET`. Until that RESET, any emitted `ch = ' '` also carries the stale background as a filled block.

Which SGR state persists across cells: the **background color set by `48;2;r;g;b`** (and symmetrically the foreground set by `38;2;…` for the `▄`-only case, whose *upper* half then shows the stale foreground). The SGR state machine in the terminal is global per line/cursor position; the renderer's `current` cache assumes each emitted `seq` fully defines the cell's colors, but the half-filled cases define only half of them.

Which cells expose it: exactly the cells where one of the pair is opaque and the other is '.' — at the right edge the pixel rows end in '.' below an opaque upper pixel (per the symptom log, "frame rows end in '.' at those columns"), i.e. the column just right of the dark outline, next to the sleep-Zs, and right of the heart. Because the stale color comes from the *neighboring* edge color, the artifact reads as a 1-cell-wide column of dim colored noise "hugging" the edge, and it moves with the animation because the edge colors and half-filled positions change per frame. It is not in any frame's data — it is manufactured by the escape stream.

### Precise escape fix

Every cell must emit a **complete** SGR pair — never rely on SGR persistence across cells. For half-filled cells, explicitly set the *other* half to the terminal background color (or the app's declared background RGB):

```ts
const TERMINAL_BG: Rgb = [bgR, bgG, bgB]  // the surface the sprite is drawn on
// upper opaque, lower transparent:
seq = fg(up) + bg(TERMINAL_BG)   // was: fg(up)
// lower opaque, upper transparent:
seq = fg(TERMINAL_BG) + bg(lo)   // was: fg(lo) — upper half must not show stale fg either
// both transparent:
seq = fg(TERMINAL_BG) + bg(TERMINAL_BG)  // was: '' (space relying on whatever is active)
```

(If a default-background escape is preferred, `\x1b[49m` sets the default background and `\x1b[39m` the default foreground — the essential point is that **each cell's emitted sequence sets both halves' colors explicitly**, so no state leaks across the `seq !== current` boundary.) After this change the `current`-diff cache stays valid because every `seq` is now a total function of the cell.

---

## 2. Ghost pixels surviving a switch to a narrower frame

### What the renderer drops from each row

```ts
let row = out.replace(/[ ]+$/, '')
```

Each rendered row has its **trailing transparent cells trimmed** before being pushed. A wide pose (tail swung out, rows reaching further right) produces longer strings than the following narrow pose.

### What the text pipeline does to trailing whitespace

The row strings are handed to the terminal through the ordinary text pipeline (write lines / diff-based painter), which treats **trailing whitespace as insignificant**: trimmed or never-differentiated space cells at the end of a line are simply not rewritten, and no erase is emitted for them. So when the narrow frame's row is written over the wide frame's row:

- the narrow row's own columns overwrite the old pixels correctly ("the narrow frame renders fine");
- the **surplus columns** (the wide tail's rightmost cells) are never written by the shorter row and never erased by anything — the previous frame's tail pixels stay on screen at their old positions. Ghosts.

The two defects compose: trimming removes exactly the cells that would have overwritten the previous frame's surplus pixels, and the pipeline's trailing-whitespace semantics guarantee that even *untrimmed* trailing spaces would not reliably clear colored cells (a space only clears if its *background* is actually emitted — see §1's stale-bg problem, and many diff writers skip whitespace-only changes outright).

### The two-part fix that guarantees a clean frame switch

1. **Full-width rows, no trimming**: render every row padded to the sprite's full cell width (40 cells), with transparent cells carrying an explicit background (per §1) so a written space actually erases what was underneath. Drop the `replace(/[ ]+$/, '')` optimization — it is only safe on a terminal that is already blank to the right of every row, which frame switching violates.
2. **Explicit erase-to-end-of-line after each row**: after writing a row's last cell, emit `\x1b[K` (EL 0, erase cursor to end of line). This is the guarantee that does not depend on whitespace handling at all: whatever the previous frame drew to the right of the current cursor position is wiped on every frame, so a narrower frame always leaves a clean line.

Part 1 makes each frame self-contained; part 2 makes the frame switch idempotent against any prior screen content. Together (and only together) they guarantee no ghost pixels regardless of which pose preceded which.

---

## 3. Frame data drift (the tail2 frame)

### What the digest report says

`frames-digest-report.txt` compares the sha256 of each ported frame's 25 rows against the source art the sprite was ported from. All frames are OK **except `tail2`: MISMATCH**, with 23 differing cells, all in the upper-right spout/tail-tip area:

- row 2: ported `D` at col 26 vs source col 27 (1-column left shift);
- row 3: an extra `D` at col 25; `DBD` at cols 26–28 shifted left 1; extra `DD` at cols 36–37;
- rows 4–6: the upper-right cluster shifted 1 column left throughout.

This matches symptom 3 (a 6-pixel tail-tip cluster drawn at the wrong position): the visible misplacement is the render-time projection of the underlying 1-column shift in the ported data. The frame was **hand-copied during conversion** — the classic manual-transcription drift.

### Why the existing regression missed it

The regression that existed was **excerpt-based and anchored to a different frame**: it pinned a small excerpt of one chosen frame's rows/columns, so `tail2` (and 23 drifted cells inside it) was simply outside the excerpt's coverage. An excerpt test verifies the excerpt, not the frame; hand-ported frames that are never excerpted are unverifiable by construction. Excerpt tests also can't catch uniform shifts when the excerpt is pasted from the same ported (wrong) data — the expected values were likely captured from the ported output rather than the source art, making the test tautological.

### The gate that prevents recurrence

A **full-frame digest regression**: for every frame in the sprite, compute the sha256 (or any stable digest) of the frame's complete 25×40 row data and pin it against digests derived from the **source art**, not from the ported output. Run it in CI for all frames on every change:

- any single-cell drift, shift, or transcription error in any frame flips that frame's digest → hard failure;
- adding a new frame requires explicitly adding its source-derived digest — no silent unchecked frames;
- the digest report in the fixture is exactly this artifact; it only needs to be wired into CI as a blocking gate rather than a one-off report.

(Complementary hygiene: prefer a script conversion from source art over hand-copying, and make the digest gate fail on "frame count differs from source art" too, so dropped or added frames are caught.)

---

## 4. The CI hang (finished but never exits)

### The mechanism that keeps the finished job alive

From `ci-hang-evidence.txt`: the "channel-ui" CI job passes every scene check, then sits idle until the runner kills it at timeout (~3 min historically; one observed local case idled 19 minutes). At kill time there is **no running test and no pending assertion** — but the Node event loop still holds live handles of kind **Timeout**, one per tick of the sprite animation planner, each re-arming the next.

That is the signature of a timer-pinned event loop: the animation planner drives itself with `setTimeout(next, interval)` and reschedules for as long as its component stays **mounted**. Each pending Timeout is a live handle that keeps the Node process's event loop from draining; since a fresh Timeout is created every tick, the loop never runs out of handles. Node exits only when the event loop is empty, so a job whose tests all finished can still hang forever — "finished but hanging."

### Which hosts mount without unmounting, and why the interactive terminal is unaffected

- The hosts in the channel-ui group **mount the header component (which contains the animation planner) and finish without unmounting it**. Nothing in their teardown path calls the component's dispose/unmount, so the planner believes it is still mounted and keeps re-arming its timer chain forever.
- The interactive terminal product is unaffected **not because it unmounts, but because its process is kept alive by the TTY/stdin handles regardless** — a terminal app is *supposed* to keep running; the timer chain adds nothing observable there. The latent leak existed all along; it only became visible when the animation feature flipped default-on, because only then did the planner actually start ticking in CI hosts (timeline: the hang first appeared in the same push that flipped the default).

### The one-line fix

Unmount/dispose the component (which stops the planner's timer) in the host teardown — concretely, in the channel-ui hosts' completion path:

```ts
header.unmount()   // or planner.dispose() / clearInterval-equivalent: stop rescheduling on teardown
```

One line at the site where those hosts finish; alternatively make the planner unref its timer (`t.unref()`) — but the correct fix is the explicit unmount, because the component's contract ("reschedule while mounted") is only wrong when the mount is never ended.

---

## 5. Prevention

### The renderer contract checklist a terminal sprite implementation should ship with

1. **Complete SGR per cell**: every emitted cell sets foreground AND background explicitly; never depend on SGR state persisting across cells. Half-filled cells must explicitly set the empty half to the surface background. (Prevents phantom pixels, §1.)
2. **Declared background**: the sprite declares the RGB of the surface it draws on; transparency is rendered as that color, never as "leave whatever was active".
3. **Full-width rows**: rows are always rendered to the sprite's full cell width; no trailing-whitespace trimming inside the renderer. Trimming is a pipeline concern and only safe on a provably blank surface. (Half of §2.)
4. **Explicit erase on every row write**: each row write ends with `\x1b[K` (EL 0) so any prior wider content to the right is destroyed on every frame. (The other half of §2.)
5. **Diff writers must treat a shorter line as "write + erase", not "skip matching prefix"**; whitespace-only changes at line ends are real changes.
6. **Full-frame digest gate in CI**: every frame's complete data digest is pinned against digests derived from the source art (not from ported output); frame-count changes also fail. Prefer scripted conversion over hand-porting; if hand-porting is unavoidable, the digest gate is the reviewer. (§3.)
7. **Animation lifecycle contract**: anything that schedules (timer, rAF, scheduler) must be cancellable and MUST be cancelled on unmount/dispose; mounting hosts own the unmount. Mount-without-unmount is a leak by definition. (§4.)
8. **Timer hygiene in non-interactive hosts**: components that keep timers alive must either be unmounted in teardown or unref their timers, so batch/CI hosts' event loops can drain when the work is done.

### The audit to run BEFORE flipping an animation feature default-on

1. **Inventory every host that mounts the animated component** and answer for each: does its lifecycle guarantee unmount/dispose before process exit? (The channel-ui hosts answered "no" — found in minutes on paper, 19 minutes at the runner.)
2. **Trace the timer chain**: what schedules, what stops it, and does the process's event loop drain if all tests finish? Check for live Timeout/rAF handles at idle, not just at failure.
3. **Exercise frame transitions in both directions** — wide→narrow and narrow→wide — against a real terminal or a faithful escape-stream simulator, asserting the exact escape bytes per cell and per row end (no stale-SGR cells, no rows lacking EL after a narrower frame).
4. **Run the full-frame digest gate over every animation frame** and confirm it covers all frames (not excerpts) and that expected digests derive from source art.
5. **Diff the escape stream, not the screenshot**: a byte-level assertion that every cell's sequence sets both colors catches phantom-pixel classes that eyeball reviews miss.
6. **Flip default-off → default-on in CI first** (or run the affected job group with the feature forced on) before the default reaches any interactive product, precisely because interactive hosts mask timer leaks.
7. Re-run the historically-finished jobs and confirm their wall-clock profile is unchanged.

---

## Report per skill structure

- **pre-existing (baseline)**: not collected — this task is a read-only static diagnosis (Mode A); no build/test/baseline execution was permitted or performed.
- **Completed**: full read-only analysis of all five questions above, from the four fixture evidence files; no files inside the fixture or the benchmark repository were modified; nothing was executed, installed, or migrated.
- **Skipped**: none of the questions were skipped; all evidence needed was present in the fixture. Runtime reproduction (actually running the renderer, capturing an escape stream, or reproducing the CI hang in a live process) was not performed — the fixture is static/read-only by mandate, and each question is fully answerable from the shipped code plus recorded evidence.
- **Pending/residual risk**: none blocking. If a team implements the fixes, the residual risks are (a) choosing the correct surface-background RGB for the explicit-SGR fix (a wrong constant shifts every transparent cell's color), and (b) ensuring EL-after-row does not fight a scroll-region or diff painter that positions the cursor itself.
- **Rollback**: nothing to roll back — no writes outside `report.md` in the designated output directory.
- **Recommendations**: adopt the §5 renderer contract as a shipped checklist next to the renderer source; wire the digest report into CI as a blocking gate; add the mount/unmount invariant to the component's public contract; prefer scripted frame conversion over hand-porting.
