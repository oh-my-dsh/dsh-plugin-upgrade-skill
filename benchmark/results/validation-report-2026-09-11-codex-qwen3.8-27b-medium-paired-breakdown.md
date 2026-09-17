# Qwen3.8-27B (medium) paired run — derived subgroup breakdown

> **DERIVED SECONDARY ANALYSIS — NO NEW MODEL RUNS.**
>
> This file is a deterministic derived analysis of an already published paired run.
> It is regenerated from `benchmark/results/validation-report-2026-09-11-codex-qwen3.8-27b-medium-paired.json` and `benchmark/results/validation-report-2026-09-11-codex-qwen3.8-27b-medium-paired.csv`
> by `benchmark/scripts/summarize-paired-subgroups.mjs`. It runs **no model calls and no new
> benchmark trials**, and it does not change, recompute or supersede any number in the original report.
> Every statement below is **observed, descriptive and scoped to this historical paired run**.

## Provenance

- Original report: [`validation-report-2026-09-11-codex-qwen3.8-27b-medium-paired.md`](./validation-report-2026-09-11-codex-qwen3.8-27b-medium-paired.md) (JSON + CSV companions).
- Source benchmark commit: `74af446` (full `74af446d3f070966fb792126396122e1b068b2a0`).
- Registry authority: `git show 74af446:benchmark/README.md (pinned; the living 63-task classification is never consulted)`.
- Completeness: **112/112 jobs**, **56/56 tasks**, **3 attempts per task per condition** (336 trials). Scored trials: with-skill 168, no-skill 167; unscored (retained, never imputed as 0): with-skill 0, no-skill 1.
- Aggregation: median of the 3 trials per task per condition, then subgroup statistics over the 56 task-level medians; the 336 trial rows are never treated as independent.

## Method

The unit of analysis is the task, not the trial. For every task and condition the three trials are
reduced to their **median**, giving 56 task-level values per condition; subgroup
statistics are then computed over those task-level values. This mirrors the median-of-3 semantics of
`benchmark/scripts/summarize-runs.mjs`. The 168 trial rows per condition are **never treated as
independent observations**, so the subgroup numbers below are descriptive summaries of the same
historical task set, not new significance tests.

A `paired Δ` for a task is `with-skill median − no-skill median`. A task whose condition has no scored
trial has a `null` median and is excluded from that subgroup mean instead of being imputed as 0.
"Perfect tasks" counts tasks whose median-of-3 equals 1.0 (at least two of three trials scored 100).

**Reconciliation with the original report.** The original headline ("with-skill better on 7 tasks,
no-skill better on 18, identical on 31") reduces each task to its trial mean; across the 56 tasks that view
gives 7 positive / 31 tied / 18 negative. This derived analysis reduces each task to its
median first, giving 6 positive / 45 tied / 5 negative here — the tie count is higher because
median-of-3 collapses most trial noise. The original report stays authoritative for its own aggregation;
neither view replaces the other and neither is a significance test.

The two axes are **independent of each other**: interaction mode comes from the pinned registry, and the
id prefix is historical naming only.

### Interaction mode

Source: benchmark/README.md `Type` column at the source benchmark commit.

| Subgroup | Tasks | Skill median-task mean | No-skill median-task mean | Paired mean Δ | Paired median Δ | + / = / − | Perfect tasks (skill / no-skill) | Input tokens | Cached input (subset) | Output tokens | Summed trial seconds | Missing usage |
| --- | ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: |
| Static | 20 | 0.41 | 0.385 | 0.025 | 0 | 3 / 16 / 1 | 6 / 6 | 28805894 | 27007232 | 1365212 | 36335.757 s | 0 |
| Hands-on | 36 | 0.452778 | 0.484722 | -0.031944 | 0 | 3 / 29 / 4 | 15 / 13 | 720867527 | 705168016 | 6563967 | 178151.539 s | 0 |

Interaction mode is the registry `Type` value at the pinned commit: `Static` tasks are written
exams, `Hands-on` tasks require installing and running the plugin. It is not inferred from the task id.

### Prefix

Source: task id first character (historical naming).

| Subgroup | Tasks | Skill median-task mean | No-skill median-task mean | Paired mean Δ | Paired median Δ | + / = / − | Perfect tasks (skill / no-skill) | Input tokens | Cached input (subset) | Output tokens | Summed trial seconds | Missing usage |
| --- | ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: |
| S | 17 | 0.344118 | 0.376471 | -0.032353 | 0 | 1 / 15 / 1 | 5 / 5 | 24954055 | 23401616 | 1144037 | 30992.454 s | 0 |
| M | 14 | 0.45 | 0.435714 | 0.014286 | 0 | 2 / 11 / 1 | 5 / 4 | 254366856 | 248509968 | 2541059 | 67589.284 s | 0 |
| H | 25 | 0.494 | 0.506 | -0.012 | 0 | 3 / 19 / 3 | 11 / 10 | 470352510 | 460263664 | 4244083 | 115905.558 s | 0 |

Prefixes are **historical id naming**, not a mode and not a difficulty proxy:

- **`S != automatically Static`** — the mode of an S task is whatever the pinned registry says; this
  breakdown reads that column and never the prefix.
- **`H != automatically Hands-on`** — in the `74af446` registry, `H4-tsbuildinfo-trap`,
  `H6-remote-error-trap` and `H12-remote-result-boundary-trap` are `Static` despite the H prefix.
- **`M != Medium difficulty`** — M is an id prefix only. Reasoning effort was `medium` for *every*
  trial by protocol, so M carries no difficulty semantics in this run.

## Largest descriptive per-task Δ (optional detail)

These rows are descriptive observations inside this historical run. They are not a claim about why a
difference appeared, and no subgroup is redefined from them.

| Direction | Task | Interaction mode | Prefix | Skill median | No-skill median | Δ |
| --- | --- | --- | --- | ---: | ---: | ---: |
| positive | H6-remote-error-trap | Static | H | 0.75 | 0 | 0.75 |
| positive | M6-sleep-tool | Hands-on | M | 0.4 | 0 | 0.4 |
| positive | H12-remote-result-boundary-trap | Static | H | 0.6 | 0.3 | 0.3 |
| positive | S5-negative-naming | Static | S | 0.5 | 0.25 | 0.25 |
| positive | M14-service-renames-0812 | Hands-on | M | 1 | 0.8 | 0.2 |
| negative | H21-question-answerer-waterfall | Hands-on | H | 0 | 0.9 | -0.9 |
| negative | S14-link-install-lock-trap | Static | S | 0 | 0.8 | -0.8 |
| negative | H7-locale-trap | Hands-on | H | 0 | 0.4 | -0.4 |
| negative | M7-d399-overlay | Hands-on | M | 0 | 0.4 | -0.4 |
| negative | H13-ghost-host-trap | Hands-on | H | 0 | 0.15 | -0.15 |

## Token and duration accounting

Token and duration figures are summed from the CSV companion, grouped by the same task sets as the
score columns. `Cached input` is a **subset** of `Input tokens` (the convention documented in
`benchmark/README.md`): it is reported separately and is **never added** to input. A `★` marks a
subgroup whose sum is incomplete because at least one task/condition row has a missing usage cell; a
missing value is reported as a missing count, never written as 0. Summed trial seconds are the native
Harbor trial durations and are additive across concurrent jobs.

## Scientific boundary

- This is a **derived secondary analysis** of one existing 56-task paired run; no model calls and no
  benchmark trials were executed to produce it.
- It is **not** a formal study result and **not** a paper effect claim.
- Findings are `observed`, `descriptive`, and `within this historical paired run`; they are not causal.
  The data here do not show that the skill "works better on Hands-on" or worse on any subgroup; subgroup
  behaviour must not redefine the main experiment.
- No benchmark task, grader, fixture, skill or formal-run flag was modified by this analysis.
- Numbers for a subgroup are only comparable within the same paired run and the same source commit
  (`74af446`).
- A separate deterministic analysis of this same run quantifies the timeout/termination taxonomy and
  the missing-score sensitivity (including the single unscored trial): see
  [`qwen-paired-sensitivity.json`](./qwen-paired-sensitivity.json) and
  `benchmark/scripts/analyze-qwen-paired-sensitivity.mjs`. It changes none of the numbers above.
