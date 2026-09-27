#!/bin/bash
set -euo pipefail
exec node "$(dirname "$0")/judge.mjs" "$@"
