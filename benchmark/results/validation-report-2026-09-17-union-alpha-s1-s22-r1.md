# Union Alpha S1–S22 validation run · round 1 (zero-skill vs with-skill) · 2026-09-17

> First paired run for the anonymous internal-beta model `stealth/union-alpha` (OpenRouter), adding a seventh configuration to the historical paired record. Claimed via [#218](https://github.com/oh-my-dsh/dsh-plugin-upgrade-skill/issues/218) (claim comment skipped during execution due to harness issues; documented in the run manifest).

## Setup

- **Solver**: `openrouter/stealth/union-alpha` in the dsh web harness (in-session subagents, single attempt per task per condition, no score-driven retries). Base commit `f8ab014` (task/skill inputs identical to `e0a9ff5` for the S-pool; verified in the manifest's repository observations).
- **Model provenance**: anonymous internal-beta via OpenRouter; 256K context; token pricing 0 at run time; knowledge cutoff, parameter count, and training data undisclosed; snapshot date 2026-09-17. The model may change or disappear without notice, so this row is pinned to its snapshot date.
- **Judges**: 44 `zai/glm-5.3-flash` subagents against the sealed `packet.json` rubrics with the official SYSTEM contract and deterministic aggregation — the same canonical judge as every other GLM-family row.
- **Concurrency**: serial (1) for the pilot and the start of the full run; raised to a cap of 2 by user directive at 07:57Z (`concurrency_policy_update`), which is the `concurrency: 2` recorded at the top level of the manifest.
- **Execution**: frequent API reconnects and several subagent failures; all retries, recoveries, and re-dispatches (with agent ids) are recorded in `run-manifest.json` (`execution_events`, `retry_summary`, `final_integrity_audit`). Final integrity audit: all 44 reports re-read and fingerprinted (SHA-256 over the normalised line text returned by the read tool, joined with LF — not a raw-file byte hash), unchanged, >20 lines, endings intact, no relative .md links.

- **Identity disclosed after the run (2026-09-18)**: `stealth/union-alpha` was claimed by Unbiased (unbiased.ai) — the model is **Pareto** (Pareto 26.9 / Pareto 262K, a composite model routing several frontier and open models per request; now paid as `openrouter/unbiased/pareto`). All data in this run was collected during the anonymous free stealth window on 2026-09-17; scores and judging are unchanged — this note corrects provenance only. Two interpretive consequences: (1) the high baseline reads as "that service on that day", not a single underlying model's capability; (2) composite-routing policy and capacity may differ from the paid release, so non-reproducibility is stronger than for a typical row.

## ⚠ Input-exposure disclosure (read before using these numbers)

The run manifest records that several cells did not run under a clean input boundary. These cells were judged as-run and are **not** rescored or rerun; they are flagged here and in `aggregate.json` (`notes`).

| Task | Arm | Exposure | Source in `run-manifest.json` |
|---|---|---|---|
| S1 | zero-skill | report cites three `skills/plugin-upgrade/references/*` cards | `methodology_observations`, `pilot_gate` |
| S2 | zero-skill | report cites `skills/plugin-upgrade/references/*` (pre-flight patterns, alpha.1 card) | `pilot_gate` |
| S3 | zero-skill | solver read `SKILL.md` and reference cards (disclosed in the report) | `contamination_log`, `report_validation` |
| S17 | zero-skill | solver consulted locally installed package sources beyond the fixture | `methodology_observations` |
| S20 | zero-skill | solver broadened search beyond the fixture; exact paths not established | `methodology_observations` |
| S8 | with-skill | a broad grep returned snippets of benchmark solutions, judges and earlier reports; parent did not verify which | `contamination_log` |

The zero-skill wrapper for S1–S3 did not prohibit reading the skill folder; the restriction was only added from S4 (`protocol_amendments.noskill-s4-input-restriction`). The zero-skill arm is therefore **not one unchanged protocol**: S1–S3 had the skill's reference material available, which is exactly the treatment the arm is meant to withhold.

For a clean paired comparison, the six affected tasks are excluded from **both** arms (paired exclusion), leaving 16 tasks.

## Results

| Arm | As run, 22 tasks | Mean | Paired clean subset, 16 tasks (S1/S2/S3/S8/S17/S20 excluded) | Mean |
|---|---:|---:|---:|---:|
| zero-skill | **2157.5 / 2200** | 98.1% | **1575 / 1600** | 98.4% |
| with-skill | **2190 / 2200** | 99.5% | **1590 / 1600** | 99.4% |
| skill lift | **+32.5 (+1.48 pp)** | | **+15 (+0.94 pp)** | |

Totals preserve rubric half-points and recompute exactly from the 44 verdict files with `scoreDecisions` (`benchmark/report-judge/judge.mjs`). An earlier version of this report rounded S20 zero-skill (97.5) to 98, giving 2158 / +32; corrected 2026-09-24, verdicts unchanged.

Per-task scores: `artifacts/2026-09-17-union-alpha-s1-s22-r1/aggregate.json`. Raw reports under `noskill/`, `skill/`; judge verdicts under `judge/{noskill,skill}/`.

- **High no-skill baseline, with caveats.** As run, 98.1% is the highest single-round zero-skill total recorded on this pool (best GLM single round: glm-5.3 R1, 96.3%; glm-5.3 three-round per-task median 96.0% with the flash-rejudged R3 from [#245](https://github.com/oh-my-dsh/dsh-plugin-upgrade-skill/pull/245), 97.0% with the original same-model R3; glm-5.2 median 93.3%). But three of the zero-skill cells had skill reference material available and two more searched beyond the fixture, so the as-run figure overstates a clean zero-skill baseline. On the 16-task paired clean subset it remains high (98.4%, vs 96.4% for glm-5.3 R1 and 95.5% / 96.9% for the glm-5.3 medians on the same 16 tasks). This is one round (n=1) of a composite routing service on one day, so "highest" is descriptive, not a ranking.
- Headroom: as run the skill recovers 32.5 of 42.5 remaining points (~76%); on the clean subset 15 of 25 (60%). The small absolute lift is consistent with a ceiling effect, not evidence of skill failure; it is too small and too unreplicated to say more.
- Shortfalls (as run): zero-skill S1 (95, `limits` partial), S6 (75, two partials), S8 (90, `frozen-runtime-remedy` partial), S20 (97.5, `corridor-mapping` partial on a 5-point criterion); with-skill S18 (90, timer-liveness partial). Everything else 100. Shortfalls sum to 42.5 (zero-skill) and 10 (with-skill), matching the totals above.
- Descriptive context (unpaired, protocol-confounded): union-alpha zero-skill (98.1% as run; 98.4% clean subset) exceeds the with-skill three-round medians of glm-5.3-flash (87.0%) and glm-5.2 (96.4%), but **not** glm-5.3's — 99.5% with the flash-rejudged R3 ([#245](https://github.com/oh-my-dsh/dsh-plugin-upgrade-skill/pull/245)) or 98.6% with the original same-model R3. The two glm-5.3 figures differ only in which judge scored round 3; the comparison is reported as context only.

## Disclosures / limitations

- Input exposure in six cells (see the disclosure table above); as-run totals include them, the paired clean subset excludes those tasks from both arms.
- Single round (n=1), single-shot per condition; no repeat-run variance estimate.
- Anonymous internal-beta model: identity, capability lineage, and stability are unverifiable; results are pinned to the 2026-09-17 snapshot and may not reproduce.
- Judge (glm-5.3-flash) differs from the solver family (union-alpha, anonymous) — no same-family correlation here, but the judge's calibration on union-alpha writing style is unmeasured.
- Frequent API reconnects during solving; the retry ledger in `run-manifest.json` is part of the record (one-off re-dispatches, never score-driven).
- This run is a new configuration point, not part of any pre-registered plan; it does not enter any median or the main paired table without an explicit protocol decision.
