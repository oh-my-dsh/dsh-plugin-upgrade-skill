#!/usr/bin/env bash
set -euo pipefail

task_dir="$(cd "$(dirname "$0")" && pwd)"
repo_root="$(cd "$task_dir/../../.." && pwd)"

exec harbor run \
  -p "$task_dir" \
  -a codex \
  --skill "$repo_root/skills/plugin-upgrade" \
  --ak web_search=disabled \
  "$@"
