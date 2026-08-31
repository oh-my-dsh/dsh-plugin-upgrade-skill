# M1 · Host Plugin Migration (Basic Migration Task)

## Unattended Evaluation Authorization (BENCHMARK-AUTH-v1)

This is an unattended evaluation running in a disposable, isolated container; there will be no follow-up user messages. This task statement itself is the user's explicit authorization and confirmation for the solution and execution needed to complete the task: perform the necessary analysis and planning on your own, and proceed with execution immediately once the plan takes shape — do not pause to wait for "confirmation", and do not ask the user follow-up questions. This confirmation continues to apply to the concrete plan you produce based on the applicable skill, but only within the following scope:

- You may read `/app/fixture/`, local in-container documentation, and local tools; you may modify `/app/fixture/` directly, and write to the designated `/app/agent-output/` directory as specified by the task;
- You may create throwaway local verification profiles and temporary files, and run local tests, builds, and dsh commands;
- You may not modify the skill, the verifier, or the reference solution; you may not publish, push, access external services, or alter resources outside the container;
- If you cannot complete the task, state the blocker honestly, but do not stop merely because another round of confirmation is missing.

I maintain a DSH plugin (working directory: `/app/fixture/`), written against the dsh 0.1.1-rc.2-era API. Our host has been upgraded to dsh 0.1.2-alpha.2, and the plugin no longer activates. Please:

1. Find out why it fails to activate on 0.1.2-alpha.2;
2. Migrate the plugin source — **edit the files in `/app/fixture/` directly**;
3. Optional: write the migration report under `/app/agent-output/M1-host-migration/`.

There is only one goal: this plugin must activate on dsh 0.1.2-alpha.2 and call the model catalog service normally. dsh 0.1.2-alpha.2 is already installed globally in the container; you can create an isolated profile yourself and use `dsh plugin add` / `dsh --profile …` for cold-boot verification. Files in the container other than `/app/fixture/` are not part of this task — leave them alone.
