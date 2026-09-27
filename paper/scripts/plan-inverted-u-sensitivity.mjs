// Offline planning sensitivity only: heterogeneous historical data, not formal power.
// No model calls, task selection, or modification of historical scores.
import { readFileSync, writeFileSync } from 'node:fs'
import { createHash } from 'node:crypto'
import { fileURLToPath } from 'node:url'
import { join } from 'node:path'

const root = fileURLToPath(new URL('../../', import.meta.url))
const paths = [
  'benchmark/results/paired-effect-stats.json',
  'benchmark/results/validation-report-2026-09-16-codex-qwen3.8-27b-medium-s16-paired.json',
]
const texts = paths.map(p => readFileSync(join(root, p), 'utf8'))
const [stats, qwen] = texts.map(t => JSON.parse(t))
const flash = stats.groups.find(g => g.label === 'glm-5.3-flash')
const strong = stats.groups.find(g => g.label === 'glm-5.2')
const flashByTask = new Map(flash.perTask.map(t => [t.task, t]))
const mean = xs => xs.reduce((a, b) => a + b, 0) / xs.length
const zSum = 2.241402727604947 + 0.8416212335729143
const round = x => Math.round(x * 1e6) / 1e6

function summarize(label, tasks, values) {
  if (values.length < 2 || new Set(tasks).size !== tasks.length || values.some(x => !Number.isFinite(x))) {
    throw new Error('Invalid paired planning inputs: ' + label)
  }
  const avg = mean(values)
  const sd = Math.sqrt(values.reduce((s, x) => s + (x - avg) ** 2, 0) / (values.length - 1))
  return {
    label, tasks, n: values.length, meanGapPp: round(avg), sampleSdPp: round(sd),
    approximateDetectableGapPp: Object.fromEntries([12, 16, 22, 40, 80].map(n => [n, round(zSum * sd / Math.sqrt(n))])),
    approximateIndependentTasksRequired: Object.fromEntries([5, 10, 15].map(delta => [delta, Math.ceil((zSum * sd / delta) ** 2)])),
  }
}

const output = {
  status: 'planning-sensitivity-only; not a registered design or powered-study certification',
  method: {
    individualContrastAlphaTwoSided: 0.025,
    numberOfPlannedContrasts: 2,
    individualContrastTargetPower: 0.8,
    jointTargetPower: null,
    zCritical: 2.241402727604947,
    zPower: 0.8416212335729143,
    formula: 'N ~= ((z_(1-alpha/2) + z_power) * sample_sd / meaningful_gap)^2',
    assumptions: 'independent identically distributed task differences; normal approximation; historical SD treated as a planning scenario',
    limitations: [
      'Left comparison mixes new Qwen semantic scores with historical GLM scores and different harnesses/repetitions.',
      'Neither source establishes variance for a new unified protocol; SD itself is uncertain.',
      'More repeats may reduce within-task noise, not between-task heterogeneity; no variance extrapolation by repetition count is made.',
      'Related incident tasks reduce effective independence; two 80% marginal powers do not imply 80% joint power.',
      'Meaningful differences 5/10/15 pp and task counts are sensitivity scenarios, not approved budget or stopping rules.',
    ],
    references: [
      'https://www.itl.nist.gov/div898/handbook/prc/section2/prc222.htm',
      'https://www.itl.nist.gov/div898/handbook/prc/section4/prc463.htm',
    ],
  },
  inputs: paths.map((path, i) => ({ path, sha256: createHash('sha256').update(texts[i]).digest('hex') })),
  contrasts: [
    summarize('Flash minus Qwen; heterogeneous 16-task planning data', qwen.per_task.map(t => t.task),
      qwen.per_task.map(t => flashByTask.get(t.task)?.delta - 100 * t.delta)),
    summarize('Flash minus GLM-5.2; historical 22-task comparison', strong.perTask.map(t => t.task),
      strong.perTask.map(t => flashByTask.get(t.task)?.delta - t.delta)),
  ],
}
const destination = join(root, 'paper/generated/inverted-u-planning-sensitivity.json')
const rendered = JSON.stringify(output, null, 2) + '\n'
if (process.argv.slice(2).some(arg => arg !== '--check')) throw new Error('Usage: node plan-inverted-u-sensitivity.mjs [--check]')
if (process.argv.includes('--check')) {
  if (readFileSync(destination, 'utf8') !== rendered) throw new Error('Planning artifact is stale')
  console.log('Planning artifact matches hashed inputs; no model calls.')
} else {
  writeFileSync(destination, rendered)
  console.log(rendered)
}
