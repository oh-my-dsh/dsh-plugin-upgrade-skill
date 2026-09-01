#!/bin/bash
# Oracle solution: copy the reference profile files over the matching relative paths under /app/fixture/.
set -e
cp "$(dirname "$0")/profile/package.json" /app/fixture/package.json
cp "$(dirname "$0")/profile/cordis.patch.yml" /app/fixture/cordis.patch.yml
