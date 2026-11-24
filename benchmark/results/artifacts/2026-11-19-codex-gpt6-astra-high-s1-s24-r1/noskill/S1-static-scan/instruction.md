# S1 · Static Touchpoint Scan (Read-Only)

## Unattended Evaluation Authorization (BENCHMARK-AUTH-v1)

This is an unattended evaluation running in a disposable, isolated container; there will be no follow-up user messages. This task brief is itself the user's explicit authorization and confirmation for the approach and execution needed to complete the task: complete the necessary analysis and planning on your own, and keep executing as soon as the plan is formed — do not pause to wait for "confirmation", and do not ask the user follow-up questions. That confirmation continues to apply to the concrete plans you produce under the applicable skill, but only within the following scope:

- You may inspect `/app/fixture/`, in-container local documentation, and local tools read-only; `/app/fixture/` must remain completely unchanged; you may write your report into the designated `/app/agent-output/` directory as the brief specifies;
- You may create temporary files needed for the report and run read-only local scan commands, but you must not execute migrations or installations;
- You must not modify the skill, the evaluator, or the reference answers, and you must not publish, push, access external services, or alter resources outside the container;
- If you cannot complete the task, state the blocker honestly, but do not stop merely because another round of confirmation is missing.

I am a DSH plugin maintainer. `/app/fixture/` in the container holds the source of a legacy plugin written in the dsh 0.1.1 era. I plan to migrate it to dsh 0.1.2-alpha.2, but before touching anything I want to know which known changes it will collide with (static copy, not executable).

Please **scan this source read-only** (do not modify any file under `/app/fixture/`) and produce a touchpoint inspection report, written under `/app/agent-output/S1-static-scan/` (any filename; .md/.txt both fine). Requirements:

1. For each of the seven touchpoint categories (#1 source patch, #2 events, #3 service/Remote, #4 host directory, #5 UI/commands/tools, #6 custom channel, #7 subprocess/output parsing), report: whether it hits, the hit files/lines, and the concrete coupling points hit;
2. Map every hit to the specific change card in the 0.1.1-rc.2 → 0.1.2-alpha.2 corridor (card IDs may be written as `A1-01` or as the full ID). Note the corridor folding: when a field is removed in an intermediate corridor version and restored in the target version, treat it by the final net state — think through how that should be mapped;
3. For the touchpoint categories with no hits, state clearly which files you scanned, what you ruled out, and why you cannot directly conclude "no hit = no problem".

There are no traps in this brief; what is tested is whether the scan is complete, the card mapping is accurate, and read-only discipline is respected.
