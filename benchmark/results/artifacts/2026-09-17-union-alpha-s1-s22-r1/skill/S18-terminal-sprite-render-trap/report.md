# S18 · The Terminal Sprite Render Trap — Diagnosis Report

Method: plugin-upgrade skill, Mode A (read-only inspect/report). Scope note: the evidence
is a terminal renderer symptom pack, not a version-corridor migration, so no corridor card
references were applicable; references/ were consulted only as needed (none intersected
ANSI half-block rendering, row trimming, or timer-lifecycle symptoms).

Evidence base (all read-only, fixture untouched):
- E:/deepseek-harness/dsh-plugin-upgrade-skill/benchmark/tasks/S18-terminal-sprite-render-trap/environment/fixture/renderer-excerpt.ts
- .../symptom-log.txt
- .../frames-digest-report.txt
- .../ci-hang-evidence.txt
- .../README.md

## 1. Phantom pixels at the sprite's right edges

### Mechanism

The renderer tracks only the *SGR sequence* (`current`) to decide whether to emit escape
codes, not the glyph's *effective visual state*. Two SGR streams are independent:

- `fg(...)` → `\x1b[38;2;r;g;bm` — explicit foreground; emitted only when a pixel exists.
- `bg(...)` → `\x1b[48;2;r;g;bm` — explicit background; emitted only when a pixel exists.

The bug lives in the "empty half" branches. When a cell has an upper pixel but no lower
pixel, it emits `seq = fg(up)` with glyph `▀`. That sequence sets **only the
foreground**; the cell's **background remains whatever SGR background was set by the last
cell that had one** — SGR has no per-cell scoping, it persists across cells until reset or
overridden. Symmetrically, the lower-only branch (`fg(lo)`, `▄`) leaves a stale
*foreground*, but the visible artifact class in the log is the stale background.

At the sprite's right edges, frames end in `.` (transparent) in the lower pixel while the
upper pixel is drawn (outline, Z symbols, heart). So the trailing edge cells take the
`up-only` branch, and the background of the previous painted pixel (some palette color)
stays applied to the `▀` glyph's lower half — a half-height colored sliver. Where a
`▀`-only cell is emitted with a stale background, the terminal fills the lower half of
that cell with the stale color: exactly the "1-cell-wide column of dim colored noise
hugging the right edge" in the symptom log, moving with the animation because the stale
color changes as the animation repaints different pixels left of the edge.

Note also that emission is deduplicated against `current`: because only `fg` differs
between adjacent up-only cells, the *stale background rides along unmodified* across the
whole run of edge cells — no reset ever intervenes until the final `RESET` at end-of-row
(or the transparent-cell branch).

Which cells expose it: every cell where exactly one half is transparent and the other is
painted — i.e. the up-only (`▀` with stale bg) and lo-only (`▄` with stale fg)
branches — but visible artifacts concentrate at right edges because that is where
transparent lower halves follow painted cells (rows ending `X.`, outline/Z/heart edges
in the symptom log).

### Precise escape fix

Make the half-empty branches fully specify the cell's visual state so no SGR state can
leak into the empty half:

- up-only: `seq = fg(up) + bg(transparentColor)` — or explicitly reset the background,
  e.g. `fg(up) + '\x1b[49m'` (default background, 49), glyph `▀`.
- lo-only: `seq = fg(lo) + '\x1b[49m'` (or paint the upper half with the transparent
  color), glyph `▄`.
- The transparent/`seq === ''` branch already emits `RESET`, which is correct — but
  only if the dedup comparison still works after the fix (it does: `current` compares
  full sequences, and the explicit-49 sequences are stable strings).

Alternative equivalent: emit `RESET` before every half-empty cell, but explicit `49`
(or transparent-color background) keeps the dedup efficient and avoids flicker. The
end-of-row `RESET` must be retained. The key invariant: **after the fix, the glyph as
rendered depends only on the current cell's palette lookups, never on any previous cell.**

## 2. Ghost frames after switching to a narrower pose

### What the renderer drops

`let row = out.replace(/[ ]+$/, '')` strips **all trailing spaces** from each rendered
row. Rows that are genuinely shorter than the widest pose therefore shrink even further:
the narrow frame's rendered row says nothing about the columns to the right of its last
non-space character.

### What the text pipeline does with trailing whitespace

The rendered rows are handed to a text/terminal pipeline that writes them at the component
position. A line whose content stops early (after the trailing-space strip) is written as
a short line: **the pipeline leaves the remaining cells of that screen row untouched** —
it neither clears to end of line nor pads. (Even before the strip, most terminal write
paths would not emit bare trailing spaces as "clearing"; but the explicit strip makes the
shortfall unconditional rather than data-dependent.)

### Net effect: previous-frame residue

When the animation switches wide pose → narrow pose, the wide frame's tail occupied
columns that the narrow frame's rows no longer describe. Nothing erases them: no
`\x1b[K` (erase to end of line), no explicit spaces, no full-frame clear. The previous
frame's tail pixels stay on screen — the ghost pixels of symptom 2.

### Two-part fix that guarantees a clean frame switch

1. **Renderer side — stop trimming; emit explicit erase or full-width rows.** Either keep
   the row at full sprite width (paint transparent cells as explicit spaces, or append
   `\x1b[K` / `\x1b[0K` after the last non-space cell before the row RESET), or drop
   the `.replace(/[ ]+$/, '')` entirely and always emit exactly `spriteWidth` columns.
   Any of these makes each rendered row explicitly define (or erase) every cell to the
   right of its content.
2. **Pipeline side — frame switch must clear the previous frame's footprint.** On pose
   change, clear the union of the previous frame's area and the new frame's area before
   (or as part of) writing the new frame — e.g. emit the wider of old/new row lengths and
   erase to EOL, or clear the sprite rectangle then draw. This covers even the first frame
   after a wider pose (where the renderer itself cannot know what was on screen before).

Only both parts together guarantee the switch: part 1 removes the *renderer-induced*
shortfall; part 2 removes the *stale-screen* shortfall for cells outside the new frame but
inside the old one. (If the renderer always emits full-width rows and the pipeline always
writes them at a fixed origin, part 2 collapses to part 1 — but the safe contract is to
require both.)

## 3. Frame data drift (tail2)

### What the digest report says

sha256 of all 25 rows per frame, compared against the source-art frames, shows every frame
OK except `tail2: MISMATCH`. Detail: 23 differing cells, all in the upper-right
spout/tail-tip area —

- row 2: ported `D` at col 26 vs source col 27 (1-column left shift);
- row 3: extra `D` at col 25, `DBD` at cols 26–28 shifted left 1, extra `DD` at cols 36–37;
- rows 4–6: the whole upper-right cluster shifted 1 column left.

This is the misplaced tail tip of symptom 3: a hand-port copy error (the report states the
ported tail2 was hand-copied during conversion), not a renderer artifact — the renderer
faithfully drew a slightly wrong frame.

### Why the existing regression missed it

The existing regression was an **excerpt-based** check (a subset of rows/columns), and it
was added later *for a different frame*. tail2's drift is confined to a specific region
(upper-right cluster) that the excerpt did not include, and the regression predates/never
targeted tail2 — so the only fully covering check (whole-frame comparison) did not exist.

### The gate that prevents recurrence

A **per-frame whole-data digest gate**: for every frame (not an excerpt), compute a digest
over the complete frame data (all 25 rows × 40 columns) and compare against a digest pinned
from the source art; fail the build on any mismatch, and require the pin to be regenerated
explicitly ( reviewed diff) when art intentionally changes. That is exactly what
frames-digest-report.txt does manually; the gate is to make it an executed check that runs
on every change touching frames, with the source art as the pinned reference — so a
hand-port typo like tail2 fails immediately with a per-cell diff instead of shipping.

## 4. The CI hang

### Mechanism that kept the finished job alive

The CI evidence: all scene checks PASS, then the process sits idle with live event-loop
handles of kind `Timeout` — one per tick of the sprite animation planner, each re-arming
the next. The planner reschedules a `setTimeout` for as long as its component stays
mounted. Node keeps a process alive while any handle (timer, TTY, socket) is referenced;
the test framework finishes its work but `process.exit` is never reached because the
loop never drains. Each completed tick schedules the next one → the timer chain is
self-perpetuating, so the job can never go idle-empty and is killed only at the runner
timeout (3-minute jobs became 19-minute kills).

### Which hosts mount without unmounting

The evidence names the `channel-ui` group's hosts: they mount the header component (the
one hosting the animation planner), run their checks, and finish **without unmounting**
it. Nothing in those hosts tears the component down at end-of-test, so the planner's
"reschedule while mounted" condition stays true forever.

### Why the interactive terminal is unaffected

The interactive terminal product's process is kept alive by TTY/stdin handles anyway — its
lifetime is intentionally unbounded, so a never-draining timer chain changes nothing
observable. Only hosts whose lifetime is supposed to *end* (CI) expose the leak.

### The one-line fix

Unmount (dispose) the header component at the end of each of those hosts' runs — i.e. call
the component's unmount/teardown so the planner stops rescheduling (the timer chain is
gated on "mounted"). One line in the host teardown: `unmount(headerComponent)` (or the
plugin's disposer, per the repo's "every effect returns a disposer" convention). The
underlying hardening — planner timers created as unref'd/abortable or disposed via
`ctx.effect()` — is the durable version, but the cited fix is the missing unmount call.

## 5. Prevention

### Renderer contract checklist (ship with any terminal sprite implementation)

1. **Cell independence / SGR completeness**: every emitted glyph's rendered appearance must
   be a function of the current cell's data only. Half-filled cells explicitly set BOTH
   attribute planes (or explicitly reset the unused plane, e.g. `\x1b[49m` / `\x1b[39m`);
   no reliance on stale SGR. Transparent cells reset.
2. **Frame coverage**: each rendered row defines (draws or erases) every column of the
   sprite rectangle — no reliance on trailing-space trimming; erase-to-EOL (`\x1b[K`) or
   explicit spaces to full width; row terminated with `RESET`.
3. **Frame-switch erase semantics**: switching frames clears the union of the previous and
   new frame footprints; a first draw after a wider artifact must also clear. Narrower
   poses leave zero residue.
4. **Frame data integrity**: every frame is pinned by a whole-frame digest against source
   art; a gate fails on any cell difference, with per-cell diff output; intentional art
   changes regenerate pins via reviewed diff.
5. **Deterministic geometry**: fixed sprite origin and dimensions per frame family; row
   count odd/even handled explicitly (odd source rows pad the lower half — the `lower`
   fallback `?? ''` path must obey rule 1 too).
6. **Lifecycle**: every animation timer is owned (disposable/unref'd); rendering stops on
   unmount; no timer outlives its component. Test hosts unmount what they mount.
7. **Palette hygiene**: undefined palette entries are treated as transparent deterministically
   and logged once — the current `Record<string, Rgb | undefined>` silently widens the
   artifact surface if a palette key is missing (it degrades into the half-empty branches).

### Audit to run BEFORE flipping an animation feature default-on

1. **Leak/lifecycle audit**: run every host/mount site in a mode that asserts the event
   loop drains after teardown (or `process.getActiveResourcesInfo()` shows no `Timeout`
   handles at exit); prove every mount has a matching unmount, including hosts that
   "mount and finish" (the exact CI failure mode).
2. **Visual-diff audit**: render every frame and every frame *transition* (wide→narrow,
   narrow→wide, first frame) to a captured buffer; diff against expected output including
   the columns beyond each frame's content — catches phantom pixels and ghost frames.
3. **Frame-data gate**: whole-frame digests green for all frames against source art (would
   have caught tail2).
4. **Host matrix**: execute one representative flow on each host family that mounts the
   component (channel-ui hosts, interactive terminal, CI harness), asserting clean exit
   codes and bounded wall time in CI.
5. **Rollback plan**: the flip lands behind a config field; the revert is a one-line
   default change, with the CI-hang and render-diff evidence attached to the flip PR.

## Completed / Skipped / Pending / Rollback / Recommendations

- **Completed**: read-only inspection of all five fixture files; full mechanism analysis of
  all five report questions; report written to
  E:/deepseek-harness/test-lhh010/benchmark-runs/union-alpha-r1/skill/S18-terminal-sprite-render-trap/report.md.
- **Skipped**: corridor card lookup — the skill's references/ contain version-migration
  cards only; no card intersects ANSI half-block rendering, row trimming, digests, or timer
  lifecycles (noted in the header). No files outside the output directory were written;
  the fixture is untouched.
- **Pending/residual risk**: none identified. Static evidence was complete and mutually
  consistent (symptom log ↔ renderer code ↔ digest report ↔ CI evidence). No runtime
  execution was performed (fixture is marked do-not-execute), so all conclusions are
  code/evidence-derived rather than reproduced on a live terminal.
- **Rollback**: not applicable — no changes were made anywhere.
- **Recommendations**: adopt the section 5 checklist as shipped docs with the renderer,
  gate whole-frame digests in CI, and require the section 5 rollout audit (event-loop-drain
  assertion included) before any default-on flip of animation or timer-driven features.
