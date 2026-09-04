# Skill activation audit

`benchmark/scripts/audit-skill-activation.mjs` answers one question about an
agent trial, and it is **not** "did the agent solve the task":

> Did the agent actually open the target skill?

It separates the activation chain into independently measured stages:

```
skill supplied ──► skill discovered ──► SKILL.md content accessed
──► references accessed ──► task solved / reward
```

This matters because **skill availability is not skill use**: a trial whose
job metadata injects the skill (or whose system prompt lists it) has not
necessarily read a single byte of it. Before comparing metadata-only
interventions (e.g. old vs new skill descriptions), the primary metric has to
be the observed content-bearing access to the target `SKILL.md`, not reward.

## Operational definitions (fixed terminology)

| Term | Definition |
|---|---|
| **skill supplied** | The trajectory's skills catalog (the `<skills_instructions>` system message in the verified Codex schema) declares the target skill. |
| **skill discovered** | The agent observed the skill's existence — an `ls`/`find`/`stat`/`test`/`glob` operand or any tool output text naming the target. Discovery is not use. |
| **skill opened** | At least one content-bearing access to the target `SKILL.md` (the **primary activation metric**). |
| **reference accessed** | Content access to a file under the target skill's `references/`. Reading a reference does **not** upgrade `opened`. |
| **other skill accessed** | Content access to files under other skill roots from the same catalog. Reported observationally (`observed_other_skill_access`); never a causal verdict. |
| **activation rate** | `opened` trials divided by `supplied` (eligible) trials. Eligibility is always stated in the output. |

Prose mentions never count: the assistant writing "I should read
`SKILL.md`", a prompt quoting the path, `ls`/`find`/`stat`/`test -e`, `echo`
of a path, a path appearing in error output, or a shell comment naming the
file are all **not** opens.

## Verified input formats

The auditor only understands schemas it was verified against. Anything else
is a hard error, never a guess.

- **Harbor v0.22.0 trial directory, Codex CLI 0.152.0 agent** (verified
  against real local runs):
  - `agent/sessions/YYYY/MM/DD/rollout-*.jsonl` — evidence-bearing session
    log. Each line is `{"timestamp", "ordinal", "type", "payload"}`;
    `ordinal` is the 0-based event index and is the timing source for
    `firstOpenEvent` (wall-clock timestamps are never used — host clocks are
    not comparable).
  - `agent/trajectory.json` — ATIF-v1.7 message-only trajectory. Used as a
    fallback for `supplied`/`discovered` only: it carries no tool calls, so
    content access is not auditable from it (`contentAuditable: false` +
    explicit warning).
- Unsupported: any other layout, non-ATIF trajectory.json, or a trial
  directory with no `agent/` artifacts.

## Evidence model

Structured tool calls first. In the verified Codex schema the only tool is
`exec`, so shell commands are classified conservatively (precision over
recall):

- **Content-bearing commands**: `cat`, `sed`, `head`, `tail`, `less`, `more`,
  `cut`, `sort`, `awk` (first non-flag argument is the script/program), and
  `grep`/`rg`. A file operand under the target skill root counts as content
  access. `grep -r`/`rg --recursive` over the skill root also counts (it
  reads `SKILL.md` among others); non-recursive `grep` on the directory does
  not.
- **Partial reads count**: `sed -n '1,3p' SKILL.md` is an open. The auditor
  measures retrieval/activation, not coverage — there is no "read N%"
  threshold.
- **Discovery-only commands**: `ls`, `find`, `stat`, `test`, `[`, `file`,
  `glob`, `which`, `whereis`, `type` — never opens.
- **Complex shell** (pipelines, `;`, `&&`, `$(...)`, backticks) or
  interpreter invocations (`python -c`, `node -e`, …) that mention the
  target path produce an `ambiguous-shell-access` warning and are **never**
  counted as opens.
- Operand paths are matched lexically (no filesystem access): absolute paths
  match absolute roots; relative paths resolve against the `exec` call's
  `workdir`; quoted paths and `--` are handled; basename-only guessing is
  never performed.

## Target identity

- `--target-path <path>` (repeatable): explicit identities, unioned with any
  runtime mount path the trajectory itself declares.
- Auto-detection: when the trajectory's skills catalog lists the target, the
  skill roots table (`r0 = /some/path` + `(file: r0/plugin-upgrade/SKILL.md)`)
  yields the runtime mount path.
- If neither yields an identity: hard error. The tool never falls back to
  basename matching.

## Usage

```sh
# one trial
node benchmark/scripts/audit-skill-activation.mjs \
  /example/jobs/run1/S1-static-scan__xyz \
  --target-name plugin-upgrade \
  --target-path /example/runtime/skills/plugin-upgrade \
  --condition with-skill --json

# one job directory (all trial subdirectories are expanded)
node benchmark/scripts/audit-skill-activation.mjs \
  /example/jobs/run1 \
  --target-name plugin-upgrade \
  --condition with-skill --markdown
```

Flags: `--target-name` (required), `--target-path` (repeatable),
`--condition` (label attached to every audited trial, used for grouping),
`--baseline-condition` (default `no-target-skill`; trials with this label
that read other skills get `baselineHasOtherSkillAccess = true` — an
observation, not a verdict), `--json` (default) / `--markdown`.

Exit codes: `0` = audit completed — **`opened: false` is a valid scientific
result and always exits 0**; `1` = unsupported or malformed input; `2` =
invalid usage.

## Output

Per-trial JSON (fixed key order, byte-deterministic; no timestamps, host
paths, command text, output text, or credentials):

```json
{
  "schemaVersion": 1,
  "trial": { "id": "...", "task": "...", "condition": "..." },
  "targetSkill": {
    "name": "plugin-upgrade",
    "supplied": true,
    "discovered": true,
    "opened": true,
    "openCount": 2,
    "firstOpenEvent": 17,
    "openedFiles": ["SKILL.md"],
    "referencesOpened": ["references/foo.md"],
    "anyTargetSkillContentAccess": true,
    "contentAuditable": true
  },
  "otherSkills": { "opened": true, "skills": ["imagegen"], "files": [] },
  "baselineHasOtherSkillAccess": false,
  "evidence": [{ "ordinal": 17, "kind": "content-read", "file": "SKILL.md", "source": "shell-exec" }],
  "warnings": []
}
```

Target files are reported **relative to the skill root** (`SKILL.md`,
`references/foo.md`); runtime absolute paths never appear in the output.
`firstOpenEvent` is the 0-based session-log `ordinal` of the first
`SKILL.md` open.

Job mode adds an aggregate: trial count, `targetSupplied`, `targetSkillOpened`,
`activationRateEligible` (opened ÷ supplied, with the eligibility definition
spelled out), per-condition supplied/opened/other-skill counts, and
`anyTargetSkillContentAccess`.

## What this tool does not do

It never decides whether a trial should be excluded, computes significance,
measures tokens/cost, or makes causal claims. `observed_other_skill_access`
in a baseline is evidence for the experiment protocol to weigh — the auditor
only reports it.
