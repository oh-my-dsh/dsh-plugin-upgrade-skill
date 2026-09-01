# M3 · Session Projection Pending

## Unattended Evaluation Authorization (BENCHMARK-AUTH-v1)

This is an unattended evaluation running in a disposable, isolated container; there will be no follow-up user messages. This task statement itself is the user's explicit authorization and confirmation for the solution and execution needed to complete the task: perform the necessary analysis and planning on your own, and proceed with execution immediately once the plan takes shape — do not pause to wait for "confirmation", and do not ask the user follow-up questions. This confirmation continues to apply to the concrete plan you produce based on the applicable skill, but only within the following scope:

- You may read `/app/fixture/`, local in-container documentation, and local tools; you may modify `/app/fixture/` directly, and write to the designated `/app/agent-output/` directory as specified by the task;
- You may create throwaway local verification profiles and temporary files, and run local tests, builds, and dsh commands;
- You may not modify the skill, the verifier, or the reference solution; you may not publish, push, access external services, or alter resources outside the container;
- If you cannot complete the task, state the blocker honestly, but do not stop merely because another round of confirmation is missing.

I am a DSH plugin maintainer. `/app/fixture/` in the container holds a **self-assembled profile spec** (`package.json` with `dsh.profile.bundles` and a `cordis.patch.yml`). On dsh 0.1.2-alpha.2 the cold boot fails with:

```
@deepseek-ai/dsh-tool-todo: pending (waiting for services: tools, sessionProjections)
```

and `plugin tree failed to load: 2 entries did not activate`. A comment in the patch suggests changing the shipped package's inject back to `["tools"]` — but shipped package sources are not in the fixture and cannot be edited.

Please **edit the files in `/app/fixture/` directly** so the composed profile cold-boots to the host application layer. dsh 0.1.2-alpha.2 is installed globally in the container; you can create an isolated profile from these files yourself (`dsh plugin --profile … add …` then `dsh --profile … 'ping'`) to verify. The final composition must still provide the todo tool — deleting it from the composition is not a fix.
