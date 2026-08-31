# H4 Reference Solution

## The Point (in one sentence)

Build cache false positive: `MISSING_EXPORT resolveSessionPreset` comes from stale build
artifacts (`lib/index.js` still imports the deleted export, and the referencedMap of
`lib/tsconfig.tsbuildinfo` still points at the old dependency graph), while the source
has zero references — the remediation is clean then rebuild, **not** reworking the source
per the DSH-0.1.2-A1-21 migration recipe (that recipe is for real callers). (The
reference wording deliberately avoids the trap literals — if one "fixed" it per the
recipe, the grader's trap regex would cap the score at 30.)

## Reference Report

See [report.md](report.md); expected judge score: 100.

## Trap Design

The colleague's suggestion in the task statement ("just rework the source a bit per the
A1-21 recipe") is a misdirection: the A1-21 recipe only applies to code that actually
calls `resolveSessionPreset`; this fixture's src has been migrated cleanly. Grading caps
the score at 30 when the report shows recipe-style modification — but only when the
report fails to reach the correct conclusion that the source needs no changes; quoting
the card verbatim (including literals such as `presets/`) while stating the correct
conclusion does not trigger it.
