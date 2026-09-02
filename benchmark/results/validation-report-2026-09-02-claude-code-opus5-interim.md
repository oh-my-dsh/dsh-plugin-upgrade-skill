# benchmark interim report · Claude Code + Opus 5 paired run · 2026-09-02

> **Status: INTERIM — the run is incomplete.** 15 of the 23 snapshot tasks have
> complete 3-attempt data in both arms. This report is published so the
> infrastructure findings below are not lost and so the partial numbers are on
> record; **it should not be added to the model comparison table in
> `benchmark/README.md` until the remaining cells are filled.** Tracking issue: #100.

Paired `with-skill` / `without-skill` evaluation of `skills/plugin-upgrade`
using the Claude Code harness with `claude-opus-5`.

## Headline (complete cells only)

Over the **15 tasks with 3/3 attempts in both arms**:

| Metric | without-skill | with-skill | delta |
| --- | --- | --- | --- |
| Median of per-task medians (primary per #100) | 1.0000 | 1.0000 | **+0.0000** |
| Mean of per-task medians | 0.7113 | 0.8233 | **+0.1120** |
| Summed reward | 10.67/15 | 12.35/15 | +1.68 |
| Per-task win / loss / tie | — | 3 / 0 / 12 | — |
| Perfect tasks (both arms median 1.00) | 8 | 8 | — |

**The primary statistic requested in #100 — the median — shows no difference
(1.00 vs 1.00).** The mean moves +0.1120, but that movement rests on two tasks
(`S1-static-scan` +0.83, `S3-snapshot-migration` +0.60). 12 of 15 tasks are exact
ties, 8 of them because both arms saturate at 1.00. Read this as *not yet a
measurable effect on this subset*, not as a confirmed gain.

Two further reasons not to over-read the delta:

- **The complete subset is biased easy.** The two hardest tasks in the snapshot
  (`H8-fire-drill`, `H9-dsh-web-alpha2`) contribute nothing, and four more cells
  are partial. Whatever the skill does on long hands-on drills is exactly what is
  missing.
- **Ceiling effect.** 8 of 15 tasks score 1.00 in both arms and cannot express a
  difference in either direction.

## Per-task results (median of scored attempts)

| Task | without-skill | with-skill | Δ median | status |
| --- | --- | --- | --- | --- |
| `H1-plane-trap` | 1.00 (3/3) | 1.00 (3/3) | +0.00 | complete |
| `H10-browser-activation-trap` | 1.00 (3/3) | 1.00 (3/3) | +0.00 | complete |
| `H2-baseline-trap` | 1.00 (3/3) | 1.00 (1/3) | — | **incomplete** |
| `H3-client-plane` | 1.00 (3/3) | 1.00 (3/3) | +0.00 | complete |
| `H4-tsbuildinfo-trap` | 1.00 (3/3) | 1.00 (3/3) | +0.00 | complete |
| `H5-runtime-export-drift` | 1.00 (3/3) | 1.00 (3/3) | +0.00 | complete |
| `H6-remote-error-trap` | 0.00 (3/3) | 0.25 (3/3) | +0.25 | complete |
| `H7-locale-trap` | — (0/3) | — (0/3) | — | **no data** |
| `H8-fire-drill` | 0.72 (1/3) | — (0/3) | — | **incomplete** |
| `H9-dsh-web-alpha2` | — (0/3) | — (0/3) | — | **no data** |
| `M1-host-migration` | 1.00 (3/3) | 1.00 (3/3) | +0.00 | complete |
| `M2-optional-dep-trap` | 1.00 (3/3) | 1.00 (1/3) | — | **incomplete** |
| `M3-session-projection` | 1.00 (3/3) | 1.00 (3/3) | +0.00 | complete |
| `M4-peer-prerelease-range` | — (0/3) | — (0/3) | — | **no data** |
| `M5-token-auth-smoke` | 0.60 (3/3) | 0.60 (3/3) | +0.00 | complete |
| `S1-static-scan` | 0.17 (3/3) | 1.00 (3/3) | +0.83 | complete |
| `S2-negative-scan` | 0.60 (3/3) | — (0/3) | — | **incomplete** |
| `S3-snapshot-migration` | 0.40 (3/3) | 1.00 (3/3) | +0.60 | complete |
| `S4-legacy-client-imports` | 1.00 (3/3) | 1.00 (3/3) | +0.00 | complete |
| `S5-negative-naming` | 0.50 (3/3) | 0.50 (3/3) | +0.00 | complete |
| `S6-corridor-net-state` | 0.50 (3/3) | 0.50 (3/3) | +0.00 | complete |
| `S7-unpublished-cohort` | 0.50 (3/3) | 0.50 (3/3) | +0.00 | complete |
| `S8-release-routing-trap` | 1.00 (3/3) | 0.50 (2/3) | — | **incomplete** |

`(n/3)` is the number of attempts that produced a verifier reward. A Δ is shown
only where both arms have 3/3, so partial cells are never silently compared.

## Tokens and duration (per `benchmark/README.md`)

Totals cover **every** attempt launched in both rounds, including the errored
attempts listed under *Incomplete cells* — they consumed budget and are not
deducted.

| Round | Attempts | Tokens (input / cache / output) | Summed attempt duration | Cost |
| --- | --- | --- | --- | --- |
| without-skill | 66 | 124,235,724 / 121,068,425 / 1,232,352 | 14h39m43s | $121.0989 |
| with-skill | 66 | 171,156,936 / 166,142,091 / 1,447,290 | 14h30m44s | $168.8211 |
| **total** | 132 | 295,392,660 / 287,210,516 / 2,679,642 | 29h10m27s | **$289.92** |

Cache tokens are a subset of input tokens and must not be added to them.
Summed attempt duration is not wall-clock: attempts ran 3-way concurrent.
Wall-clock windows were 2026-09-01T11:37:42Z → 2026-09-02T00:10:08Z (round 1,
12h32m26s) and 2026-09-02T01:39:02Z → 02:13:44Z (round 2, stopped early).

The `with-skill` arm consumed **37.8% more input tokens** and **17.4% more output
tokens** than `without-skill` for a median gain of 0.00 on this subset. That cost
ratio is itself a result worth carrying into the final report.

## Environment

- Benchmark snapshot: `main@232b00a2331a397789f7d61c57067e73d12fdac0` (as frozen in #100)
- Skill: `skills/plugin-upgrade`, tree `f24c0e2cb81428d36456b64b4f613bd2c38e953b` (last touched by 556245e)
- Harbor CLI 0.22.0
- Claude Code 2.1.257
- Model: `claude-opus-5`, provider `anthropic`, `reasoning_effort=high`
- Docker 29.6.1, local Docker provider, Linux containers
- Host: Windows 11 Pro 10.0.26200, WSL2 kernel 6.6.87.2-microsoft-standard-WSL2
- Attempts per task/condition: 3 (`-k 3`); concurrency 3 (`-n 3`); `--max-retries 2`
- `--agent-setup-timeout-multiplier 3.0`, `--agent-timeout-multiplier 2.0`
- Round 2 additionally sets `--verifier-timeout-multiplier 2.0` (see finding 3)

### Deviation from the frozen snapshot

`benchmark/tasks/H7-locale-trap/task.toml` was patched locally to the
byte-identical content of upstream `ba7c702` (#105). Without it the task cannot be
resolved at all (finding 1). No H7 data is reported here — the fix only takes
effect in the pending round.

## How to reproduce

Per task and arm:

```sh
harbor run -p "benchmark/tasks/$TASK" -a claude-code -m claude-opus-5 \
  --ak reasoning_effort=high \
  --ae HTTPS_PROXY=... --ae HTTP_PROXY=... --ae NO_PROXY=... \
  --agent-setup-timeout-multiplier 3.0 --agent-timeout-multiplier 2.0 \
  --verifier-timeout-multiplier 2.0 \
  -k 3 -r 2 -n 3 \
  -o "$JOBS" --job-name "${TASK}__${ARM}" -q -y [--skill skills/plugin-upgrade]
```

`--skill skills/plugin-upgrade` is present in the `with-skill` arm only. Nothing
else differs between arms.

## Incomplete cells and why

| Cell | Attempts lost | Cause | Class |
| --- | --- | --- | --- |
| `H7-locale-trap` both arms | 6 | `task.toml` could not be parsed | task bug (finding 1) |
| `H9-dsh-web-alpha2` both arms | 6 | Docker provider rejects the task's `no-network` agent phase | environment (finding 2) |
| `M4-peer-prerelease-range` both arms | 6 | `NetworkConnectionError` during agent install | transient |
| `H8-fire-drill` both arms | 5 | `VerifierTimeoutError` at the 600s verifier cap | tooling (finding 3) |
| `S2-negative-scan` without-skill | 3 | `docker compose build` returned `0xC0000142` | transient (since re-run clean) |
| `S2-negative-scan` with-skill | 2 | `NetworkConnectionError` | transient |
| `H2-baseline-trap` with-skill | 2 | `NetworkConnectionError` | transient |
| `M2-optional-dep-trap` with-skill | 2 | `NetworkConnectionError` | transient |
| `S8-release-routing-trap` with-skill | 1 | `NetworkConnectionError` | transient |

**None of these are model failures and none are scored as zeros.** The 13
`NetworkConnectionError` losses all occurred in Harbor's Claude Code installer
step (`curl https://downloads.claude.ai/...` → `SSL_ERROR_SYSCALL`, exit 35),
before any model call. They were not recovered by `--max-retries 2`.

`S2-negative-scan/without-skill` was re-run to completion on 2026-09-02 and is the
one repaired cell included above (0.60 / 0.60 / 0.40, median 0.60). The remaining
cells are queued.

## Findings for the benchmark itself

**1. `H7-locale-trap/task.toml` was unparseable (independently hit, already fixed upstream).**
Line 6 carried `(/session\s*log/i)` inside a TOML *basic* string, where `\s` is an
illegal escape. The file failed to parse, so Harbor resolved zero tasks and exited
with `ValueError: Either datasets or tasks must be provided.` — an error that names
neither the file nor the task. We hit this before noticing #105 had landed the same
fix. Worth a task-registry check that every `task.toml` parses, so the next
occurrence fails with a pointer to the offending file.

**2. `H9-dsh-web-alpha2` cannot run on the Docker provider on a stock WSL2 kernel.**
The task requires `[agent] network_mode = "no-network"`. Harbor's Docker environment
only advertises `disable_internet` when the *daemon's* kernel passes a probe for
`CONFIG_NFT_FIB_INET=[ym]` in `/proc/config.gz`. The stock WSL2 kernel
(6.6.87.2-microsoft-standard-WSL2) does not set it, so every attempt dies in
`validate_network_policy_support` before the environment starts. Any
Docker-on-WSL2 contributor will lose this task. This is worth a documented
prerequisite; H9 is recorded here as **infra-blocked, not a model failure**.

Note for anyone tempted by the quick fix: switching H9's agent phase to `public`
is not equivalent. The task's own metadata carries `upstream_repository`,
`source_commit` and `target_commit`, so an online agent can fetch the reference
solution and the task stops measuring migration ability.

**3. The 600s verifier cap is too tight for `H8-fire-drill`.** Five of six attempts
died with `VerifierTimeoutError` while the agent phase itself had succeeded. Round 2
adds `--verifier-timeout-multiplier 2.0`; a contributor running H8 at the declared
`[verifier] timeout_sec` will otherwise lose most attempts to the harness rather
than to the task.

**4. Ceiling effect limits discrimination.** 8 of the 15 complete tasks score 1.00
in both arms. On the current snapshot a large part of the suite cannot register a
skill effect in either direction. If the goal is to measure the skill rather than
confirm the tasks are solvable, these tasks may need a harder variant, or should be
reported separately from the discriminating ones.

## Evidence

Raw Harbor output (`result.json`, trajectories, verifier logs, per-attempt
`metadata.json`) is retained locally per task/condition/attempt. #100 leaves open
whether raw jobs go to the repo, a release artifact, or stay as a desensitized
summary, so only this summary is submitted here. Say which you want and the raw
set will follow.

## Still open

- Remaining cells re-run: H7, H8, M4, and the `with-skill` halves of S2, H2, M2, S8
- H9 needs a provider with `disable_internet` support, or is dropped from this round
- Native skill catalog / baseline contamination: **not yet assessed**
- `generic-skill` condition: still blocked on #100's open question about a frozen corpus
