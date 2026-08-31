# M1-host-migration · Host Plugin Migration (Basic Container Task)

The agent modifies the dsh 0.1.1-era host plugin in `/app/fixture/` directly and migrates it to 0.1.2-alpha.2 (`inject: ["apiProxy"]` → `inject: ["llm"]`, `ctx.apiProxy.llm.providers()` → `ctx.llm.listProviders()`, dropping the dead dependency `@deepseek-ai/dsh-host-apiproxy`); the goal is cold-boot activation in an isolated profile with startup progressing to the host application layer. Tests "card identification + host-plane migration + cold-boot activation". See [instruction.md](instruction.md) for the task statement and [tests/judge.mjs](tests/judge.mjs) for the grading logic.

- **Environment**: `node:24-bookworm` + git (the fixture is committed as a git baseline to support the migration gate), globally installed dsh 0.1.2-alpha.2 + pnpm (shared by the agent and the verifier).
- **Verifier**: the judge creates an isolated profile inside the task container, runs `dsh plugin add` on `/app/fixture` directly, and judges by headless cold boot (0/30/40/100 tiers; MISSING_CREDENTIAL is expected when there is no key); the reward is normalized into `/logs/verifier/reward.txt`.
- **Oracle**: `harbor run -p benchmark/tasks/M1-host-migration -a oracle`, expected reward 1.0.

```
environment/Dockerfile   # image: git baseline + global dsh 0.1.2-alpha.2
environment/fixture/     # legacy-style host plugin (0.1.1-rc.2 era)
tests/                   # judge.mjs + judge-utils.mjs + test.sh
solution/                # reference changes (solution/plugin/) + SOLUTION.md + solve.sh
```
