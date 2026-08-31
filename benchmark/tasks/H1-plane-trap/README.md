# H1-plane-trap · Plane Trap (Don't Trust the Comment)

The agent migrates the legacy dsh 0.1.1-rc.2 plugin in `/app/fixture/` to 0.1.2-alpha.2. The source contains a misleading migration comment (suggesting `inject: ["remote"]`); following it blindly falls into the plane trap: this plugin is a host-plane consumer and should inject the domain service `llm`; injecting `remote` instead leaves it `pending (waiting for service: remote)`. Tests "determine the runtime plane before choosing the injection name + real cold-boot activation".

- **Environment**: `node:24-bookworm` + git (the fixture is committed as a git baseline to support the migration gate) + globally installed pnpm@11.24.0 and dsh 0.1.2-alpha.2 (container task; the judge performs cold-boot verification inside the container).
- **Verifier**: the judge checks that the fixture was changed + a static gate (inject containing `remote` but not `llm` caps the score at 20) + the isolated-profile cold-boot activation signal; the 0-100 score is normalized into `/logs/verifier/reward.txt`.
- **Oracle**: `harbor run -p benchmark/tasks/H1-plane-trap -a oracle`, expected reward 1.0.

```
environment/fixture/   # legacy host plugin + misleading migration comment (the trap itself)
tests/                 # judge.mjs + judge-utils.mjs + test.sh
solution/              # reference plugin files + SOLUTION.md + solve.sh
```
