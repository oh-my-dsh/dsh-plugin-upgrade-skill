#!/bin/bash
set -euo pipefail

TASK_DIR="$(cd "$(dirname "$0")" && pwd)"

# Container egress policy cannot block provider-side search, so pin the Codex
# capability off at the runner boundary. Caller-supplied options come first;
# the final assignment wins if web_search was also provided there.
exec harbor run \
  -p "$TASK_DIR" \
  -a codex \
  "$@" \
  --ak web_search=disabled
