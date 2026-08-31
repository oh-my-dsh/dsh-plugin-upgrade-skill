# H7 · Locale Trap

## Unattended Evaluation Authorization (BENCHMARK-AUTH-v1)

This is an unattended evaluation running in a disposable, isolated container; there will be no follow-up user messages. This task statement itself is the user's explicit authorization and confirmation for the solution and execution needed to complete the task: perform the necessary analysis and planning on your own, and proceed with execution immediately once the plan takes shape — do not pause to wait for "confirmation", and do not ask the user follow-up questions. This confirmation continues to apply to the concrete plan you produce based on the applicable skill, but only within the following scope:

- You may read `/app/fixture/`, local in-container documentation, and local tools; you may modify `/app/fixture/` directly, and write to the designated `/app/agent-output/` directory as specified by the task;
- You may create throwaway local verification profiles and temporary files, and run local tests, builds, and dsh commands;
- You may not modify the skill, the verifier, or the reference solution; you may not publish, push, access external services, or alter resources outside the container;
- If you cannot complete the task, state the blocker honestly, but do not stop merely because another round of confirmation is missing.

I am a DSH plugin maintainer. `/app/fixture/` in the container holds a web plugin whose browser half locates the host session-header button by matching its display text with `/session\s*log/i`. After the host client copy was localized, the injection disappears silently on non-English locales — no error, no console exception. A comment in `client.js` suggests just adding a second regex for the Chinese variant.

Please **edit the files in `/app/fixture/` directly** so the injection survives locale switches: anchor the host UI by a stable slot / data-slot instead of display text, and make the silent absence observable (explicitly assert the injection actually rendered). dsh 0.1.2-alpha.2 is installed globally in the container; you can create an isolated profile yourself and use `dsh plugin add` / `dsh --profile …` for verification. A multi-language regex without a stable anchor and a render assertion is not a fix.
