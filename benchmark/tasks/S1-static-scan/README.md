# S1-static-scan · Static Touchpoint Scan (Read-Only)

The agent scans the dsh 0.1.1 legacy plugin under `/app/fixture/` read-only, maps the hits across the seven touchpoint categories to the change cards of the 0.1.1-rc.2 → 0.1.2-alpha.2 corridor, and writes the report to `/app/agent-output/S1-static-scan/`.
Tests "complete scan + accurate card mapping (incl. corridor folding A1-02 ↔ A2-01) + read-only discipline".
Task brief: [instruction.md](instruction.md); grading logic: [tests/judge.mjs](tests/judge.mjs).

- **Environment**: `node:24-bookworm` + git (the fixture is committed as a git baseline to enforce the read-only gate), no dsh installed (this task is static).
- **Verifier**: judge checks fixture zero-change + the report hitting all 6 expected cards, normalizes the 0-100 score into `/logs/verifier/reward.txt`.
- **Oracle**: `harbor run -p benchmark/tasks/S1-static-scan -a oracle`, expected reward 1.0.

```
environment/fixture/   # legacy plugin source (fixture with all seven touchpoint categories planted as traps)
tests/                 # judge.mjs + judge-utils.mjs + test.sh
solution/              # reference report + solve.sh
```
