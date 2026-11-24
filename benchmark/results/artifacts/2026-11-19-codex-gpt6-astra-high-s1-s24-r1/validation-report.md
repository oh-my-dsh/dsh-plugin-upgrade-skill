# Codex + GPT-6 Astra (high) · S1-S24 paired run · 2026-11-19 → 2026-11-24

**Skill arm: 24/24 tasks, mean 100.00/100 (perfect sweep). Noskill arm: mean 93.23/100.**
Skill effect on the paired design: **+6.77 mean points**, fully concentrated in card-mapping/knowledge-transfer criteria.

## Provenance

- Run artifacts: `benchmark/results/artifacts/2026-11-19-codex-gpt6-astra-high-s1-s24-r1/` (solver manifest `run-manifest.json`, commit `4f43522`)
- Solver: Codex native subagents, `openai/gpt-6-astra`, effort **high**; paired design — plugin-upgrade skill supplied to the skill arm only; no supplied skills for the noskill arm
- Judging: **in-session GLM-5.3 judge subagents + judge-drive.mjs (report-judge-v2)** per the deferred-judging handover; 48/48 cells judged (6 judge subagents, 2 respawned after mid-run failures), sealed rubrics from `benchmark/report-judge/rubrics.mjs`
- Verdicts: `judge-out/*.json` (48 files); aggregate: `judge-results.json`; 0 invalid cells, 0 triggered caps

## Per-task scores

| Task | skill | noskill | Δ |
|---|---:|---:|---:|
| S1-static-scan | 100 | 60 | +40 |
| S2-negative-scan | 100 | 80 | +20 |
| S3-snapshot-migration | 100 | 40 | +60 |
| S4-legacy-client-imports | 100 | 87.5 | +12.5 |
| S6-corridor-net-state | 100 | 75 | +25 |
| S20-msvc-flock-trap | 100 | 95 | +5 |
| all other 18 tasks | 100 | 100 | 0 |

## Reading

- **Skill arm perfect sweep (2400/2400)** — first 100% full-S-series result in the archive.
- Noskill losses concentrate exactly where the skill is knowledge-transfer: S3 (migration-surface knowledge: legacy projection/useSession/cordis imports → 40), S1 (card mapping across seven touchpoints → 60), S6 (corridor informational-marker semantics → 75), S2 (card mapping refusal → 80). Incident-diagnosis tasks (S11-S24 traps) are fully solved without the skill — model strength covers them.
- All judge caps (red-line triggers) stayed false across 48 cells.

## Comparability caveats

- Judged by in-session GLM-5.3 subagents against sealed rubrics; historical runs used other judge models — do not mix scores across judge generations.
- Solver environment: native Windows Codex subagents (no Docker isolation); see manifest limitations.
