// A2 remaining analyses for the GLM trio on the shared S1-S22 task pool:
//   1. Common-subset statement: all three GLM configurations cover the identical S1-S22 pool,
//      so the common subset equals the full pool (no task has to be dropped).
//   2. Headroom sensitivity: per-task medians per configuration, mean paired delta, and the
//      delta expressed as a share of remaining headroom (100 - mean no-skill).
//   3. Event-family disclosure: no defensible incident-family grouping is recorded for S1-S22,
//      so task-level bootstrap limits are disclosed instead of grouped resampling.
// Also re-derives the two A1 gain-gap contrasts with a seeded task-level bootstrap:
//   d1 = delta(glm-5.3-flash) - delta(glm-5.2)
//   d2 = delta(glm-5.3-flash) - delta(glm-5.3 standard, flash-rejudged round 3)
// Usage: node analyze-glm-common-subset.mjs [--check]
// Inputs: the three aggregate.json files listed in INPUTS (read-only).
// Outputs (written next to this script's repo root): benchmark/results/glm-trio-common-subset.json
// and a markdown table printed to stdout.
import { readFileSync, writeFileSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'

const HERE = dirname(fileURLToPath(import.meta.url))
const ROOT = join(HERE, '../..')
const INPUTS = {
  'glm-5.3-flash': join(ROOT, 'benchmark/results/artifacts/2026-09-11-glm-5.3-flash-s1-s22-round2/aggregate.json'),
  'glm-5.2': join(ROOT, 'benchmark/results/artifacts/2026-09-13-glm-5.2-s1-s22-round2/aggregate.json'),
  'glm-5.3': join(ROOT, 'benchmark/results/artifacts/2026-09-17-glm-5.3-s1-s22-r3/aggregate-flash-rejudge.json'),
}
// Round provenance per configuration (per-task median across rounds).
const ROUND_INPUTS = {
  'glm-5.3-flash': [
    join(ROOT, 'benchmark/results/artifacts/2026-09-11-glm-5.3-flash-s1-s22/aggregate.json'),
    join(ROOT, 'benchmark/results/artifacts/2026-09-11-glm-5.3-flash-s1-s22-round2/aggregate.json'),
    join(ROOT, 'benchmark/results/artifacts/2026-09-11-glm-5.3-flash-s1-s22-round3/aggregate.json'),
  ],
  'glm-5.2': [
    join(ROOT, 'benchmark/results/artifacts/2026-09-13-glm-5.2-s1-s22/aggregate.json'),
    join(ROOT, 'benchmark/results/artifacts/2026-09-13-glm-5.2-s1-s22-round2/aggregate.json'),
    join(ROOT, 'benchmark/results/artifacts/2026-09-13-glm-5.2-s1-s22-round3/aggregate.json'),
  ],
  'glm-5.3': [
    join(ROOT, 'benchmark/results/artifacts/2026-09-15-glm-5.3-s1-s22/aggregate.json'),
    join(ROOT, 'benchmark/results/artifacts/2026-09-16-glm-5.3-s1-s22-r2/aggregate.json'),
    join(ROOT, 'benchmark/results/artifacts/2026-09-17-glm-5.3-s1-s22-r3/aggregate-flash-rejudge.json'),
  ],
}
export function median3(values) {
  const s = [...values].sort((a, b) => a - b)
  return s[1]
}
export function mulberry32(seed) {
  let a = seed >>> 0
  return function () {
    a |= 0; a = (a + 0x6D2B79F5) | 0
    let t = Math.imul(a ^ (a >>> 15), 1 | a)
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296
  }
}
export function mean(xs) { return xs.reduce((a, b) => a + b, 0) / xs.length }
export function bootstrapMeanDelta(deltas, { replicates = 10000, seed = 20260907 } = {}) {
  const rand = mulberry32(seed)
  const n = deltas.length
  const means = []
  for (let r = 0; r < replicates; r++) {
    let acc = 0
    for (let i = 0; i < n; i++) acc += deltas[Math.floor(rand() * n)]
    means.push(acc / n)
  }
  means.sort((a, b) => a - b)
  return { mean: mean(deltas), lo: means[Math.floor(0.025 * replicates)], hi: means[Math.ceil(0.975 * replicates) - 1] }
}
export function loadMedianByTask(paths) {
  const byTask = {}
  for (const p of paths) {
    const rows = JSON.parse(readFileSync(p, 'utf8'))
    for (const row of rows) {
      ;(byTask[row.task] = byTask[row.task] || []).push([row.noskill, row.skill])
    }
  }
  const out = {}
  for (const [task, pairs] of Object.entries(byTask)) out[task] = [median3(pairs.map(p => p[0])), median3(pairs.map(p => p[1]))]
  return out
}
export function analyze() {
  const configs = {}
  for (const name of Object.keys(ROUND_INPUTS)) configs[name] = loadMedianByTask(ROUND_INPUTS[name])
  const tasks = Object.keys(configs['glm-5.3-flash']).sort()
  for (const name of Object.keys(configs)) {
    const t2 = Object.keys(configs[name]).sort()
    if (t2.join(',') !== tasks.join(',')) throw new Error(`common-subset violated for ${name}`)
  }
  const summary = {}
  for (const name of Object.keys(configs)) {
    const noskill = tasks.map(t => configs[name][t][0])
    const skill = tasks.map(t => configs[name][t][1])
    const base = mean(noskill)
    const delta = mean(skill) - base
    summary[name] = {
      meanNoskill: base, meanSkill: mean(skill), meanDelta: delta,
      headroomShare: delta / (100 - base),
      deltasByTask: tasks.map((t, i) => skill[i] - noskill[i]),
    }
  }
  const gaps = {}
  for (const [key, a, b] of [['flash_minus_5_2', 'glm-5.3-flash', 'glm-5.2'], ['flash_minus_5_3_std', 'glm-5.3-flash', 'glm-5.3']]) {
    const deltas = tasks.map((t, i) => summary[a].deltasByTask[i] - summary[b].deltasByTask[i])
    gaps[key] = { contrast: `${a} - ${b}`, ...bootstrapMeanDelta(deltas) }
  }
  return { tasks: tasks.length, configs: summary, gainGaps: gaps,
    commonSubset: 'all three GLM configurations cover the identical S1-S22 pool; the common subset equals the full pool',
    eventFamilyDisclosure: 'no defensible incident-family grouping is recorded for S1-S22; task-level bootstrap therefore ignores within-family correlation, which may understate interval width' }
}
export function renderMarkdown(result) {
  const lines = [
    '| Configuration | median no-skill | median with-skill | mean paired Δ | headroom share |',
    '|---|---:|---:|---:|---:|',
  ]
  for (const [name, s] of Object.entries(result.configs)) {
    lines.push(`| ${name} | ${s.meanNoskill.toFixed(2)} | ${s.meanSkill.toFixed(2)} | ${s.meanDelta >= 0 ? '+' : ''}${s.meanDelta.toFixed(2)} | ${(s.headroomShare * 100).toFixed(0)}% |`)
  }
  lines.push('')
  for (const g of Object.values(result.gainGaps)) {
    lines.push(`Gain gap ${g.contrast}: ${g.mean >= 0 ? '+' : ''}${g.mean.toFixed(2)} points, 95% bootstrap CI [${g.lo.toFixed(2)}, ${g.hi.toFixed(2)}]`)
  }
  lines.push('', `Common subset: ${result.commonSubset}.`)
  lines.push(`Event-family limitation: ${result.eventFamilyDisclosure}.`)
  return lines.join('\n')
}
export function isMain(url) {
  try { return Boolean(process.argv[1]) && fileURLToPath(url) === process.argv[1].replace(/\\/g, '/') } catch { return false }
}
if (process.argv[1] && fileURLToPath(import.meta.url) === process.argv[1]) {
  const result = analyze()
  const outPath = join(ROOT, 'benchmark/results/glm-trio-common-subset.json')
  writeFileSync(outPath, JSON.stringify(result, null, 2) + '\n')
  console.log(renderMarkdown(result))
  console.log('written: ' + outPath)
  if (process.argv.includes('--check')) {
    const prev = JSON.parse(readFileSync(outPath, 'utf8'))
    if (JSON.stringify(prev) !== JSON.stringify(result)) { console.error('check failed: results drifted'); process.exit(1) }
  }
}
