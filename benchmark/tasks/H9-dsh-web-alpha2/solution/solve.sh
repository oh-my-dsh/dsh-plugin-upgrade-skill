#!/bin/bash
# Oracle: install the byte-for-byte v0.3.9 compatibility target over the v0.3.8 fixture.
set -euo pipefail
DIR="$(cd "$(dirname "$0")" && pwd)"
APP_ROOT="${BENCH_APP_ROOT:-/app}"
cp -R "$DIR/target/." "$APP_ROOT/fixture/"
rm -f "$APP_ROOT/fixture/scripts/build-cohort-tarballs.mjs"
