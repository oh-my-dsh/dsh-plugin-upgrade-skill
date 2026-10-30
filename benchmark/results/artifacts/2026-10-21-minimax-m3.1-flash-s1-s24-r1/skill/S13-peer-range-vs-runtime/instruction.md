# S13 · Peer Range vs Runtime Reality (Read-Only)

## Unattended Evaluation Authorization (BENCHMARK-AUTH-v1)

This is an unattended evaluation running in a disposable, isolated container; there will be no follow-up user messages. This task brief is itself the user's explicit authorization and confirmation for the approach and execution needed to complete the task: complete the necessary analysis and planning on your own, and keep executing as soon as the plan is formed — do not pause to wait for "confirmation", and do not ask the user follow-up questions. That confirmation continues to apply to the concrete plans you produce under the applicable skill, but only within the following scope:

- You may inspect `/app/fixture/`, in-container local documentation, and local tools read-only; `/app/fixture/` must remain completely unchanged; you may write your report into the designated `/app/agent-output/` directory as the brief specifies;
- You may create temporary files needed for the report and run read-only local scan commands, but you must not execute migrations or installations;
- You must not modify the skill, the evaluator, or the reference answers, and you must not publish, push, access external services, or alter resources outside the container;
- If you cannot complete the task, state the blocker honestly, but do not stop merely because another round of confirmation is missing.

I installed a popular community TUI plugin (`@deepseek-harness-tui/dsh-tui@0.1.0-beta.4`) on my dsh
`0.1.2-alpha.5`. The npm install succeeded without any peer warnings — the plugin's peerDependencies declare
`^0.1.2-alpha.2` for every `@deepseek-ai/dsh-*` package, and my dsh at alpha.5 satisfies that range.
But when I run it, the plugin crashes at startup.

The evidence pack in `/app/fixture/` (read-only) has: the npm peer-deps output, the crash stack trace, the
plugin's source excerpt where it crashes, and the relevant dsh changelog entry.

**Your report** (write to `/app/agent-output/S13-peer-range-vs-runtime/`, any filename):

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
