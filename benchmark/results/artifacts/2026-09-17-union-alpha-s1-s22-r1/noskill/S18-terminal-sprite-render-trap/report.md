# S18 · The Terminal Sprite Render Trap — Analysis Report

## 0 · Scope, inputs, method

Static, read-only analysis of the shipped evidence pack. No file under the fixture was
modified, created, deleted, or renamed; the renderer was not executed. All findings are
derived from the four evidence artifacts plus the task brief.

Evidence inputs (read-only):

- fixture/renderer-excerpt.ts — the half-block sprite renderer exactly as it shipped
- fixture/symptom-log.txt — user-visible symptom positions
- fixture/frames-digest-report.txt — per-frame digest comparison against source art
- fixture/ci-hang-evidence.txt — the CI job that hung after the feature flipped default-on
- fixture/README.md — evidence-pack index

Path note: the task brief references the in-container paths /app/fixture/ and
/app/agent-output/S18-terminal-sprite-render-trap/; in this environment the same fixture
was read from the benchmark task's environment/fixture directory, and this report is the
designated output (report.md). The brief also permits temporary working files; none were
needed beyond in-memory reads.

Executive summary — four independent defects around one animation feature:

1. Phantom pixels: the half-block renderer's single-pixel branches emit only a foreground
   SGR sequence and leave the background SGR inherited from the previous cell; the
   half-block glyph fills the EMPTY half of the cell with that stale background.
2. Ghost frames: the renderer trims trailing transparent cells off every row
   (out.replace(/[ ]+$/, '')), and the text pipeline treats trailing whitespace as
   insignificant, so columns that a wider previous frame painted are never rewritten or
   erased on a switch to a narrower frame.
3. Frame drift: the hand-ported tail2 frame is corrupted (23 differing cells, the
   upper-right tail-tip cluster shifted one column left, plus duplicated cells); the
   excerpt-based regression covers only a different frame, so nothing failed; the gate is
   a whole-frame digest check over every frame.
4. The hang: the animation planner re-arms a setTimeout every tick and stops only when its
   component unmounts; the CI channel-ui hosts mount the header component and finish
   without unmounting, so a chain of live, loop-referencing Timeout handles keeps the
   finished process alive until the runner timeout. The interactive terminal is unaffected
   because its loop is kept alive by TTY/stdin handles regardless. One-line fix: unref the
   animation timer (and, as paired hygiene, clear it on unmount).

---

## 1 · Phantom pixels hugging the sprite's right edges

### 1.1 The half-block state machine as shipped

Each terminal cell packs two vertical sprite pixels into one glyph: foreground = upper
pixel, background = lower pixel. For every column x of a row pair (upper row, lower row)
the renderer picks one of four branches:

- both pixels defined: seq = fg(up) + bg(lo), glyph '▀' — complete SGR state, correct.
- upper only (up defined, lo transparent): seq = fg(up), glyph '▀' — INCOMPLETE.
- lower only (lo defined, up transparent): seq = fg(lo), glyph '▄' — INCOMPLETE.
- both transparent: seq = '' (emit nothing here), glyph ' '.

Two further pieces of shipped machinery matter:

- A per-row change-detector cache: let current = '' before the row; a cell's seq is emitted
  only when seq !== current, then current = seq. An empty cell emits RESET (\x1b[0m)
  exactly once at the painted→empty transition, and its following space characters are
  later trimmed.
- A row-end fixup: after trimming trailing spaces with out.replace(/[ ]+$/, ''), the row
  gets a RESET appended if it does not already end with one. So every row string ends in
  RESET, and SGR state never leaks from one row into the next.

### 1.2 The leak — which SGR state persists, which cells expose it

SGR state is sticky in a terminal: it persists from one cell to the next until changed or
reset. The renderer exploits this for compression — identical consecutive cells skip the
re-emit — but the two single-pixel branches set ONLY the foreground and never set a
background. A half-block glyph always paints BOTH halves: the '▀' glyph paints the upper
half with the current foreground and the LOWER half with the current background; '▄' is
the mirror image. So in a half-painted cell the empty half is filled with whatever
background SGR is currently in effect.

What persists across cells is therefore the 48;2;r;g;b background set by the most recent
fully-painted cell (seq = fg(up) + bg(lo)) earlier in the same row — the fg is refreshed
by the half-painted branch itself, so the background is the only stale channel.

Which cells expose it — a half-painted cell is phantom-prone exactly when a fully-painted
(bg-carrying) cell precedes it in the same row with no RESET in between:

- Right-edge boundary columns: the interior cell is fully painted (dark outline with body
  below it, so bg(lo) is emitted); the next column out is typically up-only (outline
  upper pixel, '.' lower). That cell emits fg(outline) with no background; its lower half
  renders the stale bg — the previous cell's lower-pixel color — as a half-height block
  one cell to the right of the outline. That is the 1-cell-wide phantom column in the log.
- Cells under/next to the sleep-Z symbols and the heart: isolated palette glyphs whose
  cell partner is '.', again following painted cells, produce the same half-height
  artifacts beside and beneath them.
- The bottom row of an odd-height frame: lower defaults to '' (sprite[r + 1] ?? ''), so
  EVERY painted cell in that row is up-only and leaks wherever a painted cell precedes it.

Why the phantoms read as "dim colored noise" that "appears and moves with the animation":
the stale background is whatever pixel sat below the last fully-painted cell of that row —
a body fill or shade that varies per row and per frame, rendered as a half-height smear
where the art says '.'.

Why the LEFT edges are clean (matching the log's right-edge-only report): a half-painted
cell at the start of painted content inherits its SGR from the previous row's terminating
RESET (bg = terminal default) or from the row's leading empty cells, which emit RESET at
the painted→empty transition. The default background is invisible on a dark terminal. The
right edges are different precisely because they follow painted content in the same row.

Note the fully-empty cells are NOT part of the bug: the first empty cell after painted
content emits RESET, which also resets the background, and its spaces are trimmed anyway.

### 1.3 The precise escape fix

The empty half of a half-painted glyph must have an explicitly set background — never an
inherited one. The SGR escape for "default background" is 49 (\x1b[49m); if the sprite
renders over a painted application background rather than the terminal default, set that
color explicitly with bg(...) instead — the invariant is the same: complete state per
glyph.

    const DEFAULT_BG = '\x1b[49m'   // SGR 49: default background
    ...
    } else if (up !== undefined) {
      seq = fg(up) + DEFAULT_BG      // '▀' — empty lower half explicitly default
      ch = '▀'
    } else if (lo !== undefined) {
      seq = fg(lo) + DEFAULT_BG      // '▄' — empty upper half explicitly default
      ch = '▄'
    }

This composes correctly with the existing machinery: the change-detector cache compares
the full seq string, so runs of identical edge cells still coalesce into one escape;
the painted→empty transition still emits RESET; the row-end RESET fixup is unchanged.
Cost is a few bytes per edge run, coalesced by the cache.

---

## 2 · Ghost pixels surviving a switch to a narrower frame

### 2.1 What the renderer drops from each row

The last line of row assembly is:

    let row = out.replace(/[ ]+$/, '')

Every trailing transparent cell was rendered as a plain space (seq = '' → nothing emitted,
glyph ' '), and this regex deletes all of them. The emitted width of a row therefore equals
rightmost painted pixel + 1, and varies with the pose: the wide pose's swung-out tail
produces rows reaching far right; the narrow pose's rows end many columns earlier. The
renderer emits no erase-to-end-of-line sequence (no CSI 0K / EL anywhere in the excerpt),
never pads rows to a fixed width, and has no notion of clearing the previous frame's area.

### 2.2 What the text pipeline does to trailing whitespace

The row-consuming text pipeline treats trailing whitespace as insignificant: it strips
trailing spaces from each line before diffing/writing, and writes only the cells the new
line text covers. (Even if the renderer emitted the trailing spaces, this layer would drop
them.) So on a wide→narrow switch the new frame's rows are written SHORTER than the
previous frame's rows, and the columns beyond each new row's end are simply never
touched — the terminal keeps whatever characters and colors those cells already had,
which are the previous frame's tail pixels. Narrow frame renders fine; the surplus columns
keep showing the wide tail. Exactly symptom 2.

### 2.3 The two-part fix that guarantees a clean frame switch

The invariant to establish: for every column the PREVIOUS frame painted, the new frame's
output must either rewrite that cell or explicitly erase it. Two layers must cooperate,
because today both strip the evidence:

Part 1 — renderer: emit every row at a constant, content-independent extent.

- Replace the trailing trim with padding: emit transparent cells to the sprite's full
  width (40 columns) as explicitly-styled spaces (default/app background), so every row
  of every frame covers the same extent; or, cheaper and equivalent in effect, keep the
  painted content and terminate each row with an explicit erase-to-end-of-line,
  CSI 0K (\x1b[0K), under a known background.

Part 2 — text pipeline: honor that extent and erase on switch.

- Write sprite lines verbatim: no trailing-whitespace normalization for renderer output,
  and pass the EL through (or have the pipeline itself clear-to-EOL after each sprite
  line).
- On a frame switch, clear the sprite region (the previous frame's rectangle — worst case
  the sprite's full 40-column extent) before drawing the new frame, instead of overwriting
  only the new frame's extent.

With fixed-extent rows plus EL (or clear-before-draw), a narrower frame rewrites or erases
every column the wide frame painted; ghost pixels become impossible rather than merely
unlikely. A full-frame clear between frames is an acceptable belt-and-braces addition but
is not required once per-row extent is guaranteed.

---

## 3 · Frame data drift: the hand-ported tail2 frame

### 3.1 What the digest report says

The digest report hashes each frame's 25 rows and compares against the source-art frames
the sprite was ported from. Every frame matches except tail2, MISMATCH:

- row 2: ported D at col 26 where the source has D at col 27 — one column left.
- row 3: an extra D at col 25; the DBD block at cols 26–28 shifted one column left; extra
  DD at cols 36–37.
- rows 4–6: the upper-right cluster shifted one column left throughout.
- total: 23 differing cells, all in the upper-right spout/tail-tip area.

In plain terms: the hand-copied tail2 frame misplaced the tail-tip/spout cluster by one
column and duplicated a few cells (the extras at cols 25 and 36–37). This is symptom 3,
the "6-pixel cluster drawn at the wrong position": a data error in the ported frame, not a
renderer bug — the renderer faithfully painted wrong data.

### 3.2 Why the existing per-excerpt regression missed the drift

The regression that exists is excerpt-based: it asserts hand-picked excerpts of ONE frame
and was added later, for a different frame (the report states this explicitly). Coverage
is therefore per-excerpt, not per-frame: any frame without an excerpt — and any region of
a frame outside its excerpt — is entirely untested. tail2 had no excerpt, so a 23-cell
corruption passed CI. This is the structural weakness of excerpt tests for frame data:
they test the code path on a sample, but frame data errors live in the unsampled data.

### 3.3 The gate that prevents recurrence

Make the digest comparison the gate, not a manual report:

- Whole-frame digests for ALL frames: sha256 over each frame's complete 25 rows, with the
  expected hashes generated from the source art (the authority), stored as a manifest.
- CI-enforced on every change that touches frames, the palette, or the porting pipeline:
  recompute all digests and fail loud on any mismatch — no excerpt sampling, no skipping
  frames not "covered" by a test.
- Regeneration procedure: digests are refreshed only by re-deriving from the source art,
  never by hand-editing hashes to make CI pass.
- Root-cause the porting step: hand-copying is the error source; prefer mechanical
  conversion from source art to frame rows, and when a hand port is unavoidable, run the
  digest immediately as part of the port (before the frame can ship), not later.

That is precisely what the fixture's frames-digest-report.txt is — the check run by hand
after the fact; the fix is to run it automatically, on every frame, in CI.

---

## 4 · The CI hang: a timer-pinned event loop in a finished job

### 4.1 What reschedules forever

The animation planner's tick loop: each tick of the sprite animation planner schedules the
next tick with setTimeout, and keeps doing so for as long as its component stays mounted.
At kill time the event loop held live handles of kind Timeout — one per planner tick, each
re-arming the next: an unbounded self-perpetuating timer chain.

Node's process-exit rule is the other half of the mechanism: a Node process exits when the
event loop drains (no live handles remain) and nothing else keeps it alive. The channel-ui
CI job ran all scene checks, printed PASS for every one, and had no further work — but the
Timeout chain is a permanently ref'd live handle, so the loop never drains, the process
never exits, and the job idles until the runner timeout kills it (~3 minutes before the
flip; 19 minutes of idle observed locally before a manual kill).

### 4.2 Which hosts mount the component without unmounting it, and why the interactive terminal is unaffected

The hosts that hang are the channel-ui group's CI scene-check hosts: they mount the header
component, run their checks, and finish WITHOUT unmounting it — so the planner's
termination condition (component unmounted) never fires, and the chain never stops.

The interactive terminal product is unaffected because its process is kept alive by its
TTY/stdin handles regardless of the timer chain: those handles already hold the event loop
open for the lifetime of the app, and the app exits through its explicit quit path, which
tears the component down and stops the chain. The leaked timer is behaviorally invisible
there; it only becomes fatal in a host whose correct end state is "drain and exit".

### 4.3 The one-line fix

Make the animation timer loop-neutral so a finished process can drain:

    t = setTimeout(tick, interval); t.unref()   // in the planner's scheduling line

An unref'd Timeout still fires while the loop is otherwise alive (interactive animation
unchanged — its loop is held by TTY/stdin anyway), but it no longer keeps the event loop
alive by itself, so the CI host that finishes with nothing outstanding except this chain
drains and exits. That is the one-line fix that directly addresses the observed mechanism.

The paired hygiene fix (not sufficient alone for these hosts, but required by the
contract in section 5): the component's unmount/dispose path must clear the pending tick
(clearTimeout(handle) in the effect cleanup) so the chain is owned by the component
lifecycle. The evidence shows the CI hosts never unmount, so cleanup-on-unmount alone
would not have prevented this hang — the timer must not pin the loop regardless of host
lifecycle.

---

## 5 · Prevention

### 5.1 Renderer contract checklist for a terminal sprite implementation

1. Complete SGR state per glyph. Every emitted glyph sets BOTH foreground and background
   (or explicitly resets the empty half with SGR 49). No glyph may inherit SGR state from
   a neighboring cell. Every attribute change emits a complete state; every row ends with
   RESET.
2. Transparent pixels resolve to a defined color. "Transparent" means terminal default
   (SGR 49 / RESET) or the app's background color — chosen explicitly by the renderer,
   never inherited from the previous cell.
3. Constant output extent. Every row is emitted at the sprite's full width (padded) and/or
   terminated with erase-to-end-of-line (CSI 0K). The emitted extent of a row must never
   depend on the frame's content.
4. Frame switch erases the previous frame. For every cell the previous frame painted, the
   new frame's output rewrites it or explicitly erases it (fixed-extent rows + EL, or
   clear-before-draw of the previous frame's rectangle). Wide→narrow switches must be
   residue-free by construction, not by luck.
5. Frame-data integrity is CI-gated, whole-frame. A digest manifest (sha256 per frame over
   ALL rows) derived from the source art is checked on every frames-touching change; no
   excerpt-based sampling of frame data; hashes regenerate only from source art; hand
   ports run the digest at port time.
6. Determinism. render(frame, palette) is pure and byte-identical across runs — full-frame
   snapshot tests are meaningful and cheap.
7. Timer ownership and loop-neutrality. Every timer the renderer/planner starts is tracked
   and cleared on unmount/dispose; animation timers are unref'd (or otherwise do not keep
   an event loop alive) so that a host which finishes — with or without unmounting — can
   drain and exit.

### 5.2 The audit a team runs BEFORE flipping an animation feature default-on

1. Lifecycle inventory. List every host/surface that mounts the animated component —
   interactive TTY, CI scene hosts, headless runners, embedded previews — and verify the
   mount/unmount pairing for each. Any host that legitimately finishes without unmounting
   must be proven to still drain.
2. Event-loop drain assertion. With the feature ON, after each CI scene completes, assert
   no live Timer/Interval handles remain (e.g., inspect active resources/handles at test
   end and fail the scene if any animation handle survived). This converts the future
   "finished but hanging" symptom into an immediate, attributed failure.
3. Render audit with the feature ON. Run the whole-frame digest suite for all frames, and
   a wide→narrow frame-switch test on a real terminal emulator (or non-TTY cell grid)
   asserting zero residual cells at the previous frame's extent.
4. Wall-time canary on the exact CI group that will run the flip. Re-run the regressed
   group (here: channel-ui) with the default flipped, before merging the flip, gating on
   job duration against its baseline (~3 min) — a job that passes but no longer exits is
   a fail, and the gate must treat it as one.
5. Kill switch and soak. Keep the feature behind its flag; flip the default on a soak/
   preview branch first with an automatic rollback criterion (job duration regression or
   leaked-handle assertion), and keep the off-switch reachable after the flip.

Items 1–2 are the ones that would have caught this specific hang before the flip: the
hosts that mount without unmounting were already known mount points, and a leaked-handle
assertion fails in seconds with a named owner instead of 19 idle minutes and a runner
timeout.

---

## 6 · Confidence, assumptions, honest limits

- All findings are grounded in the four fixture artifacts; the fixture was read fully and
  not modified. The renderer excerpt is short enough that the state-machine analysis in
  section 1 is exhaustive of the excerpt's behavior; if the shipped renderer had more code
  outside the excerpt (e.g., a clear-between-frames call), section 2's pipeline claim
  would need that code — but the symptom log's ghost-pixel behavior and the excerpt's trim
  are jointly consistent only with no effective clear.
- The "text pipeline strips trailing whitespace" claim is the reading of symptom 2 plus
  the renderer's own trim: both layers must drop the surplus columns for the ghosts to
  survive. The excerpt confirms the renderer side; the pipeline side is inferred from the
  symptom (it is the only remaining layer that could have rewritten those cells and did
  not).
- The one-line hang fix is given as timer.unref() because the evidence states the hanging
  hosts finish WITHOUT unmounting the component, which rules out cleanup-on-unmount as a
  sufficient fix for those hosts; the unmount-clear remains required by the contract.
- The brief's container paths (/app/fixture/, /app/agent-output/) were mapped to this
  environment's benchmark fixture directory and the designated report output path; no
  other resources were touched. No installations, migrations, commits, or external
  services were used; the skill, verifier, and reference materials were not accessed.
