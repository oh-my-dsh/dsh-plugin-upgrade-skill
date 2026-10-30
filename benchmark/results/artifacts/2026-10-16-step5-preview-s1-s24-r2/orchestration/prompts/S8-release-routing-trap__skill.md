# S8 · Release Routing Trap (Read-Only)

## Unattended Evaluation Authorization (BENCHMARK-AUTH-v1)

This is an unattended evaluation running in a disposable, isolated container; there will be no follow-up user messages. This task brief is itself the user's explicit authorization and confirmation for the approach and execution needed to complete the task: complete the necessary analysis and planning on your own, and keep executing as soon as the plan is formed — do not pause to wait for "confirmation", and do not ask the user follow-up questions. That confirmation continues to apply to the concrete plans you produce under the applicable skill, but only within the following scope:

- You may inspect `E:\deepseek-harness\dsh-plugin-upgrade-skill\benchmark\results\artifacts\2026-10-16-step5-preview-s1-s24-r2\skill\S8-release-routing-trap\fixture\`, in-container local documentation, and local tools read-only; `E:\deepseek-harness\dsh-plugin-upgrade-skill\benchmark\results\artifacts\2026-10-16-step5-preview-s1-s24-r2\skill\S8-release-routing-trap\fixture\` must remain completely unchanged; you may write your report into the designated `E:\deepseek-harness\dsh-plugin-upgrade-skill\benchmark\results\artifacts\2026-10-16-step5-preview-s1-s24-r2\skill\S8-release-routing-trap\agent-output\` directory as the brief specifies;
- You may create temporary files needed for the report and run read-only local scan commands, but you must not execute migrations or installations;
- You must not modify the skill, the evaluator, or the reference answers, and you must not publish, push, access external services, or alter resources outside the container;
- If you cannot complete the task, state the blocker honestly, but do not stop merely because another round of confirmation is missing.

I maintain a community plugin published to two public GitHub mirrors. A consumer reported a
two-stage failure and I need a release-engineering diagnosis (static evidence pack in
`E:\deepseek-harness\dsh-plugin-upgrade-skill\benchmark\results\artifacts\2026-10-16-step5-preview-s1-s24-r2\skill\S8-release-routing-trap\fixture\`; read-only — do not modify it). The consumer cannot upgrade their dsh runtime
right now (production freeze), so remedies must work on their current runtime.

**What the consumer did and saw:**

1. They followed the plugin README's default install command, which pins
   `#v0.9.5`:
   ```
   dsh plugin --profile web add '@org/dsh-ui-progress@github:public-org/dsh-ui-progress#v0.9.5'
   ```
   → pnpm failed immediately.
2. I bumped the README to the newest tag `#v0.9.7`. The consumer retried, the install
   succeeded this time, and then the plugin's slot entry crashed in the browser:
   `TypeError: useConversation is not a function`. Restarting dsh did not help.

**Your report** (write to `E:\deepseek-harness\dsh-plugin-upgrade-skill\benchmark\results\artifacts\2026-10-16-step5-preview-s1-s24-r2\skill\S8-release-routing-trap\agent-output\S8-release-routing-trap\`, any filename):

1. Attempt-1 root cause: why `#v0.9.5` could not resolve — identify the release-engineering
   defect from the evidence, not a guess about the consumer's network or command;
2. Attempt-2 root cause: why the newest tag installed but the plugin crashes — identify the
   compatibility direction (which artifact targets which DSH version) and tie it to the
   consumer's actual runtime;
3. The exact remedy for the consumer right now (a concrete install command, if applicable);
4. The maintainer-side fix so both defects cannot recur (release tooling + docs).

What is tested: connecting the two failures to their distinct root causes (tag distribution
vs version routing), and giving a remedy that works under the consumer's constraint.


WORKSPACE BOUNDARY (hard rule — you are running inside a benchmark harness):
The ONLY paths you may read, list, glob, grep, or open are:
  1. E:\deepseek-harness\dsh-plugin-upgrade-skill\benchmark\results\artifacts\2026-10-16-step5-preview-s1-s24-r2\skill\S8-release-routing-trap\fixture\        (your task evidence)
  2. E:\deepseek-harness\dsh-plugin-upgrade-skill\benchmark\results\artifacts\2026-10-16-step5-preview-s1-s24-r2\skill\S8-release-routing-trap\agent-output\   (write your report here)
  3. E:\deepseek-harness\dsh-plugin-upgrade-skill\skills\plugin-upgrade\ (read-only skill reference)
Every other path is FORBIDDEN — including but not limited to: the repository
root and any file there (README, docs, drafts), the benchmark/ directory
tree, solution/ and tests/ subdirectories, .dsh/, node_modules/, system
temporary directories (the Windows TEMP / %TEMP% / AppData\Local\Temp
directories), and anything outside the paths listed above. You MUST NOT
write to ANY path outside your own cell directory — not even a temporary
or scratch file. If you need a temporary script, write it inside
E:\deepseek-harness\dsh-plugin-upgrade-skill\benchmark\results\artifacts\2026-10-16-step5-preview-s1-s24-r2\skill\S8-release-routing-trap\agent-output\S8-release-routing-trap\ and delete it when you are done.
Do not list, glob, or open any parent or sibling directory even "just to
look". If something you need is missing from your allowed paths, state
that in your report instead of searching elsewhere.

You may additionally consult the plugin-upgrade skill (read-only) at `E:\deepseek-harness\dsh-plugin-upgrade-skill\skills\plugin-upgrade\`. You must not read the task's `solution/` or `tests/` directories.
