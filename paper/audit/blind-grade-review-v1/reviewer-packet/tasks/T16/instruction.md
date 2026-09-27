# S5 · Naming Four-State Judgment (Read-Only)

## Unattended Evaluation Authorization (BENCHMARK-AUTH-v1)

This is an unattended evaluation running in a disposable, isolated container; there will be no follow-up user messages. This task brief is itself the user's explicit authorization and confirmation for the approach and execution needed to complete the task: complete the necessary analysis and planning on your own, and keep executing as soon as the plan is formed — do not pause to wait for "confirmation", and do not ask the user follow-up questions. That confirmation continues to apply to the concrete plans you produce under the applicable skill, but only within the following scope:

- You may inspect `/app/fixture/` and local in-container tools read-only; `/app/fixture/` must remain completely unchanged; you may write your report into the designated `/app/agent-output/` directory as the brief specifies;
- This is a **closed-book** brief: there are no reference materials outside the fixture — do not search `/tmp`, system directories, or the network for them; mark anything you cannot verify as "unconfirmed" instead of guessing;
- You may create temporary files needed for the report and run read-only local commands, but you must not build or create any reproduction environment, install dependencies, or migrate anything;
- You must not modify the skill, the evaluator, or the reference answers, and you must not publish, push, access external services, or alter resources outside the container;
- If you cannot complete the task, state the blocker honestly, but do not stop merely because another round of confirmation is missing.

I am about to publish a community plugin. `/app/fixture/` in the container holds the plugin's `package.json` and `dsh-plugin.naming.json`. Before publishing I want a **judgment** of its naming compatibility and registry status.

Please **review it read-only** (do not modify any file under `/app/fixture/`) and produce a judgment report, written under `/app/agent-output/S5-negative-naming/` (any filename). Requirements:

1. For each surface (plugin name, service name, event name, skill name, route, etc.), give a verdict — "compatibility error / collision recommendation / needs registry context / unknown" — with the reasoning;
2. **No findings ≠ no problems**: without an online registry query, you must not claim "reserved" or "globally available" — report unknown/not-checked honestly;
3. Do not build or create any reproduction environment, and do not modify anything outside the fixture.

What is tested is whether the four-state judgment is restrained and the negative capability is exercised.
