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
#### FILE: S18-terminal-sprite-render-trap/report.md

# S18: terminal sprite diagnosis and rollout contract

Completed: read-only diagnosis of all five supplied fixture files. Applied plugin-upgrade Mode A, with its pre-flight and troubleshooting references. BENCHMARK-AUTH-v1 authorizes this report; no fixture files, dependencies, configuration, or application source were changed. The plan was to trace ANSI state, frame overwrite behavior, source-art identity, and process lifetime independently, then specify prevention gates.

## 1. Phantom pixels: background state leaks into the empty half

In renderer-excerpt.ts, the two-filled-halves branch emits `fg(up) + bg(lo)` and `▀`. Thus it installs both SGR foreground (38;2) and background (48;2). SGR attributes persist until explicitly changed; changing foreground does not clear background. Both one-filled-half branches emit only a foreground sequence:

- Upper only: `fg(up)` with `▀`. Its lower half uses the previously installed background instead of the terminal default.
- Lower only: `fg(lo)` with `▄`. Here foreground paints the lower pixel, while the empty upper half uses the stale background.

The `current` variable caches the last emitted sequence string, not a complete terminal state. Switching from a two-color sequence to a foreground-only sequence does not remove the old background, even though the strings differ and the new sequence is emitted. Repeating the foreground-only sequence can preserve that stale background across additional cells. The colored-to-fully-empty branch does emit RESET, so completely empty cells after that reset are not the same failure. A row-end RESET arrives too late to repair pixels already painted.

At right contours, adjacent sprite rows cease to overlap: a two-filled cell is followed by an upper-only or lower-only edge cell. This exposes the background leak at the outline, sleep-Z symbols, and heart. One transparent source pixel in a half-filled cell is sufficient; a pair of fully transparent pixels would instead take the reset-and-space branch. This distinction explains why the artifacts track contours rather than requiring extra palette pixels in the frame data.

Precise fix in BOTH half-filled branches:

```ts
const DEFAULT_BG = '\x1b[49m'
// upper-only
seq = fg(up) + DEFAULT_BG
ch = '▀'
// lower-only
seq = fg(lo) + DEFAULT_BG
ch = '▄'
```

SGR 49 restores the default background. An alternative is RESET followed by the intended foreground (`RESET + fg(up)` or `RESET + fg(lo)`); RESET after the foreground would incorrectly remove the intended color. Keep full-cell fg/bg assignment, empty-cell reset, and row-boundary reset. Establish a known default state at row entry as well, so an all-empty leading span cannot inherit unrelated host styling. Terminal “transparent” here means the default terminal background, not true alpha compositing.

## 2. Ghost frames: omitted cells are not erased cells

The renderer creates spaces for transparent pairs, then `out.replace(/[ ]+$/, '')` deletes each row's trailing ASCII spaces. Narrow content therefore stops repainting the surplus columns previously occupied by a wide pose. SGR RESET changes drawing attributes only; it neither clears the line nor erases old characters. Cursor repositioning likewise does not erase them.

The surrounding text/layout pipeline can also trim trailing whitespace, defeating a renderer-only attempt to append plain spaces. Its implementation is not included in this evidence pack, so its exact function/library cannot be named or claimed inspected. The necessary integration contract is to account for that trimming and prove what reaches the terminal, rather than infer erasure from the length of the renderer's string.

Two-part fix:

1. Remove the explicit row trim and preserve the full 40-column logical canvas for every one of the 13 terminal rows, including wholly blank rows and the final odd-height row (source row 25 has a transparent missing lower partner). Blank pairs must overwrite with default-background spaces, not leave cells unwritten.
2. Make erasure survive the text pipeline: preserve fixed-width padding all the way through its whitespace normalization, OR perform explicit terminal erasure at the final output layer after normalization. For an owned line tail, append `\x1b[0m\x1b[K` (CSI 0 K, erase from cursor through end of line) to the actually emitted row. Reset before erase so erase uses the default background. Do not strip this control sequence. Clearing the entire owned row before painting is another valid integration. If neighboring UI occupies the rest of the line, do not erase it: position at the sprite origin, reset, erase exactly its 40 cells with `\x1b[40X` (ECH), then paint the row, or explicitly overwrite that bounded rectangle after trimming.

The guarantee comes from repainting/clearing the entire old footprint, with deliberate cursor placement for each row. Keeping spaces alone is insufficient if the next layer drops them; adding RESET alone is insufficient because RESET is not erase. Verify the final screen cells after wide-to-narrow and visible-to-blank switches through the real text pipeline, not only a string snapshot before it.

## 3. Frame drift: source-art integrity is separate from rendering

frames-digest-report.txt reports all listed frame digests matching except `tail2`: standard, blink, fin1/2, spout1–6, tail1/3/4, heart1–3, and sleep1–5 are OK. The hand-copied `tail2` has 23 differing cells in the upper-right spout/tail-tip area:

- Row 2: D at column 26 instead of 27.
- Row 3: extra D at 25; DBD at 26–28 shifted left one; extra DD at 36–37.
- Rows 4–6: upper-right cluster shifted one column left.

The symptom's misplaced cluster and the digest's 23 changed cells describe different measures; a shifted cluster changes both old and new occupied locations. This is actual frame data corruption, unlike the phantom pixels caused by SGR state.

The later regression covered only an excerpt of another frame, so it could not detect this drift. Gate every named frame against a pinned source-art baseline using SHA-256 of all 25 rows, with one explicit serialization convention (palette bytes, row separators, terminal newline policy). Require 25 rows, 40 columns each, allowed palette characters, and exact frame-name coverage: missing or unexpected frames must fail too. Generate/port from the canonical source, restore tail2 from it, and review intentional art changes before updating expected digests. Never regenerate the expected hashes blindly from the ported data. Retain useful targeted regressions, but add complete-frame digest coverage and cell-diff diagnostics. Raw source art and literal hash values are not supplied here; no independent recomputation or repair is claimed.

## 4. Finished but hanging: a referenced timeout chain

ci-hang-evidence.txt says all channel-ui scene checks PASS and no assertion or test remains pending, yet live Timeout handles keep the process alive. The mounted sprite animation planner recursively re-arms `setTimeout` as long as its component remains mounted. These channel-ui scene/test hosts mount the header and finish without unmounting it, so cleanup that depends solely on unmount never runs. Headless or one-shot consumers with the same mount-without-unmount lifecycle are likewise at risk; the fixture does not name additional specific hosts.

Each new Node timeout is referenced by default. The chain need not accumulate many simultaneous handles: maintaining a referenced next timeout is enough to prevent natural event-loop exit forever. The default-on flip activated that previously dormant chain. The runner eventually kills the job; one local run idled for 19 minutes. Increasing a CI timeout would not fix this.

One-line fix immediately after EVERY scheduling/re-arming assignment:

```ts
timer.unref()
```

Equivalently, the Node creation expression can be `timer = setTimeout(tick, delay).unref()`. Put it in the common scheduling path, not just on the initial timer. This lets optional decorative animation stop being the reason the process remains alive; it does not cancel ticks while other work is active. Interactive terminal usage remains animated because TTY/stdin handles already keep its process alive. Keep clearTimeout/unmount/cancellation cleanup too. If shared with browsers, use a runtime-safe optional unref guard for browser numeric timer IDs; the identified Node fix is unref, not forced process.exit or timer polling.

## 5. Renderer contract and default-on audit

Ship these contracts with the implementation:

- Every frame is 25 by 40 validated palette cells; every render owns a stable 40 by 13 terminal-cell rectangle. Missing lower row is transparent. Frame hashes cover all artwork.
- Both-filled, upper-only, lower-only, and empty cell cases explicitly establish the required foreground/background. Exercise transitions from two-filled to each half-filled state, same-foreground/different-background sequences, blank gaps, leading blanks, and row boundaries. Default transparency must survive both light and dark terminal themes.
- Foreground-only glyphs always reset background with SGR 49; row entry/exit has known SGR state and cannot leak styling to neighboring UI.
- Every frame switch clears/repaints the old footprint, including narrower and entirely blank rows. Check final terminal cells through actual text wrapping/trimming and output-diff layers. Cover wide-to-narrow and reverse transitions, blank frames, clipping/resizing, and the odd final pixel row. Protect adjacent UI when erasing.
- Half-block glyph display width is one terminal cell; ANSI bytes do not count toward visible width. Validate the supported terminal/font/color modes and a no-color/non-TTY path as applicable.
- Decorative timers never own process lifetime. Every re-arm is unref'd in Node, and disable/unmount/cancellation cancels owned resources without subsequent re-arming.

Before changing the default, enumerate all component mounts and callers, including interactive TTY, channel-ui scenes, snapshot/render tools, tests, non-TTY/headless and one-shot commands. Record whether each unmounts and who owns each timer/listener/handle. Audit all recurring effects for infinite rescheduling and referenced handles, then run the enabled-default configuration in fresh child processes: require natural bounded exit, correct exit code/stdout/stderr, and no forced process.exit workaround. Include the exact mount-without-unmount case from this incident; separately exercise normal unmount and cancellation. Interactive visual success cannot establish one-shot process safety.

Require all-frame source digests, half-cell SGR transition checks, and full-pipeline frame-switch screen checks before rollout. Compare feature-off/on behavior, idle CPU/tick rates, output integrity, and natural shutdown. Flip the default only once these gates pass; keep a reversible feature flag and monitor CI process completion as well as assertion pass counts.

## Scope, validation, and remaining work

Pre-existing baseline: not collected (Mode A; no mechanical suite executed). Validation completed: static branch-by-branch analysis of the shipped renderer and reconciliation with the supplied symptom, digest, and CI evidence. UI/output and lifecycle are the applicable pre-flight concerns; no DSH version corridor or migration card can be assigned from this pack.

Skipped: installations, migrations, repository-wide inspection, fixture execution, external lookups, and source edits, as required by the task. No package/version/source-install identity or Git rollback baseline is invented from absent metadata.

Pending/residual risk: proposed fixes have not been implemented or runtime-tested. The surrounding text pipeline, animation scheduler source, canonical frame data, and actual terminal hosts are not supplied. Those omissions limit source-level integration details but do not block this evidence-based diagnosis. The full-pipeline and process-exit checks above are acceptance criteria for a later implementation, not claimed results.

Rollback: fixture remains unchanged; only this authorized report was written. No application rollback is necessary. For a later rollout, retain the previous default-off flag and restore it if completion/visual gates regress while correcting the underlying renderer and scheduler.


## Required output (JSON only)
{"decisions":[{"id":"<criterion-id>","verdict":"pass|partial|fail|missing","reason":"short"}],"caps":[{"id":"<cap-id>","triggered":false,"reason":"short"}]}
Every criterion and cap exactly once. pass=full points, partial=half, fail/missing=0; a triggered cap caps the total.