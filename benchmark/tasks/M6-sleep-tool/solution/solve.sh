#!/bin/bash
# Oracle solution: overlay the reference plugin fixes onto /app/fixture and the
# reference report onto /app/agent-output (relative paths only, nothing else touched).
set -e
DIR="$(dirname "$0")"
OUT=/app/agent-output/M6-sleep-tool
mkdir -p "$OUT"
cp "$DIR"/plugin/package.json "$DIR"/plugin/index.js /app/fixture/
cp "$DIR"/report/diagnosis.md "$OUT/diagnosis.md"
