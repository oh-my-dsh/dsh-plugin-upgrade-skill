# S20-msvc-flock-trap · Windows Install Blocker (Static Read-Only Task)

The agent reads a Windows install-failure evidence kit (error log, dependency
manifest, lock-source excerpts) and diagnoses why `pnpm install` fails on a
machine without Visual Studio Build Tools, then writes a fix plan to
`/app/agent-output/S20-msvc-flock-trap/report.md` that avoids Visual Studio and
upstream changes. The trap: the failing native module (`fs-ext`, pulled by
`@deepseek-ai/dsh-session-persistence-jsonl`) is statically imported, so
`--ignore-scripts` cannot skip it — yet Windows never calls `flock` at runtime
(it locks with a named kernel semaphore), so the least-invasive fix is a pnpm
patch that skips the native build on Windows and provides a pure-JS fallback.
Tests "install-channel root-cause diagnosis + platform lock-path evidence +
patch-mechanism fix planning". See [instruction.md](instruction.md) for the task
statement and [tests/judge.mjs](tests/judge.mjs) for the grading logic.

- **Environment**: `node:24-bookworm` + git (fixture inspection); no dsh
  needed — this is a static report task.

```
environment/Dockerfile   # static evidence image with a Git baseline for inspection
environment/fixture/     # evidence kit: error log, manifest, lock-source excerpts
tests/                   # judge.mjs + packet.json + test.sh + Dockerfile
solution/                # reference report + SOLUTION.md + solve.sh
```

## Semantic verifier

- **Scoring**: native install failure 20; static-import trap 20; platform lock contract 20; reproducible local patch 25; machine/upstream boundaries 10; justified corridor mapping 5. Caps: VS requirement 50, ignore-scripts-only or upstream editing 40, real lock bypass 20.
- **Boundary**: the separate verifier checks the complete fixture against sealed
  hashes; any edit, addition or deletion scores zero. Judge configuration, API or
  response failures exit nonzero with no reward, never a keyword fallback.
- **Oracle**: `harbor run -p benchmark/tasks/S20-msvc-flock-trap -a oracle`
  requires judge configuration and grades the original reference report through
  the same LLM. Its score is not hardcoded.

Task version **4.1.0**, protocol `report-judge-v2`. Each criterion receives
100%/50%/0%/0% for pass/partial/fail/missing; code sums points and applies caps.
Set `REPORT_JUDGE_BASE_URL`, `REPORT_JUDGE_MODEL` and `REPORT_JUDGE_API_KEY`
for the verifier. The agent receives neither these credentials nor the sealed packet.

See the [rubric explanation](../../docs/diagnosis-rubrics.md) and
[setup/maintenance guide](../../docs/report-judge-pilot.md). Edit
`benchmark/report-judge/diagnosis-rubrics.mjs`, run `npm run sync:report-judge`,
then `npm run test:report-judge`. Historical keyword scores remain historical.
