# benchmark task validation report · 2026-09-01

End-to-end validation of `H8-dsh-web-alpha2` with Codex and
`openai/gpt-5.6-luna`, without a Harbor-injected skill:
**the scored trial completed with reward 0.67 (verifier score 67/100), with
one agent-timeout anomaly.**

## Environment

- Harbor CLI 0.22.0
- Docker Desktop 29.7.2 (macOS, local provider)
- Agent: Codex, model `openai/gpt-5.6-luna`
- Harbor-injected skill: none (`--skill` omitted; trial config has no
  `skills` entry)
- Reasoning effort: `xhigh`
- Agent/verifier timeout multiplier: `2.0`
- Agent timeout: 2400 seconds after the multiplier
- The user explicitly authorized sending the H8 task source to OpenAI; the
  trial allowed `chatgpt.com` for model connectivity.

The generic Codex system prompt still advertised built-in system skills, but
the H8 trajectory contains no command-level read of `SKILL.md` or a skill
reference. This report therefore identifies the run as no Harbor-injected
skill and records the native-catalog boundary explicitly.

## How to reproduce

The scored trial was run with the following Harbor configuration. No
`--skill` argument was supplied:

```sh
harbor run \
  -p benchmark/tasks/H8-dsh-web-alpha2 \
  -a codex \
  -m openai/gpt-5.6-luna \
  --ak reasoning_effort=xhigh \
  --ae CODEX_FORCE_AUTH_JSON=true \
  --allow-agent-host chatgpt.com \
  --artifact /app/fixture \
  --n-concurrent 1 \
  --n-concurrent-agents 1 \
  --agent-timeout-multiplier 2 \
  --verifier-timeout-multiplier 2 \
  --jobs-dir /private/tmp/dsh-plugin-upgrade-h8-luna-20260901 \
  --job-name codex-plugin-upgrade-h8-alpha2-luna-noskill-20260901 \
  -y
```

The task source and resulting fixture were isolated in Docker. The host
workspace was not used as the agent's write target, and its pre-existing
changes were preserved.

The H8 `task.toml` itself declares `/app/.git` as an artifact. The CLI command
above did not add that artifact explicitly, but Harbor collected it through the
task definition; the manifest records this fact. No extra Git artifact was
requested by the agent configuration.

## Results summary

| Trial | reward | verifier | Key result |
|---|---:|---:|---|
| `H8-dsh-web-alpha2__DHvC9kK` | 0.67 | 67/100 | Settings and task-board migration checks passed, but static compatibility stayed below 80 and the agent timed out before the heavy runtime gate |

The raw result remains in the uncommitted local artifact
`/private/tmp/dsh-plugin-upgrade-h8-luna-20260901/codex-plugin-upgrade-h8-alpha2-luna-noskill-20260901/result.json`,
and the verifier output remains in
`/private/tmp/dsh-plugin-upgrade-h8-luna-20260901/codex-plugin-upgrade-h8-alpha2-luna-noskill-20260901/H8-dsh-web-alpha2__DHvC9kK/verifier/test-stdout.txt`.

## What the verifier confirmed

- 13/13 settings consumers were migrated (+39).
- Direct SDK/Cordis dependencies were aligned to alpha.2 / Cordis 4.0.2,
  covering 213 dependency entries (+10).
- `task-board` recognized both the legacy and qualified gateway error codes
  (+10).
- Upstream inject/aggregate script-level regression checks passed (+5).
- The verifier detected 57 changed fixture paths and applied the out-of-scope
  change cap.

## Issues found

1. **Web settings bridge migration was incomplete (0 points).** The verifier
   still detected the old `settingsNamespace` dependency or found that the
   required brand type was not retained.
2. **Git-graph client type migration was incomplete (0 points).** A dependency
   on a removed transitive type edge remained.
3. **Cohort/lock/workflow migration was partial (3/10).** The lockfile and
   cohort workflow did not satisfy the full migration contract.
4. **Alpha.2-incompatible external-plugin exclusion was not synchronized
   (0/15).** The required manifest/dependency/patch/test exclusion surface was
   not fully updated.
5. **Scope violations triggered the 90-point cap.** The verifier flagged these
   compatibility-outside paths:
   `packages/dsh-git-graph/tests/create-worktree-session.spec.ts`,
   `packages/dsh-tool-describe-image/tsdown.config.ts`,
   `packages/dsh-web-settings/src/index.ts`,
   `packages/skins/skin-center/tsdown.config.ts`,
   `scripts/aggregate.mjs`, and
   `scripts/runtime-deps-check.test.mjs`.
6. **Static compatibility stayed below 80.** As a result, the verifier skipped
   the heavy alpha.2 install/build/cold-start runtime gate.
7. **Agent timeout.** Harbor raised `AgentTimeoutError` after the configured
   2400-second agent phase. The verifier still collected a score and the
   modified fixture artifact, but no additional agent report artifact was
   produced.

## Conclusion

**The H8 no-Harbor-skill benchmark executed and produced a scored result, but
the migration is not fully validated.** The final reward is `0.67`; the
strongest parts were the 13 settings consumers, direct SDK/Cordis dependency
alignment, task-board error-code handling, and script-level regression checks.
The main failures were the web-settings bridge, git-graph type edge, cohort
workflow, external-plugin exclusion, scope discipline, and the agent timeout.

The host worktree was preserved. All agent fixture changes and verification
outputs remain in the isolated Harbor artifact directory.
