// benchmark/scripts/summarize-runs.mjs
//
// Deterministic Harbor run aggregator: turns real Harbor `result.json` files into a
// reproducible benchmark summary. It extracts rewards from the raw trial records
// instead of trusting Harbor's built-in aggregate mean, which is misleading when a
// job contains stopped/unscored trials or when a task ran in a separate job.
//
// Two Harbor result.json shapes are supported:
//   1. trial-level (has `verifier_result`): one trial record per file;
//   2. job-level   (has `stats.evals`): expanded into per-trial records from
//      `reward_stats.reward` and `exception_stats`.
// Anything else is an unsupported schema and fails loudly.
//
// Semantics:
//   - only records with a verifier reward are scored; 0 <= reward <= 1 (else fail);
//   - no-reward / exception / cancelled records are anomalies, never scored as 0;
//   - a scored trial that also records an execution exception keeps its reward and
//     is flagged as an anomaly (real runs produced AgentTimeoutError with a 1.0
//     verifier report);
//   - repeated trials of the same task aggregate per task (mean/median/min/max/
//     perfect), the last run does not overwrite the earlier ones;
//   - the exact same source file (or the same trial id) loaded twice is a hard
//     error so results cannot be silently doubled.
//
// Usage:
//   node benchmark/scripts/summarize-runs.mjs \
//     --group with-skill:/path/to/run1/result.json \
//     --group with-skill:/path/to/run2/result.json \
//     --group no-skill:/path/to/run1/result.json \
//     [--format markdown|json]
import { existsSync, readFileSync } from 'node:fs'
import { basename, resolve } from 'node:path'
import { pathToFileURL } from 'node:url'

const MAX_DECIMALS = 4

// ── CLI argument parsing ───────────────────────────────────────────────────────

export function parseGroupArgs(argv) {
  const groups = new Map() // label -> { label, paths }
  let format = 'markdown'
  const seen = new Set()
  for (let i = 0; i < argv.length; i += 1) {
    const arg = argv[i]
    if (arg === '--format') {
      const value = argv[++i]
      if (value !== 'markdown' && value !== 'json') {
        throw new Error(`--format must be "markdown" or "json", got: ${value ?? '(missing)'}`)
      }
      format = value
      continue
    }
    if (arg === '--group') {
      const spec = argv[++i]
      if (spec === undefined) throw new Error('--group requires "<label>:<result.json>"')
      const colon = spec.indexOf(':')
      if (colon <= 0) throw new Error(`--group must be "<label>:<result.json>", got: ${spec}`)
      const label = spec.slice(0, colon).trim()
      const path = resolve(spec.slice(colon + 1))
      if (!label) throw new Error(`--group has an empty label: ${spec}`)
      if (seen.has(path)) {
        throw new Error(`duplicate input file listed twice: ${path}`)
      }
      seen.add(path)
      if (!groups.has(label)) groups.set(label, { label, paths: [] })
      groups.get(label).paths.push(path)
      continue
    }
    throw new Error(`unknown argument: ${arg}`)
  }
  if (groups.size === 0) throw new Error('no --group given; pass at least one --group <label>:<result.json>')
  return { groups: [...groups.values()].map((group) => ({ label: group.label, paths: group.paths })), format }
}

// ── Loading and normalization ──────────────────────────────────────────────────

export function loadResultFile(path) {
  if (!existsSync(path)) throw new Error(`result file not found: ${path}`)
  let parsed
  try {
    parsed = JSON.parse(readFileSync(path, 'utf8'))
  } catch (error) {
    throw new Error(`result file is not valid JSON: ${path} (${error.message})`)
  }
  if (parsed === null || typeof parsed !== 'object' || Array.isArray(parsed)) {
    throw new Error(`result file is not a JSON object: ${path}`)
  }
  return parsed
}

// One normalized trial record plus per-file anomalies/notes.
export function normalizeFile(parsed, label, sourceFile) {
  const anomalies = []
  const notes = []
  const common = {
    group: label,
    sourceFile,
    trialId: typeof parsed.id === 'string' ? parsed.id : null,
    taskId: null,
    agent: parsed.agent_info?.name ?? parsed.config?.agent?.name ?? null,
    model: parsed.agent_info?.model_info ?? parsed.config?.agent?.model_name ?? null,
  }
  if (parsed.verifier_result !== undefined || parsed.verifier_result === null) {
    const records = normalizeTrialLevel(parsed, common, anomalies, notes)
    return { records, anomalies, notes }
  }
  if (parsed.stats && typeof parsed.stats === 'object' && parsed.stats.evals && typeof parsed.stats.evals === 'object') {
    const records = normalizeJobLevel(parsed, common, anomalies, notes)
    return { records, anomalies, notes }
  }
  throw new Error(`unsupported Harbor result.json schema: ${sourceFile} (has neither "verifier_result" nor "stats.evals")`)
}

function extractReward(rewards, sourceFile) {
  if (rewards === undefined || rewards === null) return null
  if (typeof rewards !== 'object' || Array.isArray(rewards)) {
    throw new Error(`malformed "verifier_result.rewards" in ${sourceFile}: expected an object`)
  }
  const keys = Object.keys(rewards)
  if (keys.length === 0) return null
  const key = keys.includes('reward') ? 'reward' : keys[0]
  const value = rewards[key]
  if (typeof value !== 'number' || Number.isNaN(value) || value < 0 || value > 1) {
    throw new Error(`malformed reward in ${sourceFile}: ${JSON.stringify(value)} (must be a number in [0, 1])`)
  }
  return value
}

function normalizeTrialLevel(parsed, common, anomalies, notes) {
  const reward = extractReward(parsed.verifier_result?.rewards, common.sourceFile)
  const hasException = parsed.exception_info !== null && parsed.exception_info !== undefined
  const taskId = normalizeTaskId(parsed, common, notes)
  const record = {
    ...common,
    taskId,
    reward,
    scored: reward !== null,
    status: reward !== null ? (hasException ? 'completed-with-exception' : 'completed') : (hasException ? 'exception' : 'unscored'),
    exception: hasException ? describeException(parsed.exception_info) : null,
  }
  if (reward !== null && hasException) {
    anomalies.push({ type: 'scored-with-exception', group: common.group, taskId, trialId: common.trialId, source: common.sourceFile, message: `scored trial has execution exception (${record.exception}); reward kept` })
  } else if (reward === null && hasException) {
    anomalies.push({ type: 'exception', group: common.group, taskId, trialId: common.trialId, source: common.sourceFile, message: `trial has an exception and no verifier reward (${record.exception})` })
  } else if (reward === null) {
    anomalies.push({ type: 'no-reward', group: common.group, taskId, trialId: common.trialId, source: common.sourceFile, message: 'trial has no verifier reward (stopped/cancelled/setup failure); excluded from scored statistics' })
  }
  return [record]
}

function normalizeJobLevel(parsed, common, anomalies, notes) {
  const records = []
  const seenTrialNames = new Set()
  const exceptionsByName = new Map()
  for (const evalKey of Object.keys(parsed.stats.evals)) {
    const evalStats = parsed.stats.evals[evalKey]
    const rewardStats = evalStats?.reward_stats
    const exceptionStats = evalStats?.exception_stats
    if (rewardStats && typeof rewardStats === 'object') {
      for (const rewardKey of Object.keys(rewardStats)) {
        const entries = rewardStats[rewardKey]
        if (!entries || typeof entries !== 'object') continue
        for (const valueKey of Object.keys(entries)) {
          const reward = Number(valueKey)
          if (!Number.isFinite(reward) || reward < 0 || reward > 1) {
            throw new Error(`malformed reward value in ${common.sourceFile} (${evalKey}.${rewardKey}): ${valueKey}`)
          }
          const names = entries[valueKey]
          if (!Array.isArray(names)) {
            throw new Error(`malformed reward_stats entry in ${common.sourceFile}: ${JSON.stringify(entries[valueKey])}`)
          }
          for (const trialName of names) {
            if (seenTrialNames.has(trialName)) {
              throw new Error(`duplicate trial "${trialName}" in ${common.sourceFile}`)
            }
            seenTrialNames.add(trialName)
            const taskId = trialName.includes('__') ? trialName.split('__')[0] : trialName
            notes.push({ type: 'task-id-fallback', source: common.sourceFile, message: `task id for "${trialName}" derived from the trial name (job-level result.json carries no per-trial task identity)` })
            records.push({
              ...common,
              taskId,
              trialId: trialName,
              reward,
              scored: true,
              status: 'completed',
              exception: null,
            })
          }
        }
      }
    }
    if (exceptionStats && typeof exceptionStats === 'object') {
      for (const exceptionKey of Object.keys(exceptionStats)) {
        const names = exceptionStats[exceptionKey]
        if (!Array.isArray(names)) continue
        for (const trialName of names) exceptionsByName.set(trialName, exceptionKey)
      }
    }
  }
  for (const [trialName, exception] of exceptionsByName) {
    const record = records.find((entry) => entry.trialId === trialName)
    if (record) {
      record.status = 'completed-with-exception'
      record.exception = exception
      anomalies.push({ type: 'scored-with-exception', group: common.group, taskId: record.taskId, trialId: trialName, source: common.sourceFile, message: `scored trial has execution exception (${exception}); reward kept` })
    } else {
      anomalies.push({ type: 'exception', group: common.group, taskId: trialName.includes('__') ? trialName.split('__')[0] : trialName, trialId: trialName, source: common.sourceFile, message: `trial has an exception and no reward (${exception}); excluded from scored statistics` })
    }
  }
  const stats = parsed.stats
  if (Number.isFinite(stats.n_cancelled_trials) && stats.n_cancelled_trials > 0) {
    anomalies.push({ type: 'cancelled-count', group: common.group, source: common.sourceFile, message: `job reports ${stats.n_cancelled_trials} cancelled trial(s); they are not enumerable from this file` })
  }
  if (records.length === 0) {
    anomalies.push({ type: 'empty-result-set', group: common.group, source: common.sourceFile, message: 'no trial records found in this result.json' })
  }
  return records
}

function normalizeTaskId(parsed, common, notes) {
  if (parsed.task_id?.path && typeof parsed.task_id.path === 'string') {
    const name = basename(parsed.task_id.path)
    if (name) return name
  }
  if (parsed.task_name && typeof parsed.task_name === 'string' && parsed.task_name.includes('/')) {
    const segment = parsed.task_name.split('/').pop()
    if (segment) return segment
  }
  if (parsed.trial_name && typeof parsed.trial_name === 'string' && parsed.trial_name.includes('__')) {
    const fallback = parsed.trial_name.split('__')[0]
    notes.push({ type: 'task-id-fallback', source: common.sourceFile, message: `task id for "${parsed.trial_name}" derived from the trial name` })
    return fallback
  }
  throw new Error(`cannot derive a task id from ${common.sourceFile} (no task_id.path, task_name, or trial_name)`)
}

function describeException(info) {
  if (info === null || info === undefined) return null
  if (typeof info === 'string') return info.slice(0, 120)
  if (typeof info === 'object') {
    return String(info.type ?? info.name ?? info.message ?? JSON.stringify(info).slice(0, 120)).slice(0, 120)
  }
  return String(info).slice(0, 120)
}

// ── Statistics ─────────────────────────────────────────────────────────────────

export function median(values) {
  if (values.length === 0) return null
  const sorted = [...values].sort((a, b) => a - b)
  const middle = Math.floor(sorted.length / 2)
  if (sorted.length % 2 === 1) return sorted[middle]
  return (sorted[middle - 1] + sorted[middle]) / 2
}

function round4(value) {
  return Number(value.toFixed(MAX_DECIMALS))
}

export function perTaskStats(records) {
  const byTask = new Map()
  for (const record of records) {
    if (!record.scored) continue
    if (!byTask.has(record.taskId)) byTask.set(record.taskId, [])
    byTask.get(record.taskId).push(record.reward)
  }
  const tasks = new Map()
  for (const [taskId, rewards] of byTask) {
    const sorted = [...rewards].sort((a, b) => a - b)
    tasks.set(taskId, {
      taskId,
      n: sorted.length,
      mean: round4(sorted.reduce((sum, value) => sum + value, 0) / sorted.length),
      median: round4(median(sorted)),
      min: sorted[0],
      max: sorted[sorted.length - 1],
      perfect: sorted.filter((value) => value === 1).length,
    })
  }
  return tasks
}

export function groupStats(records, files, label) {
  const scored = records.filter((record) => record.scored)
  const rewards = scored.map((record) => record.reward).sort((a, b) => a - b)
  const rewardSum = rewards.reduce((sum, value) => sum + value, 0)
  return {
    label,
    files,
    records: records.length,
    scored: scored.length,
    unscored: records.length - scored.length,
    tasks: perTaskStats(records).size,
    rewardSum: round4(rewardSum),
    mean: rewards.length > 0 ? round4(rewardSum / rewards.length) : null,
    median: median(rewards),
    perfect: rewards.filter((value) => value === 1).length,
    min: rewards.length > 0 ? rewards[0] : null,
    max: rewards.length > 0 ? rewards[rewards.length - 1] : null,
  }
}

export function compareGroups(groupA, groupB) {
  const commonTasks = [...groupA.tasks.keys()].filter((taskId) => groupB.tasks.has(taskId))
  const missing = []
  for (const taskId of groupA.tasks.keys()) {
    if (!groupB.tasks.has(taskId)) missing.push({ taskId, missingIn: groupB.stats.label })
  }
  for (const taskId of groupB.tasks.keys()) {
    if (!groupA.tasks.has(taskId)) missing.push({ taskId, missingIn: groupA.stats.label })
  }
  const rows = []
  for (const taskId of [...commonTasks].sort()) {
    const a = groupA.tasks.get(taskId)
    const b = groupB.tasks.get(taskId)
    rows.push({ taskId, aMedian: a.median, bMedian: b.median, delta: round4(a.median - b.median) })
  }
  const deltas = rows.map((row) => row.delta)
  return {
    groupA: groupA.stats.label,
    groupB: groupB.stats.label,
    commonTaskCount: commonTasks.length,
    improved: rows.filter((row) => row.delta > 0).length,
    tied: rows.filter((row) => row.delta === 0).length,
    regressed: rows.filter((row) => row.delta < 0).length,
    meanPerTaskDelta: deltas.length > 0 ? round4(deltas.reduce((sum, value) => sum + value, 0) / deltas.length) : null,
    medianPerTaskDelta: deltas.length > 0 ? round4(median(deltas)) : null,
    rows,
    missing,
  }
}

// ── Aggregation entry ──────────────────────────────────────────────────────────

export function summarize(groupArgs) {
  const anomalies = []
  const notes = []
  const seenTrialIds = new Map() // trialId -> source file
  const groupSummaries = []
  const seenPaths = new Set()
  for (const group of groupArgs) {
    const records = []
    for (const path of group.paths) {
      if (seenPaths.has(path)) {
        throw new Error(`duplicate input file listed twice: ${path}`)
      }
      seenPaths.add(path)
      const parsed = loadResultFile(path)
      const result = normalizeFile(parsed, group.label, path)
      for (const record of result.records) {
        if (record.trialId !== null) {
          if (seenTrialIds.has(record.trialId)) {
            throw new Error(`duplicate trial "${record.trialId}" loaded twice: ${seenTrialIds.get(record.trialId)} and ${path}`)
          }
          seenTrialIds.set(record.trialId, path)
        }
        records.push(record)
      }
      anomalies.push(...result.anomalies)
      notes.push(...result.notes)
    }
    const tasks = perTaskStats(records)
    const stats = groupStats(records, group.paths, group.label)
    if (stats.records === 0) {
      anomalies.push({ type: 'empty-group', group: group.label, message: `group "${group.label}" produced no trial records` })
    }
    groupSummaries.push({ stats, tasks, records })
  }
  const comparison = groupSummaries.length === 2
    ? compareGroups(groupSummaries[0], groupSummaries[1])
    : null
  if (comparison) {
    for (const missing of comparison.missing) {
      anomalies.push({ type: 'missing-in-group', taskId: missing.taskId, message: `task "${missing.taskId}" missing in ${missing.missingIn}; excluded from paired delta aggregates (never treated as 0)` })
    }
  }
  return { groups: groupSummaries, comparison, anomalies, notes }
}

// ── Renderers ──────────────────────────────────────────────────────────────────

function fmt(value) {
  if (value === null || value === undefined) return '—'
  if (typeof value === 'number') return String(round4(value))
  return String(value)
}

export function renderMarkdown(summary) {
  const lines = []
  lines.push('# Benchmark Run Summary')
  lines.push('')
  lines.push('## Groups')
  lines.push('')
  lines.push('| Group | Files | Records | Scored | Tasks | Reward | Mean | Median | Perfect |')
  lines.push('| --- | --- | --- | --- | --- | --- | --- | --- | --- |')
  for (const group of summary.groups) {
    const stats = group.stats
    lines.push(`| ${stats.label} | ${stats.files.length} | ${stats.records} | ${stats.scored} | ${stats.tasks} | ${fmt(stats.rewardSum)} | ${fmt(stats.mean)} | ${fmt(stats.median)} | ${stats.perfect} |`)
  }
  lines.push('')
  lines.push('## Per-task results')
  lines.push('')
  for (const group of summary.groups) {
    lines.push(`### ${group.stats.label}`)
    lines.push('')
    lines.push('| Task | n | Mean | Median | Min | Max | Perfect |')
    lines.push('| --- | --- | --- | --- | --- | --- | --- |')
    for (const [taskId, entry] of [...group.tasks].sort(([a], [b]) => a.localeCompare(b))) {
      lines.push(`| ${taskId} | ${entry.n} | ${fmt(entry.mean)} | ${fmt(entry.median)} | ${fmt(entry.min)} | ${fmt(entry.max)} | ${entry.perfect} |`)
    }
    lines.push('')
  }
  if (summary.comparison) {
    const comparison = summary.comparison
    lines.push('## Paired comparison')
    lines.push('')
    lines.push(`delta = ${comparison.groupA} median − ${comparison.groupB} median`)
    lines.push('')
    lines.push(`| Task | ${comparison.groupA} median | ${comparison.groupB} median | delta |`)
    lines.push('| --- | --- | --- | --- |')
    for (const row of comparison.rows) {
      lines.push(`| ${row.taskId} | ${fmt(row.aMedian)} | ${fmt(row.bMedian)} | ${fmt(row.delta)} |`)
    }
    lines.push('')
    lines.push(`common tasks: ${comparison.commonTaskCount}; improved: ${comparison.improved}; tied: ${comparison.tied}; regressed: ${comparison.regressed}`)
    lines.push(`mean per-task delta: ${fmt(comparison.meanPerTaskDelta)}; median per-task delta: ${fmt(comparison.medianPerTaskDelta)}`)
    lines.push('')
  }
  lines.push('## Anomalies')
  lines.push('')
  if (summary.anomalies.length === 0) {
    lines.push('none')
  } else {
    for (const anomaly of summary.anomalies) {
      lines.push(`- [${anomaly.type}] ${anomaly.message}`)
    }
  }
  lines.push('')
  return lines.join('\n')
}

export function renderJson(summary) {
  const groups = {}
  for (const group of summary.groups) {
    groups[group.stats.label] = {
      files: group.stats.files,
      records: group.stats.records,
      scored: group.stats.scored,
      unscored: group.stats.unscored,
      tasks: group.stats.tasks,
      rewardSum: group.stats.rewardSum,
      mean: group.stats.mean,
      median: group.stats.median,
      perfect: group.stats.perfect,
      min: group.stats.min,
      max: group.stats.max,
      perTask: Object.fromEntries([...group.tasks].map(([taskId, entry]) => [taskId, entry])),
    }
  }
  return JSON.stringify({
    groups,
    comparison: summary.comparison,
    anomalies: summary.anomalies,
    notes: summary.notes,
  }, null, 2)
}

// ── CLI entry ──────────────────────────────────────────────────────────────────

const isMain = process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href
if (isMain) {
  try {
    const { groups, format } = parseGroupArgs(process.argv.slice(2))
    const summary = summarize(groups)
    process.stdout.write(`${format === 'json' ? renderJson(summary) : renderMarkdown(summary)}\n`)
  } catch (error) {
    console.error(`[summarize-runs] ${error.message}`)
    process.exit(1)
  }
}
