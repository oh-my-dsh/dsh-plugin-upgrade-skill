# Temporal holdout v1 — split definition

**Kind**: distillation-time temporal holdout (skill-knowledge freeze), not a
model-training-cutoff holdout.

**Question this split answers**: under a fixed old skill snapshot, which
benchmark tasks have core graded migration knowledge that entered the
skill/card evidence corpus only *after* the snapshot?

**Status**: definition only. No model runs were performed for this split, and
no reward, activation, or model result was consulted when selecting tasks
(outcome-blind, provenance-only).

## Two frozen axes

| Axis | Commit | Meaning |
|---|---|---|
| `freeze.commit` | `5f7234ba4e00aeaa46c699ea32384389ad38a2a6` (2026-08-31) | the skill-knowledge cutoff: the frozen `skills/plugin-upgrade` tree (`817a48e6…`, SKILL.md blob `a3ee71d3…`). Same commit H21 already pins as its `skill_snapshot_commit`. |
| `candidateInventoryCommit` | `d4f7e8c2…` (2026-09-04, main at split creation) | the benchmark task-universe cutoff: every task present at this commit was audited. Tasks added to main later belong to a future v2 and never mutate this split. |

The frozen skill tree at the freeze commit is the authority for
"knowledge exists at freeze": a card ID whose text is absent from that tree
is post-freeze knowledge even when a same-timestamped commit on a parallel
branch introduced the card ID (tree membership, not timestamps).

## Eligibility (pre-registered, applied uniformly)

**clean-holdout** — all of:

1. task first introduced after the freeze commit;
2. every core knowledge card first introduced after the freeze and absent
   from the frozen skill tree (pre-freeze *supporting* citations are allowed
   and recorded with `role: supporting`);
3. core graded migration knowledge absent from the frozen skill corpus —
   no equivalent recipe, no exact API fact (keyword absence alone is not
   sufficient; content was checked);
4. the task judge materially depends on that post-freeze knowledge
   (recorded in `coreJudgeDependency.rationale`).

**mixed** — depends on both pre-freeze and post-freeze knowledge that cannot
be cleanly separated without changing the judge. Recorded, not primary.

**ineligible** — core knowledge present at freeze; a post-freeze card that
merely rewrites frozen knowledge; the knowledge authority is a different
skill (plugin-write / plugin-runtime-debug / plugin-heavy-dep); or provenance
is insufficient. Exclusion reasons are mandatory and recorded per task.

## Primary set (v1)

| Task | Core knowledge (post-freeze) |
|---|---|
| H4-tsbuildinfo-trap | migration-hygiene build-cache false-positive discipline |
| H7-locale-trap | display-text anchoring breaks after localization (R-13) |
| H13-ghost-host-trap | pre-flight ghost host: pin `from` to the running process wire generation (R-12) |
| M3-session-projection | missing inject service is a runtime pending (A2-08) |
| M4-peer-prerelease-range | npm semver prerelease lower-bound mismatch (R-08 #3) |
| S8-release-routing-trap | version routing + tag sync (§8/§9, 2026-08-31 incident distilled in #90) |
| H20-session-events-ledger | alpha.4 `Session.events` removal ledger (A4-03) |
| H21-question-answerer-waterfall | structured-question answerer registration seam (A1-20) |
| M13-repository-plugins-removal | rc.1 repository-plugins removal (R1-01) |
| M14-service-renames-0812 | rc.1 service renames (R1-09) |

10 tasks. `primaryTasks` in the JSON is exactly this set.

## Task identity / renumbering

`H12-remote-result-boundary-trap` is recorded with its pre-merge PR identity
`H11-remote-result-boundary-trap` (the task merged to main directly under
the H12 name; the historical H11 calibration experiments used the PR
identity). It is **ineligible** for this split: the frozen A2-02 card and
the frozen rollup Remote-error-flow section already contain its
resolved-vs-rejected boundary recipe.

## Why H11-dual-cohort-rpc is only mixed

The frozen rollup already contains R-02 (cross-cohort coexistence), so part
of the axis is pre-freeze; the graded rpc.handle arity / per-channel
authority call shape came from the post-freeze dsh-mnemon incident; and the
task additionally pins its own closed-book snapshot `7d33bf4c`, which is a
different freeze than this split's. It stays mixed and is not primary.

## Machine-readable definition

- `benchmark/holdouts/temporal-holdout-v1.json` — the frozen split
  (freeze axes, eligibility policy, all 52 candidates with per-task and
  per-card git provenance, `primaryTasks`).
- `benchmark/holdouts/schema.json` — documentation contract for the JSON.
- `benchmark/scripts/validate-temporal-holdout.mjs` — deterministic
  validator: re-checks every pinned SHA against local git objects, re-derives
  the post-freeze candidate universe at the inventory commit, enforces
  classification/primary consistency and mandatory reasons, and refuses
  silent omissions. `benchmark/scripts/validate-temporal-holdout.test.mjs`
  covers the rules on synthetic git repositories.

Future §7.1 runs must reference this definition's commit instead of
re-selecting tasks.
