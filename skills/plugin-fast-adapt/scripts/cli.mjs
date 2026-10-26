#!/usr/bin/env node
// npm 入口（npx plugin-fast-adapt）：转发到 run.mjs。
// skill 本体（SKILL.md、scripts/、references/）随包分发，装好后把包目录作为
// skill 目录接入你的 agent 即可；本命令只是把一键编排暴露成可执行入口。

import { spawnSync } from 'node:child_process'
import fs from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

const here = path.dirname(fileURLToPath(import.meta.url))
const pkg = JSON.parse(fs.readFileSync(path.join(here, '..', 'package.json'), 'utf8'))
const args = process.argv.slice(2)

if (args.length === 0) {
  console.log(`plugin-fast-adapt v${pkg.version}

用法：
  plugin-fast-adapt <插件目录>                环境→定版→指南→扫描→体检→冒烟→typecheck
  plugin-fast-adapt <插件目录> --real-smoke   再补一档干净 profile 真装真启

skill 本体（SKILL.md、scripts/、references/）就在本包目录，
把包目录作为 skill 目录接入你的 agent 即可。`)
  process.exit(0)
}

const result = spawnSync(process.execPath, [path.join(here, 'run.mjs'), ...args], {
  stdio: 'inherit',
  shell: process.platform === 'win32',
})
process.exit(result.status ?? 1)
