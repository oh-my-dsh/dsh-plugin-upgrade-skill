# benchmark v2.3 · terminus-2 + deepseek-v4-flash paired validation report

> Proposed and discussed in [#102](https://github.com/oh-my-dsh/dsh-plugin-upgrade-skill/issues/102).
> First report to run the **weak-harness / weak-model** pairing, and the first to
> cover the full **23-task** set (H7 was silently dropped from every previous batch
> run by an invalid-TOML bug, fixed in
> [#105](https://github.com/oh-my-dsh/dsh-plugin-upgrade-skill/pull/105)).

## Protocol

- Benchmark: `oh-my-dsh/dsh-plugin-upgrade-skill` @ main `2de49059ec3178e23ea644cd78e7d20575b74745`
  (H7 re-included with the one-line escape fix from #105; no other task content touched)
- Agent: **terminus-2** (Harbor's built-in minimal terminal agent)
- Model: `deepseek/deepseek-v4-flash` (DeepSeek API id `deepseek-v4-flash`)
- Harbor 0.22.0, local Docker (macOS host), `-k 3` (3 attempts per task per condition), `-n 3`
- Conditions: `--skill skills/plugin-upgrade` vs no skill flag; identical prompts, both rounds
- Primary metric: per-task **median of 3 runs**, as recommended by benchmark/README
- Commands:

  ```sh
  harbor run -p benchmark/tasks -a terminus-2 -m deepseek/deepseek-v4-flash \
    --skill skills/plugin-upgrade -k 3 -n 3   # with-skill round
  harbor run -p benchmark/tasks -a terminus-2 -m deepseek/deepseek-v4-flash \
    -k 3 -n 3                                 # no-skill round
  ```

**Clean zero-skill baseline.** terminus-2 has no native skill catalog of any kind,
so unlike the 2026-09-01 Codex runs (where H2/H3 read the Codex-native
`plugin-creator` skill), the no-skill round here is a literal zero-skill baseline —
no contamination footnote needed.

## Headline results

| Scope | Configuration | reward | mean | perfect tasks |
|---|---|---:|---:|---:|
| 23-task full set | with `skills/plugin-upgrade` | **18.55/23** | 0.8063 | 14 |
| 23-task full set | no skill | 16.09/23 | 0.6996 | 11 |
| 19-task 2026-09-01 snapshot | with `skills/plugin-upgrade` | 15.25/19 | 0.8026 | — |
| 19-task 2026-09-01 snapshot | no skill | 13.29/19 | 0.6995 | — |

Net skill uplift: **+2.46 reward points over 23 tasks** (+0.1067 mean), or **+1.96
over the 19-task snapshot** (vs +2.86 single-run for Codex + GPT-5.6-Luna).

## Per-task results

| Task | with skill (median) | no skill (median) | delta | runs (with) | runs (no) | cost both cond. | Luna ref (with/no) |
|---|---:|---:|---:|---|---|---:|---|
| S1-static-scan | 1.00 | 0.33 | +0.67 | 0.00, 1.00, 1.00 | 0.33, 0.00, 0.33 | $0.26 | 1.00 / 0.33 |
| S2-negative-scan | 1.00 | 0.40 | +0.60 | 1.00, 0.80, 1.00 | 0.00, 0.40, 0.60 | $0.21 | 1.00 / 0.60 |
| S3-snapshot-migration | 0.80 | 0.60 | +0.20 | 1.00, 0.80, 0.00 | 0.60, 0.60, 0.60 | $0.32 | 1.00 / 0.00 |
| S4-legacy-client-imports | 1.00 | 1.00 | +0.00 | 0.70, 1.00, 1.00 | 1.00, 1.00, 1.00 | $0.20 | 1.00 / 1.00 |
| S5-negative-naming | 0.50 | 0.75 | -0.25 | 0.50, 0.50, 0.75 | 0.75, 0.75, 0.75 | $0.11 | 0.75 / 0.50 |
| S6-corridor-net-state | 0.50 | 0.25 | +0.25 | 0.50, 0.50, 0.50 | 0.25, 0.25, 0.25 | $0.09 | 0.25 / 0.25 |
| S7-unpublished-cohort | 0.25 | 0.50 | -0.25 | 0.25, 0.10, 0.50 | 0.50, 0.25, 0.50 | $0.18 | 0.25 / 0.10 |
| S8-release-routing-trap | 1.00 | 1.00 | +0.00 | 1.00, 1.00, 1.00 | 0.80, 1.00, 1.00 | $0.24 | — |
| H1-plane-trap | 1.00 | 1.00 | +0.00 | 1.00, 1.00, 1.00 | 1.00, 1.00, 1.00 | $0.37 | 1.00 / 1.00 |
| H2-baseline-trap | 1.00 | 1.00 | +0.00 | 1.00, 1.00, 1.00 | 1.00, 1.00, 1.00 | $0.53 | 1.00 / 1.00 |
| H3-client-plane | 1.00 | 1.00 | +0.00 | 1.00, 1.00, 1.00 | 1.00, 1.00, 1.00 | $0.80 | 1.00 / 1.00 |
| H4-tsbuildinfo-trap | 1.00 | 0.30 | +0.70 | 1.00, 1.00, 1.00 | 0.30, 0.30, 0.30 | $0.14 | 1.00 / 0.30 |
| H5-runtime-export-drift | 1.00 | 1.00 | +0.00 | 1.00, 1.00, 1.00 | 1.00, 1.00, 0.60 | $0.72 | 1.00 / 1.00 |
| H6-remote-error-trap | 0.25 | 0.00 | +0.25 | 0.25, 0.25, 0.25 | 0.00, 0.00, 0.00 | $0.12 | 0.00 / 0.00 |
| H7-locale-trap | 0.90 | 0.90 | +0.00 | 0.90, 0.90, 0.90 | 0.90, 0.90, 0.90 | $0.73 | 0.90 / 1.00 |
| H8-fire-drill | 0.70 | 0.20 | +0.50 | 0.79, 0.60 | 0.20, 0.20, 0.20 | $1.10 | — |
| H9-dsh-web-alpha2 | 0.05 | 0.26 | -0.21 | 0.05, 0.00, 0.05 | 0.38, 0.00, 0.26 | $1.70 | 0.80 / 0.67 |
| H10-browser-activation-trap | 1.00 | 1.00 | +0.00 | 1.00, 1.00, 1.00 | 1.00, 1.00, 1.00 | $0.44 | — |
| M1-host-migration | 1.00 | 1.00 | +0.00 | 1.00, 1.00, 1.00 | 1.00, 1.00, 1.00 | $0.26 | 1.00 / 1.00 |
| M2-optional-dep-trap | 1.00 | 1.00 | +0.00 | 1.00, 1.00, 1.00 | 1.00, 1.00, 1.00 | $0.20 | 1.00 / 1.00 |
| M3-session-projection | 1.00 | 1.00 | +0.00 | 1.00, 1.00, 1.00 | 1.00, 1.00, 1.00 | $0.56 | 1.00 / 1.00 |
| M4-peer-prerelease-range | 1.00 | 1.00 | +0.00 | 1.00, 1.00, 1.00 | 1.00, 1.00, 1.00 | $0.23 | 1.00 / 1.00 |
| M5-token-auth-smoke | 0.60 | 0.60 | +0.00 | 0.60, 0.60, 0.60 | 0.60, 0.60, 0.60 | $0.61 | — |

Luna reference columns are the single-run 2026-09-01 Codex + GPT-5.6-Luna reports
(S8/M5/H8/H10 were not in that snapshot).

## Cost and time

Harbor already records everything needed for a cost dimension — each trial's
`result.json` carries `n_input_tokens` / `n_output_tokens` / `cost_usd`:

| Round | API cost | input tokens | output tokens | wall clock (`-n 3`) |
|---|---:|---:|---:|---:|
| with skill (23 tasks × 3) | $5.28 | 58.7M | 2.5M | 2h 34m |
| no skill (23 tasks × 3) | $4.85 | 53.9M | 2.3M | 2h 24m |

The **entire 138-trial paired evaluation cost ≈ $10** — three-run medians at this
price point are cheap enough to be the default protocol rather than an aspiration.

## Observations

1. **Discrimination partially restored under a weak pairing.** Seven tasks show a
   positive median delta (H4 +0.70, S1 +0.67, S2 +0.60, H8 +0.50, H6 +0.25,
   S6 +0.25, S3 +0.20). Notably **H6 and S6 — flat/dead under Luna (0.00/0.00 and
   0.25/0.25) — now discriminate**, and H8 (never scored before) shows a +0.50 gap.
2. **12 of 23 tasks remain tied at 1.00 in both conditions even for this weak
   pairing** (all five M-series hands-on tasks plus H1/H2/H3/H5/H10, S4, S8). These
   tasks appear easy for *any* tool-using agent regardless of skill or model
   strength — stronger evidence than the Luna report alone that they are candidates
   for hardening or for exclusion from a "frontier subset" headline metric.
3. **Skill overhead is a real, measurable cost.** The with-skill round hit 12
   AgentTimeoutErrors vs 9 without (plus one VerifierTimeoutError on H8); reading
   the card corpus consumes time budget, and both S1 and S3 each lost one run to a
   timeout-induced 0.00 that the median absorbed. Under fixed task timeouts, skill
   consumption is not free — worth reporting alongside reward.
4. **Three tasks had negative deltas** (S5 −0.25, S7 −0.25, H9 −0.21). S7's runs
   were noisy in both conditions (0.10–0.50); H9's with-skill runs collapsed to
   0.00–0.05 with repeated agent timeouts on the 17-package real-repository
   migration — likely budget starvation rather than the skill misleading the agent,
   but it deserves a dedicated look.
5. **Cheap model + skill ≈ expensive model bare, at a fraction of the cost.** On
   the 19-task snapshot, v4-flash with the skill (15.25) lands within 0.7 points of
   Luna-with-skill (15.95) and clearly above Luna-bare (13.09).

## Exceptions and noise

- AgentTimeoutError: 12 (with skill: S3×3, H9×3, H8×2, S1×2, M3×1, H3×1) /
  9 (no skill: H8×3, H9×3, S3×1, S1×1, H3×1). Timed-out trials are still graded on
  the container state at timeout; all medians below rest on 3 scored runs.
- VerifierTimeoutError: 1 (with skill, H8) — that task's median uses 2 runs.
- H7 was executed after the #105 fix (its `task.toml` was unparseable before);
  the fix touches only the description string, not fixture/judge/prompt.
