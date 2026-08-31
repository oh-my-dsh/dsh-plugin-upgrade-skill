# S2-negative-scan · Negative Scan (Zero Hits ≠ Compatible)

The agent scans the minimal dsh 0.1.1 legacy plugin under `/app/fixture/` read-only: the only hit is #3 (apiProxy → DSH-0.1.2-A1-01); the other six categories have zero hits; the report must argue "zero hits ≠ compatible" and state that real verification is still required, written under `/app/agent-output/S2-negative-scan/`.
Tests "identifying the single hit + arguing the zero-hit semantics + verification awareness + read-only discipline".
Task brief: [instruction.md](instruction.md); grading logic: [tests/judge.mjs](tests/judge.mjs).

- **Environment**: `node:24-bookworm` + git (the fixture is committed as a git baseline to enforce the read-only gate), dsh 0.1.2-alpha.2 installed globally for optional cold-boot verification, but this task's grading does not run dsh (static).
- **Verifier**: judge checks fixture zero-change + the report covering the A1-01 mapping, the zero-hit accounting, the "zero hits ≠ compatible" semantics, and the mandatory-verification statement (40/20/20/20), normalized 0-100 into `/logs/verifier/reward.txt`.
- **Oracle**: `harbor run -p benchmark/tasks/S2-negative-scan -a oracle`, expected reward 1.0.

```
environment/fixture/   # minimal plugin source (only the #3 apiProxy hit, plus planted zero-hit decoys)
tests/                 # judge.mjs + judge-utils.mjs + test.sh
solution/              # reference report + solve.sh
```
