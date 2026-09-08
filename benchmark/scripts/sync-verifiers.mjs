#!/usr/bin/env node
// The task container mounts only its tests directory: never import repo paths.
import { existsSync, readdirSync, readFileSync, writeFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { join } from 'node:path'
const root = fileURLToPath(new URL('../tasks/', import.meta.url))
const check = process.argv.includes('--check')
let drift = false
for (const task of readdirSync(root)) {
  const tests = join(root, task, 'tests')
  if (!existsSync(join(tests, 'test.sh'))) continue
  for (const name of ['test.sh', 'verifier.mjs', 'judge-result.mjs']) {
    const source = readFileSync(new URL(`./verifier/${name}`, import.meta.url), 'utf8')
    const target = join(tests, name)
    if (check) {
      if (!existsSync(target) || readFileSync(target, 'utf8') !== source) { console.error(`${task}/${name}: generated verifier drift`); drift = true }
    } else writeFileSync(target, source)
  }
}
if (drift) process.exitCode = 1
