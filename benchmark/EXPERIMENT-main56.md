# Main-56 experimental grading version

This branch (`experiment/main56-v2`) is an experimental proposal. Do not merge it
into main until the scoring changes and task admission have been reviewed.
Main retains the existing graders and historical experiment reports.

## Score compatibility

- S1/S2/S3/S4/S6 use diagnostic rules instead of citation credit.
- M6–M12, H14–H19 and H8 exclude citation points from primary scores and normalize
  the remaining 95 points to 100, preserving percentage caps.
- All 56 wrappers distinguish valid candidate zeros from verifier errors. An
  infrastructure error has no reward and must be investigated, not averaged as 0.

New scores are not directly interchangeable with historical scores. Preserve
each run's exact commit, task inventory, condition and grader version. Existing
reports remain evidence under their original protocols; this branch does not
recalculate or replace them. A later rescore of retained answers must be labeled
as a separate analysis, not a fresh solver run.

## Status and evidence

No new model experiments have run. The proposed four conditions are
[prepared, not frozen](conditions/main-56/README.zh-CN.md). See the
[fix summary](../paper/audit/main-56-grading-fix.zh.md) for 20 static task probes,
four runtime oracle/nop controls and remaining admission work.

A first paired GLM-5.3-Flash solver run over both branches (2026-09-12,
Harbor-protocol local replication, upgrade-only condition) is recorded in
[validation-report-2026-09-12-main56-vs-main-glm53flash.md](results/validation-report-2026-09-12-main56-vs-main-glm53flash.md).
It confirms the verifier-error separation (H9) but surfaces a grading
compatibility defect that blocks adoption: H23's graders accept only their own
branch's expected declaration shape and zero the other branch's perfect answer.

Only aggregate evidence is versioned here. Detailed duplicate probe files remain
in the local backup. The standalone
[static probe script](../paper/audit/scripts/probe-static-graders.mjs) can regenerate
per-input artifacts in a disposable Node 24 container with a fresh output folder.

Validation: `npm test`; material checksums are checked separately from within
`benchmark/conditions/main-56` using `shasum -a 256 -c manifest.sha256` and
`shasum -a 256 -c artifact-checksums.sha256`.
