# S6 · Corridor Net-State Judgment (Read-Only Report)

## Unattended Evaluation Authorization (BENCHMARK-AUTH-v1)

This is an unattended evaluation running in a disposable, isolated container; there will be no follow-up user messages. This task brief is itself the user's explicit authorization and confirmation for the approach and execution needed to complete the task: complete the necessary analysis and planning on your own, and keep executing as soon as the plan is formed — do not pause to wait for "confirmation", and do not ask the user follow-up questions. That confirmation continues to apply to the concrete plans you produce under the applicable skill, but only within the following scope:

- You may inspect `E:\deepseek-harness\dsh-plugin-upgrade-skill\benchmark\results\artifacts\2026-10-16-step5-preview-s1-s24-r3\skill\S6-corridor-net-state\fixture\` and local in-container tools read-only; `E:\deepseek-harness\dsh-plugin-upgrade-skill\benchmark\results\artifacts\2026-10-16-step5-preview-s1-s24-r3\skill\S6-corridor-net-state\fixture\` must remain completely unchanged; you may write your report into the designated `E:\deepseek-harness\dsh-plugin-upgrade-skill\benchmark\results\artifacts\2026-10-16-step5-preview-s1-s24-r3\skill\S6-corridor-net-state\agent-output\` directory as the brief specifies;
- This brief is self-contained: do not search `/tmp`, system directories, or the network for reference materials; rely on the fixture and on any materials mounted by the evaluation harness (for example, an agent skill when one is provided); mark anything you cannot verify as "unconfirmed" instead of guessing;
- You may create temporary files needed for the report and run read-only local commands, but you must not build or create any reproduction environment, install dependencies, or migrate anything;
- You must not modify the skill, the evaluator, or the reference answers, and you must not publish, push, access external services, or alter resources outside the container;
- If you cannot complete the task, state the blocker honestly, but do not stop merely because another round of confirmation is missing.

I am a DSH plugin maintainer. The plugin in `E:\deepseek-harness\dsh-plugin-upgrade-skill\benchmark\results\artifacts\2026-10-16-step5-preview-s1-s24-r3\skill\S6-corridor-net-state\fixture\` carries a piece of "defense code" written for alpha.1: alpha.1 temporarily removed `SessionEvent.ignorable`, so before writing a third-party persistent event the code actively deletes the marker, and the comment claims "without deleting the marker readers will reject it", and that this must be kept when migrating to alpha.2. The target host is **alpha.2**.

Please **analyze it read-only** (do not modify any file under `E:\deepseek-harness\dsh-plugin-upgrade-skill\benchmark\results\artifacts\2026-10-16-step5-preview-s1-s24-r3\skill\S6-corridor-net-state\fixture\`) and write a migration report, written under `E:\deepseek-harness\dsh-plugin-upgrade-skill\benchmark\results\artifacts\2026-10-16-step5-preview-s1-s24-r3\skill\S6-corridor-net-state\agent-output\S6-corridor-net-state\` (any filename). Requirements:

1. State the fate of this defense code (delete or keep) with the reasoning — account for the full history of this semantics across the version corridor;
2. State the correct producer semantics, and what an ordinary plugin going through `Session.append(...)` should do (hint: the public API surface may not even have that parameter);
3. Decide by evidence, not by the comment; mark anything you cannot verify as "unconfirmed".


WORKSPACE BOUNDARY (hard rule — you are running inside a benchmark harness):
The ONLY paths you may read, list, glob, grep, or open are:
  1. E:\deepseek-harness\dsh-plugin-upgrade-skill\benchmark\results\artifacts\2026-10-16-step5-preview-s1-s24-r3\skill\S6-corridor-net-state\fixture\        (your task evidence)
  2. E:\deepseek-harness\dsh-plugin-upgrade-skill\benchmark\results\artifacts\2026-10-16-step5-preview-s1-s24-r3\skill\S6-corridor-net-state\agent-output\   (write your report here)
  3. E:\deepseek-harness\dsh-plugin-upgrade-skill\skills\plugin-upgrade\ (read-only skill reference)
Every other path is FORBIDDEN — including but not limited to: the repository
root and any file there (README, docs, drafts), the benchmark/ directory
tree, solution/ and tests/ subdirectories, .dsh/, node_modules/, system
temporary directories (the Windows TEMP / %TEMP% / AppData\Local\Temp
directories), and anything outside the paths listed above. You MUST NOT
write to ANY path outside your own cell directory — not even a temporary
or scratch file. If you need a temporary script, write it inside
E:\deepseek-harness\dsh-plugin-upgrade-skill\benchmark\results\artifacts\2026-10-16-step5-preview-s1-s24-r3\skill\S6-corridor-net-state\agent-output\S6-corridor-net-state\ and delete it when you are done.
Do not list, glob, or open any parent or sibling directory even "just to
look". If something you need is missing from your allowed paths, state
that in your report instead of searching elsewhere.

You may additionally consult the plugin-upgrade skill (read-only) at `E:\deepseek-harness\dsh-plugin-upgrade-skill\skills\plugin-upgrade\`. You must not read the task's `solution/` or `tests/` directories.
