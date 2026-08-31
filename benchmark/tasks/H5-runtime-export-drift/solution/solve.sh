#!/bin/bash
# Oracle 解法：把参考迁移按相对路径覆盖到 /app/fixture，clean rebuild 并跑测试。
# 真实 pack / 安装进隔离 profile / 冷启动由 judge 完成（judge 只认可 tarball 安装路径）。
set -e
DIR="$(dirname "$0")"
cp -R "$DIR/plugin/src" /app/fixture/
cp "$DIR/plugin/package.json" "$DIR/plugin/pnpm-lock.yaml" "$DIR/plugin/pnpm-workspace.yaml" /app/fixture/
cd /app/fixture
rm -rf dist
pnpm install --frozen-lockfile
pnpm typecheck
pnpm build
pnpm test
