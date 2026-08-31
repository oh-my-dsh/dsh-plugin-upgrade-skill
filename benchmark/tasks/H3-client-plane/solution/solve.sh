#!/bin/bash
# Oracle 解法：把参考插件文件覆盖到 /app/fixture/ 对应相对路径。
set -e
cp "$(dirname "$0")/plugin/package.json" /app/fixture/package.json
cp "$(dirname "$0")/plugin/client.js" /app/fixture/client.js
cp "$(dirname "$0")/plugin/index.js" /app/fixture/index.js
cp "$(dirname "$0")/plugin/cordis.patch.yml" /app/fixture/cordis.patch.yml
