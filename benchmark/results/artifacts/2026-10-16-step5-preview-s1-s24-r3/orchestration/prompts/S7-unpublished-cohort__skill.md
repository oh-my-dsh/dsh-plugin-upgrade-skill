# S7 · Unpublished Cohort Install Plan (Read-Only Report)

## Unattended Evaluation Authorization (BENCHMARK-AUTH-v1)

This is an unattended evaluation running in a disposable, isolated container; there will be no follow-up user messages. This task brief is itself the user's explicit authorization and confirmation for the approach and execution needed to complete the task: complete the necessary analysis and planning on your own, and keep executing as soon as the plan is formed — do not pause to wait for "confirmation", and do not ask the user follow-up questions. That confirmation continues to apply to the concrete plans you produce under the applicable skill, but only within the following scope:

- You may inspect `E:\deepseek-harness\dsh-plugin-upgrade-skill\benchmark\results\artifacts\2026-10-16-step5-preview-s1-s24-r3\skill\S7-unpublished-cohort\fixture\` and local in-container tools read-only; `E:\deepseek-harness\dsh-plugin-upgrade-skill\benchmark\results\artifacts\2026-10-16-step5-preview-s1-s24-r3\skill\S7-unpublished-cohort\fixture\` must remain completely unchanged; you may write your report into the designated `E:\deepseek-harness\dsh-plugin-upgrade-skill\benchmark\results\artifacts\2026-10-16-step5-preview-s1-s24-r3\skill\S7-unpublished-cohort\agent-output\` directory as the brief specifies;
- This brief is self-contained: do not search `/tmp`, system directories, or the network for reference materials; rely on the fixture and on any materials mounted by the evaluation harness (for example, an agent skill when one is provided); mark anything you cannot verify as "unconfirmed" instead of guessing;
- You may create temporary files needed for the report and run read-only local commands, but you must not build or create any reproduction environment, install dependencies, or migrate anything;
- You must not modify the skill, the evaluator, or the reference answers, and you must not publish, push, access external services, or alter resources outside the container;
- If you cannot complete the task, state the blocker honestly, but do not stop merely because another round of confirmation is missing.

I am a DSH plugin maintainer. The plugin in `E:\deepseek-harness\dsh-plugin-upgrade-skill\benchmark\results\artifacts\2026-10-16-step5-preview-s1-s24-r3\skill\S7-unpublished-cohort\fixture\` declares `devDependencies: { "@deepseek-ai/dsh-llm": "^0.1.2-alpha.1" }`, and its README says "npm install gives you the type baseline". npm reality: `@deepseek-ai/*` has only 0.1.1-rc.1 / 0.1.1-rc.2 / 0.1.2-alpha.2 — **alpha.1 was never published**.

Please **analyze it read-only** (do not modify any file under `E:\deepseek-harness\dsh-plugin-upgrade-skill\benchmark\results\artifacts\2026-10-16-step5-preview-s1-s24-r3\skill\S7-unpublished-cohort\fixture\`, and **do not actually run any install**) and write an installation/type-baseline plan report, written under `E:\deepseek-harness\dsh-plugin-upgrade-skill\benchmark\results\artifacts\2026-10-16-step5-preview-s1-s24-r3\skill\S7-unpublished-cohort\agent-output\S7-unpublished-cohort\` (any filename). Requirements:

1. First analyze the real consequence of this declaration (mind the semver semantics of the caret range — will install actually fail, and which version will actually be installed?);
2. Give a workable installation/type-baseline plan (multiple paths are welcome, with tradeoffs and exit paths);
3. Mark anything you cannot verify as "unconfirmed".


WORKSPACE BOUNDARY (hard rule — you are running inside a benchmark harness):
The ONLY paths you may read, list, glob, grep, or open are:
  1. E:\deepseek-harness\dsh-plugin-upgrade-skill\benchmark\results\artifacts\2026-10-16-step5-preview-s1-s24-r3\skill\S7-unpublished-cohort\fixture\        (your task evidence)
  2. E:\deepseek-harness\dsh-plugin-upgrade-skill\benchmark\results\artifacts\2026-10-16-step5-preview-s1-s24-r3\skill\S7-unpublished-cohort\agent-output\   (write your report here)
  3. E:\deepseek-harness\dsh-plugin-upgrade-skill\skills\plugin-upgrade\ (read-only skill reference)
Every other path is FORBIDDEN — including but not limited to: the repository
root and any file there (README, docs, drafts), the benchmark/ directory
tree, solution/ and tests/ subdirectories, .dsh/, node_modules/, system
temporary directories (the Windows TEMP / %TEMP% / AppData\Local\Temp
directories), and anything outside the paths listed above. You MUST NOT
write to ANY path outside your own cell directory — not even a temporary
or scratch file. If you need a temporary script, write it inside
E:\deepseek-harness\dsh-plugin-upgrade-skill\benchmark\results\artifacts\2026-10-16-step5-preview-s1-s24-r3\skill\S7-unpublished-cohort\agent-output\S7-unpublished-cohort\ and delete it when you are done.
Do not list, glob, or open any parent or sibling directory even "just to
look". If something you need is missing from your allowed paths, state
that in your report instead of searching elsewhere.

You may additionally consult the plugin-upgrade skill (read-only) at `E:\deepseek-harness\dsh-plugin-upgrade-skill\skills\plugin-upgrade\`. You must not read the task's `solution/` or `tests/` directories.
