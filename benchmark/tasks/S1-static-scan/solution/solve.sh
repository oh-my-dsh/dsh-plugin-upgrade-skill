#!/bin/bash
# Oracle 解法：把参考报告写到 agent 输出目录（不碰 fixture，满足只读纪律）。
set -e
mkdir -p /app/agent-output/S1-static-scan
cp "$(dirname "$0")/report.md" /app/agent-output/S1-static-scan/report.md
