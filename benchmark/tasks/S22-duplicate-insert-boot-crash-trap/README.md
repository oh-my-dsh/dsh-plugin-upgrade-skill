# S22 · The Duplicate Insert That Crashed the Boot

Static, read-only. A maintainer upgrades dsh to 0.1.5-alpha.2, finds the right-Sidebar
document tab's content read unavailable, and manually inserts the workspace-files host
service into the profile's `cordis.patch.yml` — causing a fatal boot crash
(`duplicate loader entry id: workspace-files`) because the web-app bundle already
provides the same plugin.

Derived from a real 2026-09-09 dsh 0.1.5-alpha.2 upgrade session on Windows (the
maintainer's Claude Code session diagnosed the Cordis insert-duplication rule, removed
the duplicate, and replaced it with a NOTE comment).

- Type: static / read-only report

- See `instruction.md` for the brief, `solution/report.md` for the reference answer.

## Semantic verifier

- **Scoring**: duplicate-loader attribution, three layering cases, minimal profile fix, plugin/failure boundary, and author/host prevention: 20 each; retaining/adding the duplicate or fixing this crash in plugin code caps at 20.
- **Boundary**: the separate verifier checks the complete fixture against sealed
  hashes; any edit, addition or deletion scores zero. Judge configuration, API or
  response failures exit nonzero with no reward, never a keyword fallback.
- **Oracle**: `harbor run -p benchmark/tasks/S22-duplicate-insert-boot-crash-trap -a oracle`
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
