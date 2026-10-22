# Resume guide · 2026-10-21-minimax-m3.1-flash-s1-s24-r1

Self-contained continuation notes for this 48-cell S-series run.

## Where things are

| Thing | Path |
|---|---|
| Artifact root | `E:\deepseek-harness\dsh-plugin-upgrade-skill\benchmark\results\artifacts\2026-10-21-minimax-m3.1-flash-s1-s24-r1` |
| Cell layout | `<root>/<arm>/<task>/` with `fixture/`, `agent-output/<task>/`, `instruction.md` |
| Skill arm extra | `<root>/skill/<task>/skills/plugin-upgrade/` (inside the cell dir, so it is in-whitelist) |
| Run manifest | `<root>/run-manifest.json` |
| Ledger | `<root>/cell-ledger.md` (table: task, arm, status, start, end, duration, toolcalls, tokens) |
| Resume state | `<root>/run-state.json` (per-cell status) |
| Per-cell record | `<root>/<arm>/<task>/cell-meta.json` + `audit.json` |
| Harness tools | `<root>/_tools/` (common, stage, prompt, audit, finalize, state, launcher, monitor, plan) |
| Session logs | `C:\Users\lhh\.dsh\sessions\--E-deepseek-harness-test-lhh010--/<subagentId>/session.v4.jsonl.zstd` |
| Token projection | `C:\Users\lhh\.dsh\storages\session_projcache\sessions\<subagentId>.json` → `record.rows.tokenUsage.val.totals` |

## Mechanics that must not be re-derived

1. **Session logs are multi-frame zstd.** `zstdDecompressSync(file)` returns only the FIRST frame.
   `_tools/audit.mjs` has `decodeSessionFile()`, which splits on the frame magic
   `28 B5 2F FD` and decompresses each frame. Use it.
2. **Tool invocations live in two event types:** `tool/ptc-dispatch` (harness-dispatched) and
   `tool/call` (model-called directly). The audit unions both — see `collectInvocations()`.
3. **A cell is done when its session log contains a `turn/end` event.** The report file may
   appear before that. The subagent notifies the parent on completion.
4. **Token usage** comes from the projection cache, not the log.
5. **Cell start** = the `session` event's `createdAt`; **cell end** = the `turn/end` event's `time`.

## Status

- S1 skill: **DONE** (ok). Ledger row written.
- S1 noskill: **TIMEOUT** — stopped at 55 min against the 30 min cap, no report written,
  one `invalid:roaming` violation. Recorded in the ledger and `cell-meta.json`.
  **Do not re-run it in this round.**
- S2 .. S24, both arms: 46 cells still to run.

## Hard-won lessons that must carry forward

1. **The noskill arm has no card catalog.** S1 requires mapping hits to change cards of the
   0.1.1-rc.2 -> 0.1.2-alpha.2 corridor. Without the skill, that catalog exists nowhere in
   the whitelist. The S1 noskill solver therefore tried to reconstruct it from the live host
   runtime (`dsh --dump-config-schema`, `cordis_inspect_query`) — which is BOTH out of
   whitelist AND answers the wrong question (the host runs 0.2.1-rc.1, not the target version).
   **Mitigation for later cells:** the boundary segment already forbids this, and the audit now
   catches it. Add a hard time cap and interrupt on the cap.
2. **A timeout cell is preserved, not retried.** The handoff forbids re-running a solver; a timed-out
   cell is reported as-is.
3. **Budget the solver.** S1 noskill ran 72 steps / 273 dispatches. The skill arm did the same task
   in 65 dispatches because the card catalog was already in the whitelist. The noskill arm will
   generally be slower and may legitimately fail on card-mapping tasks — that failure is the
   measurement, not a harness bug. Do not let it run unbounded.
4. **Watch the degenerate-repeat signature — this actually happened.** In S1 noskill the solver
   re-read the same 6 fixture files in a fixed 6-step cycle, 25 times: 150 redundant reads out of
   158 read dispatches, 11 unique operands, one operand read 25x. The cycle produced no new
   information and burned roughly half the run.

   **Loop detection rule (use this on every cell):** count read-dispatch operands by exact path.
   Flag `invalid:loop` when either
   - one operand is read more than 3 times, or
   - a fixed block of N consecutive read operands recurs 3+ times with no new information.
   A loop cell also gets interrupted rather than left to burn the full 30-minute cap.

## Per-cell procedure

```js
// 1. stage + build the prompt
const { prepareCell } = await import('<root>/_tools/launcher.mjs')
const { dir, prompt } = prepareCell(task, arm)

// 2. spawn the solver (fresh instance, single attempt)
const r = await tools.subagent({ description: `${task} ${arm} solver`, cwd: dir, prompt })
// write r.subagentId to <dir>/subagent-id.txt

// 3. when the subagent reports completion, finalize
const rec = finalizeCell({ task, arm, sessionIds: [r.subagentId], startedAt, endedAt, subagentId })
appendLedger(rec)
```

## Prompt shape (already implemented in _tools/prompt.mjs)

Three segments, in order:
1. **Task segment** — the full `instruction.md` verbatim + the container-path → cell-path mapping
   (`/app/fixture` → `<cell>/fixture`, `/app/agent-output` → `<cell>/agent-output`) and the
   exact report directory.
2. **Boundary segment** — the read whitelist (cell dir only), the hard no-write-outside rules
   (including TEMP), the no-modify-fixture rule, the no-full-text-paste rule (256k budget).
3. **Arm clause** — noskill: "there is no skills/ directory; do not read any skills/ path".
   skill: "read skills/plugin-upgrade/SKILL.md first; consult references/ as needed".

Plus a delivery clause: unattended, no questions, finish with exactly `DONE`.

## Audit semantics (from the handoff, corrected)

Whitelist = the cell directory, for BOTH arms. Not violations:
regex character classes in a grep/rg pattern; path literals quoted as arguments;
glob patterns that happen to look like absolute paths; probes with no filesystem access
(`node --version`, `--help`, `pwd`). Only a real read/write outside the whitelist
is `invalid:roaming`.

See `_tools/audit.mjs` for the implementation and its mention/violation split.

## Concurrency guidance

The user's standing instruction: run more cells in parallel than the handoff's
"concurrency 2" suggests, and do NOT poll subagents — end the turn and let a finished
subagent re-activate the parent session. Suggested fan-out: 4 cells in flight
(2 tasks × 2 arms), which keeps the noskill→skill order inside each task.
