import assert from 'node:assert/strict'
import { execFileSync } from 'node:child_process'
import { mkdtempSync, mkdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import test from 'node:test'
import { fetchSnapshotCommits } from './fetch-snapshot-commits.mjs'

test('a snapshot pin outside branch history is fetched without changing the checkout or snapshot', () => {
  const directory = mkdtempSync(join(tmpdir(), 'snapshot-fetch-'))
  const git = (cwd, ...args) => execFileSync('git', ['-C', cwd, ...args], { encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'] }).trim()
  try {
    const origin = join(directory, 'origin')
    mkdirSync(origin)
    git(origin, 'init', '-b', 'main')
    git(origin, 'config', 'user.name', 'Snapshot test')
    git(origin, 'config', 'user.email', 'snapshot@example.invalid')
    git(origin, 'commit', '--allow-empty', '-m', 'main')
    const head = git(origin, 'rev-parse', 'HEAD')
    git(origin, 'switch', '--orphan', 'temporary-pr')
    git(origin, 'commit', '--allow-empty', '-m', 'snapshot pin')
    const pin = git(origin, 'rev-parse', 'HEAD')
    git(origin, 'switch', 'main')
    git(origin, 'branch', '-D', 'temporary-pr')
    const clone = join(directory, 'clone')
    git(directory, 'clone', '--no-local', origin, clone)
    assert.throws(() => git(clone, 'cat-file', '-e', `${pin}^{commit}`))
    const snapshots = join(clone, 'benchmark/snapshots')
    mkdirSync(snapshots, { recursive: true })
    const file = join(snapshots, 'snapshot.json')
    const content = JSON.stringify({ repository: 'oh-my-dsh/dsh-plugin-upgrade-skill', benchmark: { commit: pin }, skill: { commit: head } })
    writeFileSync(file, content)
    assert.deepEqual(fetchSnapshotCommits(clone), { commits: 2, fetched: [pin] })
    assert.equal(git(clone, 'rev-parse', 'HEAD'), head)
    assert.equal(readFileSync(file, 'utf8'), content)
    // An already prepared checkout does not need origin to remain reachable.
    git(clone, 'remote', 'remove', 'origin')
    assert.deepEqual(fetchSnapshotCommits(clone), { commits: 2, fetched: [] })
    for (const invalid of ['--upload-pack=bad', '../main', 'https://example.invalid/commit']) {
      writeFileSync(file, JSON.stringify({ repository: 'oh-my-dsh/dsh-plugin-upgrade-skill', benchmark: { commit: invalid }, skill: { commit: head } }))
      assert.throws(() => fetchSnapshotCommits(clone), /invalid benchmark commit/)
    }
  } finally {
    rmSync(directory, { recursive: true, force: true })
  }
})
