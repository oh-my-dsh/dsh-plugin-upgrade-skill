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
import { dirname, extname, join, relative, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'

const [fromArg, toArg] = process.argv.slice(2)
if (!fromArg || !toArg) {
  console.error('usage: node provenance/refresh-from-upstream.mjs <v0.3.8-root> <v0.3.9-root>')
  process.exit(2)
}

const fromRoot = resolve(fromArg)
const toRoot = resolve(toArg)
const taskRoot = resolve(dirname(fileURLToPath(import.meta.url)), '..')
const fixtureRoot = join(taskRoot, 'environment', 'fixture')
const targetRoot = join(taskRoot, 'solution', 'target')
const provenanceRoot = join(taskRoot, 'provenance')
const testsRoot = join(taskRoot, 'tests')

// The fixture keeps the complete code/config/test text surface needed to reason about
// the real monorepo. Markdown is intentionally excluded so the parent repository's
// relative-link validator does not treat an upstream documentation snapshot as local docs.
// Binary package assets are excluded only after the script proves they are byte-identical
// between the two release tags.
const SOURCE_ENTRIES = [
  '.editorconfig',
  '.gitattributes',
  '.gitignore',
  'LICENSE',
  'package.json',
  'patches',
  'playwright.config.ts',
  'pnpm-lock.yaml',
  'pnpm-workspace.yaml',
  '.github/workflows/ci.yml',
  '.github/workflows/deploy-market.yml',
  '.github/workflows/release.yml',
  'packages',
  'scripts',
  'shared',
  'tests',
]

// Union of runtime/build/test files touched by the upstream alpha.2 compatibility commits
// 319f141d, 3d2db622, f0f19337, 5b1ea6c6, and 8b780b65. Documentation and decision notes
// are omitted; no compatibility implementation file is shortened or rewritten.
export const COMPATIBILITY_PATHS = [
  '.github/workflows/ci.yml',
  '.github/workflows/deploy-market.yml',
  '.github/workflows/release.yml',
  'packages/dsh-community-plugins/package.json',
  'packages/dsh-desktop-launcher/package.json',
  'packages/dsh-desktop-launcher/src/index.ts',
  'packages/dsh-desktop-launcher/tests/apply.spec.ts',
  'packages/dsh-doctor/package.json',
  'packages/dsh-doctor/src/client/doctor-types.ts',
  'packages/dsh-doctor/src/index.ts',
  'packages/dsh-git-graph/package.json',
  'packages/dsh-git-graph/src/client/index.ts',
  'packages/dsh-git-graph/src/index.ts',
  'packages/dsh-liangshen/package.json',
  'packages/dsh-liangshen/src/index.ts',
  'packages/dsh-market/lib/index.js',
  'packages/dsh-market/package.json',
  'packages/dsh-market/src/index.ts',
  'packages/dsh-perf/package.json',
  'packages/dsh-perf/src/index.ts',
  'packages/dsh-pet/package.json',
  'packages/dsh-pet/src/index.ts',
  'packages/dsh-plugin-manager/package.json',
  'packages/dsh-remote-web-ui/package.json',
  'packages/dsh-remote-web-ui/src/gate.ts',
  'packages/dsh-remote-web-ui/src/index.ts',
  'packages/dsh-remote-web-ui/src/remote-channel-boot.ts',
  'packages/dsh-remote-web-ui/src/remote-channel-rules.ts',
  'packages/dsh-remote-web-ui/src/remote-methods.ts',
  'packages/dsh-remote-web-ui/src/routes.ts',
  'packages/dsh-remote-web-ui/tests/remote-channel.spec.ts',
  'packages/dsh-remote-web-ui/tests/remote-contract.spec.ts',
  'packages/dsh-session-id/package.json',
  'packages/dsh-skill-explorer/package.json',
  'packages/dsh-ssh/package.json',
  'packages/dsh-ssh/src/index.ts',
  'packages/dsh-task-board/package.json',
  'packages/dsh-task-board/src/client/index.ts',
  'packages/dsh-task-board/src/host-runner.ts',
  'packages/dsh-task-board/src/index.ts',
  'packages/dsh-task-board/tests/host-runner.spec.ts',
  'packages/dsh-tool-describe-image/package.json',
  'packages/dsh-tool-describe-image/src/config-resolve.ts',
  'packages/dsh-tool-describe-image/src/index.ts',
  'packages/dsh-tool-describe-image/src/native-images.ts',
  'packages/dsh-usage/package.json',
  'packages/dsh-usage/src/host/usage-service.ts',
  'packages/dsh-usage/src/index.ts',
  'packages/dsh-usage/tests/apply.spec.ts',
  'packages/dsh-web-all/aggregate.yml',
  'packages/dsh-web-all/cordis.patch.yml',
  'packages/dsh-web-all/package.json',
  'packages/dsh-web-settings/package.json',
  'packages/dsh-web-settings/src/bridge.ts',
  'packages/skins/skin-center/lib/index.js',
  'packages/skins/skin-center/package.json',
  'packages/skins/skin-center/src/index.ts',
  'pnpm-lock.yaml',
  'pnpm-workspace.yaml',
  'scripts/aggregate.test.mjs',
  'scripts/build-cohort-tarballs.mjs',
  'scripts/inject-contract.test.mjs',
  'scripts/plugin-template/package.json',
  'shared/package.json',
  'shared/tests/web-platform.spec.ts',
  'shared/tsdown.client.ts',
  'shared/web-platform.ts',
].sort()

const digest = (buffer) => createHash('sha256').update(buffer).digest('hex')
const slash = (path) => path.replaceAll('\\', '/')
const isMarkdown = (path) => ['.md', '.mdx'].includes(extname(path).toLowerCase())
const isBinary = (buffer) => buffer.includes(0)

function walk(root, path = root) {
  const out = []
  for (const entry of readdirSync(path, { withFileTypes: true })) {
    const full = join(path, entry.name)
    if (entry.isDirectory()) out.push(...walk(root, full))
    else out.push(full)
  }
  return out
}

function copyOne(sourceRoot, destinationRoot, relPath) {
  const source = join(sourceRoot, relPath)
  const destination = join(destinationRoot, relPath)
  const stat = lstatSync(source)
  mkdirSync(dirname(destination), { recursive: true })
  if (stat.isSymbolicLink()) {
    symlinkSync(readlinkSync(source), destination)
    return { path: slash(relPath), type: 'symlink', target: readlinkSync(source) }
  }
  copyFileSync(source, destination)
  chmodSync(destination, stat.mode)
  const buffer = readFileSync(source)
  return { path: slash(relPath), type: 'file', bytes: buffer.length, sha256: digest(buffer) }
}

function sourceCandidates(root) {
  const paths = []
  for (const entry of SOURCE_ENTRIES) {
    const full = join(root, entry)
    if (!existsSync(full)) throw new Error(`missing source entry: ${full}`)
    const stat = lstatSync(full)
    if (stat.isDirectory()) paths.push(...walk(root, full).map((path) => slash(relative(root, path))))
    else paths.push(entry)
  }
  return [...new Set(paths)].sort()
}

function classify(root, relPath) {
  const full = join(root, relPath)
  const stat = lstatSync(full)
  if (stat.isSymbolicLink()) return 'text'
  if (isMarkdown(relPath)) return 'markdown'
  return isBinary(readFileSync(full)) ? 'binary' : 'text'
}

rmSync(fixtureRoot, { recursive: true, force: true })
rmSync(targetRoot, { recursive: true, force: true })
mkdirSync(fixtureRoot, { recursive: true })
mkdirSync(targetRoot, { recursive: true })

const fromCandidates = sourceCandidates(fromRoot)
const toCandidates = new Set(sourceCandidates(toRoot))
const sourceManifest = []
const excludedBinary = []
for (const relPath of fromCandidates) {
  const kind = classify(fromRoot, relPath)
  if (kind === 'markdown') continue
  if (kind === 'binary') {
    excludedBinary.push(relPath)
    if (!toCandidates.has(relPath)) throw new Error(`excluded binary disappeared in v0.3.9: ${relPath}`)
    const before = readFileSync(join(fromRoot, relPath))
    const after = readFileSync(join(toRoot, relPath))
    if (digest(before) !== digest(after)) throw new Error(`binary changed between tags and cannot be excluded: ${relPath}`)
    continue
  }
  sourceManifest.push(copyOne(fromRoot, fixtureRoot, relPath))
}

const targetManifest = []
for (const relPath of COMPATIBILITY_PATHS) {
  const targetPath = join(toRoot, relPath)
  if (!existsSync(targetPath)) {
    targetManifest.push({ path: relPath, deleted: true })
    continue
  }
  targetManifest.push(copyOne(toRoot, targetRoot, relPath))
}

const sourceData = {
  schema: 1,
  upstream: 'https://github.com/zhu1090093659/dsh-web',
  release: 'v0.3.8',
  commit: 'fa6d2a47302a2979c79bbd52a6318c98bad0f564',
  policy: 'byte-for-byte non-Markdown text/code/config/test snapshot; excluded binary files proved identical in v0.3.9',
  excludedBinaryCount: excludedBinary.length,
  files: sourceManifest,
}
const targetData = {
  schema: 1,
  upstream: 'https://github.com/zhu1090093659/dsh-web',
  release: 'v0.3.9',
  commit: '8b0191fea221c692e71f88abc51ce8146b32aa0d',
  compatibilityCommits: ['319f141d', '3d2db622', 'f0f19337', '5b1ea6c6', '8b780b65'],
  files: targetManifest,
}

writeFileSync(join(provenanceRoot, 'v0.3.8-source-manifest.json'), JSON.stringify(sourceData, null, 2) + '\n')
writeFileSync(join(provenanceRoot, 'v0.3.9-target-manifest.json'), JSON.stringify(targetData, null, 2) + '\n')
writeFileSync(join(testsRoot, 'target-manifest.json'), JSON.stringify(targetData, null, 2) + '\n')

console.log(`fixture: ${sourceManifest.length} exact text files; excluded ${excludedBinary.length} unchanged binary assets`)
console.log(`oracle target: ${targetManifest.filter((entry) => !entry.deleted).length} files; ${targetManifest.filter((entry) => entry.deleted).length} deletion`)
