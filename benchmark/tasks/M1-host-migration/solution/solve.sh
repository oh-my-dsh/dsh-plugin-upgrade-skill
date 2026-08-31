#!/bin/bash
# Oracle solution: overwrite the reference plugin changes into /app/fixture via relative paths (touching no other files).
set -e
DIR="$(dirname "$0")"
cp "$DIR/plugin/index.js" "$DIR/plugin/package.json" "$DIR/plugin/cordis.patch.yml" /app/fixture/
