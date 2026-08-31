# H2 Reference Solution

## Reference Changes and Report

- Plugin migration: see [solution/plugin/](plugin/) (same as M1: host-plane direct connection to `llm`).
- Migration report: see [solution/report.md](report.md); expected judge score 100.

## Core Point (In One Sentence)

rollup R-06 "pre-migration baseline attribution": run the mechanical test suite before migrating and record pre-existing failures in an exemption list; the migration report must attribute them as "already present before the migration, not introduced by this migration", and they must not be fixed as a side task — fixing them pollutes the migration diff (the judge deducts 30 points for touching `test/basic.test.mjs`).
