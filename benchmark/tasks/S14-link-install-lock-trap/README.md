# S14 · Link-Install File-Lock Trap

Static, read-only. A link-installed (junction) lib-only Web plugin is edited in its repo;
the maintainer then (a) refreshes only the browser and sees stale code, (b) tries to
Copy-Item the new files into the profile's node_modules and hits EBUSY, (c) attempts a
rename-aside recovery that leaves BOTH the repo and the profile with no entry files
(both paths resolve to the same directory through the junction).

Derived from a real 2026-09-03 dsh-paste-input v0.1.17 verification session
(hover-preview feature rollout).

- Type: static / read-only report

- See `instruction.md` for the brief, `solution/report.md` for the reference answer

## Semantic verifier

- **Scoring**: junction deployment, host locks/client cache, rename recovery, ordered activation, and install-mode preflight: 20 each; copying onto the junction or browser-only host activation caps at 40.
- **Boundary**: the separate verifier checks the complete fixture against sealed
  hashes; any edit, addition or deletion scores zero. Judge configuration, API or
  response failures exit nonzero with no reward, never a keyword fallback.
- **Oracle**: `harbor run -p benchmark/tasks/S14-link-install-lock-trap -a oracle`
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
