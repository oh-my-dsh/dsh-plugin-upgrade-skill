# Unattended execution contract (BENCHMARK-AUTH-v1)

This benchmark evaluates agents in single-round, unattended Harbor trials.
`instruction.md` is the trial's only user message; no human will reply "confirmed"
while the agent is working. If the skill under test normally requires a
plan-then-confirm-then-modify interaction flow, simply writing "go ahead and modify"
is not enough to convey that confirmation already exists, and agents that follow the
flow can easily be mis-scored as zero.

`BENCHMARK-AUTH-v1` is therefore part of the task prompt, not a special case or a
modification of the skill: the user pre-confirms the plans the agent produces within
the stated boundaries and authorizes it to continue as soon as the plan is formed.
The authorization block must appear identically in both the with-skill and
without-skill rounds, and it must not contain any task's migration answer.

## Fixed semantics

- a trial is a one-shot isolated environment; no further user messages will arrive;
- the agent should still complete the necessary analysis and planning, but must not
  stop merely because a second confirmation round is missing;
- hands-on tasks authorize only modifying `/app/fixture/`, writing to the
  `/app/agent-output/` path named in the prompt, creating one-off local verification
  assets, and running local commands;
- static scan tasks keep `/app/fixture/` unchanged and authorize only reading and
  writing reports; if a task specifically targets stale build artifacts, it may
  explicitly authorize cleaning only the build-artifact directory named in the
  prompt, but the source paths must still remain unchanged;
- all tasks forbid modifying the skill, the judge, or the reference answers, and
  forbid publishing, pushing, accessing external services, or altering resources
  outside the container;
- real blockers must still be reported honestly. Authorization is not a license to
  fabricate results, nor does it widen a task's file and behavior boundaries.

## Maintenance rules

1. Each task's `instruction.md` must contain exactly one `BENCHMARK-AUTH-v1` marker.
2. Each task's `task.toml` must declare `execution_contract = "BENCHMARK-AUTH-v1"`
   under `[metadata]`.
3. When the contract's semantics change, create a new version; do not silently change
   what an existing marker means.
4. New tasks must be classified explicitly as read-only, build-artifacts-only, or
   hands-on, and use the corresponding authorization boundary.
5. Check the prompts and metadata with:

   ```sh
   node benchmark/scripts/validate-execution-contract.mjs
   ```

This contract only solves the benchmark's interaction-modeling problem. The agent
runner itself should still use an execution mode suited to unattended evaluation;
security is guaranteed jointly by the one-shot container, the scope constraints, and
the verifier.
