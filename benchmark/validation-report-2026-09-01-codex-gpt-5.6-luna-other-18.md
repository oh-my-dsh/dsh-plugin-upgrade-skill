# benchmark task validation report · 2026-09-01

End-to-end validation of the 18 tasks under `benchmark/tasks` other than
`H8-dsh-web-alpha2`, with Codex and `openai/gpt-5.6-luna`, using the
`skills/plugin-upgrade` skill: **all 18 requested tasks produced verifier
rewards, for a combined reward of 15.15/18 and a mean reward of 0.8417
(verifier score 1515/1800).**

## Environment

- Harbor CLI 0.22.0
- Docker Desktop 29.7.2 (macOS, local provider)
- Agent: Codex, model `openai/gpt-5.6-luna`
- Skill: `skills/plugin-upgrade`
- Reasoning effort: `xhigh`
- Main-batch concurrency: 4 trials / 4 agent phases
- Agent/verifier timeout multiplier: `2.0`
- Retry policy: at most one retry, limited to `NetworkConnectionError`; no
  retry was used by either scored job
- The user explicitly requested this agent/model/skill combination, thereby
  authorizing the requested benchmark source to be sent to OpenAI.

Harbor's built-in Codex installer first downloads NVM from
`raw.githubusercontent.com`. That setup path failed TLS before any model call,
even though every task image already contained Node 24. The scored jobs used a
temporary `CodexNode24` subclass at `/private/tmp/harbor_codex_node24.py`; it
changed only the install step to run `npm install -g @openai/codex@latest` on
the image's existing Node 24. Agent execution, trajectory collection, model
selection, skill mounting, and verification remained Harbor's Codex behavior.

## How to reproduce

The primary scored job was run with the following Harbor configuration:

```sh
PYTHONPATH=/private/tmp harbor run \
  -p benchmark/tasks \
  -x dsh-plugin-upgrade/h8-dsh-web-alpha2 \
  -a harbor_codex_node24:CodexNode24 \
  -m openai/gpt-5.6-luna \
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
  --agent-timeout-multiplier 2 \
  --verifier-timeout-multiplier 2 \
  --jobs-dir /private/tmp/dsh-plugin-upgrade-other18-luna-node24-20260901 \
  --job-name codex-plugin-upgrade-other18-luna-node24-20260901 \
  -y
```

This exact command exposed two task-discovery issues. Harbor matched the
exclude filter against the resolved local task name rather than the full name
from `task.toml`, so `H8-dsh-web-alpha2` entered the queue. It was stopped and
has no reward in this report. Separately, `H7-locale-trap/task.toml` could not
be parsed because its TOML basic string contained an unescaped `\s`, so Harbor
silently omitted H7 from the dataset.

H7 was therefore copied to `/private/tmp`, with only the description escape
changed from `/session\s*log/i` to `/session\\s*log/i`, and run separately:

```sh
PYTHONPATH=/private/tmp harbor run \
  -p /private/tmp/dsh-plugin-upgrade-h7-runnable-20260901 \
  -a harbor_codex_node24:CodexNode24 \
  -m openai/gpt-5.6-luna \
  --skill ./skills/plugin-upgrade \
  --ak reasoning_effort=xhigh \
  --ae CODEX_FORCE_AUTH_JSON=true \
  --allow-agent-host chatgpt.com \
  --artifact /app/fixture \
  --artifact /app/agent-output \
  --n-concurrent 1 \
  --n-concurrent-agents 1 \
  --max-retries 1 \
  --retry-include NetworkConnectionError \
  --agent-timeout-multiplier 2 \
  --verifier-timeout-multiplier 2 \
  --jobs-dir /private/tmp/dsh-plugin-upgrade-h7-luna-node24-20260901b \
  --job-name codex-plugin-upgrade-h7-luna-node24-20260901 \
  -y
```

The task sources and resulting fixtures were isolated in Docker. The host
workspace was not used as the agent's write target, and its pre-existing
changes were preserved.

## Results summary

| Task | reward | verifier | Key result |
|---|---:|---:|---|
| `H1-plane-trap` | 1.0 | 100/100 | Correctly injected host-plane `llm` instead of following the misleading comment; cold boot activated |
| `H2-baseline-trap` | 1.0 | 100/100 | Preserved the pre-existing failing test, attributed it correctly, and activated on cold boot |
| `H3-client-plane` | 1.0 | 100/100 | Added the top-level Web client declaration; plugin appeared in `__DSH_BOOT__.entries` |
| `H4-tsbuildinfo-trap` | 1.0 | 100/100 | Diagnosed stale build artifacts, kept `src/` unchanged, and prescribed clean/rebuild |
| `H5-runtime-export-drift` | 1.0 | 100/100 | Aligned the settings cohort, packed a tarball, installed it, and reached `MISSING_CREDENTIAL` without export/pending failures |
| `H6-remote-error-trap` | 0.0 | 0/100 | Report omitted every graded Remote error-flow migration requirement |
| `H7-locale-trap` | 0.9 | 90/100 | Replaced display-text matching with a stable data-slot and reached the Web roster, but omitted an explicit render assertion |
| `M1-host-migration` | 1.0 | 100/100 | Installed the fixture and reached the host application layer without pending entries |
| `M2-optional-dep-trap` | 1.0 | 100/100 | Moved the unconditionally imported package to `dependencies`; cold boot activated |
| `M3-session-projection` | 1.0 | 100/100 | Corrected profile composition while retaining `dsh-tool-todo`; cold boot activated |
| `M4-peer-prerelease-range` | 1.0 | 100/100 | Rewrote peer/dev bounds to `^0.1.2-alpha.2`; install and cold boot passed |
| `S1-static-scan` | 1.0 | 100/100 | Kept the fixture read-only and identified all six graded upgrade cards |
| `S2-negative-scan` | 1.0 | 100/100 | Identified the APIProxy hit and correctly rejected “zero hits = compatible” |
| `S3-snapshot-migration` | 1.0 | 100/100 | Covered all five snapshot/client migration points; reward survived an agent-timeout anomaly |
| `S4-legacy-client-imports` | 1.0 | 100/100 | Kept the fixture read-only and mapped all four required cards |
| `S5-negative-naming` | 0.75 | 75/100 | Correctly handled warning/informational/unknown states, but omitted the official short-name judgment |
| `S6-corridor-net-state` | 0.25 | 25/100 | Cited both corridor cards but missed the net-state conclusion and two semantic gaps |
| `S7-unpublished-cohort` | 0.25 | 25/100 | Supplied two legal install paths but missed registry, caret-resolution, and exit-discipline requirements |

Distribution:

| reward | count |
|---:|---:|
| 1.0 | 13 |
| 0.9 | 1 |
| 0.75 | 1 |
| 0.25 | 2 |
| 0.0 | 1 |

The primary raw result is in
[`result.json`](/private/tmp/dsh-plugin-upgrade-other18-luna-node24-20260901/codex-plugin-upgrade-other18-luna-node24-20260901/result.json).
The H7 result is in
[`result.json`](/private/tmp/dsh-plugin-upgrade-h7-luna-node24-20260901b/codex-plugin-upgrade-h7-luna-node24-20260901/result.json).

The primary result's built-in mean (`0.7917`) is not the requested benchmark
mean: it counts the stopped H8 trial as zero and does not include the separate
H7 run. The combined 18-task result above excludes H8 and includes H7, yielding
`15.15 / 18 = 0.8417`.

## What the verifier confirmed

- All 13 full-score tasks met every grader checkpoint.
- The eight full-score hands-on tasks (`H1`, `H2`, `H3`, `H5`, `M1`, `M2`,
  `M3`, `M4`) installed into isolated DSH profiles and reached the expected
  host/Web activation signals. H7 also passed its install/runtime/roster
  checks, but lost the separate render-assertion checkpoint. H3 and H7 were
  present in the real `__DSH_BOOT__.entries` browser roster.
- H5 was verified from a packed tarball rather than a workspace link, so the
  settings named-export drift could not be hidden by local resolution.
- The read-only tasks preserved their fixtures. S1-S4 received full credit for
  their reports and card/API mappings.
- Baseline attribution in H2 was correct: the pre-existing failing test stayed
  untouched and was not blamed on the migration.
- The main job completed 18 queued trials in 46m54s; H7 completed in 5m14s.
  Neither scored job used its network retry allowance.

## Issues found

1. **H6 Remote error migration was absent (0/100).** The report did not cover
   qualified/namespaced error codes, cancel propagation, internal/unknown-code
   handling, or removal of silent swallowing.
2. **S6 corridor folding was incomplete (25/100).** Both
   `DSH-0.1.2-A1-02` and `DSH-0.1.2-A2-01` appeared, but the report did not
   explicitly conclude that the defensive deletion must be removed. It also
   missed the correct producer semantics and the `Session.append` capability
   gap.
3. **S7 unpublished-cohort analysis was incomplete (25/100).** It proposed
   overrides/tarball and exact-pin/lockfile paths, but did not perform registry
   verification, explain silent caret prerelease resolution, or specify an
   exit path and package-manager discipline.
4. **S5 naming judgment omitted one state (75/100).** It correctly classified
   `services` as a recommendation, `events` as informational, and unqueried
   registry state as unknown, but never ruled on the validity of the official
   short name `greet`.
5. **H7 lacked the required observability assertion (90/100).** The stable
   data-slot anchor, install, host activation, and browser roster checks all
   passed, but the code did not explicitly assert that the injection rendered.
6. **S3 timed out after producing a full-score report.** Harbor recorded one
   `AgentTimeoutError`; the verifier still found all five report points and
   awarded 100/100. The timeout is retained as an execution anomaly, not
   interpreted as semantic failure.
7. **H7's checked-in task metadata is not Harbor-parseable.** The unescaped
   `\s` in `task.toml` caused silent dataset omission and made a direct H7 run
   fail with `Either datasets or tasks must be provided`. Only a temporary copy
   was repaired for this benchmark; the repository file was not changed.

## Preliminary run anomalies

An initial batch attempt failed during Codex setup because Harbor tried to
download the NVM installer from `raw.githubusercontent.com` and every container
hit `SSL_ERROR_SYSCALL`. That run was cancelled before any scored answer. The
temporary Node 24 installer override removed only that redundant setup edge.

The primary scored command's H8 exclude pattern did not match Harbor's local
task name. H8 started unintentionally and was stopped as soon as it appeared;
its main container and egress sidecar were terminated. Harbor therefore records
one H8 `RuntimeError`, but H8 produced no reward and is excluded from every
score in this report.

## Conclusion

**The requested Codex + `gpt-5.6-luna` with-skill benchmark completed for all
18 tasks other than H8.** The combined result is reward `15.15/18`, mean
`0.8417`, with 13 perfect tasks. The strongest results were the hands-on
install/cold-boot migrations and S1-S4 static assessments. The main weaknesses
were Remote error-flow reasoning (H6), corridor net-state reasoning (S6), and
registry/prerelease installation reasoning (S7). H7 was operationally strong
but lost 10 points for omitting the explicit render assertion.

The final execution-contract check still reports all 19 prompts using
`BENCHMARK-AUTH-v1`. The host worktree retained its pre-existing changes; all
agent source changes and verification assets stayed in isolated Harbor
containers and `/private/tmp` result directories.
