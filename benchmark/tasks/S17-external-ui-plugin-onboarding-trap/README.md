# S17 · External UI Plugin Onboarding Trap

Static, read-only. A user hand-writes a new external web UI plugin and inserts it into a
running web profile (profile node_modules + `cordis.patch.yml` insert). The first boot
kills EVERY plugin's registration with a browser error naming an innocent first-awaited
entry (the real culprit: one raw-ESM client bundle failing the whole classic-script
combo); the repackaged plugin then fails apply on a cross-entry slot declaration; and the
dev loop itself bites (combo assembled once at boot — every edit needs a full host
restart, and on Windows an improper stop leaves the port bound, EADDRINUSE).

Derived from a real 2026-09-04 incident: hand-writing `@lhh010/dsh-profiles` onto a
source-launched dsh 0.1.3-alpha.1 web profile on Windows (misattributed combo failure →
ModuleLoader repackaging → cross-entry slot declaration → tree-kill restart discipline).

- Type: static / read-only report

- See `instruction.md` for the brief, `solution/report.md` for the reference answer.

Run `npm run test:s17-judge` for the task-specific model-free verifier protocol checks (also included
in `npm test`). The verifier only reads agent artifacts; it never installs counter-example
or oracle reports into the answer directory and does not require `/solution/`.

## Semantic verifier

- **Scoring**: whole-combo attribution, diagnosis/packaging, cross-entry slot registration, boot/restart discipline, and host/author prevention: 20 each; affirmative contradictory core operational advice caps at 0.
- **Boundary**: the separate verifier checks the complete fixture against sealed
  hashes; any edit, addition or deletion scores zero. Judge configuration, API or
  response failures exit nonzero with no reward, never a keyword fallback.
- **Oracle**: `harbor run -p benchmark/tasks/S17-external-ui-plugin-onboarding-trap -a oracle`
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
