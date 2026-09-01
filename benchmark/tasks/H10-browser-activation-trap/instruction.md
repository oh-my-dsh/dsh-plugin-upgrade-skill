# H10 · Browser Activation Trap

## Unattended Evaluation Authorization (BENCHMARK-AUTH-v1)

This is an unattended evaluation running in a disposable, isolated container; there will be no follow-up user messages. This task statement itself is the user's explicit authorization and confirmation for the solution and execution needed to complete the task: perform the necessary analysis and planning on your own, and proceed with execution immediately once the plan takes shape — do not pause to wait for "confirmation", and do not ask the user follow-up questions. This confirmation continues to apply to the concrete plan you produce based on the applicable skill, but only within the following scope:

- You may read `/app/fixture/`, local in-container documentation, and local tools; you may modify `/app/fixture/` directly, and write to the designated `/app/agent-output/` directory as specified by the task;
- You may create throwaway local verification profiles and temporary files, and run local tests, builds, browser checks, and dsh commands;
- You may not modify the skill, the verifier, or the reference solution; you may not publish, push, access external services, or alter resources outside the container;
- If you cannot complete the task, state the blocker honestly, but do not stop merely because another round of confirmation is missing.

I maintain a DSH Web plugin in `/app/fixture/`. It was renamed during the alpha.2 upgrade. Installation succeeds, the host boots, `window.__DSH_BOOT__.entries` contains the package, and the client bundle responds with HTTP 200 — but the browser reports that the client entry did not activate and the plugin's activation marker never appears.

Please **edit the files in `/app/fixture/` directly** so the browser half truly activates. Do not modify dsh or the host profile. dsh 0.1.2-alpha.2, Chromium, and Playwright are installed in the container; use an isolated profile and a real browser to verify the fix. A manifest entry or a successful bundle fetch alone is not proof of activation.
