// benchmark/scripts/analyze-paired-resource-overhead.mjs
//
// Deterministic, source-hash-pinned resource-overhead accounting for the five
// MAIN historical groups of the paper's paired-effect authority
// (benchmark/results/paired-effect-stats.json, sensitivity groups excluded).
//
// It performs NO new runs and NO new statistics: it reads the committed
// resource fields that each group's own artifacts already record, declares the
// accounting convention of every source, and refuses to invent a value that the
// source does not contain.
//
// Accounting rules enforced here (see the JSON `accountingSemantics` block):
//   * cached input is NEVER double counted. Two conventions exist in the
//     historical data and are recorded per source:
//       - `cached-included-in-input` (qwen: cache_hit_rate = cached / input, so
//         the honest total is input + output);
//       - `cached-separate-from-input` (glm-5.3-flash: total = in + out + cache).
//     The two conventions are never pooled or compared as if identical.
//   * a summed per-trial duration is NOT experiment wall-clock time; whenever a
//     source also records a wall interval, both are kept under distinct names.
//   * solver and judge usage are separated; a source that mixes them, or that
//     cannot distinguish them, is marked `mixed-or-unknown` rather than having
//     judge tokens counted as solver overhead.
//   * a ratio is emitted only when both arms record the field under the same
//     convention; otherwise it is null with an explicit reason.
//   * missing is never zero, and cost is emitted only when the source itself
//     records a cost with a currency (no retroactive token x price inference).
//
// Usage:
//   node benchmark/scripts/analyze-paired-resource-overhead.mjs [--check]
import { createHash } from 'node:crypto'
import { existsSync, readFileSync, writeFileSync } from 'node:fs'
import { dirname, join, resolve } from 'node:path'
import { fileURLToPath, pathToFileURL } from 'node:url'

export const AUTHORITY_PATH = 'benchmark/results/paired-effect-stats.json'
export const OUTPUT_PATH = 'benchmark/results/paired-resource-overhead.json'

/** The five MAIN groups of the paper authority, in paper order. */
export const MAIN_GROUPS = ['qwen3.8-27b', 'deepseek-v4-flash', 'gpt-5.6-terra', 'glm-5.3-flash', 'glm-5.2']

/** Sources the authority does not hash itself but this analysis consumes. */
export const EXTRA_SOURCES = {
  'glm-5.3-flash': ['benchmark/results/artifacts/2026-09-11-glm-5.3-flash-s1-s22/agent-usage.json'],
}

export const FIELD_NAMES = ['inputTokens', 'cachedInputTokens', 'outputTokens', 'summedTrialSeconds', 'wallIntervalSeconds', 'cost']

export function sha256File(path) {
  return createHash('sha256').update(readFileSync(path)).digest('hex')
}

export function readJson(path) {
  return JSON.parse(readFileSync(path, 'utf8'))
}

/** qwen: totals{} are per arm and already summed by the source. */
export function parseQwen(repoRoot, entry) {
  const doc = readJson(join(repoRoot, entry.path))
  const arms = {}
  for (const [key, arm] of [['skill', 'with-skill'], ['noskill', 'no-skill']]) {
    const t = doc.totals?.[arm]
    if (!t) return unavailableGroup(entry, 'source totals missing for an arm')
    arms[key] = {
      recordedTrials: t.trials ?? null,
      inputTokens: t.input_tokens ?? null,
      cachedInputTokens: t.cached_input_tokens ?? null,
      outputTokens: t.output_tokens ?? null,
      summedTrialSeconds: t.summed_native_trial_seconds ?? null,
      wallIntervalSeconds: t.wall_interval_seconds ?? null,
      cost: null,
      currency: null,
    }
  }
  return {
    sourcePath: entry.path,
    sourceSha256: entry.sha256,
    cachedInputConvention: 'cached-included-in-input',
    cachedInputEvidence: 'cache_hit_rate = cached_input_tokens / input_tokens in the source totals',
    usageKind: 'solver-only',
    judgeUsage: null,
    planningNote: null,
    arms,
  }
}

/** glm-5.3-flash round 1 records per-entry usage under cond=skill|noskill|judge.
 *  Rounds 2 and 3 ship no usage file, so coverage is explicitly partial. */
export function parseGlm53(repoRoot, entry) {
  const usagePath = EXTRA_SOURCES['glm-5.3-flash'][0]
  const file = join(repoRoot, usagePath)
  if (!existsSync(file)) return unavailableGroup(entry, `missing usage source ${usagePath}`)
  const entries = readJson(file)
  if (!Array.isArray(entries) || entries.length === 0) return unavailableGroup(entry, 'usage source is empty')
  const buckets = { skill: emptyBucket(), noskill: emptyBucket(), judge: emptyBucket() }
  for (const item of entries) {
    const bucket = buckets[item?.cond]
    if (!bucket) return unavailableGroup(entry, `unexpected usage condition ${JSON.stringify(item?.cond)}`)
    bucket.entries += 1
    bucket.inputTokens += item.in ?? 0
    bucket.cachedInputTokens += item.cache ?? 0
    bucket.outputTokens += item.out ?? 0
    bucket.totalTokens += item.total ?? 0
    bucket.summedTrialSeconds += (item.ms ?? 0) / 1000
    bucket.tasks.add(item.task)
  }
  const roundsWithUsage = 1
  const roundsPlanned = 3
  return {
    sourcePath: usagePath,
    sourceSha256: sha256File(file),
    authoritySourceSha256: entry.sha256,
    cachedInputConvention: 'cached-separate-from-input',
    cachedInputEvidence: 'total = in + out + cache in every usage entry (cache is not a subset of in)',
    usageKind: 'separated',
    judgeUsage: finalizeBucket(buckets.judge, { withJudge: false }),
    planningNote: `only round 1 of ${roundsPlanned} rounds ships a usage file; rounds 2 and 3 record none`,
    coverage: { roundsWithUsage, roundsPlanned },
    arms: {
      skill: finalizeBucket(buckets.skill, {}),
      noskill: finalizeBucket(buckets.noskill, {}),
    },
  }
}

function emptyBucket() {
  return { entries: 0, inputTokens: 0, cachedInputTokens: 0, outputTokens: 0, totalTokens: 0, summedTrialSeconds: 0, tasks: new Set() }
}

function finalizeBucket(bucket, { withJudge = true } = {}) {
  return {
    recordedTrials: bucket.entries,
    distinctTasks: bucket.tasks.size,
    inputTokens: bucket.inputTokens,
    cachedInputTokens: bucket.cachedInputTokens,
    outputTokens: bucket.outputTokens,
    totalTokens: bucket.totalTokens,
    summedTrialSeconds: bucket.summedTrialSeconds,
    wallIntervalSeconds: null,
    cost: null,
    currency: null,
  }
}

function unavailableGroup(entry, reason) {
  return {
    sourcePath: entry.path,
    sourceSha256: entry.sha256,
    cachedInputConvention: null,
    usageKind: 'unavailable',
    judgeUsage: null,
    arms: null,
    unavailableReason: reason,
  }
}

/** Groups whose sources record no machine-readable resource fields at all. */
export function unavailableFromAuthority(entry, reason) {
  return unavailableGroup(entry, reason)
}

export const PARSERS = {
  'qwen3.8-27b': parseQwen,
  'glm-5.3-flash': parseGlm53,
}

/** Ratio of a field between arms; null with a reason when not computable. */
export function ratioFor(parsed, field) {
  if (!parsed.arms) return { value: null, numerator: null, denominator: null, status: 'unavailable', reason: parsed.unavailableReason ?? 'no resource fields in the source' }
  const skill = parsed.arms.skill?.[field]
  const noskill = parsed.arms.noskill?.[field]
  if (parsed.cachedInputConvention === null) {
    return { value: null, numerator: skill ?? null, denominator: noskill ?? null, status: 'unavailable', reason: 'no declared accounting convention' }
  }
  if (skill === null || skill === undefined || noskill === null || noskill === undefined) {
    return { value: null, numerator: skill ?? null, denominator: noskill ?? null, status: 'unavailable', reason: `field ${field} not recorded for both arms` }
  }
  if (noskill === 0) {
    return { value: null, numerator: skill, denominator: 0, status: 'zero-denominator', reason: 'no-skill arm records 0 for this field; a ratio is undefined rather than infinite' }
  }
  return { value: Number((skill / noskill).toFixed(4)), numerator: skill, denominator: noskill, status: 'ok', reason: null }
}

export function completenessFor(parsed, field, expectedPerArm) {
  if (!parsed.arms) return { status: 'unavailable', observed: 0, expected: expectedPerArm }
  const observed = ['skill', 'noskill'].filter((arm) => {
    const value = parsed.arms[arm]?.[field]
    return value !== null && value !== undefined
  }).length
  if (observed === 2) {
    // both arms recorded, but a partial-round source is still partial
    const coverage = parsed.coverage
    if (coverage && coverage.roundsWithUsage < coverage.roundsPlanned) {
      return { status: 'partial', observed, expected: 2, note: `${coverage.roundsWithUsage} of ${coverage.roundsPlanned} rounds recorded` }
    }
    return { status: 'complete', observed, expected: 2 }
  }
  if (observed === 0) return { status: 'unavailable', observed: 0, expected: 2 }
  return { status: 'partial', observed, expected: 2 }
}

/** Build the full report from the authority + per-group sources. */
export function buildReport(repoRoot) {
  const authorityPath = join(repoRoot, AUTHORITY_PATH)
  if (!existsSync(authorityPath)) throw new Error(`missing ${AUTHORITY_PATH}`)
  const authority = readJson(authorityPath)
  const authoritySha = sha256File(authorityPath)
  const byLabel = new Map(authority.groups.map((group) => [group.label, group]))

  const groups = []
  const missing = []
  for (const label of MAIN_GROUPS) {
    const entry = byLabel.get(label)
    if (!entry) {
      missing.push(label)
      continue
    }
    const primary = entry.inputs[0]
    const parser = PARSERS[label]
    const parsed = parser
      ? parser(repoRoot, primary)
      : unavailableFromAuthority(primary, 'source records scores only; no machine-readable resource fields')
    const expectedPerArm = entry.tasks
    groups.push({
      label,
      sensitivity: entry.sensitivity === true,
      taskCount: entry.tasks,
      protocol: entry.protocol,
      sourcePath: parsed.sourcePath,
      sourceSha256: parsed.sourceSha256,
      cachedInputConvention: parsed.cachedInputConvention,
      cachedInputEvidence: parsed.cachedInputEvidence ?? null,
      usageKind: parsed.usageKind,
      planningNote: parsed.planningNote ?? null,
      unavailableReason: parsed.unavailableReason ?? null,
      arms: parsed.arms,
      judgeUsage: parsed.judgeUsage ?? null,
      completeness: Object.fromEntries(FIELD_NAMES.map((field) => [field, completenessFor(parsed, field, expectedPerArm)])),
      ratios: {
        inputTokens: ratioFor(parsed, 'inputTokens'),
        outputTokens: ratioFor(parsed, 'outputTokens'),
        totalTokens: parsed.arms && parsed.cachedInputConvention === 'cached-separate-from-input'
          ? ratioFor(parsed, 'totalTokens')
          : null,
        summedTrialSeconds: ratioFor(parsed, 'summedTrialSeconds'),
      },
      notes: groupNotes(label, parsed),
    })
  }
  if (missing.length > 0) throw new Error(`authority is missing main groups: ${missing.join(', ')}`)

  const extraInputs = Object.values(EXTRA_SOURCES).flat()
  return {
    schemaVersion: 1,
    id: 'paired-resource-overhead',
    modelCalls: 0,
    analysisKind: 'derived-secondary-analysis of committed historical artifacts',
    authority: { path: AUTHORITY_PATH, sha256: authoritySha },
    mainGroups: MAIN_GROUPS,
    accountingSemantics: {
      cachedInputConventions: {
        'cached-included-in-input': 'cached input is a subset of input; total = input + output',
        'cached-separate-from-input': 'cached input is recorded separately; total = input + output + cached',
      },
      crossConventionPooling: 'never pooled: ratios are only produced within one group under one declared convention',
      summedTrialSecondsIsNotWallClock: true,
      costPolicy: 'cost is reported only when the source itself records it with a currency; no retroactive token x price inference',
      crossConfigurationTokenComparison: 'absolute token counts are not comparable across models/providers/tokenizers and are reported descriptively only; the reliable overhead reading is within-configuration skill vs no-skill',
      missingIsNeverZero: true,
      solverJudgeSeparation: 'solver and judge usage are reported separately; a source that cannot separate them is marked mixed-or-unknown',
    },
    extraInputs: extraInputs.map((path) => ({ path, sha256: existsSync(join(repoRoot, path)) ? sha256File(join(repoRoot, path)) : null })),
    groups,
  }
}

function groupNotes(label, parsed) {
  const notes = []
  if (parsed.usageKind === 'unavailable') {
    notes.push('no machine-readable resource fields in the committed source; reported as unavailable rather than 0')
  }
  if (label === 'glm-5.3-flash') {
    notes.push('round-1 usage only: rounds 2 and 3 ship no usage file, so this row is partial coverage')
    notes.push('judge usage is recorded separately in the same file and excluded from the solver totals')
    notes.push('no-skill has one retry entry for S3-snapshot-migration, so its entry count exceeds the task count; retries are real consumption and are kept')
    notes.push('under this source convention the cached-input share falls for the skill arm, so the honest total is lower even though input, output and duration are higher')
  }
  if (label === 'qwen3.8-27b') {
    notes.push('the with-skill arm records one more trial than the no-skill arm (168 vs 167); per-trial means use each arm\'s own recorded trial count')
    notes.push('summed trial seconds are not wall-clock time; the source also records a wall interval, kept under its own name')
  }
  return notes
}

export function verifySourceHashes(repoRoot, report) {
  const failures = []
  for (const group of report.groups) {
    const file = join(repoRoot, group.sourcePath)
    if (!existsSync(file)) {
      failures.push(`missing source for ${group.label}: ${group.sourcePath}`)
      continue
    }
    if (group.sourceSha256 && sha256File(file) !== group.sourceSha256) {
      failures.push(`source hash mismatch for ${group.label}: ${group.sourcePath}`)
    }
  }
  for (const extra of report.extraInputs) {
    if (extra.sha256 === null) { failures.push(`missing extra input: ${extra.path}`); continue }
    if (sha256File(join(repoRoot, extra.path)) !== extra.sha256) failures.push(`extra input hash mismatch: ${extra.path}`)
  }
  if (failures.length > 0) throw new Error(`source drift:\n  - ${failures.join('\n  - ')}`)
  return true
}

export function renderReport(repoRoot) {
  const report = buildReport(repoRoot)
  return JSON.stringify(report, null, 2) + '\n'
}

export function run(repoRoot, { check = false } = {}) {
  const authorityPath = join(repoRoot, AUTHORITY_PATH)
  const authority = readJson(authorityPath)
  // re-verify the authority's own embedded input hashes before rendering
  const failures = []
  for (const group of authority.groups) {
    for (const input of group.inputs ?? []) {
      const file = join(repoRoot, input.path)
      if (!existsSync(file)) { failures.push(`missing: ${input.path}`); continue }
      if (sha256File(file) !== input.sha256) failures.push(`hash mismatch: ${input.path}`)
    }
  }
  if (failures.length > 0) throw new Error(`authority input drift:\n  - ${failures.join('\n  - ')}`)

  const rendered = renderReport(repoRoot)
  const report = JSON.parse(rendered)
  verifySourceHashes(repoRoot, report)
  const outFile = join(repoRoot, OUTPUT_PATH)
  if (check) {
    if (!existsSync(outFile)) throw new Error(`${OUTPUT_PATH} is missing; run \`npm run analyze:paper-resource-overhead\``)
    if (readFileSync(outFile, 'utf8') !== rendered) throw new Error(`${OUTPUT_PATH} is out of date; run \`npm run analyze:paper-resource-overhead\``)
    return { rendered, wrote: false }
  }
  writeFileSync(outFile, rendered)
  return { rendered, wrote: true }
}

const isMain = process.argv[1] && import.meta.url === pathToFileURL(resolve(process.argv[1])).href
if (isMain) {
  const repoRoot = resolve(dirname(dirname(dirname(fileURLToPath(import.meta.url)))))
  const check = process.argv.includes('--check')
  try {
    const result = run(repoRoot, { check })
    console.log(check
      ? `[paired-resource-overhead] OK: ${OUTPUT_PATH} is up to date`
      : `[paired-resource-overhead] wrote ${OUTPUT_PATH} (${result.rendered.length} bytes)`)
  } catch (error) {
    console.error(`[paired-resource-overhead] ${error.message}`)
    process.exit(1)
  }
}
