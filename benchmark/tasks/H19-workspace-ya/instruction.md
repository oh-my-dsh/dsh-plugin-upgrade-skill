# H19 · Workspace Sidebar Takeover (web client composition, 0.1.1-era → 0.1.2-alpha.2)

## Unattended Benchmark Authorization (BENCHMARK-AUTH-v1)

This is an unattended benchmark run in a disposable isolated container; there will be no follow-up user messages. This task statement is itself the user's explicit authorization and confirmation for the solution and execution needed to complete the task: complete the necessary analysis and planning on your own, and continue executing immediately once the plan is formed — do not pause to wait for "confirmation" and do not press the user with follow-up questions. That confirmation continues to apply to the concrete plans you produce under the applicable skill, but only within the following scope:

- You may read `/app/fixture/`, local in-container documentation, and local tools; you may modify `/app/fixture/` directly and write to the specified `/app/agent-output/` directory as instructed;
- You may create disposable local verification profiles and temporary files, and run local tests, builds, and dsh commands;
- You may not modify the skill, the verifier, or the reference solution; you may not publish, push, access external services, or alter resources outside the container;
- If you cannot complete the task, state the blocker honestly, but do not stop merely because another round of confirmation is missing.

I maintain a workspace-browser replacement plugin (working directory: `/app/fixture/`, i.e. the fixture directory inside the container) written in the 0.1.1-era style — its bundle patch disables the official `ui-workspace` client entry and the browser half registers the replacement two-level sidebar (`sidebar.workspaces`) plus the conversation hero picker (`conversation.hero.workspace`). The host has already been upgraded to dsh 0.1.2-alpha.2. Run the upgrade as a three-act drill:

1. **Diagnose** — inspect both planes (host stub + browser composition) against the 0.1.2-alpha.2 host, find every breakage (the deleted runtime package's split, the client inject list, the global standard-hook and navigation-service roles the disabled official entry used to own, the peer cohort), and write the diagnosis with the corresponding card IDs to `/app/agent-output/H19-workspace-ya/diagnosis.md`;
2. **Fix** — migrate the plugin by editing the files under `/app/fixture/` directly;
3. **Deploy** — create an isolated profile, install the plugin, cold-boot the web profile, and confirm the plugin tree activates and the browser roster actually lists the plugin's client entry.

Bump the version in `package.json` as part of the release hygiene. dsh 0.1.2-alpha.2 and pnpm are installed globally; the fixture is git-committed as the baseline, and nothing outside `/app/fixture/` and your own `/app/agent-output/` is part of this task — leave it alone. There is no browser in this container: the browser-side acceptance anchor is the host's announced boot graph (the client entry must appear there).
