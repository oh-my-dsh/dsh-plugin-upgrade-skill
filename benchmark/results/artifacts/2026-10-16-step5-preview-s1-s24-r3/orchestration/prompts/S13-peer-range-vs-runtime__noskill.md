# S13 · Peer Range vs Runtime Reality (Read-Only)

## Unattended Evaluation Authorization (BENCHMARK-AUTH-v1)

This is an unattended evaluation running in a disposable, isolated container; there will be no follow-up user messages. This task brief is itself the user's explicit authorization and confirmation for the approach and execution needed to complete the task: complete the necessary analysis and planning on your own, and keep executing as soon as the plan is formed — do not pause to wait for "confirmation", and do not ask the user follow-up questions. That confirmation continues to apply to the concrete plans you produce under the applicable skill, but only within the following scope:

- You may inspect `E:\deepseek-harness\dsh-plugin-upgrade-skill\benchmark\results\artifacts\2026-10-16-step5-preview-s1-s24-r3\noskill\S13-peer-range-vs-runtime\fixture\`, in-container local documentation, and local tools read-only; `E:\deepseek-harness\dsh-plugin-upgrade-skill\benchmark\results\artifacts\2026-10-16-step5-preview-s1-s24-r3\noskill\S13-peer-range-vs-runtime\fixture\` must remain completely unchanged; you may write your report into the designated `E:\deepseek-harness\dsh-plugin-upgrade-skill\benchmark\results\artifacts\2026-10-16-step5-preview-s1-s24-r3\noskill\S13-peer-range-vs-runtime\agent-output\` directory as the brief specifies;
- You may create temporary files needed for the report and run read-only local scan commands, but you must not execute migrations or installations;
- You must not modify the skill, the evaluator, or the reference answers, and you must not publish, push, access external services, or alter resources outside the container;
- If you cannot complete the task, state the blocker honestly, but do not stop merely because another round of confirmation is missing.

I installed a popular community TUI plugin (`@deepseek-harness-tui/dsh-tui@0.1.0-beta.4`) on my dsh
`0.1.2-alpha.5`. The npm install succeeded without any peer warnings — the plugin's peerDependencies declare
`^0.1.2-alpha.2` for every `@deepseek-ai/dsh-*` package, and my dsh at alpha.5 satisfies that range.
But when I run it, the plugin crashes at startup.

The evidence pack in `E:\deepseek-harness\dsh-plugin-upgrade-skill\benchmark\results\artifacts\2026-10-16-step5-preview-s1-s24-r3\noskill\S13-peer-range-vs-runtime\fixture\` (read-only) has: the npm peer-deps output, the crash stack trace, the
plugin's source excerpt where it crashes, and the relevant dsh changelog entry.

**Your report** (write to `E:\deepseek-harness\dsh-plugin-upgrade-skill\benchmark\results\artifacts\2026-10-16-step5-preview-s1-s24-r3\noskill\S13-peer-range-vs-runtime\agent-output\S13-peer-range-vs-runtime\`, any filename):

1. The exact runtime incompatibility: WHAT API did dsh remove, WHEN (which release), and what replaced it —
   cite the changelog entry.
2. WHY did npm install without warnings even though the plugin is broken at runtime: what does a peer range
   (`^0.1.2-alpha.2`) actually guarantee, and what does it NOT guarantee?
3. The fundamental principle: "peer range satisfaction" checks what, and "runtime compatibility" checks what?
   Name at least two categories of breakage that pass peer-range validation but crash at runtime.
4. What the plugin author should have done: both to catch this before publishing (testing against the actual
   target version), and to help users (what should the peer range or engines field encode vs. what needs a
   runtime feature-detection guard)?
5. What I (the user) can do RIGHT NOW to identify this class of issue before installing: name a concrete
   pre-install check.

What is tested: distinguishing semver-range satisfaction (a static, package-metadata-level check) from runtime
API compatibility (a behavioral, code-level reality), and knowing that `^0.1.2-alpha.2` does NOT guarantee
`Session.events` still exists at alpha.4/5 just because alpha.5 > alpha.2 in semver ordering.


WORKSPACE BOUNDARY (hard rule — you are running inside a benchmark harness):
The ONLY paths you may read, list, glob, grep, or open are:
  1. E:\deepseek-harness\dsh-plugin-upgrade-skill\benchmark\results\artifacts\2026-10-16-step5-preview-s1-s24-r3\noskill\S13-peer-range-vs-runtime\fixture\        (your task evidence)
  2. E:\deepseek-harness\dsh-plugin-upgrade-skill\benchmark\results\artifacts\2026-10-16-step5-preview-s1-s24-r3\noskill\S13-peer-range-vs-runtime\agent-output\   (write your report here)
Every other path is FORBIDDEN — including but not limited to: the repository
root and any file there (README, docs, drafts), the benchmark/ directory
tree, solution/ and tests/ subdirectories, .dsh/, node_modules/, system
temporary directories (the Windows TEMP / %TEMP% / AppData\Local\Temp
directories), and anything outside the paths listed above. You MUST NOT
write to ANY path outside your own cell directory — not even a temporary
or scratch file. If you need a temporary script, write it inside
E:\deepseek-harness\dsh-plugin-upgrade-skill\benchmark\results\artifacts\2026-10-16-step5-preview-s1-s24-r3\noskill\S13-peer-range-vs-runtime\agent-output\S13-peer-range-vs-runtime\ and delete it when you are done.
Do not list, glob, or open any parent or sibling directory even "just to
look". If something you need is missing from your allowed paths, state
that in your report instead of searching elsewhere.

You have no skills available for this task. You must not read, search, or cite anything under the repository's `skills/` directory (including SKILL.md files and card identifiers such as `DSH-0.1.x-xx`), nor `solution/` or `tests/`. Work only from the task materials in this directory.
