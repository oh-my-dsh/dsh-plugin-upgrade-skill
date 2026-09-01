# H8 · Fire Drill: One Release, Three Plugins (Composite Hands-On Task)

## Unattended Evaluation Authorization (BENCHMARK-AUTH-v1)

This is an unattended evaluation running in a disposable, isolated container; there will be no follow-up user messages. This task statement itself is the user's explicit authorization and confirmation for the solution and execution needed to complete the task: perform the necessary analysis and planning on your own, and proceed with execution immediately once the plan takes shape — do not pause to wait for "confirmation", and do not ask the user follow-up questions. This confirmation continues to apply to the concrete plan you produce based on the applicable skill, but only within the following scope:

- You may read `/app/fixture/`, local in-container documentation, and local tools; you may modify `/app/fixture/` directly, and write to the designated `/app/agent-output/` directory as specified by the task;
- You may create throwaway local verification profiles and temporary files, and run local tests, builds, and dsh commands;
- You may not modify the skill, the verifier, or the reference solution; you may not publish, push, access external services, or alter resources outside the container;
- If you cannot complete the task, state the blocker honestly, but do not stop merely because another round of confirmation is missing.

Our team is shipping one dsh 0.1.2-alpha.2 release containing three plugins. The working directory `/app/fixture/` holds them: `drill-host` (a host-plane plugin still written against the 0.1.1-rc.2 API), `drill-web` (a host-half web plugin with a self-built `/ping` channel), and `drill-tools` (a tool plugin whose dependency cohort may not exist on npm). `/app/fixture/README.md` documents our internal "release procedure".

Run the upgrade as a four-act drill, in order:

1. **Diagnose** — inspect all three plugins against the 0.1.2-alpha.2 host, find every breakage (there is at least one per plugin), and write the diagnosis with the corresponding card IDs to `/app/agent-output/H8-fire-drill/diagnosis.md`;
2. **Fix** — migrate all three plugins by editing the files under `/app/fixture/` directly;
3. **Deploy** — create an isolated profile, install all three plugins into it, cold-boot the web profile, exchange the bootstrap token for a Cookie, and smoke the `/ping` channel (unauthenticated request → 401, authenticated request → 200); record the evidence under `/app/agent-output/H8-fire-drill/smoke.md`;
4. **Release** — bump the version in every plugin `package.json`, and write the pre-publish checklist to `/app/agent-output/H8-fire-drill/release.md`: what must be verified before publishing, and which npm dist-tag a prerelease must use. Do not actually publish — this container has no publish credentials and publishing is outside the authorized scope.

There is only one goal: all three plugins boot cleanly on 0.1.2-alpha.2, the `/ping` channel is covered by the host's unified authentication, and the release is prepared with the correct gates — no skipped checks, no forced publish. dsh 0.1.2-alpha.2 and pnpm are installed globally; the fixture is git-committed as the baseline, and nothing outside `/app/fixture/` and your own `/app/agent-output/` is part of this task — leave it alone.
