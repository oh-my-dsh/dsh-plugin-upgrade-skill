# M5-token-auth-smoke · Self-Built Channel Authentication Smoke (Container Task)

The agent determines whether the plugin's self-built `/ping` channel in
`/app/fixture/` is covered by the dsh 0.1.2 unified token/cookie authentication,
moves the registration behind the host auth if it is not, and proves the result
with a browserless smoke (no-auth request → 401, token-exchanged request → 200)
written to `/app/agent-output/M5-token-auth-smoke/smoke.md`. Tests "channel
authentication + connection registration + browserless smoke". See
[instruction.md](instruction.md) for the task statement and
[tests/judge.mjs](tests/judge.mjs) for the grading logic.

- **Environment**: `node:24-bookworm` + git (the fixture is committed as a git
  baseline to support the migration gate), globally installed dsh 0.1.2-alpha.2 +
  pnpm (shared by the agent and the verifier).
- **Verifier**: checkpoint-graded per
  [tests/checkpoints.json](tests/checkpoints.json) (see
  [checkpoint-grading.md](../../docs/checkpoint-grading.md)): every checkpoint is
  measured twice — once on the pristine trap fixture restored from the git
  baseline, once on the agent's patched fixture — before any points are awarded
  (authed-200 40 / no-auth-401 40 / raw-route-removed 20, cap 60 on the last;
  gates 0/0/0/30/40/40). A drifted trap state stops the judge with a
  baseline-mismatch verdict. The reward is normalized into
  `/logs/verifier/reward.txt` and the structured per-checkpoint ledger is written
  to `/logs/verifier/grading.json`.
- **Oracle**: `harbor run -p benchmark/tasks/M5-token-auth-smoke -a oracle`,
  expected reward 1.0.

```
environment/Dockerfile   # image: git baseline + global dsh 0.1.2-alpha.2
environment/fixture/     # web plugin with a raw /ping route outside the auth gate
tests/                   # checkpoints.json + judge.mjs + judge-utils.mjs + test.sh
solution/                # reference changes (solution/plugin/) + SOLUTION.md + solve.sh
```
