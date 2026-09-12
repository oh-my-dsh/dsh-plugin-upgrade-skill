# S16 · Self-Host Upgrade Trap

Static, read-only. An agent session running INSIDE the dsh host executes the global
`npm install -g @deepseek-ai/dsh@<new>` as a tool call: npm removes/replaces the very
package tree the session's own process runs from, the GUI dies mid-call, and the
interrupted install leaves the package content present but the `dsh`/`dsh.cmd` shims
never regenerated — the CLI itself is gone until an external pinned reinstall repairs it.

Derived from a real 2026-09-03 dsh 0.1.2-alpha.5 → 0.1.2-rc.1 upgrade incident (agent
session killed its own host mid-install; repaired externally).

- Type: static / read-only report

- See `instruction.md` for the brief, `solution/report.md` for the reference answer

## Semantic verifier

- **Scoring**: self-host failure, interrupted-install signature, external pinned repair, handoff protocol, and guard/post-upgrade checks: 20 each; self-host execution caps at 20 and manual shim repair at 40.
- **Boundary**: the separate verifier checks the complete fixture against sealed
  hashes; any edit, addition or deletion scores zero. Judge configuration, API or
  response failures exit nonzero with no reward, never a keyword fallback.
- **Oracle**: `harbor run -p benchmark/tasks/S16-self-host-upgrade-trap -a oracle`
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
