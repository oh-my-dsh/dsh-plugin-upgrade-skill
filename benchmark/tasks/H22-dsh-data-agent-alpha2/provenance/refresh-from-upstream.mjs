#!/usr/bin/env node

import { createHash } from 'node:crypto'
import {
  chmodSync,
  copyFileSync,
  existsSync,
  lstatSync,
  mkdirSync,
  readFileSync,
  readlinkSync,
  readdirSync,
  rmSync,
  symlinkSync,
  writeFileSync,
} from 'node:fs'
import { dirname, join, relative, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'

const [fromArg, toArg] = process.argv.slice(2)
if (!fromArg || !toArg) {
  console.error('usage: node provenance/refresh-from-upstream.mjs <v0.1.3-root> <v0.1.4-root>')
  process.exit(2)
}

const fromRoot = resolve(fromArg)
const toRoot = resolve(toArg)
const taskRoot = resolve(dirname(fileURLToPath(import.meta.url)), '..')
const fixtureRoot = join(taskRoot, 'environment', 'fixture')
const targetRoot = join(taskRoot, 'solution', 'target')
const provenanceRoot = join(taskRoot, 'provenance')
const testsRoot = join(taskRoot, 'tests')

// Exact `git diff --name-only v0.1.3..v0.1.4`. The script independently computes
// the two full trees and fails if upstream content does not produce this same set.
export const COMPATIBILITY_PATHS = [
  'README.en.md',
  'README.md',
  'conformance/dsh-ecosystem/inventory.json',
  'dsh-plugin.json',
  'lib/client.js',
  'lib/client.js.map',
  'lib/types/catalog-tools.d.ts',
  'lib/types/client/DataAgentHeroControls.d.ts',
  'lib/types/client/DataAgentWorkbench.d.ts',
  'lib/types/client/analysis-view-model.d.ts',
  'lib/types/client/index.d.ts',
  'lib/types/client/workbench-open.d.ts',
  'lib/types/client/workbench-placeholder.d.ts',
  'package.json',
  'pnpm-lock.yaml',
  'pnpm-workspace.yaml',
  'src/catalog-tools.ts',
  'src/client/AnalysisDashboard.tsx',
  'src/client/DataAgentHeroControls.tsx',
  'src/client/DataAgentWorkbench.module.css',
  'src/client/DataAgentWorkbench.tsx',
  'src/client/analysis-view-model.ts',
  'src/client/index.ts',
  'src/client/workbench-open.ts',
  'src/client/workbench-placeholder.ts',
  'src/tool.ts',
  'tests/analysis-dashboard.spec.tsx',
  'tests/analysis-view-model.spec.ts',
  'tests/data-agent-hero-controls.spec.tsx',
  'tests/data-agent-workbench.spec.tsx',
  'tests/ecosystem-conformance.spec.ts',
  'tests/surfaces.spec.ts',
  'tests/workbench-layout.spec.ts',
  'tests/workbench-open.spec.ts',
].sort()

const slash = (path) => path.replaceAll('\\', '/')
const digest = (buffer) => createHash('sha256').update(buffer).digest('hex')

function walk(root, path = root) {
  const out = []
  for (const entry of readdirSync(path, { withFileTypes: true })) {
    if (entry.name === '.git') continue
    const full = join(path, entry.name)
    if (entry.isDirectory()) out.push(...walk(root, full))
    else out.push(slash(relative(root, full)))
  }
  return out.sort()
}

function describe(root, relPath) {
  const path = join(root, relPath)
  const stat = lstatSync(path)
  if (stat.isSymbolicLink()) {
    return { path: relPath, type: 'symlink', target: readlinkSync(path) }
  }
  const buffer = readFileSync(path)
  return {
    path: relPath,
    type: 'file',
    bytes: buffer.length,
    sha256: digest(buffer),
    executable: Boolean(stat.mode & 0o111),
  }
}

function sameEntry(left, right) {
  if (left === undefined || right === undefined || left.type !== right.type) return false
  if (left.type === 'symlink') return left.target === right.target
  return left.sha256 === right.sha256 && left.executable === right.executable
}

function copyOne(sourceRoot, destinationRoot, relPath) {
  const source = join(sourceRoot, relPath)
  const destination = join(destinationRoot, relPath)
  const stat = lstatSync(source)
  mkdirSync(dirname(destination), { recursive: true })
  if (stat.isSymbolicLink()) {
    symlinkSync(readlinkSync(source), destination)
    return describe(sourceRoot, relPath)
  }
  copyFileSync(source, destination)
  chmodSync(destination, stat.mode)
  return describe(sourceRoot, relPath)
}

for (const root of [fromRoot, toRoot]) {
  if (!existsSync(join(root, 'LICENSE')) || !existsSync(join(root, 'package.json'))) {
    throw new Error(`not a dsh-data-agent release tree: ${root}`)
  }
}

const fromPaths = walk(fromRoot)
const toPaths = walk(toRoot)
const fromEntries = new Map(fromPaths.map((path) => [path, describe(fromRoot, path)]))
const toEntries = new Map(toPaths.map((path) => [path, describe(toRoot, path)]))
const union = [...new Set([...fromPaths, ...toPaths])].sort()
const computedDiff = union.filter((path) => !sameEntry(fromEntries.get(path), toEntries.get(path)))

if (JSON.stringify(computedDiff) !== JSON.stringify(COMPATIBILITY_PATHS)) {
  const expected = new Set(COMPATIBILITY_PATHS)
  const actual = new Set(computedDiff)
  const missing = COMPATIBILITY_PATHS.filter((path) => !actual.has(path))
  const extra = computedDiff.filter((path) => !expected.has(path))
  throw new Error(`release diff drifted; missing=[${missing.join(', ')}] extra=[${extra.join(', ')}]`)
}

rmSync(fixtureRoot, { recursive: true, force: true })
rmSync(targetRoot, { recursive: true, force: true })
mkdirSync(fixtureRoot, { recursive: true })
mkdirSync(targetRoot, { recursive: true })

const sourceManifest = fromPaths.map((path) => copyOne(fromRoot, fixtureRoot, path))
const targetManifest = COMPATIBILITY_PATHS.map((path) => {
  if (!toEntries.has(path)) return { path, deleted: true, source: fromEntries.get(path) }
  return {
    ...copyOne(toRoot, targetRoot, path),
    source: fromEntries.get(path) ?? null,
  }
})

const sourceData = {
  schema: 1,
  upstream: 'https://github.com/omdsh-dev/dsh-data-agent',
  release: 'v0.1.3',
  commit: '8e3ab6a3560733c11417bdf2912c9db4f09a6974',
  tree: 'bb08c66de2f0712501d0aa74e51223b7c7f98889',
  policy: 'complete byte-for-byte Git tracked release tree; no path or binary exclusions',
  files: sourceManifest,
}
const targetData = {
  schema: 1,
  upstream: 'https://github.com/omdsh-dev/dsh-data-agent',
  release: 'v0.1.4',
  commit: 'd1bd4381ed771d505db69f2a9065379f7d3165a0',
  tree: 'c905a4422bd825a0bb6c4c2408ef2dc3fffdc2f6',
  compatibilityCommit: 'd1bd4381ed771d505db69f2a9065379f7d3165a0',
  policy: 'every byte-different, added, or deleted path between the complete release trees',
  files: targetManifest,
}

writeFileSync(join(provenanceRoot, 'v0.1.3-source-manifest.json'), JSON.stringify(sourceData, null, 2) + '\n')
writeFileSync(join(provenanceRoot, 'v0.1.4-target-manifest.json'), JSON.stringify(targetData, null, 2) + '\n')
writeFileSync(join(testsRoot, 'target-manifest.json'), JSON.stringify(targetData, null, 2) + '\n')

console.log(`fixture: ${sourceManifest.length} exact tracked files; no exclusions`)
console.log(`oracle target: ${targetManifest.filter((entry) => !entry.deleted).length} files; ${targetManifest.filter((entry) => entry.deleted).length} deletions`)
