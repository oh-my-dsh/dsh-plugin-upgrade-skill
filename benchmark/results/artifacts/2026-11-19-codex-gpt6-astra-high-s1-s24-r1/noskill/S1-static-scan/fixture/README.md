# S1 fixture · Static fixture of the seven touchpoints (S1-specific copy)

This is a verbatim copy of `skills/plugin-upgrade/examples/legacy-plugin/` (except this README), used by the benchmark task S1-static-scan: the agent must perform a **read-only** touchpoint scan of it. It is not an installable plugin; it is a test fixture — **do not execute or publish it**; that it cannot be compiled is by design.

- This task's grading requires the fixture to be unchanged relative to git HEAD; modifying/adding/deleting any file scores 0 for the task.
- This directory does not take part in the touchpoint positive-sample validation of the repository's `node scripts/validate.mjs` (the validator only reads the original fixture under `skills/`).

| Touchpoint | Hit location |
|---|---|
| #1 Source patch | cordis.patch.yml · patch.yml · scripts/apply-patch.mjs |
| #2 Internal/persistent events | src/index.ts · external informational SessionEvent producer |
| #3 Internal service/Remote | src/index.ts · `ctx.get('apiProxy')` |
| #4 Host filesystem | src/index.ts · fixed `~/.dsh/profiles/default` |
| #5 Internal UI/commands | src/index.ts · internal import + `registerCommand` |
| #6 Custom channel | src/index.ts · loopback HTTP `/api/legacy` |
| #7 Subprocess/output | src/index.ts · scripts/apply-patch.mjs · wrong assumption that stdout is JSONL |
