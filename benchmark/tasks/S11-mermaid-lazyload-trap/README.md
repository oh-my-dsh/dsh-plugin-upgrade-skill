# S11-mermaid-lazyload-trap · Mermaid lazy-load trap (read-only)

A lib-only plugin adds mermaid to its reading mode via a lazy chunk and hits three real
incidents: (1) default code-splitting produces sibling chunk files whose relative imports 404;
(2) the host route's `startsWith` containment guard returns 403 on Windows (realpathSync
lower-cases the drive letter) while Linux CI passes; (3) Ctrl+scroll under the zoom modal fires
both the modal zoom and the pane's font sizing. The agent derives each mechanism from the
evidence and produces fixes + regression coverage. 题面见 [instruction.md](instruction.md)，
判分逻辑见 [tests/judge.mjs](tests/judge.mjs)。

- **Environment**: `node:24-bookworm` + git (fixture inspection; the verifier uses sealed hashes); no dsh (static task).

```
environment/fixture/   # evidence pack: host route source, console captures, CI note
tests/                 # judge.mjs + packet.json + test.sh + Dockerfile
solution/              # reference report + solve.sh
```

Fixture provenance: trimmed from the real 2026-09-01 dsh-file-trace mermaid integration
(v0.2.3/v0.2.4); companion skill `skills/plugin-heavy-dep/` (method-level checklist).

## Semantic verifier

- **Scoring**: split-chunk attribution, Windows containment attribution, safe route fix, modal event ownership, and incident regressions: 20 each; unsafe containment caps at 40.
- **Boundary**: the separate verifier checks the complete fixture against sealed
  hashes; any edit, addition or deletion scores zero. Judge configuration, API or
  response failures exit nonzero with no reward, never a keyword fallback.
- **Oracle**: `harbor run -p benchmark/tasks/S11-mermaid-lazyload-trap -a oracle`
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
