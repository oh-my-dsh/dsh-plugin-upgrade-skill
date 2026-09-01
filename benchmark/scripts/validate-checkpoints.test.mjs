// Negative/self-tests for the checkpoint-manifest validator. Each case builds a
// minimal synthetic benchmark tree in mkdtemp; real benchmark files are never touched.
import test from 'node:test'
import assert from 'node:assert/strict'
import { mkdtempSync, mkdirSync, writeFileSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { validateCheckpoints, FAILURE_PREFIX } from './validate-checkpoints.mjs'

function buildTree(checkpoints, { judgeIds = true, cards = [], referenceText = '' } = {}) {
  const root = mkdtempSync(join(tmpdir(), 'checkpoints-test-'))
  const taskDir = join(root, 'benchmark', 'tasks', 'T1-sample')
  mkdirSync(join(taskDir, 'tests'), { recursive: true })
  mkdirSync(join(root, 'skills', 'plugin-upgrade', 'references'), { recursive: true })
  writeFileSync(join(root, 'skills', 'plugin-upgrade', 'references', 'v0.1.2-alpha.1.md'), referenceText + '\n')
  const manifest = {
    schema: 1,
    task: 'T1-sample',
    dshTarget: '0.1.2-alpha.2',
    cards,
    checkpoints,
    provenance: { author: 'test', date: '2026-09-01', evidence: 'synthetic' },
  }
  writeFileSync(join(taskDir, 'tests', 'checkpoints.json'), JSON.stringify(manifest, null, 2) + '\n')
  const ids = checkpoints.map((cp) => cp.id)
  const judgeBody = `// judge stub\nconst IDs = ${JSON.stringify(ids)}\n`
  writeFileSync(join(taskDir, 'tests', 'judge.mjs'), judgeIdText(judgeIds, ids))
  return root
}

function judgeIdText(judgeIds, ids) {
  const body = judgeIds ? ids.map((id) => `console.log('${id}')`).join('\n') : 'console.log("none")'
  return `// judge stub\n${body}\n`
}

const VALID = [
  { id: 'a-pass', type: 'pass', points: 50, measure: 'static' },
  { id: 'b-fail-to-pass', type: 'fail-to-pass', points: 50, measure: 'runtime' },
]

test('valid manifest passes', () => {
  const root = buildTree(VALID)
  const result = validateCheckpoints(root)
  rmSync(root, { recursive: true, force: true })
  assert.equal(result.ok, true, result.failures.join('\n'))
  assert.equal(result.manifests, 1)
})

test('tasks without a manifest are unaffected', () => {
  const root = buildTree(VALID)
  const plainDir = join(root, 'benchmark', 'tasks', 'T2-plain')
  mkdirSync(join(plainDir, 'tests'), { recursive: true })
  writeFileSync(join(plainDir, 'tests', 'judge.mjs'), '// legacy judge\n')
  const result = validateCheckpoints(root)
  rmSync(root, { recursive: true, force: true })
  assert.equal(result.ok, true)
  assert.equal(result.manifests, 1)
})

test('points not summing to 100 fails', () => {
  const root = buildTree([{ id: 'a-pass', type: 'pass', points: 30, measure: 'static' }])
  const result = validateCheckpoints(root)
  rmSync(root, { recursive: true, force: true })
  assert.equal(result.ok, false)
  assert.match(result.failures.join('\n'), /must sum to 100/)
})

test('unknown checkpoint type fails', () => {
  const root = buildTree([{ id: 'a-pass', type: 'pass', points: 50 }, { id: 'b-weird', type: 'magic', points: 50 }])
  const result = validateCheckpoints(root)
  rmSync(root, { recursive: true, force: true })
  assert.equal(result.ok, false)
  assert.match(result.failures.join('\n'), /type must be one of/)
})

test('uncited card fails', () => {
  const root = buildTree(VALID, { cards: ['DSH-0.1.2-A9-99'] })
  const result = validateCheckpoints(root)
  rmSync(root, { recursive: true, force: true })
  assert.equal(result.ok, false)
  assert.match(result.failures.join('\n'), /not cited in skills/)
})

test('cited card passes', () => {
  const root = buildTree(VALID, { cards: ['DSH-0.1.2-A1-08'], referenceText: '### DSH-0.1.2-A1-08 · example' })
  const result = validateCheckpoints(root)
  rmSync(root, { recursive: true, force: true })
  assert.equal(result.ok, true)
})

test('checkpoint not implemented in judge.mjs fails', () => {
  const root = buildTree(VALID, { judgeIds: false })
  const result = validateCheckpoints(root)
  rmSync(root, { recursive: true, force: true })
  assert.equal(result.ok, false)
  assert.match(result.failures.join('\n'), /not implemented in judge\.mjs/)
})

test('requires referencing a later checkpoint fails', () => {
  const root = buildTree([
    { id: 'a-early', type: 'pass', points: 50, requires: ['b-late'] },
    { id: 'b-late', type: 'pass', points: 50 },
  ])
  const result = validateCheckpoints(root)
  rmSync(root, { recursive: true, force: true })
  assert.equal(result.ok, false)
  assert.match(result.failures.join('\n'), /must reference an earlier checkpoint/)
})
