# GPT-6 Astra high — paired S1–S24 solver artifacts

Judge status: **NOT JUDGED — solvers only; judging deferred to DSH session**.

Completed on 2026-11-23 (Asia/Shanghai): **48/48 solver cells**, comprising 24
no-skill and 24 skill reports. `artifact-integrity.json` confirms all reports
are present, their recorded hashes match, all fixtures and supplied skills are
unchanged, and every cell has one attempt. Usage-limit interruptions and user
pauses were resumed in the original agents and are retained in the manifest.
The final state is `solver_complete_unjudged`; no solver work remains.

The run covers 24 tasks in two conditions: `noskill/` and `skill/` (48 cells).
Each cell contains the original `instruction.md`, its native-path adaptation
`solver-instruction.md`, an unchanged `fixture/`, and solver-authored files under
`agent-output/`. The skill condition additionally contains the supplied
`skills/plugin-upgrade/` snapshot. No skill is supplied in the no-skill condition.

`run-manifest.json` is the authoritative progress and provenance record. It records
the frozen commit, requested model and effort, per-cell status and attempts,
fixture hashes, report hashes, and skill-use attestations. A completed solver
status means that a report was produced; it is not a judgment of answer quality.

The user authorized native Codex subagents after Docker preparation was impeded
by network problems. Each cell uses a fresh subagent requested as `gpt-6-astra`
with reasoning effort `high`; at most two solvers run concurrently. Host Codex CLI
0.139.0 was detected but is not used to solve these tasks. This run must not be
described as a Codex CLI 0.153.4 Docker run or mixed with historical xhigh scores.

The original `/app/fixture` and `/app/agent-output` paths are replaced with each
cell's absolute Windows paths. Solvers are instructed to read only their own
fixture and, for the skill condition, the supplied skill, and to write reports
only under their own `agent-output/`. Native subagents have inherited tool
availability; disabling bundled tools, plugins, memories, and web search at the
platform level cannot be attested. Local-only use is explicitly instructed.
Skill-use fields record solver reports rather than an independent transcript audit.

S1–S3 skill attempts preceded the user's request to add a no-skill comparison;
their original outputs are retained. S1's existing agent was resumed after a
network interruption, without creating another attempt. Further execution events
and limitations are retained in the manifest. No verifier, judge API, or scoring
script is run as part of this solver-only task.
