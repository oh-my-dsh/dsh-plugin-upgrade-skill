# S3-snapshot-migration · Snapshot Read-Surface Migration Assessment (Read-Only)

The agent assesses read-only the browser pet plugin from the 0.1.1-rc.1 era under `/app/fixture/`, mapping the snapshot read surface (flat `ConversationSnapshot` → views/legacy projection, the `useSession` lifecycle seat, the `@deepseek-ai/cordis` type-import replacement, `slots.inject` registration) to DSH-0.1.2-A1-03, and writes the report under `/app/agent-output/S3-snapshot-migration/`.
Task brief: [instruction.md](instruction.md); grading logic: [tests/judge.mjs](tests/judge.mjs).

- **Environment**: `node:24-bookworm` + git (the fixture is committed as a git baseline to enforce the read-only gate), no dsh installed (this task is static).
- **Verifier**: judge checks fixture zero-change + the report hitting all five points at 20 points each, normalized 0-100 into `/logs/verifier/reward.txt`.
- **Oracle**: `harbor run -p benchmark/tasks/S3-snapshot-migration -a oracle`, expected reward 1.0.

```
environment/fixture/   # 0.1.1 snapshot-surface browser plugin (trimmed from real pre-migration code)
tests/                 # judge.mjs + judge-utils.mjs + test.sh
solution/              # reference report + solve.sh
```
