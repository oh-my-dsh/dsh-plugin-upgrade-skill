# S6 · Corridor Net-State Judgment (Read-Only Report)

## Unattended Evaluation Authorization (BENCHMARK-AUTH-v1)

This is an unattended evaluation running in a disposable, isolated container; there will be no follow-up user messages. This task brief is itself the user's explicit authorization and confirmation for the approach and execution needed to complete the task: complete the necessary analysis and planning on your own, and keep executing as soon as the plan is formed — do not pause to wait for "confirmation", and do not ask the user follow-up questions. That confirmation continues to apply to the concrete plans you produce under the applicable skill, but only within the following scope:

- You may inspect `/app/fixture/` and local in-container tools read-only; `/app/fixture/` must remain completely unchanged; you may write your report into the designated `/app/agent-output/` directory as the brief specifies;
- This is a **closed-book** brief: there are no reference materials outside the fixture — do not search `/tmp`, system directories, or the network for them; mark anything you cannot verify as "unconfirmed" instead of guessing;
- You may create temporary files needed for the report and run read-only local commands, but you must not build or create any reproduction environment, install dependencies, or migrate anything;
- You must not modify the skill, the evaluator, or the reference answers, and you must not publish, push, access external services, or alter resources outside the container;
- If you cannot complete the task, state the blocker honestly, but do not stop merely because another round of confirmation is missing.

I am a DSH plugin maintainer. The plugin in `/app/fixture/` carries a piece of "defense code" written for alpha.1: alpha.1 temporarily removed `SessionEvent.ignorable`, so before writing a third-party persistent event the code actively deletes the marker, and the comment claims "without deleting the marker readers will reject it", and that this must be kept when migrating to alpha.2. The target host is **alpha.2**.

Please **analyze it read-only** (do not modify any file under `/app/fixture/`) and write a migration report, written under `/app/agent-output/S6-corridor-net-state/` (any filename). Requirements:

1. State the fate of this defense code (delete or keep) with the reasoning — account for the full history of this semantics across the version corridor;
2. State the correct producer semantics, and what an ordinary plugin going through `Session.append(...)` should do (hint: the public API surface may not even have that parameter);
3. Decide by evidence, not by the comment; mark anything you cannot verify as "unconfirmed".
