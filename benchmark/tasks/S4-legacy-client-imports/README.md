# S4-legacy-client-imports · Legacy Client Runtime Touchpoints

The agent read-only-scans the legacy dsh 0.1.1-rc.2 Web Client plugin in `/app/fixture/` and writes a migration report under `/app/agent-output/S4-legacy-client-imports/`; modifying the fixture scores 0. Tests "find all four cards (DSH-0.1.2-A1-25 / A1-26 / A1-27 / A1-30) + read-only discipline + no fabricated cards".

- **2026-08-31 calibration note**: in closed-book runs, agents fabricate "upgrade cards" (e.g. an apply-lifecycle replacement or inject-moved-to-manifest that never happened) — the judge caps such deterministic hallucinated assertions at 70.
- **Environment**: `node:24-bookworm` + git (fixture committed as a git baseline for the read-only gate); dsh is not installed (static task).
- **Verifier**: the judge checks fixture zero-change + the four cards in the report; the 0-100 score is normalized into `/logs/verifier/reward.txt`.
- **Oracle**: `harbor run -p benchmark/tasks/S4-legacy-client-imports -a oracle`, expected reward 1.0.

```
environment/fixture/   # test material only (private:true, do not publish)
tests/                 # judge.mjs + judge-utils.mjs + test.sh
solution/              # reference report + solve.sh
```
