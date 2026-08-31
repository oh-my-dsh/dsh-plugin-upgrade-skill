# H3 · Client Plane (Installs and Activates, and Must Be Listed in the Browser Roster)

## Unattended Benchmark Authorization (BENCHMARK-AUTH-v1)

This is an unattended benchmark run in a disposable isolated container; there will be no follow-up user messages. This task statement is itself the user's explicit authorization and confirmation for the solution and execution needed to complete the task: complete the necessary analysis and planning on your own, and continue executing immediately once the plan is formed — do not pause to wait for "confirmation" and do not press the user with follow-up questions. That confirmation continues to apply to the concrete plans you produce under the applicable skill, but only within the following scope:

- You may read `/app/fixture/`, local in-container documentation, and local tools; you may modify `/app/fixture/` directly and write to the specified `/app/agent-output/` directory as instructed;
- You may create disposable local verification profiles and temporary files, and run local tests, builds, and dsh commands;
- You must not modify the skill, the grader, or the reference solution, and must not publish, push, access external services, or change resources outside the container;
- If you cannot complete the task, state the blocker honestly, but do not stop merely because another round of confirmation is missing.

I also have a browser plugin (working directory: `/app/fixture/`, i.e., the fixture directory inside the container) written in the 0.1.1-era style — the kind that pastes clipboard content into an input box on the page. The host has already been upgraded to dsh 0.1.2-alpha.2; please migrate it: **edit the files under `/app/fixture/` directly** so that it installs and activates on 0.1.2-alpha.2 and the browser side actually loads it.

dsh 0.1.2-alpha.2 is already installed globally in the container. You may create an isolated profile yourself and run cold boot verification with `dsh plugin add` / `dsh --profile …` (`dsh web` should start). Everything outside `/app/fixture/` is not part of this task — leave it alone.
