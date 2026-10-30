# S4 · Legacy Client Runtime Touchpoints (Read-Only)

## Unattended Evaluation Authorization (BENCHMARK-AUTH-v1)

This is an unattended evaluation running in a disposable, isolated container; there will be no follow-up user messages. This task brief is itself the user's explicit authorization and confirmation for the approach and execution needed to complete the task: complete the necessary analysis and planning on your own, and keep executing as soon as the plan is formed — do not pause to wait for "confirmation", and do not ask the user follow-up questions. That confirmation continues to apply to the concrete plans you produce under the applicable skill, but only within the following scope:

- You may inspect `E:\deepseek-harness\dsh-plugin-upgrade-skill\benchmark\results\artifacts\2026-10-16-step5-preview-s1-s24-r3\noskill\S4-legacy-client-imports\fixture\` and local in-container tools read-only; `E:\deepseek-harness\dsh-plugin-upgrade-skill\benchmark\results\artifacts\2026-10-16-step5-preview-s1-s24-r3\noskill\S4-legacy-client-imports\fixture\` must remain completely unchanged; you may write your report into the designated `E:\deepseek-harness\dsh-plugin-upgrade-skill\benchmark\results\artifacts\2026-10-16-step5-preview-s1-s24-r3\noskill\S4-legacy-client-imports\agent-output\` directory as the brief specifies;
- This brief is self-contained: do not search `/tmp`, system directories, or the network for reference materials; rely on the fixture and on any materials mounted by the evaluation harness (for example, an agent skill when one is provided); mark anything you cannot verify as "unconfirmed" instead of guessing;
- You may create temporary files needed for the report and run read-only local commands, but you must not build or create any reproduction environment, install dependencies, or migrate anything;
- You must not modify the skill, the evaluator, or the reference answers, and you must not publish, push, access external services, or alter resources outside the container;
- If you cannot complete the task, state the blocker honestly, but do not stop merely because another round of confirmation is missing.

I am a DSH plugin maintainer. `E:\deepseek-harness\dsh-plugin-upgrade-skill\benchmark\results\artifacts\2026-10-16-step5-preview-s1-s24-r3\noskill\S4-legacy-client-imports\fixture\` in the container holds the source of a Web Client plugin written in the dsh 0.1.1-rc.2 era, and I plan to migrate it to dsh 0.1.2-alpha.2; before touching anything I want to know which known changes it will collide with (static copy, not executable).

Please **analyze this source read-only** (do not modify any file under `E:\deepseek-harness\dsh-plugin-upgrade-skill\benchmark\results\artifacts\2026-10-16-step5-preview-s1-s24-r3\noskill\S4-legacy-client-imports\fixture\`) and produce a migration touchpoint report, written under `E:\deepseek-harness\dsh-plugin-upgrade-skill\benchmark\results\artifacts\2026-10-16-step5-preview-s1-s24-r3\noskill\S4-legacy-client-imports\agent-output\S4-legacy-client-imports\` (any filename; .md/.txt both fine). Requirements:

1. Find every touchpoint that will break on 0.1.2-alpha.2, and for each give: file/line, the affected plane (Host / Web Client / plugin), the full upgrade card ID (e.g. `DSH-0.1.2-A1-25`), and the migration action;
2. Do not fabricate change cards: every assertion must carry a source or be explicitly marked "unconfirmed";
3. Do not build or create any reproduction environment, and do not modify anything outside the fixture.

What is tested is whether the scan is complete, the card mapping is accurate, and read-only discipline is respected.


WORKSPACE BOUNDARY (hard rule — you are running inside a benchmark harness):
The ONLY paths you may read, list, glob, grep, or open are:
  1. E:\deepseek-harness\dsh-plugin-upgrade-skill\benchmark\results\artifacts\2026-10-16-step5-preview-s1-s24-r3\noskill\S4-legacy-client-imports\fixture\        (your task evidence)
  2. E:\deepseek-harness\dsh-plugin-upgrade-skill\benchmark\results\artifacts\2026-10-16-step5-preview-s1-s24-r3\noskill\S4-legacy-client-imports\agent-output\   (write your report here)
Every other path is FORBIDDEN — including but not limited to: the repository
root and any file there (README, docs, drafts), the benchmark/ directory
tree, solution/ and tests/ subdirectories, .dsh/, node_modules/, system
temporary directories (the Windows TEMP / %TEMP% / AppData\Local\Temp
directories), and anything outside the paths listed above. You MUST NOT
write to ANY path outside your own cell directory — not even a temporary
or scratch file. If you need a temporary script, write it inside
E:\deepseek-harness\dsh-plugin-upgrade-skill\benchmark\results\artifacts\2026-10-16-step5-preview-s1-s24-r3\noskill\S4-legacy-client-imports\agent-output\S4-legacy-client-imports\ and delete it when you are done.
Do not list, glob, or open any parent or sibling directory even "just to
look". If something you need is missing from your allowed paths, state
that in your report instead of searching elsewhere.

You have no skills available for this task. You must not read, search, or cite anything under the repository's `skills/` directory (including SKILL.md files and card identifiers such as `DSH-0.1.x-xx`), nor `solution/` or `tests/`. Work only from the task materials in this directory.
