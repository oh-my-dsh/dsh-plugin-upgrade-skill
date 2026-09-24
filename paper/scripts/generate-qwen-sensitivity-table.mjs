// paper/scripts/generate-qwen-sensitivity-table.mjs
//
// Deterministic JSON → LaTeX pipeline for the Qwen timeout/missingness
// sensitivity artifact. Source of truth:
// benchmark/results/qwen-paired-sensitivity.json (produced by
// benchmark/scripts/analyze-qwen-paired-sensitivity.mjs — run
// `npm run analyze:qwen-sensitivity` first).
//
// Pure string templates, no timestamps, no host paths: the same input JSON
// always produces byte-identical tables. Mirrors the conventions of
// paper/scripts/generate-paired-effect-table.mjs and reuses `escapeLatex`.
//
// Claim boundary (enforced by the input validation and the rendered notes):
// every number is descriptive evidence about a historical run. The missing
// bounds are MISSING-VALUE BOUNDS, NOT a confidence interval; the non-timeout
// view is POST-HOC, SELECTION-BIASED and never replaces the main estimate.
//
// Usage (from the repo root):
//   node paper/scripts/generate-qwen-sensitivity-table.mjs
//   node paper/scripts/generate-qwen-sensitivity-table.mjs --check
//
// Output (committed to the repo):
//   paper/generated/qwen-paired-sensitivity-table.tex — label tab:qwen-sensitivity
import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath, pathToFileURL } from 'node:url'
import { escapeLatex } from './generate-benchmark-table.mjs'

export const INPUT_PATH = 'benchmark/results/qwen-paired-sensitivity.json'
export const OUTPUT_PATH = 'paper/generated/qwen-paired-sensitivity-table.tex'
export const ANALYSIS_ID = 'qwen-paired-sensitivity-v1'

const REQUIRED_BUCKETS = [
  'no_timeout_scored',
  'timeout_full',
  'timeout_partial',
  'timeout_zero',
  'timeout_unscored',
  'unscored',
]

/** Signed percentage-point formatting; negative values render as $-3.07$. */
export function fmtSigned2(value) {
  if (typeof value !== 'number' || !Number.isFinite(value)) return '---'
  if (value === 0) return '+0.00'
  const magnitude = Math.abs(value).toFixed(2)
  return value < 0 ? `$-${magnitude}$` : `+${magnitude}`
}

export function fmt2(value) {
  if (typeof value !== 'number' || !Number.isFinite(value)) return '---'
  return value.toFixed(2)
}

/** Validate the analysis object's required shape; throws on drift. */
export function validateAnalysis(parsed) {
  if (parsed === null || typeof parsed !== 'object' || parsed.id !== ANALYSIS_ID) {
    throw new Error(`not a ${ANALYSIS_ID} artifact`)
  }
  if (parsed.modelCalls !== 0) {
    throw new Error(`modelCalls must be 0 (this is an existing-data analysis), got ${JSON.stringify(parsed.modelCalls)}`)
  }
  const main = parsed.estimates?.main
  for (const field of ['deltaObserved', 'deltaLowerBound', 'deltaUpperBound', 'tasks', 'taskWeightPoints', 'boundWidth']) {
    if (main?.[field] === undefined) throw new Error(`estimates.main is missing "${field}"`)
  }
  for (const field of ['unscoredTrials', 'attemptsPerArm', 'tasks']) {
    if (parsed.completeness?.[field] === undefined) throw new Error(`completeness is missing "${field}"`)
  }
  const postHoc = parsed.estimates?.postHocNonTimeoutOnly
  for (const field of ['noTimeoutTasksOnly', 'taskNoTimeoutTrials', 'trialLevelSelection']) {
    if (postHoc?.[field] === undefined) throw new Error(`postHocNonTimeoutOnly is missing "${field}"`)
  }
  for (const arm of ['with-skill', 'no-skill']) {
    if (typeof parsed.missingScores?.byArm?.[arm] !== 'number') {
      throw new Error(`missingScores.byArm is missing "${arm}"`)
    }
  }
  const loo = parsed.taskInfluence?.looObserved
  for (const field of ['min', 'max', 'range']) {
    if (loo?.[field] === undefined) throw new Error(`taskInfluence.looObserved is missing "${field}"`)
  }
  if (parsed.timeoutTaxonomy?.combined?.timeoutScoredFullCount === undefined) {
    throw new Error('timeoutTaxonomy.combined.timeoutScoredFullCount is missing')
  }
  for (const arm of ['with-skill', 'no-skill']) {
    const buckets = parsed.arms?.[arm]?.buckets
    if (!Array.isArray(buckets)) throw new Error(`arms["${arm}"].buckets is missing`)
    for (const key of REQUIRED_BUCKETS) {
      if (!buckets.some((bucket) => bucket.key === key)) {
        throw new Error(`arms["${arm}"].buckets is missing the "${key}" bucket`)
      }
    }
  }
  return parsed
}

export function loadAnalysis(repoRoot) {
  const file = join(repoRoot, INPUT_PATH)
  if (!existsSync(file)) {
    throw new Error(`missing ${INPUT_PATH}; run \`npm run analyze:qwen-sensitivity\` first`)
  }
  let parsed
  try {
    parsed = JSON.parse(readFileSync(file, 'utf8'))
  } catch (error) {
    throw new Error(`${INPUT_PATH}: not valid JSON (${error.message})`)
  }
  try {
    return validateAnalysis(parsed)
  } catch (error) {
    throw new Error(`${INPUT_PATH}: ${error.message}`)
  }
}

/**
 * Human-readable description of the two missing-value bound scenarios. delta is
 * with-skill − no-skill, so the LOWER delta bound sets missing with-skill
 * rewards to 0 and missing no-skill rewards to 1; the UPPER bound is the
 * reverse. Only arms that actually have missing slots are named, so the label
 * direction always follows the data.
 */
export function boundScenarioLabels(analysis) {
  const byArm = analysis.missingScores.byArm
  const parts = (skillValue, noSkillValue) => {
    const out = []
    if (byArm['with-skill'] > 0) out.push(`unscored with-skill reward${byArm['with-skill'] === 1 ? '' : 's'} set to $${skillValue}$`)
    if (byArm['no-skill'] > 0) out.push(`unscored no-skill reward${byArm['no-skill'] === 1 ? '' : 's'} set to $${noSkillValue}$`)
    return out.length === 0 ? 'no unscored rewards' : out.join(', ')
  }
  return { lower: parts(0, 1), upper: parts(1, 0) }
}

/** Points one reward slot moves the task-level mean: (100 / tasks) / attempts. */
export function pointsPerSlot(analysis) {
  return analysis.estimates.main.taskWeightPoints / analysis.completeness.attemptsPerArm
}

/** Count for one taxonomy bucket of one arm. */
export function bucketCount(analysis, arm, key) {
  const bucket = analysis.arms[arm].buckets.find((entry) => entry.key === key)
  if (bucket === undefined) throw new Error(`${INPUT_PATH}: no bucket "${key}" for arm "${arm}"`)
  return bucket.count
}

export function renderQwenSensitivityTableTex(analysis) {
  validateAnalysis(analysis)
  const esc = escapeLatex
  const main = analysis.estimates.main
  const postHoc = analysis.estimates.postHocNonTimeoutOnly
  const loo = analysis.taskInfluence.looObserved
  const combined = analysis.timeoutTaxonomy.combined
  const skill = 'with-skill'
  const noSkill = 'no-skill'

  const slotsPerArm = analysis.completeness.tasks * analysis.completeness.attemptsPerArm
  const rate = (count) => `${fmt2((count / slotsPerArm) * 100)}\\%`
  const unscoredCount = analysis.completeness.unscoredTrials
  const scenario = boundScenarioLabels(analysis)

  const bucketRows = REQUIRED_BUCKETS.map((key) => {
    const label = analysis.timeoutTaxonomy.buckets.find((entry) => entry.key === key)?.label ?? key
    const skillCount = bucketCount(analysis, skill, key)
    const noSkillCount = bucketCount(analysis, noSkill, key)
    return `  ${esc(label)} & ${skillCount} (${rate(skillCount)}) & ${noSkillCount} (${rate(noSkillCount)}) & \\\\`
  }).join('\n')

  const boundaryNote =
    'Missing rewards are treated as unknowns in the legal range $[0,1]$, never as $0$: the main estimate uses each task\'s scored trials only, and the bounds re-run the same estimator at the extremes of that range. Because $\\Delta$ is with-skill minus no-skill, the lower $\\Delta$ bound sets missing with-skill rewards to $0$ and missing no-skill rewards to $1$, and the upper bound does the reverse.'
  const timeoutNote =
    'A timeout is a termination state, not automatically a functional failure: a timed-out trial can still be scored and can still earn full marks.'
  const postHocNote =
    'The non-timeout-only numbers are post-hoc and selection-biased --- they condition on a termination state that is itself associated with the arm --- so they disclose sensitivity, they do not replace the main estimate, and they carry no causal reading.'

  return [
    '% AUTO-GENERATED. DO NOT EDIT.',
    `% Source: ${INPUT_PATH}`,
    '% Regenerate with: npm run generate:qwen-sensitivity',
    '',
    '\\begin{table*}[t]',
    '\\centering',
    '\\small',
    '\\setlength{\\tabcolsep}{4pt}',
    '\\begin{tabular}{>{\\raggedright\\arraybackslash}p{0.30\\textwidth}>{\\raggedright\\arraybackslash}p{0.11\\textwidth}>{\\raggedright\\arraybackslash}p{0.11\\textwidth}>{\\raggedright\\arraybackslash}p{0.38\\textwidth}}',
    '\\toprule',
    'Quantity & Estimate & Missing bound & Reading \\\\',
    '\\midrule',
    `  Task-level mean paired $\\Delta$, all scored trials & ${fmtSigned2(main.deltaObserved)} & --- & Main estimate; the authority view for this group \\\\`,
    `  Same estimator, ${scenario.lower} & --- & ${fmtSigned2(main.deltaLowerBound)} & Lower missing-value bound \\\\`,
    `  Same estimator, ${scenario.upper} & --- & ${fmtSigned2(main.deltaUpperBound)} & Upper missing-value bound \\\\`,
    `  Missing-bound width (${unscoredCount} unscored slot${unscoredCount === 1 ? '' : 's'}, ${fmt2(pointsPerSlot(analysis))} points per slot) & --- & ${fmt2(Math.abs(main.boundWidth))} & Missing-value span, not a confidence interval \\\\`,
    `  Post-hoc: tasks whose six trials are all non-timeout ($n = ${postHoc.noTimeoutTasksOnly.tasks}$) & ${fmtSigned2(postHoc.noTimeoutTasksOnly.effect)} & --- & Post-hoc, selection-biased, non-authoritative \\\\`,
    `  Post-hoc: per-task timed-out trials dropped ($n = ${postHoc.taskNoTimeoutTrials.tasksWithBothArms}$) & ${fmtSigned2(postHoc.taskNoTimeoutTrials.effect)} & --- & Post-hoc, unbalanced, non-authoritative \\\\`,
    `  Leave-one-task-out observed range & --- & [${fmtSigned2(loo.min)}, ${fmtSigned2(loo.max)}] & Extreme-task influence, computed automatically \\\\`,

    '\\midrule',
    'Termination state & with-skill & no-skill & \\\\',
    '\\midrule',
    bucketRows,
    '\\midrule',
    `  Timeout trials that were still scored & ${combined.timeoutScoredTrials} & --- & Timeout is a termination state, not automatically a failure \\\\`,
    `  \\quad of which full marks & ${combined.timeoutScoredFullCount} & --- & Scored full reward despite timing out \\\\`,
    '\\bottomrule',
    '\\end{tabular}',
    `\\caption{Qwen3.8-27B (medium) paired run --- timeout/termination state and missing-score sensitivity (${main.tasks} tasks $\\times$ 2 arms $\\times$ ${analysis.completeness.attemptsPerArm} intended attempts; ${unscoredCount} unscored slot${unscoredCount === 1 ? '' : 's'}). ${boundaryNote} ${timeoutNote} ${postHocNote} All quantities are descriptive of this historical run; none is a causal claim.}`,
    '\\label{tab:qwen-sensitivity}',
    '\\end{table*}',
    '',
  ].join('\n')
}

// ── CLI ───────────────────────────────────────────────────────────────────────

const isMain = process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href
if (isMain) {
  const args = process.argv.slice(2)
  const check = args.includes('--check')
  if (args.some((arg) => arg !== '--check')) {
    console.error('usage: node paper/scripts/generate-qwen-sensitivity-table.mjs [--check]')
    process.exit(2)
  }
  const repoRoot = fileURLToPath(new URL('../../', import.meta.url))
  let content
  try {
    content = renderQwenSensitivityTableTex(loadAnalysis(repoRoot))
  } catch (error) {
    console.error(`error: ${error.message}`)
    process.exit(1)
  }
  const target = join(repoRoot, OUTPUT_PATH)
  if (check) {
    if (!existsSync(target)) {
      console.error(`missing generated file: ${OUTPUT_PATH}`)
      console.error('Run: npm run generate:qwen-sensitivity')
      process.exit(1)
    }
    if (readFileSync(target, 'utf8') !== content) {
      console.error(`out of date: ${OUTPUT_PATH}`)
      console.error('Run: npm run generate:qwen-sensitivity')
      process.exit(1)
    }
    console.log(`${OUTPUT_PATH} is up to date`)
    process.exit(0)
  }
  mkdirSync(dirname(target), { recursive: true })
  writeFileSync(target, content)
  console.log(`wrote ${OUTPUT_PATH}`)
}
