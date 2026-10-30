# S18 · The Terminal Sprite Render Trap — read-only diagnosis

**Mode:** A · inspect (read-only) per `skills/plugin-upgrade/SKILL.md`.
**Fixtures read once (unmodified):** `renderer-excerpt.ts`, `symptom-log.txt`, `frames-digest-report.txt`, `ci-hang-evidence.txt`, `README.md`.
**Not done (out of scope / forbidden):** no host probes, no `dsh --version/--help/--dump-config`, no `cordis_inspect_*`, no installs/migrations, no writes outside the report directory. `fixture/` is unchanged.
**Skill alignment:** this is a plugin-side defect report, not a host-version migration — no version card in the reference set changes half-block rendering or timer liveness. The cards cited below are used only as *contract analogues* (lifecycle/teardown ownership, wrapper exit-code semantics, "a child must not be able to hold an operation open"). Touchpoint classes hit by this feature, per `references/pre-flight.md`: **#5 (UI/commands/tools)** — the header/sprite component is a UI contribution; **#6 (custom channel / render surface)** — the scene-check host that renders the component; **#7 (subprocess/output)** — the CI wrapper's exit semantics. Touchpoints #1/#2/#3/#4 are not hit by the symptoms in the evidence pack.
**Uncertainty policy:** anything the brief + fixture do not establish is marked **[unconfirmed]** rather than guessed.

---

## 1 · Phantom pixels in the empty half of a half-filled cell

### 1.1 The rendering model the code assumes

Each terminal cell carries two vertical pixels. The fixture comment fixes the convention:

> "each terminal cell packs two vertical pixels into one half-block glyph: foreground = upper pixel, background = lower pixel"

The shipped code encodes that with three glyph cases and one escape per case:

| case | pixels present | `seq` emitted | glyph | what the cell shows |
|---|---|---|---|---|
| both | upper + lower | `fg(up) + bg(lo)` | `▀` (U+2580) | upper half = fg, lower half = bg — **fully specified** |
| upper only | upper | `fg(up)` | `▀` | upper half = fg, **lower half = whatever the cell background currently is** |
| lower only | lower | `fg(lo)` | `▄` (U+2584) | lower half = fg, **upper half = whatever the cell background currently is** |
| neither | — | `RESET` (via `seq === ''`) | ` ` | default fg/bg — **fully specified** |

The half-block glyphs only ever paint **one** half. The other half is left to the *cell background*, i.e. to the SGR background colour that is in effect when the cell is written. That is the whole bug surface: a cell that is only half-painted inherits whatever background the terminal was last told to use.

### 1.2 The exact mechanism

**The SGR state that persists across cells is the BACKGROUND colour (SGR 48, `\x1b[48;2;r;g;bm`).**

* The renderer emits a background colour in exactly one place: the "both pixels present" branch, `seq = fg(up) + bg(lo)`.
* In the "upper only" and "lower only" branches it emits **only** `fg(...)`. SGR 38 sets the foreground and leaves the background **untouched** — the background set by the previous cell's SGR 48 is still in effect.
* The only place the background is cleared is the full reset `RESET = '\x1b[0m'`, which the renderer emits (a) for a fully transparent cell (`seq === ''`) and (b) at the end of every row (`if (!row.endsWith(RESET)) row += RESET`).

So the leak is strictly **within a row**: between a fully-painted cell and the next half-filled cell of the same row, the background colour of the fully-painted cell survives into the half-filled cell, and the half-block glyph paints only one half — the other, empty half is painted with that stale colour.

A second, subtler half of the same defect is the renderer's **state cache**:

```ts
if (seq !== current) { out += seq === '' ? RESET : seq; current = seq }
```

`current` is a cache of "the SGR state now in effect". Its correctness requires the invariant *"`seq` fully describes the visible state of a cell"*. The shipped code violates that invariant: `seq` for a half-filled cell does not describe the background, so the cache can consider two cells equal (or emit a change) while the *visible* background differs. `seq` must therefore always state both halves' colours — including "default background" for the empty half.

### 1.3 Which cells expose it

Only **half-filled cells that follow a fully-painted cell in the same row**:

* `▀` with only the upper pixel present → the **empty lower half** is painted with the leaked background;
* `▄` with only the lower pixel present → the **empty upper half** is painted with the leaked background.

In the whale art the first half-filled cell at the right edge of every shape is preceded by filled body/outline cells, so the leaked colour is that shape's fill/outline colour. That is exactly the reported picture:

* "a 1-cell-wide column of dim colored noise directly to the right of the dark outline cells" — the outline column is the rightmost drawn column of the body; the outline cell is half-filled (its partner pixel is outside the silhouette) and its empty half takes the body/outline background colour;
* "next to the sleep-Z symbols" and "to the right of the heart glyph" — these are small clusters whose interior contains fully-painted (`▀`-with-both) cells; the cluster's rightmost cell is half-filled and inherits that cluster's own background colour, so the glyph looks like it has an extra column of the same colour hanging off it;
* "They appear and move with the animation; they are NOT part of any frame's data" — the phantoms are produced by the *renderer*, not by the art: no frame row contains those pixels. This is the discriminator between a phantom (renderer/state bug) and a ghost (frame-footprint bug, §2).

Note the leaked colour is a **background** colour (SGR 48), and in the art it is the *lower* pixel of the nearest preceding fully-painted cell — a body fill, which is dim compared with the outline. Hence "dim colored noise".

Minimal deterministic repro derived from the shipped code alone (no fixture execution required) — a 2-row frame `upper = "AB."`, `lower = "C."`:

| col | up | lo | branch | emitted | rendered |
|---|---|---|---|---|---|
| 0 | A | C | both | `fg(A)+bg(C)` + `▀` | correct |
| 1 | B | – | upper only | `fg(B)` + `▀` | upper = B, **lower = C (leaked)** ← phantom |
| 2 | – | – | neither | `RESET` + ` ` | blank, correct |

Two structural observations that follow from the same code:

* **Row 13 is 100 % half-filled.** The sprite is 25 pixel-rows → `ceil(25/2) = 13` terminal rows (matches the symptom log's "13 terminal rows"). For `r = 24`, `lower = sprite[25] ?? '' = ''`, so *every* cell of the last terminal row takes the "upper only" branch. That row is clean today only because the previous row ends with `RESET`. The invariant "each row starts in a known SGR state" is therefore load-bearing and must be part of the contract (§5, C2/C3).
* **The row-final reset is the only cross-row guard.** Without `if (!row.endsWith(RESET)) row += RESET` the leak would cross row boundaries and stain entire rows, not just the right edges.

### 1.4 The precise escape fix

Make the background explicit in the two half-filled branches. The minimal, attribute-preserving fix is **SGR 49 (default background)** — SGR 39 (default foreground) is *not* needed, because the foreground is always set for a drawn cell:

```ts
const DEFAULT_BG = '\x1b[49m'          // SGR 49 — default background

if (up !== undefined && lo !== undefined) {
  seq = fg(up) + bg(lo); ch = '▀'      // both halves specified
} else if (up !== undefined) {
  seq = fg(up) + DEFAULT_BG; ch = '▀'  // empty LOWER half → background must be default
} else if (lo !== undefined) {
  seq = DEFAULT_BG + fg(lo); ch = '▄'  // empty UPPER half → background must be default
} else {
  seq = ''; ch = ' '                   // RESET → default fg+bg
}
```

Equivalents, and their trade-offs:

* `seq = RESET + fg(up)` / `RESET + fg(lo)` — also correct (SGR 0 clears fg+bg), but it drops every other attribute (bold, underline, …) and defeats the point of the `current` cache.
* If the app wants a *themed* background rather than the terminal default, the correct form is `bg(themeBg)` instead of `49m`. The contract is "**every cell's sequence fully determines both the foreground and the background**", not "always reset".
* A blunt alternative is to drop the `current` cache and emit `RESET` before every cell — correct but much larger output and it still needs the per-cell background choice.

Cache correctness after the fix: `seq` now describes the complete state, so the `current` comparison is sound. Two consecutive half-filled cells with the same foreground produce an equal `seq` and correctly skip the re-emit; a "both" cell followed by a half-filled cell with the same foreground now produces *different* sequences (`bg(lo)` vs `49m`) and the background reset **is** emitted — which is precisely the emission the shipped code was missing.

---

## 2 · Ghost pixels of the previous frame surviving a narrower frame switch

### 2.1 What the renderer drops

```ts
let row = out.replace(/[ ]+$/, '')      // <-- the erase is deleted
if (!row.endsWith(RESET)) row += RESET
```

Each rendered row is built as: `… content …` + `RESET` + `run of spaces` for the trailing transparent cells, and then the **trailing spaces are trimmed away**. The spaces were not decoration: they were the *erase*. A space written under a reset paints the cell with the default background and therefore destroys whatever the previous frame left in that cell. By trimming them, the renderer deletes the only mechanism that was clearing the previous frame.

### 2.2 What the text pipeline does with trailing whitespace

* **Terminal write semantics.** Writing a shorter line overwrites only the cells you actually write; the terminal does not implicitly issue an erase-to-end-of-line, and the remainder of the line keeps the previous content and the previous colours. So after `WIDE → NARROW`, the cells beyond the narrow frame's last drawn column still show the wide frame's tail — the reported "pixels of the wide tail REMAIN on screen at their old positions". The narrow frame renders fine because it is written correctly; only the surplus is stale.
* **Whitespace is not a reliable carrier.** Any layer that treats trailing whitespace as insignificant — a string/JSON transport, a `trimEnd()` in a writer, a line-oriented transport, a formatter that re-wraps lines — removes the padding *before* it reaches the terminal, so "pad with spaces" is not by itself a guarantee. **[unconfirmed]** the fixture does not name a specific trimming layer in the host; the pipeline's trimming behaviour is not evidenced either way, which is precisely why the fix must not depend on it. The only trimming the fixture *does* evidence is the renderer's own `/[ ]+$/`.

### 2.3 The two-part fix that guarantees a clean frame switch

**Part 1 — content: keep the erase in the row.** Never drop the trailing transparent cells. Every frame must be rendered on a **fixed canvas** (the same 25×40 pixel grid, 13×40 terminal cells) and every row must be emitted at the **full frame width**, with the padding cells written *after an explicit reset* so they clear to the default background. Concretely: drop `out.replace(/[ ]+$/, '')` and pad to the frame width with a preceding `RESET` (padding must be counted in **cells**, not in string length, because the row contains escape sequences). Padding written *without* a preceding reset would repaint the sprite's background colour instead of erasing it.

**Part 2 — erase semantics: make the erase explicit and whitespace-independent.** Issue a real erase control sequence for the region the new frame no longer covers — `ESC[K` (EL 0, erase to end of line) at the end of each row, `ESC[0J` (ED 0) after the last row, or a rectangle-scoped clear of the sprite area — and clear the whole sprite rectangle when the frame footprint changes (first frame, or a frame whose painted extent changes). Because a control sequence is not whitespace, it survives any trimming transport.

Neither half alone is sufficient, and that is why it is a two-part fix:

* Part 1 alone fails when a text layer trims trailing whitespace (the padding never reaches the terminal).
* Part 2 alone (unscoped `ESC[K`) erases everything to the right of the cursor on that line, including app content outside the sprite rectangle; a rectangle-scoped erase is safer but is easiest to implement by *combining* it with Part 1's fixed-width padding.
* Together: every cell of the sprite area is rewritten every frame (Part 1) **and** any region the new frame no longer covers is explicitly erased (Part 2) — a clean switch by construction, independent of the pipeline.

Corollary: the animation's frames must all share one canvas size. A frame whose art is shorter must be padded to the canvas, not trimmed to its content.

---

## 3 · Frame-data drift (the hand-ported `tail2` frame)

### 3.1 What the digest report says

The report hashes **each frame's 25 rows** (sha256) and compares against the frames the sprite was ported from. Result: every frame is **OK** except one — `tail2` is a **MISMATCH**; `standard`, `blink`, `fin1`, `fin2`, `spout1-6`, `tail1`, `tail3`, `tail4`, `heart1-3`, `sleep1-5` all match.

`tail2` detail (ported vs. source art):

* row 2: ported `D` at col 26, source `D` at col 27 → **1 column left shift**;
* row 3: ported has an **extra** `D` at col 25; `DBD` at cols 26-28 shifted left by 1; **extra `DD` at cols 36-37**;
* rows 4-6: the upper-right cluster is **shifted 1 column left throughout**;
* total: **23 differing cells**, all in the upper-right spout/tail-tip area.

"row 2 / row 3" here are *pixel* rows of the 25-row frame. The report also states the provenance: "The ported `tail2` was hand-copied during conversion". So the drift is a **transcription error introduced by hand-copying**, not a renderer bug — it is a separate defect from §1/§2 and would be visible even in a non-animated, correctly-rendering build.

### 3.2 Why the existing per-excerpt regression missed it

The report says: "an excerpt-based regression (added later for a different frame) did not cover it." Four independent reasons, all visible in the evidence:

1. **Wrong frame.** The regression was written for a *different* frame. Nothing in CI covered `tail2` at all, so `tail2` could not fail. There is no coverage matrix tying frames to tests.
2. **Wrong region.** An *excerpt* samples a subset of rows/columns. The drift lives in rows 2-6 of the upper-right cluster (cols 25-37). An excerpt that does not cover that window never looks at the differing cells.
3. **Wrong invariant.** A shift preserves the *multiset* of characters inside any window. An excerpt assertion that counts characters, checks "a `D` exists somewhere near here", or compares a character *set* passes unchanged under a 1-column shift. Only a **position-sensitive** comparison (exact cell-for-cell equality) can see it — and an excerpt of a *different* frame cannot.
4. **Circular expectation.** The ported frame is the hand copy; if the expectation was derived from the same copy (or from the frame under test), the test asserts the copy against itself and can never detect a copy error. Only a comparison against the **source art** is independent.

Note also that the *extra* cells (col 25, and `DD` at cols 36-37) are of a different kind from the shift: a count-based excerpt could in principle catch them, but only if the excerpt covered exactly those coordinates.

### 3.3 The gate that prevents recurrence

Ship a **per-frame content digest manifest** and assert it for **every** frame, not an excerpt of one:

1. **Manifest.** A checked-in file mapping *frame id → sha256 of its 25 rows* (rows joined with a fixed separator, line endings normalised). The expected digests are generated **from the source art** by a script, never from the ported copy.
2. **CI gate.** One test walks the animation's frame set, computes each digest, and compares against the manifest. It must cover **all** frames — `tail2` fails this gate today with 23 differing cells.
3. **Coverage assertion.** Assert `manifest entries == frames present in the animation directory`, so a newly added frame without a digest fails the build (this is what "an excerpt-based regression … did not cover it" let happen).
4. **Authoritative whole-frame comparison.** Keep the digest as the *gate* (cheap, one line per frame in a diff) but back it with a full 25×40 cell-for-cell comparison against the source art, so a failure reports *which* cells differ (the digest report's "23 differing cells" detail) rather than only "hash mismatch".
5. **Regeneration discipline.** The manifest is refreshed only by an explicit, reviewable command that re-renders the art from the source, and the refreshed manifest is a reviewed diff — so an accidental re-copy cannot silently bless drifted data.
6. **Structural invariants.** Assert each frame has exactly 25 rows of exactly 40 characters and that the frame set shares one canvas size — the same "fixed canvas" rule the renderer needs for §2.

---

## 4 · The CI hang: a timer-pinned event loop

### 4.1 What the CI evidence shows

* Job `channel-ui`: **PASS for all scene checks**, then the process sits idle. It **does not exit** and is eventually killed at the runner timeout. The same job had always finished in ~3 minutes before the flip; one local observation recorded **19 minutes of idle** before a manual kill.
* Process state at kill: **no running test, no pending assertion**. The event loop has **live handles of kind `Timeout` — one per tick of the sprite animation planner, each re-arming the next**.
* "The planner reschedules a `setTimeout` for as long as its component stays mounted, and these particular hosts mount the header component and finish **WITHOUT unmounting it**."
* "The interactive terminal product is unaffected: its process is kept alive by the TTY/stdin handles regardless of the timer chain."
* "Timeline: the hang first appeared in the same push that flipped the animation feature's default from off to on."

### 4.2 The mechanism that kept the finished job alive

1. The animation planner implements the frame pump with a self-rescheduling timer: on each tick it schedules the next tick (`setTimeout(tick, interval)`). This is the standard "keep a timer alive to drive an animation" pattern.
2. A **pending Node timer holds a live handle on the event loop**. The event loop only reaches the "no more work" state — and the process only exits — when there are no referenced handles left.
3. Because the planner re-arms itself on every tick, the handle is **always** pending: there is no instant at which the event loop is empty. The chain never terminates, so the process can never exit, even though every assertion has already passed. The job is not stuck; it is **finished but pinned open by its own timer**.
4. The trigger is the **missing unmount**: the scene-check hosts mount the header component and finish their checks **without unmounting/disposing it**, so the disposer that would `clearTimeout` is never invoked and the planner keeps pumping. (Node's timer would be cleared on process exit — but the process never reaches exit.)
5. The **interactive terminal** is unaffected because that process is *supposed* to stay alive: the TTY/stdin handles already keep the event loop referenced, so the extra Timeout changes nothing observable. The defect is invisible there and only surfaces in a host that relies on the event loop **draining** to exit — i.e. a headless CI scene-check.
6. The default flip is what made it visible: with the feature off the component/planner never mounted, so the timer chain never existed; the same push introduced the timer and the hang. The "PASS + idle" signature is diagnostic — the assertions are not the problem.

### 4.3 The one-line fix

Make the timer not hold the event loop open:

```ts
this.timer = setTimeout(() => this.tick(), this.intervalMs)
this.timer.unref()          // <-- the one-line fix
```

`unref()` removes the handle's reference count on the event loop: the animation still runs normally while the process is alive for other reasons, but it can no longer keep a process alive on its own. That is exactly the semantics an optional animation wants.

The structural companion (not the one-liner, but the correct ownership): **the planner's timer must be owned by the component's lifecycle** — store the handle, `clearTimeout(this.timer)` in the disposer, and make the disposer **idempotent** so it is safe to call twice and safe to call from either an unmount or an explicit stop. The reference material's lifecycle analogue is `DSH-0.1.3-A1-05` (single-owner lifecycle state, idempotent `close()`/`Symbol.asyncDispose` teardown); the "a descendant must not be able to hold an operation (and its lock) open" analogue is `DSH-0.1.7-RC1-05`; the "a headless wrapper's completion is its exit code" analogue is `DSH-0.1.2-A1-05` (success judged by exit code — a job that never exits never produces one). `unref()` plus a disposer that is actually called covers both the missing-unmount host and any future host that forgets to unmount.

**Regression guard:** a test that spawns a child process, mounts the animated component, and asserts the child **exits on its own** within a short budget. "All assertions passed" must not be the only exit criterion for a CI job.

---

## 5 · Prevention

### 5.1 The renderer contract a terminal sprite implementation should ship with

* **C1 — Every cell fully specifies its own state.** A cell's escape sequence must determine **both** the foreground and the background. For half-block glyphs this means the *empty* half's colour must be stated explicitly (SGR 49 default background, or the theme's background) — never "whatever was last set". The state cache (`current`) is only sound if `seq` describes the complete visible state.
* **C2 — Rows are self-contained.** Every row begins in a known SGR state and ends with a full reset (SGR 0). No SGR may leak from one row to the next, and no SGR may leak into the host's own output.
* **C3 — The transparent case is a case.** A fully transparent cell is painted as a default-background blank, not as "nothing" (the shipped code does this; keep it as an explicit contract item).
* **C4 — The erase is never dropped.** Rendering a frame must erase the previous frame: fixed canvas + full-width rows, padding written under a reset (§2 Part 1), plus an explicit whitespace-independent erase for the region the new frame no longer covers (§2 Part 2).
* **C5 — Fixed canvas.** All frames of an animation share one width/height; a shorter frame is padded, never trimmed to its content.
* **C6 — The render function is pure.** `renderSpriteRows(frame, palette) → string[]` must be a pure function: no cursor moves, no erases, no writes, no timers. Position, erase and write belong to the driver. This is what makes a golden-string test of the rendered output possible.
* **C7 — Frame data is machine-derived.** Frames are generated from the source art (or mechanically derived), never hand-copied; every frame is 25×40; the per-frame digest manifest (§3) is checked in and enforced in CI, with a coverage assertion so an uncovered frame cannot exist.
* **C8 — Frame order and geometry are declarative.** The animation's frame list, canvas size and interval live in one manifest that both the renderer and the digests read, so a frame added without a digest, or a frame with a different canvas, is a hard error.
* **C9 — Lifecycle ownership of every timer.** Every timer/interval the animation creates is stored on the component, cleared in the disposer, and `unref()`ed so it can never keep a host process alive. The disposer is idempotent and must be callable from unmount, stop, and explicit teardown.
* **C10 — Every host that mounts it unmounts it.** A component whose host may not unmount must still be safe: `unref()` is the belt, the disposer is the braces.
* **C11 — Documented terminal capabilities.** The minimum terminal support (24-bit colour SGR 38;2/48;2, the half-block glyphs) plus a monochrome / no-truecolour fallback path, so a degraded terminal cannot silently produce a differently-broken image.
* **C12 — Golden text render, not screenshots.** The regression should assert the **plain glyph grid** and, separately, the **SGR stream** per cell. A screenshot diff cannot distinguish "a pixel is missing" from "a pixel is the wrong colour"; a cell-level assertion can, and it is exactly the class of bug in §1.

### 5.2 The audit to run BEFORE flipping an animation feature default-on

* **A1 — Static timer/lifecycle sweep.** Grep the feature for `setTimeout`, `setInterval`, `requestAnimationFrame`. For each hit: is the handle stored? is it `unref()`ed? is it cleared in a disposer that is idempotent? Any timer that can outlive its component without being unref'd is a **release blocker**.
* **A2 — Mount/unmount matrix.** Enumerate every host that mounts the animated component (CI scene checks, headless wrappers, the interactive terminal, the web host) and record, for each, whether it unmounts. Any host that does not unmount must be covered by `unref()` — and that coverage must be asserted, not assumed.
* **A3 — Exit-semantics gate.** Add a CI assertion that a scene-check job **exits on its own** after its checks (bounded budget, e.g. seconds, not minutes). This is the check that would have caught the hang: the job's completion criterion must be "process exited 0", not "assertions passed". (Contract analogue: `DSH-0.1.2-A1-05` — a headless wrapper's success is its exit code.)
* **A4 — Frame-integrity gate.** Regenerate the digest manifest from the source art and confirm every frame matches; assert manifest/frame-set equality (§3). A default flip must not be allowed to ship with a drifting frame.
* **A5 — Frame-switch invariant.** For every ordered frame pair (at minimum the widest → narrowest transition), assert the new frame's painted extent covers the old frame's, or that the driver erases the surplus; and assert the rendered output of the switch contains no cell outside the new frame's data. This is the "no ghost" test.
* **A6 — Cell-level visual regression.** Render each frame to a string in a fixed palette and compare against a golden at cell granularity (glyph grid + per-cell fg/bg), not by screenshot. This is the test that fails on the §1 phantom and on a §2 ghost, and it is deterministic and CI-friendly.
* **A7 — Full-width / non-trim assertion.** Assert the rendered row length equals the canvas width and that no rendered row is shorter than the canvas (i.e. the trim is gone), plus an assertion that a narrow frame's render still covers the widest frame's footprint.
* **A8 — Flag & rollback readiness.** The default flip must be a separate, revertible commit with the flag documented; confirm the off-switch takes effect without a rebuild and that the previous default is trivially restorable.
* **A9 — Observability for the "passed but didn't exit" class.** Track jobs that pass their checks but exceed their exit budget; alert on "PASS + idle". The symptom is otherwise invisible until a runner timeout.
* **A10 — Canary order.** Roll out default-on to a subset of hosts first (one CI group, then the interactive product) with A3's exit gate active, before flipping the global default.
* **A11 — Post-flip soak.** Keep the exit budget tight for a full release cycle after the flip; the hang appeared in the same push as the flip, so the window immediately after the flip is where it must be watched.

### 5.3 The minimal patch set implied by this evidence

| # | Change | File/place | Fixes |
|---|---|---|---|
| 1 | Half-filled cells emit an explicit background (SGR 49 / theme bg) | `renderSpriteRows`, the `up !== undefined` / `lo !== undefined` branches | §1 phantom |
| 2 | Stop trimming the row; render the fixed canvas width, padding under a reset | `out.replace(/[ ]+$/, '')` | §2 ghost (part 1) |
| 3 | Add a whitespace-independent erase for the region the new frame no longer covers | driver (EL/ED or rectangle clear) | §2 ghost (part 2) |
| 4 | Per-frame digest manifest + coverage assertion, generated from the source art | CI | §3 drift |
| 5 | `timer.unref()` on the planner's timeout, and `clearTimeout` in an idempotent disposer | animation planner | §4 hang |
| 6 | "The job must exit on its own" assertion in CI | scene-check harness | §4 regression guard |

---

## 6 · Validation and reporting (skill format)

* **Pre-existing:** not collected — this is a read-only inspection of a shipped renderer; no test suite was executed, and executing fixture code is forbidden by the brief. All findings are static-analysis results over the four fixture files.
* **Completed:** mechanism and fix for the phantom pixels (§1), the ghost frames (§2), the frame drift and its gate (§3), the CI hang and its one-line fix (§4), plus the renderer contract (§5.1) and the pre-flip audit (§5.2). The contract is stated so that it can be asserted mechanically.
* **Skipped (with reason):** no host/CLI/runtime probing (forbidden by the brief and out of scope — the installed host is a different version); no execution of the fixture renderer (fixture is read-only and must stay unchanged); no reproduction of the CI hang (the evidence file is the account of it); no attempt to identify the specific host layer that might trim trailing whitespace — not evidenced by the fixture **[unconfirmed]**.
* **Pending / residual risk:**
  * The exact terminal behaviour that produced the user-visible "column of noise to the right of the outline" (whether the fringe reads as right-of or below the outline) is a rendering nuance that depends on the terminal and on which half the outline pixel occupies; the *mechanism* (leaked SGR 48 background in the empty half) is fully determined by the code and is not terminal-specific.
  * The identity of the CI hosts that mount the header component without unmounting it is not named in the evidence beyond "these particular hosts"; the audit item A2 must enumerate them in the repository.
  * Whether other frames besides `tail2` drifted in areas the digests cover is answered (all other frames are OK), but frames that were never in the manifest would not be detected by the existing digests — hence the coverage assertion.
* **Rollback:** the report is read-only, so there is nothing to roll back. The proposed patch set (§5.3) is independent per item: items 1-4 are renderer/CI-only and behaviour-preserving for correct art; item 5 is one line; the flag default can be reverted independently of the code fixes (A8).
* **Recommendations:** ship the renderer contract (§5.1) as a checklist in the sprite package's README **and** as an executable golden test (C12) so it is enforced rather than documented; make `unref()` the default for every timer created by a UI plugin; require the "process exits on its own" assertion in every CI job that mounts a UI component.

*Reference cards cited (key points only): `DSH-0.1.3-A1-05` (single-owner lifecycle state; idempotent `close()`/`Symbol.asyncDispose` teardown) · `DSH-0.1.7-RC1-05` (a descendant/child must not be able to hold an operation and its lock open; bounded drain) · `DSH-0.1.2-A1-05` (a headless wrapper's success is its exit code: 0 = completion) · `DSH-0.1.2-A1-03` field note (the `dsh-ui-whale` plugin family appears in the reference material; that card's surface change is unrelated to these renderer defects). No version card covers half-block rendering or timer liveness, which is why §5 is stated as a plugin-side contract rather than a host migration.