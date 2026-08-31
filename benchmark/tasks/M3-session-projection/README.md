# M3-session-projection · Session Projection Pending

The agent fixes the `/app/fixture/` self-assembled profile spec whose
`dsh-tool-todo` entry pends on `sessionProjections` (DSH-0.1.2-A2-08). Tests
"fix the composition instead of editing shipped packages + the final composition
still provides the todo tool + real cold-boot activation".

- **Environment**: `node:24-bookworm` + git (fixture committed as a git baseline) + globally installed pnpm@11.24.0 and dsh 0.1.2-alpha.2 (container task; the judge constructs the profile from the fixture files and cold-boots it inside the container).
- **Verifier**: fixture changed (else 0) + the judge installs the fixture's bundles into an isolated profile and cold-boots: `MISSING_CREDENTIAL` without a key AND the composed tree still contains `@deepseek-ai/dsh-tool-todo` (100); pending / plugin tree failed (40); bundle install failed (30); the todo tool removed from the final composition entirely (0 — dodging).
- **Oracle**: `harbor run -p benchmark/tasks/M3-session-projection -a oracle`, expected reward 1.0.

```
environment/fixture/   # profile spec (package.json + cordis.patch.yml), test material only
tests/                 # judge.mjs + judge-utils.mjs + test.sh
solution/              # reference profile files + solve.sh
```
