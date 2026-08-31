#!/bin/bash
# Oracle 解法：把参考插件改动按相对路径覆盖到 /app/fixture（不碰其他文件）。
set -e
DIR="$(dirname "$0")"
cp "$DIR/plugin/index.js" "$DIR/plugin/package.json" "$DIR/plugin/cordis.patch.yml" /app/fixture/
