// benchmark/scripts/summarize-paired-subgroups.test.mjs
//
// Focused tests for the derived Qwen paired subgroup analysis. They pin the
// median-of-3 semantics, the two independent axes, the missing/unknown rules
// (never imputed as 0), the pinned-registry provenance and the determinism of the
// rendered output. No model is called and no run is executed.
import test from 'node:test'
import assert from 'node:assert/strict'
import { execFileSync } from 'node:child_process'
import { readFileSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'
import {
  ATTEMPTS_PER_CONDITION,
  AXES,
  CONDITIONS,
  EXPECTED_JOBS,
  EXPECTED_TASKS,
  aggregateTasks,
  assertReportIdentity,
  buildBreakdown,
  companionCsvPath,
  loadPinnedRegistry,
  loadRegistryFromText,
  meanBasedPairing,
  median,
  parseArgs,
  parseCsv,
  parseSourceCommit,
  parseUsageCell,
  renderJson,
  renderMarkdown,
  resolveCommit,
  run,
  summarizeGroups,
  validateCsvCompanion,
  validateRegistryCoverage,
  validateReport,
} from './summarize-paired-subgroups.mjs'

const here = dirname(fileURLToPath(import.meta.url))
const repoRoot = execFileSync('git', ['rev-parse', '--show-toplevel'], { cwd: here, encoding: 'utf8' }).trim()
const resultsDir = join(repoRoot, 'benchmark', 'results')
const reportId = 'validation-report-2026-09-11-codex-qwen3.8-27b-medium-paired'
const reportJsonPath = join(resultsDir, `${reportId}.json`)
const reportCsvPath = join(resultsDir, `${reportId}.csv`)
const derivedReportPath = join(resultsDir, `${reportId}-breakdown.md`)
const scriptPath = join(repoRoot, 'benchmark', 'scripts', 'summarize-paired-subgroups.mjs')

const realReport = JSON.parse(readFileSync(reportJsonPath, 'utf8'))
const realCsv = parseCsv(readFileSync(reportCsvPath, 'utf8'))
const pinnedRegistry = loadPinnedRegistry(repoRoot, '74af446')

function cloneReport() {
  return JSON.parse(JSON.stringify(realReport))
}

/** Minimal per-task report entry for synthetic aggregation tests. */
function fixtureTask(task, skillRewards, noSkillRewards) {
  const condition = (rewards) => ({
    rewards,
    seconds: rewards.map(() => 1),
    exceptions: rewards.map(() => null),
  })
  return { task, 'with-skill': condition(skillRewards), 'no-skill': condition(noSkillRewards) }
}

function usage(overrides = {}) {
  return {
    trial_seconds_sum: '1.000',
    input_tokens: '100',
    cached_input_tokens: '80',
    output_tokens: '10',
    ...overrides,
  }
}

function csvMap(taskIds, rowOverrides = () => ({})) {
  const map = new Map()
  for (const task of taskIds) {
    for (const condition of CONDITIONS) {
      map.set(`${task}|${condition}`, { task, condition, ...usage(rowOverrides(task, condition)) })
    }
  }
  return map
}

function registryRows(taskIds, type = 'Static') {
  return taskIds.map((id) => ({ id, type }))
}

// ── median-of-3 ────────────────────────────────────────────────────────────────

test('median handles odd, even, empty and null-bearing inputs', () => {
  assert.equal(median([1, 0, 1]), 1)
  assert.equal(median([0, 0.5, 1]), 0.5)
  assert.equal(median([0.4, 0.9]), 0.65)
  assert.equal(median([]), null)
  assert.equal(median([null, null, null]), null)
  assert.equal(median([null, 0.4, 0.6]), 0.5)
})

test('per task per condition reduces the 3 trials to a median, not a trial mean', () => {
  const report = {
    protocol: { task_source_snapshot: '74af446 (test)' },
    per_task: [fixtureTask('A', [1, 0, 1], [1, 1, 0])],
  }
  const aggregates = aggregateTasks(report)
  const entry = aggregates.get('A')
  assert.equal(entry['with-skill'].median, 1) // mean would be 0.6667
  assert.equal(entry['no-skill'].median, 1)
  assert.equal(entry['with-skill'].scoredTrials, 3)
  assert.equal(entry['with-skill'].perfectTrials, 2)
})

test('a task-level paired delta is with-skill median minus no-skill median', () => {
  const report = {
    protocol: { task_source_snapshot: '74af446 (test)' },
    per_task: [
      fixtureTask('up', [1, 1, 0], [0, 0, 1]),
      fixtureTask('down', [0, 0, 1], [1, 1, 0]),
      fixtureTask('flat', [0, 1, 0], [0, 0, 1]),
    ],
  }
  const aggregates = aggregateTasks(report)
  assert.equal(aggregates.get('up').delta, 1)
  assert.equal(aggregates.get('down').delta, -1)
  assert.equal(aggregates.get('flat').delta, 0)
})

// ── axis mapping: interaction mode ─────────────────────────────────────────────

test('interaction-mode mapping assigns tasks by the registry Type column', () => {
  const rows = [
    { id: 'A', type: 'Static' },
    { id: 'B', type: 'Hands-on' },
    { id: 'C', type: 'Static' },
  ]
  const report = {
    protocol: { task_source_snapshot: '74af446 (test)' },
    per_task: [fixtureTask('A', [1, 1, 1], [0, 0, 0]), fixtureTask('B', [0, 0, 0], [1, 1, 1]), fixtureTask('C', [1, 1, 1], [1, 1, 1])],
  }
  const axis = summarizeGroups({ axis: 'interaction-mode', registryRows: rows, taskAggregates: aggregateTasks(report), csvByCondition: csvMap(['A', 'B', 'C']) })
  assert.deepEqual(axis.order, ['Static', 'Hands-on'])
  assert.deepEqual(axis.groups.map((group) => group.key), ['Static', 'Hands-on'])
  assert.deepEqual(axis.groups[0].taskIds, ['A', 'C'])
  assert.deepEqual(axis.groups[1].taskIds, ['B'])
  assert.equal(axis.groups[0].taskCount, 2)
  assert.equal(axis.groups[1].taskCount, 1)
})

test('interaction-mode mapping counts Hands-on tasks separately from Static', () => {
  const rows = [
    { id: 'S1', type: 'Static' },
    { id: 'M1', type: 'Hands-on' },
    { id: 'M2', type: 'Hands-on' },
    { id: 'H4', type: 'Static' },
  ]
  const ids = rows.map((row) => row.id)
  const report = {
    protocol: { task_source_snapshot: '74af446 (test)' },
    per_task: ids.map((id) => fixtureTask(id, [1, 1, 1], [0, 0, 0])),
  }
  const axis = summarizeGroups({ axis: 'interaction-mode', registryRows: rows, taskAggregates: aggregateTasks(report), csvByCondition: csvMap(ids) })
  assert.equal(axis.groups[0].taskCount, 2)
  assert.equal(axis.groups[1].taskCount, 2)
  assert.equal(axis.groups[0].pairedMeanDelta, 1)
  assert.equal(axis.groups[1].pairedMeanDelta, 1)
})

// ── axis mapping: prefix ───────────────────────────────────────────────────────

test('prefix mapping groups by the id first character in declared S/M/H order', () => {
  const rows = [
    { id: 'M2', type: 'Hands-on' },
    { id: 'S9', type: 'Static' },
    { id: 'H1', type: 'Hands-on' },
    { id: 'S1', type: 'Static' },
    { id: 'M1', type: 'Hands-on' },
    { id: 'H4', type: 'Static' },
  ]
  const ids = rows.map((row) => row.id)
  const report = {
    protocol: { task_source_snapshot: '74af446 (test)' },
    per_task: ids.map((id) => fixtureTask(id, [1, 0, 0], [0, 0, 0])),
  }
  const axis = summarizeGroups({ axis: 'prefix', registryRows: rows, taskAggregates: aggregateTasks(report), csvByCondition: csvMap(ids) })
  assert.deepEqual(axis.groups.map((group) => group.key), ['S', 'M', 'H'])
  assert.deepEqual(axis.groups[0].taskIds, ['S9', 'S1']) // registry order preserved, not sorted
  assert.deepEqual(axis.groups[1].taskIds, ['M2', 'M1'])
  assert.deepEqual(axis.groups[2].taskIds, ['H1', 'H4'])
})

test('S is not automatically Static: an S id typed Hands-on lands in Hands-on', () => {
  const rows = [
    { id: 'S1', type: 'Static' },
    { id: 'S9', type: 'Hands-on' },
  ]
  const report = {
    protocol: { task_source_snapshot: '74af446 (test)' },
    per_task: [fixtureTask('S1', [1, 1, 1], [0, 0, 0]), fixtureTask('S9', [0, 0, 0], [1, 1, 1])],
  }
  const axis = summarizeGroups({ axis: 'interaction-mode', registryRows: rows, taskAggregates: aggregateTasks(report), csvByCondition: csvMap(['S1', 'S9']) })
  assert.deepEqual(axis.groups[0].taskIds, ['S1'])
  assert.deepEqual(axis.groups[1].taskIds, ['S9'])
  assert.equal(AXES['interaction-mode'].classify(rows[1]), 'Hands-on')
})

test('H is not automatically Hands-on: H4, H6 and H12 are Static at the pinned commit', () => {
  const byId = new Map(pinnedRegistry.map((row) => [row.id, row.type]))
  assert.equal(byId.get('H4-tsbuildinfo-trap'), 'Static')
  assert.equal(byId.get('H6-remote-error-trap'), 'Static')
  assert.equal(byId.get('H12-remote-result-boundary-trap'), 'Static')
  assert.equal(byId.get('H1-plane-trap'), 'Hands-on')
})

test('M is not Medium difficulty: prefix rows carry no difficulty and there is no difficulty axis', () => {
  const mRows = pinnedRegistry.filter((row) => row.id.startsWith('M'))
  assert.equal(mRows.length, 14)
  assert.ok(mRows.every((row) => Object.keys(row).sort().join(',') === 'id,type'))
  assert.ok(mRows.every((row) => row.type === 'Hands-on'))
  assert.deepEqual(Object.keys(AXES).sort(), ['interaction-mode', 'prefix'])
  // The run protocol fixes the same reasoning effort for every trial, so "M" cannot
  // encode a difficulty: the label is historical naming only.
  assert.equal(realReport.protocol.reasoning_effort, 'medium')
})

// ── validation: completeness and malformed reports ─────────────────────────────

test('validateReport accepts the real 112/112 job report and derives its source commit', () => {
  const validation = validateReport(realReport)
  assert.equal(validation.taskCount, EXPECTED_TASKS)
  assert.equal(validation.jobs, EXPECTED_JOBS)
  assert.equal(validation.trials, 336)
  assert.equal(validation.attemptsPerCondition, ATTEMPTS_PER_CONDITION)
  assert.equal(validation.sourceCommit, '74af446')
  assert.equal(validation.scoredTrials['with-skill'], 168)
  assert.equal(validation.scoredTrials['no-skill'], 167)
  assert.equal(validation.unscoredTrials['with-skill'], 0)
  assert.equal(validation.unscoredTrials['no-skill'], 1)
})

test('a duplicate task is rejected', () => {
  const report = cloneReport()
  report.per_task.push(JSON.parse(JSON.stringify(report.per_task[0])))
  assert.throws(() => validateReport(report), /duplicate task/)
})

test('a missing task is rejected as an incomplete report', () => {
  const report = cloneReport()
  report.per_task.pop()
  assert.throws(() => validateReport(report), /incomplete report: 55 tasks present, expected 56/)
})

test('a wrong attempt count is rejected', () => {
  const report = cloneReport()
  report.per_task[0]['with-skill'].rewards = [1, 1]
  assert.throws(() => validateReport(report), /2 attempts \(expected 3\)/)
})

test('a missing rewards array is rejected while a null reward is retained', () => {
  const report = cloneReport()
  delete report.per_task[0]['no-skill'].rewards
  assert.throws(() => validateReport(report), /no rewards array/)
  const retained = cloneReport()
  retained.per_task[0]['no-skill'].rewards = [0, 0, null]
  const validation = validateReport(retained)
  assert.equal(validation.unscoredTrials['no-skill'], 2) // the real report already has one unscored trial
})

// ── missing reward / no-reward handling ───────────────────────────────────────

test('a null reward is counted as unscored and never imputed as 0', () => {
  const report = {
    protocol: { task_source_snapshot: '74af446 (test)' },
    per_task: [fixtureTask('A', [1, null, 1], [1, 1, 1])],
  }
  const entry = aggregateTasks(report).get('A')
  assert.equal(entry['with-skill'].median, 1)
  assert.equal(entry['with-skill'].scoredTrials, 2)
  assert.equal(entry['with-skill'].unscoredTrials, 1)
  assert.notEqual(entry['with-skill'].median, 0)
})

test('a condition with no scored trial has a null median and is excluded from the subgroup mean', () => {
  const report = {
    protocol: { task_source_snapshot: '74af446 (test)' },
    per_task: [
      fixtureTask('A', [1, 1, 1], [1, 1, 1]),
      fixtureTask('B', [1, 1, 1], [null, null, null]),
    ],
  }
  const aggregates = aggregateTasks(report)
  assert.equal(aggregates.get('B')['no-skill'].median, null)
  assert.equal(aggregates.get('B').delta, null)
  const axis = summarizeGroups({ axis: 'interaction-mode', registryRows: registryRows(['A', 'B']), taskAggregates: aggregates, csvByCondition: csvMap(['A', 'B']) })
  const group = axis.groups[0]
  assert.equal(group.taskCount, 2)
  assert.equal(group.resolvedTasks, 1)
  assert.equal(group.skillMedianMean, 1)
  assert.equal(group.noSkillMedianMean, 1) // not 0.5: B is excluded, never imputed as 0
  assert.equal(group.unscoredTrials, 3)
  assert.equal(group.negative, 0)
  assert.equal(group.positive, 0)
  assert.equal(group.tie, 1)
})

// ── token / duration accounting ────────────────────────────────────────────────

test('a missing token cell is reported as a missing count, never as 0', () => {
  const rows = [
    { id: 'A', type: 'Static' },
    { id: 'B', type: 'Static' },
  ]
  const report = {
    protocol: { task_source_snapshot: '74af446 (test)' },
    per_task: [fixtureTask('A', [1, 1, 1], [0, 0, 0]), fixtureTask('B', [1, 1, 1], [0, 0, 0])],
  }
  const csv = csvMap(['A', 'B'], (task) => (task === 'B' ? { input_tokens: '' } : {}))
  const axis = summarizeGroups({ axis: 'interaction-mode', registryRows: rows, taskAggregates: aggregateTasks(report), csvByCondition: csv })
  const group = axis.groups[0]
  assert.equal(group.inputTokens, 200) // A only; B is missing, not 0
  assert.equal(group.usageMissingRows, 2) // B under both conditions
  assert.equal(group.usageComplete, false)
  assert.equal(getGroupInputForAllMissing(), null)
})

function getGroupInputForAllMissing() {
  const report = {
    protocol: { task_source_snapshot: '74af446 (test)' },
    per_task: [fixtureTask('C', [1, 1, 1], [0, 0, 0])],
  }
  const csv = csvMap(['C'], () => ({ input_tokens: '-', cached_input_tokens: 'null', output_tokens: '' }))
  const axis = summarizeGroups({ axis: 'interaction-mode', registryRows: registryRows(['C']), taskAggregates: aggregateTasks(report), csvByCondition: csv })
  const group = axis.groups[0]
  assert.equal(group.usageMissingRows, 2)
  assert.equal(group.cachedInputTokens, null)
  assert.equal(group.outputTokens, null)
  return group.inputTokens
}

test('parseUsageCell treats blank, dash and null as missing and keeps real numbers', () => {
  assert.equal(parseUsageCell('123'), 123)
  assert.equal(parseUsageCell('0'), 0)
  assert.equal(parseUsageCell(''), null)
  assert.equal(parseUsageCell('-'), null)
  assert.equal(parseUsageCell('null'), null)
  assert.equal(parseUsageCell(undefined), null)
})

test('cached input is a subset of input and is never added to it', () => {
  const rows = registryRows(['A'])
  const report = {
    protocol: { task_source_snapshot: '74af446 (test)' },
    per_task: [fixtureTask('A', [1, 1, 1], [0, 0, 0])],
  }
  const csv = csvMap(['A'], (task, condition) => (condition === 'with-skill' ? { input_tokens: '1000', cached_input_tokens: '900' } : { input_tokens: '500', cached_input_tokens: '400' }))
  const axis = summarizeGroups({ axis: 'interaction-mode', registryRows: rows, taskAggregates: aggregateTasks(report), csvByCondition: csv })
  const group = axis.groups[0]
  assert.equal(group.inputTokens, 1500)
  assert.equal(group.cachedInputTokens, 1300)
  assert.notEqual(group.inputTokens, 1500 + 1300)
  assert.ok(group.cachedInputTokens <= group.inputTokens)
})

test('summed trial seconds add up within a subgroup', () => {
  const rows = registryRows(['A', 'B'])
  const report = {
    protocol: { task_source_snapshot: '74af446 (test)' },
    per_task: [fixtureTask('A', [1, 1, 1], [0, 0, 0]), fixtureTask('B', [1, 1, 1], [0, 0, 0])],
  }
  const csv = csvMap(['A', 'B'], (task, condition) => ({ trial_seconds_sum: task === 'A' ? '10.5' : '2.25' }))
  const axis = summarizeGroups({ axis: 'interaction-mode', registryRows: rows, taskAggregates: aggregateTasks(report), csvByCondition: csv })
  assert.equal(axis.groups[0].trialSecondsSum, 25.5)
})

// ── ordering and determinism ───────────────────────────────────────────────────

test('group and task ordering is fixed by the registry, not by input order', () => {
  const rows = [
    { id: 'H1', type: 'Hands-on' },
    { id: 'S2', type: 'Static' },
    { id: 'M1', type: 'Hands-on' },
    { id: 'S1', type: 'Static' },
  ]
  const ids = rows.map((row) => row.id)
  const report = {
    protocol: { task_source_snapshot: '74af446 (test)' },
    per_task: ids.map((id) => fixtureTask(id, [1, 1, 1], [0, 0, 0])),
  }
  const aggregates = aggregateTasks(report)
  const modeAxis = summarizeGroups({ axis: 'interaction-mode', registryRows: rows, taskAggregates: aggregates, csvByCondition: csvMap(ids) })
  const prefixAxis = summarizeGroups({ axis: 'prefix', registryRows: rows, taskAggregates: aggregates, csvByCondition: csvMap(ids) })
  assert.deepEqual(modeAxis.groups.map((group) => group.key), ['Static', 'Hands-on'])
  assert.deepEqual(modeAxis.groups[1].taskIds, ['H1', 'M1'])
  assert.deepEqual(prefixAxis.groups.map((group) => group.key), ['S', 'M', 'H'])
  assert.deepEqual(prefixAxis.groups[0].taskIds, ['S2', 'S1'])
})

test('rendering twice is byte-identical', () => {
  const validation = validateReport(realReport)
  const csvByCondition = validateCsvCompanion(realCsv.records, realReport)
  const source = {
    sourceReport: `benchmark/results/${reportId}.json`,
    sourceCompanionCsv: `benchmark/results/${reportId}.csv`,
    sourceReportMarkdown: `${reportId}.md`,
    sourceBenchmarkCommitFull: resolveCommit(repoRoot, validation.sourceCommit),
  }
  const first = buildBreakdown({ report: realReport, csvByCondition, registryRows: pinnedRegistry, source })
  const second = buildBreakdown({ report: realReport, csvByCondition, registryRows: pinnedRegistry, source })
  assert.equal(renderJson(first), renderJson(second))
  assert.equal(renderMarkdown(first), renderMarkdown(second))
})

// ── provenance: report identity, source commit, living-registry leakage ────────

test('a report whose identity disagrees with its file id is rejected', () => {
  assert.throws(() => assertReportIdentity(realReport, 'some-other-report'), /report\/source mismatch/)
  assert.doesNotThrow(() => assertReportIdentity(realReport, reportId))
})

test('a missing or malformed source benchmark commit is rejected', () => {
  assert.throws(() => parseSourceCommit({}), /report\/source mismatch/)
  assert.throws(() => parseSourceCommit({ task_source_snapshot: 'no-hex-here' }), /report\/source mismatch/)
  assert.equal(parseSourceCommit({ task_source_snapshot: '74af446 (deltas)' }), '74af446')
})

test('an unresolvable source benchmark commit fails loudly instead of falling back', () => {
  assert.throws(() => loadPinnedRegistry(repoRoot, 'deadbeefdeadbeefdeadbeefdeadbeefdeadbeef'), /report\/source mismatch/)
})

test('the living 64-task registry is rejected: only the pinned commit governs the run', () => {
  const livingText = readFileSync(join(repoRoot, 'benchmark', 'README.md'), 'utf8')
  const livingRows = loadRegistryFromText(livingText, 'working tree benchmark/README.md')
  const reportTaskIds = validateReport(realReport).taskIds
  assert.equal(livingRows.length, 64)
  assert.equal(pinnedRegistry.length, 56)
  assert.throws(() => validateRegistryCoverage(livingRows, reportTaskIds, 'working tree'), /64 tasks but the report has 56/)
  assert.doesNotThrow(() => validateRegistryCoverage(pinnedRegistry, reportTaskIds, '74af446'))
})

test('an unknown interaction mode in the registry is rejected', () => {
  const text = ['| Task | Type | What it tests |', '| --- | --- | --- |', '| A-task | Quiz | x |'].join('\n')
  assert.throws(() => loadRegistryFromText(text, 'synthetic'), /unknown interaction mode "Quiz"/)
})

test('an unknown prefix is rejected rather than silently dropped', () => {
  const report = {
    protocol: { task_source_snapshot: '74af446 (test)' },
    per_task: [fixtureTask('X1', [1, 1, 1], [0, 0, 0])],
  }
  assert.throws(
    () => summarizeGroups({ axis: 'prefix', registryRows: [{ id: 'X1', type: 'Static' }], taskAggregates: aggregateTasks(report), csvByCondition: csvMap(['X1']) }),
    /unknown prefix value "X"/,
  )
})

// ── CLI and end-to-end ─────────────────────────────────────────────────────────

test('parseArgs enforces the required report and known flags', () => {
  assert.deepEqual(parseArgs(['--report-json', 'r.json']), { reportJson: 'r.json', groupBy: 'all', json: false, mdOut: null, check: false })
  assert.equal(parseArgs(['--report-json', 'r.json', '--group-by', 'prefix']).groupBy, 'prefix')
  assert.throws(() => parseArgs([]), /--report-json <path> is required/)
  assert.throws(() => parseArgs(['--report-json', 'r.json', '--group-by', 'bogus']), /--group-by must be/)
  assert.throws(() => parseArgs(['--report-json', 'r.json', '--nope']), /unknown argument/)
  assert.throws(() => parseArgs(['--report-json', 'r.json', '--check']), /--check requires --md-out/)
  assert.equal(companionCsvPath('/tmp/x.json'), '/tmp/x.csv')
  assert.throws(() => companionCsvPath('/tmp/x.txt'), /must end in \.json/)
})

test('end-to-end run reproduces the two axes over the real 56-task report', () => {
  const result = run(['--report-json', reportJsonPath], { cwd: repoRoot })
  const breakdown = result.breakdown
  assert.equal(breakdown.completeness.complete, true)
  assert.equal(breakdown.completeness.jobs, 112)
  assert.equal(breakdown.completeness.tasks, 56)
  assert.equal(breakdown.sourceBenchmarkCommit, '74af446')

  const mode = breakdown.axes['interaction-mode']
  assert.deepEqual(mode.groups.map((group) => [group.key, group.taskCount]), [['Static', 20], ['Hands-on', 36]])

  const prefix = breakdown.axes['prefix']
  assert.deepEqual(prefix.groups.map((group) => [group.key, group.taskCount]), [['S', 17], ['M', 14], ['H', 25]])

  // Token totals are rebuildable from the arm totals in the original JSON report.
  const expectedInput = realReport.totals['with-skill'].input_tokens + realReport.totals['no-skill'].input_tokens
  const expectedCached = realReport.totals['with-skill'].cached_input_tokens + realReport.totals['no-skill'].cached_input_tokens
  const expectedOutput = realReport.totals['with-skill'].output_tokens + realReport.totals['no-skill'].output_tokens
  const sum = (key) => mode.groups.reduce((total, group) => total + group[key], 0)
  assert.equal(sum('inputTokens'), expectedInput)
  assert.equal(sum('cachedInputTokens'), expectedCached)
  assert.equal(sum('outputTokens'), expectedOutput)
  assert.notEqual(sum('inputTokens'), expectedInput + expectedCached) // cache is a subset, never added
  assert.ok(sum('cachedInputTokens') <= sum('inputTokens'))

  const seconds = mode.groups.reduce((total, group) => total + group.trialSecondsSum, 0)
  const reportSeconds = realReport.totals['with-skill'].summed_native_trial_seconds + realReport.totals['no-skill'].summed_native_trial_seconds
  assert.ok(Math.abs(seconds - reportSeconds) < 0.002)
  assert.equal(mode.groups.reduce((total, group) => total + group.positive + group.tie + group.negative, 0), 56)
  assert.deepEqual(meanBasedPairing(realReport), { positive: 7, tie: 31, negative: 18 })
})

test('the committed derived report is exactly reproducible and carries the required banner', () => {
  const result = run(['--report-json', reportJsonPath], { cwd: repoRoot })
  const committed = readFileSync(derivedReportPath, 'utf8')
  assert.equal(committed, result.markdown)
  assert.match(committed, /DERIVED SECONDARY ANALYSIS/)
  assert.match(committed, /NO NEW MODEL RUNS/)
  assert.match(committed, /### Interaction mode/)
  assert.match(committed, /### Prefix/)
  assert.match(committed, /S != automatically Static/)
  assert.match(committed, /H != automatically Hands-on/)
  assert.match(committed, /M != Medium difficulty/)
  assert.ok(!committed.includes(repoRoot)) // no host paths
})

test('the CLI --check accepts the committed report and rejects a stale one', () => {
  const runCheck = (target) =>
    execFileSync(process.execPath, [scriptPath, '--report-json', reportJsonPath, '--md-out', target, '--check'], {
      cwd: repoRoot,
      encoding: 'utf8',
      stdio: ['ignore', 'pipe', 'pipe'],
    })
  assert.match(runCheck(derivedReportPath), /is up to date/)
  const stalePath = join(tmpdir(), `dsh-paired-subgroups-stale-${process.pid}.md`)
  writeFileSync(stalePath, 'stale\n')
  try {
    assert.throws(
      () => runCheck(stalePath),
      (error) => /out of date/.test(String(error.stderr ?? '')) || /out of date/.test(String(error.message ?? '')),
    )
  } finally {
    rmSync(stalePath, { force: true })
  }
})

test('a CSV that disagrees with the JSON report is rejected', () => {
  const records = realCsv.records.map((record, index) => (index === 0 ? { ...record, rewards: '0|0|0' } : record))
  assert.throws(() => validateCsvCompanion(records, realReport), /report\/source mismatch: CSV rewards/)
})
