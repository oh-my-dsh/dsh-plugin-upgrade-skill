# benchmark task validation report · 2026-09-01

End-to-end validation of `H5-dsh-web-alpha2` with Codex and
`openai/gpt-5.6-luna`, using the `skills/plugin-upgrade` skill:
**the scored trial completed with reward 0.8 (verifier score 80/100), with one
agent-timeout anomaly.**

## Environment

- Harbor CLI 0.22.0
- Docker Desktop 29.7.2 (macOS, local provider)
- Agent: Codex, model `openai/gpt-5.6-luna`
- Skill: `skills/plugin-upgrade`
- Reasoning effort: `xhigh`
- Agent/verifier timeout multiplier: `2.0`
- The user explicitly authorized sending the task source to OpenAI for this
  benchmark; the scored rerun allowed `chatgpt.com` for model connectivity.

## How to reproduce

The scored trial was run with the following Harbor configuration:

```sh
harbor run \
  -p benchmark/tasks/H5-dsh-web-alpha2 \
  -a codex \
  -m openai/gpt-5.6-luna \
  --skill ./skills/plugin-upgrade \
  --ak reasoning_effort=xhigh \
  --allow-agent-host chatgpt.com \
  --artifact /app/fixture \
  --artifact /app/agent-output \
  --n-concurrent 1 \
  --n-concurrent-agents 1 \
  --agent-timeout-multiplier 2 \
  --verifier-timeout-multiplier 2 \
  --jobs-dir /private/tmp/dsh-plugin-upgrade-h5-luna-20260831 \
  --job-name codex-plugin-upgrade-h5-alpha2-luna-allow-chatgpt-20260831 \
  -y
```

The task source and resulting fixture were isolated in Docker. The host
workspace was not used as the agent's write target.

## Results summary

| Trial | reward | verifier | Key result |
|---|---:|---:|---|
| `H5-dsh-web-alpha2__XQeiPsT` | 0.8 | 80/100 | Most migration checks passed; alpha.2 install/cold-start gate failed on lockfile integrity and the agent hit its 2400-second timeout |

The raw result remains in the uncommitted local artifact
`/private/tmp/dsh-plugin-upgrade-h5-luna-20260831/codex-plugin-upgrade-h5-alpha2-luna-allow-chatgpt-20260831/result.json`,
and the verifier output remains in
`/private/tmp/dsh-plugin-upgrade-h5-luna-20260831/codex-plugin-upgrade-h5-alpha2-luna-allow-chatgpt-20260831/H5-dsh-web-alpha2__XQeiPsT/verifier/test-stdout.txt`.

## What the verifier confirmed

- 13/13 settings consumers were migrated.
- Direct SDK/Cordis dependencies were aligned to alpha.2 / Cordis 4.0.2,
  covering 214 dependency entries.
- `task-board` recognized both the legacy and qualified gateway error codes.
- Upstream inject/aggregate script regressions passed.
- Runtime metadata was pinned to `dsh` 0.1.2-alpha.2.
- Alpha.2-incompatible external plugins were excluded from the aggregate
  manifest, dependencies, patch, and contract test surfaces.

## Issues found

1. **Alpha.2 installation and cold-start gate failed.** The hidden verifier
   found a deliberately stale/incorrect integrity value for
   `@deepseek-ai/dsh-client-store@0.1.2-alpha.2` in the candidate lockfile:
   the recorded `sha512-AAAA...` checksum did not match the downloaded
   tarball. This capped the final score at 80/100.
2. **Web settings bridge migration was incomplete.** The verifier gave no
   credit for the bridge criterion because it still detected the old
   `settingsNamespace` dependency or the required brand type was not retained.
3. **Git-graph client type migration was incomplete.** The verifier still
   detected a dependency on a removed transitive type edge.
4. **Cohort/lock/workflow migration was partial.** The verifier awarded 3/10
   for this category.
5. **Scope violation.** The verifier detected 55 changed fixture paths and
   specifically flagged `packages/dsh-git-graph/tests/create-worktree-session.spec.ts`
   as outside the compatibility surface, applying the corresponding score cap.
6. **Agent timeout.** The agent exceeded the configured 2400-second execution
   limit after making the fixture changes and running local checks. The
   verifier result was still collected, but `/app/agent-output` was not
   present for artifact download.

## Preliminary run anomaly

An initial run without an allowed model host repeatedly failed with TLS
handshake errors and was cancelled before producing fixture changes. After the
user's explicit authorization, the scored rerun used `--allow-agent-host
chatgpt.com` and completed the verifier phase described above.

## Conclusion

**The H5 agent benchmark executed successfully enough to produce a scored
result, but the migration is not fully validated.** The scored output is
`0.8`; the dominant blocking evidence is the alpha.2 lockfile integrity
mismatch, followed by incomplete web-settings/git-graph migration and one
out-of-scope test change. The host worktree's pre-existing changes were
preserved, and the agent's fixture changes remain available in the isolated
artifact directory.
