# S18 fixture · Terminal sprite render trap evidence pack (static)

Evidence for the S18-terminal-sprite-render-trap task: the renderer code as it shipped,
the user-visible symptom log, the frame digest report, and the CI hang evidence.
**Read-only fixture - do not execute or publish anything here**; the task grading requires
this directory to be unchanged relative to git HEAD.

- `renderer-excerpt.ts` - the half-block sprite renderer exactly as it shipped
- `symptom-log.txt` - the user-visible symptoms (positions of phantom/ghost pixels)
- `frames-digest-report.txt` - per-frame digest comparison against the source art
- `ci-hang-evidence.txt` - the CI job that hung after the feature flipped default-on
