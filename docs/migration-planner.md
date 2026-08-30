# Read-only migration planner

`plan-migration.mjs` turns the existing pre-flight patterns and version-card metadata into a deterministic first-pass plan. It **never writes the target repository** and has no output-file option.

## Usage

```sh
node scripts/plan-migration.mjs \
  --root /path/to/plugin \
  --from dsh-v0.1.1-rc.2 \
  --to dsh-v0.1.2-alpha.2
```

JSON for another tool:

```sh
node scripts/plan-migration.mjs \
  --root /path/to/plugin \
  --from dsh-v0.1.1-rc.2 \
  --to dsh-v0.1.2-alpha.2 \
  --format json
```

Known touchpoints can be added without suppressing detected ones:

```sh
node scripts/plan-migration.mjs ... --touchpoints 1,5
```

## What it does

1. reads `pre-flight-patterns.json`;
2. scans text/config files while skipping `.git`, dependencies, generated output, sensitive filenames and files larger than 1 MiB;
3. reports path, line number and pattern number only—never the matching source line;
4. resolves an exact `from → to` path through card-set frontmatter;
5. selects cards intersecting detected/manual touchpoints;
6. puts cards without numeric touchpoints into a separate manual-review list;
7. reports an unsupported corridor gap instead of inventing missing migrations.

## Exit status

| Code | Meaning |
|---:|---|
| 0 | scan and card corridor completed |
| 1 | invalid arguments or unreadable input |
| 2 | no card-set corridor reaches the target tag |

## Limits

This is an intentionally conservative heuristic:

- zero hits do not prove public-contract-only coupling;
- card sets are curated, not complete API diffs;
- it does not parse TypeScript data flow or dynamic imports;
- it does not install dependencies, contact registries, edit files or run plugin code;
- build, target-tag typecheck, real profile activation and product smoke remain mandatory.

Run the regression guard with:

```sh
node scripts/plan-migration.check.mjs
```

The guard proves read-only behavior with a before/after hash snapshot, checks #3/#6/#7 detection, resolves the rc.2→alpha.2 corridor, validates card selection/redaction, and verifies unsupported-gap handling.
