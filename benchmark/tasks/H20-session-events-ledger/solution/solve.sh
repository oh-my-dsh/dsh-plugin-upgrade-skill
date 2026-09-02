#!/bin/bash
# Oracle solution: replace the fixture module with the canonical alpha.4 migration.
set -e
cp "$(dirname "$0")/src/session-ledger.mjs" /app/fixture/src/session-ledger.mjs
