# Checkpoint grading (declarative scoring for benchmark tasks)

## What this is

A per-task scoring model where the judge's points are **declared** in
`tests/checkpoints.json` instead of living only inside hand-written branch logic.
Each declared checkpoint is measured against **both** the pristine trap fixture
(restored from the git baseline made by the task Dockerfile) and the agent's patched
fixture, so every awarded point is traceable to a named, classified fact.

## Borrowed from DeepSWE

The model adapts three ideas from [DeepSWE](https://github.com/datacurve-ai/deep-swe)
(held-out tests + behavior grading over a separate pristine environment):

1. **Patch + pristine dual grading** — the same checkpoints run against the untouched
   baseline and the agent's result, instead of grading only the final state.
2. **fail-to-pass / pass-to-pass classification** — fail-to-pass checkpoints must
   flip from failing to passing; pass-to-pass checkpoints must keep passing (the
   agent must fix the trap without breaking what already worked).
3. **Per-component reward breakdown** — the judge emits a structured
   `checkpoints: [{ id, label, type, points, awarded, patched, pristine }]` ledger,
   and `test.sh` writes it to `/logs/verifier/grading.json` next to the Harbor
   `reward.txt` and numeric `reward.json`. Harbor reserves `reward.json` for a flat numeric reward map and
   reads it before `reward.txt`; structured reasons/checkpoints must use a different
   filename. Historical structured `reward.json` files remain valid exporter inputs.

Deliberately **not** borrowed: DeepSWE's network allowlists, its real-repository task
set, and trajectory critique — those do not fit this benchmark's scope.

## Concepts

- **Gate** — environment health, scored before any checkpoint (fixture untouched →
  0, dsh unavailable → 0, etc.). Gates are not task checkpoints; they protect the
  scoring from infrastructure noise.
- **Checkpoint type**:
  - `fail-to-pass` — patched must pass **and** the pristine baseline must not pass.
    If the baseline already passes, the trap fixture has drifted: the judge stops
    with a `baseline mismatch` verdict (score 0, loud reasons) instead of awarding
    meaningless points.
  - `pass-to-pass` — patched must keep passing; a failing pristine baseline blocks
    the credit.
  - `pass` — patched-only requirement (installability, etc.).
  - `report` — agent-written artifacts (diagnosis / release checklists).
- **requires** — dependency chain: a checkpoint only counts after its prerequisites
  passed (e.g. the authed-200 smoke only counts after the no-auth-401 smoke).
- **cap** — a declared ceiling on the total (`cap.total`), applied when the
  checkpoint failed; `cap.when` restricts the cap to the case where other named
  checkpoints passed (cross-checkpoint traps).
- **pristine run** — `restorePristine()` materializes the committed baseline fixture
  with `git archive` into `/tmp/pristine-<task-id>/fixture`; the judge measures the
  same facts there first.

## Manifest schema

`tests/checkpoints.json` (schema 1):

- `task` — must equal the task directory name;
- `dshTarget` — the host version the task pins (e.g. `0.1.2-alpha.2`);
- `cards` — card ids the task teaches; each must be cited in
  `skills/plugin-upgrade/references` (checked by the validator);
- `checkpoints[]` — `{ id, label, type, points, measure, requires?, cap? }`,
  points sum to exactly 100;
- `gates[]` — documented environment gates with their fail scores;
- `provenance` — `{ author, date, evidence }` (what host version and what local runs
  the expectations were verified against).

`benchmark/scripts/validate-checkpoints.mjs` (wired into `npm test`) enforces the
schema, the 100-point sum, card citations, `requires` ordering, cap targets, and
that every declared checkpoint id is implemented in `judge.mjs`.

## Scope today

Opt-in: only `M5-token-auth-smoke` and `H8-fire-drill` use checkpoint grading. All
other tasks keep their existing band logic and are unaffected by the validator.

## Semantic notes

The main bands are preserved (100 full fix / 60 half-fixed / 40 unfixed / 30 add
failure / 0 environment or untouched), and the M5 migration to additive
per-checkpoint scoring deliberately adjusts two boundary states that the old
band tree could not express:

- `401 + authed not-200 + raw route still present` — old 60, now 40: the agent
  earned exactly one of the three checkpoints;
- raw registration deleted outright (channel gone, no-auth answers non-401) —
  old 40, now 20: removing the trap is progress, but the channel must keep
  answering to earn the rest.

Both are declared here and in the scoring table, so cross-run comparisons stay
explicit.

## Export to DeepSWE-style reports

`benchmark/scripts/export-deepswe-report.mjs` converts a checkpoint-graded judge
result (the `/logs/verifier/grading.json` ledger) into the report fields DeepSWE
writes ([reward.json/ctrf.json](https://github.com/datacurve-ai/deep-swe)), so the
two benchmarks can be compared side by side:

```sh
node benchmark/scripts/export-deepswe-report.mjs /logs/verifier/grading.json --task M5-token-auth-smoke
```

Mapping (verified against DeepSWE's `grader.py` output schema):

- f2p bucket = checkpoints of type `fail-to-pass` / `pass` / `report` (must pass);
- p2p bucket = checkpoints of type `pass-to-pass` (must keep passing);
- `reward` = DeepSWE's binary reward (1 iff every f2p passed and no p2p failed);
- `score` = this benchmark's graded 0-100 result, kept alongside as a 0-1 value;
- `ctrf` = one test row per checkpoint, named `[f2p] <id>` / `[p2p] <id>`.

Differences kept explicit: DeepSWE's `apply_failed` field has no equivalent here
(our judges have environment gates instead) and is not invented; an empty p2p
bucket defaults its ratio to 1.0, matching DeepSWE's own edge behavior.

## Maintenance notes

- `evaluateCheckpoints` / `restorePristine` live in each task's own copy of
  `judge-utils.mjs` (the repo convention is per-task copies); when one copy
  changes, update the other in the same PR.
- The manifest's `gates` and `measure` fields are documentation-only today;
  validating them mechanically is a planned enhancement.
- `cap.when` (cross-checkpoint caps) is exercised by H8's raw-route trap.

## Suggestions to the repository

1. **Generalize after consensus** — if maintainers agree with this model, migrate
   the remaining tasks one family at a time (S / M / H), keeping every existing
   band outcome identical; each migrated task needs an oracle re-run
   (`harbor run -p <task> -a oracle`) to prove the scores did not move.
2. **Grow the manifest into a task manifest** — `checkpoints.json` can later absorb
   the per-task facts now duplicated in the README/scoring tables (cards covered,
   trap description), becoming the single source of truth that
   `validate-task-registry.mjs` cross-checks the prose tables against.
3. **Publish the ledger** — `grading.json` already carries the structured
   checkpoints; `export-deepswe-report.mjs` maps it onto DeepSWE-style report
   fields (reward/ctrf) for cross-benchmark comparison.
4. **Pin the trap states** — the baseline-mismatch verdict turns fixture drift into
   a hard failure; run it occasionally against main's tasks to keep every trap
   honest.
