# S21 · The Resource Service That "Unavailable" Trap

Static, read-only. A dsh in-place upgrade (0.1.5-alpha.1 → 0.1.5-alpha.2, npm global,
Windows, profile created under 0.1.2/0.1.3) leaves exactly one thing broken: the
right-Sidebar document tab opens for a session file (the claim/registration layer works)
but the content read fails with 「文件资源服务不可用。」 while everything else — including a
different reader of the same file — works.

Derived from a real 2026-09-09/10 session on this deployment. The trap has three layers:

1. the failure is in the resource-metadata delivery chain
   (`useResource('file', …)` → the `file` provider registered by
   `@deepseek-ai/dsh-api-workspace-files`' client half → the `workspaceFiles.stat` RPC →
   the host WorkspaceFiles service), NOT in the plugin's render code — the tab opening
   proves the claim layer works;
2. the console is noisy with an UNRELATED plugin's warnings (`dsh-paste-input: fold
   skipped (parse failed)` — a separate end-marker spelling bug, fixed in paste-input
   v0.1.24) that invites conflating the two issues;
3. the fix is not in the plugin at all: no rewrite, retry, fallback, or "repair" of the
   unavailable service — the decision order is restart → rollback → report upstream.

- Type: static / read-only report

- See `instruction.md` for the brief, `solution/report.md` for the reference answer.

## Semantic verifier

- **Scoring**: metadata-chain attribution, valid probes/partitioning, distractors/tab scope, ordered mitigation, and upstream forensics/fail-loud diagnostics: 20 each; invalid probe attribution or plugin workaround/duplicate insertion caps at 40.
- **Boundary**: the separate verifier checks the complete fixture against sealed
  hashes; any edit, addition or deletion scores zero. Judge configuration, API or
  response failures exit nonzero with no reward, never a keyword fallback.
- **Oracle**: `harbor run -p benchmark/tasks/S21-resource-service-unavailable-trap -a oracle`
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
