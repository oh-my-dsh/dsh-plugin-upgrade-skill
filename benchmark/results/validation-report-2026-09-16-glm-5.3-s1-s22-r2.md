# GLM-5.3 S1–S22 validation run · round 2 (zero-skill vs with-skill) · 2026-09-16

> Round 2 for GLM-5.3, following round 1 ([#235](https://github.com/oh-my-dsh/dsh-plugin-upgrade-skill/pull/235)). Claimed via [#218](https://github.com/oh-my-dsh/dsh-plugin-upgrade-skill/issues/218). Part of the 3-round median protocol alongside the glm-5.3-flash and glm-5.2 three-round records.

## Setup

- **Solver**: `zai/glm-5.3` in the dsh web harness (in-session subagents, concurrency 2, one attempt per task per condition, no score-driven retries).
- **Base commit**: `e0a9ff5` (all 22 tasks use packet-based LLM report judging; S13/S14/S20 are not keyword-judged).
- **Judges**: `zai/glm-5.3-flash` subagents scoring each report against the sealed `packet.json` rubric and caps, with official deterministic aggregation (pass = 1, partial = 0.5, fail/missing = 0; triggered caps clamp). Judge prompts embed the official `benchmark/report-judge/judge.mjs` SYSTEM contract; verdicts live in per-arm subdirectories (flat layout caused cross-arm overwrites in earlier rounds).
- **Execution**: 44/44 reports verified on disk; the benchmark repository stayed clean. One 5-hour API-quota interruption hit during skill S6/S7 — both subagents failed silently and were relaunched exactly once each per protocol (no other relaunches).

## Results

| Arm | Total | Mean |
|---|---:|---:|
| zero-skill | **2075 / 2200** | 94.3% |
| with-skill | **2145 / 2200** | 97.5% |
| skill lift | **+70 (+3.2 pp)** | |

Per-task scores: `artifacts/2026-09-16-glm-5.3-s1-s22-r2/aggregate.json`. Raw reports under `noskill/`, `skill/`; judge verdicts under `judge/{noskill,skill}/`.

## GLM-5.3 rounds so far

| Round | zero-skill | with-skill | lift |
|---|---:|---:|---:|
| R1 ([#235](https://github.com/oh-my-dsh/dsh-plugin-upgrade-skill/pull/235)) | 2117.5 / 2200 (96.3%) | 2160 / 2200 (98.2%) | +42.5 (+1.9 pp) |
| R2 (this run) | 2075 / 2200 (94.3%) | 2145 / 2200 (97.5%) | +70 (+3.2 pp) |

Both rounds keep lift positive and in the single-digit pp range for glm-5.3, versus +9.3 pp for glm-5.3-flash and +3.0 pp for glm-5.2 (3-round medians). The R1→R2 lift swing (+1.9 → +3.2 pp) describes variability in these recorded rounds. Taking medians cannot remove changes in grading protocols, task exposure, or other confounding; it does not establish a capability ordering.

Per-task notes for this round:

- **S4 remains the largest skill win** (12.5 → 75): the no-skill arm located all four breaking touchpoints but prescribed no migration direction, while the skill arm produced migration plans (with one partial for quoting a wrong loader id and one unconfirmed API mapping).
- No-skill shortfalls beyond S4: S1 (95), S6 (87.5 — retention-vs-filtering distinction partial), S8/S18 (90).
- With-skill shortfalls: S3 (90 — slot-registration partial), S21 (90 — manifest-count discrepancy unaddressed); everything else 100.
- S8 stays at 90 in both arms this round (R1: 80 both arms).

## Disclosures / limitations

- Round 2 of 3 (n=1 per round); between-round totals moved in both arms (noskill −42.5, skill −15), so single-round numbers should not be read as stable model scores.
- Judge model (glm-5.3-flash) differs from the solver (glm-5.3) — same family, so same-family correlation bias remains possible; independent scoring review remains necessary.
- The skill S6/S7 relaunches after the quota interruption are disclosed above; relaunch followed the pre-registered silent-failure protocol (one relaunch, no selection on score).


## Offline arithmetic correction (2026-09-17)

All 44 verdicts were recomputed using the scoring function and packets at `e0a9ff5`. Half-point values are preserved before aggregation. Original reports and criterion verdicts are unchanged; no new model calls or retries were made.
