// benchmark/scripts/validate-evaluation-snapshots.test.mjs
//
// Tests for the evaluation snapshot validator. Each test builds a minimal
// synthetic git repository in mkdtemp (no network, no GitHub): commit A pins the
// snapshot, commit B adds another task. The key invariant is that a snapshot
// pinned to commit A stays valid while the working tree sits at a later commit B.
import test from 'node:test'
import assert from 'node:assert/strict'
import { execFileSync } from 'node:child_process'
import { mkdtempSync, mkdirSync, writeFileSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { dirname, join } from 'node:path'
import { validateSnapshot, validateSnapshots } from './validate-evaluation-snapshots.mjs'

function initRepo() {
  const root = mkdtempSync(join(tmpdir(), 'snap-test-'))
  execFileSync('git', ['init', '-q'], { cwd: root })
  execFileSync('git', ['config', 'user.email', 'test@example.com'], { cwd: root })
  execFileSync('git', ['config', 'user.name', 'Test'], { cwd: root })
  return root
}

function write(root, rel, content = 'placeholder') {
  mkdirSync(dirname(join(root, rel)), { recursive: true })
  writeFileSync(join(root, rel), content)
}

function commitAll(root, message) {
  execFileSync('git', ['add', '-A'], { cwd: root })
  execFileSync('git', ['commit', '-q', '-m', message], { cwd: root })
  return execFileSync('git', ['rev-parse', 'HEAD'], { cwd: root, encoding: 'utf8' }).trim()
}

function writeTask(root, id) {
  write(root, `benchmark/tasks/${id}/task.toml`)
  write(root, `benchmark/tasks/${id}/instruction.md`)
}

function writeSkill(root, path = 'skills/plugin-upgrade') {
  write(root, `${path}/SKILL.md`)
}

// Repository with commit A (T1-alpha, T2-beta, skill) and commit B (adds T3-gamma).
function buildRepo({ withSkill = true, t2Instruction = true } = {}) {
  const root = initRepo()
  writeTask(root, 'T1-alpha')
  writeTask(root, 'T2-beta')
  if (!t2Instruction) {
    execFileSync('rm', ['-f', join(root, 'benchmark/tasks/T2-beta/instruction.md')], { cwd: root })
  }
  if (withSkill) writeSkill(root)
  const commitA = commitAll(root, 'A')
  writeTask(root, 'T3-gamma')
  const commitB = commitAll(root, 'B')
  return { root, commitA, commitB }
}

function manifest(commitA, commitB = commitA, overrides = {}) {
  return {
    schemaVersion: 1,
    id: '2026-09-01-test-a',
    createdAt: '2026-09-01',
    repository: 'oh-my-dsh/dsh-plugin-upgrade-skill',
    benchmark: { commit: commitA, taskCount: 2, tasks: ['T1-alpha', 'T2-beta'] },
    skill: { commit: commitB, path: 'skills/plugin-upgrade' },
    protocol: { runsPerTask: 3, aggregation: 'per-task-median', conditions: ['with-skill', 'no-harbor-injected-skill'] },
    notes: ['synthetic test snapshot'],
    ...overrides,
  }
}

function writeSnapshot(root, json, name = '2026-09-01-test-a.json') {
  write(root, `benchmark/snapshots/${name}`, JSON.stringify(json, null, 2))
}

function failures(root, json, name) {
  writeSnapshot(root, json, name)
  return validateSnapshots(join(root, 'benchmark', 'snapshots'), root).failures.join('\n')
}

function cleanup(root) {
  rmSync(root, { recursive: true, force: true })
}

test('valid snapshot passes', () => {
  const { root, commitA } = buildRepo()
  const result = validateSnapshot(manifest(commitA), '/fake/2026-09-01-test-a.json', root)
  cleanup(root)
  assert.deepEqual(result, [])
})

test('invalid JSON fails', () => {
  const { root, commitA } = buildRepo()
  mkdirSync(join(root, 'benchmark', 'snapshots'), { recursive: true })
  writeFileSync(join(root, 'benchmark', 'snapshots', 'broken.json'), '{not valid json')
  const result = validateSnapshots(join(root, 'benchmark', 'snapshots'), root)
  cleanup(root)
  void commitA
  assert.match(result.failures.join('\n'), /not valid JSON/)
})

test('filename/id mismatch fails', () => {
  const { root, commitA } = buildRepo()
  const out = failures(root, manifest(commitA), '2026-09-01-other.json')
  cleanup(root)
  assert.match(out, /filename must be "2026-09-01-test-a\.json"/)
})

test('malformed createdAt fails', () => {
  const { root, commitA } = buildRepo()
  const out = failures(root, manifest(commitA, commitA, { createdAt: 'not-a-date' }))
  cleanup(root)
  assert.match(out, /createdAt must be YYYY-MM-DD/)
})

test('createdAt not matching the id date prefix fails', () => {
  const { root, commitA } = buildRepo()
  const out = failures(root, manifest(commitA, commitA, { createdAt: '2026-08-31' }))
  cleanup(root)
  assert.match(out, /must match the date prefix of id/)
})

test('short benchmark SHA fails', () => {
  const { root, commitA } = buildRepo()
  const out = failures(root, manifest(commitA, commitA, { benchmark: { commit: commitA.slice(0, 8), taskCount: 2, tasks: ['T1-alpha', 'T2-beta'] } }))
  cleanup(root)
  assert.match(out, /benchmark\.commit must be a full 40-char lowercase hex SHA/)
})

test('short skill SHA fails', () => {
  const { root, commitA } = buildRepo()
  const out = failures(root, manifest(commitA, commitA, { skill: { commit: commitA.slice(0, 8), path: 'skills/plugin-upgrade' } }))
  cleanup(root)
  assert.match(out, /skill\.commit must be a full 40-char lowercase hex SHA/)
})

test('taskCount mismatch fails', () => {
  const { root, commitA } = buildRepo()
  const out = failures(root, manifest(commitA, commitA, { benchmark: { commit: commitA, taskCount: 3, tasks: ['T1-alpha', 'T2-beta'] } }))
  cleanup(root)
  assert.match(out, /taskCount \(3\) must equal tasks\.length \(2\)/)
})

test('duplicate task IDs fail', () => {
  const { root, commitA } = buildRepo()
  const out = failures(root, manifest(commitA, commitA, { benchmark: { commit: commitA, taskCount: 2, tasks: ['T1-alpha', 'T1-alpha'] } }))
  cleanup(root)
  assert.match(out, /duplicate task ID/)
})

test('invalid task ID format fails', () => {
  const { root, commitA } = buildRepo()
  const out = failures(root, manifest(commitA, commitA, { benchmark: { commit: commitA, taskCount: 2, tasks: ['T1-alpha', 'bad task id'] } }))
  cleanup(root)
  assert.match(out, /invalid task ID/)
})

test('task missing at the snapshot commit fails', () => {
  const { root, commitA } = buildRepo()
  const out = failures(root, manifest(commitA, commitA, { benchmark: { commit: commitA, taskCount: 2, tasks: ['T1-alpha', 'T9-ghost'] } }))
  cleanup(root)
  assert.match(out, /task "T9-ghost" has no task\.toml at benchmark commit/)
})

test('task without instruction.md at the snapshot commit fails', () => {
  const { root, commitA } = buildRepo({ t2Instruction: false })
  const out = failures(root, manifest(commitA))
  cleanup(root)
  assert.match(out, /task "T2-beta" has no instruction\.md at benchmark commit/)
})

test('missing skill path at the skill commit fails', () => {
  const { root, commitA } = buildRepo()
  const out = failures(root, manifest(commitA, commitA, { skill: { commit: commitA, path: 'skills/plugin-write' } }))
  cleanup(root)
  assert.match(out, /skill path "skills\/plugin-write" has no SKILL\.md at skill commit/)
})

test('skill missing entirely at the skill commit fails', () => {
  const { root, commitA } = buildRepo({ withSkill: false })
  const out = failures(root, manifest(commitA))
  cleanup(root)
  assert.match(out, /skill path "skills\/plugin-upgrade" has no SKILL\.md at skill commit/)
})

test('unresolvable benchmark commit gives an actionable fetch message', () => {
  const { root, commitA } = buildRepo()
  const bogus = '0'.repeat(40)
  const out = failures(root, manifest(bogus))
  cleanup(root)
  void commitA
  assert.match(out, /cannot resolve benchmark commit 0{40} in the local clone — fetch the referenced commit before validating/)
})

test('unresolvable skill commit gives an actionable fetch message', () => {
  const { root, commitA } = buildRepo()
  const out = failures(root, manifest(commitA, '1'.repeat(40)))
  cleanup(root)
  assert.match(out, /cannot resolve skill commit 1{40} in the local clone/)
})

test('invalid runsPerTask fails', () => {
  const { root, commitA } = buildRepo()
  for (const bad of [0, -1, 1.5, '3']) {
    const out = failures(root, manifest(commitA, commitA, { protocol: { runsPerTask: bad, aggregation: 'per-task-median', conditions: ['with-skill'] } }))
    assert.match(out, /runsPerTask must be an integer >= 1/)
  }
  cleanup(root)
})

test('empty conditions fail', () => {
  const { root, commitA } = buildRepo()
  const out = failures(root, manifest(commitA, commitA, { protocol: { runsPerTask: 3, aggregation: 'per-task-median', conditions: [] } }))
  cleanup(root)
  assert.match(out, /conditions must be a non-empty array/)
})

test('duplicate conditions fail', () => {
  const { root, commitA } = buildRepo()
  const out = failures(root, manifest(commitA, commitA, { protocol: { runsPerTask: 3, aggregation: 'per-task-median', conditions: ['with-skill', 'with-skill'] } }))
  cleanup(root)
  assert.match(out, /duplicate condition: with-skill/)
})

test('unsupported aggregation fails', () => {
  const { root, commitA } = buildRepo()
  const out = failures(root, manifest(commitA, commitA, { protocol: { runsPerTask: 3, aggregation: 'mean', conditions: ['with-skill'] } }))
  cleanup(root)
  assert.match(out, /aggregation must be one of \[per-task-median\]/)
})

test('non-string notes fail', () => {
  const { root, commitA } = buildRepo()
  const out = failures(root, manifest(commitA, commitA, { notes: [42] }))
  cleanup(root)
  assert.match(out, /notes must be an array of strings/)
})

test('wrong repository fails', () => {
  const { root, commitA } = buildRepo()
  const out = failures(root, manifest(commitA, commitA, { repository: 'someone-else/repo' }))
  cleanup(root)
  assert.match(out, /repository must be "oh-my-dsh\/dsh-plugin-upgrade-skill"/)
})

test('KEY: a snapshot pinned to commit A stays valid while the working tree sits at a later commit B', () => {
  const { root, commitA, commitB } = buildRepo()
  const snapshot = manifest(commitA)
  writeSnapshot(root, snapshot)
  const result = validateSnapshots(join(root, 'benchmark', 'snapshots'), root)
  cleanup(root)
  void commitB
  assert.equal(result.ok, true, result.failures.join('\n'))
  assert.equal(result.count, 1)
})

test('KEY: a task that only exists at the later commit fails when the snapshot points to the earlier commit', () => {
  const { root, commitA, commitB } = buildRepo()
  const snapshot = manifest(commitA, commitA, { benchmark: { commit: commitA, taskCount: 3, tasks: ['T1-alpha', 'T2-beta', 'T3-gamma'] } })
  writeSnapshot(root, snapshot)
  const result = validateSnapshots(join(root, 'benchmark', 'snapshots'), root)
  cleanup(root)
  void commitB
  assert.equal(result.ok, false)
  assert.match(result.failures.join('\n'), /task "T3-gamma" has no task\.toml at benchmark commit/)
})

test('a snapshot pinned to the later commit passes and includes the new task', () => {
  const { root, commitB } = buildRepo()
  const snapshot = manifest(commitB, commitB, { benchmark: { commit: commitB, taskCount: 3, tasks: ['T1-alpha', 'T2-beta', 'T3-gamma'] } })
  writeSnapshot(root, snapshot)
  const result = validateSnapshots(join(root, 'benchmark', 'snapshots'), root)
  cleanup(root)
  assert.equal(result.ok, true, result.failures.join('\n'))
})

test('a snapshot against a non-commit object id fails as unresolved', () => {
  const { root } = buildRepo()
  const treeSha = execFileSync('git', ['rev-parse', 'HEAD^{tree}'], { cwd: root, encoding: 'utf8' }).trim()
  const snapshot = manifest(treeSha)
  writeSnapshot(root, snapshot)
  const result = validateSnapshots(join(root, 'benchmark', 'snapshots'), root)
  cleanup(root)
  assert.equal(result.ok, false)
  assert.match(result.failures.join('\n'), /cannot resolve benchmark commit/)
})

test('snapshots directory without any manifests fails', () => {
  const { root } = buildRepo()
  mkdirSync(join(root, 'benchmark', 'snapshots'), { recursive: true })
  const result = validateSnapshots(join(root, 'benchmark', 'snapshots'), root)
  cleanup(root)
  assert.equal(result.ok, false)
  assert.match(result.failures.join('\n'), /no snapshot manifests found/)
})
