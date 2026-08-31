# H6 · Remote Error-Flow Trap (Read-Only Report)

## Unattended Evaluation Authorization (BENCHMARK-AUTH-v1)

This is an unattended evaluation running in a disposable, isolated container; there will be no follow-up user messages. This task brief is itself the user's explicit authorization and confirmation for the approach and execution needed to complete the task: complete the necessary analysis and planning on your own, and keep executing as soon as the plan is formed — do not pause to wait for "confirmation", and do not ask the user follow-up questions. That confirmation continues to apply to the concrete plans you produce under the applicable skill, but only within the following scope:

- You may inspect `/app/fixture/` and local in-container tools read-only; `/app/fixture/` must remain completely unchanged; you may write your report into the designated `/app/agent-output/` directory as the brief specifies;
- This is a **closed-book** brief: there are no reference materials outside the fixture — do not search `/tmp`, system directories, or the network for them; mark anything you cannot verify as "unconfirmed" instead of guessing;
- You may create temporary files needed for the report and run read-only local commands, but you must not build or create any reproduction environment, install dependencies, or migrate anything;
- You must not modify the skill, the evaluator, or the reference answers, and you must not publish, push, access external services, or alter resources outside the container;
- If you cannot complete the task, state the blocker honestly, but do not stop merely because another round of confirmation is missing.

I am a DSH plugin maintainer. `/app/fixture/` in the container holds a plugin fragment already migrated to dsh 0.1.2-alpha.2 but still using 0.1.1 error handling. A community comment in the source says "the error codes still use the old names — do not change them, changing them is guaranteed to break".

Please **analyze it read-only** (do not modify any file under `/app/fixture/`) and write a migration report, written under `/app/agent-output/H6-remote-error-trap/` (any filename). Requirements:

1. Explain how this error flow should be changed: how to handle each branch (cancel / internal / unknown codes / unexpected exceptions) and which error codes the verification must cover;
2. That comment may be a trap — decide by evidence, not by the comment;
3. Do not build or create any reproduction environment, and do not modify anything outside the fixture.
