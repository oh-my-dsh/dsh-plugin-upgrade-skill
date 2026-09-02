#!/bin/bash
# Oracle solution: copy the reference plugin files over the matching relative paths under /app/fixture/.
set -e
cp "$(dirname "$0")/plugin/package.json" /app/fixture/package.json
cp "$(dirname "$0")/plugin/cordis.patch.yml" /app/fixture/cordis.patch.yml
cp "$(dirname "$0")/plugin/lib/index.mjs" /app/fixture/lib/index.mjs
# The bundle manifest and the insert row are unchanged by the rename — only the Node
# half carries the renamed service identifiers (DSH-0.1.1-R1-09). The reference Node
# half deliberately avoids the retired identifier tokens even in comments, because
# the grader sweeps the migrated source for them.
echo "M14 oracle applied: service identifiers renamed to the alpha.2 names"