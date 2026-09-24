// benchmark/scripts/summarize-paired-subgroups.mjs
//
// Derived, deterministic secondary analysis of an EXISTING paired benchmark run.
//
// It reads one authoritative paired validation report (JSON) plus its CSV
// companion and produces a per-subgroup breakdown along two INDEPENDENT axes:
//
//   1. interaction mode  — the registry `Type` column ("Static" | "Hands-on"),
//                          read from benchmark/README.md AT THE REPORT'S SOURCE
//                          BENCHMARK COMMIT (git objects only). The living
//                          63-task classification on main is never consulted,
//                          because a historical run must keep its historical
//                          classification.
//   2. task prefix       — the first character of the task id (S / M / H). This
//                          is historical naming only; it is NOT a mode and NOT a
//                          difficulty proxy. In the 74af446 registry H4, H6 and
//                          H12 are Static, which is exactly why mode can never be
//                          inferred from the prefix.
//
// Aggregation semantics (mirrors benchmark/scripts/summarize-runs.mjs):
//   - the unit of analysis is the TASK, never the trial;
//   - per task per condition: median of the 3 trials;
//   - subgroup statistics are computed over those 56 task-level medians, so the
//     336 trial rows (168 per condition) are never treated as i.i.d. samples;
//   - a missing reward (null) is NOT 0: it is counted as an unscored trial and
//     excluded from the median; a condition with no scored trial has a null
//     median and is excluded from that subgroup's mean rather than imputed;
//   - usage/duration are summed from the CSV companion. In this benchmark
//     `cached_input_tokens` is a SUBSET of `input_tokens` (see the convention in
//     benchmark/README.md) and is reported separately — it is never added to
//     input. A missing usage cell is reported as a missing count, never as 0.
//
// Determinism: no model calls, no network, no timestamps, no host paths, no
// randomness. Ordering is the registry's declared order; the same inputs and the
// same local git objects always produce byte-identical output.
//
// Usage:
//   node benchmark/scripts/summarize-paired-subgroups.mjs \
//     --report-json benchmark/results/<report>.json \
//     [--group-by interaction-mode|prefix|all] [--json] [--md-out <path>] [--check]
//
// `--check` compares the rendered Markdown with an existing `--md-out` file and
// exits non-zero when it is stale (same convention as
// paper/scripts/generate-benchmark-table.mjs).
import { execFileSync } from 'node:child_process'
import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs'
import { basename, dirname, relative, resolve, sep } from 'node:path'
import { fileURLToPath, pathToFileURL } from 'node:url'
import { extractMarkdownTable } from './validate-task-registry.mjs'

export const CONDITIONS = ['with-skill', 'no-skill']
export const SKILL_CONDITION = 'with-skill'
export const NO_SKILL_CONDITION = 'no-skill'
export const ATTEMPTS_PER_CONDITION = 3
export const EXPECTED_TASKS = 56
export const EXPECTED_JOBS = EXPECTED_TASKS * CONDITIONS.length
export const MAX_DECIMALS = 6

// ── Two independent axes ───────────────────────────────────────────────────────

export const AXES = {
  'interaction-mode': {
    key: 'interaction-mode',
    label: 'Interaction mode',
    heading: '### Interaction mode',
    source: 'benchmark/README.md `Type` column at the source benchmark commit',
    order: ['Static', 'Hands-on'],
    classify: (row) => row.type,
  },
  prefix: {
    key: 'prefix',
    label: 'Prefix',
    heading: '### Prefix',
    source: 'task id first character (historical naming)',
    order: ['S', 'M', 'H'],
    classify: (row) => (typeof row.id === 'string' && row.id.length > 0 ? row.id[0] : ''),
  },
}

// ── Small helpers ──────────────────────────────────────────────────────────────

function isPlainObject(value) {
  return value !== null && typeof value === 'object' && !Array.isArray(value)
}

export function round(value, decimals = MAX_DECIMALS) {
  if (value === null || value === undefined || !Number.isFinite(value)) return null
  const factor = 10 ** decimals
  return Math.round(value * factor) / factor
}

/** Median of the finite numbers in `values`; null for an empty/all-invalid input. */
export function median(values) {
  const numbers = (Array.isArray(values) ? values : []).filter(
    (value) => typeof value === 'number' && Number.isFinite(value),
  )
  if (numbers.length === 0) return null
  const sorted = [...numbers].sort((a, b) => a - b)
  const middle = Math.floor(sorted.length / 2)
  if (sorted.length % 2 === 1) return sorted[middle]
  return (sorted[middle - 1] + sorted[middle]) / 2
}

function mean(values) {
  const numbers = values.filter((value) => typeof value === 'number' && Number.isFinite(value))
  if (numbers.length === 0) return null
  return numbers.reduce((sum, value) => sum + value, 0) / numbers.length
}

function posix(path) {
  return String(path).split(sep).join('/')
}

// ── CSV parsing (minimal RFC-4180 subset, no third-party dependency) ───────────

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
    if (ch === '"') {
      inQuotes = true
    } else if (ch === ',') {
      pushField()
    } else if (ch === '\n') {
      pushRow()
    } else {
      field += ch
    }
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

// ── Source provenance ─────────────────────────────────────────────────────────

/**
 * The report JSON declares the frozen benchmark snapshot the run executed, e.g.
 * `"74af446 (anti-cheat stripped, CRLF normalized, digest FROM rewritten)"`.
 * The first hex token is the source commit whose registry governs the analysis.
 */
export function parseSourceCommit(protocol) {
  const snapshot = protocol?.task_source_snapshot
  if (typeof snapshot !== 'string' || snapshot.trim() === '') {
    throw new Error('report/source mismatch: protocol.task_source_snapshot is missing, so the source benchmark commit cannot be derived')
  }
  const match = /(?:^|[^0-9a-f])([0-9a-f]{7,40})(?![0-9a-f])/i.exec(snapshot.trim())
  if (match === null) {
    throw new Error(`report/source mismatch: cannot derive a hex source benchmark commit from ${JSON.stringify(snapshot.slice(0, 80))}`)
  }
  return match[1].toLowerCase()
}

/** A report file id must match the report's own declared `report` field. */
export function assertReportIdentity(report, expectedId) {
  const declared = report?.report
  if (typeof declared !== 'string' || declared === '') {
    throw new Error(`report/source mismatch: report has no "report" identity field (expected ${JSON.stringify(expectedId)})`)
  }
  if (declared !== expectedId) {
    throw new Error(`report/source mismatch: report field ${JSON.stringify(declared)} does not match file id ${JSON.stringify(expectedId)}`)
  }
}

// ── Pinned registry (git objects at the source commit) ────────────────────────

/**
 * Parse the canonical `Task | Type | ...` table out of a benchmark/README.md
 * body. Rows keep their declared order. Throws on structural drift, duplicate
 * ids, and any Type outside Static | Hands-on ("unknown mode").
 */
export function loadRegistryFromText(text, sourceLabel) {
  const table = extractMarkdownTable(text)
  if (table === null) {
    throw new Error(`registry at ${sourceLabel} has no task table (header cell "Task" not found)`)
  }
  const rows = []
  const seen = new Set()
  for (const cells of table) {
    const id = String(cells[0] ?? '').replaceAll('`', '').trim()
    if (id === '') continue
    if (cells.length !== 3) {
      throw new Error(`registry at ${sourceLabel}: task "${id}" has ${cells.length} cells (expected id | Type | description)`)
    }
    const type = String(cells[1] ?? '').trim()
    if (type !== 'Static' && type !== 'Hands-on') {
      throw new Error(`registry at ${sourceLabel}: task "${id}" has unknown interaction mode ${JSON.stringify(type)} (expected Static | Hands-on)`)
    }
    if (seen.has(id)) {
      throw new Error(`registry at ${sourceLabel}: duplicate task "${id}"`)
    }
    seen.add(id)
    rows.push({ id, type })
  }
  if (rows.length === 0) {
    throw new Error(`registry at ${sourceLabel} produced no task rows`)
  }
  return rows
}

/**
 * Read benchmark/README.md at the pinned commit with `git show`, never the
 * working tree. A commit missing from the local clone is a hard error (fetch the
 * commit explicitly instead of silently falling back to the living registry).
 */
export function loadPinnedRegistry(repoRoot, commit) {
  let text
  try {
    text = execFileSync('git', ['show', `${commit}:benchmark/README.md`], {
      cwd: repoRoot,
      encoding: 'utf8',
      maxBuffer: 64 * 1024 * 1024,
    })
  } catch (error) {
    const detail = typeof error.stderr === 'string' && error.stderr.trim() !== '' ? error.stderr.trim() : error.message
    throw new Error(`report/source mismatch: cannot read benchmark/README.md at source benchmark commit ${commit}: ${detail}`)
  }
  return loadRegistryFromText(text, `benchmark/README.md at ${commit}`)
}

/** Resolve the declared commit to its full SHA (deterministic provenance line). */
export function resolveCommit(repoRoot, commit) {
  try {
    return execFileSync('git', ['rev-parse', `${commit}^{commit}`], { cwd: repoRoot, encoding: 'utf8' }).trim()
  } catch {
    throw new Error(`report/source mismatch: source benchmark commit ${commit} is not resolvable in this clone`)
  }
}

/**
 * The pinned registry must describe exactly the report's task set, in its own
 * declared order. A registry with extra rows (e.g. the current 63-task living
 * classification) is rejected rather than silently narrowed.
 */
export function validateRegistryCoverage(registryRows, taskIds, sourceLabel) {
  const registryIds = registryRows.map((row) => row.id)
  if (registryIds.length !== taskIds.length) {
    throw new Error(`registry at ${sourceLabel} has ${registryIds.length} tasks but the report has ${taskIds.length}; refusing to mix a living classification into a historical run`)
  }
  const registrySet = new Set(registryIds)
  const reportSet = new Set(taskIds)
  const missing = taskIds.filter((id) => !registrySet.has(id))
  if (missing.length > 0) {
    throw new Error(`registry at ${sourceLabel} is missing report tasks: ${missing.join(', ')}`)
  }
  const unknown = registryIds.filter((id) => !reportSet.has(id))
  if (unknown.length > 0) {
    throw new Error(`registry at ${sourceLabel} declares tasks absent from the report: ${unknown.join(', ')}`)
  }
  return registryRows
}

// ── Report / CSV validation ───────────────────────────────────────────────────

function rewardList(entry, condition, task) {
  const payload = entry?.[condition]
  if (!isPlainObject(payload)) {
    throw new Error(`malformed report: task "${task}" has no "${condition}" condition object`)
  }
  const rewards = payload.rewards
  if (!Array.isArray(rewards)) {
    throw new Error(`malformed report: task "${task}" ${condition} has no rewards array`)
  }
  if (rewards.length !== ATTEMPTS_PER_CONDITION) {
    throw new Error(`malformed report: task "${task}" ${condition} has ${rewards.length} attempts (expected ${ATTEMPTS_PER_CONDITION})`)
  }
  for (const reward of rewards) {
    if (reward === null) continue // a legitimately unscored trial — never 0
    if (typeof reward !== 'number' || !Number.isFinite(reward) || reward < 0 || reward > 1) {
      throw new Error(`malformed report: task "${task}" ${condition} has an invalid reward ${JSON.stringify(reward)} (expected null or a number in [0, 1])`)
    }
  }
  const seconds = payload.seconds
  if (Array.isArray(seconds) && seconds.length !== ATTEMPTS_PER_CONDITION) {
    throw new Error(`malformed report: task "${task}" ${condition} has ${seconds.length} trial seconds (expected ${ATTEMPTS_PER_CONDITION})`)
  }
  return rewards
}

export function validateReport(report, { expectedTasks = EXPECTED_TASKS, attempts = ATTEMPTS_PER_CONDITION } = {}) {
  if (!isPlainObject(report)) throw new Error('malformed report: expected a JSON object')
  if (!isPlainObject(report.protocol)) throw new Error('malformed report: missing "protocol" object')
  if (attempts !== ATTEMPTS_PER_CONDITION) {
    throw new Error(`this analysis is defined for ${ATTEMPTS_PER_CONDITION} attempts per condition, got ${attempts}`)
  }
  const sourceCommit = parseSourceCommit(report.protocol)
  const entries = report.per_task
  if (!Array.isArray(entries)) throw new Error('malformed report: missing "per_task" array')
  const seen = new Set()
  const taskIds = []
  const scoredTrials = { [SKILL_CONDITION]: 0, [NO_SKILL_CONDITION]: 0 }
  const unscoredTrials = { [SKILL_CONDITION]: 0, [NO_SKILL_CONDITION]: 0 }
  for (const entry of entries) {
    if (!isPlainObject(entry) || typeof entry.task !== 'string' || entry.task.trim() === '') {
      throw new Error('malformed report: every per_task entry needs a non-empty "task" id')
    }
    const task = entry.task
    if (seen.has(task)) throw new Error(`malformed report: duplicate task "${task}"`)
    seen.add(task)
    taskIds.push(task)
    for (const condition of CONDITIONS) {
      for (const reward of rewardList(entry, condition, task)) {
        if (reward === null) unscoredTrials[condition] += 1
        else scoredTrials[condition] += 1
      }
    }
  }
  if (entries.length !== expectedTasks) {
    throw new Error(`incomplete report: ${entries.length} tasks present, expected ${expectedTasks}`)
  }
  return {
    sourceCommit,
    taskIds,
    taskCount: entries.length,
    jobs: entries.length * CONDITIONS.length,
    trials: entries.length * CONDITIONS.length * ATTEMPTS_PER_CONDITION,
    attemptsPerCondition: ATTEMPTS_PER_CONDITION,
    scoredTrials,
    unscoredTrials,
  }
}

/** Cross-check the CSV companion against the JSON report, then index it. */
export function validateCsvCompanion(records, report) {
  const byCondition = new Map()
  for (const record of records) {
    const key = `${record.task}|${record.condition}`
    if (byCondition.has(key)) throw new Error(`malformed CSV: duplicate row for ${key}`)
    byCondition.set(key, record)
  }
  for (const entry of report.per_task) {
    for (const condition of CONDITIONS) {
      const key = `${entry.task}|${condition}`
      const record = byCondition.get(key)
      if (record === undefined) throw new Error(`malformed CSV: missing row for ${key}`)
      const csvRewards = String(record.rewards ?? '')
        .split('|')
        .map((cell) => (cell.trim() === '-' || cell.trim() === '' || cell.trim() === 'null' ? null : Number(cell)))
      const jsonRewards = entry[condition].rewards
      if (JSON.stringify(csvRewards) !== JSON.stringify(jsonRewards)) {
        throw new Error(`report/source mismatch: CSV rewards for ${key} (${record.rewards}) disagree with the JSON report (${jsonRewards.join('|')})`)
      }
      const seconds = Array.isArray(entry[condition].seconds) ? entry[condition].seconds : []
      const jsonSeconds = seconds.filter((value) => typeof value === 'number').reduce((sum, value) => sum + value, 0)
      const csvSeconds = parseUsageCell(record.trial_seconds_sum)
      if (csvSeconds !== null && seconds.length > 0 && Math.abs(csvSeconds - jsonSeconds) > 0.01) {
        throw new Error(`report/source mismatch: CSV trial seconds for ${key} (${csvSeconds}) disagree with the JSON report (${round(jsonSeconds, 3)})`)
      }
    }
  }
  for (const record of records) {
    if (!report.per_task.some((entry) => entry.task === record.task)) {
      throw new Error(`malformed CSV: row for unknown task "${record.task}"`)
    }
  }
  return byCondition
}

// ── Aggregation: per task per condition → median of 3 ────────────────────────

function summarizeCondition(rewards) {
  const scored = rewards.filter((reward) => typeof reward === 'number' && Number.isFinite(reward))
  return {
    median: median(scored),
    scoredTrials: scored.length,
    unscoredTrials: rewards.length - scored.length,
    perfectTrials: scored.filter((reward) => reward === 1).length,
  }
}

export function aggregateTasks(report) {
  const byTask = new Map()
  for (const entry of report.per_task) {
    const skill = summarizeCondition(entry[SKILL_CONDITION].rewards)
    const noSkill = summarizeCondition(entry[NO_SKILL_CONDITION].rewards)
    const delta = skill.median === null || noSkill.median === null ? null : round(skill.median - noSkill.median)
    byTask.set(entry.task, { task: entry.task, [SKILL_CONDITION]: skill, [NO_SKILL_CONDITION]: noSkill, delta })
  }
  return byTask
}

/**
 * The original report's headline paired comparison reduces each trial
 * independently ("with-skill better on 7 tasks ..."): a task's trial mean is used
 * as the task value. This derived analysis reduces each task to its median first,
 * so its positive/tie/negative counts differ by construction. Both views are
 * reported so the difference is visible instead of looking like a contradiction.
 */
export function meanBasedPairing(report) {
  let positive = 0
  let tie = 0
  let negative = 0
  for (const entry of report.per_task) {
    const meanOf = (condition) => {
      const rewards = entry[condition].rewards.filter((reward) => typeof reward === 'number' && Number.isFinite(reward))
      return rewards.length === 0 ? null : rewards.reduce((sum, reward) => sum + reward, 0) / rewards.length
    }
    const skill = meanOf(SKILL_CONDITION)
    const noSkill = meanOf(NO_SKILL_CONDITION)
    if (skill === null || noSkill === null) continue
    const delta = skill - noSkill
    if (delta > 0) positive += 1
    else if (delta < 0) negative += 1
    else tie += 1
  }
  return { positive, tie, negative }
}

function sumUsage(conditionRows) {
  const fields = [
    ['input', 'input_tokens'],
    ['cachedInput', 'cached_input_tokens'],
    ['output', 'output_tokens'],
    ['seconds', 'trial_seconds_sum'],
  ]
  const present = { input: 0, cachedInput: 0, output: 0, seconds: 0 }
  const counts = { input: 0, cachedInput: 0, output: 0, seconds: 0 }
  let usageMissingRows = 0
  for (const record of conditionRows) {
    let rowMissing = false
    for (const [field, column] of fields) {
      const value = parseUsageCell(record[column])
      if (value === null) {
        if (field !== 'seconds') rowMissing = true
        continue
      }
      present[field] += value
      counts[field] += 1
    }
    if (rowMissing) usageMissingRows += 1
  }
  const totals = { input: null, cachedInput: null, output: null, seconds: null }
  for (const [field] of fields) {
    totals[field] = counts[field] === 0 ? null : present[field]
  }
  return {
    inputTokens: totals.input === null ? null : Math.round(totals.input),
    cachedInputTokens: totals.cachedInput === null ? null : Math.round(totals.cachedInput),
    outputTokens: totals.output === null ? null : Math.round(totals.output),
    trialSecondsSum: totals.seconds === null ? null : round(totals.seconds, 3),
    usageMissingRows,
    usageComplete: usageMissingRows === 0,
  }
}

/**
 * Subgroup aggregates for one axis. The task list of every subgroup is the
 * registry's declared order, so the output ordering never depends on hashing or
 * on the (alphabetical) report JSON order.
 */
export function summarizeGroups({ axis, registryRows, taskAggregates, csvByCondition }) {
  const definition = AXES[axis]
  if (definition === undefined) throw new Error(`unknown --group-by value: ${axis}`)
  for (const row of registryRows) {
    const key = definition.classify(row)
    if (!definition.order.includes(key)) {
      throw new Error(`registry task "${row.id}" has an unknown ${definition.label.toLowerCase()} value ${JSON.stringify(key)} (expected ${definition.order.join(' | ')})`)
    }
  }
  const groups = []
  for (const key of definition.order) {
    const taskIds = registryRows.filter((row) => definition.classify(row) === key).map((row) => row.id)
    if (taskIds.length === 0) {
      groups.push({
        key,
        label: key,
        taskCount: 0,
        taskIds: [],
        resolvedTasks: 0,
        skillMedianMean: null,
        noSkillMedianMean: null,
        pairedMeanDelta: null,
        pairedMedianDelta: null,
        positive: 0,
        tie: 0,
        negative: 0,
        perfectTasksSkill: 0,
        perfectTasksNoSkill: 0,
        unscoredTrials: 0,
        inputTokens: null,
        cachedInputTokens: null,
        outputTokens: null,
        trialSecondsSum: null,
        usageMissingRows: 0,
        usageComplete: true,
      })
      continue
    }
    const entries = taskIds.map((taskId) => {
      const entry = taskAggregates.get(taskId)
      if (entry === undefined) throw new Error(`internal error: no aggregate for task "${taskId}"`)
      return entry
    })
    const skillMedians = entries.map((entry) => entry[SKILL_CONDITION].median).filter((value) => value !== null)
    const noSkillMedians = entries.map((entry) => entry[NO_SKILL_CONDITION].median).filter((value) => value !== null)
    const deltas = entries.map((entry) => entry.delta).filter((value) => value !== null)
    const conditionRows = []
    for (const taskId of taskIds) {
      for (const condition of CONDITIONS) {
        const record = csvByCondition.get(`${taskId}|${condition}`)
        if (record !== undefined) conditionRows.push(record)
      }
    }
    const usage = sumUsage(conditionRows)
    groups.push({
      key,
      label: key,
      taskCount: taskIds.length,
      taskIds,
      resolvedTasks: deltas.length,
      skillMedianMean: round(mean(skillMedians)),
      noSkillMedianMean: round(mean(noSkillMedians)),
      pairedMeanDelta: round(mean(deltas)),
      pairedMedianDelta: round(median(deltas)),
      positive: deltas.filter((delta) => delta > 0).length,
      tie: deltas.filter((delta) => delta === 0).length,
      negative: deltas.filter((delta) => delta < 0).length,
      perfectTasksSkill: entries.filter((entry) => entry[SKILL_CONDITION].median === 1).length,
      perfectTasksNoSkill: entries.filter((entry) => entry[NO_SKILL_CONDITION].median === 1).length,
      unscoredTrials: entries.reduce(
        (sum, entry) => sum + entry[SKILL_CONDITION].unscoredTrials + entry[NO_SKILL_CONDITION].unscoredTrials,
        0,
      ),
      ...usage,
    })
  }
  return { axis, label: definition.label, heading: definition.heading, source: definition.source, order: definition.order, groups }
}

// ── Derived breakdown assembly ────────────────────────────────────────────────

export function buildBreakdown({ report, csvByCondition, registryRows, source, axes = ['interaction-mode', 'prefix'] }) {
  const validation = validateReport(report)
  const taskAggregates = aggregateTasks(report)
  const breakdownAxes = {}
  for (const axis of axes) {
    breakdownAxes[axis] = summarizeGroups({ axis, registryRows, taskAggregates, csvByCondition })
  }
  const resolvedTasks = report.per_task.filter((entry) => taskAggregates.get(entry.task).delta !== null).length
  const allDeltas = [...taskAggregates.values()].map((entry) => entry.delta).filter((value) => value !== null)
  const medianBasedPairing = {
    positive: allDeltas.filter((delta) => delta > 0).length,
    tie: allDeltas.filter((delta) => delta === 0).length,
    negative: allDeltas.filter((delta) => delta < 0).length,
  }
  const completeness = {
    tasks: validation.taskCount,
    tasksExpected: EXPECTED_TASKS,
    jobs: validation.jobs,
    jobsExpected: EXPECTED_JOBS,
    attemptsPerCondition: validation.attemptsPerCondition,
    trials: validation.trials,
    scoredTrials: validation.scoredTrials,
    unscoredTrials: validation.unscoredTrials,
    resolvedPairedTasks: resolvedTasks,
    complete: validation.taskCount === EXPECTED_TASKS && validation.jobs === EXPECTED_JOBS && resolvedTasks === EXPECTED_TASKS,
  }
  return {
    analysis: 'qwen-paired-subgroups',
    analysisKind: 'derived-secondary-analysis',
    modelCalls: 0,
    sourceReport: source.sourceReport,
    sourceCompanionCsv: source.sourceCompanionCsv,
    sourceReportMarkdown: source.sourceReportMarkdown,
    sourceBenchmarkCommit: validation.sourceCommit,
    sourceBenchmarkCommitFull: source.sourceBenchmarkCommitFull,
    registrySource: `git show ${validation.sourceCommit}:benchmark/README.md (pinned; the living 63-task classification is never consulted)`,
    aggregation: `median of the ${ATTEMPTS_PER_CONDITION} trials per task per condition, then subgroup statistics over the ${EXPECTED_TASKS} task-level medians; the ${validation.trials} trial rows are never treated as independent`,
    meanBasedPairing: meanBasedPairing(report),
    medianBasedPairing,
    completeness,
    taskAggregates,
    axes: breakdownAxes,
  }
}

// ── Renderers ─────────────────────────────────────────────────────────────────

function fmtNumber(value, decimals = MAX_DECIMALS) {
  if (value === null || value === undefined) return '—'
  if (typeof value !== 'number') return String(value)
  const fixed = value.toFixed(decimals)
  return fixed.includes('.') ? fixed.replace(/0+$/, '').replace(/\.$/, '') : fixed
}

function fmtTokens(value, missingRows) {
  if (value === null || value === undefined) return '—'
  const text = String(value)
  return missingRows > 0 ? `${text}★` : text
}

function fmtSeconds(value) {
  if (value === null || value === undefined) return '—'
  return `${value.toFixed(3)} s`
}

function deltaRows(breakdown) {
  const entries = [...breakdown.taskAggregates.values()]
  const positives = entries
    .filter((entry) => entry.delta !== null && entry.delta > 0)
    .sort((a, b) => b.delta - a.delta || a.task.localeCompare(b.task))
    .slice(0, 5)
  const negatives = entries
    .filter((entry) => entry.delta !== null && entry.delta < 0)
    .sort((a, b) => a.delta - b.delta || a.task.localeCompare(b.task))
    .slice(0, 5)
  return { positives, negatives }
}

export function renderJson(breakdown) {
  const axes = {}
  for (const [key, axis] of Object.entries(breakdown.axes)) {
    axes[key] = {
      axis: axis.axis,
      label: axis.label,
      source: axis.source,
      order: axis.order,
      groups: axis.groups.map((group) => ({ ...group })),
    }
  }
  const payload = {
    analysis: breakdown.analysis,
    analysisKind: breakdown.analysisKind,
    modelCalls: breakdown.modelCalls,
    sourceReport: breakdown.sourceReport,
    sourceCompanionCsv: breakdown.sourceCompanionCsv,
    sourceBenchmarkCommit: breakdown.sourceBenchmarkCommit,
    sourceBenchmarkCommitFull: breakdown.sourceBenchmarkCommitFull,
    registrySource: breakdown.registrySource,
    aggregation: breakdown.aggregation,
    pairing: {
      medianBasedTaskCounts: breakdown.medianBasedPairing,
      trialMeanBasedTaskCounts: breakdown.meanBasedPairing,
    },
    completeness: breakdown.completeness,
    axes,
  }
  return `${JSON.stringify(payload, null, 2)}\n`
}

export function renderMarkdown(breakdown) {
  const lines = []
  const completeness = breakdown.completeness
  lines.push('# Qwen3.8-27B (medium) paired run — derived subgroup breakdown')
  lines.push('')
  lines.push('> **DERIVED SECONDARY ANALYSIS — NO NEW MODEL RUNS.**')
  lines.push('>')
  lines.push('> This file is a deterministic derived analysis of an already published paired run.')
  lines.push(`> It is regenerated from \`${breakdown.sourceReport}\` and \`${breakdown.sourceCompanionCsv}\``)
  lines.push('> by `benchmark/scripts/summarize-paired-subgroups.mjs`. It runs **no model calls and no new')
  lines.push('> benchmark trials**, and it does not change, recompute or supersede any number in the original report.')
  lines.push('> Every statement below is **observed, descriptive and scoped to this historical paired run**.')
  lines.push('')
  lines.push('## Provenance')
  lines.push('')
  lines.push(`- Original report: [\`${breakdown.sourceReportMarkdown}\`](./${basename(breakdown.sourceReportMarkdown)}) (JSON + CSV companions).`)
  lines.push(`- Source benchmark commit: \`${breakdown.sourceBenchmarkCommit}\` (full \`${breakdown.sourceBenchmarkCommitFull}\`).`)
  lines.push(`- Registry authority: \`${breakdown.registrySource}\`.`)
  lines.push(`- Completeness: **${completeness.jobs}/${completeness.jobsExpected} jobs**, **${completeness.tasks}/${completeness.tasksExpected} tasks**, **${completeness.attemptsPerCondition} attempts per task per condition** (${completeness.trials} trials). Scored trials: ${CONDITIONS.map((c) => `${c} ${completeness.scoredTrials[c]}`).join(', ')}; unscored (retained, never imputed as 0): ${CONDITIONS.map((c) => `${c} ${completeness.unscoredTrials[c]}`).join(', ')}.`)
  lines.push(`- Aggregation: ${breakdown.aggregation}.`)
  lines.push('')
  lines.push('## Method')
  lines.push('')
  lines.push(`The unit of analysis is the task, not the trial. For every task and condition the three trials are`)
  lines.push(`reduced to their **median**, giving ${completeness.tasks} task-level values per condition; subgroup`)
  lines.push('statistics are then computed over those task-level values. This mirrors the median-of-3 semantics of')
  lines.push('`benchmark/scripts/summarize-runs.mjs`. The 168 trial rows per condition are **never treated as')
  lines.push('independent observations**, so the subgroup numbers below are descriptive summaries of the same')
  lines.push('historical task set, not new significance tests.')
  lines.push('')
  lines.push('A `paired Δ` for a task is `with-skill median − no-skill median`. A task whose condition has no scored')
  lines.push('trial has a `null` median and is excluded from that subgroup mean instead of being imputed as 0.')
  lines.push('"Perfect tasks" counts tasks whose median-of-3 equals 1.0 (at least two of three trials scored 100).')
  lines.push('')
  const meanBased = breakdown.meanBasedPairing
  const medianBased = breakdown.medianBasedPairing
  lines.push('**Reconciliation with the original report.** The original headline ("with-skill better on 7 tasks,')
  lines.push(`no-skill better on 18, identical on 31") reduces each task to its trial mean; across the 56 tasks that view`)
  lines.push(`gives ${meanBased.positive} positive / ${meanBased.tie} tied / ${meanBased.negative} negative. This derived analysis reduces each task to its`)
  lines.push(`median first, giving ${medianBased.positive} positive / ${medianBased.tie} tied / ${medianBased.negative} negative here — the tie count is higher because`)
  lines.push('median-of-3 collapses most trial noise. The original report stays authoritative for its own aggregation;')
  lines.push('neither view replaces the other and neither is a significance test.')
  lines.push('')
  lines.push('The two axes are **independent of each other**: interaction mode comes from the pinned registry, and the')
  lines.push('id prefix is historical naming only.')
  lines.push('')
  for (const axisKey of ['interaction-mode', 'prefix']) {
    const axis = breakdown.axes[axisKey]
    if (axis === undefined) continue
    lines.push(axis.heading)
    lines.push('')
    lines.push(`Source: ${axis.source}.`)
    lines.push('')
    lines.push('| Subgroup | Tasks | Skill median-task mean | No-skill median-task mean | Paired mean Δ | Paired median Δ | + / = / − | Perfect tasks (skill / no-skill) | Input tokens | Cached input (subset) | Output tokens | Summed trial seconds | Missing usage |')
    lines.push('| --- | ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: |')
    for (const group of axis.groups) {
      lines.push(
        `| ${group.label} | ${group.taskCount} | ${fmtNumber(group.skillMedianMean)} | ${fmtNumber(group.noSkillMedianMean)} | ${fmtNumber(group.pairedMeanDelta)} | ${fmtNumber(group.pairedMedianDelta)} | ${group.positive} / ${group.tie} / ${group.negative} | ${group.perfectTasksSkill} / ${group.perfectTasksNoSkill} | ${fmtTokens(group.inputTokens, group.usageMissingRows)} | ${fmtTokens(group.cachedInputTokens, group.usageMissingRows)} | ${fmtTokens(group.outputTokens, group.usageMissingRows)} | ${fmtSeconds(group.trialSecondsSum)} | ${group.usageMissingRows} |`,
      )
    }
    lines.push('')
    if (axisKey === 'interaction-mode') {
      lines.push('Interaction mode is the registry `Type` value at the pinned commit: `Static` tasks are written')
      lines.push('exams, `Hands-on` tasks require installing and running the plugin. It is not inferred from the task id.')
      lines.push('')
    } else {
      lines.push('Prefixes are **historical id naming**, not a mode and not a difficulty proxy:')
      lines.push('')
      lines.push('- **`S != automatically Static`** — the mode of an S task is whatever the pinned registry says; this')
      lines.push('  breakdown reads that column and never the prefix.')
      lines.push('- **`H != automatically Hands-on`** — in the `74af446` registry, `H4-tsbuildinfo-trap`,')
      lines.push('  `H6-remote-error-trap` and `H12-remote-result-boundary-trap` are `Static` despite the H prefix.')
      lines.push('- **`M != Medium difficulty`** — M is an id prefix only. Reasoning effort was `medium` for *every*')
      lines.push('  trial by protocol, so M carries no difficulty semantics in this run.')
      lines.push('')
    }
  }
  const { positives, negatives } = deltaRows(breakdown)
  lines.push('## Largest descriptive per-task Δ (optional detail)')
  lines.push('')
  lines.push('These rows are descriptive observations inside this historical run. They are not a claim about why a')
  lines.push('difference appeared, and no subgroup is redefined from them.')
  lines.push('')
  lines.push('| Direction | Task | Interaction mode | Prefix | Skill median | No-skill median | Δ |')
  lines.push('| --- | --- | --- | --- | ---: | ---: | ---: |')
  const modeOf = new Map()
  const prefixAxis = breakdown.axes['prefix']
  if (prefixAxis !== undefined) {
    for (const group of prefixAxis.groups) for (const id of group.taskIds) modeOf.set(id, group.label)
  }
  const interactionAxis = breakdown.axes['interaction-mode']
  const modeByTask = new Map()
  if (interactionAxis !== undefined) {
    for (const group of interactionAxis.groups) for (const id of group.taskIds) modeByTask.set(id, group.label)
  }
  for (const entry of positives) {
    lines.push(`| positive | ${entry.task} | ${modeByTask.get(entry.task) ?? '—'} | ${modeOf.get(entry.task) ?? '—'} | ${fmtNumber(entry[SKILL_CONDITION].median)} | ${fmtNumber(entry[NO_SKILL_CONDITION].median)} | ${fmtNumber(entry.delta)} |`)
  }
  for (const entry of negatives) {
    lines.push(`| negative | ${entry.task} | ${modeByTask.get(entry.task) ?? '—'} | ${modeOf.get(entry.task) ?? '—'} | ${fmtNumber(entry[SKILL_CONDITION].median)} | ${fmtNumber(entry[NO_SKILL_CONDITION].median)} | ${fmtNumber(entry.delta)} |`)
  }
  lines.push('')
  lines.push('## Token and duration accounting')
  lines.push('')
  lines.push('Token and duration figures are summed from the CSV companion, grouped by the same task sets as the')
  lines.push('score columns. `Cached input` is a **subset** of `Input tokens` (the convention documented in')
  lines.push('`benchmark/README.md`): it is reported separately and is **never added** to input. A `★` marks a')
  lines.push('subgroup whose sum is incomplete because at least one task/condition row has a missing usage cell; a')
  lines.push('missing value is reported as a missing count, never written as 0. Summed trial seconds are the native')
  lines.push('Harbor trial durations and are additive across concurrent jobs.')
  lines.push('')
  lines.push('## Scientific boundary')
  lines.push('')
  lines.push('- This is a **derived secondary analysis** of one existing 56-task paired run; no model calls and no')
  lines.push('  benchmark trials were executed to produce it.')
  lines.push('- It is **not** a formal study result and **not** a paper effect claim.')
  lines.push('- Findings are `observed`, `descriptive`, and `within this historical paired run`; they are not causal.')
  lines.push('  The data here do not show that the skill "works better on Hands-on" or worse on any subgroup; subgroup')
  lines.push('  behaviour must not redefine the main experiment.')
  lines.push('- No benchmark task, grader, fixture, skill or formal-run flag was modified by this analysis.')
  lines.push('- Numbers for a subgroup are only comparable within the same paired run and the same source commit')
  lines.push(`  (\`${breakdown.sourceBenchmarkCommit}\`).`)
  lines.push('- A separate deterministic analysis of this same run quantifies the timeout/termination taxonomy and')
  lines.push('  the missing-score sensitivity (including the single unscored trial): see')
  lines.push('  [`qwen-paired-sensitivity.json`](./qwen-paired-sensitivity.json) and')
  lines.push('  `benchmark/scripts/analyze-qwen-paired-sensitivity.mjs`. It changes none of the numbers above.')
  while (lines.length > 0 && lines[lines.length - 1] === '') lines.pop()
  return `${lines.join('\n')}\n`
}

// ── CLI ────────────────────────────────────────────────────────────────────────

export function parseArgs(argv) {
  const options = { reportJson: null, groupBy: 'all', json: false, mdOut: null, check: false }
  for (let i = 0; i < argv.length; i += 1) {
    const arg = argv[i]
    if (arg === '--report-json') {
      const value = argv[++i]
      if (value === undefined || value.startsWith('--')) throw new Error('--report-json requires a path')
      options.reportJson = value
      continue
    }
    if (arg === '--group-by') {
      const value = argv[++i]
      if (value !== 'interaction-mode' && value !== 'prefix' && value !== 'all') {
        throw new Error(`--group-by must be interaction-mode, prefix or all, got: ${value ?? '(missing)'}`)
      }
      options.groupBy = value
      continue
    }
    if (arg === '--md-out') {
      const value = argv[++i]
      if (value === undefined || value.startsWith('--')) throw new Error('--md-out requires a path')
      options.mdOut = value
      continue
    }
    if (arg === '--json') {
      options.json = true
      continue
    }
    if (arg === '--check') {
      options.check = true
      continue
    }
    throw new Error(`unknown argument: ${arg}`)
  }
  if (options.reportJson === null) throw new Error('--report-json <path> is required')
  if (options.check && options.mdOut === null) throw new Error('--check requires --md-out <path>')
  return options
}

function loadJson(path, label) {
  if (!existsSync(path)) throw new Error(`${label} not found: ${path}`)
  try {
    return JSON.parse(readFileSync(path, 'utf8'))
  } catch (error) {
    throw new Error(`${label} is not valid JSON: ${path} (${error.message})`)
  }
}

export function companionCsvPath(reportJsonPath) {
  if (!/\.json$/i.test(reportJsonPath)) {
    throw new Error(`--report-json must end in .json so its CSV companion can be derived: ${reportJsonPath}`)
  }
  return reportJsonPath.replace(/\.json$/i, '.csv')
}

export function run(argv, { cwd = process.cwd() } = {}) {
  const options = parseArgs(argv)
  let repoRoot
  try {
    repoRoot = execFileSync('git', ['rev-parse', '--show-toplevel'], { cwd, encoding: 'utf8' }).trim()
  } catch {
    throw new Error('not inside a git repository (the pinned registry is resolved from local git objects)')
  }
  const reportPath = resolve(cwd, options.reportJson)
  const report = loadJson(reportPath, 'report JSON')
  const reportId = basename(reportPath).replace(/\.json$/i, '')
  assertReportIdentity(report, reportId)
  const csvPath = companionCsvPath(reportPath)
  if (!existsSync(csvPath)) throw new Error(`CSV companion not found: ${csvPath}`)
  const { records } = parseCsv(readFileSync(csvPath, 'utf8'))
  const validation = validateReport(report)
  const csvByCondition = validateCsvCompanion(records, report)
  const registryRows = loadPinnedRegistry(repoRoot, validation.sourceCommit)
  validateRegistryCoverage(registryRows, validation.taskIds, `benchmark/README.md at ${validation.sourceCommit}`)
  const axes = options.groupBy === 'all' ? ['interaction-mode', 'prefix'] : [options.groupBy]
  const breakdown = buildBreakdown({
    report,
    csvByCondition,
    registryRows,
    axes,
    source: {
      sourceReport: posix(relative(repoRoot, reportPath)),
      sourceCompanionCsv: posix(relative(repoRoot, csvPath)),
      sourceReportMarkdown: `${reportId}.md`,
      sourceBenchmarkCommitFull: resolveCommit(repoRoot, validation.sourceCommit),
    },
  })
  return { options, breakdown, markdown: renderMarkdown(breakdown), json: renderJson(breakdown) }
}

const isMain = process.argv[1] && import.meta.url === pathToFileURL(resolve(process.argv[1])).href
if (isMain) {
  let result
  try {
    result = run(process.argv.slice(2))
  } catch (error) {
    console.error(`[summarize-paired-subgroups] ${error.message}`)
    process.exit(1)
  }
  const { options, markdown, json } = result
  if (options.check) {
    const target = resolve(process.cwd(), options.mdOut)
    if (!existsSync(target)) {
      console.error(`[summarize-paired-subgroups] missing generated report: ${options.mdOut}`)
      process.exit(1)
    }
    if (readFileSync(target, 'utf8') !== markdown) {
      console.error(`[summarize-paired-subgroups] out of date: ${options.mdOut}`)
      console.error('Run: node benchmark/scripts/summarize-paired-subgroups.mjs --report-json <report.json> --md-out <report.md>')
      process.exit(1)
    }
    console.log(`[summarize-paired-subgroups] OK: ${options.mdOut} is up to date`)
  } else if (options.json) {
    process.stdout.write(json)
  } else if (options.mdOut !== null) {
    const target = resolve(process.cwd(), options.mdOut)
    mkdirSync(dirname(target), { recursive: true })
    writeFileSync(target, markdown)
    console.log(`[summarize-paired-subgroups] wrote ${options.mdOut}`)
  } else {
    process.stdout.write(markdown)
  }
}
