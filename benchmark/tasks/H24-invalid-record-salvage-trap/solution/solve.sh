#!/bin/bash
# Oracle solution: replace the fixture domain spec with the alpha.5 salvage.
set -e
cp "$(dirname "$0")/src/domain-spec.mjs" /app/fixture/src/domain-spec.mjs
