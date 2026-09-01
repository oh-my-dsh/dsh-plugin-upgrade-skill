# benchmark task validation report · 2026-09-01

End-to-end validation of the 18 tasks under `benchmark/tasks` other than
`H8-dsh-web-alpha2`, with Codex and `openai/gpt-5.6-luna`, with no Harbor
skill supplied: **all 18 requested tasks produced verifier rewards, for a
combined reward of 12.42/18 and a mean reward of 0.6900 (verifier score
1242/1800).**

This is a **no Harbor-injected skill** result, not a fully clean literal
zero-skill result. Every Harbor job and trial lock records `skills: []`, but
Codex 0.152.0 still exposed its native system-skill catalog. Trajectory audit
found that H2 and H3 explicitly opened the native `plugin-creator` `SKILL.md`
and reference files. The remaining 16 trials have no command-level read of a
`SKILL.md` or skill reference; that uncontaminated subset scored 10.42/16,
with a mean of 0.6513.

## Environment

- Harbor CLI 0.22.0
- Docker Desktop 29.7.2 (macOS, local provider)
- Agent: Codex 0.152.0, model `openai/gpt-5.6-luna`
- Harbor-injected skill: none (`--skill` omitted; job and trial locks contain
  empty skill arrays)
- Codex-native system skills: present in the agent system prompt; H2 and H3
  invoked native `plugin-creator`, which is reported as a protocol exception
- Reasoning effort: `xhigh`
- Main-batch concurrency: 4 trials / 4 agent phases
- Agent/verifier timeout multiplier: `2.0`
- Main retry policy: at most one retry for every exception other than
  `AgentTimeoutError`; the main job recorded five retries
- Supplemental retry policy: at most two retries other than
  `AgentTimeoutError`; none of the three supplemental jobs retried
- The user explicitly authorized sending all 18 task sources to OpenAI for
  this benchmark; `chatgpt.com` was allowed for model connectivity.

## How to reproduce

The primary job was run with the following Harbor configuration. No
`--skill` argument was supplied:

```sh
harbor run \
  -p benchmark/tasks \
  -x H8-dsh-web-alpha2 \
  -a codex \
  -m openai/gpt-5.6-luna \
  --ak reasoning_effort=xhigh \
  --ae CODEX_FORCE_AUTH_JSON=true \
  --allow-agent-host chatgpt.com \
  --n-concurrent 4 \
  --n-concurrent-agents 4 \
  --max-retries 1 \
  --retry-exclude AgentTimeoutError \
  --agent-timeout-multiplier 2 \
  --verifier-timeout-multiplier 2 \
  --jobs-dir /private/tmp/dsh-plugin-upgrade-closed-book-luna-20260901 \
  --job-name codex-luna-no-skill-except-h8-20260901 \
  -y
```

The main dataset loaded 17 tasks: H8 was excluded as requested, while H7 was
silently omitted because its checked-in `task.toml` is invalid TOML. H7 was
copied to `/private/tmp/dsh-plugin-upgrade-h7-loadable-20260901`; the only
change escaped the description's regex from `/session\s*log/i` to
`/session\\s*log/i`, preserving task semantics. It was then run separately
with the same agent, model, reasoning effort, connectivity, timeout
multipliers, and no `--skill` argument.

M2 and H6 exhausted the primary job's retry allowance during Codex setup, so
they were rerun individually with the same execution settings and no
`--skill`. H7, M2, and H6 used one trial / one agent phase each and produced
the supplemental rewards selected below.

Task sources and candidate fixtures were isolated in Docker. The host
workspace was not used as an agent write target, and its pre-existing changes
were preserved.

## Results summary

| Task | reward | verifier | Key result |
|---|---:|---:|---|
| `H1-plane-trap` | 1.0 | 100/100 | Injected host-plane `llm`, installed successfully, and cold-booted with no pending plugin |
| `H2-baseline-trap` | 1.0 | 100/100 | Preserved and correctly attributed the pre-existing failing test; cold boot activated; **native-skill contaminated** |
| `H3-client-plane` | 1.0 | 100/100 | Added the top-level Web client declaration and appeared in `__DSH_BOOT__.entries`; **native-skill contaminated** |
| `H4-tsbuildinfo-trap` | 0.3 | 30/100 | Found the stale artifact and clean/rebuild path, but failed the explicit no-source-change conclusion and hit the nonexistent-reference trap |
| `H5-runtime-export-drift` | 1.0 | 100/100 | Aligned the settings cohort, packed and installed a tarball, and cold-booted without export or pending failures |
| `H6-remote-error-trap` | 0.0 | 0/100 | Produced a read-only report but omitted all four graded Remote error-flow migration requirements |
| `H7-locale-trap` | 1.0 | 100/100 | Replaced display-text matching with a stable `data-slot`, added an explicit render assertion, and reached the browser roster |
| `M1-host-migration` | 1.0 | 100/100 | Installed the fixture and reached the host application layer without pending entries |
| `M2-optional-dep-trap` | 1.0 | 100/100 | Moved the unconditionally imported package to `dependencies`; cold boot activated |
| `M3-session-projection` | 1.0 | 100/100 | Corrected profile composition while retaining `dsh-tool-todo`; cold boot activated |
| `M4-peer-prerelease-range` | 1.0 | 100/100 | Rewrote peer/dev bounds to `^0.1.2-alpha.2`; install and cold boot passed |
| `S1-static-scan` | 0.67 | 67/100 | Kept the fixture read-only and found A1-01 through A1-04, but missed A1-08 and A2-01 |
| `S2-negative-scan` | 0.6 | 60/100 | Explained zero-hit uncertainty and the need for verification, but failed to map the APIProxy hit to A1-01 |
| `S3-snapshot-migration` | 0.0 | 0/100 | Preserved the fixture but timed out after 600 seconds without writing the required report |
| `S4-legacy-client-imports` | 1.0 | 100/100 | Kept the fixture read-only and mapped all four required cards: A1-25, A1-26, A1-27, and A1-30 |
| `S5-negative-naming` | 0.5 | 50/100 | Correctly handled warning and unknown states, but omitted the `greet` judgment and misclassified the shared `events` channel |
| `S6-corridor-net-state` | 0.25 | 25/100 | Cited both corridor cards but missed the deletion conclusion, producer semantics, and `Session.append` gap |
| `S7-unpublished-cohort` | 0.1 | 10/100 | Named two legal paths, but missed registry/caret/exit discipline and prescribed an unpublished alpha.1, triggering the cap |

Distribution:

| reward | count |
|---:|---:|
| 1.0 | 10 |
| 0.67 | 1 |
| 0.6 | 1 |
| 0.5 | 1 |
| 0.3 | 1 |
| 0.25 | 1 |
| 0.1 | 1 |
| 0.0 | 2 |

The primary raw result remains in the uncommitted local artifact
`/private/tmp/dsh-plugin-upgrade-closed-book-luna-20260901/codex-luna-no-skill-except-h8-20260901/result.json`.
The supplemental local results are under
`/private/tmp/dsh-plugin-upgrade-closed-book-luna-supplement-20260901/` for H7
(`h7-locale-trap-codex-luna-no-skill-20260901/result.json`), M2
(`m2-optional-dep-trap-codex-luna-no-skill-20260901/result.json`), and H6
(`h6-remote-error-trap-codex-luna-no-skill-20260901/result.json`).

The primary result's built-in mean (`0.6129`) is not the requested 18-task
aggregate: it treats the two setup-failed tasks, M2 and H6, as zero and does
not include the separately loaded H7. Replacing M2 and H6 with their valid
supplemental runs and adding H7 yields `12.42 / 18 = 0.6900`.

For the literal no-skill protocol, H2 and H3 cannot be accepted because their
trajectories read the native `plugin-creator` instructions. Excluding those
two 1.0 rewards gives the auditable uncontaminated subset:
`10.42 / 16 = 0.6513`. This subset is diagnostic only; it is not a substitute
for rerunning H2 and H3 with the native system-skill catalog disabled.

## What the verifier confirmed

- Ten tasks received full verifier credit. Nine were hands-on migrations
  (`H1`, `H2`, `H3`, `H5`, `H7`, `M1`, `M2`, `M3`, and `M4`); S4 was the
  full-score read-only assessment.
- H1, H2, H5, M1, M2, M3, and M4 passed isolated DSH install/cold-start
  checks. H3 and H7 also passed real Web roster checks through
  `__DSH_BOOT__.entries`.
- H5 was verified from a packed tarball rather than a workspace link, so local
  resolution could not hide the runtime-export drift.
- The read-only fixtures remained unchanged for H4, H6, and S1-S7. H2's
  pre-existing failing test also remained untouched.
- H7 used a stable `data-slot` anchor and supplied the separate explicit
  render assertion that the verifier requires.
- Every main and supplemental Harbor lock records empty top-level and
  agent-level skill arrays. A trajectory command audit found native skill-file
  reads only in H2 and H3, both for `plugin-creator`.
- The main job ran for 51m18s. The three sequential supplements ran for
  5m15s, 5m57s, and 4m54s. Across all four selected result files, Harbor
  recorded 17,519,126 input tokens, 16,116,992 cache tokens, 174,084 output
  tokens, and an estimated cost of $0.8117.

## Issues found

1. **H2 and H3 violate the literal zero-skill protocol.** Harbor did not mount
   or inject a skill, but Codex's native system prompt still advertised system
   skills. Both trials explicitly read `plugin-creator/SKILL.md` and its
   references. Their verifier rewards remain valid as task scores but are
   contaminated for a strict no-skill comparison.
2. **S3 timed out without a report (0/100).** The agent spent the full
   600-second doubled timeout on inspection and search. The fixture stayed
   read-only, but the verifier found no file under the required output path.
3. **H6 omitted the Remote error migration (0/100).** The report did not cover
   namespaced error codes, cancel propagation, internal/unknown-code handling,
   or removal of silent error swallowing.
4. **H4 accepted the trap's false premise (30/100).** It correctly identified
   stale build output and recommended clean/rebuild, but failed to state
   explicitly that source required no change and claimed to have fixed a
   nonexistent reference. The trap cap reduced the two 30-point hits to 30.
5. **S1 and S2 were incomplete static scans.** S1 missed cards A1-08 and
   A2-01. S2 gave the correct negative-scan caveats but failed to map the
   positive APIProxy hit to A1-01.
6. **S5-S7 missed semantic conclusions.** S5 omitted the official `greet`
   short-name judgment and misclassified the shared `events` channel. S6 did
   not fold the two corridor cards into the required deletion/net-state
   conclusion. S7 omitted registry verification, caret prerelease semantics,
   and exit/package-manager discipline, then hit the unpublished-alpha trap.

## Preliminary run anomalies

The checked-in H7 metadata cannot be parsed by Harbor because the TOML basic
string at line 6 contains the unescaped sequence `\s`. Python `tomllib`
reports `Unescaped '\' in a string (at line 6, column 72)`. Harbor therefore
silently omitted H7 from the primary dataset, and a direct run reported
`Either datasets or tasks must be provided`. Only a temporary copy was made
loadable for this benchmark; the repository task was not changed.

The main job recorded five retries during Codex setup. M2 and H6 still ended
with `NetworkConnectionError` before agent execution because Harbor's NVM path
failed downloading Node from `nodejs.org` with `SSL_ERROR_SYSCALL`. Their
individual supplemental jobs later completed without retries; those verifier
rewards replace the setup-failed primary slots in the 18-task aggregate.

## Conclusion

**The Codex + `gpt-5.6-luna` benchmark with no Harbor-injected skill completed
for all 18 tasks other than H8.** Its selected verifier aggregate is reward
`12.42/18`, mean `0.6900`, with ten perfect tasks. The strongest results were
the hands-on install/cold-start migrations; the main semantic weaknesses were
H6, H4, and the partial static assessments S1-S2 and S5-S7. S3 failed on
execution discipline by timing out before delivering its report.

The run does **not** fully satisfy the user's literal requirement to use no
skill at all: H2 and H3 used Codex's native `plugin-creator` despite Harbor's
empty skill configuration. The clean 16-task subset is `10.42/16` (mean
`0.6513`), and a strict 18-task zero-skill result requires rerunning at least
H2 and H3 with native system skills unavailable. The host worktree's
pre-existing changes were preserved; this report is the only workspace file
added for this result.
