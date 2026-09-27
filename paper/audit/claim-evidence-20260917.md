# Manuscript claim-to-evidence map — updated 2026-09-24

All paths are repository-relative. Original scores are immutable inputs; targeted review replacements are separately labelled sensitivity analyses.

| Manuscript claim | Source | Boundary / reproduction |
|---|---|---|
| Five historical paired effects | `benchmark/results/paired-effect-stats.json` | `npm run check:paper-paired`; heterogeneous scales, no pooling or capability curve |
| Historical GLM rounds / leave-one-out | `benchmark/results/glm-pair-stability.json` | Existing stability analysis; model/judge confounds persist |
| Focal 16×2×2, original +4.9219 | `benchmark/results/artifacts/2026-09-15-glm-5.3-flash-unified-s16/{aggregate,paired-analysis}.json` | Equal task weights; static reward, not execution success |
| 64 report hashes, 328 original criteria | Same archive; `benchmark/scripts/audit-unified-evidence.mjs --check` | Two documented link rewrites; validates traceability/arithmetic, not semantic correctness |
| Fixed paired review, 10 answers / 56 criteria | `paper/audit/output-review-20260917/{selection,verdicts}.json`; archive `targeted-human-review.json` | Frozen selection commit 181aef9; initial non-blind AI-assisted review followed by author-reported human checking; one overlap deduplicated; no independent item-level human agreement dataset |
| All three endpoint sensitivities | `paper/generated/submission-evidence.json` | `node paper/scripts/summarize-submission-evidence.mjs --check`; unchanged unreviewed cells |
| S11 parent path counterexample | Archive targeted review + evidence audit script | Predicate defect only; no complete exploit claim |
| Focal token/duration fields | Archive `execution-log.jsonl` | 64 formal cells only; tokens unspecified, durations summed not parallel wall time |
| Historical resource totals | `benchmark/results/artifacts/2026-09-11-glm-5.3-flash-s1-s22/usage-summary.json` | Same submission summary script; 22 sessions per arm; cache separated |
| Supplementary GLM-5.3 three rounds, median-paired +1.5909 | `paper/generated/glm53-supplement.json`; 132 archived verdicts | `npm run check:paper-glm53`; preserves half points; mixed judges; descriptive interval crosses zero; S17 cap sensitivity reported |
| Full-cohort contract accounting, 64 answers / 328 decisions | `paper/audit/contract-review-20260917/recorded-contracts.json` and `contract-map.json` | `npm run check:paper-contracts`; six retrospective primary domains; original judgments, not 64 independent semantic regrades |
| Cross-family LLM re-judgment, 64 reports per judge | `paper/audit/llm-judge-panel-v1/items/`, `verdicts/`, `paper/generated/llm-judge-panel.json` | `node paper/scripts/analyze-llm-judge-panel.mjs --check`; Claude and GPT-5.5 are LLM judges, not independent humans; original GLM remains primary; GPT used one sequential session |
| Human-follow-up provenance and record alignment | `paper/audit/contract-review-20260917/human-alignment.json` | Ten archived answers / 56 decisions numerically unchanged across source commits; no separately supplied human item-level scores or measured agreement |
| Supplementary Qwen +6.71875 | `benchmark/results/validation-report-2026-09-16-codex-qwen3.8-27b-medium-s16-paired.json` | Answers/reasons missing; reported CI not exactly reproducible; no cross-host ranking |
| Historical snapshot and development exposure | `benchmark/snapshots/2026-09-01-main-23.json`; `paper/audit/task-exposure-ledger.csv` | Inventory is not every study denominator; no independent holdout claim |

## Scope and unresolved facts

Existing sources support a retrospective case study, not a capability law, operational pass rate, isolated procedural-skill effect, or universal generalization. The cross-family LLM panel is complete; no additional solver experiments are required by the current work plan. Author declarations, material redistribution, permanent release and journal entry requirements remain submission checks. Unexecuted ablations are not empirical contributions.

Primary related-work records are in `paper/latex/custom.bib`; the paper cites the versioned SkillsBench, SWE-Skills-Bench, SkillLens, WebDev-Skills-Bench, VersiCode and CODEMENV records. It does not claim to be the first study of heterogeneous skill effects or overhead. JSS's current guide endpoint returned 403 during this revision, so current format and declaration rules were not certified.

## Narrative revision

The focal comparison now leads the main methods and results; historical and supplementary comparisons remain in Appendix B. Discussion distinguishes the S11 missed grading defect, the S18 alternative teardown repair that falls outside the narrower mounted-host rubric, and the S6 API/responsibility disagreement. The derived review questions are implications of these cases, not a validated taxonomy, a measured intervention, or an estimated failure frequency. Original scores remain unchanged; the LLM panel is a separate sensitivity analysis.

## Mechanism and small-sample evidence

| Claim | Source | Boundary |
|---|---|---|
| S11 accepts the parent under two path algorithms; 12 other declared controls behave as expected | `mechanism-checks-20260917/results.json`, extracted source and hashes | Exact answer predicate; not a full route, native Windows filesystem or exploit test |
| S18 explicit teardown and per-timeout unref both allow natural exit in different lifecycle conditions | Same file, five child-process conditions | Reconstructed mechanism, not the original planner; correction of interpretation, no score overwritten |
| Three existing endpoints have sign-enumeration tail fractions 0.0781 / 0.1328 / 0.1172 | `paper/generated/focal-robustness.json` | All 256 signs per endpoint; conditional symmetry, no randomized causal inference |
| Original repeat means 4.53 / 5.31; every original leave-one-task-out mean 2.42–5.58 | Same file | Descriptive sensitivity, not independent replications or a generalization guarantee |

Reproduction: `npm run check:paper-mechanisms`. S6 remains static assessment; no fabricated API mock is presented as target implementation evidence.
