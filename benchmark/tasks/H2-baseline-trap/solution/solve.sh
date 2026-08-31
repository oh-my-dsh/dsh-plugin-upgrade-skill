#!/bin/bash
# Oracle solution: overwrite the migrated plugin files into /app/fixture/ (leaving test/ and README untouched),
# and write the migration report to the agent output directory.
set -e
SOLUTION_DIR="$(dirname "$0")"
cp "$SOLUTION_DIR/plugin/index.js" "$SOLUTION_DIR/plugin/package.json" "$SOLUTION_DIR/plugin/cordis.patch.yml" /app/fixture/
mkdir -p /app/agent-output/H2-baseline-trap
cp "$SOLUTION_DIR/report.md" /app/agent-output/H2-baseline-trap/report.md
