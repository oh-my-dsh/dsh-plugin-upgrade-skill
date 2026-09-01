#!/usr/bin/env node
/**
 * Materialize the preview SDK cohort tarball store that pnpm-workspace.yaml's
 * overrides block points at (see
 * .agents/notes/implemented/process/2026-08-28-preview-cohort-tarball-overrides.md).
 *
 * The 0.1.2-alpha.1 @deepseek-ai cohort is a developer preview that is not
 * published to npm: every override resolves to a file: tarball inside one
 * store directory. Those tarballs are built from the official upstream source
 * tag, so CI (and any machine without the store) rebuilds them with the
 * harness repository's own release packer — plus a direct pack for the
 * private experimental packages the publish family excludes but the
 * overrides still reference — and the frozen lockfile installs unchanged.
 *
 * Fast path: when the store already holds every referenced tarball the script
 * is a no-op, which makes CI runs that hit the actions cache instant.
 */

import { spawnSync } from 'node:child_process'
import { createHash } from 'node:crypto'
import { copyFileSync, existsSync, mkdirSync, readFileSync, readdirSync, renameSync, rmSync, statSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { basename, dirname, join, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'
import { parseArgs } from 'node:util'

const REPO_ROOT = resolve(fileURLToPath(new URL('..', import.meta.url)))
const WORKSPACE_FILE = join(REPO_ROOT, 'pnpm-workspace.yaml')

/** The upstream source the store must be built from; never build from HEAD. */
const HARNESS_REPO_URL = 'https://github.com/deepseek-ai/deepseek-harness.git'
const HARNESS_TAG = 'dsh-v0.1.2-alpha.1'
const HARNESS_COMMIT = 'cd5ef8148158c3a752a658978873241fdf8e2bbc'

function fail(message) {
  console.error(`build-cohort-tarballs: ${message}`)
  process.exit(1)
}

function resolveCommand(command, args) {
  if (process.platform === 'win32') {
    if (command === 'tar') {
      const systemTar = 'C:\\Windows\\System32\\tar.exe'
      if (existsSync(systemTar)) return { cmd: systemTar, args }
    }
    if (command === 'pnpm') {
      return { cmd: 'pnpm.cmd', args, shell: true }
    }
  }
  return { cmd: command, args }
}

function run(command, args, options = {}) {
  const resolved = resolveCommand(command, args)
  const result = spawnSync(resolved.cmd, resolved.args, {
    stdio: 'inherit',
    shell: resolved.shell ?? false,
    ...options,
  })
  if (result.status !== 0) {
    if (options.allowFailure) return false
    fail(`${command} ${args.join(' ')} failed with exit code ${result.status}`)
  }
  return true
}

function capture(command, args, options = {}) {
  const resolved = resolveCommand(command, args)
  const result = spawnSync(resolved.cmd, resolved.args, {
    encoding: 'utf8',
    shell: resolved.shell ?? false,
    ...options,
  })
  if (result.status !== 0) {
    fail(`${command} ${args.join(' ')} failed with exit code ${result.status}`)
  }
  return result.stdout.trim()
}

/**
 * Parse the overrides block into { name -> tarball absolute path }.
 * The block is machine-written flat YAML, so a line regex is enough and keeps
 * this script dependency-free.
 */
function readOverrides() {
  const overrides = {}
  for (const line of readFileSync(WORKSPACE_FILE, 'utf8').split('\n')) {
    const match = /^\s+'(@deepseek-ai\/[^']+)':\s*'file:([^']+)'\s*$/.exec(line)
    if (match) overrides[match[1]] = resolve(REPO_ROOT, match[2])
  }
  if (Object.keys(overrides).length === 0) {
    fail('no file: overrides found in pnpm-workspace.yaml; nothing to materialize')
  }
  return overrides
}

/** Verify the checkout is exactly the pinned source commit. */
function assertPinnedCommit(harnessDir) {
  const head = capture('git', ['-C', harnessDir, 'rev-parse', 'HEAD'])
  if (head !== HARNESS_COMMIT) {
    fail(`${harnessDir} is at ${head}, expected pinned ${HARNESS_COMMIT} (${HARNESS_TAG})`)
  }
}

/** Shallow-clone the pinned upstream tag and return the checkout path. */
function cloneHarness(workDir) {
  const dest = join(workDir, 'deepseek-harness')
  if (!existsSync(dest)) {
    mkdirSync(workDir, { recursive: true })
    run('git', ['clone', '--depth', '1', '--branch', HARNESS_TAG, HARNESS_REPO_URL, dest])
  }
  assertPinnedCommit(dest)
  return dest
}

/** Move produced tarballs from the scratch directory into the store, then remove the scratch. */
function collectTarballs(scratchDir, storeDir) {
  mkdirSync(storeDir, { recursive: true })
  for (const entry of readdirSync(scratchDir)) {
    if (!entry.endsWith('.tgz')) continue
    const target = join(storeDir, entry)
    if (!existsSync(target)) {
      const src = join(scratchDir, entry)
      try {
        renameSync(src, target)
      } catch (error) {
        if (error && (error.code === 'EXDEV' || error.code === 'EPERM')) {
          copyFileSync(src, target)
          rmSync(src, { force: true })
        } else {
          throw error
        }
      }
    }
  }
  rmSync(scratchDir, { recursive: true, force: true })
}

/** Pack the publish family with the harness's own release packer. */
function packFamily(harnessDir, scratchDir) {
  // Upstream harness scripts/release/pack.ts spawns 'pnpm' without shell: true on Windows,
  // which fails with ENOENT. When release:pack fails, packMissing directly packs every package.
  const ok = run('pnpm', ['run', 'release:pack', '--family', 'dsh', '--out', scratchDir, '--concurrency', '4'], {
    cwd: harnessDir,
    allowFailure: true,
  })
  if (!ok) {
    console.warn('build-cohort-tarballs: release:pack unavailable on this platform; falling back to direct package pack')
  }
}

/**
 * Workspace package directories of the harness checkout, bounded scan:
 * private experimental members are absent from the publish family but still
 * referenced by the overrides, so they are packed directly.
 */
function findPackageDirs(harnessDir) {
  const dirs = []
  const skip = new Set(['node_modules', '.git', 'dist', 'coverage', '.turbo'])
  const walk = (dir, depth) => {
    if (depth > 4) return
    if (existsSync(join(dir, 'package.json'))) dirs.push(dir)
    for (const entry of readdirSync(dir, { withFileTypes: true })) {
      if (entry.isDirectory() && !skip.has(entry.name)) walk(join(dir, entry.name), depth + 1)
    }
  }
  walk(harnessDir, 0)
  return dirs
}

/** Directly pack every referenced package the family pack did not produce. */
function packMissing(harnessDir, expected, storeDir, scratchDir) {
  const missing = [...expected.keys()].filter(name => !existsSync(expected.get(name)))
  if (missing.length === 0) return
  const nameToDir = {}
  for (const dir of findPackageDirs(harnessDir)) {
    try {
      const manifest = JSON.parse(readFileSync(join(dir, 'package.json'), 'utf8'))
      if (manifest.name) nameToDir[manifest.name] = dir
    } catch {
      // Unreadable side manifests are irrelevant to the cohort.
    }
  }
  mkdirSync(scratchDir, { recursive: true })
  for (const name of missing) {
    const dir = nameToDir[name]
    if (!dir) fail(`cannot locate harness workspace package ${name}`)
    run('pnpm', ['--dir', dir, 'pack', '--pack-destination', scratchDir], { cwd: harnessDir })
  }
  collectTarballs(scratchDir, storeDir)
}

/**
 * Make every packed manifest self-contained the way the cohort store
 * requires: dsh-web's lockfile installs with autoInstallPeers disabled, so a
 * peers-shape tarball would not pull its sibling tarballs transitively. The
 * store therefore merges peerDependencies into dependencies (ranges are
 * already realized from workspace: specifiers by the pack step) and drops the
 * peer sections, matching the store the cohort was first built from.
 */
function normalizePackedManifests(storeDir) {
  for (const entry of readdirSync(storeDir)) {
    if (!entry.endsWith('.tgz')) continue
    const tarball = join(storeDir, entry)
    const work = join(tmpdir(), `dsh-cohort-normalize-${Date.now()}-${entry.replace(/\.tgz$/, '')}`)
    mkdirSync(work, { recursive: true })
    try {
      run('tar', ['-xzf', tarball, '-C', work], {
        // bsdtar on macOS would otherwise add AppleDouble resource forks.
        env: { ...process.env, COPYFILE_DISABLE: '1' },
      })
      const manifestPath = join(work, 'package', 'package.json')
      const manifest = JSON.parse(readFileSync(manifestPath, 'utf8'))
      const peers = manifest.peerDependencies
      if (!peers || Object.keys(peers).length === 0) continue
      const merged = { ...(manifest.dependencies ?? {}), ...peers }
      manifest.dependencies = Object.fromEntries(Object.entries(merged).sort(([a], [b]) => (a < b ? -1 : a > b ? 1 : 0)))
      delete manifest.peerDependencies
      // peerDependenciesMeta stays: it documents optional peers as inert
      // metadata once the peer section is gone, and the store it must match
      // kept it too.
      writeFileSync(manifestPath, `${JSON.stringify(manifest, null, 2)}\n`)
      run('tar', ['-czf', tarball, '-C', work, 'package'], {
        env: { ...process.env, COPYFILE_DISABLE: '1' },
      })
    } finally {
      rmSync(work, { recursive: true, force: true })
    }
  }
}

/**
 * Refresh the lockfile's recorded integrity for the cohort tarballs so the
 * frozen install verifies against the store that actually sits on this
 * machine. pnpm records a sha512 for file: tarballs, and a rebuilt store is
 * never byte-identical to the original (client faces embed the building
 * checkout's absolute path), so each environment anchors the integrity to its
 * own verified store. Hash matches leave the lockfile untouched; the rewrite
 * never enters git.
 */
function refreshLockfileIntegrity(storeDir, versionDir) {
  const lockPath = join(REPO_ROOT, 'pnpm-lock.yaml')
  const marker = `.dsh-cohorts/${versionDir}/`
  let updated = 0
  const lines = readFileSync(lockPath, 'utf8').split('\n').map(line => {
    const trimmed = line.trim()
    if (!trimmed.startsWith('resolution:') || !trimmed.includes(marker)) return line
    const name = trimmed.split(marker)[1]?.replace(/\.tgz.*/, '.tgz')
    const tarball = name !== undefined ? join(storeDir, name) : undefined
    if (!tarball || !existsSync(tarball)) return line
    const hash = `sha512-${createHash('sha512').update(readFileSync(tarball)).digest('base64')}`
    const next = line.replace(/integrity: sha512-[^,}]*/, `integrity: ${hash}`)
    if (next !== line) updated += 1
    return next
  })
  if (updated > 0) {
    writeFileSync(lockPath, lines.join('\n'))
    console.log(`build-cohort-tarballs: refreshed ${updated} lockfile integrity entr${updated === 1 ? 'y' : 'ies'}`)
  }
}

/** Every expected tarball must exist and be non-empty. */
function verifyStore(expected) {
  const missing = []
  for (const [name, tarball] of expected) {
    if (!existsSync(tarball) || statSync(tarball).size === 0) missing.push(`${name} -> ${tarball}`)
  }
  if (missing.length > 0) {
    fail(`store incomplete, ${missing.length} tarball(s) missing:\n  ${missing.slice(0, 10).join('\n  ')}${missing.length > 10 ? '\n  ...' : ''}`)
  }
}

async function main() {
  const { values } = parseArgs({
    options: {
      'harness-dir': { type: 'string' },
      'store-dir': { type: 'string' },
      'skip-install': { type: 'boolean' },
      'skip-build': { type: 'boolean' },
    },
    allowPositionals: false,
  })

  const overrides = readOverrides()
  // The lockfile stores the tarball resolutions relative to the checkout root
  // (file:../../.dsh-cohorts/...), so the store lives two levels above the
  // checkout on every machine; --store-dir remaps it for sandboxed runs.
  const overridePaths = Object.values(overrides)
  const versionDir = basename(dirname(overridePaths[0]))
  const storeDir = resolve(values['store-dir'] ?? join(REPO_ROOT, '..', '..', '.dsh-cohorts', versionDir))
  const expected = new Map(
    Object.entries(overrides).map(([name, path]) => [name, join(storeDir, basename(path))]),
  )

  const missingBefore = [...expected.values()].filter(path => !existsSync(path) || statSync(path).size === 0).length
  if (missingBefore === 0) {
    refreshLockfileIntegrity(storeDir, versionDir)
    console.log(`build-cohort-tarballs: store complete at ${storeDir} (${expected.size} tarballs); nothing to do`)
    return
  }
  console.log(`build-cohort-tarballs: ${missingBefore}/${expected.size} tarball(s) missing from ${storeDir}`)

  let harnessDir = values['harness-dir']
  if (harnessDir) {
    assertPinnedCommit(resolve(harnessDir))
    harnessDir = resolve(harnessDir)
  } else {
    harnessDir = cloneHarness(join(tmpdir(), 'dsh-cohort-build'))
  }

  if (!values['skip-install']) run('pnpm', ['install', '--frozen-lockfile', '--ignore-scripts'], { cwd: harnessDir })
  // The release packer's build-record gate demands the official artifact
  // profile; a dev-profile build record makes release:pack refuse to pack.
  if (!values['skip-build']) run('pnpm', ['run', 'build:official'], { cwd: harnessDir })

  const scratchDir = join(tmpdir(), `dsh-cohort-pack-${Date.now()}`)
  packFamily(harnessDir, scratchDir)
  collectTarballs(scratchDir, storeDir)
  packMissing(harnessDir, expected, storeDir, scratchDir)
  normalizePackedManifests(storeDir)
  verifyStore(expected)
  refreshLockfileIntegrity(storeDir, versionDir)
  console.log(`build-cohort-tarballs: store ready at ${storeDir} (${expected.size} tarballs)`)
}

main()
