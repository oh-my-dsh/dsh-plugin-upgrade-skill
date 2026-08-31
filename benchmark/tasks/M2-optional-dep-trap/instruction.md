# M2 · Optional Dependency Trap

## Unattended Evaluation Authorization (BENCHMARK-AUTH-v1)

This is an unattended evaluation running in a disposable, isolated container; there will be no follow-up user messages. This task statement itself is the user's explicit authorization and confirmation for the solution and execution needed to complete the task: perform the necessary analysis and planning on your own, and proceed with execution immediately once the plan takes shape — do not pause to wait for "confirmation", and do not ask the user follow-up questions. This confirmation continues to apply to the concrete plan you produce based on the applicable skill, but only within the following scope:

- You may read `/app/fixture/`, local in-container documentation, and local tools; you may modify `/app/fixture/` directly, and write to the designated `/app/agent-output/` directory as specified by the task;
- You may create throwaway local verification profiles and temporary files, and run local tests, builds, and dsh commands;
- You may not modify the skill, the verifier, or the reference solution; you may not publish, push, access external services, or alter resources outside the container;
- If you cannot complete the task, state the blocker honestly, but do not stop merely because another round of confirmation is missing.

I am a DSH plugin maintainer. `/app/fixture/` in the container holds a dsh 0.1.2-alpha.2 plugin whose author put `@deepseek-ai/dsh-util-time` into `optionalDependencies`, while `lib/index.js` unconditionally imports it at top level. The author left a comment saying "optional is harmless, npm always installs it".

Please **edit the files in `/app/fixture/` directly** so the plugin cold-boots reliably on dsh 0.1.2-alpha.2. dsh 0.1.2-alpha.2 is already installed globally in the container; you can create an isolated profile yourself and use `dsh plugin --profile … add file:/app/fixture` (the `file:` form installs the plugin's dependencies; the plain directory form does not) then `dsh --profile … 'ping'` for cold-boot verification. Wrapping the import in a try/catch or a dynamic import so the crash disappears is not a fix — the dependency contract must be corrected.
