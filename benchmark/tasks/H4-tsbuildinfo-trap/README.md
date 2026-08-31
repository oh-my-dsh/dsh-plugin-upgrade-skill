# H4-tsbuildinfo-trap · Build Cache False-Positive Trap (Read-Only)

The agent diagnoses a "fully migrated" plugin that reports `MISSING_EXPORT resolveSessionPreset`
at build time while the source has zero references: it must recognize this as a false
positive from stale build artifacts/incremental cache (`lib/index.js` still imports the
deleted export, and `lib/tsconfig.tsbuildinfo` pins the old dependency graph); the
remediation is clean then rebuild with zero source changes. The trap: following the
DSH-0.1.2-A1-21 migration recipe to "fix" a non-existent reference (changing src scores 0
directly). Task statement in [instruction.md](instruction.md), grading logic in
[tests/judge.mjs](tests/judge.mjs).

- **Environment**: `node:24-bookworm` + git (the fixture is committed as a git baseline for the read-only gate); dsh is not installed (this task is static).
- **Verifier**: the judge checks src unchanged + the report covers the three points (false positive identification / clean remediation / no source change needed), normalized 0-100 written to `/logs/verifier/reward.txt`.
- **Oracle**: `harbor run -p benchmark/tasks/H4-tsbuildinfo-trap -a oracle`, expected reward 1.0.

```
environment/fixture/   # cleanly migrated plugin + leftover 0.1.1 build artifacts
tests/                 # judge.mjs + judge-utils.mjs + test.sh
solution/              # reference report + solve.sh
```
