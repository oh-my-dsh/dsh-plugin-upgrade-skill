// benchmark/scripts/analyze-qwen-paired-sensitivity.mjs
//
// Deterministic secondary analysis of an EXISTING paired benchmark run:
// timeout / termination state, missing-score bounds and task influence for the
// historical qwen3.8-27b (medium) 56-task paired experiment.
//
// ---------------------------------------------------------------------------
// CLAIM BOUNDARY (enforced here, in the tests, and in the paper text)
// ---------------------------------------------------------------------------
// ALLOWED: "the historical Qwen point is negative descriptively, statistically
//           inconclusive, and its interpretation is complicated by
//           timeout/termination and missingness behaviour."
// FORBIDDEN (this artifact never supports any of these):
//   - "weak models are harmed by skills";
//   - "timeouts caused the negative result";
//   - "skill caused context overload";
//   - "removing timeouts proves a positive effect".
// The non-timeout-only view is POST-HOC, DESCRIPTIVE ONLY, selection-biased and
// is NEVER a replacement for the main estimate. No model, judge or solver call
// is made: this file reads committed artifacts only (`modelCalls: 0`).
//
// ---------------------------------------------------------------------------
// What it computes (nothing is hardcoded from the source report's prose)
// ---------------------------------------------------------------------------
//  1. Source completeness. The source must contain exactly 56 tasks × 2 arms
//     × 3 intended attempts. The scored/unscored split and the aggregate
//     timeout/usage totals are RECOMPUTED and cross-checked against the CSV
//     companion and against the report's own declared `totals` block; any
//     disagreement is a hard error.
//  2. Missing-value bounds. Every unscored reward slot (reward === null) is
//     treated as an unknown in the legal reward range [0, 1]. The main estimate
//     is the task-level equal-weight mean paired effect taken over each task's
//     SCORED trials only — a missing reward is never substituted with 0. The
//     bounds re-run the same estimator with every missing slot set to 0 (lower)
//     and to 1 (upper). These are MISSING-VALUE BOUNDS, NOT a confidence
//     interval: they describe the algebraic span of the missingness alone and
//     carry no sampling or inferential interpretation.
//  3. Timeout taxonomy per arm, from the per-trial `exceptions` arrays, which
//     are positionally aligned with `rewards` and `seconds`: scored/no-timeout,
//     scored/timeout (split into full, partial and zero reward), unscored
//     (timeout) and unscored (other/unknown cause), plus the non-timeout
//     independent side-signals (transport/code/validation/rate-limit). The key
//     observation is that a timeout is a TERMINATION STATE, not automatically a
//     functional failure: some timed-out trials still score full marks.
//     A trial whose result the report attributes to a VERIFIER timeout (rather
//     than an agent timeout) can appear here as `unscored` with no recorded
//     exception, so the unscored bucket is reported as an observed state and
//     never imputed.
//  4. Post-hoc descriptive views: (a) all scored trials (the task-level
//     authority), (b) the missing lower/upper bounds, and (c) a NON-TIMEOUT-ONLY
//     view, explicitly labelled post-hoc, selection-biased and non-authoritative.
//  5. Task influence: task-level leave-one-task-out for the main Qwen effect.
//     The most influential tasks are computed automatically and are never
//     hardcoded.
//
// Determinism: no model calls, no network, no timestamps, no host paths, no
// randomness, no `Date`, no `process.cwd()`-dependent output. Tasks are sorted
// by id; the rendered JSON has a fixed key order and byte-matches on
// regeneration. `--check` byte-compares without writing.
//
// Usage (from the repo root, or anywhere — paths resolve against the repo):
//   node benchmark/scripts/analyze-qwen-paired-sensitivity.mjs
//   node benchmark/scripts/analyze-qwen-paired-sensitivity.mjs --check
//
// Output (committed):
//   benchmark/results/qwen-paired-sensitivity.json
import { createHash } from 'node:crypto'
import { existsSync, readFileSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'
import { fileURLToPath, pathToFileURL } from 'node:url'

export const ANALYSIS_ID = 'qwen-paired-sensitivity-v1'
export const SCHEMA_VERSION = 1
export const MODEL_CALLS = 0

export const EXPECTED_TASKS = 56
export const EXPECTED_ARMS = 2
export const ATTEMPTS_PER_ARM = 3
export const EXPECTED_TRIAL_SLOTS = EXPECTED_TASKS * EXPECTED_ARMS * ATTEMPTS_PER_ARM // 336

export const SKILL_ARM = 'with-skill'
export const NO_SKILL_ARM = 'no-skill'
export const ARMS = [SKILL_ARM, NO_SKILL_ARM]

/** Legal reward range; a missing reward is an unknown inside this interval. */
export const REWARD_MIN = 0
export const REWARD_MAX = 1

/** Reporting scale: probabilities are reported in percentage points (×100). */
export const SCALE = 100
export const MAX_DECIMALS = 6

/** The agent-timeout termination signal recorded by Harbor in this run. */
export const AGENT_TIMEOUT_EXCEPTION = 'AgentTimeoutError'

/** Non-timeout exceptions are independent side-signals, never the timeout bucket. */
export const INFRA_EXCEPTIONS = [
  'NetworkConnectionError',
  'NonZeroAgentExitCodeError',
  'ValidationError',
  'ApiRateLimitError',
]

export const SOURCE_REPORT =
  'benchmark/results/validation-report-2026-09-11-codex-qwen3.8-27b-medium-paired.json'
export const SOURCE_COMPANION_CSV =
  'benchmark/results/validation-report-2026-09-11-codex-qwen3.8-27b-medium-paired.csv'
export const SOURCE_REPORT_MARKDOWN =
  'benchmark/results/validation-report-2026-09-11-codex-qwen3.8-27b-medium-paired.md'
export const OUTPUT_PATH = 'benchmark/results/qwen-paired-sensitivity.json'

export const MISSING_BOUNDS_NOTE =
  'These are MISSING-VALUE BOUNDS, NOT a confidence interval: they are the algebraic span obtained by setting every unscored reward slot to the endpoints of the legal range [0, 1] while keeping the estimator fixed. They carry no sampling, coverage or inferential interpretation, and they do not include any other source of uncertainty (bootstrap, task sampling, grading error).'

export const MISSING_NOT_ZERO_NOTE =
  'An unscored reward is MISSING, NOT 0. The main estimate is computed over each task\'s scored trials only, so a missing reward is never usable as or replaced by 0 in the point estimate; 0 is substituted exclusively inside the lower-bound scenario and 1 exclusively inside the upper-bound scenario, and neither substitution is ever used for the main estimate.'

export const TIMEOUT_STATE_NOTE =
  'A timeout is a TERMINATION STATE, not automatically a functional failure: trials that hit AgentTimeoutError still produced scored and even full-mark outcomes, so timeout counts and score outcomes are reported separately and never conflated.'

export const POST_HOC_NOTE =
  'POST-HOC DESCRIPTIVE ONLY, SELECTION-BIASED, NOT AUTHORITATIVE. Excluding timed-out trials conditions on a termination state that is itself associated with the arm (the with-skill arm timed out more often), so the surviving trials are not a random or balanced subsample. This number is a disclosure of sensitivity, it does not identify a cause, and it NEVER replaces the main task-level estimate.'

export const FORBIDDEN_CLAIMS = [
  'weak models are harmed by skills',
  'timeouts caused the negative result',
  'skill caused context overload',
  'removing timeouts proves a positive effect',
]

// ── Small deterministic helpers ───────────────────────────────────────────────

function isPlainObject(value) {
  return value !== null && typeof value === 'object' && !Array.isArray(value)
}

export function round6(value) {
  if (typeof value !== 'number' || !Number.isFinite(value)) return null
  const factor = 10 ** MAX_DECIMALS
  return Math.round(value * factor) / factor
}

/** Deterministic numeric sort for task ids (avoids locale-dependent collation). */
export function compareTaskIds(a, b) {
  if (a === b) return 0
  return a < b ? -1 : 1
}

/** Mean of the finite numbers in `values`; `null` for an empty input. */
export function mean(values) {
  const numbers = values.filter((value) => typeof value === 'number' && Number.isFinite(value))
  if (numbers.length === 0) return null
  return numbers.reduce((sum, value) => sum + value, 0) / numbers.length
}

/** Mean of per-task values expressed in percentage points; task weight is equal. */
export function taskEqualWeightMean(taskValues) {
  return mean(taskValues.map((value) => value * SCALE))
}

/** Reward histogram over exact observed values, keyed deterministically. */
export function rewardHistogram(rewards) {
  const counts = new Map()
  for (const reward of rewards) {
    if (typeof reward !== 'number' || !Number.isFinite(reward)) continue
    counts.set(reward, (counts.get(reward) ?? 0) + 1)
  }
  const entries = [...counts.entries()].sort((a, b) => a[0] - b[0])
  return {
    values: entries.map(([reward, count]) => ({ reward: round6(reward), count })),
    distinct: entries.length,
    total: entries.reduce((sum, [, count]) => sum + count, 0),
  }
}

// ── CSV companion (minimal RFC-4180 subset, no third-party dependency) ────────

export function parseCsv(text) {
  const normalized = String(text).replaceAll('\r\n', '\n')
  const rows = []
  let row = []
  let field = ''
  let inQuotes = false
  const pushField = () => {
    row.push(field)
    field = ''
  }
  const pushRow = () => {
    pushField()
    rows.push(row)
    row = []
  }
  for (let i = 0; i < normalized.length; i += 1) {
    const ch = normalized[i]
    if (inQuotes) {
      if (ch === '"') {
        if (normalized[i + 1] === '"') {
          field += '"'
          i += 1
        } else {
          inQuotes = false
        }
      } else {
        field += ch
      }
      continue
    }
    if (ch === '"') inQuotes = true
    else if (ch === ',') pushField()
    else if (ch === '\n') pushRow()
    else field += ch
  }
  if (inQuotes) throw new Error('malformed CSV: unterminated quoted field')
  if (field !== '' || row.length > 0) pushRow()
  while (rows.length > 0 && rows[rows.length - 1].length === 1 && rows[rows.length - 1][0] === '') rows.pop()
  if (rows.length === 0) throw new Error('malformed CSV: empty input')
  const header = rows.shift()
  const records = rows.map((cells, index) => {
    if (cells.length !== header.length) {
      throw new Error(`malformed CSV: row ${index + 2} has ${cells.length} cells, expected ${header.length}`)
    }
    const record = {}
    header.forEach((name, column) => {
      record[name] = cells[column]
    })
    return record
  })
  return { header, records }
}

/** A usage cell is either a finite number or missing (null) — never silently 0. */
export function parseUsageCell(cell) {
  if (cell === undefined || cell === null) return null
  const text = String(cell).trim()
  if (text === '' || text === '-' || text === 'null' || text === 'NaN') return null
  const value = Number(text)
  return Number.isFinite(value) ? value : null
}

// ── Source loading and validation ─────────────────────────────────────────────

function sha256OfFile(path) {
  return createHash('sha256').update(readFileSync(path)).digest('hex')
}

function loadJson(path, label) {
  if (!existsSync(path)) throw new Error(`${label} not found: ${path}`)
  try {
    return JSON.parse(readFileSync(path, 'utf8'))
  } catch (error) {
    throw new Error(`${label} is not valid JSON: ${path} (${error.message})`)
  }
}

/**
 * Validate the report's raw shape and return a task→trials model. Every reward
 * slot must be null (unscored) or a number in [0, 1]; the exceptions and seconds
 * arrays must be positionally aligned with the rewards array.
 */
export function buildTrials(report, { sourceLabel = 'report', expectedTasks = EXPECTED_TASKS } = {}) {
  if (!isPlainObject(report)) throw new Error(`${sourceLabel}: expected a JSON object`)
  if (!isPlainObject(report.protocol)) throw new Error(`${sourceLabel}: missing "protocol" object`)
  if (report.protocol.attempts_per_condition !== ATTEMPTS_PER_ARM) {
    throw new Error(
      `${sourceLabel}: protocol.attempts_per_condition is ${JSON.stringify(report.protocol.attempts_per_condition)}; this analysis is defined for ${ATTEMPTS_PER_ARM}`,
    )
  }
  const entries = report.per_task
  if (!Array.isArray(entries)) throw new Error(`${sourceLabel}: missing "per_task" array`)
  if (entries.length !== expectedTasks) {
    throw new Error(`${sourceLabel}: ${entries.length} tasks present, expected ${expectedTasks}`)
  }
  const seen = new Set()
  const tasks = []
  for (const entry of entries) {
    if (!isPlainObject(entry) || typeof entry.task !== 'string' || entry.task.trim() === '') {
      throw new Error(`${sourceLabel}: every per_task entry needs a non-empty "task" id`)
    }
    const task = entry.task
    if (seen.has(task)) throw new Error(`${sourceLabel}: duplicate task "${task}"`)
    seen.add(task)
    const arms = {}
    for (const arm of ARMS) {
      const payload = entry[arm]
      if (!isPlainObject(payload)) throw new Error(`${sourceLabel}: task "${task}" has no "${arm}" object`)
      const rewards = payload.rewards
      if (!Array.isArray(rewards) || rewards.length !== ATTEMPTS_PER_ARM) {
        throw new Error(
          `${sourceLabel}: task "${task}" arm "${arm}" must have exactly ${ATTEMPTS_PER_ARM} reward slots, got ${JSON.stringify(rewards)}`,
        )
      }
      const exceptions = payload.exceptions
      if (exceptions !== undefined && (!Array.isArray(exceptions) || exceptions.length !== ATTEMPTS_PER_ARM)) {
        throw new Error(
          `${sourceLabel}: task "${task}" arm "${arm}" exceptions must have ${ATTEMPTS_PER_ARM} slots, got ${JSON.stringify(exceptions)}`,
        )
      }
      const seconds = payload.seconds
      if (seconds !== undefined && (!Array.isArray(seconds) || seconds.length !== ATTEMPTS_PER_ARM)) {
        throw new Error(
          `${sourceLabel}: task "${task}" arm "${arm}" seconds must have ${ATTEMPTS_PER_ARM} slots, got ${JSON.stringify(seconds)}`,
        )
      }
      const trials = rewards.map((reward, index) => {
        if (reward !== null && (typeof reward !== 'number' || !Number.isFinite(reward) || reward < REWARD_MIN || reward > REWARD_MAX)) {
          throw new Error(
            `${sourceLabel}: task "${task}" arm "${arm}" trial ${index} has malformed reward ${JSON.stringify(reward)} (must be null or a number in [0, 1])`,
          )
        }
        const exception = Array.isArray(exceptions) ? (exceptions[index] ?? null) : null
        if (exception !== null && typeof exception !== 'string') {
          throw new Error(
            `${sourceLabel}: task "${task}" arm "${arm}" trial ${index} has malformed exception ${JSON.stringify(exception)}`,
          )
        }
        const rawSeconds = Array.isArray(seconds) ? (seconds[index] ?? null) : null
        return classifyTrial({
          index,
          task,
          arm,
          reward,
          seconds: typeof rawSeconds === 'number' && Number.isFinite(rawSeconds) ? rawSeconds : null,
          exception,
          timeout: exception === AGENT_TIMEOUT_EXCEPTION,
        })
      })
      arms[arm] = trials
    }
    tasks.push({ task, arms })
  }
  tasks.sort((a, b) => compareTaskIds(a.task, b.task) || 0)
  return { tasks }
}

/** Cross-check the CSV companion against the JSON report; index it by task|arm. */
export function validateCsvCompanion(records, report, { sourceLabel = 'CSV companion' } = {}) {
  if (!Array.isArray(records)) throw new Error(`${sourceLabel}: expected CSV records`)
  const required = ['task', 'condition', 'trials', 'rewards', 'timeouts', 'exceptions']
  if (records.length > 0) {
    for (const column of required) {
      if (!(column in records[0])) throw new Error(`${sourceLabel}: missing required column "${column}"`)
    }
  }
  const byKey = new Map()
  for (const record of records) {
    const key = `${record.task}|${record.condition}`
    if (byKey.has(key)) throw new Error(`${sourceLabel}: duplicate row for ${key}`)
    byKey.set(key, record)
  }
  for (const entry of report.per_task) {
    for (const arm of ARMS) {
      const key = `${entry.task}|${arm}`
      const record = byKey.get(key)
      if (record === undefined) throw new Error(`${sourceLabel}: missing row for ${key}`)
      const csvRewards = String(record.rewards ?? '')
        .split('|')
        .map((cell) => {
          const text = cell.trim()
          if (text === '' || text === '-' || text === 'null') return null
          const value = Number(text)
          return Number.isFinite(value) ? value : null
        })
      const jsonRewards = entry[arm].rewards
      if (JSON.stringify(csvRewards) !== JSON.stringify(jsonRewards)) {
        throw new Error(
          `${sourceLabel}: rewards for ${key} (${record.rewards}) disagree with the report (${jsonRewards.map((value) => (value === null ? '-' : value)).join('|')})`,
        )
      }
      if (Number(record.trials) !== ATTEMPTS_PER_ARM) {
        throw new Error(`${sourceLabel}: row ${key} declares ${record.trials} trials, expected ${ATTEMPTS_PER_ARM}`)
      }
    }
  }
  if (byKey.size !== EXPECTED_TASKS * ARMS.length) {
    throw new Error(`${sourceLabel}: ${byKey.size} task/arm rows, expected ${EXPECTED_TASKS * ARMS.length}`)
  }
  return byKey
}

/**
 * Cross-check the source's own declared `totals` block against the recomputed
 * values. A source-level disagreement is a hard error, never a silent choice of
 * one number over the other.
 */
export function validateDeclaredTotals(declared, computed, { sourceLabel = 'report' } = {}) {
  if (!isPlainObject(declared)) throw new Error(`${sourceLabel}: missing "totals" object`)
  for (const arm of ARMS) {
    const block = declared[arm]
    if (!isPlainObject(block)) throw new Error(`${sourceLabel}: totals is missing the "${arm}" arm`)
    const actual = computed[arm]
    for (const [key, value] of [
      ['trials', actual.declaredTrials],
      ['reward_sum', actual.rewardSum === null ? null : round6(actual.rewardSum)],
      ['timeout_trials', actual.timeoutTrials],
      ['perfect_trials', actual.rewardFullCount],
      ['zero_trials', actual.rewardZeroCount],
    ]) {
      if (block[key] === undefined) continue
      const declaredValue = block[key]
      const matches =
        typeof value === 'number' && typeof declaredValue === 'number'
          ? Math.abs(value - declaredValue) < 1e-6
          : value === declaredValue
      if (!matches) {
        throw new Error(
          `${sourceLabel}: declared totals.${arm}.${key} = ${JSON.stringify(declaredValue)} disagrees with the recomputed ${JSON.stringify(value)}`,
        )
      }
    }
    if (typeof block.input_tokens === 'number' && block.input_tokens !== actual.inputTokens) {
      throw new Error(`${sourceLabel}: declared totals.${arm}.input_tokens disagrees with the recomputed sum`)
    }
    if (typeof block.output_tokens === 'number' && block.output_tokens !== actual.outputTokens) {
      throw new Error(`${sourceLabel}: declared totals.${arm}.output_tokens disagrees with the recomputed sum`)
    }
  }
}

// ── Trial classification ──────────────────────────────────────────────────────

/**
 * Classify one trial. `timeout` and `scored` are the two independent booleans;
 * the reward buckets apply only to scored trials. A trial can never be both a
 * timeout and a non-timeout, so the buckets form a partition.
 */
export function classifyTrial(trial) {
  const scored = typeof trial.reward === 'number' && Number.isFinite(trial.reward)
  const timeout = trial.timeout === true
  let status
  if (!scored) status = timeout ? 'timeout_unscored' : 'unscored'
  else if (timeout) {
    if (trial.reward >= REWARD_MAX) status = 'timeout_full'
    else if (trial.reward <= REWARD_MIN) status = 'timeout_zero'
    else status = 'timeout_partial'
  } else status = 'no_timeout_scored'
  return {
    ...trial,
    scored,
    status,
    // Independent side-signal: a non-timeout exception is an infrastructure
    // signal, not a timeout and not automatically a zero.
    infraException: trial.exception !== null && !timeout ? trial.exception : null,
  }
}

export const TIMEOUT_BUCKETS = [
  ['no_timeout_scored', 'scored, no timeout'],
  ['timeout_full', 'scored, timeout, full reward'],
  ['timeout_partial', 'scored, timeout, partial reward'],
  ['timeout_zero', 'scored, timeout, zero reward'],
  ['timeout_unscored', 'unscored, timeout'],
  ['unscored', 'unscored, no timeout recorded'],
]

export function summarizeTrials(classified) {
  const counts = {}
  for (const [key] of TIMEOUT_BUCKETS) counts[key] = 0
  const scoredRewards = []
  let timeoutTrials = 0
  let timeoutScoredTrials = 0
  const exceptionCounts = {}
  const infraScoredNonzero = []
  let secondsSum = 0
  let secondsCount = 0
  for (const trial of classified) {
    counts[trial.status] += 1
    if (trial.timeout) timeoutTrials += 1
    if (trial.scored) {
      scoredRewards.push(trial.reward)
      if (trial.timeout) timeoutScoredTrials += 1
      if (trial.infraException !== null && trial.reward > REWARD_MIN) {
        infraScoredNonzero.push({ task: trial.task, index: trial.index, reward: round6(trial.reward), exception: trial.infraException })
      }
    }
    if (trial.exception !== null) {
      exceptionCounts[trial.exception] = (exceptionCounts[trial.exception] ?? 0) + 1
    }
    if (typeof trial.seconds === 'number' && Number.isFinite(trial.seconds)) {
      secondsSum += trial.seconds
      secondsCount += 1
    }
  }
  const exceptionKeys = [...new Set([...Object.keys(exceptionCounts), ...INFRA_EXCEPTIONS])].sort()
  const exceptions = {}
  for (const key of exceptionKeys) {
    if (exceptionCounts[key] !== undefined) exceptions[key] = exceptionCounts[key]
  }
  return {
    slots: classified.length,
    scoredTrials: scoredRewards.length,
    unscoredTrials: classified.length - scoredRewards.length,
    timeoutTrials,
    timeoutScoredTrials,
    timeoutScoredFullCount: counts.timeout_full,
    timeoutScoredPartialCount: counts.timeout_partial,
    timeoutScoredZeroCount: counts.timeout_zero,
    timeoutUnscoredCount: counts.timeout_unscored,
    rewardSum: round6(scoredRewards.reduce((sum, value) => sum + value, 0)),
    rewardMeanScored: round6(mean(scoredRewards)),
    rewardFullCount: scoredRewards.filter((value) => value >= REWARD_MAX).length,
    rewardZeroCount: scoredRewards.filter((value) => value <= REWARD_MIN).length,
    rewardHistogram: rewardHistogram(scoredRewards),
    buckets: TIMEOUT_BUCKETS.map(([key, label]) => ({ key, label, count: counts[key] })),
    exceptions,
    infraScoredNonzero,
    trialSecondsSum: secondsCount === 0 ? null : round6(secondsSum),
    trialSecondsCount: secondsCount,
  }
}

// ── Task-level estimator and missing-value bounds ─────────────────────────────

/**
 * Task-level arm value for the main estimator: the equal-weight mean of the
 * task's SCORED trial rewards. Missing rewards are excluded, never zeroed.
 */
export function taskArmValue(trials, armValue) {
  const scored = trials.filter((trial) => trial.scored).map((trial) => trial.reward)
  if (scored.length === 0) return null
  return mean(scored)
}

/** The same arm value under a missing-reward scenario: `null` → `substitute`. */
export function taskArmValueUnder(trials, substitute) {
  const values = trials.map((trial) => (trial.reward === null ? substitute : trial.reward))
  if (values.length === 0) return null
  return mean(values)
}

/**
 * Build the task-level table. For every task the skill-arm value is a point
 * (the source has no missing skill-arm slot) and the no-skill value is a range
 * `[lower, upper]`; single-point inputs collapse the range, so the bounds are
 * exact rather than arbitrary.
 */
export function buildTaskLevel(tasks) {
  return tasks.map(({ task, arms }) => {
    const skill = taskArmValue(arms[SKILL_ARM])
    const noSkillScored = taskArmValue(arms[NO_SKILL_ARM])
    const noSkillLower = taskArmValueUnder(arms[NO_SKILL_ARM], REWARD_MIN)
    const noSkillUpper = taskArmValueUnder(arms[NO_SKILL_ARM], REWARD_MAX)
    const missingSkill = arms[SKILL_ARM].filter((trial) => !trial.scored).length
    const missingNoSkill = arms[NO_SKILL_ARM].filter((trial) => !trial.scored).length
    const observed = skill === null || noSkillScored === null ? null : (skill - noSkillScored) * SCALE
    // delta = with-skill − no-skill, so substituting a LARGER no-skill value
    // yields the SMALLER (lower) delta and vice versa.
    const deltaMin = skill === null || noSkillUpper === null ? null : (skill - noSkillUpper) * SCALE
    const deltaMax = skill === null || noSkillLower === null ? null : (skill - noSkillLower) * SCALE
    return {
      task,
      skillScoredMean: round6(skill),
      noSkillScoredMean: round6(noSkillScored),
      skillScoredTrials: arms[SKILL_ARM].filter((trial) => trial.scored).length,
      noSkillScoredTrials: arms[NO_SKILL_ARM].filter((trial) => trial.scored).length,
      missingSlots: missingSkill + missingNoSkill,
      missingSkillSlots: missingSkill,
      missingNoSkillSlots: missingNoSkill,
      noSkillLowerMean: round6(noSkillLower),
      noSkillUpperMean: round6(noSkillUpper),
      deltaObserved: round6(observed),
      deltaLower: round6(deltaMin),
      deltaUpper: round6(deltaMax),
      deltaBoundWidth: round6(deltaMin === null || deltaMax === null ? null : deltaMax - deltaMin),
    }
  })
}

/** Task-level equal-weight mean paired effect under a per-task value selector. */
export function taskEqualWeightEffect(taskLevel, selector) {
  return mean(taskLevel.map((row) => selector(row)))
}

export function summarizeEffect(taskLevel) {
  const observed = taskEqualWeightEffect(taskLevel, (row) => row.deltaObserved)
  const lower = taskEqualWeightEffect(taskLevel, (row) => row.deltaLower)
  const upper = taskEqualWeightEffect(taskLevel, (row) => row.deltaUpper)
  const observedDeltas = taskLevel.map((row) => row.deltaObserved).filter((value) => value !== null)
  return {
    scale: `percentage points (reward × ${SCALE})`,
    estimator:
      'task-level equal-weight mean paired effect: per task per arm the mean of the SCORED trial rewards, then the mean over tasks of (with-skill − no-skill), × 100; a missing reward is excluded, never replaced by 0',
    tasks: taskLevel.length,
    tasksWithMissing: taskLevel.filter((row) => row.missingSlots > 0).length,
    missingSlots: taskLevel.reduce((sum, row) => sum + row.missingSlots, 0),
    taskWeightPoints: round6(SCALE / taskLevel.length),
    meanSkill: round6(taskEqualWeightEffect(taskLevel, (row) => row.skillScoredMean)),
    meanNoSkill: round6(taskEqualWeightEffect(taskLevel, (row) => row.noSkillScoredMean)),
    deltaObserved: round6(observed),
    deltaLowerBound: round6(lower),
    deltaUpperBound: round6(upper),
    boundWidth: round6(lower === null || upper === null ? null : upper - lower),
    positiveTasks: observedDeltas.filter((value) => value > 0).length,
    zeroTasks: observedDeltas.filter((value) => value === 0).length,
    negativeTasks: observedDeltas.filter((value) => value < 0).length,
    missingBoundsNote: MISSING_BOUNDS_NOTE,
    missingNotZeroNote: MISSING_NOT_ZERO_NOTE,
  }
}

// ── Task influence: leave-one-task-out ────────────────────────────────────────

export function taskInfluence(taskLevel) {
  const effectWith = (excluded) => {
    const rows = excluded === null ? taskLevel : taskLevel.filter((row) => row.task !== excluded)
    return {
      observed: taskEqualWeightEffect(rows, (row) => row.deltaObserved),
      lower: taskEqualWeightEffect(rows, (row) => row.deltaLower),
      upper: taskEqualWeightEffect(rows, (row) => row.deltaUpper),
    }
  }
  const full = effectWith(null)
  const rows = taskLevel.map((row) => {
    const without = effectWith(row.task)
    return {
      task: row.task,
      deltaObserved: row.deltaObserved,
      effectWithoutObserved: round6(without.observed),
      effectWithoutLower: round6(without.lower),
      effectWithoutUpper: round6(without.upper),
      // influence = (full-sample mean − mean without the task) × n, i.e. the
      // percentage-point contribution of the task to the all-task mean. A task
      // that pulls the mean up has a positive influence.
      influenceObserved: round6((full.observed - without.observed) * taskLevel.length),
      influenceLower: round6((full.lower - without.lower) * taskLevel.length),
      influenceUpper: round6((full.upper - without.upper) * taskLevel.length),
    }
  })
  const observedEffects = rows.map((row) => row.effectWithoutObserved)
  const lowerEffects = rows.map((row) => row.effectWithoutLower)
  const upperEffects = rows.map((row) => row.effectWithoutUpper)
  // Extreme tasks are selected by index, never by comparing rounded output back
  // to the unrounded arrays (equality of independently rounded floats is not a
  // safe lookup key).
  const indexOfMin = (values) => values.reduce((best, value, index) => (value < values[best] ? index : best), 0)
  const indexOfMax = (values) => values.reduce((best, value, index) => (value > values[best] ? index : best), 0)
  const observedMinIndex = indexOfMin(observedEffects)
  const observedMaxIndex = indexOfMax(observedEffects)
  const byInfluenceDesc = [...rows].sort(
    (a, b) => b.influenceObserved - a.influenceObserved || compareTaskIds(a.task, b.task),
  )
  const mostPositiveInfluence = byInfluenceDesc[0]
  const mostNegativeInfluence = byInfluenceDesc[byInfluenceDesc.length - 1]
  return {
    method:
      'leave-one-task-out: recompute the task-level equal-weight mean paired effect with one task removed; influence = (full-sample effect − effect without the task) × number of tasks, i.e. the percentage-point contribution of that task to the all-task mean (positive = the task pulls the mean up). This is a descriptive stability diagnostic: removing a single task is not a substitution for an out-of-sample or causal estimate, and no task is excluded from the main estimate.',
    scope:
      'The most influential task is computed automatically; task names are never hardcoded and the estimate is never reported with a favourable task removed.',
    tasks: taskLevel.length,
    fullSampleObserved: round6(full.observed),
    fullSampleLower: round6(full.lower),
    fullSampleUpper: round6(full.upper),
    looObserved: {
      min: round6(Math.min(...observedEffects)),
      max: round6(Math.max(...observedEffects)),
      range: round6(Math.max(...observedEffects) - Math.min(...observedEffects)),
      excludedTaskAtMin: rows[observedMinIndex].task,
      excludedTaskAtMax: rows[observedMaxIndex].task,
    },
    looLower: {
      min: round6(Math.min(...lowerEffects)),
      max: round6(Math.max(...lowerEffects)),
      range: round6(Math.max(...lowerEffects) - Math.min(...lowerEffects)),
    },
    looUpper: {
      min: round6(Math.min(...upperEffects)),
      max: round6(Math.max(...upperEffects)),
      range: round6(Math.max(...upperEffects) - Math.min(...upperEffects)),
    },
    mostPositiveInfluence: {
      task: mostPositiveInfluence.task,
      influenceObserved: mostPositiveInfluence.influenceObserved,
      effectWithoutObserved: mostPositiveInfluence.effectWithoutObserved,
    },
    mostNegativeInfluence: {
      task: mostNegativeInfluence.task,
      influenceObserved: mostNegativeInfluence.influenceObserved,
      effectWithoutObserved: mostNegativeInfluence.effectWithoutObserved,
    },
    perTask: rows,
  }
}

// ── Post-hoc descriptive views ────────────────────────────────────────────────

/**
 * Non-timeout-only descriptive views, in three explicitly post-hoc variants:
 *   - `scored_trials_only`: keep every scored trial except timed-out trials.
 *   - `no_timeout_tasks_only`: keep only tasks whose SIX trials (both arms) are
 *     all non-timeout (balanced but the smallest subset).
 *   - `task_no_timeout_trials`: per task, drop timed-out trials and average the
 *     rest (unbalanced).
 * All three are selection-biased and non-authoritative by construction.
 */
export function postHocNonTimeout(tasks, taskLevel) {
  const flat = tasks.flatMap(({ arms }) => [...arms[SKILL_ARM], ...arms[NO_SKILL_ARM]])
  const scoredOnly = flat.filter((trial) => trial.scored && !trial.timeout)
  const perTaskScoredOnly = tasks.map(({ task, arms }) => {
    const armValue = (arm) => {
      const values = arms[arm].filter((trial) => trial.scored && !trial.timeout).map((trial) => trial.reward)
      return values.length === 0 ? null : mean(values)
    }
    const skill = armValue(SKILL_ARM)
    const noSkill = armValue(NO_SKILL_ARM)
    return {
      task,
      skillMean: round6(skill),
      noSkillMean: round6(noSkill),
      delta: skill === null || noSkill === null ? null : round6((skill - noSkill) * SCALE),
      included: skill !== null && noSkill !== null,
    }
  })
  const taskNoTimeoutDeltas = perTaskScoredOnly.filter((row) => row.included).map((row) => row.delta)
  const noTimeoutTasks = perTaskScoredOnly.filter((row) => row.included)
  const allTrialsCleanTasks = tasks
    .filter(({ arms }) => [...arms[SKILL_ARM], ...arms[NO_SKILL_ARM]].every((trial) => !trial.timeout && trial.scored))
    .map((entry) => entry.task)
  const cleanTaskSet = new Set(allTrialsCleanTasks)
  const cleanDeltas = taskLevel.filter((row) => cleanTaskSet.has(row.task)).map((row) => row.deltaObserved)
  return {
    note: POST_HOC_NOTE,
    trialLevelSelection: {
      label: 'scored_trials_only',
      description: 'every scored trial whose exception is not AgentTimeoutError, pooled without task weighting',
      trials: scoredOnly.length,
      droppedTimeoutTrials: flat.length - scoredOnly.length,
      meanReward: round6(mean(scoredOnly.map((trial) => trial.reward))),
      score: round6(mean(scoredOnly.map((trial) => trial.reward)) * SCALE),
    },
    noTimeoutTasksOnly: {
      label: 'no_timeout_tasks_only',
      description: 'only tasks whose six trials (both arms) are all non-timeout and scored; task-level equal-weight mean paired effect',
      tasks: cleanDeltas.length,
      excludedTasks: taskLevel.length - cleanDeltas.length,
      excludedTaskIds: tasks.filter((entry) => !cleanTaskSet.has(entry.task)).map((entry) => entry.task),
      effect: round6(mean(cleanDeltas)),
    },
    taskNoTimeoutTrials: {
      label: 'task_no_timeout_trials',
      description: 'per task, drop timed-out trials from each arm and average the remaining scored trials; unbalanced (arms keep different trial counts)',
      tasksWithBothArms: noTimeoutTasks.length,
      tasksDropped: perTaskScoredOnly.length - noTimeoutTasks.length,
      droppedTaskIds: perTaskScoredOnly.filter((row) => !row.included).map((row) => row.task),
      effect: round6(mean(taskNoTimeoutDeltas)),
    },
    perTask: perTaskScoredOnly,
  }
}

/**
 * Observed discrepancies between the committed source artifacts. Every item is
 * descriptive provenance, not an adjustment: no number is corrected or replaced.
 */
export function buildSourceInconsistencies({ report, tasks, perArmAggregate, csvByKey }) {
  const items = []

  // 1. Declared per-arm trial counts vs recomputed reward slots.
  for (const arm of ARMS) {
    const slots = tasks.length * ATTEMPTS_PER_ARM
    const declaredTrials = report.totals?.[arm]?.trials
    if (typeof declaredTrials === 'number' && declaredTrials !== slots) {
      items.push({
        kind: 'declared-trial-count-vs-reward-slots',
        arm,
        declared: declaredTrials,
        recomputed: slots,
        detail: `the report declares ${declaredTrials} ${arm} trials but the per_task block carries ${slots} reward slots; the difference equals that arm's unscored slots (${perArmAggregate[arm].unscoredTrials})`,
      })
    }
  }

  // 2. CSV per-trial exception ordering vs the JSON positionally aligned array.
  for (const entry of tasks) {
    for (const arm of ARMS) {
      const record = csvByKey.get(`${entry.task}|${arm}`)
      if (record === undefined) continue
      const csvExceptions = String(record.exceptions ?? '')
        .split(',')
        .map((cell) => cell.trim())
        .filter((cell) => cell !== '')
      const jsonExceptions = entry.arms[arm].map((trial) => trial.exception).filter((value) => value !== null)
      const sameMultiset =
        csvExceptions.length === jsonExceptions.length &&
        [...csvExceptions].sort().join('|') === [...jsonExceptions].sort().join('|')
      const sameOrder = JSON.stringify(csvExceptions) === JSON.stringify(jsonExceptions)
      if (sameMultiset && !sameOrder) {
        items.push({
          kind: 'csv-exception-ordering-vs-json',
          task: entry.task,
          arm,
          csvExceptions,
          jsonExceptions,
          detail:
            'the CSV exception list and the JSON per-trial exceptions array contain the same multiset in a different order; the JSON array is used because it is positionally aligned with rewards[] and seconds[]',
        })
      }
    }
  }

  // 3. The unscored slot state vs the report prose attribution. The prose is not
  //    parsed as data; the observed state is reported alongside this caveat.
  const unscored = tasks.flatMap((entry) =>
    [...entry.arms[SKILL_ARM], ...entry.arms[NO_SKILL_ARM]].filter((trial) => !trial.scored),
  )
  for (const trial of unscored) {
    items.push({
      kind: 'unscored-trial-caveat',
      task: trial.task,
      arm: trial.arm,
      trial: trial.index,
      recordedException: trial.exception,
      terminationState:
        trial.timeout === true ? 'timeout' : 'no timeout recorded in the exceptions array',
      detail:
        'the unscored slot is reported as an observed state and is never imputed; the report Markdown attributes this trial to a verifier timeout while the machine-readable exceptions array records AgentTimeoutError, so the bucket counts follow the array and the prose discrepancy is disclosed here',
    })
  }

  return items
}

// ── Assembly ──────────────────────────────────────────────────────────────────

/**
 * Pure analysis entry: given the parsed source report and CSV records, produce
 * the full deterministic payload. No file system, no clock, no randomness.
 */
export function analyzeQwenSensitivity({ report, csvRecords, sourceHashes }) {
  const { tasks } = buildTrials(report)
  const csvByKey = validateCsvCompanion(csvRecords, report)

  // ── Completeness: 56 tasks × 2 arms × 3 intended attempts ──────────────────
  const intendedSlots = tasks.reduce((sum, entry) => sum + ARMS.length * ATTEMPTS_PER_ARM, 0)
  if (intendedSlots !== EXPECTED_TRIAL_SLOTS) {
    throw new Error(`source completeness: ${intendedSlots} intended slots, expected ${EXPECTED_TRIAL_SLOTS}`)
  }
  const uniqueTasks = new Set(tasks.map((entry) => entry.task))
  if (uniqueTasks.size !== EXPECTED_TASKS) {
    throw new Error(`source completeness: ${uniqueTasks.size} unique tasks, expected ${EXPECTED_TASKS}`)
  }

  const perArmAggregate = {}
  for (const arm of ARMS) {
    const armTrials = tasks.flatMap((entry) => entry.arms[arm])
    if (armTrials.length !== EXPECTED_TASKS * ATTEMPTS_PER_ARM) {
      throw new Error(`source completeness: arm ${arm} has ${armTrials.length} reward slots, expected ${EXPECTED_TASKS * ATTEMPTS_PER_ARM}`)
    }
    const summary = summarizeTrials(armTrials.map(classifyTrial))
    const csvRows = tasks.map((entry) => csvByKey.get(`${entry.task}|${arm}`))
    const tokenSums = { input: 0, cachedInput: 0, output: 0 }
    let tokenRows = 0
    let secondsSum = 0
    let secondsRows = 0
    for (const record of csvRows) {
      const input = parseUsageCell(record.input_tokens)
      const cached = parseUsageCell(record.cached_input_tokens)
      const output = parseUsageCell(record.output_tokens)
      const seconds = parseUsageCell(record.trial_seconds_sum)
      if (input !== null && output !== null) {
        tokenSums.input += input
        tokenSums.cachedInput += cached ?? 0
        tokenSums.output += output
        tokenRows += 1
      }
      if (seconds !== null) {
        secondsSum += seconds
        secondsRows += 1
      }
    }
    const declared = isPlainObject(report.totals) ? report.totals[arm] : null
    perArmAggregate[arm] = {
      ...summary,
      // The report's prose says "168 trials" per arm while one no-skill reward
      // slot is unscored; both the intended-slot count and the scored count are
      // reported so the distinction is explicit.
      declaredTrials: declared?.trials ?? null,
      declaredRewardSum: declared?.reward_sum ?? null,
      declaredMean: declared?.mean ?? null,
      inputTokens: tokenRows === 0 ? null : tokenSums.input,
      cachedInputTokens: tokenRows === 0 ? null : tokenSums.cachedInput,
      outputTokens: tokenRows === 0 ? null : tokenSums.output,
      tokenRows,
      summedSecondsFromCsv: secondsRows === 0 ? null : round6(secondsSum),
      secondsRows,
      declaredInputTokens: declared?.input_tokens ?? null,
      declaredOutputTokens: declared?.output_tokens ?? null,
      declaredTimeoutTrials: declared?.timeout_trials ?? null,
      declaredSummedNativeTrialSeconds: declared?.summed_native_trial_seconds ?? null,
    }
  }
  validateDeclaredTotals(report.totals, perArmAggregate)

  const taskLevel = buildTaskLevel(tasks)
  const effect = summarizeEffect(taskLevel)
  const influence = taskInfluence(taskLevel)
  const postHoc = postHocNonTimeout(tasks, taskLevel)
  const missingSlots = tasks.flatMap((entry) =>
    [...entry.arms[SKILL_ARM], ...entry.arms[NO_SKILL_ARM]]
      .filter((trial) => !trial.scored)
      .map((trial) => ({ task: trial.task, arm: trial.arm, trial: trial.index, exception: trial.exception })),
  )

  return {
    schemaVersion: SCHEMA_VERSION,
    id: ANALYSIS_ID,
    analysisKind: 'derived-secondary-analysis',
    modelCalls: MODEL_CALLS,
    source: {
      report: SOURCE_REPORT,
      companionCsv: SOURCE_COMPANION_CSV,
      reportMarkdown: SOURCE_REPORT_MARKDOWN,
      sourceHashes: sourceHashes.map((entry) => ({ path: entry.path, sha256: entry.sha256 })),
      sourceHashDigest: createHash('sha256')
        .update(sourceHashes.map((entry) => `${entry.path}\u0000${entry.sha256}`).join('\u0001'))
        .digest('hex'),
      sourceProtocol: {
        agent: report.protocol.agent ?? null,
        model: report.protocol.model ?? null,
        serving: report.protocol.serving ?? null,
        harbor: report.protocol.harbor ?? null,
        reasoningEffort: report.protocol.reasoning_effort ?? null,
        attemptsPerCondition: report.protocol.attempts_per_condition ?? null,
        taskSourceSnapshot: report.protocol.task_source_snapshot ?? null,
      },
      // Wall-clock intervals, host names and other time-bearing provenance are
      // deliberately excluded so the artifact stays timestamp-free.
    },
    claimBoundary: {
      allowed:
        'the historical Qwen point is negative descriptively, statistically inconclusive, and its interpretation is complicated by timeout/termination and missingness behaviour',
      forbidden: FORBIDDEN_CLAIMS,
      notes: [MISSING_BOUNDS_NOTE, MISSING_NOT_ZERO_NOTE, TIMEOUT_STATE_NOTE, POST_HOC_NOTE],
    },
    completeness: {
      tasks: tasks.length,
      arms: ARMS.length,
      attemptsPerArm: ATTEMPTS_PER_ARM,
      intendedTrialSlots: intendedSlots,
      expectedTrialSlots: EXPECTED_TRIAL_SLOTS,
      scoredTrials: perArmAggregate[SKILL_ARM].scoredTrials + perArmAggregate[NO_SKILL_ARM].scoredTrials,
      unscoredTrials: perArmAggregate[SKILL_ARM].unscoredTrials + perArmAggregate[NO_SKILL_ARM].unscoredTrials,
      complete: true,
    },
    missingScores: {
      count: missingSlots.length,
      detectedFrom: 'per_task[].<arm>.rewards entries that are null; the count is recomputed and never hardcoded',
      slots: missingSlots,
      byArm: Object.fromEntries(
        ARMS.map((arm) => [arm, missingSlots.filter((slot) => slot.arm === arm).length]),
      ),
      byTask: Object.fromEntries(
        Object.entries(
          missingSlots.reduce((accumulator, slot) => {
            accumulator[slot.task] = (accumulator[slot.task] ?? 0) + 1
            return accumulator
          }, {}),
        ).sort((a, b) => compareTaskIds(a[0], b[0])),
      ),
      legalRange: [REWARD_MIN, REWARD_MAX],
      missingNotZeroNote: MISSING_NOT_ZERO_NOTE,
      boundsNote: MISSING_BOUNDS_NOTE,
    },
    arms: Object.fromEntries(ARMS.map((arm) => [arm, perArmAggregate[arm]])),
    timeoutTaxonomy: {
      definition:
        'per-trial classification from the positionally aligned exceptions[] arrays; a timeout is exception === AgentTimeoutError, and the reward buckets apply only to scored trials, so the buckets are disjoint and exhaustive over the intended slots',
      timeoutStateNote: TIMEOUT_STATE_NOTE,
      buckets: TIMEOUT_BUCKETS.map(([key, label]) => ({ key, label })),
      perArm: Object.fromEntries(
        ARMS.map((arm) => [
          arm,
          {
            ...Object.fromEntries(perArmAggregate[arm].buckets.map((bucket) => [bucket.key, bucket.count])),
            rewardHistogram: perArmAggregate[arm].rewardHistogram,
            exceptions: perArmAggregate[arm].exceptions,
            timeoutScoredFullCount: perArmAggregate[arm].timeoutScoredFullCount,
            timeoutScoredPartialCount: perArmAggregate[arm].timeoutScoredPartialCount,
            timeoutScoredZeroCount: perArmAggregate[arm].timeoutScoredZeroCount,
            timeoutScoredTrials: perArmAggregate[arm].timeoutScoredTrials,
            timeoutTrials: perArmAggregate[arm].timeoutTrials,
            timeoutUnscoredCount: perArmAggregate[arm].timeoutUnscoredCount,
            infraScoredNonzero: perArmAggregate[arm].infraScoredNonzero,
          },
        ]),
      ),
      combined: {
        timeoutTrials:
          perArmAggregate[SKILL_ARM].timeoutTrials + perArmAggregate[NO_SKILL_ARM].timeoutTrials,
        timeoutScoredFullCount:
          perArmAggregate[SKILL_ARM].timeoutScoredFullCount + perArmAggregate[NO_SKILL_ARM].timeoutScoredFullCount,
        timeoutScoredPartialCount:
          perArmAggregate[SKILL_ARM].timeoutScoredPartialCount + perArmAggregate[NO_SKILL_ARM].timeoutScoredPartialCount,
        timeoutScoredZeroCount:
          perArmAggregate[SKILL_ARM].timeoutScoredZeroCount + perArmAggregate[NO_SKILL_ARM].timeoutScoredZeroCount,
        timeoutScoredTrials:
          perArmAggregate[SKILL_ARM].timeoutScoredTrials + perArmAggregate[NO_SKILL_ARM].timeoutScoredTrials,
        timeoutUnscoredCount:
          perArmAggregate[SKILL_ARM].timeoutUnscoredCount + perArmAggregate[NO_SKILL_ARM].timeoutUnscoredCount,
        unscoredNoTimeoutCount: perArmAggregate[SKILL_ARM].unscoredTrials - perArmAggregate[SKILL_ARM].timeoutUnscoredCount
          + perArmAggregate[NO_SKILL_ARM].unscoredTrials
          - perArmAggregate[NO_SKILL_ARM].timeoutUnscoredCount,
      },
    },
    estimates: {
      main: effect,
      mainAuthorityNote:
        'This is the authority view: all scored trials, reduced to per-task per-arm means and then to a task-level equal-weight mean paired effect. It is the same estimator as the paper\'s paired-effect table for this group.',
      postHocNonTimeoutOnly: postHoc,
    },
    sourceInconsistencies: {
      note:
        'Discrepancies observed between the source artifacts are reported, never silently resolved. The per-trial exceptions[] array is used as the machine-readable authority for the taxonomy because it is positionally aligned with rewards[] and seconds[].',
      items: buildSourceInconsistencies({ report, tasks, perArmAggregate, csvByKey }),
    },
    taskInfluence: influence,
    perTask: taskLevel,
    privacy: {
      containsHostPaths: false,
      containsTimestamps: false,
      containsCredentials: false,
      note: 'deterministic artifact: fixed key order, no timestamps, no host paths; regeneration byte-matches',
    },
  }
}

// ── Renderer and file IO ──────────────────────────────────────────────────────

export function renderJson(payload) {
  return `${JSON.stringify(payload, null, 2)}\n`
}

export function readSource(repoRoot) {
  const reportPath = join(repoRoot, SOURCE_REPORT)
  const csvPath = join(repoRoot, SOURCE_COMPANION_CSV)
  const report = loadJson(reportPath, 'source report JSON')
  const csvText = readFileSync(csvPath, 'utf8')
  const { records } = parseCsv(csvText)
  return {
    report,
    csvRecords: records,
    sourceHashes: [
      { path: SOURCE_REPORT, sha256: sha256OfFile(reportPath) },
      { path: SOURCE_COMPANION_CSV, sha256: sha256OfFile(csvPath) },
    ],
  }
}

/** Read the committed source, analyse it and render the JSON. */
export function generate(repoRoot) {
  return renderJson(analyzeQwenSensitivity(readSource(repoRoot)))
}

// ── CLI ───────────────────────────────────────────────────────────────────────

const isMain = process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href
if (isMain) {
  const args = process.argv.slice(2)
  const check = args.includes('--check')
  if (args.some((arg) => arg !== '--check')) {
    console.error('usage: node benchmark/scripts/analyze-qwen-paired-sensitivity.mjs [--check]')
    process.exit(2)
  }
  const repoRoot = fileURLToPath(new URL('../../', import.meta.url))
  let content
  try {
    content = generate(repoRoot)
  } catch (error) {
    console.error(`[analyze-qwen-paired-sensitivity] ${error.message}`)
    process.exit(1)
  }
  const target = join(repoRoot, OUTPUT_PATH)
  if (check) {
    if (!existsSync(target)) {
      console.error(`missing output file: ${OUTPUT_PATH}`)
      console.error('Run: npm run analyze:qwen-sensitivity')
      process.exit(1)
    }
    if (readFileSync(target, 'utf8') !== content) {
      console.error(`out of date: ${OUTPUT_PATH}`)
      console.error('Run: npm run analyze:qwen-sensitivity')
      process.exit(1)
    }
    console.log(`${OUTPUT_PATH} is up to date`)
    process.exit(0)
  }
  writeFileSync(target, content)
  const parsed = JSON.parse(content)
  console.log(
    `wrote ${OUTPUT_PATH} (${parsed.completeness.tasks} tasks, ${parsed.completeness.unscoredTrials} unscored slot(s), delta ${parsed.estimates.main.deltaObserved} in [${parsed.estimates.main.deltaLowerBound}, ${parsed.estimates.main.deltaUpperBound}])`,
  )
}
