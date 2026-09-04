#!/bin/bash
# Apply the H21 reference implementation and its regression suite to the
# fixture, mirroring H11's solve layout (solution/plugin mirrors the fixture
# file-for-file).
set -e
ROOT="$(dirname "$0")"
cp "$ROOT/plugin/src/register.js" /app/fixture/src/register.js
cp "$ROOT/plugin/test/register.test.mjs" /app/fixture/test/register.test.mjs
