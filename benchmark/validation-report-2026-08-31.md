# benchmark v2 (Harbor format) validation report · 2026-08-31

End-to-end validation of the 2026-08-31 Harbor format rework (commit `db53236`):
**the oracle actually ran all 6 tasks, scoring reward 1.0 everywhere, with 0
anomalies.**

## Environment

- Harbor CLI 0.22.0 (`uv tool install harbor`)
- Docker Desktop server 28.5.1 (macOS, local provider)
- Each task image: `node:24-bookworm` + git; container tasks (M/H) globally install
  `pnpm@11.24.0 @deepseek-ai/dsh@0.1.2-alpha.2` (the same steps as section 6 of the v1
  report)

## How to reproduce

```sh
uv tool install harbor
harbor run -p benchmark/tasks -a oracle -y
# expected: 6/6 Mean: 1.000
```

## Results summary

| Task | reward | Key judge evidence |
|---|---|---|
| S1-static-scan | 1.0 | report hit all 6 expected cards (including the corridor folding A1-02+A2-01), fixture unchanged |
| S2-negative-scan | 1.0 | A1-01 mapping + zero-hit categories accounted for + zero hits ≠ compatibility + verification statement |
| M1-host-migration | 1.0 | `dsh plugin add` succeeded → headless cold-boot activation (MISSING_CREDENTIAL reached the application layer) |
| H1-plane-trap | 1.0 | not misled by the misleading comment (`inject llm`) → plugin tree activated with no pending |
| H2-baseline-trap | 1.0 | report correctly attributed the pre-existing failure (+60) + cold-boot activation (+40) + pre-existing test not quietly fixed |
| H3-client-plane | 1.0 | `dsh.client` declared fully (+40) + add (+10) + web cold boot without pending (+10) + `__DSH_BOOT__.entries` contains this plugin (+40) |

Raw trial output (the judge's per-item reasons, verifier logs) is in
`jobs/oracle-verify/2026-08-31__15-35-29/`, viewable with `harbor view jobs/oracle-verify`
(that directory is gitignored).

## What this validation covers

- What this validates is **harness correctness** (whether the environment, grading,
  and oracle pipeline work end to end after the format rework), not the skill's
  effect; the skill's effect is still measured with the README's with/without-skill
  comparison.
- The container tasks' real dsh install, plugin activation, web cold boot, and
  `__DSH_BOOT__` roster recognition all actually ran inside the containers — not
  simulated.
- Not covered: real agents (non-oracle) running tasks and the multi-trial noise
  distribution — before the official evaluation, run one smoke round with a real
  agent on a container task (e.g. M1).

## Issues found and fixed along the way

1. **Image build failed: git has no identity**. The Dockerfile's baseline commit
   `git commit -m "baseline"` fails in the build environment with "Author identity
   unknown". Fix: `git -c user.email=bench@local -c user.name=bench commit`
   (applied uniformly to all 6 tasks).
2. The run-output directory `jobs/` was added to `.gitignore`.

## Conclusion

**The Harbor format rework passes validation.** The self-contained environment (each
task ships its own dsh) + in-container judge + oracle reference-answer pipeline all
work, and the v1 dependency on the external `dsh-verify` container is confirmed fully
removed.
