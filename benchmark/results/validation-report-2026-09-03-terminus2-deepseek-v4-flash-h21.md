# H21 · terminus-2 + DeepSeek V4 Flash validation report

Validation date: 2026-09-03 (Asia/Shanghai)

This report records the H21 structured-question answerer benchmark calibration and
paired model evaluation. It is intentionally explicit about the network-policy
boundary: the model trials ran in disposable Docker containers, but on this Windows
Docker Desktop host Harbor 0.22.0 rejected H21's formal `no-network` agent policy
because its Docker egress-control capability probe reported that nftables was not
available. The model results below therefore use a disposable **public-network
calibration copy** of the task and must not be presented as a formal no-network
benchmark score.

## 1. Benchmark and provenance

| Item | Value |
| --- | --- |
| Benchmark contribution commit (snapshot target) | `6e5916a407c366e3cc9ac00474fcbd535e7e19d6` |
| Evaluation snapshot manifest commit | `30466b7a46b70187b67c9a16c7307245944150a8` |
| Executable task/judge commit used for the calibration copy | `d1dd4be9933b473b6947cf3774ea1b1c4d227254` |
| Working branch | `feat/benchmark-question-answerer-waterfall` |
| Task | `H21-question-answerer-waterfall` |
| Task registry name | `dsh-plugin-upgrade/h21-question-answerer-waterfall` |
| Calibration task copy | `D:/code/archive/dsh-plugin-upgrade-h21-public-v4/H21-question-answerer-waterfall` |
| Harbor task checksum used by all six model trials | `b34981d852e47fa26a669309081759b9908e8528edc1e6f3f68d253350160061` |
| Canonical upstream-reachable Skill snapshot commit | `5f7234ba4e00aeaa46c699ea32384389ad38a2a6` |
| Local calibration materialization commit | `4436bc45f38b9eceaeb73fc54f96d8d465a048d5` |
| Skill snapshot tree (both commits) | `817a48e6795b40a51a08befff62dd03d55e124df` |
| Canonical Skill archive SHA-256 (Linux Git) | `0906ca558c02b20fe095f50ddd3120fab8001e12caccba91613d7ede3bfd7f97` |
| Skill path | `skills/plugin-upgrade` |
| Skill partition | Closed-book transfer; snapshot predates the answer-bearing A1-20 material |
| Source incident | dsh-tui structured-question answerer migration, `DSH-0.1.2-A1-20` |

The six trials injected files materialized from `4436bc45…`. That PR-head object and
the canonical upstream-main ancestor `5f7234ba…` resolve to the exact same
`skills/plugin-upgrade` tree (`817a48e…`), so the evaluated Skill bytes do not
change. Contribution metadata uses `5f7234ba…` because a clean upstream checkout
can resolve it during CI; its Linux `git archive` hash is recorded above.

The calibration copy was made from the checked-in task before later
metadata-only and non-executable wording/comment edits. Its substantive runtime
difference is the agent network policy: its `[agent].network_mode` is `"public"`
instead of the checked-in `"no-network"`. The checked-in task remains the canonical
contribution artifact.

## 2. Environment and protocol

| Item | Actual value |
| --- | --- |
| Host | Windows; Docker Desktop |
| Harbor | `0.22.0` |
| Docker server | `29.2.1` (`Docker Desktop`) |
| Node | `v24.13.0` |
| Agent | Harbor built-in `terminus-2` (`2.0.0`) |
| Model | `deepseek/deepseek-v4-flash` (DeepSeek provider, model id `deepseek-v4-flash`) |
| Reasoning effort | `high` |
| Container concurrency | `-n 1` |
| Attempts per condition | `-k 3` |
| Retries | `-r 0` |
| Task timeout | `900.0` seconds per agent trial |
| Verifier | H21 sealed judge, shared verifier environment |
| Conditions | fixed-snapshot Skill vs no Harbor-injected Skill |
| Network used by model trials | `public` calibration copy only |

With-Skill command (credentials were supplied through environment variables and are
not reproduced here):

```sh
harbor run \
  -p D:/code/archive/dsh-plugin-upgrade-h21-public-v4/H21-question-answerer-waterfall \
  -a terminus-2 -m deepseek/deepseek-v4-flash \
  --ak reasoning_effort=high \
  --skill D:/code/archive/dsh-plugin-upgrade-h21-harbor/skill-snapshot/skills/plugin-upgrade \
  -k 3 -n 1 -r 0 -q -y \
  -o D:/code/archive/dsh-plugin-upgrade-h21-harbor/jobs \
  --job-name h21-flash-with-skill-v4-3x
```

No-Skill command: the same command without the `--skill` option and with job name
`h21-flash-no-skill-v4-3x`.

The first with-skill trajectory contains Harbor's generated
`<available_skills>` block with location `/harbor/skills/plugin-upgrade/SKILL.md`.
The first no-skill trajectory contains no `<available_skills>`, `plugin-upgrade`, or
`SKILL.md` marker. The trial configs for all three with-skill trials contain the
fixed snapshot path; all three no-skill configs contain an empty skill list.

## 3. Paired results

The primary statistic is the per-task median of the three verifier rewards. H21 has
one task, so the task median is the median of the three raw trial rewards.

| Condition | Raw rewards | Median | Mean | Min / max | Perfect trials |
| --- | --- | ---: | ---: | ---: | ---: |
| With fixed Skill snapshot | `0.9, 1.0, 1.0` | **1.0** | 0.9667 | 0.9 / 1.0 | 2 / 3 |
| No Harbor-injected Skill | `0.9, 0.9, 1.0` | **0.9** | 0.9333 | 0.9 / 1.0 | 1 / 3 |
| Median delta (with − no) | — | **+0.10** | — | — | — |

The difference in the raw three-trial means is `+0.0333`; the benchmark's primary
per-task-median delta is `+0.10`. Both conditions produced three scored verifier
results; no trial was unscored.

### Raw trial ledger

All durations below are derived from each trial's persisted `started_at` and
`finished_at`. Cache tokens are a subset of input tokens and are not added to input
tokens.

| Condition | Trial | Reward | Input tokens | Cache tokens | Output tokens | Cost (USD) | Duration (s) | Exception |
| --- | --- | ---: | ---: | ---: | ---: | ---: | ---: | --- |
| with-skill | `__TXjMfeb` | 0.9 | 2,962,687 | 2,869,888 | 98,744 | 0.211352072 | 913.146851 | `AgentTimeoutError` |
| with-skill | `__UkGdVR4` | 1.0 | 2,024,192 | 1,945,088 | 94,810 | 0.187186192 | 910.350170 | `AgentTimeoutError` |
| with-skill | `__wQzCxuf` | 1.0 | 3,055,387 | 2,964,864 | 97,875 | 0.210533216 | 909.776564 | `AgentTimeoutError` |
| no-skill | `__L7aX49G` | 0.9 | 2,448,907 | 2,369,152 | 102,042 | 0.202955768 | 909.109630 | `AgentTimeoutError` |
| no-skill | `__gBVxzex` | 0.9 | 1,843,626 | 1,766,912 | 97,072 | 0.186625968 | 908.788651 | `AgentTimeoutError` |
| no-skill | `__cPQbr8R` | 1.0 | 1,977,904 | 1,904,256 | 93,808 | 0.182891264 | 910.073242 | `AgentTimeoutError` |

### Condition totals

| Condition | Input tokens | Cache tokens | Output tokens | Cost (USD) | Summed duration |
| --- | ---: | ---: | ---: | ---: | ---: |
| with-skill (3 trials) | 8,042,266 | 7,779,840 | 291,429 | 0.609071480 | 2,733.273585 s (45m 33.274s) |
| no-skill (3 trials) | 6,270,437 | 6,040,320 | 292,922 | 0.572473000 | 2,727.971523 s (45m 27.972s) |
| paired total | 14,312,703 | 13,820,160 | 584,351 | 1.181544480 | 5,461.245108 s (91m 1.245s) |

Harbor's job-level results report the same totals. Every trial reached the verifier
after the agent timeout, and the verifier reward was retained. The six
`AgentTimeoutError` records are therefore scored-with-exception anomalies, not
missing rewards or zero substitutions.

## 4. Trial observations and anomalies

- With-skill trial `TXjMfeb` scored `0.9`: the agent added an extra event test and its
  resulting fixture `npm test` failed, while the real-service checkpoints completed.
- With-skill trials `UkGdVR4` and `wQzCxuf` scored `1.0`; each added extra regression
  coverage and the fixture tests passed.
- No-skill trials `L7aX49G` and `gBVxzex` scored `0.9` because the repeat-attach
  checkpoint detected that the replacement listener did not supersede the first
  listener before the stale disposer was called.
- No-skill trial `cPQbr8R` scored `1.0` and passed every H21 checkpoint.
- All six agents exhausted the 900-second timeout while continuing multi-turn
  terminal work. This did not prevent the verifier from grading the container state.
- LiteLLM emitted repeated DeepSeek thinking-mode warnings that an assistant message
  lacked `reasoning_content` and that a blank placeholder was inserted. This is
  recorded as a provider/runtime warning and may contribute to multi-turn quality
  variance; it was not converted into a score or hidden.
- The earlier two Flash smoke runs were aborted by the outer 600-second shell timeout
  and had no verifier reward. They are excluded from the six-trial ledger above.
- The formal checked-in task's `no-network` policy was not executable on this Windows
  Docker Desktop host: Harbor rejected it after the Docker egress-control kernel
  capability probe. The public-copy run is consequently calibration evidence only.

## 5. Oracle, local judge, and mutation evidence

The latest public calibration copy was run with Harbor's oracle:

```text
h21-oracle-public-v4: 1/1, Mean 1.000, reward 1.0
runtime: 9 seconds
```

The oracle used the same task contents as the six calibration trials and passed the
full sealed verifier. A formal no-network oracle was not claimed because the local
Harbor Docker provider rejected that policy before task execution.

Before the model runs, the sealed judge was also rehearsed directly against the
published rc.2 and alpha.2 package closures in a disposable local harness:

| Candidate | Score |
| --- | ---: |
| Oracle implementation | 100 / 100 |
| Original fixture with benign edit | 35 / 100 |
| Claim-all mutant | 65 / 100 |
| Captured-owner mutant | 80 / 100 |
| No-replacement/disposal mutant | 80 / 100 |

The oracle passed the fixture mock suite, real rc.2 registration/disposal, alpha.2
agentless and scoped delivery, foreign-owner delegation, owner rebinding, and repeat
attach/disposer checks. The mutants were all non-perfect and failed at the intended
behavioral checkpoints rather than being accepted by a weak mock-only test.

## 6. Repository validation

The following checks passed on the contribution worktree:

```text
npm test
node --test benchmark/tasks/H21-question-answerer-waterfall/tests/judge-utils.test.mjs
node benchmark/scripts/validate-task-registry.mjs
node benchmark/scripts/validate-task-toml.mjs
node benchmark/scripts/validate-execution-contract.mjs
node benchmark/scripts/validate-evaluation-snapshots.mjs
node --check benchmark/tasks/H21-question-answerer-waterfall/tests/judge.mjs
node --check benchmark/tasks/H21-question-answerer-waterfall/tests/judge-utils.mjs
node --check benchmark/tasks/H21-question-answerer-waterfall/environment/fixture/src/register.js
git diff --check
```

The H21 fixture's local mock suite passed with 3 tests. The repository-wide test suite
also passed the registry, manifest, execution-contract, snapshot, checkpoint, summary,
runtime, smoke, release, audit, and DSH case-definition checks.

## 7. Scope boundaries

This benchmark is a focused registration-seam migration, not a claim of full product
equivalence. It does not exercise:

- a rendered React/Ink TUI, keyboard input, or a real terminal panel;
- the complete DSH agent registry and live-agent lifecycle;
- provider credentials, browser automation, or external authentication;
- alpha.1 installation from npm (the executable newer cohort is published alpha.2);
- a formal no-network model run on this Windows Docker Desktop host.

The contribution artifact keeps the formal checked-in task network policy unchanged.
The report's six scored trials are reproducible public-network calibration runs with
an exact task checksum, fixed pre-answer Skill snapshot, raw reward ledger, token
counts, duration, cost, and exception accounting.
