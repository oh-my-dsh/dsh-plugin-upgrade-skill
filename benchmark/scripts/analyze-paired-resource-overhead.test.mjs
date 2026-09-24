// benchmark/scripts/analyze-paired-resource-overhead.test.mjs
//
// Focused tests for the paired resource-overhead analysis and its LaTeX
// renderer. No new runs, no model calls: every case is a synthetic fixture or
// a read-only assertion about the committed historical sources.
import test from 'node:test'
import assert from 'node:assert/strict'
import { createHash } from 'node:crypto'
import { cpSync, existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { dirname, join, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'
import {
  AUTHORITY_PATH,
  EXTRA_SOURCES,
  MAIN_GROUPS,
  OUTPUT_PATH,
  buildReport,
  completenessFor,
  median,
  summarizePerTask,
  ratioFor,
  renderReport,
  run,
  verifySourceHashes,
} from './analyze-paired-resource-overhead.mjs'
import {
  OUTPUT_PATH as TABLE_OUTPUT_PATH,
  fmtCoverage,
  fmtMedianPooled,
  fmtRatio,
  generate as generateTable,
  loadReport,
  renderTable,
} from '../../paper/scripts/generate-resource-overhead-table.mjs'

const REPO_ROOT = resolve(dirname(dirname(dirname(fileURLToPath(import.meta.url)))))

const QWEN_PATH = 'benchmark/results/validation-report-2026-09-11-codex-qwen3.8-27b-medium-paired.json'
const DEEPSEEK_PATH = 'benchmark/results/artifacts/2026-09-01-terminus2-deepseek-v4-flash/paired-scores.json'
const TERRA_PATH = 'benchmark/results/artifacts/2026-09-01-codex-gpt-5.6-terra/paired-scores.json'
const GLM53_PATH = 'benchmark/results/artifacts/2026-09-11-glm-5.3-flash-s1-s22/aggregate.json'
const GLM52_PATH = 'benchmark/results/artifacts/2026-09-13-glm-5.2-s1-s22/aggregate.json'
const USAGE_PATH = EXTRA_SOURCES['glm-5.3-flash'][0]
const QWEN_CSV_PATH = EXTRA_SOURCES['qwen3.8-27b'][0]

const DEFAULT_QWEN_CSV = [
  'task,condition,trials,rewards,trial_seconds_sum,input_tokens,cached_input_tokens,output_tokens',
  'H1,with-skill,2,1|1,20,100,75,10',
  'H1,no-skill,2,1|1,10,50,40,5',
  'H2,with-skill,2,0|1,20,100,75,10',
  'H2,no-skill,2,0|-,10,50,40,5',
].join('\n') + '\n'

function sha256(text) {
  return createHash('sha256').update(text).digest('hex')
}

function qwenFixture(overrides = {}) {
  return {
    totals: {
      'with-skill': { trials: 4, input_tokens: 200, cached_input_tokens: 150, output_tokens: 20, summed_native_trial_seconds: 40, wall_interval_seconds: 60, ...(overrides.skill ?? {}) },
      'no-skill': { trials: 4, input_tokens: 100, cached_input_tokens: 80, output_tokens: 10, summed_native_trial_seconds: 20, wall_interval_seconds: 30, ...(overrides.noskill ?? {}) },
    },
  }
}

function usageFixture(entries) {
  return entries
}

function defaultUsage() {
  return [
    { agent: 'a1', task: 'S1', cond: 'skill', in: 100, out: 10, cache: 1000, total: 1110, ms: 1000 },
    { agent: 'a2', task: 'S2', cond: 'skill', in: 100, out: 10, cache: 1000, total: 1110, ms: 1000 },
    { agent: 'b1', task: 'S1', cond: 'noskill', in: 90, out: 9, cache: 900, total: 999, ms: 900 },
    { agent: 'b2', task: 'S2', cond: 'noskill', in: 90, out: 9, cache: 900, total: 999, ms: 900 },
    { agent: 'j1', task: 'S1', cond: 'judge', in: 50, out: 5, cache: 500, total: 555, ms: 500 },
  ]
}

/** Minimal repo with the five main sources and a hash-consistent authority. */
function fixtureRepo({ qwen = qwenFixture(), qwenCsv = DEFAULT_QWEN_CSV, usage = defaultUsage(), taskCounts = {}, sensitivity = {} } = {}) {
  const root = mkdtempSync(join(tmpdir(), 'resource-overhead-'))
  const write = (rel, content) => {
    mkdirSync(dirname(join(root, rel)), { recursive: true })
    writeFileSync(join(root, rel), typeof content === 'string' ? content : JSON.stringify(content, null, 2))
  }
  write(QWEN_PATH, qwen)
  write(DEEPSEEK_PATH, { schemaVersion: 1, group: 'deepseek-v4-flash', tasks: [{ task: 'H1', noskill: [1], skill: [1] }] })
  write(TERRA_PATH, { schemaVersion: 1, group: 'gpt-5.6-terra', tasks: [{ task: 'H1', noskill: 1, skill: 1 }] })
  write(GLM53_PATH, [{ task: 'S1', noskill: 0, skill: 1 }])
  write(GLM52_PATH, [{ task: 'S1', noskill: 0, skill: 1 }])
  write(USAGE_PATH, usage)
  write(QWEN_CSV_PATH, qwenCsv)
  const paths = { 'qwen3.8-27b': QWEN_PATH, 'deepseek-v4-flash': DEEPSEEK_PATH, 'gpt-5.6-terra': TERRA_PATH, 'glm-5.3-flash': GLM53_PATH, 'glm-5.2': GLM52_PATH }
  const tasks = { 'qwen3.8-27b': 56, 'deepseek-v4-flash': 23, 'gpt-5.6-terra': 21, 'glm-5.3-flash': 22, 'glm-5.2': 22 }
  const authority = {
    schemaVersion: 1,
    id: 'paired-effect-stats-v1',
    groups: MAIN_GROUPS.map((label) => ({
      label,
      tasks: taskCounts[label] ?? tasks[label],
      protocol: 'test',
      sensitivity: sensitivity[label] ?? false,
      inputs: [{ path: paths[label], sha256: sha256(readFileSync(join(root, paths[label]))) }],
    })),
  }
  write(AUTHORITY_PATH, authority)
  return root
}

// ── authority / group exactness ───────────────────────────────────────────────

test('the five main groups are exactly the paper authority groups', () => {
  assert.deepEqual(MAIN_GROUPS, ['qwen3.8-27b', 'deepseek-v4-flash', 'gpt-5.6-terra', 'glm-5.3-flash', 'glm-5.2'])
})

test('real report contains exactly the five main groups', () => {
  const report = buildReport(REPO_ROOT)
  assert.deepEqual(report.groups.map((g) => g.label), MAIN_GROUPS)
})

test('a missing authority group is rejected', () => {
  const root = fixtureRepo()
  const authority = JSON.parse(readFileSync(join(root, AUTHORITY_PATH), 'utf8'))
  authority.groups = authority.groups.filter((g) => g.label !== 'gpt-5.6-terra')
  writeFileSync(join(root, AUTHORITY_PATH), JSON.stringify(authority))
  assert.throws(() => buildReport(root), /authority is missing main groups: gpt-5\.6-terra/)
})

test('the sensitivity group (gpt-5.6-luna) is not in the main table', () => {
  const report = buildReport(REPO_ROOT)
  assert.ok(!report.groups.some((g) => g.label === 'gpt-5.6-luna'))
})

test('report marks itself as a derived secondary analysis with zero model calls', () => {
  const report = buildReport(REPO_ROOT)
  assert.equal(report.modelCalls, 0)
  assert.match(report.analysisKind, /derived-secondary-analysis/)
})

// ── completeness (complete / partial / unavailable) ───────────────────────────

test('completeness: both arms recorded and full rounds is complete', () => {
  const parsed = { arms: { skill: { inputTokens: 1 }, noskill: { inputTokens: 2 } }, cachedInputConvention: 'x' }
  assert.deepEqual(completenessFor(parsed, 'inputTokens', 10), { status: 'complete', observed: 2, expected: 2 })
})

test('completeness: partial-round source is partial even when both arms exist', () => {
  const parsed = { arms: { skill: { inputTokens: 1 }, noskill: { inputTokens: 2 } }, cachedInputConvention: 'x', coverage: { roundsWithUsage: 1, roundsPlanned: 3 } }
  const result = completenessFor(parsed, 'inputTokens', 10)
  assert.equal(result.status, 'partial')
  assert.match(result.note, /1 of 3 rounds/)
})

test('completeness: one arm missing is partial', () => {
  const parsed = { arms: { skill: { inputTokens: 1 }, noskill: { inputTokens: null } }, cachedInputConvention: 'x' }
  assert.equal(completenessFor(parsed, 'inputTokens', 10).status, 'partial')
})

test('completeness: no arms at all is unavailable', () => {
  assert.equal(completenessFor({ arms: null }, 'inputTokens', 10).status, 'unavailable')
})

test('real report: qwen coverage is complete, glm-5.3-flash is partial, the rest unavailable', () => {
  const report = buildReport(REPO_ROOT)
  const byLabel = Object.fromEntries(report.groups.map((g) => [g.label, g]))
  assert.equal(byLabel['qwen3.8-27b'].completeness.inputTokens.status, 'complete')
  assert.equal(byLabel['glm-5.3-flash'].completeness.inputTokens.status, 'partial')
  for (const label of ['deepseek-v4-flash', 'gpt-5.6-terra', 'glm-5.2']) {
    assert.equal(byLabel[label].completeness.inputTokens.status, 'unavailable')
  }
})

// ── cached-input semantics ────────────────────────────────────────────────────

test('cached input is declared inclusive for qwen (cached subset of input)', () => {
  const report = buildReport(REPO_ROOT)
  const qwen = report.groups.find((g) => g.label === 'qwen3.8-27b')
  assert.equal(qwen.cachedInputConvention, 'cached-included-in-input')
  assert.ok(qwen.arms.noskill.cachedInputTokens <= qwen.arms.noskill.inputTokens)
})

test('cached input is declared separate for glm-5.3-flash', () => {
  const report = buildReport(REPO_ROOT)
  const glm = report.groups.find((g) => g.label === 'glm-5.3-flash')
  assert.equal(glm.cachedInputConvention, 'cached-separate-from-input')
  assert.ok(glm.arms.skill.cachedInputTokens > 0)
})

test('the two cached conventions are never pooled', () => {
  const report = buildReport(REPO_ROOT)
  assert.match(report.accountingSemantics.crossConventionPooling, /never pooled/)
})

test('cached input is not double counted: the glm total equals in + out + cache', () => {
  const report = buildReport(REPO_ROOT)
  const glm = report.groups.find((g) => g.label === 'glm-5.3-flash')
  const arm = glm.arms.skill
  assert.equal(arm.totalTokens, arm.inputTokens + arm.outputTokens + arm.cachedInputTokens)
})

test('qwen total is not reconstructed by adding cached input again', () => {
  const report = buildReport(REPO_ROOT)
  const qwen = report.groups.find((g) => g.label === 'qwen3.8-27b')
  // the inclusive convention exposes no totalTokens field at all, so a caller
  // cannot accidentally add cached input a second time
  assert.equal(qwen.arms.skill.totalTokens, undefined)
  assert.equal(qwen.ratios.totalTokens, null)
})

test('cross-configuration token comparison is declared descriptive only', () => {
  const report = buildReport(REPO_ROOT)
  assert.match(report.accountingSemantics.crossConfigurationTokenComparison, /not comparable across models/)
})

test('summed trial seconds are declared distinct from wall-clock time', () => {
  const report = buildReport(REPO_ROOT)
  assert.equal(report.accountingSemantics.summedTrialSecondsIsNotWallClock, true)
})

test('qwen keeps both the summed trial seconds and the source wall interval under distinct names', () => {
  const report = buildReport(REPO_ROOT)
  const qwen = report.groups.find((g) => g.label === 'qwen3.8-27b')
  assert.notEqual(qwen.arms.skill.summedTrialSeconds, qwen.arms.skill.wallIntervalSeconds)
})

// ── solver vs judge ───────────────────────────────────────────────────────────

test('glm-5.3-flash separates solver and judge usage', () => {
  const report = buildReport(REPO_ROOT)
  const glm = report.groups.find((g) => g.label === 'glm-5.3-flash')
  assert.equal(glm.usageKind, 'separated')
  assert.ok(glm.judgeUsage, 'judge usage should be recorded separately')
})

test('judge tokens are never part of the solver arm totals', () => {
  const root = fixtureRepo()
  const report = buildReport(root)
  const glm = report.groups.find((g) => g.label === 'glm-5.3-flash')
  // fixture: skill = 2 x 1110, judge = 555; solver arm must be exactly 2220
  assert.equal(glm.arms.skill.totalTokens, 2220)
  assert.equal(glm.judgeUsage.totalTokens, 555)
})

test('qwen is solver-only (no judge usage recorded)', () => {
  const report = buildReport(REPO_ROOT)
  const qwen = report.groups.find((g) => g.label === 'qwen3.8-27b')
  assert.equal(qwen.usageKind, 'solver-only')
  assert.equal(qwen.judgeUsage, null)
})

test('a source that cannot separate solver and judge is not silently summed', () => {
  const report = buildReport(REPO_ROOT)
  for (const group of report.groups.filter((g) => g.usageKind === 'unavailable')) {
    assert.equal(group.judgeUsage, null)
    assert.equal(group.arms, null)
  }
})

// ── ratios ────────────────────────────────────────────────────────────────────

test('ratioFor computes a plain skill/no-skill ratio', () => {
  const parsed = { arms: { skill: { inputTokens: 150 }, noskill: { inputTokens: 100 } }, cachedInputConvention: 'x' }
  assert.equal(ratioFor(parsed, 'inputTokens').value, 1.5)
})

test('ratioFor is unavailable when an arm lacks the field', () => {
  const parsed = { arms: { skill: { inputTokens: 150 }, noskill: { inputTokens: null } }, cachedInputConvention: 'x' }
  const ratio = ratioFor(parsed, 'inputTokens')
  assert.equal(ratio.value, null)
  assert.equal(ratio.status, 'unavailable')
})

test('ratioFor refuses a zero denominator instead of returning infinity', () => {
  const parsed = { arms: { skill: { inputTokens: 150 }, noskill: { inputTokens: 0 } }, cachedInputConvention: 'x' }
  const ratio = ratioFor(parsed, 'inputTokens')
  assert.equal(ratio.value, null)
  assert.equal(ratio.status, 'zero-denominator')
})

test('ratioFor is unavailable for an unavailable group', () => {
  const ratio = ratioFor({ arms: null, unavailableReason: 'no fields' }, 'inputTokens')
  assert.equal(ratio.status, 'unavailable')
  assert.equal(ratio.reason, 'no fields')
})

test('real qwen input ratio reproduces the paper figure (~1.21)', () => {
  const report = buildReport(REPO_ROOT)
  const qwen = report.groups.find((g) => g.label === 'qwen3.8-27b')
  assert.equal(qwen.ratios.inputTokens.value, 1.2059)
})

test('real glm-5.3-flash total ratio is below 1 under its own convention', () => {
  const report = buildReport(REPO_ROOT)
  const glm = report.groups.find((g) => g.label === 'glm-5.3-flash')
  assert.equal(glm.ratios.totalTokens.value, 0.8823)
})

test('real report: unavailable groups carry null ratios with reasons', () => {
  const report = buildReport(REPO_ROOT)
  for (const label of ['deepseek-v4-flash', 'gpt-5.6-terra', 'glm-5.2']) {
    const group = report.groups.find((g) => g.label === label)
    assert.equal(group.ratios.inputTokens.value, null)
    assert.match(group.ratios.inputTokens.reason, /no per-arm usage fields|not recorded/)
  }
})

// ── missing / cost policy ─────────────────────────────────────────────────────

test('missing values are never reported as zero', () => {
  const report = buildReport(REPO_ROOT)
  for (const group of report.groups) {
    if (group.usageKind !== 'unavailable') continue
    assert.equal(group.arms, null)
    assert.equal(group.ratios.inputTokens.numerator, null)
    assert.equal(group.ratios.inputTokens.denominator, null)
  }
})

test('cost is null when the source records none', () => {
  const report = buildReport(REPO_ROOT)
  for (const group of report.groups) {
    if (!group.arms) continue
    for (const arm of Object.values(group.arms)) {
      assert.equal(arm.cost, null)
      assert.equal(arm.currency, null)
    }
  }
})

test('the cost policy forbids retroactive price inference', () => {
  const report = buildReport(REPO_ROOT)
  assert.match(report.accountingSemantics.costPolicy, /no retroactive token x price inference/)
})

// ── fixture-driven parsing edge cases ─────────────────────────────────────────

test('a retry entry is preserved rather than dropped', () => {
  const usage = [...defaultUsage(), { agent: 'b3', task: 'S1', cond: 'noskill', in: 10, out: 1, cache: 100, total: 111, ms: 100 }]
  const report = buildReport(fixtureRepo({ usage }))
  const glm = report.groups.find((g) => g.label === 'glm-5.3-flash')
  assert.equal(glm.arms.noskill.recordedTrials, 3)
  assert.equal(glm.arms.noskill.distinctTasks, 2)
  assert.ok(glm.notes.some((note) => /retry/.test(note)))
})

test('an unexpected usage condition makes the group unavailable instead of guessed', () => {
  const usage = [...defaultUsage(), { agent: 'x', task: 'S3', cond: 'mystery', in: 1, out: 1, cache: 1, total: 3, ms: 1 }]
  const report = buildReport(fixtureRepo({ usage }))
  const glm = report.groups.find((g) => g.label === 'glm-5.3-flash')
  assert.equal(glm.usageKind, 'unavailable')
  assert.match(glm.unavailableReason, /unexpected usage condition/)
})

test('an empty usage file makes the group unavailable', () => {
  const report = buildReport(fixtureRepo({ usage: [] }))
  assert.equal(report.groups.find((g) => g.label === 'glm-5.3-flash').usageKind, 'unavailable')
})

test('a missing usage file makes the group unavailable', () => {
  const root = fixtureRepo()
  const authority = JSON.parse(readFileSync(join(root, AUTHORITY_PATH), 'utf8'))
  writeFileSync(join(root, AUTHORITY_PATH), JSON.stringify(authority))
  // remove the usage file after the authority was written
  rmSync(join(root, USAGE_PATH))
  const report = buildReport(root)
  assert.equal(report.groups.find((g) => g.label === 'glm-5.3-flash').usageKind, 'unavailable')
})

test('a task-count mismatch is surfaced in completeness expectations', () => {
  const report = buildReport(fixtureRepo({ taskCounts: { 'qwen3.8-27b': 99 } }))
  const qwen = report.groups.find((g) => g.label === 'qwen3.8-27b')
  assert.equal(qwen.completeness.inputTokens.expected, 2)
  assert.equal(qwen.taskCount, 99)
})

test('qwen trial-count asymmetry is disclosed and the ratio basis matches the code (totals, not per-trial means)', () => {
  const report = buildReport(REPO_ROOT)
  const qwen = report.groups.find((g) => g.label === 'qwen3.8-27b')
  assert.ok(qwen.notes.some((note) => /168 vs 167 scored trials/.test(note)))
  assert.ok(qwen.notes.some((note) => /not per-trial means/.test(note)))
  assert.ok(!qwen.notes.some((note) => /per-trial means use/.test(note)))
  // The pooled ratio is literally the ratio of the arm totals.
  assert.equal(qwen.ratios.inputTokens.value, Number((qwen.arms.skill.inputTokens / qwen.arms.noskill.inputTokens).toFixed(4)))
})

// ── per-task medians and the S3 retry ────────────────────────────────────────

test('median handles odd, even and empty inputs', () => {
  assert.equal(median([3, 1, 2]), 2)
  assert.equal(median([4, 1, 3, 2]), 2.5)
  assert.equal(median([]), null)
})

test('summarizePerTask takes the median of per-task ratios and lists retried tasks', () => {
  const perTask = new Map([
    ['A', { skill: { sessions: 1, inputTokens: 20 }, noskill: { sessions: 1, inputTokens: 10 } }],
    ['B', { skill: { sessions: 1, inputTokens: 30 }, noskill: { sessions: 2, inputTokens: 100 } }],
    ['C', { skill: { sessions: 1, inputTokens: 40 }, noskill: { sessions: 1, inputTokens: 10 } }],
  ])
  const summary = summarizePerTask(perTask)
  assert.equal(summary.medianRatios.inputTokens.value, 2)
  assert.equal(summary.medianRatios.inputTokens.tasks, 3)
  assert.equal(summary.medianRatios.outputTokens.value, null) // missing, not 0
  assert.deepEqual(summary.retriedTasks, [{ task: 'B', arm: 'noskill', sessions: 2 }])
})

test('real glm-5.3-flash: the ~2.2x figure reproduces as the median per-task fresh-input ratio', () => {
  const glm = buildReport(REPO_ROOT).groups.find((g) => g.label === 'glm-5.3-flash')
  assert.equal(glm.perTask.pairedTasks, 22)
  assert.equal(glm.perTask.medianRatios.inputTokens.value, 2.2339)
  assert.equal(glm.perTask.medianRatios.totalTokens.value, 1.3343)
  assert.ok(glm.notes.some((note) => /reproduces as the median per-task ratio of fresh/.test(note)))
})

test('real glm-5.3-flash: the S3 no-skill retry is flagged and drives the pooled total below 1', () => {
  const glm = buildReport(REPO_ROOT).groups.find((g) => g.label === 'glm-5.3-flash')
  assert.deepEqual(glm.perTask.retriedTasks, [{ task: 'S3-snapshot-migration', arm: 'noskill', sessions: 2 }])
  assert.ok(glm.ratios.totalTokens.value < 1)
  const excluded = glm.retrySensitivity.excludingRetriedTasks
  assert.deepEqual(excluded.excludedTasks, ['S3-snapshot-migration'])
  assert.equal(excluded.totalTokens, 1.2665)
  assert.equal(excluded.inputTokens, 1.5038)
  const dropped = glm.retrySensitivity.droppingOneRetrySession.map((row) => row.totalTokens)
  assert.deepEqual(dropped, [1.0584, 1.1414])
  for (const value of dropped) assert.ok(value > 1)
})

test('real qwen: per-task medians come from the CSV companion', () => {
  const qwen = buildReport(REPO_ROOT).groups.find((g) => g.label === 'qwen3.8-27b')
  assert.equal(qwen.perTask.pairedTasks, 56)
  assert.equal(qwen.perTask.medianRatios.inputTokens.value, 1.3147)
  assert.deepEqual(qwen.perTask.retriedTasks, [])
})

test('the report declares the per-task median as the headline statistic', () => {
  const report = buildReport(REPO_ROOT)
  assert.match(report.accountingSemantics.headlineStatistic, /median of per-task/)
})

// ── source integrity ──────────────────────────────────────────────────────────

test('source hashes verify on the real repository', () => {
  const report = buildReport(REPO_ROOT)
  assert.equal(verifySourceHashes(REPO_ROOT, report), true)
})

test('a drifted source hash is rejected', () => {
  const root = fixtureRepo()
  const report = buildReport(root)
  writeFileSync(join(root, QWEN_PATH), JSON.stringify(qwenFixture({ skill: { input_tokens: 1 } })))
  assert.throws(() => verifySourceHashes(root, report), /source hash mismatch for qwen3\.8-27b/)
})

test('a missing source file is rejected', () => {
  const root = fixtureRepo()
  const report = buildReport(root)
  rmSync(join(root, QWEN_PATH))
  assert.throws(() => verifySourceHashes(root, report), /missing source for qwen3\.8-27b/)
})

test('the analysis never modifies the historical sources', () => {
  const before = sha256(readFileSync(join(REPO_ROOT, QWEN_PATH)))
  run(REPO_ROOT, { check: true })
  assert.equal(sha256(readFileSync(join(REPO_ROOT, QWEN_PATH))), before)
})

test('the authority input hashes are re-verified before rendering', () => {
  const root = fixtureRepo()
  // tamper with a source AFTER the authority recorded its hash
  writeFileSync(join(root, DEEPSEEK_PATH), JSON.stringify({ schemaVersion: 1, group: 'deepseek-v4-flash', tasks: [] }))
  assert.throws(() => run(root, { check: false }), /authority input drift/)
})

// ── determinism / output ──────────────────────────────────────────────────────

test('the rendered JSON is deterministic', () => {
  const root = fixtureRepo()
  assert.equal(renderReport(root), renderReport(root))
})

test('the real report is byte-stable across calls', () => {
  assert.equal(renderReport(REPO_ROOT), renderReport(REPO_ROOT))
})

test('the committed JSON matches regeneration (--check)', () => {
  const result = run(REPO_ROOT, { check: true })
  assert.equal(result.wrote, false)
})

test('--check fails when the committed JSON drifts', () => {
  const root = fixtureRepo()
  run(root, { check: false })
  writeFileSync(join(root, OUTPUT_PATH), '{}\n')
  assert.throws(() => run(root, { check: true }), /out of date/)
})

test('--check fails when the committed JSON is missing', () => {
  const root = fixtureRepo()
  assert.throws(() => run(root, { check: true }), /is missing/)
})

test('the JSON contains no timestamps or host paths', () => {
  const rendered = renderReport(REPO_ROOT)
  assert.doesNotMatch(rendered, /\b(19|20)\d{2}-\d{2}-\d{2}T\d{2}:/)
  assert.doesNotMatch(rendered, /\/Users\/|\/home\/[a-z]/)
})

test('the JSON carries no causal performance wording', () => {
  const rendered = renderReport(REPO_ROOT).toLowerCase()
  for (const banned of ['caused', 'because of the skill', 'leads to higher reward', 'proves']) {
    assert.ok(!rendered.includes(banned), `unexpected causal wording: ${banned}`)
  }
})

test('the JSON carries no tokenizer-as-compute claim', () => {
  const rendered = renderReport(REPO_ROOT).toLowerCase()
  assert.ok(!rendered.includes('more compute'))
  assert.ok(!rendered.includes('compute ranking'))
})

// ── LaTeX table ───────────────────────────────────────────────────────────────

test('fmtRatio renders ok ratios and dashes everything else', () => {
  assert.equal(fmtRatio({ status: 'ok', value: 1.2059 }), '1.21$\\times$')
  assert.equal(fmtRatio({ status: 'unavailable', value: null }), '--')
  assert.equal(fmtRatio(null), '--')
})

test('fmtCoverage distinguishes complete, partial and unavailable', () => {
  // Coverage order follows the ratio direction: with-skill first.
  assert.equal(fmtCoverage({ usageKind: 'solver-only', completeness: { inputTokens: { status: 'complete' } }, arms: { skill: { recordedTrials: 3 }, noskill: { recordedTrials: 2 } } }), 'complete (3 vs 2 scored trials)')
  assert.match(fmtCoverage({ usageKind: 'separated', completeness: { inputTokens: { status: 'partial', note: '1 of 3 rounds recorded' } } }), /partial/)
  assert.equal(fmtCoverage({ usageKind: 'unavailable' }), 'unavailable')
})

test('the table renders all five main groups, including unavailable rows', () => {
  const report = loadReport(REPO_ROOT)
  const tex = renderTable(report)
  for (const label of MAIN_GROUPS) assert.ok(tex.includes(label), `missing row for ${label}`)
  assert.equal((tex.match(/unavailable/g) ?? []).length, 3)
})

test('the table renders only within-configuration ratios', () => {
  const tex = renderTable(loadReport(REPO_ROOT))
  assert.match(tex, /qwen3\.8-27b & 1\.31 \/ 1\.21 & 0\.98 \/ 1\.01 & 1\.01 \/ 1\.06 & complete \(168 vs 167 scored trials\)/)
  assert.match(tex, /glm-5\.3-flash & 2\.23 \/ 1\.13 & 1\.24 \/ 1\.14 & 1\.26 \/ 1\.05/)
  assert.match(tex, /S3-snapshot-migration/)
})

test('fmtMedianPooled renders median / pooled and dashes missing halves', () => {
  assert.equal(fmtMedianPooled({ perTask: { medianRatios: { inputTokens: { value: 2.2339 } } }, ratios: { inputTokens: { status: 'ok', value: 1.1297 } } }, 'inputTokens'), '2.23 / 1.13')
  assert.equal(fmtMedianPooled({ perTask: null, ratios: { inputTokens: { status: 'ok', value: 1.1297 } } }, 'inputTokens'), '-- / 1.13')
  assert.equal(fmtMedianPooled({ perTask: null, ratios: { inputTokens: { status: 'unavailable', value: null } } }, 'inputTokens'), '--')
})

test('the table caption states the two accounting caveats', () => {
  const tex = renderTable(loadReport(REPO_ROOT))
  assert.match(tex, /cached input is never added twice/)
  assert.match(tex, /not wall-clock time/)
  assert.match(tex, /not comparable across models/)
})

test('the table is deterministic', () => {
  const report = loadReport(REPO_ROOT)
  assert.equal(renderTable(report), renderTable(report))
})

test('the committed table matches regeneration (--check)', () => {
  const result = generateTable(REPO_ROOT, { check: true })
  assert.equal(result.wrote, false)
})

test('the table --check fails on drift', () => {
  const root = mkdtempSync(join(tmpdir(), 'resource-table-'))
  mkdirSync(join(root, 'benchmark/results'), { recursive: true })
  mkdirSync(join(root, 'paper/generated'), { recursive: true })
  cpSync(join(REPO_ROOT, 'benchmark/results/paired-resource-overhead.json'), join(root, 'benchmark/results/paired-resource-overhead.json'))
  assert.throws(() => generateTable(root, { check: true }), /is missing/)
  writeFileSync(join(root, TABLE_OUTPUT_PATH), '% drifted\n')
  assert.throws(() => generateTable(root, { check: true }), /out of date/)
})

test('the table contains no timestamps or host paths', () => {
  const tex = renderTable(loadReport(REPO_ROOT))
  assert.doesNotMatch(tex, /\b(19|20)\d{2}-\d{2}-\d{2}\b/)
  assert.doesNotMatch(tex, /\/Users\/|\/home\//)
})

test('the table label is stable for the paper cross-reference', () => {
  assert.match(renderTable(loadReport(REPO_ROOT)), /\\label\{tab:resource-overhead\}/)
})

test('paper resource text uses per-task medians and no longer calls 2.2x irreproducible', () => {
  const paper = readFileSync(join(REPO_ROOT, 'paper/latex/acl_latex.tex'), 'utf8')
  assert.doesNotMatch(paper, /not reproducible/)
  assert.doesNotMatch(paper, /2\.2-times session-token overhead/)
  assert.doesNotMatch(paper, /token totals vs\.\\ session-level ratios/)
  assert.match(paper, /reproduces as this median per-task fresh-input ratio/)
  assert.match(paper, /S3-snapshot-migration run has two sessions/)
})
