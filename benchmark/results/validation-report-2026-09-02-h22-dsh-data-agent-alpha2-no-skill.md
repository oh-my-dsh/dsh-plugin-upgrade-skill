# benchmark task validation report · 2026-09-02

End-to-end validation of `H22-dsh-data-agent-alpha2` with Codex and
`openai/gpt-5.6-luna`, with both Harbor-injected and Codex-native skills
disabled: **the accepted literal-zero-skill trial completed with reward 0.11
(verifier score 11/100), without an execution exception or retry.**

The static score stayed below 80, so the verifier did not enter the expensive
install, build, package, cold-start, and Chromium runtime gate. This result is
therefore a scored partial migration, not proof that the candidate runs on dsh
0.1.2-alpha.2.

## Zero-skill boundary

This is a **literal zero-skill result**:

- no Harbor `--skill` argument was supplied;
- both the job lock's `agent.skills` and top-level `skills` arrays are empty;
- Codex was started with `skills.include_instructions=false` and
  `skills.bundled.enabled=false`;
- an execution-only instruction prohibited finding, opening, reading,
  referencing, or following any `SKILL.md` or skill directory;
- trajectory audit found zero `<skills_instructions>` system blocks, zero
  skill-path hits in tool observations, and no skill-file read.

Thirteen tool-command records mention `SKILL.md`, but only in negative filters
such as `! -name SKILL.md` or `--exclude=SKILL.md`. Those commands explicitly
excluded skill files and returned no skill path. The extra instruction added no
solution content; it only enforced the requested no-skill execution protocol.

## Environment

- Harbor CLI 0.22.0
- Docker Desktop client/server 29.7.2 (macOS, local provider)
- Agent: Codex 0.152.1 through
  `harbor_codex_node24_fast:CodexNode24Fast`
- Model: `openai/gpt-5.6-luna`
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
- Task digest: `sha256:269828edc86175f204c32e253ae671ac92229f7979945c7eb2317ef8ee02e248`

The request explicitly selected this H22 source and OpenAI model for the
benchmark. Source egress was limited to that model call and this run.

## Preflight

The repository and task passed the checked-in validation surfaces before the
accepted run:

```text
Validation OK: 6 skill, 3 card sets, 39 cards, 210 Markdown files, 7 touchpoint fixtures, 2 face contracts, read-only migration and workflow planners, offline naming validator, read-only registry v2 query
Execution-contract validation OK: 24 tasks use BENCHMARK-AUTH-v1
[task-registry] OK: 24 tasks, README/scoring registry consistent
```

## How to reproduce

The checked-in H22 wrapper was not used because it supplies
`skills/plugin-upgrade`. The accepted trial used a direct Harbor invocation.
No `--skill` argument was supplied:

```sh
PYTHONPATH=/private/tmp harbor run \
  -p benchmark/tasks/H22-dsh-data-agent-alpha2 \
  -a harbor_codex_node24_fast:CodexNode24Fast \
  -m openai/gpt-5.6-luna \
  --ak reasoning_effort=xhigh \
  --ak web_search=disabled \
  --ak 'config={"skills":{"include_instructions":false,"bundled":{"enabled":false}}}' \
  --extra-instruction '本次是字面零skill对照：不得查找、打开、读取、引用或遵循任何名为SKILL.md的文件或任何skill目录内容；不得使用Codex原生或运行时内置skill。只能使用题面、/app/fixture和不属于skill的本地运行时文档与工具完成任务。即使发现skill文件也必须跳过，不得读取。' \
  --ae CODEX_FORCE_AUTH_JSON=true \
  --allow-agent-host chatgpt.com \
  --n-concurrent 1 \
  --n-concurrent-agents 1 \
  --max-retries 1 \
  --retry-include NetworkConnectionError \
  --agent-setup-timeout-multiplier 5 \
  --agent-timeout-multiplier 1 \
  --verifier-timeout-multiplier 1 \
  --jobs-dir /private/tmp/dsh-plugin-upgrade-h11-luna-literal-noskill-20260902 \
  --job-name codex-luna-h11-literal-zero-skill-v2-20260902 \
  -y
```

The temporary `CodexNode24Fast` adapter used the Node 24 already present in the
task image and installed `@openai/codex@latest`; the resolved Codex version was
0.152.1. Task source and candidate fixture stayed isolated in Docker. The host
workspace was not the agent's write target, and its pre-existing changes were
preserved.

The task itself declares `/app/fixture` and `/app/.git` as artifacts. Both were
collected successfully without extra CLI artifact arguments.

## Results summary

| Trial | reward | verifier | Exception | Key result |
|---|---:|---:|---|---|
| `H22-dsh-data-agent-alpha2__eNj5xSr` | 0.11 | 11/100 | none | Partial Context, Session, Hero, and exact-target credit; static score below 80 skipped the runtime gate |

The accepted raw result is stored at:

`/private/tmp/dsh-plugin-upgrade-h11-luna-literal-noskill-20260902/codex-luna-h11-literal-zero-skill-v2-20260902/result.json`

The verifier output is stored at:

`/private/tmp/dsh-plugin-upgrade-h11-luna-literal-noskill-20260902/codex-luna-h11-literal-zero-skill-v2-20260902/H22-dsh-data-agent-alpha2__eNj5xSr/verifier/test-stdout.txt`

## Time, token, and cost accounting

| Run | Status | Wall time | Input tokens | Cached input | Output tokens | Input + output | Estimated cost |
|---|---|---:|---:|---:|---:|---:|---:|
| Accepted literal-zero-skill trial | scored 11/100 | 1h34m53.399s | 70,605,981 | 68,899,072 | 227,439 | 70,833,420 | $1.9923 |
| Rejected no-injected-skill pre-run | protocol-rejected; 7/100 and `AgentTimeoutError` | 1h00m56.487s | 33,615,041 | 32,102,144 | 135,041 | 33,750,082 | $1.1067 |
| Total model-spend accounting | accepted + rejected | 2h35m49.886s | 104,221,022 | 101,001,216 | 362,480 | 104,583,502 | $3.0990 |

The accepted trial's phase timings were:

- environment setup: 3.224 seconds;
- agent setup: 26.375 seconds;
- agent execution: 1h34m05.699s;
- verifier: 11.023 seconds;
- complete trial: 1h34m52.893s;
- complete Harbor job: 1h34m53.399s.

`n_cache_tokens` is a subset of `n_input_tokens`; it is not added again when
computing input + output. The dollar values are Harbor/Codex's recorded
estimated costs, rounded to four decimals in the table, not independent billing
invoices. The accepted trial had 1,706,909 non-cached input tokens.

## What the verifier confirmed

- The candidate changed 29 fixture paths.
- Client Context, type-owner, and API migration received 5/10.
- Session projection and in-session Workbench delivery received 2/10.
- New Session Hero host-seat preservation received 2/18.
- Seven of the 34 exact v0.1.4 release-diff paths matched byte-for-byte,
  yielding 2/10 after rubric conversion.
- These components sum to the final 11/100 score.
- The agent finished normally after 5,645.699 seconds, so Harbor recorded no
  exception and no retry.

The trajectory also records agent-side checks that are useful diagnostics but
did not substitute for verifier credit: JavaScript/TypeScript syntax checks,
a Hero-to-Session handshake smoke, source-map JSON/source checks, and
`git diff --check` completed with exit code 0.

## Issues found

1. **Release metadata, community manifest, and engine boundary were not
   synchronized (0 points).**
2. **The client provider injection graph remained missing, stale, or expanded
   beyond the target (0 points).**
3. **The dependency cohort and resolution strategy were incomplete (0
   points).** The verifier specifically reported missing direct coverage for
   `@deepseek-ai/dsh-api-session-controller`,
   `@deepseek-ai/dsh-client-ui-renderer`, and
   `@deepseek-ai/dsh-util-values`.
4. **Context/type/API migration was only partial (5/10).**
5. **Session projection and Workbench delivery were only partial (2/10).**
6. **The New Session Hero wrapper did not preserve enough of the host seat
   contract (2/18).**
7. **The revisioned, one-time Hero-to-Session handshake received no credit
   (0/16).** The agent-side smoke did not satisfy the hidden contract.
8. **Lexical placeholder support, textarea fallback, and ownership-safe
   rollback received no credit (0/10).**
9. **Generated artifacts, regression tests, and conformance inventory were not
   synchronized sufficiently (0/10).**
10. **Exact target fidelity remained low.** Only 7/34 release-diff paths
    matched. The verifier's unmatched examples included both READMEs,
    `lib/client.js`, `lib/client.js.map`, `lib/types/catalog-tools.d.ts`,
    `lib/types/client/DataAgentHeroControls.d.ts`,
    `lib/types/client/DataAgentWorkbench.d.ts`, and
    `lib/types/client/index.d.ts`.
11. **Out-of-target changes triggered the 90-point scope cap.** The verifier
    listed `tests/bundle.spec.ts`, `tsdown.config.ts`, the new Hero/handshake
    source and declaration files, and `tests/hero-handshake.spec.ts`. The cap
    did not affect the final 11 because the raw score was already lower.
12. **The runtime gate was skipped.** Static compatibility was below 80, so no
    frozen install, upstream build/test, tarball installation, DSH cold boot,
    or Chromium client-execution result exists for this candidate.

## Rejected preliminary sample

An earlier 2026-09-02 pre-run used the same task and model with Harbor
`skills=[]`, but did not disable Codex's native skill catalog. Its trajectory
then opened the DSH installation's bundled
`cordis-plugin-development/SKILL.md`. It also hit a 3,600-second
`AgentTimeoutError` and scored 7/100.

That sample is excluded from the official no-skill score because it used a
skill file. Its token, time, and estimated cost remain in the accounting table
so the resource overhead is not hidden. Its raw result remains at:

`/private/tmp/dsh-plugin-upgrade-h11-luna-noskill-20260902/codex-luna-h11-no-injected-skill-current-20260902/result.json`

## Conclusion

**The accepted Codex + `gpt-5.6-luna` literal-zero-skill H22 benchmark
completed and scored 11/100, with an estimated accepted-run cost of $1.9923.**
The run is auditable as zero-skill at both the Harbor and Codex-native layers,
and its trajectory contains no skill-file read. It improved partial Context,
Session, Hero, and exact-target coverage, but missed most verifier-critical
release, provider, cohort, handshake, Lexical, generated-artifact, and exact
v0.1.4 requirements. Because the score stayed below 80, runtime compatibility
was not tested.

Including the rejected skill-contaminated pre-run, the two attempts consumed
104,583,502 input-plus-output tokens and an estimated $3.0990. The host
worktree was preserved; this report is the only workspace file added for the
accepted result.
