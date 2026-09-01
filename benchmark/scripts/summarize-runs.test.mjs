// benchmark/scripts/summarize-runs.test.mjs
//
// Pure-function tests for the Harbor run aggregator. No Docker, no Harbor, no
// network: synthetic trial-level and job-level result.json objects are written
// into mkdtemp directories and fed through the same functions the CLI uses.
import test from 'node:test'
import assert from 'node:assert/strict'
import { mkdtempSync, writeFileSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import {
  parseGroupArgs,
  summarize,
  renderMarkdown,
  renderJson,
  median,
  normalizeFile,
  loadResultFile,
} from './summarize-runs.mjs'

function trialJson({ id, taskId = 'S1-static-scan', trialName = `${taskId}__abc`, reward = 1, exception = null, model = null } = {}) {
  return {
    id,
    task_name: `dsh-plugin-upgrade/${taskId.toLowerCase()}`,
    trial_name: trialName,
    task_id: { path: `benchmark/tasks/${taskId}` },
    agent_info: { name: 'claude-code', model_info: model },
    config: { agent: { name: 'claude-code', model_name: model } },
    verifier_result: { rewards: reward === null ? {} : { reward } },
    exception_info: exception,
  }
}

function jobJson({ rewards = {}, exceptions = {}, cancelled = 0 } = {}) {
  return {
    id: 'job-id-1',
    stats: {
      n_completed_trials: 0,
      n_cancelled_trials: cancelled,
      evals: {
        'claude-code__adhoc': {
          reward_stats: { reward: rewards },
          exception_stats: exceptions,
        },
      },
    },
  }
}

function writeTrial(root, name, json) {
  const file = join(root, name)
  writeFileSync(file, JSON.stringify(json))
  return file
}

test('single result / single group summarizes correctly', () => {
  const root = mkdtempSync(join(tmpdir(), 'sr-'))
  const file = writeTrial(root, 'a.json', trialJson({ id: 't1', reward: 0.8 }))
  const { groups, anomalies } = summarize([{ label: 'run', paths: [file] }])
  rmSync(root, { recursive: true, force: true })
  assert.equal(groups.length, 1)
  assert.equal(groups[0].stats.records, 1)
  assert.equal(groups[0].stats.scored, 1)
  assert.equal(groups[0].stats.tasks, 1)
  assert.equal(groups[0].stats.rewardSum, 0.8)
  assert.equal(groups[0].stats.mean, 0.8)
  assert.equal(groups[0].stats.median, 0.8)
  assert.equal(groups[0].stats.perfect, 0)
  assert.equal(anomalies.length, 0)
})

test('two result files merge into one group', () => {
  const root = mkdtempSync(join(tmpdir(), 'sr-'))
  const f1 = writeTrial(root, 'a.json', trialJson({ id: 't1', taskId: 'S1-static-scan', reward: 1 }))
  const f2 = writeTrial(root, 'b.json', trialJson({ id: 't2', taskId: 'S2-negative-scan', reward: 0.5 }))
  const { groups } = summarize([{ label: 'run', paths: [f1, f2] }])
  rmSync(root, { recursive: true, force: true })
  assert.equal(groups[0].stats.records, 2)
  assert.equal(groups[0].stats.tasks, 2)
  assert.equal(groups[0].stats.rewardSum, 1.5)
})

test('same task 3 runs aggregates with a correct median', () => {
  const root = mkdtempSync(join(tmpdir(), 'sr-'))
  const f1 = writeTrial(root, 'a.json', trialJson({ id: 't1', taskId: 'S1-static-scan', trialName: 'S1-static-scan__r1', reward: 0.4 }))
  const f2 = writeTrial(root, 'b.json', trialJson({ id: 't2', taskId: 'S1-static-scan', trialName: 'S1-static-scan__r2', reward: 1 }))
  const f3 = writeTrial(root, 'c.json', trialJson({ id: 't3', taskId: 'S1-static-scan', trialName: 'S1-static-scan__r3', reward: 0.7 }))
  const { groups } = summarize([{ label: 'run', paths: [f1, f2, f3] }])
  rmSync(root, { recursive: true, force: true })
  const entry = groups[0].tasks.get('S1-static-scan')
  assert.equal(entry.n, 3)
  assert.equal(entry.median, 0.7)
  assert.equal(entry.mean, 0.7)
  assert.equal(entry.min, 0.4)
  assert.equal(entry.max, 1)
  assert.equal(entry.perfect, 1)
})

test('even-length median averages the two middle values', () => {
  assert.equal(median([1, 2, 3, 4]), 2.5)
  assert.equal(median([0.2, 0.8]), 0.5)
  assert.equal(median([1]), 1)
  assert.equal(median([]), null)
})

test('reward 0 is scored, not treated as missing', () => {
  const root = mkdtempSync(join(tmpdir(), 'sr-'))
  const file = writeTrial(root, 'a.json', trialJson({ id: 't1', reward: 0 }))
  const { groups, anomalies } = summarize([{ label: 'run', paths: [file] }])
  rmSync(root, { recursive: true, force: true })
  assert.equal(groups[0].stats.scored, 1)
  assert.equal(groups[0].stats.mean, 0)
  assert.equal(anomalies.length, 0)
})

test('perfect trials are counted', () => {
  const root = mkdtempSync(join(tmpdir(), 'sr-'))
  const f1 = writeTrial(root, 'a.json', trialJson({ id: 't1', taskId: 'S1-static-scan', trialName: 'S1-static-scan__r1', reward: 1 }))
  const f2 = writeTrial(root, 'b.json', trialJson({ id: 't2', taskId: 'S1-static-scan', trialName: 'S1-static-scan__r2', reward: 1 }))
  const f3 = writeTrial(root, 'c.json', trialJson({ id: 't3', taskId: 'S2-negative-scan', trialName: 'S2-negative-scan__r1', reward: 0.5 }))
  const { groups } = summarize([{ label: 'run', paths: [f1, f2, f3] }])
  rmSync(root, { recursive: true, force: true })
  assert.equal(groups[0].stats.perfect, 2)
})

test('no-reward trial is an anomaly and never scored as 0', () => {
  const root = mkdtempSync(join(tmpdir(), 'sr-'))
  const f1 = writeTrial(root, 'a.json', trialJson({ id: 't1', taskId: 'S1-static-scan', trialName: 'S1-static-scan__r1', reward: 1 }))
  const f2 = writeTrial(root, 'b.json', trialJson({ id: 't2', taskId: 'S2-negative-scan', trialName: 'S2-negative-scan__r1', reward: null }))
  const { groups, anomalies } = summarize([{ label: 'run', paths: [f1, f2] }])
  rmSync(root, { recursive: true, force: true })
  assert.equal(groups[0].stats.scored, 1)
  assert.equal(groups[0].stats.unscored, 1)
  assert.equal(groups[0].stats.mean, 1)
  assert.equal(groups[0].tasks.size, 1)
  assert.ok(anomalies.some((entry) => entry.type === 'no-reward'))
})

test('scored trial with an execution exception keeps its reward and is flagged', () => {
  const root = mkdtempSync(join(tmpdir(), 'sr-'))
  const file = writeTrial(root, 'a.json', trialJson({ id: 't1', reward: 1, exception: { type: 'AgentTimeoutError' } }))
  const { groups, anomalies } = summarize([{ label: 'run', paths: [file] }])
  rmSync(root, { recursive: true, force: true })
  assert.equal(groups[0].stats.scored, 1)
  assert.equal(groups[0].stats.rewardSum, 1)
  assert.ok(anomalies.some((entry) => entry.type === 'scored-with-exception' && entry.message.includes('reward kept')))
})

test('reward below 0 fails loudly', () => {
  const root = mkdtempSync(join(tmpdir(), 'sr-'))
  const file = writeTrial(root, 'a.json', trialJson({ id: 't1', reward: -0.1 }))
  assert.throws(() => summarize([{ label: 'run', paths: [file] }]), /malformed reward/)
  rmSync(root, { recursive: true, force: true })
})

test('reward above 1 fails loudly', () => {
  const root = mkdtempSync(join(tmpdir(), 'sr-'))
  const file = writeTrial(root, 'a.json', trialJson({ id: 't1', reward: 1.2 }))
  assert.throws(() => summarize([{ label: 'run', paths: [file] }]), /malformed reward/)
  rmSync(root, { recursive: true, force: true })
})

test('malformed JSON fails with an actionable message', () => {
  const root = mkdtempSync(join(tmpdir(), 'sr-'))
  const file = join(root, 'broken.json')
  writeFileSync(file, '{not json')
  assert.throws(() => summarize([{ label: 'run', paths: [file] }]), /not valid JSON/)
  rmSync(root, { recursive: true, force: true })
})

test('unsupported schema fails with an actionable message', () => {
  const root = mkdtempSync(join(tmpdir(), 'sr-'))
  const file = join(root, 'other.json')
  writeFileSync(file, JSON.stringify({ some: 'random shape' }))
  assert.throws(() => summarize([{ label: 'run', paths: [file] }]), /unsupported Harbor result\.json schema/)
  rmSync(root, { recursive: true, force: true })
})

test('the same input file listed twice is a hard error', () => {
  const root = mkdtempSync(join(tmpdir(), 'sr-'))
  const file = writeTrial(root, 'a.json', trialJson({ id: 't1' }))
  assert.throws(
    () => summarize([{ label: 'run', paths: [file, file] }]),
    /duplicate input file listed twice/,
  )
  rmSync(root, { recursive: true, force: true })
})

test('the same trial id loaded from two different files is a hard error', () => {
  const root = mkdtempSync(join(tmpdir(), 'sr-'))
  const f1 = writeTrial(root, 'a.json', trialJson({ id: 'same-id' }))
  const f2 = writeTrial(root, 'b.json', trialJson({ id: 'same-id' }))
  assert.throws(() => summarize([{ label: 'run', paths: [f1, f2] }]), /duplicate trial "same-id" loaded twice/)
  rmSync(root, { recursive: true, force: true })
})

test('two groups produce a paired comparison with deltas', () => {
  const root = mkdtempSync(join(tmpdir(), 'sr-'))
  const files = {
    a1: writeTrial(root, 'a1.json', trialJson({ id: 'a1', taskId: 'S1-static-scan', trialName: 'S1-static-scan__a1', reward: 1 })),
    a2: writeTrial(root, 'a2.json', trialJson({ id: 'a2', taskId: 'S2-negative-scan', trialName: 'S2-negative-scan__a1', reward: 0.4 })),
    b1: writeTrial(root, 'b1.json', trialJson({ id: 'b1', taskId: 'S1-static-scan', trialName: 'S1-static-scan__b1', reward: 0.6 })),
    b2: writeTrial(root, 'b2.json', trialJson({ id: 'b2', taskId: 'S2-negative-scan', trialName: 'S2-negative-scan__b1', reward: 0.4 })),
  }
  const { comparison } = summarize([
    { label: 'with-skill', paths: [files.a1, files.a2] },
    { label: 'no-skill', paths: [files.b1, files.b2] },
  ])
  rmSync(root, { recursive: true, force: true })
  assert.equal(comparison.commonTaskCount, 2)
  const s1 = comparison.rows.find((row) => row.taskId === 'S1-static-scan')
  assert.equal(s1.delta, 0.4)
  assert.equal(comparison.improved, 1)
  assert.equal(comparison.tied, 1)
  assert.equal(comparison.regressed, 0)
})

test('a task present in only one group is excluded from deltas and listed as an anomaly', () => {
  const root = mkdtempSync(join(tmpdir(), 'sr-'))
  const f1 = writeTrial(root, 'a1.json', trialJson({ id: 'a1', taskId: 'S1-static-scan', trialName: 'S1-static-scan__a1', reward: 1 }))
  const f2 = writeTrial(root, 'a2.json', trialJson({ id: 'a2', taskId: 'S2-negative-scan', trialName: 'S2-negative-scan__a1', reward: 0.5 }))
  const f3 = writeTrial(root, 'b1.json', trialJson({ id: 'b1', taskId: 'S1-static-scan', trialName: 'S1-static-scan__b1', reward: 0.6 }))
  const { comparison, anomalies } = summarize([
    { label: 'with-skill', paths: [f1, f2] },
    { label: 'no-skill', paths: [f3] },
  ])
  rmSync(root, { recursive: true, force: true })
  assert.equal(comparison.commonTaskCount, 1)
  assert.ok(comparison.missing.some((entry) => entry.taskId === 'S2-negative-scan' && entry.missingIn === 'no-skill'))
  assert.ok(anomalies.some((entry) => entry.type === 'missing-in-group' && entry.taskId === 'S2-negative-scan'))
  assert.equal(comparison.rows.length, 1)
})

test('improvement/tie/regression counts are computed from deltas', () => {
  const root = mkdtempSync(join(tmpdir(), 'sr-'))
  const mk = (id, task, reward) => writeTrial(root, `${id}.json`, trialJson({ id, taskId: task, trialName: `${task}__${id}`, reward }))
  const a = [mk('a1', 'T1', 0.8), mk('a2', 'T2', 0.5), mk('a3', 'T3', 0.2)]
  const b = [mk('b1', 'T1', 0.4), mk('b2', 'T2', 0.5), mk('b3', 'T3', 0.9)]
  const { comparison } = summarize([
    { label: 'A', paths: a },
    { label: 'B', paths: b },
  ])
  rmSync(root, { recursive: true, force: true })
  assert.equal(comparison.improved, 1)
  assert.equal(comparison.tied, 1)
  assert.equal(comparison.regressed, 1)
})

test('JSON output is deterministic and contains raw numbers', () => {
  const root = mkdtempSync(join(tmpdir(), 'sr-'))
  const f1 = writeTrial(root, 'a1.json', trialJson({ id: 'a1', taskId: 'S1-static-scan', trialName: 'S1-static-scan__a1', reward: 1 }))
  const f2 = writeTrial(root, 'a2.json', trialJson({ id: 'a2', taskId: 'S2-negative-scan', trialName: 'S2-negative-scan__a1', reward: 0.4 }))
  const summary = summarize([{ label: 'run', paths: [f1, f2] }])
  const first = renderJson(summary)
  const second = renderJson(summary)
  rmSync(root, { recursive: true, force: true })
  assert.equal(first, second)
  const parsed = JSON.parse(first)
  assert.equal(parsed.groups.run.mean, 0.7)
  assert.equal(typeof parsed.groups.run.median, 'number')
  assert.deepEqual(parsed.anomalies, [])
})

test('Markdown output is deterministic and lists the anomalies section', () => {
  const root = mkdtempSync(join(tmpdir(), 'sr-'))
  const f1 = writeTrial(root, 'a1.json', trialJson({ id: 'a1', taskId: 'S1-static-scan', trialName: 'S1-static-scan__a1', reward: 1 }))
  const f2 = writeTrial(root, 'a2.json', trialJson({ id: 'a2', taskId: 'S2-negative-scan', trialName: 'S2-negative-scan__a1', reward: null }))
  const summary = summarize([{ label: 'run', paths: [f1, f2] }])
  const first = renderMarkdown(summary)
  const second = renderMarkdown(summary)
  rmSync(root, { recursive: true, force: true })
  assert.equal(first, second)
  assert.match(first, /# Benchmark Run Summary/)
  assert.match(first, /## Anomalies/)
  assert.match(first, /\[no-reward\]/)
})

test('no groups at all is a hard error', () => {
  assert.throws(() => parseGroupArgs([]), /no --group given/)
})

test('job-level result.json expands into per-trial records from reward_stats', () => {
  const root = mkdtempSync(join(tmpdir(), 'sr-'))
  const file = join(root, 'job.json')
  writeFileSync(file, JSON.stringify(jobJson({ rewards: { '1.0': ['S1-static-scan__r1', 'S2-negative-scan__r1'], '0.5': ['S3-snapshot-migration__r1'] } })))
  const { groups, notes } = summarize([{ label: 'run', paths: [file] }])
  rmSync(root, { recursive: true, force: true })
  assert.equal(groups[0].stats.records, 3)
  assert.equal(groups[0].stats.scored, 3)
  assert.equal(groups[0].stats.rewardSum, 2.5)
  assert.ok(notes.some((entry) => entry.type === 'task-id-fallback'))
})

test('job-level cancelled trial count is reported as an anomaly', () => {
  const root = mkdtempSync(join(tmpdir(), 'sr-'))
  const file = join(root, 'job.json')
  writeFileSync(file, JSON.stringify(jobJson({ rewards: { '1.0': ['S1-static-scan__r1'] }, cancelled: 2 })))
  const { anomalies } = summarize([{ label: 'run', paths: [file] }])
  rmSync(root, { recursive: true, force: true })
  assert.ok(anomalies.some((entry) => entry.type === 'cancelled-count' && entry.message.includes('2')))
})

test('job-level exception without a reward is an anomaly', () => {
  const root = mkdtempSync(join(tmpdir(), 'sr-'))
  const file = join(root, 'job.json')
  writeFileSync(file, JSON.stringify(jobJson({ rewards: { '1.0': ['S1-static-scan__r1'] }, exceptions: { AgentTimeoutError: ['S2-negative-scan__r1'] } })))
  const { anomalies, groups } = summarize([{ label: 'run', paths: [file] }])
  rmSync(root, { recursive: true, force: true })
  assert.equal(groups[0].stats.scored, 1)
  assert.ok(anomalies.some((entry) => entry.type === 'exception' && entry.message.includes('AgentTimeoutError')))
})

test('normalizeFile on a trial-level object yields one record with normalized task id', () => {
  const parsed = trialJson({ id: 't1', taskId: 'H11-remote-result-boundary-trap' })
  const result = normalizeFile(parsed, 'run', '/tmp/example.json')
  assert.equal(result.records.length, 1)
  assert.equal(result.records[0].taskId, 'H11-remote-result-boundary-trap')
  assert.equal(result.records[0].scored, true)
})

test('loadResultFile throws for a missing path', () => {
  assert.throws(() => loadResultFile('/tmp/definitely-not-present-xyz.json'), /result file not found/)
})
