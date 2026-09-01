# Benchmark evaluation snapshots

The benchmark under `benchmark/tasks/` is a **living benchmark**: tasks are added
over time, and main has already moved through 18 / 19 / 22 / 23-task states.
Formal experiments must not describe their object as "the current benchmark" —
they must pin an **immutable evaluation snapshot**.

A snapshot pins:

- the exact benchmark commit (full 40-char git SHA);
- the explicit, frozen task ID list (not just a count);
- the exact skill commit and path (recorded separately from the benchmark
  commit, so a frozen benchmark can later be paired with an updated skill for
  before/after comparisons);
- the run protocol (`runsPerTask`, `aggregation`, `conditions`);
- the creation date and free-form notes.

Snapshots are immutable historical experiment inputs: adding tasks to main does
not mutate an existing snapshot, and validators check the snapshot against the
referenced commits (via local git objects) — not against the current living
inventory.

## Validating

```sh
node benchmark/scripts/validate-evaluation-snapshots.mjs
```

This verifies every `benchmark/snapshots/*.json` (except `schema.json`):
manifest shape, filename/id consistency, full-SHA contract, and — using
`git cat-file` against the local clone only — that the referenced commits exist
and that every snapshot task (with its `task.toml` and `instruction.md`) and the
referenced skill path exist at their commits. If a referenced commit is not
present in the local clone, the validator fails with an actionable message
("fetch the referenced commit before validating"); it never fetches from the
network.

## Creating a new snapshot

1. Decide the frozen point: `git rev-parse <ref>` for the benchmark commit, and
   (separately) the skill commit you want to evaluate.
2. Copy `schema.json` as a starting point, fill in the full SHAs and the
   explicit task list (`git ls-tree --name-only <commit>:benchmark/tasks/`).
3. Name the file exactly `benchmark/snapshots/<id>.json` where `<id>` is
   `YYYY-MM-DD-<slug>` matching `createdAt`.
4. Run the validator.

## Notes

- `2026-09-01-main-23.json` pins the current 23-task main. It is an
  infrastructure/current-evaluation snapshot, **not** retroactive metadata for
  earlier runs: the 2026-09-01 19-task paired run predates snapshot recording
  and its exact repository/skill commits were not recorded in the validation
  reports, so it cannot be reconstructed faithfully.
