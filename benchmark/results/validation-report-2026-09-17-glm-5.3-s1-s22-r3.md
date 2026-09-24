# GLM-5.3 S1–S22 validation run · round 3 (zero-skill vs with-skill) · 2026-09-17

> Round 3 (final) for GLM-5.3, completing the three recorded rounds, with a judge change in R3. R1: [#235](https://github.com/oh-my-dsh/dsh-plugin-upgrade-skill/pull/235); R2: [#239](https://github.com/oh-my-dsh/dsh-plugin-upgrade-skill/pull/239). Claimed via [#218](https://github.com/oh-my-dsh/dsh-plugin-upgrade-skill/issues/218).

## Setup

- **Solver**: `zai/glm-5.3` in the dsh web harness (in-session subagents, one attempt per task per condition, no score-driven retries). Concurrency 1 (serial) for most of the run, raised to 4 after the second quota window opened; base `e0a9ff5`.
- **Judges**: 44 subagents scoring each report against the sealed `packet.json` rubric and caps with the official `benchmark/report-judge/judge.mjs` SYSTEM contract and deterministic aggregation (pass = 1, partial = 0.5, triggered caps clamp).
- **⚠ Judge-model deviation (important)**: R3 was judged by **`zai/glm-5.3` — the same model as the solver** — because the judging session did not switch models, unlike R1/R2 (and all earlier GLM rounds) which used `glm-5.3-flash` judges. Same-model grading introduces a self-evaluation concern whose magnitude or direction is not measured here, and the judge is not held constant across the three rounds. Cross-round comparisons and the 3-round median inherit this inconsistency; regrading existing R3 reports with the earlier judge could align that part of the protocol, but would not establish independent human validation or eliminate other cross-run differences. No such regrade is included.
- **Execution**: 44/44 reports verified on disk; the benchmark repository stayed clean. One 5-hour API-quota interruption hit during skill S6 — the subagent failed silently and was relaunched exactly once per protocol (no other relaunches).

## Results

| Arm | Total | Mean |
|---|---:|---:|
| zero-skill | **2012.5 / 2200** | 91.5% |
| with-skill | **2157.5 / 2200** | 98.1% |
| skill lift | **+145 (+6.6 pp)** | |

Per-task scores: `artifacts/2026-09-17-glm-5.3-s1-s22-r3/aggregate.json`. Raw reports under `noskill/`, `skill/`; judge verdicts under `judge/{noskill,skill}/`.

- **S17 zero-skill = 0 via triggered cap** (`contradictory-operational-advice`: the judge found the final advice favoring immediate cross-entry registration over `slots.inject` deferral). The cap clamp is the rubric working as designed, but a 0-from-100 single-cell swing dominates the round totals; treat the R3 aggregate with that in mind.
- Other zero-skill shortfalls: S4 (62.5 — located touchpoints without migration directions), S6 (75), S1/S8/S21 (90–95).
- With-skill shortfalls: S3/S11/S18 (90), S5 (87.5).

## GLM-5.3 three-round record

| Round | zero-skill | with-skill | lift |
|---|---:|---:|---:|
| R1 ([#235](https://github.com/oh-my-dsh/dsh-plugin-upgrade-skill/pull/235)) | 2117.5 / 2200 (96.3%) | 2160 / 2200 (98.2%) | +42.5 (+1.9 pp) |
| R2 ([#239](https://github.com/oh-my-dsh/dsh-plugin-upgrade-skill/pull/239)) | 2075 / 2200 (94.3%) | 2145 / 2200 (97.5%) | +70 (+3.2 pp) |
| R3 (this run) | 2012.5 / 2200 (91.5%) | 2157.5 / 2200 (98.1%) | +145 (+6.6 pp) |
| **3-round per-task median** | **2135 / 2200 (97.0%)** | **2170 / 2200 (98.6%)** | **+35 (+1.6 pp)** |

The corrected per-task median lift is **35 / 22 = 1.5909 pp**. Historical Flash (+9.27) and GLM-5.2 (+3.05) summaries are descriptive context, not an independently measured capability ladder. In particular, R1/R2 use a Flash judge while R3 uses GLM-5.3: taking a median does not eliminate this change. The numbers do not establish an inverted-U relationship. R3's S17 pair contributes 100 of the 145 total gain points; excluding that task descriptively leaves 45 / 21 = **2.1429 pp**. This is a sensitivity, not a reason to delete the task or change its original verdict.

## Disclosures / limitations

- Judge model = solver model this round (see ⚠ above); label R3 and the mixed-judge median as supplementary descriptive evidence; a same-family regrade would not constitute independent human validation.
- Round 3 of 3 (n=1 per round); between-round totals moved in both arms (zero-skill 2117.5 → 2075 → 2012.5, with-skill 2160 → 2145 → 2157.5).
- The skill S6 relaunch after the quota interruption followed the pre-registered silent-failure protocol (one relaunch, no selection on score).
- Verdicts live in per-arm subdirectories (flat layout caused cross-arm overwrites in earlier rounds).


## Offline arithmetic correction (2026-09-17)

All 44 verdicts were recomputed using the scoring function and packets at `e0a9ff5`. Half-point values are preserved before aggregation. Original reports and criterion verdicts are unchanged; no new model calls or retries were made.
