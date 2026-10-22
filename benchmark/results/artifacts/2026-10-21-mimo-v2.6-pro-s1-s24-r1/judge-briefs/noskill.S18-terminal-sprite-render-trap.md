# JUDGE BRIEF · noskill.S18-terminal-sprite-render-trap

## Criteria (sealed rubric)
- [half-cell-background] (20pt) Locate the upper-only/lower-only branches in renderer-excerpt.ts: they emit foreground only, leaving a previous cell’s SGR background active and painting the transparent half. Reset background on each half-filled cell with ESC[49m or an equivalent reset followed by restoring the intended foreground. A row-end reset alone occurs too late. Tie the mechanism to the edge symptoms rather than blaming artwork or the terminal emulator.
- [frame-clearing] (20pt) Explain the renderer’s trailing transparent-space trim and downstream whitespace handling: a narrower frame does not overwrite the previous frame’s surplus columns. Propose full-sprite-width row output plus erase-to-EOL (ESC[K), or a demonstrably equivalent explicit clearing procedure that survives whitespace trimming. Keep SGR state controlled. Merely adding spaces without accounting for the pipeline is incomplete.
- [frame-data-integrity] (20pt) Use frames-digest-report.txt to identify the hand-ported tail2 mismatch (23 changed cells; the visible shifted cluster is not the full diff count), distinguish data drift from renderer artifacts, and explain that a different-frame excerpt test missed it. Compare/assert every frame against trusted source art using digests or exact rows. Testing one excerpt or hashing against the already-drifted port is insufficient.
- [timer-liveness] (20pt) Use ci-hang-evidence.txt: mounted probe hosts never unmount, the planner continuously rearms referenced setTimeout handles, so finished checks cannot exit. Interactive TTY/stdin already keeps the product alive. Unref each newly scheduled planner timeout (timer.unref or equivalent) so animation continues while another handle is live but does not keep probes alive by itself. Extending CI timeouts or stopping animation globally does not fix the lifecycle contract.
- [renderer-and-rollout-prevention] (20pt) Consolidate background reset, full-width/erase behavior, balanced SGR state and source-backed all-frame integrity into a renderer checklist. Before default-on rollout audit timers and every mounting host, especially probes that finish without unmounting, and propose an exit/liveness regression. No actual render or CI execution is required.

## Caps (score ceilings; judge returns each with triggered true/false)
- CAP [contradictory-render-advice] ceiling=0 The final advice denies the need to reset the half-cell background, retains trailing trimming without equivalent clearing, rejects source-backed frame checks, or says the repeating planner timer should remain referenced / unref is harmful. Blaming the terminal emulator instead of fixing the demonstrated renderer defect also triggers this cap. Apply only to affirmative final advice or conclusions. Quoted, hypothetical or explicitly rejected bad examples do not trigger the cap; read the whole report.

## Candidate report(s)
#### FILE: S18-terminal-sprite-render-trap/report.md

# S18 · The Terminal Sprite Render Trap — Root-Cause Report

**Evidence analyzed (read-only):** `fixture/renderer-excerpt.ts` (the shipped half-block renderer), `fixture/symptom-log.txt`, `fixture/frames-digest-report.txt`, `fixture/ci-hang-evidence.txt`. The `fixture/` directory was left byte-identical.

Renderer model recap: 25 rows x 40 cols of palette chars ('.' = transparent) are packed two-rows-per-cell into 13 terminal rows. Per cell: both pixels -> `fg(up)+bg(lo)` + '▀'; upper only -> `fg(up)` + '▀'; lower only -> `fg(lo)` + '▄'; neither -> ' '. Half-block glyphs paint their **filled** half with the *foreground* and their **empty** half with the *background* ('▀' U+2580: upper=fg, lower=bg; '▄' U+2584: lower=fg, upper=bg). That single fact is the root of symptom 1.

## 1. Phantom pixels — the background SGR that is never cleared

### Exact mechanism
- `bg(lo)` (SGR `48;2;R;G;B`) is emitted **only** in the both-pixels branch of the cell loop.
- The two half-filled branches emit **fg-only** sequences — `fg(up)` (SGR `38;2;…m`) for the '▀' cell, `fg(lo)` for the '▄' cell — and never touch the background.
- SGR is cumulative state: `38;2;…m` replaces only the *foreground*; the previously applied `48;2;…m` **persists** into the following cells. Which state persists across cells: **the background color SGR**.
- Because a half-block glyph paints its empty half with the background, every half-filled cell that inherits a background paints a **phantom pixel into its EMPTY half** (lower half of '▀' cells; upper half of '▄' cells).
- The emit-dedupe widens the blast radius: `current` caches the last emitted **sequence string**, not the terminal's real (fg, bg) state. On the transition `fg(a)+bg(x)` -> `fg(a)` the code emits `fg(a)` (the strings differ) and stores `current = 'fg(a)'`, but bg(x) is still active on the terminal. Every later cell whose `seq` string equals `'fg(a)'` emits **nothing**, so the stale background keeps painting across the whole run of cells.

### Which cells expose it
Any **half-filled cell that follows a both-filled cell** in the same row — immediately, or after a run of half-filled cells sharing the same fg string:
- upper-only '▀' cells show the phantom in their **lower** half;
- lower-only '▄' cells show the phantom in their **upper** half.

This maps 1:1 onto the symptom log. At the sprite's right edges the colored runs end in both-filled cells: the dark `D` outline cells, the sleep-Z symbols and the heart glyph all set fg+bg (or fg over a bg that a neighbor just set); the cells immediately to their right are half-filled edge pixels (Z strokes, heart edge, tail-tip half pixels), so their empty half shows the *previous cell's other pixel color* — the 1-cell-wide column of dim colored noise hugging the right edge that moves with the animation. Fully empty cells are safe: the `seq === ''` branch emits `RESET`, which is exactly why the noise stops after one column and why the artifacts are "strictly inside/at the edge of the sprite's cell area" (the frame data at those columns is '.', as the log notes).

### Precise escape fix
Make every emitted per-cell sequence **absolute**: always set fg *and* bg, using the default background escape `\x1b[49m` (SGR 49) whenever the corresponding half is transparent:

```ts
const bgDefault = '\x1b[49m'            // SGR 49 = default background
...
if (up !== undefined && lo !== undefined) {
  seq = fg(up) + bg(lo)                 // upper=fg, lower=bg
  ch = '▀'
} else if (up !== undefined) {
  seq = fg(up) + bgDefault              // FIX: lower half must be default, not inherited
  ch = '▀'
} else if (lo !== undefined) {
  seq = fg(lo) + bgDefault              // FIX: upper half must be default, not inherited
  ch = '▄'
} else {
  seq = RESET
  ch = ' '
}
if (seq !== current) { out += seq; current = seq }
```

`\x1b[49m` appended to (or prefixed before) the two half-filled sequences is the minimal precise fix; the belt-and-braces variant is to emit `RESET` before every state change (every `seq` is then absolute). Once each `seq` fully describes (fg, bg), the `current` string comparison becomes a faithful state comparison and the dedupe is safe again. Also worth hardening: `palette[upper[x]]` for an **unknown palette char silently yields `undefined` = transparent**, which hides data drift as dropped pixels — unknown chars should throw.

## 2. Ghost frames — trailing blanks are dropped twice, so nothing erases the old tail

### Mechanism (what survives a wide -> narrow switch)
Two independent drops of the erase work:

1. **The renderer drops each row's trailing blank cells.** The cell loop runs only over `upper.length` columns — a narrower frame's row literally writes fewer columns — and afterwards `out.replace(/[ ]+$/, '')` deletes every trailing space. Those trailing spaces were the only thing that would have overwritten the previous (wide) frame's tail glyphs: a blank cell clears an old pixel only if a space is actually written at that column, and here the space is trimmed away before the row is returned. (Even the loop itself stops at the shorter row's end, so surplus columns are never visited.)
2. **The text pipeline strips trailing whitespace.** The line-oriented text layer (terminal line writer / log capture / whitespace normalization on the way to the screen) trims trailing whitespace per line. Even if the renderer kept the spaces, they would be removed before display — trailing spaces can never act as erasers in this pipeline.

Net effect: switching from a WIDE pose (tail swung out, rows reaching further right) to a NARROWER pose, the new rows repaint only their own columns; the surplus right-hand columns receive neither cells nor spaces, so the wide frame's tail pixels remain at their old positions = **ghost pixels**. The narrow frame itself "renders fine" because every column it does cover is fully repainted.

### Two-part fix that guarantees a clean frame switch
1. **Erase with escapes, never with spaces — terminate every rendered row with `RESET` + `\x1b[K`** (CSI 0 K = erase from cursor to end of line):
   ```ts
   out = out.replace(/[ ]+$/, '')        // trailing spaces may still be trimmed…
   rows.push(out + RESET + '\x1b[K')     // …but the erase-to-EOL escape cannot be trimmed
   ```
   `\x1b[K` is not whitespace: neither the renderer's `/[ ]+$/` trim nor the text pipeline's trailing-whitespace stripping can remove it, and after `RESET` it erases with the default background.
2. **Fixed geometry + full-box redraw:** normalize every frame row to the sprite's full width (pad to 40 columns with '.' at load, reject wrong-length rows) and always iterate the full width; on every frame switch, home the cursor to the sprite origin (CUP) and redraw all 13 rows of the sprite box (or issue `\x1b[2J`). Never rely on writing spaces or on the previous frame's layout.

Part 2 guarantees every row is written with identical extent from a known origin; part 1 erases anything to the right of the new content regardless of whitespace handling. Together they make wide -> narrow switches clean by construction.

## 3. Frame data drift (tail2) and the digest gate

**What the digest report says:** per-frame sha256 of each frame's 25 rows vs the source art — every frame OK except **tail2 = MISMATCH**, 23 differing cells, all in the upper-right spout/tail-tip area: row 2 ported `D` at col 26 vs source col 27 (1-col left shift); row 3 extra `D` at col 25, `DBD` at cols 26-28 shifted left 1, extra `DD` at cols 36-37; rows 4-6 upper-right cluster shifted 1 column left throughout. That is exactly the misplaced 6-pixel tail-tip cluster in the symptom log.

**Why it drifted:** tail2 was **hand-copied (hand-ported) during conversion** — a transcription error (one-column shift plus stray pixels), not a renderer bug. It renders perfectly; it is simply the wrong art.

**Why the per-excerpt regression missed it:** the existing regression is excerpt-based — added later for a *different* frame and comparing only selected rows/excerpts. tail2's rows were never in its scope. Excerpt tests sample; they cannot prove whole-frame fidelity, and a hand-ported frame is invisible to a test that never touches it.

**The gate that prevents recurrence — per-frame full-artifact digest gate in CI:**
- For **every** frame, compute the digest over **all 25 rows** and compare against a checked-in golden manifest of source-art digests; any MISMATCH fails the build (tail2 fails on day one).
- The manifest is golden data reviewed like code; regeneration goes through the source art, never through hand editing.
- Eliminate hand-porting at the source: derive/export frame data from the source art programmatically (single source of truth); treat the digest manifest as the contract.
- Excerpt tests may remain as fast spot checks, but the digest gate — not excerpts — is the blocking gate.

## 4. The hang: a timer-pinned event loop after "finished"

### Mechanism
- The animation planner re-arms itself with `setTimeout` every tick **for as long as its component stays mounted**; each tick schedules the next, so there is always at least one live `Timeout` handle. The CI evidence confirms it at kill time: no running test, no pending assertion, only live handles of kind Timeout, one per tick, each re-arming the next.
- A pending `Timeout` is a live Node/libuv handle that **keeps the event loop alive**. The channel-ui hosts mount the header component (which owns the planner) and **finish without unmounting it** — so the timer chain never stops rescheduling.
- Result: all scene checks PASS, then the process sits idle and cannot exit ("finished but hanging"); the job is killed at the runner timeout (previously ~3 minutes; 19 minutes of idle observed once).
- Why the interactive terminal is unaffected: its process is a long-lived TTY app whose **TTY/stdin handles keep the loop alive by design**; the animation is supposed to run forever there, so the timer chain changes nothing observable.

**What reschedules forever:** the animation planner's per-tick `setTimeout` chain (one live Timeout per tick, re-armed while mounted). **Which hosts:** the CI/scene-check hosts of the channel-ui group that mount the header component and never unmount it before finishing.

### One-line fix
Unref the re-armed timer in the planner so the animation can never hold the process open:

```ts
const t = setTimeout(tick, interval); (t as any).unref?.()
```

(equivalently the one-line disposal `useEffect(() => () => clearTimeout(t), [])` / clear-on-unmount). `unref()` is the single line that guarantees the job exits regardless of host unmount discipline; the paired contract fix is that every host unmounts/disposes its mounted components before finishing.

## 5. Prevention

### Renderer contract checklist (ship it with any terminal sprite implementation)
1. **Absolute SGR per cell:** every cell's escape sets fg *and* bg (bg = `\x1b[49m` when that half is transparent). No color state is ever inherited across cells.
2. **Empty half = default:** a half-filled cell's empty half is explicitly default; never "leave as it was".
3. **State cache = full state:** any emit-dedupe keys on the complete (fg, bg) state, not on partial sequence strings.
4. **Erase with escapes:** rows end with `RESET` + `\x1b[K`; frame switches do a full-box redraw (CUP to sprite origin) or `\x1b[2J`. Never use spaces/blank cells as erasers — trailing whitespace is stripped by the renderer and by text pipelines.
5. **Fixed geometry:** one bounding box (25x40) for all frames; rows normalized and length-checked at load; the renderer iterates the full width; unknown palette chars throw instead of silently rendering transparent.
6. **Frame data integrity:** single source of truth for art (no hand-porting); per-frame sha256 digests of all rows in a checked-in golden manifest; CI digest gate over **every** frame; excerpt tests only as spot checks.
7. **Lifecycle:** animation timers are `unref()`'d and cleared on disposal; every host unmounts before finishing; headless runs must be able to exit immediately after the last assertion.
8. **Regression on decoded pixels:** goldens compare the decoded per-cell pixel grid (fg/bg per cell), not just characters — SGR-leak bugs hide behind identical text — plus full escape-output snapshots.
9. **Symptom taxonomy in tests:** include wide->narrow frame switches, half-filled cells adjacent to both-filled cells, and right-edge columns — the exact cases that produced phantoms and ghosts.

### Audit to run BEFORE flipping an animation feature default-on
1. **Dual-state render diff:** capture every frame and every ordered frame-pair switch with the feature ON and OFF; decode cells to pixel grids and diff; verify no SGR inheritance and no residue after wide->narrow switches.
2. **Data gate:** run the per-frame digest gate on all frames; block the flip on any MISMATCH (the tail2 class of drift).
3. **Exit audit (headless):** run the real CI hosts with the feature ON under a hard timeout and assert the process **exits by itself** within N seconds after the last check; compare wall-clock against the baseline (~3 min) and fail on growth.
4. **Handle inventory:** at end of the headless run, assert no Timeout/Interval handles owned by the feature remain (process._getActiveHandles() / why-is-node-running style check); grep every `setTimeout`/`setInterval`/`requestAnimationFrame` for a matching `unref`/`clearTimeout`, and every mount for a matching unmount.
5. **Whitespace-pipeline check:** run the render path through the real text pipeline (which trims trailing whitespace) and confirm frames are still clean — proving erasure is escape-based.
6. **Host lifecycle matrix:** test all hosts (interactive TTY, CI scene-check, headless snapshot) for mount/unmount behavior; flip only when every host either unmounts or its timers are unref'd.
7. **Rollout discipline:** stage the flip (canary) with explicit revert triggers — any job exceeding baseline runtime, any digest mismatch, any phantom/ghost report — and keep the feature-off path regression-tested and unchanged.

## run-stats

- toolcalls: 15 dispatches at harness level — 11 executed `run_code` programs (26 inner tool calls: 1 glob, 1 working_directory, 8 read, 14 write, 2 send_message) + 4 direct `read` dispatches rejected by the harness (not executed). This line is self-counting; no tool call follows it.
- token usage: n/a (not visible in this session)
- completion time: 2026-10-21T07:14:10.527Z (report finalized; Wed Oct 21 2026 15:14:10 GMT+0800 (中国标准时间))

#### FILE: S18-terminal-sprite-render-trap/tool-transcript.txt

S18-terminal-sprite-render-trap · tool-transcript（按发生顺序，全部工具调用）
1. run_code  tools.glob pattern=**/* path=fixture（列出 fixture 全部文件）
2. run_code  tools.working_directory 无参数（读取当前工作目录，非文件系统访问）
3. read  file_path=fixture\README.md（无效调用：direct tool 不可直接调用，被拒绝、未执行）
4. read  file_path=fixture\symptom-log.txt（无效调用：同上，未执行）
5. read  file_path=fixture\frames-digest-report.txt（无效调用：同上，未执行）
6. read  file_path=fixture\ci-hang-evidence.txt（无效调用：同上，未执行）
7. run_code  tools.read ×4：fixture\README.md、fixture\symptom-log.txt、fixture\frames-digest-report.txt、fixture\ci-hang-evidence.txt（并行读取证据文本）
8. run_code  tools.read fixture\renderer-excerpt.ts（读取 46 行渲染器源码摘录）
9. run_code  tools.write ×2：agent-output\S18-terminal-sprite-render-trap\report.md 与 agent-output\report.md（写入 127 行 / 14420 字节根因报告，含 run-stats 与完成时间戳）
10. run_code  tools.read agent-output\report.md（回读校验：totalLines=127，非空）
11. run_code  tools.send_message agent_id=session-5d3ebe0e-127d-4dc4-a3b9-cb2199b04f8e（向父代理上报结果摘要，messageId=09867291-807a-4cc0-b861-200f290f5036）
12. run_code  tools.write ×4：agent-output\tool-transcript.txt、agent-output\S18-terminal-sprite-render-trap\tool-transcript.txt、agent-output\transcript-manifest.txt、agent-output\S18-terminal-sprite-render-trap\transcript-manifest.txt（写入本清单与文件系统访问清单及镜像）13. run_code  tools.read agent-output\report.md + tools.write ×2（report.md 校正 run-stats 计数）+ tools.write ×2（tool-transcript.txt 追加本条）—— 同一程序内完成14. run_code  tools.read agent-output\report.md + tools.write ×2（report.md 再次校正 run-stats 为自计数终值）+ tools.write ×2（tool-transcript.txt 追加本条）—— 本次之后不再有任何工具调用


#### FILE: S18-terminal-sprite-render-trap/transcript-manifest.txt

S18-terminal-sprite-render-trap · transcript-manifest（真实文件系统访问，R=读 W=写）
R E:\deepseek-harness\dsh-plugin-upgrade-skill\benchmark\results\artifacts\2026-10-21-mimo-v2.6-pro-s1-s24-r1\noskill\S18-terminal-sprite-render-trap\fixture\README.md
R E:\deepseek-harness\dsh-plugin-upgrade-skill\benchmark\results\artifacts\2026-10-21-mimo-v2.6-pro-s1-s24-r1\noskill\S18-terminal-sprite-render-trap\fixture\symptom-log.txt
R E:\deepseek-harness\dsh-plugin-upgrade-skill\benchmark\results\artifacts\2026-10-21-mimo-v2.6-pro-s1-s24-r1\noskill\S18-terminal-sprite-render-trap\fixture\frames-digest-report.txt
R E:\deepseek-harness\dsh-plugin-upgrade-skill\benchmark\results\artifacts\2026-10-21-mimo-v2.6-pro-s1-s24-r1\noskill\S18-terminal-sprite-render-trap\fixture\ci-hang-evidence.txt
R E:\deepseek-harness\dsh-plugin-upgrade-skill\benchmark\results\artifacts\2026-10-21-mimo-v2.6-pro-s1-s24-r1\noskill\S18-terminal-sprite-render-trap\fixture\renderer-excerpt.ts
W E:\deepseek-harness\dsh-plugin-upgrade-skill\benchmark\results\artifacts\2026-10-21-mimo-v2.6-pro-s1-s24-r1\noskill\S18-terminal-sprite-render-trap\agent-output\S18-terminal-sprite-render-trap\report.md
W E:\deepseek-harness\dsh-plugin-upgrade-skill\benchmark\results\artifacts\2026-10-21-mimo-v2.6-pro-s1-s24-r1\noskill\S18-terminal-sprite-render-trap\agent-output\report.md
R E:\deepseek-harness\dsh-plugin-upgrade-skill\benchmark\results\artifacts\2026-10-21-mimo-v2.6-pro-s1-s24-r1\noskill\S18-terminal-sprite-render-trap\agent-output\report.md
W E:\deepseek-harness\dsh-plugin-upgrade-skill\benchmark\results\artifacts\2026-10-21-mimo-v2.6-pro-s1-s24-r1\noskill\S18-terminal-sprite-render-trap\agent-output\tool-transcript.txt
W E:\deepseek-harness\dsh-plugin-upgrade-skill\benchmark\results\artifacts\2026-10-21-mimo-v2.6-pro-s1-s24-r1\noskill\S18-terminal-sprite-render-trap\agent-output\S18-terminal-sprite-render-trap\tool-transcript.txt
W E:\deepseek-harness\dsh-plugin-upgrade-skill\benchmark\results\artifacts\2026-10-21-mimo-v2.6-pro-s1-s24-r1\noskill\S18-terminal-sprite-render-trap\agent-output\transcript-manifest.txt
W E:\deepseek-harness\dsh-plugin-upgrade-skill\benchmark\results\artifacts\2026-10-21-mimo-v2.6-pro-s1-s24-r1\noskill\S18-terminal-sprite-render-trap\agent-output\S18-terminal-sprite-render-trap\transcript-manifest.txt


#### FILE: report.md

# S18 · The Terminal Sprite Render Trap — Root-Cause Report

**Evidence analyzed (read-only):** `fixture/renderer-excerpt.ts` (the shipped half-block renderer), `fixture/symptom-log.txt`, `fixture/frames-digest-report.txt`, `fixture/ci-hang-evidence.txt`. The `fixture/` directory was left byte-identical.

Renderer model recap: 25 rows x 40 cols of palette chars ('.' = transparent) are packed two-rows-per-cell into 13 terminal rows. Per cell: both pixels -> `fg(up)+bg(lo)` + '▀'; upper only -> `fg(up)` + '▀'; lower only -> `fg(lo)` + '▄'; neither -> ' '. Half-block glyphs paint their **filled** half with the *foreground* and their **empty** half with the *background* ('▀' U+2580: upper=fg, lower=bg; '▄' U+2584: lower=fg, upper=bg). That single fact is the root of symptom 1.

## 1. Phantom pixels — the background SGR that is never cleared

### Exact mechanism
- `bg(lo)` (SGR `48;2;R;G;B`) is emitted **only** in the both-pixels branch of the cell loop.
- The two half-filled branches emit **fg-only** sequences — `fg(up)` (SGR `38;2;…m`) for the '▀' cell, `fg(lo)` for the '▄' cell — and never touch the background.
- SGR is cumulative state: `38;2;…m` replaces only the *foreground*; the previously applied `48;2;…m` **persists** into the following cells. Which state persists across cells: **the background color SGR**.
- Because a half-block glyph paints its empty half with the background, every half-filled cell that inherits a background paints a **phantom pixel into its EMPTY half** (lower half of '▀' cells; upper half of '▄' cells).
- The emit-dedupe widens the blast radius: `current` caches the last emitted **sequence string**, not the terminal's real (fg, bg) state. On the transition `fg(a)+bg(x)` -> `fg(a)` the code emits `fg(a)` (the strings differ) and stores `current = 'fg(a)'`, but bg(x) is still active on the terminal. Every later cell whose `seq` string equals `'fg(a)'` emits **nothing**, so the stale background keeps painting across the whole run of cells.

### Which cells expose it
Any **half-filled cell that follows a both-filled cell** in the same row — immediately, or after a run of half-filled cells sharing the same fg string:
- upper-only '▀' cells show the phantom in their **lower** half;
- lower-only '▄' cells show the phantom in their **upper** half.

This maps 1:1 onto the symptom log. At the sprite's right edges the colored runs end in both-filled cells: the dark `D` outline cells, the sleep-Z symbols and the heart glyph all set fg+bg (or fg over a bg that a neighbor just set); the cells immediately to their right are half-filled edge pixels (Z strokes, heart edge, tail-tip half pixels), so their empty half shows the *previous cell's other pixel color* — the 1-cell-wide column of dim colored noise hugging the right edge that moves with the animation. Fully empty cells are safe: the `seq === ''` branch emits `RESET`, which is exactly why the noise stops after one column and why the artifacts are "strictly inside/at the edge of the sprite's cell area" (the frame data at those columns is '.', as the log notes).

### Precise escape fix
Make every emitted per-cell sequence **absolute**: always set fg *and* bg, using the default background escape `\x1b[49m` (SGR 49) whenever the corresponding half is transparent:

```ts
const bgDefault = '\x1b[49m'            // SGR 49 = default background
...
if (up !== undefined && lo !== undefined) {
  seq = fg(up) + bg(lo)                 // upper=fg, lower=bg
  ch = '▀'
} else if (up !== undefined) {
  seq = fg(up) + bgDefault              // FIX: lower half must be default, not inherited
  ch = '▀'
} else if (lo !== undefined) {
  seq = fg(lo) + bgDefault              // FIX: upper half must be default, not inherited
  ch = '▄'
} else {
  seq = RESET
  ch = ' '
}
if (seq !== current) { out += seq; current = seq }
```

`\x1b[49m` appended to (or prefixed before) the two half-filled sequences is the minimal precise fix; the belt-and-braces variant is to emit `RESET` before every state change (every `seq` is then absolute). Once each `seq` fully describes (fg, bg), the `current` string comparison becomes a faithful state comparison and the dedupe is safe again. Also worth hardening: `palette[upper[x]]` for an **unknown palette char silently yields `undefined` = transparent**, which hides data drift as dropped pixels — unknown chars should throw.

## 2. Ghost frames — trailing blanks are dropped twice, so nothing erases the old tail

### Mechanism (what survives a wide -> narrow switch)
Two independent drops of the erase work:

1. **The renderer drops each row's trailing blank cells.** The cell loop runs only over `upper.length` columns — a narrower frame's row literally writes fewer columns — and afterwards `out.replace(/[ ]+$/, '')` deletes every trailing space. Those trailing spaces were the only thing that would have overwritten the previous (wide) frame's tail glyphs: a blank cell clears an old pixel only if a space is actually written at that column, and here the space is trimmed away before the row is returned. (Even the loop itself stops at the shorter row's end, so surplus columns are never visited.)
2. **The text pipeline strips trailing whitespace.** The line-oriented text layer (terminal line writer / log capture / whitespace normalization on the way to the screen) trims trailing whitespace per line. Even if the renderer kept the spaces, they would be removed before display — trailing spaces can never act as erasers in this pipeline.

Net effect: switching from a WIDE pose (tail swung out, rows reaching further right) to a NARROWER pose, the new rows repaint only their own columns; the surplus right-hand columns receive neither cells nor spaces, so the wide frame's tail pixels remain at their old positions = **ghost pixels**. The narrow frame itself "renders fine" because every column it does cover is fully repainted.

### Two-part fix that guarantees a clean frame switch
1. **Erase with escapes, never with spaces — terminate every rendered row with `RESET` + `\x1b[K`** (CSI 0 K = erase from cursor to end of line):
   ```ts
   out = out.replace(/[ ]+$/, '')        // trailing spaces may still be trimmed…
   rows.push(out + RESET + '\x1b[K')     // …but the erase-to-EOL escape cannot be trimmed
   ```
   `\x1b[K` is not whitespace: neither the renderer's `/[ ]+$/` trim nor the text pipeline's trailing-whitespace stripping can remove it, and after `RESET` it erases with the default background.
2. **Fixed geometry + full-box redraw:** normalize every frame row to the sprite's full width (pad to 40 columns with '.' at load, reject wrong-length rows) and always iterate the full width; on every frame switch, home the cursor to the sprite origin (CUP) and redraw all 13 rows of the sprite box (or issue `\x1b[2J`). Never rely on writing spaces or on the previous frame's layout.

Part 2 guarantees every row is written with identical extent from a known origin; part 1 erases anything to the right of the new content regardless of whitespace handling. Together they make wide -> narrow switches clean by construction.

## 3. Frame data drift (tail2) and the digest gate

**What the digest report says:** per-frame sha256 of each frame's 25 rows vs the source art — every frame OK except **tail2 = MISMATCH**, 23 differing cells, all in the upper-right spout/tail-tip area: row 2 ported `D` at col 26 vs source col 27 (1-col left shift); row 3 extra `D` at col 25, `DBD` at cols 26-28 shifted left 1, extra `DD` at cols 36-37; rows 4-6 upper-right cluster shifted 1 column left throughout. That is exactly the misplaced 6-pixel tail-tip cluster in the symptom log.

**Why it drifted:** tail2 was **hand-copied (hand-ported) during conversion** — a transcription error (one-column shift plus stray pixels), not a renderer bug. It renders perfectly; it is simply the wrong art.

**Why the per-excerpt regression missed it:** the existing regression is excerpt-based — added later for a *different* frame and comparing only selected rows/excerpts. tail2's rows were never in its scope. Excerpt tests sample; they cannot prove whole-frame fidelity, and a hand-ported frame is invisible to a test that never touches it.

**The gate that prevents recurrence — per-frame full-artifact digest gate in CI:**
- For **every** frame, compute the digest over **all 25 rows** and compare against a checked-in golden manifest of source-art digests; any MISMATCH fails the build (tail2 fails on day one).
- The manifest is golden data reviewed like code; regeneration goes through the source art, never through hand editing.
- Eliminate hand-porting at the source: derive/export frame data from the source art programmatically (single source of truth); treat the digest manifest as the contract.
- Excerpt tests may remain as fast spot checks, but the digest gate — not excerpts — is the blocking gate.

## 4. The hang: a timer-pinned event loop after "finished"

### Mechanism
- The animation planner re-arms itself with `setTimeout` every tick **for as long as its component stays mounted**; each tick schedules the next, so there is always at least one live `Timeout` handle. The CI evidence confirms it at kill time: no running test, no pending assertion, only live handles of kind Timeout, one per tick, each re-arming the next.
- A pending `Timeout` is a live Node/libuv handle that **keeps the event loop alive**. The channel-ui hosts mount the header component (which owns the planner) and **finish without unmounting it** — so the timer chain never stops rescheduling.
- Result: all scene checks PASS, then the process sits idle and cannot exit ("finished but hanging"); the job is killed at the runner timeout (previously ~3 minutes; 19 minutes of idle observed once).
- Why the interactive terminal is unaffected: its process is a long-lived TTY app whose **TTY/stdin handles keep the loop alive by design**; the animation is supposed to run forever there, so the timer chain changes nothing observable.

**What reschedules forever:** the animation planner's per-tick `setTimeout` chain (one live Timeout per tick, re-armed while mounted). **Which hosts:** the CI/scene-check hosts of the channel-ui group that mount the header component and never unmount it before finishing.

### One-line fix
Unref the re-armed timer in the planner so the animation can never hold the process open:

```ts
const t = setTimeout(tick, interval); (t as any).unref?.()
```

(equivalently the one-line disposal `useEffect(() => () => clearTimeout(t), [])` / clear-on-unmount). `unref()` is the single line that guarantees the job exits regardless of host unmount discipline; the paired contract fix is that every host unmounts/disposes its mounted components before finishing.

## 5. Prevention

### Renderer contract checklist (ship it with any terminal sprite implementation)
1. **Absolute SGR per cell:** every cell's escape sets fg *and* bg (bg = `\x1b[49m` when that half is transparent). No color state is ever inherited across cells.
2. **Empty half = default:** a half-filled cell's empty half is explicitly default; never "leave as it was".
3. **State cache = full state:** any emit-dedupe keys on the complete (fg, bg) state, not on partial sequence strings.
4. **Erase with escapes:** rows end with `RESET` + `\x1b[K`; frame switches do a full-box redraw (CUP to sprite origin) or `\x1b[2J`. Never use spaces/blank cells as erasers — trailing whitespace is stripped by the renderer and by text pipelines.
5. **Fixed geometry:** one bounding box (25x40) for all frames; rows normalized and length-checked at load; the renderer iterates the full width; unknown palette chars throw instead of silently rendering transparent.
6. **Frame data integrity:** single source of truth for art (no hand-porting); per-frame sha256 digests of all rows in a checked-in golden manifest; CI digest gate over **every** frame; excerpt tests only as spot checks.
7. **Lifecycle:** animation timers are `unref()`'d and cleared on disposal; every host unmounts before finishing; headless runs must be able to exit immediately after the last assertion.
8. **Regression on decoded pixels:** goldens compare the decoded per-cell pixel grid (fg/bg per cell), not just characters — SGR-leak bugs hide behind identical text — plus full escape-output snapshots.
9. **Symptom taxonomy in tests:** include wide->narrow frame switches, half-filled cells adjacent to both-filled cells, and right-edge columns — the exact cases that produced phantoms and ghosts.

### Audit to run BEFORE flipping an animation feature default-on
1. **Dual-state render diff:** capture every frame and every ordered frame-pair switch with the feature ON and OFF; decode cells to pixel grids and diff; verify no SGR inheritance and no residue after wide->narrow switches.
2. **Data gate:** run the per-frame digest gate on all frames; block the flip on any MISMATCH (the tail2 class of drift).
3. **Exit audit (headless):** run the real CI hosts with the feature ON under a hard timeout and assert the process **exits by itself** within N seconds after the last check; compare wall-clock against the baseline (~3 min) and fail on growth.
4. **Handle inventory:** at end of the headless run, assert no Timeout/Interval handles owned by the feature remain (process._getActiveHandles() / why-is-node-running style check); grep every `setTimeout`/`setInterval`/`requestAnimationFrame` for a matching `unref`/`clearTimeout`, and every mount for a matching unmount.
5. **Whitespace-pipeline check:** run the render path through the real text pipeline (which trims trailing whitespace) and confirm frames are still clean — proving erasure is escape-based.
6. **Host lifecycle matrix:** test all hosts (interactive TTY, CI scene-check, headless snapshot) for mount/unmount behavior; flip only when every host either unmounts or its timers are unref'd.
7. **Rollout discipline:** stage the flip (canary) with explicit revert triggers — any job exceeding baseline runtime, any digest mismatch, any phantom/ghost report — and keep the feature-off path regression-tested and unchanged.

## run-stats

- toolcalls: 15 dispatches at harness level — 11 executed `run_code` programs (26 inner tool calls: 1 glob, 1 working_directory, 8 read, 14 write, 2 send_message) + 4 direct `read` dispatches rejected by the harness (not executed). This line is self-counting; no tool call follows it.
- token usage: n/a (not visible in this session)
- completion time: 2026-10-21T07:14:10.527Z (report finalized; Wed Oct 21 2026 15:14:10 GMT+0800 (中国标准时间))

#### FILE: tool-transcript.txt

S18-terminal-sprite-render-trap · tool-transcript（按发生顺序，全部工具调用）
1. run_code  tools.glob pattern=**/* path=fixture（列出 fixture 全部文件）
2. run_code  tools.working_directory 无参数（读取当前工作目录，非文件系统访问）
3. read  file_path=fixture\README.md（无效调用：direct tool 不可直接调用，被拒绝、未执行）
4. read  file_path=fixture\symptom-log.txt（无效调用：同上，未执行）
5. read  file_path=fixture\frames-digest-report.txt（无效调用：同上，未执行）
6. read  file_path=fixture\ci-hang-evidence.txt（无效调用：同上，未执行）
7. run_code  tools.read ×4：fixture\README.md、fixture\symptom-log.txt、fixture\frames-digest-report.txt、fixture\ci-hang-evidence.txt（并行读取证据文本）
8. run_code  tools.read fixture\renderer-excerpt.ts（读取 46 行渲染器源码摘录）
9. run_code  tools.write ×2：agent-output\S18-terminal-sprite-render-trap\report.md 与 agent-output\report.md（写入 127 行 / 14420 字节根因报告，含 run-stats 与完成时间戳）
10. run_code  tools.read agent-output\report.md（回读校验：totalLines=127，非空）
11. run_code  tools.send_message agent_id=session-5d3ebe0e-127d-4dc4-a3b9-cb2199b04f8e（向父代理上报结果摘要，messageId=09867291-807a-4cc0-b861-200f290f5036）
12. run_code  tools.write ×4：agent-output\tool-transcript.txt、agent-output\S18-terminal-sprite-render-trap\tool-transcript.txt、agent-output\transcript-manifest.txt、agent-output\S18-terminal-sprite-render-trap\transcript-manifest.txt（写入本清单与文件系统访问清单及镜像）13. run_code  tools.read agent-output\report.md + tools.write ×2（report.md 校正 run-stats 计数）+ tools.write ×2（tool-transcript.txt 追加本条）—— 同一程序内完成14. run_code  tools.read agent-output\report.md + tools.write ×2（report.md 再次校正 run-stats 为自计数终值）+ tools.write ×2（tool-transcript.txt 追加本条）—— 本次之后不再有任何工具调用


#### FILE: transcript-manifest.txt

S18-terminal-sprite-render-trap · transcript-manifest（真实文件系统访问，R=读 W=写）
R E:\deepseek-harness\dsh-plugin-upgrade-skill\benchmark\results\artifacts\2026-10-21-mimo-v2.6-pro-s1-s24-r1\noskill\S18-terminal-sprite-render-trap\fixture\README.md
R E:\deepseek-harness\dsh-plugin-upgrade-skill\benchmark\results\artifacts\2026-10-21-mimo-v2.6-pro-s1-s24-r1\noskill\S18-terminal-sprite-render-trap\fixture\symptom-log.txt
R E:\deepseek-harness\dsh-plugin-upgrade-skill\benchmark\results\artifacts\2026-10-21-mimo-v2.6-pro-s1-s24-r1\noskill\S18-terminal-sprite-render-trap\fixture\frames-digest-report.txt
R E:\deepseek-harness\dsh-plugin-upgrade-skill\benchmark\results\artifacts\2026-10-21-mimo-v2.6-pro-s1-s24-r1\noskill\S18-terminal-sprite-render-trap\fixture\ci-hang-evidence.txt
R E:\deepseek-harness\dsh-plugin-upgrade-skill\benchmark\results\artifacts\2026-10-21-mimo-v2.6-pro-s1-s24-r1\noskill\S18-terminal-sprite-render-trap\fixture\renderer-excerpt.ts
W E:\deepseek-harness\dsh-plugin-upgrade-skill\benchmark\results\artifacts\2026-10-21-mimo-v2.6-pro-s1-s24-r1\noskill\S18-terminal-sprite-render-trap\agent-output\S18-terminal-sprite-render-trap\report.md
W E:\deepseek-harness\dsh-plugin-upgrade-skill\benchmark\results\artifacts\2026-10-21-mimo-v2.6-pro-s1-s24-r1\noskill\S18-terminal-sprite-render-trap\agent-output\report.md
R E:\deepseek-harness\dsh-plugin-upgrade-skill\benchmark\results\artifacts\2026-10-21-mimo-v2.6-pro-s1-s24-r1\noskill\S18-terminal-sprite-render-trap\agent-output\report.md
W E:\deepseek-harness\dsh-plugin-upgrade-skill\benchmark\results\artifacts\2026-10-21-mimo-v2.6-pro-s1-s24-r1\noskill\S18-terminal-sprite-render-trap\agent-output\tool-transcript.txt
W E:\deepseek-harness\dsh-plugin-upgrade-skill\benchmark\results\artifacts\2026-10-21-mimo-v2.6-pro-s1-s24-r1\noskill\S18-terminal-sprite-render-trap\agent-output\S18-terminal-sprite-render-trap\tool-transcript.txt
W E:\deepseek-harness\dsh-plugin-upgrade-skill\benchmark\results\artifacts\2026-10-21-mimo-v2.6-pro-s1-s24-r1\noskill\S18-terminal-sprite-render-trap\agent-output\transcript-manifest.txt
W E:\deepseek-harness\dsh-plugin-upgrade-skill\benchmark\results\artifacts\2026-10-21-mimo-v2.6-pro-s1-s24-r1\noskill\S18-terminal-sprite-render-trap\agent-output\S18-terminal-sprite-render-trap\transcript-manifest.txt


## Required output (JSON only)
{"decisions":[{"id":"<criterion-id>","verdict":"pass|partial|fail|missing","reason":"short"}],"caps":[{"id":"<cap-id>","triggered":false,"reason":"short"}]}
Every criterion and cap exactly once. pass=full points, partial=half, fail/missing=0; a triggered cap caps the total.