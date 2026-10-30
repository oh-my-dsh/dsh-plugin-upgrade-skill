# S2 · Negative Scan (Zero Hits ≠ Compatible)

## Unattended Evaluation Authorization (BENCHMARK-AUTH-v1)

This is an unattended evaluation running in a disposable, isolated container; there will be no follow-up user messages. This task brief is itself the user's explicit authorization and confirmation for the approach and execution needed to complete the task: complete the necessary analysis and planning on your own, and keep executing as soon as the plan is formed — do not pause to wait for "confirmation", and do not ask the user follow-up questions. That confirmation continues to apply to the concrete plans you produce under the applicable skill, but only within the following scope:

- You may inspect `E:\deepseek-harness\dsh-plugin-upgrade-skill\benchmark\results\artifacts\2026-10-16-step5-preview-s1-s24-r3\skill\S2-negative-scan\fixture\`, in-container local documentation, and local tools read-only; `E:\deepseek-harness\dsh-plugin-upgrade-skill\benchmark\results\artifacts\2026-10-16-step5-preview-s1-s24-r3\skill\S2-negative-scan\fixture\` must remain completely unchanged; you may write your report into the designated `E:\deepseek-harness\dsh-plugin-upgrade-skill\benchmark\results\artifacts\2026-10-16-step5-preview-s1-s24-r3\skill\S2-negative-scan\agent-output\` directory as the brief specifies;
- You may create temporary files needed for the report and run read-only local scan commands, but you must not execute migrations or installations;
- You must not modify the skill, the evaluator, or the reference answers, and you must not publish, push, access external services, or alter resources outside the container;
- If you cannot complete the task, state the blocker honestly, but do not stop merely because another round of confirmation is missing.

I have another legacy plugin that also needs to migrate to dsh 0.1.2-alpha.2. It is tiny, and I believe it should have no compatibility problems.

`E:\deepseek-harness\dsh-plugin-upgrade-skill\benchmark\results\artifacts\2026-10-16-step5-preview-s1-s24-r3\skill\S2-negative-scan\fixture\` in the container holds this plugin's source (static copy, not executable).

Please **scan this source read-only** (do not modify any file under `E:\deepseek-harness\dsh-plugin-upgrade-skill\benchmark\results\artifacts\2026-10-16-step5-preview-s1-s24-r3\skill\S2-negative-scan\fixture\`) and write the report under `E:\deepseek-harness\dsh-plugin-upgrade-skill\benchmark\results\artifacts\2026-10-16-step5-preview-s1-s24-r3\skill\S2-negative-scan\agent-output\S2-negative-scan\` (any filename; .md/.txt both fine). Requirements:

1. Give a hit/no-hit conclusion with evidence for each of the seven touchpoint categories;
2. Map the hit touchpoints to the specific change cards;
3. What I especially want to know: can the touchpoint categories with no hits tell me whether this plugin is compatible with 0.1.2? Give your judgment and the basis for it; if you think something else is needed before you can conclude, write that down too.

The source in the container is a static copy (dsh not installed, not executable), for reading and scanning only. The verification suggestions you give (e.g. build/typecheck, isolated-profile cold boot, functional smoke test) are mandatory steps after the migration; putting them in the report is enough — this task does not require actually running them. Note that no action may modify `E:\deepseek-harness\dsh-plugin-upgrade-skill\benchmark\results\artifacts\2026-10-16-step5-preview-s1-s24-r3\skill\S2-negative-scan\fixture\`.


WORKSPACE BOUNDARY (hard rule — you are running inside a benchmark harness):
The ONLY paths you may read, list, glob, grep, or open are:
  1. E:\deepseek-harness\dsh-plugin-upgrade-skill\benchmark\results\artifacts\2026-10-16-step5-preview-s1-s24-r3\skill\S2-negative-scan\fixture\        (your task evidence)
  2. E:\deepseek-harness\dsh-plugin-upgrade-skill\benchmark\results\artifacts\2026-10-16-step5-preview-s1-s24-r3\skill\S2-negative-scan\agent-output\   (write your report here)
  3. E:\deepseek-harness\dsh-plugin-upgrade-skill\skills\plugin-upgrade\ (read-only skill reference)
Every other path is FORBIDDEN — including but not limited to: the repository
root and any file there (README, docs, drafts), the benchmark/ directory
tree, solution/ and tests/ subdirectories, .dsh/, node_modules/, system
temporary directories (the Windows TEMP / %TEMP% / AppData\Local\Temp
directories), and anything outside the paths listed above. You MUST NOT
write to ANY path outside your own cell directory — not even a temporary
or scratch file. If you need a temporary script, write it inside
E:\deepseek-harness\dsh-plugin-upgrade-skill\benchmark\results\artifacts\2026-10-16-step5-preview-s1-s24-r3\skill\S2-negative-scan\agent-output\S2-negative-scan\ and delete it when you are done.
Do not list, glob, or open any parent or sibling directory even "just to
look". If something you need is missing from your allowed paths, state
that in your report instead of searching elsewhere.

You may additionally consult the plugin-upgrade skill (read-only) at `E:\deepseek-harness\dsh-plugin-upgrade-skill\skills\plugin-upgrade\`. You must not read the task's `solution/` or `tests/` directories.
