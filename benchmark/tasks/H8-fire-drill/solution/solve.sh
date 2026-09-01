#!/bin/bash
# Oracle solution: overlay the reference plugin fixes onto /app/fixture and the
# reference reports onto /app/agent-output (relative paths only, nothing else touched).
set -e
DIR="$(dirname "$0")"
OUT=/app/agent-output/H8-fire-drill
mkdir -p "$OUT"
cp "$DIR/plugin/drill-host/index.js" "$DIR/plugin/drill-host/package.json" /app/fixture/drill-host/
cp "$DIR/plugin/drill-web/index.js" "$DIR/plugin/drill-web/package.json" /app/fixture/drill-web/
cp "$DIR/plugin/drill-tools/package.json" /app/fixture/drill-tools/
cp "$DIR/report/diagnosis.md" "$DIR/report/release.md" "$OUT/"
