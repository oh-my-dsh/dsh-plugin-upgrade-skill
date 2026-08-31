#!/bin/bash
# Oracle solution: overwrite the fixture with the reference plugin files (relative paths only, nothing else touched).
set -e
DIR="$(dirname "$0")"
cp "$DIR/plugin/index.js" "$DIR/plugin/package.json" "$DIR/plugin/cordis.patch.yml" /app/fixture/
