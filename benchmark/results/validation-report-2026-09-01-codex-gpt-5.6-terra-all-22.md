# benchmark task validation report · 2026-09-01

End-to-end validation of all 22 tasks under `benchmark/tasks`, with Codex and
`openai/gpt-5.6-terra`, using the Harbor-injected
`skills/plugin-upgrade` skill: **all 22 tasks were attempted, 21 produced
verifier rewards, and H8 ended in `VerifierTimeoutError` twice. The 21 accepted
rewards total 16.75/21 with a mean of 0.7976 (verifier score 1675/2100). If the
unscored H8 exception is conservatively counted as zero, the full-cohort result
is 16.75/22 with a mean of 0.7614 (1675/2200).**

This is a skill-injected result. Every selected Harbor job and trial lock
records `skills/plugin-upgrade`, and a trajectory command audit confirmed that
every selected task explicitly opened
`/root/.agents/skills/plugin-upgrade/SKILL.md`. H7 required a temporary
metadata-only TOML correction before Harbor could load it. H9 was rerun under
its required closed-book protocol; its earlier main-batch reward was discarded.

## Environment

- Harbor CLI 0.22.0
- Docker Desktop 29.7.2 (macOS, local provider)
- Agent: Codex 0.152.0, model `openai/gpt-5.6-terra`
- Harbor-injected skill: `skills/plugin-upgrade`
- Reasoning effort: `xhigh`
- Main-batch concurrency: 4 trials / 4 agent phases
- Agent setup timeout multiplier: `5.0`
- Agent/verifier timeout multiplier: `2.0`
- Main retry policy: at most one retry for `NetworkConnectionError`; the
  selected main job recorded no retries
- H8 verifier retry multiplier: `4.0`
- H9 agent protocol: task-declared `no-network` plus
  `web_search=disabled`; only `chatgpt.com` was allowed for model connectivity
- The user explicitly requested Codex, this model, this skill, and every task,
  authorizing the benchmark sources to be sent to OpenAI for execution.

The stock Harbor Codex bootstrap first timed out while provisioning Node in
four trial containers, before any model call. The selected jobs therefore used
the temporary adapter `/private/tmp/harbor_codex_node24_fast.py`, which
subclasses Harbor's Codex agent and changes only setup: it uses the Node 24
already present in the task image and installs `@openai/codex@latest` with npm.
Agent execution, model settings, task images, mounted skill, and verifiers were
otherwise unchanged. An install-only preflight completed before the selected
jobs were started.

Before execution, both benchmark metadata checks passed:

```text
Execution-contract validation OK: 22 tasks use BENCHMARK-AUTH-v1
[task-registry] OK: 22 tasks, README/scoring registry consistent
```

## How to reproduce

The primary selected job used the following Harbor configuration:

```sh
PYTHONPATH=/private/tmp uvx --from harbor harbor run \
  -p benchmark/tasks \
  -x '*h9-dsh-web-alpha2*' \
  -a harbor_codex_node24_fast:CodexNode24Fast \
  -m openai/gpt-5.6-terra \
  --skill ./skills/plugin-upgrade \
  --ak reasoning_effort=xhigh \
  --ae CODEX_FORCE_AUTH_JSON=true \
  --allow-agent-host chatgpt.com \
  --artifact /app/fixture \
  --artifact /app/agent-output \
  --n-concurrent 4 \
  --n-concurrent-agents 4 \
  --max-retries 1 \
  --retry-include NetworkConnectionError \
  --agent-setup-timeout-multiplier 5 \
  --agent-timeout-multiplier 2 \
  --verifier-timeout-multiplier 2 \
  --jobs-dir /private/tmp/dsh-plugin-upgrade-terra-all22-20260901 \
  --job-name codex-plugin-upgrade-terra-main21-rerun1-20260901 \
  -y
```

The main dataset loaded 21 tasks. H7 was silently omitted because the
checked-in `task.toml` contains the invalid TOML escape `\s` in its description.
H7 was copied to a temporary directory, and the description alone was changed
from `/session\s*log/i` to `/session\\s*log/i`; task instructions, fixture,
tests, and verifier were unchanged. The corrected temporary copy was then run
with the same agent, model, injected skill, reasoning effort, connectivity, and
timeout multipliers.

The lowercase H9 exclusion pattern did not match Harbor's uppercase task
directory, so the main batch also ran H9 and produced 0.53. That run was not
accepted because it did not explicitly disable Codex web search. H9 was rerun
alone from the checked-in task with the same model and skill plus
`--ak web_search=disabled`; the task's `no-network` agent mode remained active.
The compliant closed-book reward of 0.8 replaces the discarded 0.53.

H8's agent phase completed in the primary job, but the verifier exceeded its
1200-second effective timeout. A standalone retry used the same task, model,
skill, and agent output with a 2400-second verifier timeout; it timed out again.
Neither H8 attempt produced a verifier reward, so no score is inferred from the
candidate files or the agent's own smoke report.

Task sources and candidate fixtures were isolated in Docker. The host
workspace was not an agent write target, and it was clean before this report
was added.

## Results summary

| Task | reward | verifier | Key result |
|---|---:|---:|---|
| `H1-plane-trap` | 1.0 | 100/100 | Injected host-plane `llm`, installed successfully, and cold-booted with no pending plugin |
| `H2-baseline-trap` | 1.0 | 100/100 | Preserved and correctly attributed the pre-existing failing test; cold boot activated |
| `H3-client-plane` | 1.0 | 100/100 | Added the top-level Web client declaration and appeared in `__DSH_BOOT__.entries` |
| `H4-tsbuildinfo-trap` | 1.0 | 100/100 | Identified the stale build artifact, prescribed clean/rebuild, and correctly concluded source needed no change |
| `H5-runtime-export-drift` | 0.2 | 20/100 | Packed install and cold boot passed, but a `settingsNamespace` compatibility shim triggered the 20-point cap |
| `H6-remote-error-trap` | 0.0 | 0/100 | Kept the fixture read-only but omitted all four required Remote error-flow migration conclusions |
| `H7-locale-trap` | 0.9 | 90/100 | Replaced display-text matching with a stable `data-slot` and reached the browser roster, but omitted the explicit render assertion |
| `H8-fire-drill` | error | — | Agent completed the migration and its own token smoke, but the sealed verifier timed out at 1200 seconds and again at 2400 seconds |
| `H9-dsh-web-alpha2` | 0.8 | 80/100 | Migrated the real dsh-web surface, but out-of-scope changes and a lockfile-integrity failure capped the result |
| `M1-host-migration` | 1.0 | 100/100 | Installed the fixture and reached the host application layer without pending entries |
| `M2-optional-dep-trap` | 1.0 | 100/100 | Moved the unconditionally imported package to `dependencies`; cold boot activated |
| `M3-session-projection` | 1.0 | 100/100 | Corrected profile composition while retaining `dsh-tool-todo`; cold boot activated |
| `M4-peer-prerelease-range` | 1.0 | 100/100 | Rewrote peer/dev bounds to `^0.1.2-alpha.2`; install and cold boot passed |
| `M5-token-auth-smoke` | 0.6 | 60/100 | Token/Cookie smoke returned 401 then 200, but raw `webServer.register` remained and triggered the cap |
| `S1-static-scan` | 1.0 | 100/100 | Kept the fixture read-only and identified all six required corridor cards |
| `S2-negative-scan` | 1.0 | 100/100 | Mapped the positive APIProxy hit, handled zero-hit uncertainty, and required real verification |
| `S3-snapshot-migration` | 1.0 | 100/100 | Produced the complete read-only snapshot-migration assessment across all five required points |
| `S4-legacy-client-imports` | 1.0 | 100/100 | Kept the fixture read-only and mapped A1-25, A1-26, A1-27, and A1-30 |
| `S5-negative-naming` | 0.75 | 75/100 | Correctly handled warning, informational, and unknown states, but omitted the official `greet` judgment |
| `S6-corridor-net-state` | 0.25 | 25/100 | Cited both corridor cards but missed the deletion conclusion, producer semantics, and `Session.append` gap |
| `S7-unpublished-cohort` | 0.25 | 25/100 | Gave two legal install paths but missed registry proof, exit/package-manager discipline, and caret prerelease semantics |
| `S8-release-routing-trap` | 1.0 | 100/100 | Diagnosed mirror tag lag and forward incompatibility, chose the rc-compatible release, and prescribed mirror synchronization |

Distribution:

| reward | count |
|---:|---:|
| 1.0 | 13 |
| 0.9 | 1 |
| 0.8 | 1 |
| 0.75 | 1 |
| 0.6 | 1 |
| 0.25 | 2 |
| 0.2 | 1 |
| 0.0 | 1 |
| verifier error / no reward | 1 |

The primary raw result is the uncommitted local artifact
`/private/tmp/dsh-plugin-upgrade-terra-all22-20260901/codex-plugin-upgrade-terra-main21-rerun1-20260901/result.json`.
The selected supplemental results are:

- H7:
  `/private/tmp/dsh-plugin-upgrade-terra-all22-20260901/codex-plugin-upgrade-terra-h7-runnable-20260901/result.json`
- H8 verifier retry:
  `/private/tmp/dsh-plugin-upgrade-terra-all22-20260901/codex-plugin-upgrade-terra-h8-verifier-retry1-20260901/result.json`
- H9 closed-book rerun:
  `/private/tmp/dsh-plugin-upgrade-terra-all22-20260901/codex-plugin-upgrade-terra-h9-closed-book-20260901/result.json`

The primary result's built-in mean (`0.7419`) is not the selected 22-task
aggregate: it includes the noncompliant H9 pre-run at 0.53, treats H8's
verifier exception as zero, and omits the separately loaded H7. Starting from
the primary reward sum, replacing H9's 0.53 with 0.8 and adding H7's 0.9 yields
the selected reward sum of 16.75. That is `16.75 / 21 = 0.7976` across tasks
with verifier rewards, or `16.75 / 22 = 0.7614` under conservative full-cohort
accounting.

## Execution time and token usage

The following timestamps are Harbor job-level local timestamps in
Asia/Shanghai. Durations are wall-clock durations for each job. Harbor reports
cache tokens as a subset of input tokens, so the cache column must not be added
to the input column when calculating total consumption.

| Job | Started | Finished | Duration | Input tokens | Cache tokens | Output tokens | Cost |
|---|---|---|---:|---:|---:|---:|---:|
| Primary 21-task batch | 2026-09-01 14:37:40.620 | 2026-09-01 15:48:04.121 | 1h10m23.501s | 31,056,703 | 28,881,152 | 265,046 | $13.3079 |
| H7 metadata-corrected run | 2026-09-01 15:49:36.667 | 2026-09-01 15:55:48.484 | 6m11.816s | 824,863 | 732,160 | 12,633 | $0.4834 |
| H8 verifier retry | 2026-09-01 15:49:51.681 | 2026-09-01 16:38:14.140 | 48m22.458s | 2,410,459 | 2,276,864 | 17,618 | $0.9340 |
| H9 compliant closed-book run | 2026-09-01 16:04:57.185 | 2026-09-01 16:33:58.270 | 29m01.085s | 19,802,419 | 19,241,728 | 59,959 | $5.6892 |
| **Recorded job totals** | — | — | **2h33m58.860s** | **54,094,444** | **51,131,904** | **355,256** | **$20.4145** |

The summed job duration is not elapsed end-to-end time because H7, H8, and
H9 overlapped. The selected model-bearing jobs occupied a 2h00m33.520s window,
from 14:37:40.620 to 16:38:14.140. Including the first preliminary setup job's
14:27:17.125 start, the complete observed benchmark window was 2h10m57.015s.

The primary row includes the discarded 0.53 H9 pre-run and the first H8
attempt. The H8 retry row is the second H8 attempt, so the recorded totals are
actual compute consumption rather than only the tokens associated with
accepted rewards. The initial stock-bootstrap batch has no finish timestamp in
its aborted result and made no model calls. The install-only preflight ran from
14:35:22.583 to 14:37:00.352 (1m37.769s) and also consumed no model tokens or
model cost.

## What the verifier confirmed

- Thirteen tasks received full verifier credit. Six were hands-on migrations
  (`H1`, `H3`, `M1`, `M2`, `M3`, and `M4`); H2 correctly attributed its
  pre-existing baseline failure and H4 correctly diagnosed an artifact-only
  repair; S1-S4 and S8 were complete read-only assessments.
- H1, H2, H5, M1, M2, M3, and M4 passed isolated DSH install/cold-start
  checks. H3 and H7 also passed real Web roster checks through
  `__DSH_BOOT__.entries`.
- H5 was verified from a packed tarball rather than a workspace link, exposing
  the compatibility shim even though install and cold start succeeded.
- M5's sealed token smoke confirmed 401 without a Cookie and 200 after token
  exchange, while separately detecting that the plugin retained the raw route.
- The read-only fixtures remained unchanged for H4, H6, and S1-S8. H2's
  pre-existing failing test also remained untouched.
- H9 scored every settings migration point (13/13), aligned 214 direct
  SDK/Cordis declarations, preserved the qualified task-board gateway handling,
  and passed the upstream inject/aggregate regression check.
- All selected job/trial locks contain the injected skill, and all selected
  trajectories explicitly read its `SKILL.md`; there is no no-skill ambiguity
  in this result.

## Issues found

1. **H8 has no official result.** Both agent phases completed, and the retry's
   own smoke evidence reports a 303 token exchange followed by 401/200 route
   behavior. The sealed verifier nevertheless timed out at both 1200 and 2400
   seconds. Static inspection also shows the candidate retained raw
   `webServer.register` and omitted `rpc.handle('/ping')`; these are evidence,
   not a substitute for the missing verifier reward.
2. **H9 stopped at 80/100.** The candidate changed eight paths outside the
   compatibility surface, including git-graph tests and aggregate/mount/link
   scripts, triggering a 90-point cap. Its `pnpm-lock.yaml` also left roughly
   60 alpha.2 entries without `integrity`, so the sealed real install/cold-start
   gate rejected the candidate and imposed the final 80-point cap. The
   git-graph package still depended on a removed transitive type edge.
3. **H5 used a compatibility shim (20/100).** Its package cohort, packed
   tarball install, and cold boot all passed, but defining `settingsNamespace`
   in `src/index.ts` bypassed the target host contract and triggered the task's
   hard cap.
4. **H6 omitted the Remote error migration (0/100).** The report did not cover
   namespaced error codes, cancel propagation, internal/unknown-code handling,
   or removal of silent error swallowing.
5. **M5 preserved the raw route (60/100).** Authentication behavior passed the
   real token/Cookie smoke, but `webServer.register` remained instead of moving
   the channel to the host's unified authenticated surface.
6. **H7 and S5-S7 were semantically incomplete.** H7 omitted a separate render
   assertion. S5 omitted the official short-name validity of `greet`. S6 did
   not collapse the corridor into the required deletion/net-state conclusion.
   S7 omitted registry verification, caret prerelease behavior, and explicit
   exit/package-manager discipline.

## Run anomalies

The checked-in H7 metadata cannot be parsed by Harbor because the TOML basic
string at line 6 contains the unescaped sequence `\s`. Python `tomllib` reports
`Unescaped '\\' in a string (at line 6, column 72)`. Harbor silently omitted H7
from the dataset. Only a temporary copy was made loadable for this benchmark;
the repository task was not changed.

The intended H9 exclusion used a lowercase glob against an uppercase directory
name, so Harbor included H9 in the primary batch. Because that run lacked the
explicit `web_search=disabled` flag required for an auditable closed-book
result, its 0.53 reward is retained only as raw execution history. The
standalone 0.8 H9 run is the selected result.

The stock Codex install path caused four preliminary
`AgentSetupTimeoutError`s. Reusing the task images' existing Node 24 through the
temporary setup-only adapter eliminated that bootstrap bottleneck. The
selected main and supplemental jobs had no agent setup failure and no retry.

## Conclusion

**The Codex + `gpt-5.6-terra` benchmark with the injected
`skills/plugin-upgrade` skill attempted every one of the 22 registered tasks.**
Twenty-one tasks produced accepted verifier rewards totaling 16.75, with 13
perfect tasks and a rewarded-task mean of 0.7976. Counting H8's missing reward
as zero gives a conservative full-cohort mean of 0.7614.

The strongest results were the complete static assessments and the focused
install/cold-start migrations. The main correctness gaps were H6's absent
Remote error analysis, H5/M5's use of compatibility or raw-route shortcuts,
and H9's lockfile-integrity and scope discipline. H8 remains unresolved at the
verifier layer after two bounded attempts and must not be reported as a scored
completion. The host worktree stayed clean throughout benchmark execution;
this report is the only workspace file added for this result.
