# benchmark v2.1 · Codex + plugin-upgrade live validation report

> Validation date: 2026-08-31 (Asia/Shanghai)
>
> Protocol: `BENCHMARK-AUTH-v1`
>
> Agent under test: Codex 0.151.0, `openai/gpt-5.6-sol`, `reasoning_effort=xhigh`
>
> Skill under test: the repo's original `skills/plugin-upgrade/`, unmodified before
> and after the test
>
> Bottom line: **all 6 tasks scored verifier 100/100 and reward 1.0; the effective
> trials average 1.000.**

Scope note: this report records the 6 tasks that existed at repo HEAD
`40a3f108441a`. Upstream `main` has since added S3-snapshot-migration and
H4-tsbuildinfo-trap; they are not part of this report's measured results and are not
covered by this document's "6/6". This PR only added the same-version authorization
contract and static validation for the two new tasks.

## 1. Interpreting the conclusion

This is not an oracle self-check: the repo's `plugin-upgrade` skill was actually
attached to Codex, which read the prompts, made plans, and modified or scanned the
fixtures inside fresh Harbor Docker trials, with each task's own verifier grading in
the same container.

Final effective results:

- all 5 tasks that reached agent/verifier in the main batch passed;
- H3's agent did not start the first time because of a Docker Hub TLS handshake
  timeout during environment build;
- H3 was then re-run as a single task with the exact same agent, model, skill, and
  timeout configuration, and passed;
- across the 6 effective trials combined: **6/6 passed, 600/600, mean reward 1.000**;
- no old reports, oracle outputs, or historical trials were used to make up scores.

Harbor's raw main-batch mean is 0.833 because it counted H3's image-pull failure in
the denominator of 6. This document's "6/6" is 5 valid main-batch trials plus 1 H3
re-run trial under the same configuration; both readings are kept separate rather
than dressing up an infrastructure failure as an all-green main batch.

## 2. Environment and execution configuration

| Item | Actual value |
| --- | --- |
| Repo HEAD | `40a3f108441a` |
| Current branch | `docs/plugin-upgrade-client-runtime-api-guide` |
| Harbor | 0.22.0 |
| Docker | client 29.7.2 / server 29.7.2 |
| Task environment | Docker; hands-on tasks use `node:24-bookworm` and `@deepseek-ai/dsh@0.1.2-alpha.2` |
| Agent | Codex 0.151.0 |
| Model | `openai/gpt-5.6-sol` |
| Reasoning effort | `xhigh` |
| Skill | `./skills/plugin-upgrade` |
| Authorization protocol | `BENCHMARK-AUTH-v1` for all 6 tasks |
| Concurrency | 3 trials; Codex agent concurrency cap 3 |
| Agent timeout | 3× the task default, i.e. 900 seconds |
| Exported assets | `/app/fixture`, `/app/agent-output` |

Actual command for the main batch:

```sh
/private/tmp/dsh-plugin-upgrade-uv-cache/archive-v0/uQQ6k0y5JkgEljkkqXGUZ/bin/harbor run \
  -p benchmark/tasks \
  -a codex \
  -m openai/gpt-5.6-sol \
  --skill ./skills/plugin-upgrade \
  --ak reasoning_effort=xhigh \
  --ae CODEX_FORCE_AUTH_JSON=true \
  --artifact /app/fixture \
  --artifact /app/agent-output \
  --n-concurrent 3 \
  --n-concurrent-agents 3 \
  --agent-timeout-multiplier 3 \
  --job-name codex-plugin-upgrade-all6-auth-v1-rerun-15m-20260831 \
  -y
```

The H3 re-run only changed `-p` to `benchmark/tasks/H3-client-plane` and concurrency
to 1; the agent, model, skill, authorization, asset, and timeout settings stayed the
same.

Static gate run before execution:

```text
Execution-contract validation OK: 6 tasks use BENCHMARK-AUTH-v1
```

## 3. Effective results of the six tasks

| Task | Effective trial | Trial wall-clock | Key verifier evidence | reward |
| --- | --- | ---: | --- | ---: |
| S1-static-scan | `S1-static-scan__LbnKi7n` | ~16m28s | fixture unchanged; read a 305-line report; hit the required cards and correctly folded `DSH-0.1.2-A1-02` → `DSH-0.1.2-A2-01` | 1.0 |
| S2-negative-scan | `S2-negative-scan__GYnXmPG` | ~11m24s | report mapped the only #3 hit to `DSH-0.1.2-A1-01`; accounted for six zero-hit categories; stated clearly that zero hits ≠ compatibility and demanded real verification | 1.0 |
| M1-host-migration | `M1-host-migration__KVw7Ruz` | ~10m56s | fixture modified; `dsh plugin add` succeeded; cold boot without pending, reaching the host application layer | 1.0 |
| H1-plane-trap | `H1-plane-trap__r2JCS6h` | ~13m58s | not misled by the comment into client `remote`; switched to Host `llm` injection; install and cold-boot activation succeeded | 1.0 |
| H2-baseline-trap | `H2-baseline-trap__745Q48u` | ~13m52s | pre-existing failing test file untouched; report attributed correctly; cold boot after migration succeeded | 1.0 |
| H3-client-plane | `H3-client-plane__KQoJfzh` | ~15m53s | top-level `dsh.client.platform=web`; install succeeded; host side without pending; real `__DSH_BOOT__.entries` contains the plugin | 1.0 |

### S1-static-scan

Codex explicitly treated the task as a read-only scan: it did not install or execute
the fixture and only wrote the report to the permitted output directory. The verifier
read:

```text
S1-static-scan/touchpoint-report.md (305 lines)
score=100/100
fixture not modified
```

The trajectory also shows the agent did not copy the planner's candidate card set
wholesale; it manually dropped the cards that did not apply under the same touchpoint
and handled the `SessionEvent.ignorable` corridor recovery per the final target
version.

### S2-negative-scan

Codex narrowed the only real hit down to the old Host `apiProxy` and mapped it to
`DSH-0.1.2-A1-01`; it did not misreport ordinary Cordis composition, strings, or
filenames as any of the other six touchpoint categories. The report also lists the
scan scope, the zero-hit categories, residual uncertainty, and the real verification
ladder for after the migration.

```text
S2-negative-scan/report.md (122 lines)
score=100/100
```

### M1-host-migration

Codex first reproduced `pending (waiting for service: apiProxy)`, then migrated the
Host-plane plugin to the `llm` domain service and removed the dead dependency. After
a fresh install into a new isolated profile, the entry activated and
`llm.listProviders()` was called successfully; an empty catalog returned by the
isolated environment is not a failed call.

After its own independent reinstall, the verifier concluded `dsh plugin add`
succeeded and the plugin tree had no pending; the subsequent `MISSING_CREDENTIAL`
occurred at the host application layer, an expected boundary of a keyless
environment.

### H1-plane-trap

A community memo comment in the task nudges toward swapping the injection name
straight to the client plane's `remote`. Codex called this a plane error already in
the planning stage and finally chose the Host plane's `llm` injection with
`listProviders()`. The verifier checked the actual code, an independent install, and
a cold boot — all passed.

### H2-baseline-trap

Codex ran a baseline before any migration change, recording the name, error type,
and actual/expected of the only pre-existing failing test; after migration the
failure fingerprint stayed identical and the test file's SHA-256 did not change. It
did not touch the test to manufacture an all-green result.

```text
H2-baseline-trap/migration-report.md (114 lines)
score=100/100: baseline attribution 60 + cold boot 40
```

### H3-client-plane

Codex first reproduced the baseline of "host side activated, but the real page boot
manifest has no plugin", then added the top-level `dsh.client` declaration, the
client factory/injection, and RemoteResult handling. The re-run completed:

1. `dsh plugin add` and composed config check;
2. real cold boot with `dsh web --no-open --port 0`;
3. Cookie exchange via the real token URL;
4. read `__DSH_BOOT__.entries` from the page;
5. request the host-advertised plugin assets and confirm HTTP 200;
6. execute the bundle actually delivered by the server, verifying the factory, Cordis
   injection, plugin DOM markers, and the Remote success flow.

The container has no Chromium, Firefox, Playwright, or Puppeteer, so the agent did
not claim full GUI automation; the verifier's formal full-score boundary is
boot-manifest roster recognition, which was satisfied.

## 4. Unattended authorization and skill-usage audit

In all 6 effective trajectories, the first phase recognized the authorization
semantics of the prompt: do a read-only inventory and plan first, then execute
directly, without stopping to ask the user to confirm again. Typical trajectory
statements include:

- H1: the prompt explicitly authorizes; no waiting for a second confirmation after
  planning;
- H2: the unattended authorization covers the plan confirmation the skill normally
  requires;
- M1: implement directly once a concrete migration plan is formed;
- S1/S2: read-only on the fixture, writing only to the designated report directory;
- H3: the authorization covers fixture-write confirmation, followed by the install
  and the web cold boot.

The authorization did not loosen the task boundaries: for S1/S2 the in-container
Git/verifier proves zero fixture changes; H2's pre-existing failing test was
untouched; the hands-on tasks modified only the task fixture and created only
isolated local verification assets. The repo's own `skills/` directory shows no diff
before or after this test run.

## 5. Raw jobs and re-run records

### 1. 300-second calibration batch: void, excluded from results

Started with the task default agent timeout, S1 hit `AgentTimeoutError` at 300.0
seconds. The trajectory shows it had finished the skill/corridor reading and manual
review but had not yet written the report, so the verifier scored 0 for "missing
report". After confirming the runner's time budget was the problem, the batch was
terminated deliberately: H1, M1, H2 ended as `CancelledError`, and S2, H3 had not
started. This batch is not part of this document's 6-task scores.

```text
jobs/codex-plugin-upgrade-all6-auth-v1-rerun-20260831/
job id: 20e1a96f-3c50-4c94-b960-9210479df1df
```

### 2. Authoritative main batch: 5 passed, H3 environment-build failure

```text
jobs/codex-plugin-upgrade-all6-auth-v1-rerun-15m-20260831/
job id: 9ce7ee7e-1dfa-4dac-bf8f-1856c59aa099
Harbor raw stats: 5 reward=1.0, 1 RuntimeError, mean=0.8333333333
```

H3's first failure occurred during environment build, with 0 agent tokens and the
error:

```text
node:24-bookworm: failed to resolve source metadata
Head https://registry-1.docker.io/v2/library/node/manifests/24-bookworm
net/http: TLS handshake timeout
```

This is not a semantic failure of the task, the skill, or the agent.

### 3. H3 re-run with the same configuration: passed

```text
jobs/codex-plugin-upgrade-h3-auth-v1-rerun-15m-20260831/
job id: 21b83720-43ad-40d5-bb0e-ac45b3bbfc7e
trial: H3-client-plane__KQoJfzh
reward=1.0, exception=0, mean=1.000
```

## 6. Resource consumption

| Basis | input tokens | cache tokens | output tokens | cost USD |
| --- | ---: | ---: | ---: | ---: |
| Authoritative main batch | 8,689,381 | 8,107,776 | 70,477 | 6.9790704 |
| H3 effective re-run | 4,069,308 | 3,925,504 | 18,966 | 2.5247376 |
| 6 effective trials total | 12,758,689 | 12,033,280 | 89,443 | 9.5038080 |
| Voided 300-second calibration batch | 3,151,028 | 2,860,544 | 22,230 | 2.7507536 |
| Total actual consumption this run | 15,909,717 | 14,893,824 | 111,673 | 12.2545616 |

The authoritative main batch took 26m03s wall clock; the H3 re-run 15m53s. Because
the main batch ran 3 concurrent trials, the per-task wall-clock times cannot be
summed to get the batch duration.

## 7. Evidence and assets

Entry points for the authoritative results:

```text
jobs/codex-plugin-upgrade-all6-auth-v1-rerun-15m-20260831/result.json
jobs/codex-plugin-upgrade-h3-auth-v1-rerun-15m-20260831/result.json
```

Every effective trial keeps:

```text
agent/codex.txt
agent/trajectory.json
verifier/test-stdout.txt
verifier/reward.txt
artifacts/manifest.json
artifacts/app/fixture/
```

M1, H2, S1, and S2 also exported the reports the tasks required or the agent chose
to produce:

```text
M1-host-migration__KVw7Ruz/artifacts/app/agent-output/M1-host-migration/report.md
H2-baseline-trap__745Q48u/artifacts/app/agent-output/H2-baseline-trap/migration-report.md
S1-static-scan__LbnKi7n/artifacts/app/agent-output/S1-static-scan/touchpoint-report.md
S2-negative-scan__GYnXmPG/artifacts/app/agent-output/S2-negative-scan/report.md
```

H1 and H3 have no task-required `/app/agent-output`, so the artifact manifest records
that optional path as `failed`; both tasks' fixture exports are `ok`, which does not
affect the verifier results.

### Harbor redaction side effect

The value `true` passed via `--ae CODEX_FORCE_AUTH_JSON=true` was treated by Harbor
as a secret value. When downloading logs, trial `result.json` files, and exported
fixtures, every `true` with the same literal was replaced with `[REDACTED]`, so parts
of the downloaded JSON are no longer directly parseable and the exported fixtures are
no longer byte-for-byte copies.

This does not affect grading: each task's verifier runs inside the container, before
asset download and redaction, and S1/S2's zero changes and all hands-on tasks'
install/cold boot are judged from in-container state. When auditing downloaded
artifacts, rely on the verifier, the trajectory, and the artifact manifest instead —
do not byte-diff the redacted fixtures.

## 8. Conclusion and follow-up recommendations

**In this round, Codex with the original `plugin-upgrade` skill passed all 6 real
benchmark tasks under `BENCHMARK-AUTH-v1`: 6/6 effective, mean 1.000.**

This round demonstrates "one-shot completability with the skill", which by itself
does not prove the skill's statistical net gain. For a formal comparison of the
skill's effect, still:

1. run a without-skill control with the same prompts, agent, model, and
   authorization protocol;
2. repeat each condition at least 3 times and report the median, the spread, and
   infrastructure anomalies;
3. set an explicit agent cap of at least 900 seconds for Codex `xhigh`;
4. configure bounded retries for Docker registry TLS/pull failures;
5. avoid using common source literals (e.g. `true`) as environment variable values
   that would enter Harbor's secret-redaction list, or verify Codex compatibility
   before adopting an equivalent value.
