import assert from 'node:assert/strict'
import { mkdtempSync, mkdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import test from 'node:test'
import { check, checkRecords, evaluationConfig, TASKS } from './skill-evaluation.mjs'
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

test('Harbor trial files produce complete evidence and usage; missing usage remains explicit', () => {
  const directory = mkdtempSync(join(tmpdir(), 'skill-evidence-test-'))
  try {
    writeFileSync(join(directory, 'manifest.json'), JSON.stringify({
      condition: 'all-skills', tasks: ['S1-static-scan'], attempts: 1,
      sourceCommit: 'a'.repeat(40), dirty: false,
    }))
    const trialDirectory = join(directory, 'jobs/all-skills/S1-static-scan__trial')
    mkdirSync(trialDirectory, { recursive: true })
    const path = join(trialDirectory, 'result.json')
    const trial = {
      id: 'synthetic-test-only', task_id: { path: '/tasks/S1-static-scan' },
      verifier_result: { rewards: { reward: 0.75 } }, exception_info: null,
      agent_result: { n_input_tokens: 100, n_output_tokens: 20, n_cache_tokens: 50 },
      started_at: '2026-09-04T00:00:00Z', finished_at: '2026-09-04T00:00:02Z',
    }
    writeFileSync(path, JSON.stringify(trial))
    const evidence = check(directory)
    assert.equal(evidence.complete, true)
    assert.equal(evidence.usage.inputTokens, 100)
    assert.equal(evidence.usage.outputTokens, 20)
    assert.equal(evidence.usage.cacheTokens, 50)
    assert.equal(evidence.usage.durationSeconds, 2)
    assert.equal(JSON.parse(readFileSync(join(directory, 'summary.json'), 'utf8')).groups['all-skills'].scored, 1)
    delete trial.agent_result
    delete trial.finished_at
    writeFileSync(path, JSON.stringify(trial))
    const missing = check(directory)
    assert.equal(missing.usage.missingUsageTrials, 1)
    assert.equal(missing.usage.missingCacheTrials, 1)
    assert.equal(missing.usage.missingDurationTrials, 1)
    rmSync(path)
    assert.equal(check(directory).complete, false)
  } finally {
    rmSync(directory, { recursive: true, force: true })
  }
})
