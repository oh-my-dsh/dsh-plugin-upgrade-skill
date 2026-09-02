# benchmark task validation report · 2026-09-02

End-to-end validation of `H22-dsh-data-agent-alpha2` with Codex,
`openai/gpt-5.6-luna`, and the Harbor-injected `skills/plugin-upgrade` skill:
**the scored trial completed with reward 0.08 (verifier score 8/100), without
an execution exception or retry.**

The static score stayed below 80, so the verifier did not enter the expensive
frozen-install, build, package, cold-start, and Chromium runtime gate. This is
therefore a scored partial migration, not proof that the candidate runs on dsh
0.1.2-alpha.2.

## Skill boundary

This run used the requested skill through Harbor's injection mechanism:

- the CLI supplied `--skill` with the checked-in `skills/plugin-upgrade`
  directory;
- the trial lock records that path in `agent.skills` and a top-level skill
  named `plugin-upgrade`;
- the locked skill digest is
  `sha256:80b378072ffcef9cd6ab1aa87ace5f3ee3d53f8e05c9be987688e86f0956dc06`;
- the trajectory shows Codex reading the injected `SKILL.md`, its pre-flight
  guide, version cards, API ledger, and real migration example before and
  during implementation.

## Environment

- Harbor CLI 0.22.0
- Docker Desktop client/server 29.7.2 (macOS, local provider)
- Agent: Codex 0.152.1 through
  `harbor_codex_node24_fast:CodexNode24Fast`
- Model: `openai/gpt-5.6-luna`
- Harbor-injected skill: `skills/plugin-upgrade`
- Reasoning effort: `xhigh`
- Provider-side web search: disabled
- Agent container network: task-declared `no-network`; only `chatgpt.com` was
  allowed during the agent phase for model connectivity
- Agent timeout: task-declared 18,000 seconds; multiplier `1.0`
- Verifier timeout: task-declared 900 seconds; multiplier `1.0`
- Agent setup timeout multiplier: `5.0`
- Concurrency: one trial / one agent phase
- Retry policy: at most one `NetworkConnectionError` retry; no retry occurred
- Verifier environment: separate container with task-declared public network
- Task digest:
  `sha256:269828edc86175f204c32e253ae671ac92229f7979945c7eb2317ef8ee02e248`

The request explicitly selected this H22 source and OpenAI model for the
benchmark. Source egress was limited to that model call and this run.

## Preflight

The repository and task passed the checked-in validation surfaces before the
scored run:

```text
Validation OK: 6 skill, 3 card sets, 39 cards, 210 Markdown files, 7 touchpoint fixtures, 2 face contracts, read-only migration and workflow planners, offline naming validator, read-only registry v2 query
Execution-contract validation OK: 24 tasks use BENCHMARK-AUTH-v1
[task-registry] OK: 24 tasks, README/scoring registry consistent
```

The resolved Harbor lock contained exactly one task,
`H22-dsh-data-agent-alpha2`, with the requested model, skill, and concurrency.

## How to reproduce

The scored trial used this Harbor invocation:

```sh
PYTHONPATH=/private/tmp CODEX_FORCE_AUTH_JSON=true \
harbor run \
  -p benchmark/tasks/H22-dsh-data-agent-alpha2 \
  -a harbor_codex_node24_fast:CodexNode24Fast \
  -m openai/gpt-5.6-luna \
  --skill /Users/yejiming/Desktop/OpenSource/dsh-plugin-upgrade-skill/skills/plugin-upgrade \
  --ak reasoning_effort=xhigh \
  --ak web_search=disabled \
  --ae CODEX_FORCE_AUTH_JSON=true \
  --allow-agent-host chatgpt.com \
  --n-concurrent 1 \
  --n-concurrent-agents 1 \
  --max-retries 1 \
  --retry-include NetworkConnectionError \
  --agent-setup-timeout-multiplier 5 \
  --agent-timeout-multiplier 1 \
  --verifier-timeout-multiplier 1 \
  --jobs-dir /private/tmp/dsh-plugin-upgrade-h11-luna-skill-20260902 \
  --job-name codex-luna-h11-plugin-upgrade-v2-20260902 \
  -y
```

The temporary Node 24 adapter installed `@openai/codex@latest`; the resolved
Codex version was 0.152.1. Task source and candidate fixture stayed isolated
in Docker. The host workspace was not the agent's write target, and its
pre-existing changes were preserved.

The task declares `/app/fixture` and `/app/.git` as artifacts. Both were
collected successfully without extra CLI artifact arguments.

## Results summary

| Trial | reward | verifier | Exception | Key result |
|---|---:|---:|---|---|
| `H22-dsh-data-agent-alpha2__eeNaYJK` | 0.08 | 8/100 | none | Partial Context, Session, Hero, and exact-target credit; static score below 80 skipped the runtime gate |

The raw job result is stored at:

`/private/tmp/dsh-plugin-upgrade-h11-luna-skill-20260902/codex-luna-h11-plugin-upgrade-v2-20260902/result.json`

The verifier output is stored at:

`/private/tmp/dsh-plugin-upgrade-h11-luna-skill-20260902/codex-luna-h11-plugin-upgrade-v2-20260902/H22-dsh-data-agent-alpha2__eeNaYJK/verifier/test-stdout.txt`

## Time, token, and cost accounting

| Run | Status | Wall time | Input tokens | Cached input | Non-cached input | Output tokens | Input + output | Estimated cost |
|---|---|---:|---:|---:|---:|---:|---:|---:|
| Scored plugin-upgrade trial | scored 8/100 | 3h58m55.457s | 143,377,248 | 138,872,576 | 4,504,672 | 445,689 | 143,822,937 | $4.2132 |

The scored trial's phase timings were:

- environment setup: 5.783 seconds;
- agent setup: 25.510 seconds;
- agent execution: 3h58m01.472s;
- verifier: 10.926 seconds;
- complete trial: 3h58m50.508s;
- complete Harbor job: 3h58m55.457s.

`n_cache_tokens` is a subset of `n_input_tokens`; it is not added again when
computing input + output. Cached input was 96.86% of metered input. The final
Codex usage event also reports 242,131 reasoning-output tokens, which are a
subset of the 445,689 output tokens rather than an additional chargeable
total. The dollar value is Harbor/Codex's recorded estimated cost, rounded to
four decimals, not an independent billing invoice; it excludes local Docker
compute and storage.

## What the verifier confirmed

- The candidate changed 24 fixture paths.
- Client Context, type-owner, and API migration received 3/10.
- Session projection and in-session Workbench delivery received 2/10.
- New Session Hero host-seat preservation received 2/18.
- Three of the 34 exact v0.1.4 release-diff paths matched byte-for-byte,
  yielding 1/10 after rubric conversion.
- These components sum to the final 8/100 score.
- The agent finished normally after 14,281.472 seconds, so Harbor recorded no
  exception and no retry.

The trajectory also records agent-side checks that are useful diagnostics but
did not substitute for verifier credit: JavaScript syntax checks,
`git diff --check`, source-map source-content checks, a cohort scan, and
`pnpm pack --dry-run` completed successfully. Full install, typecheck, Vitest,
conformance, and Chromium E2E were not run by the agent because the closed-book
container lacked a complete offline dependency cache.

## Issues found

1. **Release version, community manifest, and engine boundary were not
   synchronized to the exact target (0 points).**
2. **The client provider injection graph remained missing, stale, or expanded
   beyond the target (0 points).**
3. **The dependency cohort or resolution strategy was incomplete (0
   points).** The verifier specifically reported missing direct coverage for
   `@deepseek-ai/dsh-util-values`.
4. **Context/type/API migration was only partial (3/10).**
5. **Session projection and Workbench delivery were only partial (2/10).**
6. **The New Session Hero wrapper did not preserve enough of the host seat
   contract (2/18).**
7. **The revisioned, one-time Hero-to-Session handshake received no credit
   (0/16).**
8. **Lexical placeholder support, textarea fallback, and ownership-safe
   rollback received no credit (0/10).**
9. **Generated artifacts, regression tests, and conformance inventory were not
   synchronized sufficiently (0 points).**
10. **Exact target fidelity remained very low.** Only 3/34 release-diff paths
    matched. The verifier's unmatched examples included both READMEs,
    `lib/client.js`, `lib/client.js.map`, `lib/types/catalog-tools.d.ts`,
    `lib/types/client/DataAgentHeroControls.d.ts`,
    `lib/types/client/DataAgentWorkbench.d.ts`, and
    `lib/types/client/analysis-view-model.d.ts`.
11. **Out-of-target changes triggered the 90-point scope cap.** The verifier
    listed `lib/types/client/locales.d.ts`, `src/catalog-ai.ts`, and
    `src/client/locales.ts`. The cap did not affect the final 8 because the raw
    score was already lower.
12. **The runtime gate was skipped.** Static compatibility was below 80, so no
    verifier-backed frozen install, upstream build/test, tarball installation,
    DSH cold boot, or Chromium client-execution result exists for this
    candidate.

## Run anomalies

- A preliminary job-name/config collision failed before model execution. It
  consumed no model tokens or cost and is excluded from the scored accounting.
- Agent setup logged image-OS inspection warnings, but setup completed and the
  trial has no exception.
- Near the end of the agent phase, Codex logged a timeout while refreshing the
  optional available-model list. The task continued to a normal agent result;
  it was not a Harbor `NetworkConnectionError` or `AgentTimeoutError`.
- Harbor's sanitized trial-level `result.json` and `lock.json` contain a raw
  `[REDACTED]` placeholder in `environment.delete`, so they are not strict JSON
  for tools such as `jq`. The job-level `result.json`, verifier output, and
  timestamps remain readable and internally consistent.

## Single-sample comparison with literal zero-skill

The same-day accepted literal-zero-skill report provides a useful local
comparison. It is not a causal estimate of skill quality: each row is one
stochastic trial, and the zero-skill row additionally disabled Codex's native
skill catalog.

| Condition | Score | Exact target | Wall time | Input + output | Estimated cost |
|---|---:|---:|---:|---:|---:|
| Harbor `plugin-upgrade` skill | 8/100 | 3/34 | 3h58m55.457s | 143,822,937 | $4.2132 |
| Literal zero-skill | 11/100 | 7/34 | 1h34m53.399s | 70,833,420 | $1.9923 |

In this pair, the skill-injected trial scored 3 points lower while using
2.03x the input-plus-output tokens, 2.52x the wall time, and 2.11x the
estimated cost. The comparison shows that this particular skill run did not
improve H22 performance; it does not establish that the skill generally
reduces performance.

## Conclusion

**The requested Codex + `gpt-5.6-luna` + `plugin-upgrade` H22 benchmark
completed and scored 8/100, using 143,822,937 input-plus-output tokens over
3h58m55.457s at an estimated cost of $4.2132.** Skill injection and use are
proven by the Harbor lock and trajectory, and the run completed without an
exception or retry. Most verifier-critical exact-release, provider, cohort,
handshake, Lexical, and generated-artifact requirements remained unsatisfied;
because the score stayed below 80, runtime compatibility was not tested.

The host worktree was preserved. Candidate changes and verification outputs
remain in the isolated Harbor artifact directory; this report is the only
workspace file added for the skill-injected run.
