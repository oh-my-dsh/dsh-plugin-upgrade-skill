# Metadata-only skill activation experiment

Status: FINAL (all six pre-registered slots completed; 0 exceptions; 0 replacements)

## Research question

Does changing only the skill's activation metadata (frontmatter
`description`) change whether an agent actually opens the skill? Primary
endpoint: observed content-bearing access to the target `SKILL.md`
("opened") among correctly supplied trials.

## Frozen task and benchmark

- Benchmark commit: `a1a96b84b38a8654dceb489d081a5c2fd3d3bde9`
- Task: `benchmark/tasks/H11-remote-result-boundary-trap` — **historical H11**
  (the task later became H12 after benchmark renumbering; it is pinned here
  at its historical identity and was not migrated).
- Skill path: `skills/plugin-upgrade`

## Intervention

| Condition | Skill tree | Difference |
|---|---|---|
| `old-metadata` | `skills/plugin-upgrade` exactly at the frozen commit (SKILL.md blob `2e3add0f03ab7414639857e8b976f18a14dbc2ba`, tree `f24c0e2cb81428d36456b64b4f613bd2c38e953b`) | — |
| `new-metadata` | identical tree with **only** the frontmatter `description` replaced by the description from `1f265590ad9f172388d11bfec21add4433dac2bf` (the #107 "broaden migration diagnosis activation" head, SKILL.md blob `22891d0eeae250a9f7884d9d5a2cde32a00f18bb`) | one line of frontmatter |

## Integrity proof

An integrity script parsed both SKILL.md files into frontmatter + body and
enforced, before the first model run:

- `old.body === new.body` (byte-exact);
- every frontmatter field except `description` identical;
- the synthesized new file's git index is `2e3add0..22891d0`, i.e. byte-equal
  to the #107 head blob;
- SHA-256 manifests over the full skill tree (44 files): **exactly one file
  differs** — `skills/plugin-upgrade/SKILL.md`;
- manifests re-verified after the experiment: both trees unchanged.

Tree hashes (sha256): old SKILL.md `14c9bc9cf36c9150fde435f20f02edaaa3cdde22977bad2319c2ff95e33e813e`;
new SKILL.md `784c29a224d64457a6858ef37a28d8ff56da2f069c5da200633bbc9a5879c793`.

## Agent / model / Harbor environment

| Field | Value |
|---|---|
| Harbor | 0.22.0 |
| Agent | Codex via the validated `harbor_codex_node24:CodexNode24` workaround (install pinned to image Node 24; ripgrep apt retry loop; agent semantics unchanged). Container-resolved CLI: 0.152.1 (historical calibration: 0.152.0; minor drift, identical across conditions) |
| Model | requested `openai/gpt-5.6-luna`; resolved/recorded `gpt-5.6-luna` (trajectory `agent.model_name`); identical across conditions |
| Reasoning | `xhigh` |
| Timeouts | agent ×2.0, verifier ×2.0, agent-setup ×2.0 (infrastructure parameter, identical across conditions) |
| Concurrency | 1 (`--n-concurrent 1 --n-concurrent-agents 1`) |
| Retry | `--max-retries 1 --retry-include NetworkConnectionError` (0 retries used) |
| Skill mount | `--skill <tree>/skills/plugin-upgrade` (old vs new tree — the only difference) |
| Freshness | every slot: fresh Harbor trial, fresh container, fresh agent context |

Measurement instrument: `benchmark/scripts/audit-skill-activation.mjs`
(PR #132). The measurements in this report were produced at experiment time
by the instrument code at commit
`539243e02168eec5f0ba0b163548aa28bd0fe9a4` (the #132 head at experiment
time); that file is **byte-identical** to the final merged auditor at
`2077648b93535da22dd3a9eda80b36197bb3910b` (the #132 merge commit; blob
`890e99ce9a6558c79c02a5e72294772bb12cada4` at both commits, verified by git
blob equality — the same holds for the auditor's test suite). The merged
auditor's 44 unit tests pass on current main. Its 44 unit tests were green
before the first run, and a re-audit of the six historical calibration
trials at experiment time reproduced the known result (with-skill 3/3
supplied, 0/3 opened), confirming instrument stability.

Publication provenance (2026-09-04): the experiment's raw trajectory
archive (six trial session logs, auditor JSON outputs, tree manifests) was
held in a local temporary directory that the host's temporary-directory
cleanup removed after the experiment, so a literal post-merge re-audit pass
could not be re-run. The byte-identity verification above is the equivalent
consistency guarantee for the instrument: identical code run on identical
trajectories produces identical measurements, and the reported per-slot
values are the recorded outputs of exactly that code. No measurement in this
report was re-derived, re-weighted, or adjusted after the experiment ended.

## Pre-registered run order

`old, new, new, old, old, new` — balanced interleaving, fixed before the
first run and never reordered.

## Operational definition of activation

Activation = an observed **content-bearing access** to the target `SKILL.md`
in the agent trajectory (`opened`). `supplied` = the trajectory's skills
catalog declares the skill. `discovered` (listing operands / output mentions)
is **not** activation; reference-only access is **not** activation (reported
separately). Prose mentions, `ls`/`find`/`stat`, comments, and error-output
mentions never count. `firstOpenEvent` is the 0-based session-log ordinal
(null when not opened).

## Trial-level results

| Slot | Condition | Supplied | Discovered | Opened | First open | Reference access | Other skill | Reward |
|---|---|---|---|---|---|---|---|---|
| 1 | old-metadata | yes | no | no | — | 0 | none | 0.00 |
| 2 | new-metadata | yes | yes | no | — | 1 (api-migration-0.1.2-alpha.2) | none | 0.56 |
| 3 | new-metadata | yes | yes | yes | 12 | 2 | none | 0.80 |
| 4 | old-metadata | yes | yes | yes | 32 | 0 | none | 0.30 |
| 5 | old-metadata | yes | yes | yes | 39 | 3 | none | 0.46 |
| 6 | new-metadata | yes | yes | yes | 12 | 1 | none | 0.30 |

All six trials passed the supplied gate (supplied = yes) and enter the
comparison; no infrastructure failures, no replacements, 0 exceptions.

## Aggregate activation results

| Condition | n | Supplied | Opened | Activation rate |
|---|---:|---:|---:|---:|
| old-metadata | 3 | 3/3 | 2/3 | 0.667 |
| new-metadata | 3 | 3/3 | 2/3 | 0.667 |

Primary endpoint delta: **0** (OLD 2/3 opened, NEW 2/3 opened).

Any target-skill content access (opened or reference read): OLD 2/3, NEW 3/3
(slot 2 read `references/api-migration-0.1.2-alpha.2.md` without ever
opening `SKILL.md` — a reference-bypass activation).

## Reward results

Rewards (verifier reward, confirmed against the Harbor run tables):

- old-metadata: 0.00, 0.30, 0.46 — mean 0.2533, median 0.30, range 0.00–0.46
- new-metadata: 0.56, 0.80, 0.30 — mean 0.5533, median 0.56, range 0.30–0.80

The bundled `summarize-runs.mjs` could not consume the trial `result.json`
files directly: Harbor v0.22.0's secret redaction writes a `[REDACTED]`
token into one field, producing structurally invalid JSON in every file
(same quirk seen in the historical calibration artifacts). Rewards above
come from each trial's `verifier/reward.txt` (the grader's authoritative
output) and match the Harbor run summary exactly; the original artifacts
were kept untouched.

## Other-skill access

None in any trial (auditor `otherSkills.skills` empty in all six). Both
conditions are target-skill-supplied conditions, so this is not a
no-skill-baseline contamination question; there is nothing to flag.

## Resource usage

Trajectory `final_metrics` (cached tokens are a subset of prompt tokens and
must not be added to them):

| Slot | Prompt tokens | Cached | Completion | Cost USD | Steps | Trajectory span | Harbor runtime |
|---|---:|---:|---:|---:|---:|---:|---:|
| 1 old | 98,664 | 84,480 | 5,263 | 0.0108 | 9 | 1m49s | 2m50s |
| 2 new | 288,463 | 243,712 | 5,668 | 0.0206 | 11 | 2m01s | 2m56s |
| 3 new | 336,831 | 290,304 | 6,900 | 0.0234 | 13 | 2m31s | 3m27s |
| 4 old | 307,282 | 247,296 | 8,743 | 0.0274 | 13 | 3m04s | 3m55s |
| 5 old | 523,602 | 467,712 | 7,726 | 0.0298 | 16 | 2m56s | 3m55s |
| 6 new | 253,332 | 201,984 | 5,519 | 0.0209 | 11 | 2m00s | 2m53s |

(Trajectory span = first-to-last step timestamp; Harbor runtime = whole
job including environment setup. Descriptive only.)

## Historical calibration context

The 2026-09-01 calibration (same task, same frozen commit, same agent/model/
reasoning, with-skill condition) showed rewards 0.41/0.46/0.51 and — per a
re-audit with this instrument at the same commit — 3/3 supplied, **0/3
opened** ("catalog only"). Historical rewards are context, not part of this
experiment's statistical comparison: the contemporaneous old/new design is
what isolates the intervention, because host/model/runtime drift hits both
conditions equally. Today's old-metadata runs differ from the historical
with-skill runs (2/3 opened, rewards 0.00–0.46), which is consistent with
ordinary run-to-run agent variance rather than any systematic drift.

## Interpretation

This is a **null result on the primary endpoint**: replacing only the
frontmatter description did not change the observed `SKILL.md` open rate
(2/3 in both conditions). The expanded description did not resolve the
retrieval bottleneck; the historical 0/3 pattern also did not persist in
today's old-metadata arm, so activation on this task appears noisy across
runs rather than deterministically gated by the description.

Two secondary observations are worth keeping for design of later work:

- Slot 2 (new) reached skill content without opening `SKILL.md` (direct
  reference read) — `anyTargetSkillContentAccess` is 3/3 for new vs 2/3 for
  old, but n=3 and the primary endpoint is unchanged, so no claim is made.
- Reward means differ (0.553 vs 0.253) while activation is identical — at
  n=3 this is not evidence of a metadata effect on task success, and
  activation does not mediate the difference (slot 1's 0.00 came from the
  agent writing its report to a wrong-cased output directory, a task-execution
  failure unrelated to skill retrieval).

## Limitations

- n=3 per condition on a single task (historical H11), one model, one agent:
  a calibration-scale experiment; no significance claim.
- Description change is one specific edit (the #107 expansion); other
  metadata edits could behave differently.
- Harbor's redacted `result.json` files were not consumed by the summarizer;
  rewards were taken from the grader output.
- Contemporaneous comparison, not a replication of the historical numbers.

## Reproduction

1. Frozen worktrees at `a1a96b84b38a8654dceb489d081a5c2fd3d3bde9`; build the
   `new-metadata` tree by replacing only the `SKILL.md` frontmatter
   `description` with the `1f265590ad9f172388d11bfec21add4433dac2bf` text.
2. Integrity script: assert single-file diff + body equality + field
   equality + blob identity before any run.
3. Six Harbor runs, order `old, new, new, old, old, new`, concurrency 1,
   config as in the table above; `--skill` points at the condition tree.
4. Audit every trial with `audit-skill-activation.mjs` (`--target-name
   plugin-upgrade --condition <cond>`); the instrument file at experiment
   commit `539243e…` is byte-identical to the merged auditor at `2077648b…`
   (see the measurement-instrument section); rewards from
   `verifier/reward.txt`.

## Artifact / privacy note

The raw trajectories, Harbor result files, and full audit outputs were
retained in a local archive during the experiment and are not committed;
that archive was later removed by host temporary-directory cleanup, so the
raw artifacts are no longer available (see the publication-provenance note
above). This report contains only trial basenames, aggregate counts, and the
grader rewards; no prompts, command outputs, credentials, tokens, or
machine paths appear here.
