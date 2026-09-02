#!/bin/bash
# Oracle solution: copy the reference plugin files over the matching relative paths under /app/fixture/.
set -e
cp "$(dirname "$0")/plugin/package.json" /app/fixture/package.json
cp "$(dirname "$0")/plugin/cordis.patch.yml" /app/fixture/cordis.patch.yml
cp "$(dirname "$0")/plugin/.dsh-plugin/index.js" /app/fixture/.dsh-plugin/index.js
cp "$(dirname "$0")/plugin/.dsh-plugin/client.js" /app/fixture/.dsh-plugin/client.js
# The repository-shaped .dsh-plugin/package.json manifest is dropped: the alpha host
# walks up from the Node entry to the nearest package.json (the package root, which
# carries dsh.client); a nested manifest without dsh.client would shadow it and the
# browser half would stay invisible (DSH-0.1.1-R1-01).
rm -f /app/fixture/.dsh-plugin/package.json