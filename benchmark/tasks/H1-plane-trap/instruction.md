# H1 · Plane Trap (Don't Trust the Comment)

## Unattended Evaluation Authorization (BENCHMARK-AUTH-v1)

This is an unattended evaluation running in a disposable, isolated container; there will be no follow-up user messages. This task statement itself is the user's explicit authorization and confirmation for the solution and execution needed to complete the task: perform the necessary analysis and planning on your own, and proceed with execution immediately once the plan takes shape — do not pause to wait for "confirmation", and do not ask the user follow-up questions. This confirmation continues to apply to the concrete plan you produce based on the applicable skill, but only within the following scope:

- You may read `/app/fixture/`, local in-container documentation, and local tools; you may modify `/app/fixture/` directly, and write to the designated `/app/agent-output/` directory as specified by the task;
- You may create throwaway local verification profiles and temporary files, and run local tests, builds, and dsh commands;
- You may not modify the skill, the verifier, or the reference solution; you may not publish, push, access external services, or alter resources outside the container;
- If you cannot complete the task, state the blocker honestly, but do not stop merely because another round of confirmation is missing.

I am a DSH plugin maintainer. There is a legacy plugin source in `/app/fixture/` in the container, written in the dsh 0.1.1-rc.2 era style, which fails to activate on dsh 0.1.2-alpha.2. The source carries a migration memo left by a previous community user, saying that back then they got it working simply by switching the injection name to `remote`.

Please migrate it to 0.1.2-alpha.2 — **edit the files in `/app/fixture/` directly** — so that the plugin activates and can call the model catalog service normally. dsh 0.1.2-alpha.2 is already installed globally in the container; you can create an isolated profile yourself and use `dsh plugin add` / `dsh --profile …` for cold-boot verification.
