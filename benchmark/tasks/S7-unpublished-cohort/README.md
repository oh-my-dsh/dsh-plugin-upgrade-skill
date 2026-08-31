# S7-unpublished-cohort · Unpublished Cohort Install Plan

The agent read-only-analyzes a plugin pinning `@deepseek-ai/dsh-llm ^0.1.2-alpha.1` (never published) and writes an install/type-baseline plan under `/app/agent-output/S7-unpublished-cohort/`; modifying the fixture scores 0. Tests "registry check first + two legitimate paths (GitHub-tag tarball overrides / exact pin to the published 0.1.2-alpha.2 + lockfile) + discipline (no package-manager switching)". The closed-book bonus point is recognizing that `^0.1.2-alpha.1` silently resolves to `0.1.2-alpha.2` (declaration/result divergence); prescribing a direct install of alpha.1 caps the score at 10.

- **Environment**: `node:24-bookworm` + git (fixture committed as a git baseline for the read-only gate); dsh is not installed (static task).
- **Verifier**: the judge checks fixture zero-change + the four report points; the 0-100 score is normalized into `/logs/verifier/reward.txt`.
- **Oracle**: `harbor run -p benchmark/tasks/S7-unpublished-cohort -a oracle`, expected reward 1.0.

```
environment/fixture/   # test material only (private:true, do not publish)
tests/                 # judge.mjs + judge-utils.mjs + test.sh
solution/              # reference report + solve.sh
```
