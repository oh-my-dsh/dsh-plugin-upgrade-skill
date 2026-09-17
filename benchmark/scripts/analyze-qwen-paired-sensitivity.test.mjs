// benchmark/scripts/analyze-qwen-paired-sensitivity.test.mjs
//
// Focused tests for the derived Qwen timeout/missingness sensitivity analysis.
// They pin the source-completeness rules, the exact unscored count, the
// missing-value bounds semantics (missing != 0, bounds != CI), the task
// weighting, the trial-level/task-level separation, the timeout taxonomy
// buckets, the post-hoc selection warning, the leave-one-task-out range, the
// byte-level determinism and the LaTeX rendering. No model is called and no run
// is executed.
import test from 'node:test'
import assert from 'node:assert/strict'
import { createHash } from 'node:crypto'
import { execFileSync } from 'node:child_process'
import { readFileSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'
import {
  AGENT_TIMEOUT_EXCEPTION,
  ANALYSIS_ID,
  ARMS,
  ATTEMPTS_PER_ARM,
  EXPECTED_TASKS,
  EXPECTED_TRIAL_SLOTS,
  MAX_DECIMALS,
  MODEL_CALLS,
  NO_SKILL_ARM,
  SKILL_ARM,
  TIMEOUT_BUCKETS,
  analyzeQwenSensitivity,
  buildTaskLevel,
  buildTrials,
  classifyTrial,
  generate,
  parseCsv,
  renderJson,
  summarizeEffect,
  taskArmValueUnder,
  taskEqualWeightEffect,
  taskInfluence,
  validateCsvCompanion,
  validateDeclaredTotals,
} from './analyze-qwen-paired-sensitivity.mjs'
import {
  OUTPUT_PATH as TEX_OUTPUT_PATH,
  bucketCount,
  fmtSigned2,
  loadAnalysis,
  renderQwenSensitivityTableTex,
} from '../../paper/scripts/generate-qwen-sensitivity-table.mjs'

const here = dirname(fileURLToPath(import.meta.url))
const repoRoot = execFileSync('git', ['rev-parse', '--show-toplevel'], { cwd: here, encoding: 'utf8' }).trim()
const scriptPath = join(repoRoot, 'benchmark', 'scripts', 'analyze-qwen-paired-sensitivity.mjs')
const jsonPath = join(repoRoot, 'benchmark', 'results', 'qwen-paired-sensitivity.json')
const sourceJsonPath = join(repoRoot, 'benchmark', 'results', 'validation-report-2026-09-11-codex-qwen3.8-27b-medium-paired.json')
const sourceCsvPath = join(repoRoot, 'benchmark', 'results', 'validation-report-2026-09-11-codex-qwen3.8-27b-medium-paired.csv')
const paperTexPath = join(repoRoot, 'paper', 'latex', 'acl_latex.tex')

const analysis = JSON.parse(readFileSync(jsonPath, 'utf8'))
const sourceReport = JSON.parse(readFileSync(sourceJsonPath, 'utf8'))
const { records: sourceCsvRecords } = parseCsv(readFileSync(sourceCsvPath, 'utf8'))

function sha256File(path) {
  return createHash('sha256').update(readFileSync(path)).digest('hex')
}

// ── Synthetic fixtures (never used to compute the real numbers) ───────────────

/** One per-task entry: `[skillRewards, noSkillRewards]` plus optional exceptions. */
function syntheticTask(task, skillRewards, noSkillRewards, { skillExceptions, noSkillExceptions } = {}) {
  const arm = (rewards, exceptions) => ({
    rewards,
    seconds: rewards.map(() => 10),
    exceptions: exceptions ?? rewards.map(() => null),
  })
  return {
    task,
    [SKILL_ARM]: arm(skillRewards, skillExceptions),
    [NO_SKILL_ARM]: arm(noSkillRewards, noSkillExceptions),
  }
}

function syntheticTasks(count) {
  const tasks = []
  for (let i = 0; i < count; i += 1) {
    const id = `T${String(i + 1).padStart(2, '0')}`
    tasks.push(syntheticTask(id, [1, 1, 1], [1, 1, 1]))
  }
  return tasks
}

function syntheticReport(perTask, attempts = ATTEMPTS_PER_ARM) {
  return {
    protocol: { attempts_per_condition: attempts, task_source_snapshot: 'deadbee (synthetic)' },
    totals: null,
    per_task: perTask,
  }
}

function csvRecord(task, condition, rewards, exceptions = []) {
  return {
    task,
    condition,
    trials: String(ATTEMPTS_PER_ARM),
    rewards: rewards.map((value) => (value === null ? '-' : String(value))).join('|'),
    timeouts: String(exceptions.filter((value) => value === AGENT_TIMEOUT_EXCEPTION).length),
    exceptions: exceptions.filter((value) => value !== null).join(','),
    trial_seconds_sum: rewards.map(() => '10').join('|'),
    input_tokens: '100',
    cached_input_tokens: '80',
    output_tokens: '10',
  }
}

function syntheticCsv(perTask) {
  const records = []
  for (const entry of perTask) {
    for (const arm of ARMS) {
      records.push(csvRecord(entry.task, arm, entry[arm].rewards, entry[arm].exceptions))
    }
  }
  return records
}

function analyzeSynthetic(perTask) {
  return analyzeQwenSensitivity({
    report: syntheticReport(perTask),
    csvRecords: syntheticCsv(perTask),
    sourceHashes: [{ path: 'synthetic', sha256: 'x' }],
  })
}

/** Build the task-level table from a synthetic report (small task counts allowed). */
function syntheticTaskLevel(perTask) {
  const { tasks } = buildTrials(syntheticReport(perTask), { expectedTasks: perTask.length })
  return buildTaskLevel(tasks)
}

// ── Source completeness ───────────────────────────────────────────────────────

test('source has exactly 56 tasks', () => {
  assert.equal(analysis.completeness.tasks, EXPECTED_TASKS)
  assert.equal(sourceReport.per_task.length, EXPECTED_TASKS)
})

test('every task has both arms with exactly three intended attempts', () => {
  for (const entry of sourceReport.per_task) {
    for (const arm of ARMS) {
      assert.equal(entry[arm].rewards.length, ATTEMPTS_PER_ARM, `${entry.task} ${arm} rewards`)
      assert.equal(entry[arm].exceptions.length, ATTEMPTS_PER_ARM, `${entry.task} ${arm} exceptions`)
      assert.equal(entry[arm].seconds.length, ATTEMPTS_PER_ARM, `${entry.task} ${arm} seconds`)
    }
  }
  assert.equal(analysis.completeness.intendedTrialSlots, EXPECTED_TRIAL_SLOTS)
})

test('completeness is declared complete with 336 intended slots', () => {
  assert.equal(analysis.completeness.complete, true)
  assert.equal(analysis.completeness.arms, 2)
  assert.equal(analysis.completeness.attemptsPerArm, ATTEMPTS_PER_ARM)
  assert.equal(analysis.completeness.expectedTrialSlots, 336)
})

test('scored plus unscored trials equal the intended slot count', () => {
  assert.equal(analysis.completeness.scoredTrials + analysis.completeness.unscoredTrials, EXPECTED_TRIAL_SLOTS)
})

test('task ids are unique', () => {
  const ids = analysis.perTask.map((row) => row.task)
  assert.equal(new Set(ids).size, ids.length)
})

test('task-level table covers every task and is sorted deterministically', () => {
  assert.equal(analysis.perTask.length, EXPECTED_TASKS)
  const sorted = [...analysis.perTask].map((row) => row.task).sort()
  assert.deepEqual(analysis.perTask.map((row) => row.task), sorted)
})

test('a 55-task report is rejected as incomplete', () => {
  assert.throws(() => buildTrials(syntheticReport(syntheticTasks(55))), /55 tasks present, expected 56/)
})

test('a report with a non-three attempt count is rejected', () => {
  const tasks = syntheticTasks(56)
  tasks[0][SKILL_ARM].rewards = [1, 1]
  assert.throws(
    () => buildTrials(syntheticReport(tasks)),
    /must have exactly 3 reward slots/,
  )
})

// ── Exact unscored count (never hardcoded) ────────────────────────────────────

test('exactly one unscored slot is found in the source', () => {
  assert.equal(analysis.missingScores.count, 1)
  assert.equal(analysis.completeness.unscoredTrials, 1)
})

test('the unscored slot is the H8-fire-drill no-skill third trial', () => {
  assert.deepEqual(analysis.missingScores.slots, [
    { task: 'H8-fire-drill', arm: 'no-skill', trial: 2, exception: AGENT_TIMEOUT_EXCEPTION },
  ])
  assert.deepEqual(analysis.missingScores.byArm, { 'with-skill': 0, 'no-skill': 1 })
  assert.deepEqual(analysis.missingScores.byTask, { 'H8-fire-drill': 1 })
})

test('the unscored count is recomputed from null rewards, not trusted from the source', () => {
  const nullCount = sourceReport.per_task.reduce(
    (sum, entry) => sum + ARMS.reduce((inner, arm) => inner + entry[arm].rewards.filter((value) => value === null).length, 0),
    0,
  )
  assert.equal(nullCount, analysis.missingScores.count)
})

test('per-arm scored trials account for the missing slot', () => {
  assert.equal(analysis.arms[SKILL_ARM].scoredTrials, 168)
  assert.equal(analysis.arms[NO_SKILL_ARM].scoredTrials, 167)
  assert.equal(analysis.arms[NO_SKILL_ARM].unscoredTrials, 1)
})

// ── Declared totals cross-check ───────────────────────────────────────────────

test('recomputed per-arm totals match the source report declaration', () => {
  assert.equal(analysis.arms[SKILL_ARM].rewardSum, 69.89)
  assert.equal(analysis.arms[NO_SKILL_ARM].rewardSum, 75.05)
  assert.equal(analysis.arms[SKILL_ARM].rewardMeanScored, 0.416012)
  assert.equal(analysis.arms[NO_SKILL_ARM].rewardMeanScored, 0.449401)
  assert.equal(analysis.arms[SKILL_ARM].declaredMean, 0.416012)
  assert.equal(analysis.arms[NO_SKILL_ARM].declaredMean, 0.449401)
})

test('a wrong declared total is a hard failure, never silently reconciled', () => {
  const tampered = JSON.parse(JSON.stringify(sourceReport))
  tampered.totals[SKILL_ARM].reward_sum = 1
  const { tasks } = buildTrials(tampered)
  const computed = {
    [SKILL_ARM]: { declaredTrials: 168, rewardSum: 69.89, timeoutTrials: 108, rewardFullCount: 55, rewardZeroCount: 88 },
    [NO_SKILL_ARM]: { declaredTrials: 167, rewardSum: 75.05, timeoutTrials: 86, rewardFullCount: 59, rewardZeroCount: 77 },
  }
  assert.equal(tasks.length, EXPECTED_TASKS)
  assert.throws(() => validateDeclaredTotals(tampered.totals, computed), /disagrees with the recomputed/)
})

test('source token and duration totals are recomputed and match the CSV', () => {
  assert.equal(analysis.arms[SKILL_ARM].inputTokens, 409819928)
  assert.equal(analysis.arms[NO_SKILL_ARM].inputTokens, 339853493)
  assert.equal(analysis.arms[SKILL_ARM].outputTokens, 3988952)
  assert.equal(analysis.arms[NO_SKILL_ARM].outputTokens, 3940227)
  assert.equal(analysis.arms[SKILL_ARM].cachedInputTokens, 400036000)
  assert.equal(analysis.arms[SKILL_ARM].summedSecondsFromCsv, 110458.755)
  assert.equal(analysis.arms[NO_SKILL_ARM].summedSecondsFromCsv, 104028.541)
})

test('the CSV companion is cross-checked reward-by-reward', () => {
  const byKey = validateCsvCompanion(sourceCsvRecords, sourceReport)
  assert.equal(byKey.size, EXPECTED_TASKS * ARMS.length)
  const tampered = sourceCsvRecords.map((record) =>
    record.task === 'H1-plane-trap' && record.condition === SKILL_ARM ? { ...record, rewards: '0|0|0' } : record,
  )
  assert.throws(() => validateCsvCompanion(tampered, sourceReport), /disagree with the report/)
})

// ── Missing-value bounds ──────────────────────────────────────────────────────

test('the main estimate is negative, descriptive and inconclusive', () => {
  const main = analysis.estimates.main
  assert.equal(main.deltaObserved, -3.071429)
  assert.equal(main.meanSkill, 0.416012)
  assert.equal(main.meanNoSkill, 0.446726)
  assert.ok(main.deltaObserved < 0)
})

test('missing rewards are NOT substituted with zero in the main estimate', () => {
  const h8 = analysis.perTask.find((row) => row.task === 'H8-fire-drill')
  // Scored trials only: [0, 0] -> 0. A zero-substituting estimator would also be
  // 0 here, so the sharper check is the arm-level mean across tasks.
  assert.equal(h8.skillScoredMean, 0)
  assert.equal(h8.noSkillScoredMean, 0)
  assert.equal(h8.noSkillScoredTrials, 2)
  // The no-skill arm's task mean keeps 167 scored trials, not 168.
  assert.equal(analysis.arms[NO_SKILL_ARM].scoredTrials, 167)
})

test('the main estimate ignores a missing reward instead of zeroing it', () => {
  // Two tasks: one complete (delta 0) and one with a missing no-skill reward.
  const perTask = [
    syntheticTask('A', [1, 1, 1], [1, 1, 1]),
    syntheticTask('B', [1, 1, 1], [0, 0, null]),
  ]
  const level = syntheticTaskLevel(perTask)
  const b = level.find((row) => row.task === 'B')
  // The scored-trial mean (2 observations) is the main input; a zero-imputing
  // estimator would divide by 3 and lose the missingness distinction.
  assert.equal(b.noSkillScoredTrials, 2)
  assert.equal(b.noSkillScoredMean, 0)
  assert.equal(b.deltaObserved, 100)
  assert.equal(b.deltaBoundWidth, 33.333333) // lower bound sets the slot to 1
})

test('missing lower bound substitutes 0 and upper bound substitutes 1', () => {
  const perTask = [
    syntheticTask('A', [1, 1, 1], [1, 1, 1]),
    syntheticTask('B', [1, 1, 1], [0, 0, null]),
  ]
  const level = syntheticTaskLevel(perTask)
  const b = level.find((row) => row.task === 'B')
  const trials = [
    { reward: 0, scored: true },
    { reward: 0, scored: true },
    { reward: null, scored: false },
  ]
  assert.equal(taskArmValueUnder(trials, 0), 0)
  assert.equal(taskArmValueUnder(trials, 1), 1 / 3)
  assert.equal(b.noSkillLowerMean, 0)
  assert.equal(b.noSkillUpperMean, 0.333333)
  // Ascending bound order: delta = skill − no-skill, so the upper no-skill
  // substitution yields the LOWER delta bound.
  assert.equal(b.deltaLower, 66.666667)
  assert.equal(b.deltaUpper, 100)
})

test('task-level equal weighting, not trial-level pooling', () => {
  // Task A has one scored trial; task B has three. Equal task weighting gives
  // (100 + 0) / 2 = 50, trial pooling gives (100 + 0 + 0 + 0) / 4 = 25.
  const perTask = [
    syntheticTask('A', [1, null, null], [0, null, null]),
    syntheticTask('B', [0, 0, 0], [0, 0, 0]),
  ]
  const level = syntheticTaskLevel(perTask)
  const effect = taskEqualWeightEffect(level, (row) => row.deltaObserved)
  const pooledSkill = level.reduce((sum, row) => sum + row.skillScoredMean * row.skillScoredTrials, 0) / 4
  const pooledNoSkill = level.reduce((sum, row) => sum + row.noSkillScoredMean * row.noSkillScoredTrials, 0) / 4
  assert.equal(effect, 50)
  assert.equal((pooledSkill - pooledNoSkill) * 100, 25)
  assert.notEqual(effect, (pooledSkill - pooledNoSkill) * 100)
})

test('a task weight is exactly the estimator scale over the task count', () => {
  assert.equal(analysis.estimates.main.taskWeightPoints, 1.785714)
  assert.ok(Math.abs(analysis.estimates.main.taskWeightPoints - 100 / EXPECTED_TASKS) < 1e-6)
})

test('missing bounds are strictly ordered and the point estimate sits inside them', () => {
  const { deltaObserved, deltaLowerBound, deltaUpperBound, boundWidth } = analysis.estimates.main
  assert.ok(deltaLowerBound <= deltaObserved)
  assert.ok(deltaObserved <= deltaUpperBound)
  assert.ok(deltaLowerBound <= deltaUpperBound)
  assert.ok(Math.abs(boundWidth - (deltaUpperBound - deltaLowerBound)) < 1e-9)
  // Setting the single missing no-skill reward to 0 keeps the point estimate;
  // setting it to 1 lowers delta to the lower bound.
  assert.equal(deltaUpperBound, deltaObserved)
  assert.ok(deltaLowerBound < deltaObserved)
})

test('the bound width equals missing slots times task weight over the arm count', () => {
  const main = analysis.estimates.main
  // One missing slot lowers the no-skill mean of its task by 1/3, which moves
  // the task-level mean by (1/3) × (100 / tasks).
  const expectedWidth = (analysis.completeness.unscoredTrials / ATTEMPTS_PER_ARM) * (100 / EXPECTED_TASKS)
  assert.ok(Math.abs(main.boundWidth - expectedWidth) < 1e-5, `${main.boundWidth} vs ${expectedWidth}`)
  assert.ok(Math.abs(main.boundWidth - 0.595238) < 1e-5)
})

test('the missing bounds are explicitly not a confidence interval', () => {
  assert.match(analysis.claimBoundary.notes.join(' '), /MISSING-VALUE BOUNDS, NOT a confidence interval/)
  assert.match(analysis.estimates.main.missingBoundsNote, /NOT a confidence interval/)
  assert.match(analysis.estimates.main.missingBoundsNote, /no sampling/)
})

test('the missing-not-zero rule is explicit in the artifact', () => {
  assert.match(analysis.claimBoundary.notes.join(' '), /MISSING, NOT 0/)
  assert.match(analysis.estimates.main.missingNotZeroNote, /never usable as or replaced by 0 in the point estimate/)
})

test('complete tasks have singleton bounds and zero bound width', () => {
  const complete = analysis.perTask.filter((row) => row.missingSlots === 0)
  assert.equal(complete.length, EXPECTED_TASKS - 1)
  for (const row of complete) {
    assert.equal(row.deltaLower, row.deltaObserved)
    assert.equal(row.deltaUpper, row.deltaObserved)
    assert.equal(row.deltaBoundWidth, 0)
  }
})

test('only H8-fire-drill carries a non-zero bound width', () => {
  const wide = analysis.perTask.filter((row) => row.deltaBoundWidth !== 0)
  assert.deepEqual(wide.map((row) => row.task), ['H8-fire-drill'])
  assert.equal(wide[0].missingSlots, 1)
})

test('the point estimate never equals a zero-substitution estimate in the aggregate', () => {
  // Scale-free form of the missing-not-zero rule: the aggregate point estimate
  // cannot equal the zero-substituted scenario unless the substituted task value
  // is unchanged. H8's no-skill task value is 0 either way, so this test uses a
  // synthetic fixture where the distinction is observable; the real-data part
  // checks that the bound span is the missingness contribution only.
  const perTask = [
    syntheticTask('P', [1, 1, 1], [0.5, 0.5, null]),
  ]
  const level = syntheticTaskLevel(perTask)
  const row = level[0]
  assert.equal(row.noSkillScoredMean, 0.5) // scored-only mean (2 observations)
  assert.equal(row.deltaObserved, 50)
  // Zero-substitution would give the same task value here; use a fixture where
  // the scored trials are non-zero to separate the two.
  const sharp = syntheticTaskLevel([
    syntheticTask('Q', [1, 1, 1], [0.4, 0.6, null]),
  ])[0]
  assert.equal(sharp.noSkillScoredMean, 0.5)
  assert.equal(sharp.noSkillLowerMean, 0.333333) // 0 substituted: (0.4+0.6+0)/3
  assert.equal(sharp.noSkillUpperMean, 0.666667) // 1 substituted: (0.4+0.6+1)/3
  assert.equal(sharp.deltaLower, 33.333333) // larger no-skill -> smaller delta
  assert.equal(sharp.deltaUpper, 66.666667)
  assert.notEqual(sharp.deltaObserved, sharp.deltaLower)
  assert.notEqual(sharp.deltaObserved, sharp.deltaUpper)
  // Real data: the authority task-level mean is the mean of the recorded
  // per-task arm means (the with-skill arm has no missing slot, so it also
  // matches the pooled trial mean to six decimals).
  assert.ok(Math.abs(analysis.estimates.main.meanNoSkill - 25.016666 / EXPECTED_TASKS) < 1e-6)
  assert.equal(analysis.estimates.main.meanNoSkill, 0.446726)
  assert.ok(Math.abs(analysis.estimates.main.meanSkill - 69.89 / 168) < 1e-5)
  assert.equal(analysis.estimates.main.meanSkill, 0.416012)
  assert.equal(analysis.arms[NO_SKILL_ARM].scoredTrials, 167)
  // The bound interval edges are exactly the substitution scenarios (rounded to
  // the artifact's reporting precision).
  const lowerBound = taskEqualWeightEffect(analysis.perTask, (item) => item.deltaLower)
  const upperBound = taskEqualWeightEffect(analysis.perTask, (item) => item.deltaUpper)
  assert.ok(Math.abs(analysis.estimates.main.deltaLowerBound - lowerBound) < 1e-5)
  assert.ok(Math.abs(analysis.estimates.main.deltaUpperBound - upperBound) < 1e-5)
})

// ── Timeout taxonomy ─────────────────────────────────────────────────────────

test('the taxonomy buckets are disjoint and exhaustive over the 168 slots per arm', () => {
  assert.deepEqual(
    analysis.timeoutTaxonomy.buckets.map((bucket) => bucket.key),
    TIMEOUT_BUCKETS.map(([key]) => key),
  )
  for (const arm of ARMS) {
    const total = analysis.timeoutTaxonomy.buckets.reduce(
      (sum, bucket) => sum + bucketCount(analysis, arm, bucket.key),
      0,
    )
    assert.equal(total, 168, `${arm} buckets`)
  }
})

test('timeout counts per arm are 108 with-skill and 86 no-skill', () => {
  assert.equal(analysis.arms[SKILL_ARM].timeoutTrials, 108)
  assert.equal(analysis.arms[NO_SKILL_ARM].timeoutTrials, 86)
  assert.equal(analysis.timeoutTaxonomy.combined.timeoutTrials, 194)
})

test('timeout + full reward still occurs, so timeout is not automatically a failure', () => {
  assert.equal(bucketCount(analysis, SKILL_ARM, 'timeout_full'), 18)
  assert.equal(bucketCount(analysis, NO_SKILL_ARM, 'timeout_full'), 12)
  assert.equal(analysis.timeoutTaxonomy.combined.timeoutScoredFullCount, 30)
  assert.ok(analysis.timeoutTaxonomy.combined.timeoutScoredFullCount > 0)
  assert.match(analysis.timeoutTaxonomy.timeoutStateNote, /not automatically a functional failure/)
})

test('timeout + partial reward is distinguished from full and zero', () => {
  assert.equal(bucketCount(analysis, SKILL_ARM, 'timeout_partial'), 9)
  assert.equal(bucketCount(analysis, NO_SKILL_ARM, 'timeout_partial'), 8)
  assert.equal(analysis.timeoutTaxonomy.combined.timeoutScoredPartialCount, 17)
})

test('timeout + zero reward is the dominant bucket', () => {
  assert.equal(bucketCount(analysis, SKILL_ARM, 'timeout_zero'), 81)
  assert.equal(bucketCount(analysis, NO_SKILL_ARM, 'timeout_zero'), 65)
  assert.ok(bucketCount(analysis, SKILL_ARM, 'timeout_zero') > bucketCount(analysis, SKILL_ARM, 'timeout_full'))
})

test('unscored timeout is reported as an observed state, never imputed', () => {
  assert.equal(bucketCount(analysis, NO_SKILL_ARM, 'timeout_unscored'), 1)
  assert.equal(bucketCount(analysis, SKILL_ARM, 'timeout_unscored'), 0)
  assert.equal(analysis.timeoutTaxonomy.combined.unscoredNoTimeoutCount, 0)
})

test('scored timeout buckets sum to the number of timed-out trials that were scored', () => {
  const combined = analysis.timeoutTaxonomy.combined
  assert.equal(
    combined.timeoutScoredFullCount + combined.timeoutScoredPartialCount + combined.timeoutScoredZeroCount,
    combined.timeoutScoredTrials,
  )
  assert.equal(combined.timeoutScoredTrials, 194 - 1)
})

test('non-timeout exceptions are classified as infrastructure, not as timeouts', () => {
  for (const arm of ARMS) {
    const exceptions = analysis.arms[arm].exceptions
    assert.equal(exceptions[AGENT_TIMEOUT_EXCEPTION], analysis.arms[arm].timeoutTrials)
    assert.equal(exceptions.AgentTimeoutError === undefined ? 0 : exceptions.AgentTimeoutError, analysis.arms[arm].timeoutTrials)
  }
  assert.equal(analysis.arms[SKILL_ARM].exceptions.NetworkConnectionError, 5)
  assert.equal(analysis.arms[NO_SKILL_ARM].exceptions.ApiRateLimitError, 1)
})

test('classifyTrial separates termination state from score outcome', () => {
  assert.equal(classifyTrial({ reward: 1, timeout: true, exception: AGENT_TIMEOUT_EXCEPTION }).status, 'timeout_full')
  assert.equal(classifyTrial({ reward: 0.5, timeout: true, exception: AGENT_TIMEOUT_EXCEPTION }).status, 'timeout_partial')
  assert.equal(classifyTrial({ reward: 0, timeout: true, exception: AGENT_TIMEOUT_EXCEPTION }).status, 'timeout_zero')
  assert.equal(classifyTrial({ reward: null, timeout: true, exception: AGENT_TIMEOUT_EXCEPTION }).status, 'timeout_unscored')
  assert.equal(classifyTrial({ reward: null, timeout: false, exception: null }).status, 'unscored')
  assert.equal(classifyTrial({ reward: 1, timeout: false, exception: null }).status, 'no_timeout_scored')
  // A non-timeout exception is an independent infrastructure signal.
  assert.equal(classifyTrial({ reward: 0, timeout: false, exception: 'NetworkConnectionError' }).infraException, 'NetworkConnectionError')
  assert.equal(classifyTrial({ reward: 0, timeout: true, exception: AGENT_TIMEOUT_EXCEPTION }).infraException, null)
})

test('infrastructure exceptions never produced a non-zero reward in this run', () => {
  for (const arm of ARMS) {
    assert.deepEqual(analysis.arms[arm].infraScoredNonzero, [])
  }
})

test('the reward histogram counts only scored trials', () => {
  const total = analysis.arms[SKILL_ARM].rewardHistogram.total
  assert.equal(total, analysis.arms[SKILL_ARM].scoredTrials)
  assert.equal(analysis.arms[SKILL_ARM].rewardHistogram.counts, undefined)
  const perfect = analysis.arms[SKILL_ARM].rewardHistogram.values.find((entry) => entry.reward === 1)
  assert.equal(perfect.count, 55)
})

// ── Post-hoc, selection-biased non-timeout view ──────────────────────────────

test('the post-hoc non-timeout view is labelled selection-biased and non-authoritative', () => {
  const note = analysis.estimates.postHocNonTimeoutOnly.note
  assert.match(note, /POST-HOC/)
  assert.match(note, /SELECTION-BIASED/)
  assert.match(note, /NEVER replaces the main task-level estimate/)
})

test('the non-timeout-only estimate is NOT the main estimate', () => {
  const main = analysis.estimates.main.deltaObserved
  const postHoc = analysis.estimates.postHocNonTimeoutOnly.noTimeoutTasksOnly.effect
  assert.notEqual(postHoc, main)
  assert.equal(main, -3.071429)
  assert.equal(postHoc, 4.02381)
})

test('trial-level pooling is kept separate from the task-level authority', () => {
  const pooled = analysis.estimates.postHocNonTimeoutOnly.trialLevelSelection
  assert.equal(pooled.label, 'scored_trials_only')
  assert.equal(pooled.trials, 71 + 71)
  assert.equal(pooled.droppedTimeoutTrials, 336 - 142)
  assert.match(analysis.estimates.mainAuthorityNote, /authority view/)
})
test('the post-hoc variants report how much data they drop', () => {
  const postHoc = analysis.estimates.postHocNonTimeoutOnly
  assert.equal(postHoc.noTimeoutTasksOnly.tasks + postHoc.noTimeoutTasksOnly.excludedTasks, EXPECTED_TASKS)
  assert.equal(postHoc.noTimeoutTasksOnly.excludedTaskIds.length, postHoc.noTimeoutTasksOnly.excludedTasks)
  assert.equal(postHoc.taskNoTimeoutTrials.tasksDropped, postHoc.taskNoTimeoutTrials.droppedTaskIds.length)
})

test('the no-timeout-only task set really has six non-timeout trials per task', () => {
  const postHoc = analysis.estimates.postHocNonTimeoutOnly
  // Two nested subsets: `taskNoTimeoutTrials` keeps any task with a non-timeout
  // observation in each arm; `noTimeoutTasksOnly` is the stricter
  // all-six-trials-clean set, verified independently against the raw source.
  const balanced = new Set(postHoc.perTask.filter((row) => row.included).map((row) => row.task))
  assert.equal(balanced.size, postHoc.taskNoTimeoutTrials.tasksWithBothArms)
  const strict = new Set(postHoc.noTimeoutTasksOnly.excludedTaskIds)
  const clean = [...balanced].filter((task) => !strict.has(task))
  assert.equal(strict.size, postHoc.noTimeoutTasksOnly.excludedTasks)
  assert.equal(clean.length, postHoc.noTimeoutTasksOnly.tasks)
  for (const entry of sourceReport.per_task) {
    if (!clean.includes(entry.task)) continue
    for (const arm of ARMS) {
      for (const exception of entry[arm].exceptions) {
        assert.notEqual(exception, AGENT_TIMEOUT_EXCEPTION, `${entry.task} ${arm}`)
      }
      assert.ok(entry[arm].rewards.every((value) => typeof value === 'number'), `${entry.task} ${arm}`)
    }
  }
})

test('the post-hoc no-timeout subset is explicitly not the main table entry', () => {
  const postHoc = analysis.estimates.postHocNonTimeoutOnly
  assert.match(postHoc.noTimeoutTasksOnly.description, /task-level equal-weight mean paired effect/)
  assert.match(postHoc.taskNoTimeoutTrials.description, /unbalanced/)
  assert.match(postHoc.noTimeoutTasksOnly.label, /no_timeout_tasks_only/)
})

// ── Task influence ───────────────────────────────────────────────────────────

test('leave-one-task-out range is computed and excludes the full-sample value', () => {
  const loo = analysis.taskInfluence.looObserved
  assert.equal(loo.min, -4.339394)
  assert.equal(loo.max, -2.036364)
  assert.equal(loo.range, 2.30303)
  assert.ok(loo.min < analysis.taskInfluence.fullSampleObserved)
  assert.ok(analysis.taskInfluence.fullSampleObserved < loo.max)
})

test('the most influential tasks are found automatically, not hardcoded', () => {
  const positive = analysis.taskInfluence.mostPositiveInfluence
  const negative = analysis.taskInfluence.mostNegativeInfluence
  const byInfluence = [...analysis.taskInfluence.perTask].sort(
    (a, b) => b.influenceObserved - a.influenceObserved,
  )
  assert.equal(positive.task, byInfluence[0].task)
  assert.equal(negative.task, byInfluence[byInfluence.length - 1].task)
  assert.ok(positive.influenceObserved > 0)
  assert.ok(negative.influenceObserved < 0)
  // Largest upward pull on the (negative) mean, and largest downward pull.
  assert.equal(positive.task, 'H6-remote-error-trap')
  assert.equal(positive.influenceObserved, 71.006061)
  assert.equal(negative.task, 'S14-link-install-lock-trap')
  assert.equal(negative.influenceObserved, -57.963636)
})

test('influence is the shift the task contributes to the all-task mean', () => {
  for (const row of analysis.taskInfluence.perTask) {
    const reconstructed =
      analysis.taskInfluence.fullSampleObserved - row.influenceObserved / EXPECTED_TASKS
    assert.ok(Math.abs(reconstructed - row.effectWithoutObserved) < 1e-5, row.task)
  }
})

test('the leave-one-task-out lower and upper ranges are also reported', () => {
  assert.ok(analysis.taskInfluence.looLower.range > 0)
  assert.ok(analysis.taskInfluence.looUpper.range > 0)
  assert.ok(analysis.taskInfluence.looUpper.min <= analysis.taskInfluence.looUpper.max)
})

test('taskInfluence handles a synthetic two-task input without hardcoding names', () => {
  const level = syntheticTaskLevel([
    syntheticTask('A', [1, 1, 1], [0, 0, 0]),
    syntheticTask('B', [0, 0, 0], [0, 0, 0]),
  ])
  const influence = taskInfluence(level)
  // A contributes +100 (it pulls the mean up), B contributes −100.
  assert.equal(influence.mostPositiveInfluence.task, 'A')
  assert.equal(influence.mostPositiveInfluence.influenceObserved, 100)
  assert.equal(influence.mostNegativeInfluence.task, 'B')
  assert.equal(influence.mostNegativeInfluence.influenceObserved, -100)
  assert.equal(influence.fullSampleObserved, 50)
  assert.equal(influence.looObserved.min, 0)
  assert.equal(influence.looObserved.max, 100)
})

test('summarizeEffect reports per-task positive / zero / negative counts', () => {
  assert.equal(
    analysis.estimates.main.positiveTasks + analysis.estimates.main.zeroTasks + analysis.estimates.main.negativeTasks,
    EXPECTED_TASKS,
  )
  assert.deepEqual(
    [analysis.estimates.main.positiveTasks, analysis.estimates.main.zeroTasks, analysis.estimates.main.negativeTasks],
    [7, 31, 18],
  )
})

test('a synthetic all-zero fixture yields a zero effect with singleton bounds', () => {
  const level = syntheticTaskLevel([
    syntheticTask('A', [0.5, 0.5, 0.5], [0.5, 0.5, 0.5]),
    syntheticTask('B', [1, 1, 1], [1, 1, 1]),
  ])
  const effect = summarizeEffect(level)
  assert.equal(effect.deltaObserved, 0)
  assert.equal(effect.deltaLowerBound, 0)
  assert.equal(effect.deltaUpperBound, 0)
  assert.equal(effect.boundWidth, 0)
  assert.equal(effect.missingSlots, 0)
})

// ── Determinism, hashes, provenance ─────────────────────────────────────────

test('the committed JSON is byte-identical on regeneration', () => {
  const first = generate(repoRoot)
  const second = generate(repoRoot)
  assert.equal(first, second)
  assert.equal(first, readFileSync(jsonPath, 'utf8'))
})

test('the --check flag exits zero on the committed artifact', () => {
  const output = execFileSync('node', [scriptPath, '--check'], { cwd: repoRoot, encoding: 'utf8' })
  assert.match(output, /is up to date/)
})

test('the JSON contains no timestamps and no host paths', () => {
  const text = readFileSync(jsonPath, 'utf8')
  // The only date-shaped strings allowed are the frozen source file names
  // (report ids), never a generation or run timestamp.
  assert.doesNotMatch(text, /\d{4}-\d{2}-\d{2}T\d{2}:\d{2}/)
  assert.doesNotMatch(text, /\d{2}:\d{2}:\d{2}/)
  assert.doesNotMatch(text, /"generated_at/)
  assert.doesNotMatch(text, /wall_interval/)
  assert.doesNotMatch(text, /UTC/)
  assert.doesNotMatch(text, /\/Users\//)
  assert.doesNotMatch(text, /\/home\//)
  assert.doesNotMatch(text, /file:\/\//)
  for (const match of text.matchAll(/"([^"]*\d{4}-\d{2}-\d{2}[^"]*)"/g)) {
    assert.match(match[1], /^benchmark\/results\//, `unexpected dated string: ${match[1]}`)
  }
  assert.equal(analysis.privacy.containsHostPaths, false)
  assert.equal(analysis.privacy.containsTimestamps, false)
})

test('the artifact declares zero model calls', () => {
  assert.equal(analysis.modelCalls, MODEL_CALLS)
  assert.equal(analysis.modelCalls, 0)
  assert.equal(analysis.analysisKind, 'derived-secondary-analysis')
  assert.equal(analysis.id, ANALYSIS_ID)
})

test('the source hashes match the committed source bytes', () => {
  const byPath = new Map(analysis.source.sourceHashes.map((entry) => [entry.path, entry.sha256]))
  assert.equal(
    byPath.get('benchmark/results/validation-report-2026-09-11-codex-qwen3.8-27b-medium-paired.json'),
    sha256File(sourceJsonPath),
  )
  assert.equal(
    byPath.get('benchmark/results/validation-report-2026-09-11-codex-qwen3.8-27b-medium-paired.csv'),
    sha256File(sourceCsvPath),
  )
  assert.equal(analysis.source.sourceHashDigest.length, 64)
})

test('numbers are rounded to the documented precision', () => {
  const text = readFileSync(jsonPath, 'utf8')
  const decimalMatches = text.match(/\.\d{7,}/g) ?? []
  assert.deepEqual(decimalMatches, [], `values with more than ${MAX_DECIMALS} decimals`)
})

test('the source inconsistency between declared trials and reward slots is disclosed', () => {
  const kinds = analysis.sourceInconsistencies.items.map((item) => item.kind)
  assert.ok(kinds.includes('declared-trial-count-vs-reward-slots'))
  assert.ok(kinds.includes('unscored-trial-caveat'))
  const declared = analysis.sourceInconsistencies.items.find(
    (item) => item.kind === 'declared-trial-count-vs-reward-slots',
  )
  assert.equal(declared.arm, NO_SKILL_ARM)
  assert.equal(declared.declared, 167)
  assert.equal(declared.recomputed, 168)
})

test('the claim boundary forbids the four causal over-reads', () => {
  const forbidden = analysis.claimBoundary.forbidden.join(' | ')
  assert.match(forbidden, /weak models are harmed by skills/)
  assert.match(forbidden, /timeouts caused the negative result/)
  assert.match(forbidden, /skill caused context overload/)
  assert.match(forbidden, /removing timeouts proves a positive effect/)
  assert.match(analysis.claimBoundary.allowed, /inconclusive/)
  assert.match(analysis.claimBoundary.allowed, /complicated by timeout\/termination and missingness/)
})

// ── LaTeX rendering ──────────────────────────────────────────────────────────

test('the LaTeX table renders from the artifact with the expected label', () => {
  const tex = renderQwenSensitivityTableTex(analysis)
  assert.match(tex, /\\label\{tab:qwen-sensitivity\}/)
  assert.match(tex, /AUTO-GENERATED\. DO NOT EDIT\./)
  assert.match(tex, /MISSING-VALUE BOUNDS|missing-value bound/)
  assert.match(tex, /post-hoc/i)
})

test('the LaTeX table carries the key numbers from the artifact', () => {
  const tex = renderQwenSensitivityTableTex(analysis)
  assert.match(tex, /\$\-3\.07\$/) // main estimate
  assert.match(tex, /\$\-3\.67\$/) // lower bound
  assert.match(tex, /30/) // timeout + full combined
  assert.match(tex, /\+4\.02/) // post-hoc no-timeout-tasks effect
  assert.match(tex, /\+9\.30/) // post-hoc unbalanced effect
})

test('the LaTeX table states that missing bounds are not a confidence interval', () => {
  const tex = renderQwenSensitivityTableTex(analysis)
  assert.match(tex, /Missing rewards are treated as unknowns in the legal range/)
  assert.match(tex, /never as \$0\$/)
  assert.match(tex, /not a confidence interval/i)
})

test('the LaTeX table is deterministic and matches the committed file', () => {
  const first = renderQwenSensitivityTableTex(analysis)
  const second = renderQwenSensitivityTableTex(loadAnalysis(repoRoot))
  assert.equal(first, second)
  assert.equal(first, readFileSync(join(repoRoot, TEX_OUTPUT_PATH), 'utf8'))
})

test('fmtSigned2 renders negatives inside math mode', () => {
  assert.equal(fmtSigned2(-3.071429), '$-3.07$')
  assert.equal(fmtSigned2(4.02381), '+4.02')
  assert.equal(fmtSigned2(0), '+0.00')
})

test('the LaTeX generator rejects an artifact that reports model calls', () => {
  const tampered = JSON.parse(JSON.stringify(analysis))
  tampered.modelCalls = 3
  assert.throws(() => renderQwenSensitivityTableTex(tampered), /modelCalls|buckets|missing/)
})

// ── Paper integration ────────────────────────────────────────────────────────

test('the paper inputs the generated sensitivity table', () => {
  const paper = readFileSync(paperTexPath, 'utf8')
  assert.match(paper, /generated\/qwen-paired-sensitivity-table\.tex/)
  assert.match(paper, /tab:qwen-sensitivity/)
})

test('the paper states the Qwen estimate is inconclusive and termination-confounded', () => {
  const paper = readFileSync(paperTexPath, 'utf8')
  assert.match(paper, /inconclusive/)
  assert.match(paper, /termination-confounded/)
  assert.match(paper, /not automatically a functional failure/)
})
