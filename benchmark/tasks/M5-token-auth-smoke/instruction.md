# M5 · Self-Built Channel Authentication Smoke (Token/Cookie Gate)

## Unattended Evaluation Authorization (BENCHMARK-AUTH-v1)

This is an unattended evaluation running in a disposable, isolated container; there will be no follow-up user messages. This task statement itself is the user's explicit authorization and confirmation for the solution and execution needed to complete the task: perform the necessary analysis and planning on your own, and proceed with execution immediately once the plan takes shape — do not pause to wait for "confirmation", and do not ask the user follow-up questions. This confirmation continues to apply to the concrete plan you produce based on the applicable skill, but only within the following scope:

- You may read `/app/fixture/`, local in-container documentation, and local tools; you may modify `/app/fixture/` directly, and write to the designated `/app/agent-output/` directory as specified by the task;
- You may create throwaway local verification profiles and temporary files, and run local tests, builds, and dsh commands;
- You may not modify the skill, the verifier, or the reference solution; you may not publish, push, access external services, or alter resources outside the container;
- If you cannot complete the task, state the blocker honestly, but do not stop merely because another round of confirmation is missing.

I maintain a DSH web plugin (working directory: `/app/fixture/`). It registers its own HTTP channel `/ping` so the browser side can query a status. After our host upgrade to dsh 0.1.2-alpha.2, the channel still answers, and everything looks fine on the surface.

However, the dsh 0.1.2 host introduced unified authentication for the web/API channel (bootstrap token exchanged for a signed Cookie). I need you to:

1. Determine whether `/ping` is actually protected by that unified authentication;
2. If it is not, fix the registration so the channel is covered by the host's authentication — **edit the files in `/app/fixture/` directly**;
3. Produce browserless smoke evidence (there is no browser in this container): boot the plugin in an isolated profile, record the complete output of an unauthenticated request returning **401** and a token-exchanged request returning **200**, and write that evidence to `/app/agent-output/M5-token-auth-smoke/smoke.md`.

There is only one goal: `/ping` must reject unauthenticated callers with 401 and serve an authenticated caller with 200. dsh 0.1.2-alpha.2 is already installed globally in the container; you can create an isolated profile yourself and use `dsh plugin add` / `dsh --profile …` for cold-boot verification. Files in the container other than `/app/fixture/` and your own `/app/agent-output/` are not part of this task — leave them alone.
