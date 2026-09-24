# Coordinator-only notes (DO NOT give to reviewers)

Everything in this folder unblinds the packet. Reviewers receive only
`../reviewer-packet/` (for example as a zip), never repository access, and
must not run `paper/scripts/prepare-blind-grade-review.mjs`: the seed and
script are committed, so anyone who runs it can rebuild the id-to-arm map.

- `sample-manifest.json` — sampling design, strata, per-task historical
  deltas, masking rules, pinned task-material ref, design disclosures.
- `coordinator-map.json` — review id → task, arm, round, source path,
  source sha256, packet sha256, original score.
- `masking-log.json` — every masked span (rule, line, original text).

## Masking summary

| Arm | Answers with ≥1 replacement | Replacements |
|---|---|---|
| no-skill | 4 / 16 | 5 |
| with-skill | 14 / 16 | 82 |

Token density differs strongly by arm, so the number of masked tokens is
itself a residual cue; the reviewer README asks reviewers not to use it.

## No-skill answers on which a masking rule fired (follow-up required)

A no-skill run should not know the skill's name, reference files, or mode
vocabulary. Each row below needs a coordinator check of the run environment
(was the skill reachable from the working directory?) before the review is
reported; a local checkout path alone is weaker evidence than a citation of
skill content.

| Review id | Task | Rules fired | Original text (distinct spans) |
|---|---|---|---|
| R013 | S21-resource-service-unavailable-trap | skill-repo-path | `E:/deepseek-harness/dsh-plugin-upgrade-skill/.../environment/fixture/` |
| R023 | S7-unpublished-cohort | skill-repo-path | `E:/deepseek-harness/dsh-plugin-upgrade-skill/benchmark/tasks/S7-unpublished-cohort/environment/fixture` |
| R026 | S1-static-scan | skill-reference-file, skill-word | `pre-flight.md`; `skill's` |
| R030 | S2-negative-scan | skill-name | `plugin-upgrade` |

## Design disclosures

- Pool: 22 tasks, 0 with a negative median delta. The 3 pre-declared
  negative slots were filled from: zero.
- Sign of (with-skill − no-skill) in the round each sampled pair came from:
  higher 6, tie 10, lower 0.
- Consequently the review cannot observe how skill-arm regressions were
  graded; this must be disclosed wherever the review is reported.
