#!/bin/bash
# Oracle solution: copy the reference plugin files over the matching relative paths under /app/fixture/.
set -e
cp "$(dirname "$0")/plugin/package.json" /app/fixture/package.json
cp "$(dirname "$0")/plugin/lib/index.js" /app/fixture/lib/index.js
cp "$(dirname "$0")/plugin/cordis.patch.yml" /app/fixture/cordis.patch.yml
