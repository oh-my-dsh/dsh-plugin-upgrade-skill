import assert from 'node:assert/strict'
import test from 'node:test'
import { checkRecords, evaluationConfig, TASKS } from './skill-evaluation.mjs'
import { compareEvidence, GROUPS } from './compare-skill-evaluation.mjs'

test('comparison conditions change only supplied Skills, keeping tasks, model and attempts fixed', () => {
  const config = (condition) => evaluationConfig({ condition, model: 'anthropic/test-model', attempts: 3, output: '.artifacts/eval-test' })
  const baseline = config('no-injected-skill')
  const single = config('upgrade-only')
  const all = config('all-skills')
  assert.deepEqual(baseline.agents[0].skills, [])
  assert.equal(single.agents[0].skills.length, 1)
  assert(all.agents[0].skills.length >= 8)
  assert(all.agents[0].skills.some((path) => path.endsWith('/plugin-workflow')))
  for (const other of [single, all]) {
    assert.deepEqual(other.tasks, baseline.tasks)
    assert.equal(other.agents[0].model_name, baseline.agents[0].model_name)
    assert.equal(other.n_attempts, 3)
    assert.equal(other.retry.max_retries, 0)
    assert.equal(other.extra_instructions, undefined)
  }
})

test('controls never invoke a model or inject Skills; invalid inputs fail before execution', () => {
  for (const condition of ['oracle', 'nop']) {
    const config = evaluationConfig({ condition, output: '.artifacts/eval-test' })
    assert.equal(config.agents[0].name, condition)
    assert.equal(config.agents[0].model_name, undefined)
    assert.deepEqual(config.agents[0].skills, [])
  }
  for (const options of [{ condition: 'unknown' }, { condition: 'all-skills' }, { condition: 'oracle', attempts: 3 }, { condition: 'oracle', attempts: 0 }]) {
    assert.throws(() => evaluationConfig({ output: '.artifacts/eval-test', ...options }))
  }
})

test('controls reject a broken reference answer and a judge accepting untouched fixtures', () => {
  const manifest = { condition: 'oracle', tasks: TASKS, attempts: 1 }
  const records = TASKS.map((taskId) => ({ taskId, scored: true, reward: 1, status: 'completed' }))
  assert.deepEqual(checkRecords(records, manifest), [])
  assert(checkRecords(records.map((record) => ({ ...record, reward: 0.9 })), manifest).length)
  assert(checkRecords(records, { ...manifest, condition: 'nop' }).length)
  assert.deepEqual(checkRecords(records.map((record) => ({ ...record, reward: 0 })), { ...manifest, condition: 'nop' }), [])
})

test('missing, extra, duplicate and timeout trials cannot produce a complete evaluation', () => {
  const manifest = { condition: 'all-skills', tasks: TASKS, attempts: 1 }
  const records = TASKS.map((taskId) => ({ taskId, scored: true, reward: 0.5, status: 'completed' }))
  assert.deepEqual(checkRecords(records, manifest), [])
  assert(checkRecords([], manifest).length)
  assert(checkRecords(records.slice(1), manifest).length)
  assert(checkRecords([...records, records[0]], manifest).length)
  assert(checkRecords([...records, { ...records[0], taskId: 'unexpected' }], manifest).length)
  assert(checkRecords(records.map((record) => ({ ...record, status: 'completed-with-exception' })), manifest).length)
  assert(checkRecords(records.map((record) => ({ ...record, scored: false, reward: null })), manifest).length)
})

test('comparison identifies per-task degradation and refuses mismatched or incomplete runs', () => {
  const groups = Object.fromEntries(GROUPS.map((condition) => [condition, {
    evidence: { complete: true, dirty: false, condition, sourceCommit: 'a'.repeat(40), model: 'test', attempts: 3, tasks: ['S1-static-scan'], harborVersion: '0.22.0' },
    summary: { groups: { [condition]: { perTask: { 'S1-static-scan': { n: 3, median: condition === 'all-skills' ? 0.5 : 1 } } } } },
  }]))
  assert.equal(compareEvidence(groups)[0].compositionDelta, -0.5)
  for (const change of [{ complete: false }, { dirty: true }, { attempts: 1 }, { model: 'different' }, { sourceCommit: 'b'.repeat(40) }]) {
    const copy = structuredClone(groups)
    Object.assign(copy['all-skills'].evidence, change)
    assert.throws(() => compareEvidence(copy))
  }
  groups['all-skills'].summary.groups['all-skills'].perTask = {}
  assert.throws(() => compareEvidence(groups), /incomplete task inventory/)
})
