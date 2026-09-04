#!/usr/bin/env node
// Explicit CI preparation. The offline validator never fetches or rewrites pins.
import { execFileSync } from 'node:child_process'
import { readdirSync, readFileSync } from 'node:fs'
import { join, resolve } from 'node:path'
import { fileURLToPath, pathToFileURL } from 'node:url'
import { FULL_SHA_RE, gitCommitResolvable, REPOSITORY } from '../benchmark/scripts/validate-evaluation-snapshots.mjs'

export function snapshotCommits(root) {
  const directory = join(root, 'benchmark/snapshots')
  const commits = new Set()
  for (const file of readdirSync(directory).sort()) {
    if (!file.endsWith('.json') || file === 'schema.json') continue
    const snapshot = JSON.parse(readFileSync(join(directory, file), 'utf8'))
    if (snapshot.repository !== REPOSITORY) throw new Error(`${file}: unexpected repository`)
    for (const kind of ['benchmark', 'skill']) {
      const sha = snapshot[kind]?.commit
      if (typeof sha !== 'string' || !FULL_SHA_RE.test(sha)) throw new Error(`${file}: invalid ${kind} commit`)
      commits.add(sha)
    }
  }
  if (!commits.size) throw new Error('No evaluation snapshot commits found')
  return [...commits].sort()
}

export function fetchSnapshotCommits(root) {
  // Validate every input before making any network request. Only the clone's
  // existing origin is used; manifests cannot choose URLs, refspecs or options.
  const commits = snapshotCommits(root)
  const fetched = []
  for (const sha of commits) {
    if (gitCommitResolvable(root, sha)) continue
    try {
      execFileSync('git', ['-C', root, 'fetch', '--no-tags', '--no-recurse-submodules', 'origin', sha], {
        stdio: 'pipe', timeout: 120_000,
      })
    } catch {
      throw new Error(`Cannot fetch pinned commit ${sha} from origin; preserve the snapshot and restore the upstream commit`)
    }
    if (!gitCommitResolvable(root, sha)) throw new Error(`Fetched commit ${sha} is still unavailable`)
    fetched.push(sha)
  }
  return { commits: commits.length, fetched }
}

if (process.argv[1] && pathToFileURL(resolve(process.argv[1])).href === import.meta.url) {
  try {
    const root = fileURLToPath(new URL('../', import.meta.url))
    const result = fetchSnapshotCommits(root)
    console.log(`Snapshot commits ready: ${result.commits} pins, ${result.fetched.length} fetched`)
  } catch (error) {
    console.error(`[snapshot-fetch] ${error.message}`)
    process.exitCode = 1
  }
}
