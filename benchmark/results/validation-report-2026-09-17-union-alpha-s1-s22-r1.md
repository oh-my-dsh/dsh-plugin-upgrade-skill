# Union Alpha S1–S22 validation run · round 1 (zero-skill vs with-skill) · 2026-09-17

> First paired run for the anonymous internal-beta model `stealth/union-alpha` (OpenRouter), adding a seventh configuration to the historical paired record. Claimed via [#218](https://github.com/oh-my-dsh/dsh-plugin-upgrade-skill/issues/218) (claim comment skipped during execution due to harness issues; documented in the run manifest).

## Setup

- **Solver**: `openrouter/stealth/union-alpha` in the dsh web harness (in-session subagents, single attempt per task per condition, no score-driven retries). Base commit `f8ab014` (task/skill inputs identical to `e0a9ff5` for the S-pool; verified in the manifest's repository observations).
- **Model provenance**: anonymous internal-beta via OpenRouter; 256K context; token pricing 0 at run time; knowledge cutoff, parameter count, and training data undisclosed; snapshot date 2026-09-17. The model may change or disappear without notice, so this row is pinned to its snapshot date.
- **Judges**: 44 `zai/glm-5.3-flash` subagents against the sealed `packet.json` rubrics with the official SYSTEM contract and deterministic aggregation — the same canonical judge as every other GLM-family row.
- **Execution**: frequent API reconnects and several subagent failures; all retries, recoveries, and re-dispatches (with agent ids) are recorded in `run-manifest.json` (`execution_events`, `retry_summary`, `final_integrity_audit`). Final integrity audit: all 44 reports re-read and SHA-256 fingerprinted, unchanged, >20 lines, endings intact, no relative .md links.

- **Identity disclosed after the run (2026-09-18)**: `stealth/union-alpha` was claimed by Unbiased (unbiased.ai) — the model is **Pareto** (Pareto 26.9 / Pareto 262K, a composite model routing several frontier and open models per request; now paid as `openrouter/unbiased/pareto`). All data in this run was collected during the anonymous free stealth window on 2026-09-17; scores and judging are unchanged — this note corrects provenance only. Two interpretive consequences: (1) the high baseline reads as "that service on that day", not a single underlying model's capability; (2) composite-routing policy and capacity may differ from the paid release, so non-reproducibility is stronger than for a typical row.

## Results

| Arm | Total | Mean |
|---|---:|---:|
| zero-skill | **2158 / 2200** | 98.1% |
| with-skill | **2190 / 2200** | 99.5% |
| skill lift | **+32 (+1.5 pp)** | |

Per-task scores: `artifacts/2026-09-17-union-alpha-s1-s22-r1/aggregate.json`. Raw reports under `noskill/`, `skill/`; judge verdicts under `judge/{noskill,skill}/`.

- **Highest no-skill baseline recorded on this pool** (98.1%, vs glm-5.2's 93.3% median): with only ≈1.9 pp of headroom left, the skill recovers +1.5 pp of it (~77% headroom conversion). The small absolute lift is consistent with the ceiling reading of the top end of the historical pattern, not with skill failure.
- Shortfalls: noskill S1 (95, limits criterion partial), S6 (75), S8 (90), S20 (95); with-skill S18 (90, timer-liveness partial). Everything else 100.
- Descriptive context: union-alpha without the skill (98.1%) outscores every with-skill arm recorded so far except its own (glm-5.3-flash with-skill median 87.0; glm-5.2 96.4; glm-5.3 99.5) — as with the earlier glm-5.2 observation, this is unpaired and protocol-confounded, reported as context only.

## Disclosures / limitations

- Single round (n=1), single-shot per condition; no repeat-run variance estimate.
- Anonymous internal-beta model: identity, capability lineage, and stability are unverifiable; results are pinned to the 2026-09-17 snapshot and may not reproduce.
- Judge (glm-5.3-flash) differs from the solver family (union-alpha, anonymous) — no same-family correlation here, but the judge's calibration on union-alpha writing style is unmeasured.
- Frequent API reconnects during solving; the retry ledger in `run-manifest.json` is part of the record (one-off re-dispatches, never score-driven).
- This run is a new configuration point, not part of any pre-registered plan; it does not enter any median or the main paired table without an explicit protocol decision.
