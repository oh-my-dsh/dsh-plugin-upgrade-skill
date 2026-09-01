# S5-negative-naming · Naming Four-State Judgment

The agent read-only-reviews the plugin naming manifest in `/app/fixture/` and writes a judgment report under `/app/agent-output/S5-negative-naming/`; modifying the fixture scores 0. Tests "negative capability + restrained four-state judgment": the official short name `greet` is valid (no compatibility error; prefixes are only collision recommendations), the unprefixed service `search` is a warning not an error, events are shared channels (informational), and an unqueried registry is unknown. Claiming "everything passes / can publish" is the trap.

- **Environment**: `node:24-bookworm` + git (fixture committed as a git baseline for the read-only gate); dsh is not installed (static task).
- **Verifier**: the judge checks fixture zero-change + the four verdicts; the 0-100 score is normalized into `/logs/verifier/reward.txt`.
- **Oracle**: `harbor run -p benchmark/tasks/S5-negative-naming -a oracle`, expected reward 1.0.

```
environment/fixture/   # test material only (private:true, do not publish)
tests/                 # judge.mjs + judge-utils.mjs + test.sh
solution/              # reference report + solve.sh
```
