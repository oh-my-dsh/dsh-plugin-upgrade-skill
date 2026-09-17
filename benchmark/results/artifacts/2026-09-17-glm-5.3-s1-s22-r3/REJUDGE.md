# R3 re-judge (glm-5.3-flash) — 2026-09-17

Round 3 of glm-5.3 (S1-S22) was originally judged by glm-5.3 itself (same model as the solver) because the judging session did not switch models; see the disclosure in the round-3 validation report and PR #241.

This directory (`judge-flash/`) plus `aggregate-flash-rejudge.json` record the full re-judge under the canonical judge (glm-5.3-flash), restoring judge consistency with rounds 1-2. The original glm-5.3-judged verdicts remain unchanged under `judge/` with their own `aggregate.json` — per the re-grading rule, historical versions are kept side by side, never overwritten.

| Aggregate | judge | zero-skill | with-skill | lift |
|---|---|---:|---:|---:|
| `judge/aggregate.json` | glm-5.3 (same-model, disclosed deviation) | 2013 | 2158 | +145 |
| `judge-flash/aggregate.json` / `aggregate-flash-rejudge.json` | glm-5.3-flash (canonical) | 2092.5 | 2185 | +92.5 |

Notable per-task differences: S17 zero-skill is 0 under the glm-5.3 judge (triggered cap `contradictory-operational-advice`) but 90 under glm-5.3-flash (cap not triggered); S4 zero-skill is 13 vs 50 (the flash judge graded the located-but-undirected findings at partial rather than fail). The glm-5.3-flash judge is systematically stricter on the zero-skill arm.

**The canonical numbers for any cross-round comparison (including the three-round medians in `benchmark/results/glm-trio-common-subset.json`) are the flash-rejudged ones.** The same-model aggregate is retained only as evidence of the deviation's magnitude.
