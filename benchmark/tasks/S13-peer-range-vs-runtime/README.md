# S13-peer-range-vs-runtime · Peer range vs runtime reality (read-only)

A TUI plugin's peerDependencies claim ^0.1.2-alpha.2 (npm installs without warnings, the
range is satisfied by dsh alpha.5), but it crashes at runtime because dsh alpha.4 removed
Session.events and replaced it with on-demand read APIs. The agent must distinguish
semver-range satisfaction from runtime API compatibility. 题面见 [instruction.md](instruction.md)，
判分逻辑见 [tests/judge.mjs](tests/judge.mjs)。

- **Environment**: `node:24-bookworm` + git (fixture inspection; the verifier uses sealed hashes).

Fixture provenance: trimmed from a real 2026-09-02 incident (dsh-tui beta.4 on dsh alpha.5,
author's own session).

## Semantic verifier

- **Scoring**: removed API/crash, peer-check boundary, two distinct breakage categories, author prevention, and pre-install checks: 20 each; claiming peers prove runtime compatibility caps at 20.
- **Boundary**: the separate verifier checks the complete fixture against sealed
  hashes; any edit, addition or deletion scores zero. Judge configuration, API or
  response failures exit nonzero with no reward, never a keyword fallback.
- **Oracle**: `harbor run -p benchmark/tasks/S13-peer-range-vs-runtime -a oracle`
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
