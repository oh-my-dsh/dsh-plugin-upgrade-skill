#!/bin/bash
# Oracle 解法：把迁移后的插件文件覆盖到 /app/fixture/（不动 test/ 与 README），
# 并把迁移报告写到 agent 输出目录。
set -e
SOLUTION_DIR="$(dirname "$0")"
cp "$SOLUTION_DIR/plugin/index.js" "$SOLUTION_DIR/plugin/package.json" "$SOLUTION_DIR/plugin/cordis.patch.yml" /app/fixture/
mkdir -p /app/agent-output/H2-baseline-trap
cp "$SOLUTION_DIR/report.md" /app/agent-output/H2-baseline-trap/report.md
