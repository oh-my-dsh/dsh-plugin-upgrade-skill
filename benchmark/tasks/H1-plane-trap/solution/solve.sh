#!/bin/bash
# Oracle solution: overwrite the reference plugin files into their relative paths under /app/fixture/.
set -e
solution_dir="$(dirname "$0")"
cp "$solution_dir/plugin/index.js" /app/fixture/index.js
cp "$solution_dir/plugin/package.json" /app/fixture/package.json
cp "$solution_dir/plugin/cordis.patch.yml" /app/fixture/cordis.patch.yml
