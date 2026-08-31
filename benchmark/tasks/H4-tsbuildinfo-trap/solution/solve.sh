#!/bin/bash
# Oracle solution: write the reference report to the agent output directory (does not touch fixture/src; keeps the read-only discipline).
set -e
mkdir -p /app/agent-output/H4-tsbuildinfo-trap
cp "$(dirname "$0")/report.md" /app/agent-output/H4-tsbuildinfo-trap/report.md
