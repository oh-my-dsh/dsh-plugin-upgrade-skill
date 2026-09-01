# benchmark task validation report · 2026-09-01

End-to-end validation of all 22 tasks under `benchmark/tasks`, with Codex and
`openai/gpt-5.6-terra`, with both Harbor-injected and Codex-native skills
disabled: **all 22 tasks received a complete model attempt, 21 produced
verifier rewards, and H8 ended in `VerifierTimeoutError`. The 21 accepted
rewards total 14.93/21 with a mean of 0.7110 (verifier score 1493/2100). If
the unscored H8 exception is conservatively counted as zero, the full-cohort
diagnostic is 14.93/22 with a mean of 0.6786 (1493/2200).**

This is a **literal zero-skill result**. No Harbor `--skill` argument was
supplied; every selected job and trial records no injected skill; Codex was
started with `skills.include_instructions=false` and
`skills.bundled.enabled=false`. Audit of all 22 selected trajectories found
zero `<skills_instructions>` blocks, zero concrete skill-path hits, and no
skill-file read. Seven trials used a generic repository-discovery command
whose filename glob mentioned `SKILL.md`, but none found or opened one.

## Environment

- Harbor CLI 0.22.0
- Docker Desktop 29.7.2 (macOS, local provider)
- Agent: Codex 0.152.0, model `openai/gpt-5.6-terra`
- Harbor-injected skill: none (`--skill` omitted; trial configuration has no
  skill)
- Codex-native system skills: catalog and instructions disabled with
  `skills.include_instructions=false` and `skills.bundled.enabled=false`
- Reasoning effort: `xhigh`
- Main-batch concurrency: 4 trials / 4 agent phases
- Agent setup timeout multiplier: `4.0`
- Agent/verifier timeout multiplier: `2.0`
- H8 supplemental verifier timeout multiplier: `4.0`
- Main retry policy: at most one retry for every exception other than
  `AgentTimeoutError`; the main result records two retries
- H9 closed-book protocol: task-declared `no-network` plus runner-level
  `web_search=disabled`
- The user explicitly requested Codex, this model, no skill, and every task,
  authorizing the benchmark sources to be sent to OpenAI for this run;
  `chatgpt.com` was allowed for model connectivity.

## How to reproduce

The primary selected job used a temporary loadable copy of the 22-task
dataset because the checked-in H7 metadata is invalid TOML. No `--skill`
argument was supplied:

```sh
harbor run \
  -p /private/tmp/dsh-plugin-upgrade-terra-noskill-tasks-20260901-v1/tasks \
  -a codex \
  -m openai/gpt-5.6-terra \
  --ak reasoning_effort=xhigh \
  --ak 'config={"skills":{"include_instructions":false,"bundled":{"enabled":false}}}' \
  --ae CODEX_FORCE_AUTH_JSON=true \
  --allow-agent-host chatgpt.com \
  --n-concurrent 4 \
  --n-concurrent-agents 4 \
  --max-retries 1 \
  --retry-exclude AgentTimeoutError \
  --agent-setup-timeout-multiplier 4 \
  --agent-timeout-multiplier 2 \
  --verifier-timeout-multiplier 2 \
  --jobs-dir /private/tmp/dsh-plugin-upgrade-terra-noskill-20260901 \
  --job-name codex-terra-literal-no-skills-all-22-setup4-20260901 \
  -y
```

H7's temporary copy changed only the description regex from
`/session\s*log/i` to the valid TOML spelling `/session\\s*log/i`. Task
instructions, fixture, tests, verifier, and every other task were byte-for-byte
unchanged.

H8's agent phase completed in the primary job, but its verifier exceeded the
1200-second effective timeout. It was rerun alone with the same task, model,
reasoning effort, zero-skill configuration, and a 2400-second verifier timeout:

```sh
harbor run \
  -p /private/tmp/dsh-plugin-upgrade-terra-noskill-tasks-20260901-v1/tasks/H8-fire-drill \
  -a codex \
  -m openai/gpt-5.6-terra \
  --ak reasoning_effort=xhigh \
  --ak 'config={"skills":{"include_instructions":false,"bundled":{"enabled":false}}}' \
  --ae CODEX_FORCE_AUTH_JSON=true \
  --allow-agent-host chatgpt.com \
  --n-concurrent 1 \
  --n-concurrent-agents 1 \
  --max-retries 0 \
  --agent-setup-timeout-multiplier 4 \
  --agent-timeout-multiplier 2 \
  --verifier-timeout-multiplier 4 \
  --jobs-dir /private/tmp/dsh-plugin-upgrade-terra-noskill-h8-supplement-20260901 \
  --job-name codex-terra-h8-literal-no-skills-vtimeout4-20260901 \
  -y
```

The main-batch H9 produced 0.70, but that run did not explicitly disable
provider-side search. Its trajectory used only local `exec` calls and did not
actually invoke search, but it is not accepted as auditable closed-book proof.
H9 was therefore rerun through its checked-in closed-book wrapper, whose final
argument pins `web_search=disabled`; the compliant 0.50 reward replaces 0.70:

```sh
benchmark/tasks/H9-dsh-web-alpha2/run-codex-closed-book.sh \
  -m openai/gpt-5.6-terra \
  --ak reasoning_effort=xhigh \
  --ak 'config={"skills":{"include_instructions":false,"bundled":{"enabled":false}}}' \
  --ae CODEX_FORCE_AUTH_JSON=true \
  --allow-agent-host chatgpt.com \
  --n-concurrent 1 \
  --n-concurrent-agents 1 \
  --max-retries 1 \
  --retry-exclude AgentTimeoutError \
  --agent-setup-timeout-multiplier 4 \
  --agent-timeout-multiplier 2 \
  --verifier-timeout-multiplier 2 \
  --jobs-dir /private/tmp/dsh-plugin-upgrade-terra-noskill-h9-closed-book-20260901 \
  --job-name codex-terra-h9-literal-no-skills-closed-book-v2-20260901 \
  -y
```

Task sources and candidate fixtures were isolated in Docker. The host
workspace was not an agent write target, and its pre-existing untracked report
was preserved.

## Results summary

| Task | reward | verifier | Key result |
|---|---:|---:|---|
| `H1-plane-trap` | 1.0 | 100/100 | Injected host-plane `llm`, installed successfully, and cold-booted with no pending plugin |
| `H2-baseline-trap` | 1.0 | 100/100 | Preserved and correctly attributed the pre-existing failing test; cold boot activated |
| `H3-client-plane` | 1.0 | 100/100 | Added the top-level Web client declaration and appeared in `__DSH_BOOT__.entries` |
| `H4-tsbuildinfo-trap` | 0.3 | 30/100 | Found the stale artifact and clean/rebuild path, but omitted the explicit no-source-change conclusion and hit the nonexistent-reference trap |
| `H5-runtime-export-drift` | 1.0 | 100/100 | Aligned the settings cohort, packed and installed a tarball, and cold-booted without export or pending failures |
| `H6-remote-error-trap` | 0.0 | 0/100 | Kept the fixture read-only but omitted all four graded Remote error-flow migration requirements |
| `H7-locale-trap` | 0.9 | 90/100 | Replaced display-text matching with a stable `data-slot` and reached the browser roster, but omitted the separate explicit render assertion |
| `H8-fire-drill` | error | — | Agent completed all four acts and its token/Cookie smoke, but the sealed verifier timed out at 1200 seconds and again at 2400 seconds |
| `H9-dsh-web-alpha2` | 0.5 | 50/100 | Closed-book run aligned 248 SDK/Cordis declarations and several contracts, but scored 0/13 settings migrations and stayed below the runtime-gate threshold |
| `M1-host-migration` | 1.0 | 100/100 | Installed the fixture and reached the host application layer without pending entries |
| `M2-optional-dep-trap` | 1.0 | 100/100 | Moved the unconditionally imported package to `dependencies`; cold boot activated |
| `M3-session-projection` | 1.0 | 100/100 | Corrected profile composition while retaining `dsh-tool-todo`; cold boot activated |
| `M4-peer-prerelease-range` | 1.0 | 100/100 | Rewrote peer/dev bounds to `^0.1.2-alpha.2`; install and cold boot passed |
| `M5-token-auth-smoke` | 0.6 | 60/100 | Token/Cookie smoke returned 401 then 200, but raw `webServer.register` remained and triggered the cap |
| `S1-static-scan` | 0.83 | 83/100 | Kept the fixture read-only and found five required cards, but missed A1-08 |
| `S2-negative-scan` | 0.6 | 60/100 | Covered zero-hit uncertainty and the need for real verification, but did not map the positive APIProxy hit to A1-01 |
| `S3-snapshot-migration` | 0.2 | 20/100 | Identified the legacy projection but missed the lifecycle seat, Cordis type import, slots registration, and A1-03 |
| `S4-legacy-client-imports` | 1.0 | 100/100 | Kept the fixture read-only and mapped A1-25, A1-26, A1-27, and A1-30 |
| `S5-negative-naming` | 0.5 | 50/100 | Correctly handled the shared `events` channel and unknown state, but omitted the `greet` judgment and misclassified the services warning |
| `S6-corridor-net-state` | 0.25 | 25/100 | Cited both corridor cards but missed the deletion conclusion, producer semantics, and `Session.append` gap |
| `S7-unpublished-cohort` | 0.25 | 25/100 | Gave two legal install paths but missed registry proof, caret semantics, and exit/package-manager discipline |
| `S8-release-routing-trap` | 1.0 | 100/100 | Diagnosed mirror tag lag and forward incompatibility, chose the rc-compatible release, and prescribed mirror synchronization |

Distribution:

| reward | count |
|---:|---:|
| 1.0 | 10 |
| 0.9 | 1 |
| 0.83 | 1 |
| 0.6 | 2 |
| 0.5 | 2 |
| 0.3 | 1 |
| 0.25 | 2 |
| 0.2 | 1 |
| 0.0 | 1 |
| verifier error / no reward | 1 |

The primary raw result is:

`/private/tmp/dsh-plugin-upgrade-terra-noskill-20260901/codex-terra-literal-no-skills-all-22-setup4-20260901/result.json`

The selected supplemental results are:

- H8 verifier retry:
  `/private/tmp/dsh-plugin-upgrade-terra-noskill-h8-supplement-20260901/codex-terra-h8-literal-no-skills-vtimeout4-20260901/result.json`
- H9 literal-zero-skill closed-book rerun:
  `/private/tmp/dsh-plugin-upgrade-terra-noskill-h9-closed-book-20260901/codex-terra-h9-literal-no-skills-closed-book-v2-20260901/result.json`

The primary result's built-in mean (`0.6877`) is not the selected benchmark
mean: it conservatively treats H8 as zero and includes the non-auditable H9
pre-run at 0.70. Replacing H9's 0.70 with the compliant 0.50 leaves 14.93
reward across the 21 tasks with verifier output. H8 remains an execution
exception; no semantic score is inferred from its candidate artifacts.

## What the verifier confirmed

- Ten tasks received full verifier credit. Eight were hands-on migrations
  (`H1`, `H2`, `H3`, `H5`, `M1`, `M2`, `M3`, and `M4`); S4 and S8 were
  complete read-only assessments.
- H1, H2, H5, M1, M2, M3, and M4 passed isolated DSH install/cold-start
  checks. H3 and H7 also passed real Web roster checks through
  `__DSH_BOOT__.entries`.
- H5 was verified from a packed tarball rather than a workspace link, so local
  resolution could not hide the runtime-export drift.
- M5's sealed token smoke confirmed 401 without a Cookie and 200 after token
  exchange, while separately detecting that the plugin retained the raw route.
- H9's selected run was closed-book at both layers: the task container used
  `no-network`, and the runner disabled provider-side web search. It aligned
  248 direct SDK/Cordis declarations, migrated the npm cohort/lock/workflow
  partially, excluded incompatible external plugins, handled the qualified
  task-board gateway code, and passed the inject/aggregate script regression.
- The read-only fixtures remained unchanged for H4, H6, and S1-S8. H2's
  pre-existing failing test also remained untouched.
- All 22 selected trajectories identify the agent as `codex` and the model as
  `openai/gpt-5.6-terra`. None contains a `<skills_instructions>` system block
  or a concrete skill path. Generic `SKILL.md` discovery globs occurred in
  seven trajectories but returned no skill file and led to no skill read.

## Time and token accounting

| Run | Scope | Wall time | Input tokens | Cached input | Output tokens | Estimated cost |
|---|---|---:|---:|---:|---:|---:|
| Primary selected job | 21 retained scored trajectories plus the main H8 attempt/retry lifecycle | 1h32m48s | 28,568,074 | 26,872,064 | 194,364 | $11.0988 |
| H8 supplement | H8 agent rerun plus 2400-second verifier timeout | 48m21s | 2,819,813 | 2,658,304 | 17,294 | $1.0622 |
| H9 closed-book v2 | Selected H9 replacement | 30m23s | 15,436,227 | 14,902,272 | 71,994 | $4.9123 |
| Retained result-file total | Three rows above | 2h51m32s | 46,824,114 | 44,432,640 | 283,652 | $17.0733 |

The retained result-file total is execution accounting, not the selected
22-answer comparison set: it includes the discarded main-batch H9 trajectory
(16,074,892 input, 15,548,416 cached, 56,092 output, $4.8357). Removing that
discarded trajectory gives the selected 22 trajectories:

- input tokens: **30,749,222**
- cached input tokens: **28,884,224**
- output tokens: **227,560**
- estimated cost: **$12.2376**

The preliminary main setup-only attempt ran for 7m41s and made no model call.
The first H9 closed-book setup attempt ran for 1m58s and also made no model
call; Codex installation failed because `@openai/codex-linux-arm64` was
missing. From the preliminary main start at 14:26:51 through the final H9
result at 17:36:46, end-to-end elapsed time was **3h09m55s**.

One accounting limitation remains: the primary H8 agent completed before its
1200-second verifier timeout, but Harbor's automatic retry replaced that
trial directory and its trajectory. The main result's final token counters no
longer include that first H8 agent call. Therefore $17.0733 is the exact total
retained by Harbor's result files, not a claim about the provider's absolute
billing total; actual consumption is higher by the erased first H8 attempt.

## Issues found

1. **H8 has no official verifier reward.** Both agent runs completed the
   migration, isolated Web profile, cold boot, token/Cookie exchange, 401/200
   `/ping` smoke, version bumps, and release checklist. The verifier still
   timed out at both 1200 and 2400 seconds. `judge.mjs` calls
   `readAgentText('/app/agent-output', TASK)`, whose helper recursively walks
   every directory and synchronously reads all `.md`, `.txt`, `.json`,
   `.jsonl`, and `.log` files. Terra placed its full DSH profile under
   `/app/agent-output/H8-fire-drill/dsh-home`, so the judge traversed the
   profile and its `node_modules` before scoring.
2. **H9 stopped at 50/100.** The selected closed-book candidate changed 57
   paths, including two paths outside the compatibility surface. The verifier
   awarded dependency, cohort, aggregate, external-plugin, and task-board
   points, but found none of the 13 settings-service seam migrations and found
   git-graph still depending on a removed transitive type edge. Static score
   stayed below 80, so the heavy real install/cold-start gate was skipped.
3. **H4 accepted the trap's false premise (30/100).** It correctly identified
   stale build output and recommended clean/rebuild, but failed to conclude
   explicitly that source needed no changes and claimed a nonexistent
   reference repair, triggering the cap.
4. **H6 omitted the Remote error migration (0/100).** Its report did not cover
   namespaced error codes, cancel propagation, internal/unknown-code handling,
   or removal of silent error swallowing.
5. **M5 preserved the raw route (60/100).** Authentication behavior passed the
   real token/Cookie smoke, but `webServer.register` remained instead of
   moving the channel to the host's unified authenticated surface.
6. **H7 and S1-S3/S5-S7 were semantically incomplete.** H7 omitted a separate
   render assertion. S1 missed A1-08; S2 omitted the A1-01 positive mapping;
   S3 supplied only one of five required migration points. S5 omitted the
   official `greet` judgment and mishandled a warning. S6 did not fold the
   corridor into the required deletion/net-state conclusion. S7 omitted
   registry verification, caret semantics, and exit/package-manager discipline.

## Preliminary run anomalies

The checked-in H7 metadata cannot be parsed by Harbor because the TOML basic
string at line 6 contains the unescaped sequence `\s`. Python `tomllib`
reports `Unescaped '\\' in a string (at line 6, column 72)`. Harbor silently
omitted H7 when pointed at the checked-in task root. Only a temporary metadata
copy was made loadable; the repository task was not changed.

The first all-task job used Harbor's default setup timeout. Four concurrent
trials reached `AgentSetupTimeoutError` before model execution; the job was
stopped after 7m41s with no token usage and restarted with
`--agent-setup-timeout-multiplier 4`.

The primary H8 agent completed, but the 1200-second verifier timeout triggered
Harbor's automatic retry. The retry entered setup and was cancelled after the
first candidate had already proved that more verifier time was needed. The
standalone H8 run disabled retries and raised the verifier budget to 2400
seconds; it timed out again with empty verifier stdout.

The first strict H9 rerun failed during Codex setup after 1m58s because npm's
global install omitted `@openai/codex-linux-arm64`. It made no model call. An
identical retry installed successfully and produced the selected 0.50 reward.

## Conclusion

**The Codex + `gpt-5.6-terra` literal-zero-skill benchmark completed model
execution for all 22 tasks.** Twenty-one tasks have verifier rewards totaling
14.93/21, mean 0.7110, with ten perfect tasks. H8 has a completed candidate
but no official score because the sealed verifier timed out twice; counting
that exception as zero gives the diagnostic full-cohort mean 0.6786.

Unlike the Luna no-injected-skill reference run, this execution also disabled
Codex's native system-skill catalog and skill instructions. All 22 selected
trajectories passed the literal no-skill audit. The strongest results were the
hands-on install/cold-start migrations plus S4 and S8; the main semantic gaps
were H6, H4, H9's settings-service migration, and the incomplete static
assessments.

The host task fixtures and benchmark implementation were not modified. This
report is the only workspace file added for the Terra literal-zero-skill
result; the pre-existing untracked skill-injected Terra report remains
untouched.
