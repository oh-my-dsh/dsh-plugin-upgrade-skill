# M4-peer-prerelease-range · Legacy Peer Prerelease Range

The agent fixes the `/app/fixture/` plugin whose `@deepseek-ai/dsh-agent` peer/dev
lower bounds are `^0.1.0-rc.8` (rollup R-08 #3). Tests "rewrite the bound to the
target cohort (not `*`) + no peer warnings on install + real cold-boot
activation".

- **Environment**: `node:24-bookworm` + git (fixture committed as a git baseline) + globally installed pnpm@11.24.0 and dsh 0.1.2-alpha.2 (container task; the judge installs the fixture into an isolated profile and reads the install log inside the container).
- **Verifier**: fixture changed (else 0) + static range gate (both peer and dev bounds must cover the 0.1.2-alpha.2 cohort) + real cold boot (`MISSING_CREDENTIAL` without a key: 100 when the bounds are fixed; changed-but-unfixed caps at 40; `dsh plugin add` failed: 30); `*`-style meaningless ranges cap at 40.
- **Boundary declaration**: the R-08 #3 "install warnings disappear after rewriting the bound" signal cannot be reproduced in this harness — the profile's own pnpm graph never contains the host's fallback-provided peers, so pnpm reports unrelated missing peers regardless of the rewritten range. The judge therefore scores the rewritten bounds statically plus a real cold boot.
- **Oracle**: `harbor run -p benchmark/tasks/M4-peer-prerelease-range -a oracle`, expected reward 1.0.

```
environment/fixture/   # test material only (private:true, do not publish)
tests/                 # judge.mjs + judge-utils.mjs + test.sh
solution/              # reference plugin files + solve.sh
```
