# R3 re-judge (glm-5.3-flash) — 2026-09-17

Round 3 of glm-5.3 (S1-S22) was originally judged by glm-5.3 itself (same model as the solver) because the judging session did not switch models; see the disclosure in the round-3 validation report and PR #241.

This directory (`judge-flash/`) plus `aggregate-flash-rejudge.json` record the full re-judge under the canonical judge (glm-5.3-flash), restoring judge consistency with rounds 1-2. The original glm-5.3-judged verdicts remain unchanged under `judge/` with their own `aggregate.json` — per the re-grading rule, historical versions are kept side by side, never overwritten.

| Aggregate | judge | zero-skill | with-skill | lift |
|---|---|---:|---:|---:|
| `aggregate.json` (verdicts in `judge/`) | glm-5.3 (same-model, disclosed deviation) | 2012.5 | 2157.5 | +145 (+6.59 pp) |
| `aggregate-flash-rejudge.json` (verdicts in `judge-flash/`) | glm-5.3-flash (canonical) | 2092.5 | 2185 | +92.5 (+4.20 pp) |

Both aggregates recompute exactly from their verdict files with `scoreDecisions` in `benchmark/report-judge/judge.mjs` (half-points preserved). The machine-readable re-judge record (judge model, date, rubric commit `e0a9ff5`) is the `rejudge` block in `run-manifest.json`.

Per-task differences (flash − original):

| Arm | Task | glm-5.3 judge | glm-5.3-flash | Δ |
|---|---|---:|---:|---:|
| zero-skill | S17 | 0 (cap `contradictory-operational-advice` triggered) | 90 (cap not triggered) | +90 |
| zero-skill | S6 | 75 | 87.5 | +12.5 |
| zero-skill | S4 | 62.5 (1 pass, 3 partial) | 50 (4 partial) | −12.5 |
| zero-skill | S16 | 100 | 90 | −10 |
| with-skill | S5 | 87.5 | 100 | +12.5 |
| with-skill | S3 / S11 / S18 | 90 each | 100 each | +10 each |
| with-skill | S16 | 100 | 90 | −10 |
| with-skill | S1 | 100 | 95 | −5 |

Net: zero-skill +80, with-skill +27.5, so the lift shrinks from +145 to +92.5. The flash judge is **not** systematically stricter on the zero-skill arm: its zero-skill total is higher, and that difference is driven almost entirely by the single S17 cap decision. Excluding S17, the zero-skill arm nets −10 (S6 more lenient; S4 and S16 stricter) and the with-skill arm still nets +27.5. On S4 the flash judge was stricter, not more lenient: it downgraded the one criterion the original judge passed to partial.

**The canonical numbers for any cross-round comparison (including the three-round medians in `benchmark/results/glm-trio-common-subset.json`) are the flash-rejudged ones.** The same-model aggregate is retained only as evidence of the deviation's magnitude.
