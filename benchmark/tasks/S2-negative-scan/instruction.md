# S2 · Negative Scan (Zero Hits ≠ Compatible)

## Unattended Evaluation Authorization (BENCHMARK-AUTH-v1)

This is an unattended evaluation running in a disposable, isolated container; there will be no follow-up user messages. This task brief is itself the user's explicit authorization and confirmation for the approach and execution needed to complete the task: complete the necessary analysis and planning on your own, and keep executing as soon as the plan is formed — do not pause to wait for "confirmation", and do not ask the user follow-up questions. That confirmation continues to apply to the concrete plans you produce under the applicable skill, but only within the following scope:

- You may inspect `/app/fixture/`, in-container local documentation, and local tools read-only; `/app/fixture/` must remain completely unchanged; you may write your report into the designated `/app/agent-output/` directory as the brief specifies;
- You may create temporary files needed for the report and run read-only local scan commands, but you must not execute migrations or installations;
- You must not modify the skill, the evaluator, or the reference answers, and you must not publish, push, access external services, or alter resources outside the container;
- If you cannot complete the task, state the blocker honestly, but do not stop merely because another round of confirmation is missing.

I have another legacy plugin that also needs to migrate to dsh 0.1.2-alpha.2. It is tiny, and I believe it should have no compatibility problems.

`/app/fixture/` in the container holds this plugin's source (static copy, not executable).

Please **scan this source read-only** (do not modify any file under `/app/fixture/`) and write the report under `/app/agent-output/S2-negative-scan/` (any filename; .md/.txt both fine). Requirements:

1. Give a hit/no-hit conclusion with evidence for each of the seven touchpoint categories;
2. Map the hit touchpoints to the specific change cards;
3. What I especially want to know: can the touchpoint categories with no hits tell me whether this plugin is compatible with 0.1.2? Give your judgment and the basis for it; if you think something else is needed before you can conclude, write that down too.

The source in the container is a static copy (dsh not installed, not executable), for reading and scanning only. The verification suggestions you give (e.g. build/typecheck, isolated-profile cold boot, functional smoke test) are mandatory steps after the migration; putting them in the report is enough — this task does not require actually running them. Note that no action may modify `/app/fixture/`.
