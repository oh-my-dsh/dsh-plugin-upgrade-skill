#!/bin/bash
# Oracle 解法：把参考插件文件覆盖到 /app/fixture/ 对应相对路径。
set -e
solution_dir="$(dirname "$0")"
cp "$solution_dir/plugin/index.js" /app/fixture/index.js
cp "$solution_dir/plugin/package.json" /app/fixture/package.json
cp "$solution_dir/plugin/cordis.patch.yml" /app/fixture/cordis.patch.yml
