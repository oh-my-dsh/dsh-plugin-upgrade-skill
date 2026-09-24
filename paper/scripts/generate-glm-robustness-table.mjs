// paper/scripts/generate-glm-robustness-table.mjs
//
// Deterministic LaTeX rendering of the merged GLM pair-stability authority
// (PR #238). Source of truth: benchmark/results/glm-pair-stability.json — the
// retrospective A1 (direct contrast) and A2 (stability) analysis produced by
// benchmark/scripts/analyze-glm-pair-stability.mjs. This script does NOT
// re-analyse anything and never recomputes a statistic: it renders the
// committed numbers and refuses to run if the recorded input hashes no longer
// match the files on disk.
//
// Usage (from the repo root):
//   node paper/scripts/generate-glm-robustness-table.mjs
//   node paper/scripts/generate-glm-robustness-table.mjs --check
//
// Output (committed to the repo):
//   paper/generated/glm-robustness-table.tex — booktabs table,
//   label tab:glm-robustness, \input by the Results section.
//
// Determinism: pure string templates, no timestamps, no host paths; the same
// JSON always yields byte-identical output.
import { createHash } from 'node:crypto'
import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath, pathToFileURL } from 'node:url'

export const INPUT_PATH = 'benchmark/results/glm-pair-stability.json'
export const OUTPUT_PATH = 'paper/generated/glm-robustness-table.tex'

const PLACEHOLDER = '--'

/** Fixed two-decimal signed rendering (LaTeX-safe: unicode minus avoided so
 *  the build does not depend on a math font for the minus sign). */
export function fmt(value, { signed = false } = {}) {
  if (value === null || value === undefined || Number.isNaN(value)) return PLACEHOLDER
  const text = Number(value).toFixed(2)
  if (!signed || Number(value) < 0) return text
  return Number(value) === 0 ? text : `+${text}`
}

/** Render an inclusive interval as [lo, hi]. */
export function fmtInterval(pair) {
  if (!Array.isArray(pair) || pair.length !== 2 || pair.some((v) => v === null || v === undefined)) return PLACEHOLDER
  return `[${fmt(pair[0], { signed: true })}, ${fmt(pair[1], { signed: true })}]`
}

/** Render a sequence of numbers as a / b / c. */
export function fmtSeries(values, options = {}) {
  if (!Array.isArray(values) || values.length === 0) return PLACEHOLDER
  return values.map((v) => fmt(v, options)).join(' / ')
}

export function sha256File(path) {
  return createHash('sha256').update(readFileSync(path)).digest('hex')
}

export function loadStability(repoRoot) {
  const file = join(repoRoot, INPUT_PATH)
  if (!existsSync(file)) {
    throw new Error(`missing ${INPUT_PATH}; run \`npm run analyze:glm-stability\` first`)
  }
  let parsed
  try {
    parsed = JSON.parse(readFileSync(file, 'utf8'))
  } catch (error) {
    throw new Error(`${INPUT_PATH}: not valid JSON (${error.message})`)
  }
  if (parsed === null || typeof parsed !== 'object') throw new Error(`${INPUT_PATH}: not an object`)
  if (parsed.schemaVersion !== 1) throw new Error(`${INPUT_PATH}: schemaVersion must be 1, got ${JSON.stringify(parsed.schemaVersion)}`)
  if (parsed.id !== 'glm-pair-stability') throw new Error(`${INPUT_PATH}: id must be glm-pair-stability, got ${JSON.stringify(parsed.id)}`)
  for (const key of ['a1', 'a2', 'inputs', 'method']) {
    if (parsed[key] === undefined || parsed[key] === null) throw new Error(`${INPUT_PATH}: missing ${key}`)
  }
  if (typeof parsed.a1.meanD !== 'number') throw new Error(`${INPUT_PATH}: a1.meanD must be a number`)
  if (!Array.isArray(parsed.a1.bootstrapCi95) || parsed.a1.bootstrapCi95.length !== 2) throw new Error(`${INPUT_PATH}: a1.bootstrapCi95 must be a 2-element array`)
  if (parsed.a1.leaveOneOut?.min === undefined || parsed.a1.leaveOneOut?.max === undefined) throw new Error(`${INPUT_PATH}: a1.leaveOneOut must record min and max`)
  if (parsed.a2.perRoundMeanDelta === undefined) throw new Error(`${INPUT_PATH}: missing a2.perRoundMeanDelta`)
  return parsed
}

/** The authority records the SHA-256 of every input it consumed; re-verify
 *  them against the working tree so a drifted artifact cannot be rendered. */
export function verifyInputHashes(repoRoot, doc) {
  const failures = []
  for (const input of doc.inputs ?? []) {
    if (typeof input?.path !== 'string' || typeof input?.sha256 !== 'string') {
      failures.push('input entry without path/sha256')
      continue
    }
    const file = join(repoRoot, input.path)
    if (!existsSync(file)) {
      failures.push(`missing input: ${input.path}`)
      continue
    }
    const actual = sha256File(file)
    if (actual !== input.sha256) {
      failures.push(`input hash mismatch: ${input.path} (recorded ${input.sha256.slice(0, 12)}, actual ${actual.slice(0, 12)})`)
    }
  }
  if (failures.length > 0) {
    throw new Error(`${INPUT_PATH} input drift:\n  - ${failures.join('\n  - ')}`)
  }
  return true
}

function roundValues(entries) {
  if (!Array.isArray(entries) || entries.length === 0) return PLACEHOLDER
  return fmtSeries(entries.map((entry) => entry?.meanDelta), { signed: true })
}

/** The lower/upper LOO rows name the tasks whose removal moves the contrast
 *  most. Removing a task whose d_t is ABOVE the mean LOWERS the contrast, so
 *  the task at the LOO minimum is the largest upward influence (it pulls the
 *  contrast up); removing a below-mean task raises the contrast, so the task at
 *  the LOO maximum is the largest downward influence. */
export function influenceFromLeaveOneOut(leaveOneOut, meanD) {
  const min = leaveOneOut?.min
  const max = leaveOneOut?.max
  if (!min || !max) return { upward: PLACEHOLDER, downward: PLACEHOLDER, range: PLACEHOLDER }
  const upward = min.meanD < meanD ? min.task : max.task
  const downward = max.meanD > meanD ? max.task : min.task
  return { upward, downward, range: `[${fmt(min.meanD, { signed: true })}, ${fmt(max.meanD, { signed: true })}]` }
}

export function renderTable(doc) {
  const a1 = doc.a1
  const a2 = doc.a2
  const flash = a2.meanVsMedianAggregation?.['glm-5.3-flash'] ?? {}
  const strong = a2.meanVsMedianAggregation?.['glm-5.2'] ?? {}
  const flashRepeat = a2.repeatAggregationSensitivity?.['glm-5.3-flash'] ?? {}
  const strongRepeat = a2.repeatAggregationSensitivity?.['glm-5.2'] ?? {}
  const flashRounds = a2.perRoundMeanDelta?.['glm-5.3-flash']
  const strongRounds = a2.perRoundMeanDelta?.['glm-5.2']
  const flashRho = a2.baselineVsGainSpearman?.['glm-5.3-flash']?.spearmanBaselineVsGain
  const strongRho = a2.baselineVsGainSpearman?.['glm-5.2']?.spearmanBaselineVsGain
  const influence = influenceFromLeaveOneOut(a1.leaveOneOut, a1.meanD)
  const p = a1.wilcoxon?.pTwoSided

  const lines = [
    '% Generated by paper/scripts/generate-glm-robustness-table.mjs from',
    `% ${INPUT_PATH} — do not edit by hand; run \`npm run generate:paper-glm-robustness\`.`,
    '\\begin{table}[t]',
    '\\centering',
    '\\small',
    '\\begin{tabular}{l r}',
    '\\toprule',
    '\\textbf{Historical GLM contrast (S1--S22, shared task pool)} & \\textbf{Points} \\\\',
    '\\midrule',
    `Direct between-group contrast $\\bar d_t$ & ${fmt(a1.meanD, { signed: true })} \\\\`,
    `\\quad 95\\% task-bootstrap CI & ${fmtInterval(a1.bootstrapCi95)} \\\\`,
    `\\quad leave-one-task-out range & ${influence.range} \\\\`,
    `\\quad largest upward / downward influence & ${influence.upward} / ${influence.downward} \\\\`,
    `\\quad Wilcoxon signed-rank $p$ (secondary) & ${p === undefined || p === null ? PLACEHOLDER : Number(p).toFixed(4)} \\\\`,
    '\\midrule',
    `glm-5.3-flash mean paired $\\Delta$ (median-across-repeats) & ${fmt(flashRepeat.medianPerArmOverRepeats, { signed: true })} \\\\`,
    `\\quad mean-across-repeats sensitivity & ${fmt(flashRepeat.meanOverRepeats, { signed: true })} \\\\`,
    `\\quad median-of-task-deltas statistic & ${fmt(flash.median, { signed: true })} \\\\`,
    `\\quad rounds 1 / 2 / 3 & ${roundValues(flashRounds)} \\\\`,
    `glm-5.2 mean paired $\\Delta$ (median-across-repeats) & ${fmt(strongRepeat.medianPerArmOverRepeats, { signed: true })} \\\\`,
    `\\quad mean-across-repeats sensitivity & ${fmt(strongRepeat.meanOverRepeats, { signed: true })} \\\\`,
    `\\quad median-of-task-deltas statistic & ${fmt(strong.median, { signed: true })} \\\\`,
    `\\quad rounds 1 / 2 / 3 & ${roundValues(strongRounds)} \\\\`,
    '\\midrule',
    `Spearman $\\rho$ (no-skill baseline vs.\\ gain), glm-5.3-flash & ${fmt(flashRho)} \\\\`,
    `Spearman $\\rho$ (no-skill baseline vs.\\ gain), glm-5.2 & ${fmt(strongRho)} \\\\`,
    '\\bottomrule',
    '\\end{tabular}',
    '\\caption{Stability checks for the historical GLM contrast (retrospective, exploratory; source '
      + '\\texttt{' + INPUT_PATH.replaceAll('_', '\\_') + '}, PR~\\#238). The direct contrast is the per-task '
      + 'difference of differences over the 22 shared S1--S22 tasks, resampled at the task level exactly '
      + 'as in the main paired analysis; the leave-one-task-out range re-estimates it with each task '
      + 'removed in turn. Round rows are descriptive per-round mean deltas, not independent replications '
      + 'of the task set. Spearman correlations between the no-skill baseline and the gain are partly '
      + 'mechanical because both terms contain the no-skill score, so they are reported as descriptive '
      + 'headroom diagnostics, not as a ceiling mechanism. Sharing a task pool does not make the two '
      + 'executions a controlled comparison: budget, material revision, grader setup, and runtime still '
      + 'differ between groups.}',
    '\\label{tab:glm-robustness}',
    '\\end{table}',
  ]
  return lines.join('\n') + '\n'
}

export function generate(repoRoot, { check = false } = {}) {
  const doc = loadStability(repoRoot)
  verifyInputHashes(repoRoot, doc)
  const rendered = renderTable(doc)
  const outFile = join(repoRoot, OUTPUT_PATH)
  if (check) {
    if (!existsSync(outFile)) throw new Error(`${OUTPUT_PATH} is missing; run \`npm run generate:paper-glm-robustness\``)
    const committed = readFileSync(outFile, 'utf8')
    if (committed !== rendered) {
      throw new Error(`${OUTPUT_PATH} is out of date; run \`npm run generate:paper-glm-robustness\``)
    }
    return { rendered, wrote: false }
  }
  mkdirSync(dirname(outFile), { recursive: true })
  writeFileSync(outFile, rendered)
  return { rendered, wrote: true }
}

const isMain = process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href
if (isMain) {
  const repoRoot = join(dirname(fileURLToPath(import.meta.url)), '..', '..')
  const check = process.argv.includes('--check')
  try {
    const result = generate(repoRoot, { check })
    console.log(check
      ? `[generate-glm-robustness-table] OK: ${OUTPUT_PATH} is up to date`
      : `[generate-glm-robustness-table] wrote ${OUTPUT_PATH} (${result.rendered.length} bytes)`)
  } catch (error) {
    console.error(`[generate-glm-robustness-table] ${error.message}`)
    process.exit(1)
  }
}
