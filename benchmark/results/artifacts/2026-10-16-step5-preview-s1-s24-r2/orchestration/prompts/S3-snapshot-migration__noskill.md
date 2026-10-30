# S3 · Snapshot Read-Surface Migration Assessment (Read-Only)

## Unattended Evaluation Authorization (BENCHMARK-AUTH-v1)

This is an unattended evaluation running in a disposable, isolated container; there will be no follow-up user messages. This task brief is itself the user's explicit authorization and confirmation for the approach and execution needed to complete the task: complete the necessary analysis and planning on your own, and keep executing as soon as the plan is formed — do not pause to wait for "confirmation", and do not ask the user follow-up questions. That confirmation continues to apply to the concrete plans you produce under the applicable skill, but only within the following scope:

- You may inspect `E:\deepseek-harness\dsh-plugin-upgrade-skill\benchmark\results\artifacts\2026-10-16-step5-preview-s1-s24-r2\noskill\S3-snapshot-migration\fixture\`, in-container local documentation, and local tools read-only; `E:\deepseek-harness\dsh-plugin-upgrade-skill\benchmark\results\artifacts\2026-10-16-step5-preview-s1-s24-r2\noskill\S3-snapshot-migration\fixture\` must remain completely unchanged; you may write your report into the designated `E:\deepseek-harness\dsh-plugin-upgrade-skill\benchmark\results\artifacts\2026-10-16-step5-preview-s1-s24-r2\noskill\S3-snapshot-migration\agent-output\` directory as the brief specifies;
- You may create temporary files needed for the report and run read-only local scan commands, but you must not execute migrations or installations;
- You must not modify the skill, the evaluator, or the reference answers, and you must not publish, push, access external services, or alter resources outside the container;
- If you cannot complete the task, state the blocker honestly, but do not stop merely because another round of confirmation is missing.

I am a DSH browser plugin maintainer. `E:\deepseek-harness\dsh-plugin-upgrade-skill\benchmark\results\artifacts\2026-10-16-step5-preview-s1-s24-r2\noskill\S3-snapshot-migration\fixture\` in the container holds a browser pet plugin written in the 0.1.1-rc.1 era (a pixel pet in the page header; its animation follows the session snapshot). The host will be upgraded to dsh 0.1.2-alpha.2 — **do not touch the code yet**. Please give me a migration assessment report, written under `E:\deepseek-harness\dsh-plugin-upgrade-skill\benchmark\results\artifacts\2026-10-16-step5-preview-s1-s24-r2\noskill\S3-snapshot-migration\agent-output\S3-snapshot-migration\` (.md/.txt/.json all fine). Requirements:

1. Point out every surface of this code that will break on 0.1.2-alpha.2, each tied to its source location;
2. For each one, give the correct post-migration form (spell out the new API shape);
3. Cite the full number of the corresponding upgrade card (e.g. `DSH-0.1.2-A1-xx`);
4. Explain which fields can run first through a compatibility projection and which must switch to a new read path immediately.

There are no traps in this brief; what is tested is whether the snapshot read-surface migration is complete, the card mapping is accurate, and read-only discipline is respected.


WORKSPACE BOUNDARY (hard rule — you are running inside a benchmark harness):
The ONLY paths you may read, list, glob, grep, or open are:
  1. E:\deepseek-harness\dsh-plugin-upgrade-skill\benchmark\results\artifacts\2026-10-16-step5-preview-s1-s24-r2\noskill\S3-snapshot-migration\fixture\        (your task evidence)
  2. E:\deepseek-harness\dsh-plugin-upgrade-skill\benchmark\results\artifacts\2026-10-16-step5-preview-s1-s24-r2\noskill\S3-snapshot-migration\agent-output\   (write your report here)
Every other path is FORBIDDEN — including but not limited to: the repository
root and any file there (README, docs, drafts), the benchmark/ directory
tree, solution/ and tests/ subdirectories, .dsh/, node_modules/, system
temporary directories (the Windows TEMP / %TEMP% / AppData\Local\Temp
directories), and anything outside the paths listed above. You MUST NOT
write to ANY path outside your own cell directory — not even a temporary
or scratch file. If you need a temporary script, write it inside
E:\deepseek-harness\dsh-plugin-upgrade-skill\benchmark\results\artifacts\2026-10-16-step5-preview-s1-s24-r2\noskill\S3-snapshot-migration\agent-output\S3-snapshot-migration\ and delete it when you are done.
Do not list, glob, or open any parent or sibling directory even "just to
look". If something you need is missing from your allowed paths, state
that in your report instead of searching elsewhere.

You have no skills available for this task. You must not read, search, or cite anything under the repository's `skills/` directory (including SKILL.md files and card identifiers such as `DSH-0.1.x-xx`), nor `solution/` or `tests/`. Work only from the task materials in this directory.
