// Cross-family LLM judge panel v1 analysis (plan: paper/audit/llm-judge-panel-v1/README.md).
// Offline, no model calls.
//   --validate-only <judge>   shape-check one judge's verdicts; never unblinds.
//   --check                   read-only; exit 1 if generated outputs drift.
import fs from 'node:fs'
import assert from 'node:assert/strict'
import { fileURLToPath } from 'node:url'
import { join } from 'node:path'
import { scoreDecisions, sha256 } from '../../benchmark/report-judge/judge.mjs'
import { analyze } from '../../benchmark/scripts/analyze-unified-paired.mjs'

const root = fileURLToPath(new URL('../..', import.meta.url))
const panel = 'paper/audit/llm-judge-panel-v1'
const read = (p) => fs.readFileSync(join(root, p), 'utf8')
const readJson = (p) => JSON.parse(read(p))
const ORIGINAL = 'glm-5.3-flash'
const manifest = readJson(`${panel}/manifest.json`)
const itemIds = manifest.items.map((i) => i.id)

function loadJudge(judge) {
  const dir = `${panel}/verdicts/${judge}`
  const results = new Map()
  const errors = []
  for (const id of itemIds) {
    const path = join(root, dir, `${id}.json`)
    if (!fs.existsSync(path)) { errors.push(`${id}: missing`); continue }
    const item = readJson(`${panel}/items/${id}.json`)
    try {
      const reports = item.input.candidate_reports
      results.set(id, scoreDecisions({ rubric: item.input.rubric }, reports, JSON.parse(fs.readFileSync(path, 'utf8'))))
    } catch (error) { errors.push(`${id}: ${error.message}`) }
  }
  return { results, errors }
}

const validateAt = process.argv.indexOf('--validate-only')
if (validateAt !== -1) {
  const judge = process.argv[validateAt + 1]
  assert.ok(judge, 'usage: --validate-only <judge>')
  const { results, errors } = loadJudge(judge)
  errors.forEach((e) => console.log(e))
  console.log(`valid ${results.size}/${itemIds.length}`)
  process.exit(results.size === itemIds.length ? 0 : 1)
}

// ---- unblind ----
const keyText = read(`${panel}/unblinding/key.json`)
assert.equal(sha256(keyText), manifest.keySha256, 'key.json does not match manifest')
const key = JSON.parse(keyText)
const run = key.run
const cellKey = (c) => `${c.task}:${c.arm}:${c.repeat}`
const credit = (v) => (v === 'pass' ? 1 : v === 'partial' ? 0.5 : 0)

// judge -> Map(cellKey -> { score, credits: Map(criterion -> credit) })
const judges = new Map()
{
  const cells = new Map()
  for (const c of key.cells) {
    const s = readJson(`${run}/scores/${c.task}__${c.arm}__r${c.repeat}.json`)
    assert.equal(s.status, 'scored')
    cells.set(cellKey(c), { score: s.score, credits: new Map(s.criteria.map((x) => [x.id, credit(x.verdict)])) })
  }
  judges.set(ORIGINAL, cells)
}
const incomplete = {}
const verdictDir = join(root, panel, 'verdicts')
const panelJudges = fs.existsSync(verdictDir)
  ? fs.readdirSync(verdictDir).filter((d) => fs.statSync(join(verdictDir, d)).isDirectory()).sort() : []
const judgeMeta = {}
for (const judge of panelJudges) {
  const { results, errors } = loadJudge(judge)
  const metaPath = `${panel}/verdicts/${judge}/judge.json`
  judgeMeta[judge] = fs.existsSync(join(root, metaPath)) ? readJson(metaPath) : null
  if (errors.length) { incomplete[judge] = { valid: results.size, errors }; continue }
  const cells = new Map()
  for (const c of key.cells) {
    const r = results.get(c.id)
    cells.set(cellKey(c), { score: r.score, credits: new Map(r.decisions.map((d) => [d.id, credit(d.verdict)])) })
  }
  judges.set(judge, cells)
}
const names = [...judges.keys()]

// ---- agreement ----
const LEVELS = [0, 0.5, 1]
function agreement(pairs) {
  const n = pairs.length
  if (!n) return null
  const idx = (v) => LEVELS.indexOf(v)
  const table = LEVELS.map(() => LEVELS.map(() => 0))
  for (const [a, b] of pairs) table[idx(a)][idx(b)]++
  const w = (i, j) => 1 - Math.abs(i - j) / (LEVELS.length - 1)
  const row = table.map((r) => r.reduce((s, x) => s + x, 0) / n)
  const col = LEVELS.map((_, j) => table.reduce((s, r) => s + r[j], 0) / n)
  let po = 0, pe = 0
  LEVELS.forEach((_, i) => LEVELS.forEach((_, j) => { po += w(i, j) * table[i][j] / n; pe += w(i, j) * row[i] * col[j] }))
  const exact = pairs.filter(([a, b]) => a === b).length
  return { n, exact, exactRate: round4(exact / n), weightedKappa: 1 - pe === 0 ? null : round4((po - pe) / (1 - pe)), table }
}
const round4 = (x) => Math.round(x * 1e4) / 1e4
const criterionPairs = (a, b, cells) => cells.flatMap((k) => {
  const x = judges.get(a).get(k).credits, y = judges.get(b).get(k).credits
  return [...x.keys()].map((id) => [x.get(id), y.get(id)])
})
const allCells = key.cells.map(cellKey)
const pairwise = []
for (let i = 0; i < names.length; i++) for (let j = i + 1; j < names.length; j++) {
  const [a, b] = [names[i], names[j]]
  const diffs = allCells.map((k) => Math.abs(judges.get(a).get(k).score - judges.get(b).get(k).score))
  pairwise.push({ a, b, criteria: agreement(criterionPairs(a, b, allCells)),
    meanAbsCellScoreDiff: round4(diffs.reduce((s, x) => s + x, 0) / diffs.length),
    cellsIdentical: diffs.filter((d) => d === 0).length })
}

// ---- endpoint sensitivity ----
function endpoint(scoreOf, label) {
  const tasks = [...new Set(key.cells.map((c) => c.task))].sort()
  const rows = tasks.map((task) => {
    const arm = (a) => [1, 2].map((r) => scoreOf(`${task}:${a}:${r}`))
    const noskillCells = arm('no-skill'), skillCells = arm('with-skill')
    const m = (xs) => Math.round((xs.reduce((s, x) => s + x, 0) / xs.length) * 100) / 100
    return { task, method: 'llm-rubric', noskill: m(noskillCells), skill: m(skillCells), noskillCells, skillCells, unscoredCells: 0, notes: [] }
  })
  const x = analyze({ run, model: label, rows })
  return { judge: label, meanNoSkill: x.meanNoSkill, meanWithSkill: x.meanWithSkill, meanDelta: x.meanDelta,
    ci95: x.bootstrap.ci95, wilcoxonP: x.wilcoxon.pTwoSided ?? null, positiveDeltas: x.positiveDeltas, negativeDeltas: x.negativeDeltas }
}
const endpoints = names.map((n) => endpoint((k) => judges.get(n).get(k).score, n))
assert.equal(endpoints[0].meanDelta, 4.9219, 'original endpoint must reproduce the paper')
const meanOf = (group) => (k) => group.reduce((s, n) => s + judges.get(n).get(k).score, 0) / group.length
const crossFamily = names.filter((n) => n !== ORIGINAL)
if (names.length > 1) endpoints.push(endpoint(meanOf(names), `mean of all ${names.length} judges`))
if (crossFamily.length > 1) endpoints.push(endpoint(meanOf(crossFamily), `mean of ${crossFamily.length} cross-family judges`))

// ---- non-blind author-review reference (same union as summarize-submission-evidence) ----
const earlier = readJson(`${run}/targeted-human-review.json`).cases
const later = readJson('paper/audit/output-review-20260917/verdicts.json').cases
const author = new Map(earlier.map((c) => [cellKey(c), c]))
for (const c of later) author.set(cellKey(c), c)
const authorCells = [...author.keys()]
const authorRef = names.map((n) => {
  const pairs = authorCells.flatMap((k) => author.get(k).decisions.map((d) => [credit(d.verdict), judges.get(n).get(k).credits.get(d.id)]))
  return { judge: n, ...agreement(pairs) }
})
assert.equal(authorRef[0].n, 56)

// ---- where panel judges depart from the original, by arm and by visible skill mention ----
const MENTION = /plugin-upgrade|SKILL\.md|skills\//i
const stratum = (c) => c.arm === 'no-skill' ? 'no-skill'
  : `with-skill, ${MENTION.test(read(c.report)) ? 'report mentions skill' : 'no skill mention'}`
const departures = Object.fromEntries(crossFamily.map((n) => {
  const rows = {}
  for (const c of key.cells) {
    const s = stratum(c)
    rows[s] ??= { cells: 0, criteria: 0, lower: 0, higher: 0 }
    rows[s].cells++
    const o = judges.get(ORIGINAL).get(cellKey(c)).credits, p = judges.get(n).get(cellKey(c)).credits
    for (const [id, v] of o) { rows[s].criteria++; if (p.get(id) < v) rows[s].lower++; else if (p.get(id) > v) rows[s].higher++ }
  }
  return [n, rows]
}))

const output = {
  schemaVersion: 'llm-judge-panel-v1', run, protocol: `${panel}/README.md`,
  itemCount: itemIds.length, criterionDecisions: criterionPairs(ORIGINAL, ORIGINAL, allCells).length,
  judges: names, judgeMeta, incomplete, pairwise, endpoints, departuresFromOriginal: departures,
  authorReviewReference: { answers: authorCells.length, note: 'non-blind plugin-author review; reference point, not gold standard', rows: authorRef },
  interpretation: 'LLM judges only; not human validation. The original GLM judgment remains the primary recorded endpoint.',
}

// ---- LaTeX ----
const f2 = (x) => (x < 0 ? '$-$' : x > 0 ? '+' : '') + Math.abs(x).toFixed(2)
const ci = ([lo, hi]) => `[${f2(lo)}, ${f2(hi)}]`
const esc = (s) => s.replace(/_/g, '\\_')
const vsOriginal = (n) => pairwise.find((p) => p.a === ORIGINAL && p.b === n)
const displayLabel = (n) => ({
  'glm-5.3-flash': 'GLM-5.3-Flash (original)',
  'claude-opus-5-5': 'Claude Opus 5.5',
  'openai-gpt-5.5': 'GPT-5.5',
  'mean of all 3 judges': 'All-judge mean',
  'mean of 2 cross-family judges': 'Cross-family mean',
})[n] ?? esc(n)
const tableRows = endpoints.map((e) => {
  const judgeRow = judges.has(e.judge)
  const agree = judgeRow && e.judge !== ORIGINAL ? vsOriginal(e.judge).criteria : null
  const ref = judgeRow ? authorRef.find((r) => r.judge === e.judge) : null
  return `  ${displayLabel(e.judge)} & ${e.meanNoSkill.toFixed(2)} $\\rightarrow$ ${e.meanWithSkill.toFixed(2)} & ${f2(e.meanDelta)} & ${ci(e.ci95)} & `
    + `${agree ? `${(agree.exactRate * 100).toFixed(1)}\\% / ${agree.weightedKappa?.toFixed(2) ?? 'NA'}` : '--'} & `
    + `${ref ? `${ref.exact}/${ref.n}` : '--'} \\\\`
})
const pairText = pairwise.filter((p) => p.a !== ORIGINAL).map((p) => `${esc(p.a)} vs ${esc(p.b)}: ${(p.criteria.exactRate * 100).toFixed(1)}\\% exact, $\\kappa_w$ = ${p.criteria.weightedKappa?.toFixed(2) ?? 'NA'}`).join('; ')
const tex = `% AUTO-GENERATED. DO NOT EDIT.
% Source: paper/scripts/analyze-llm-judge-panel.mjs (${panel})
\\begin{table}[t]
\\centering
\\small
\\setlength{\\tabcolsep}{3pt}
\\begin{tabular}{lccccc}
\\toprule
Judge & no-skill $\\rightarrow$ with-skill & $\\Delta$ & 95\\% CI & vs.\\ original & vs.\\ author \\\\
\\midrule
${tableRows.join('\n')}
\\bottomrule
\\end{tabular}
\\par\\smallskip
{\\footnotesize All ${itemIds.length} focal reports (${output.criterionDecisions} criterion decisions) re-judged without supplied arm labels or prior scores under the unchanged report-judge-v2 prompt and rubric. \`\`vs.\\ original'': exact credit-level agreement / linearly weighted $\\kappa$ with the original GLM decisions. \`\`vs.\\ author'': exact agreement with the ${authorRef[0].n} decisions of the non-blind plugin-author review (${authorCells.length} answers), which is a reference, not ground truth.${pairText ? ` Between panel judges: ${pairText}.` : ''} All judges are LLMs; this is not human validation.\\par}
\\caption{Sensitivity of the focal paired endpoint to judge configuration. Estimand, bootstrap, and seed as in Section~\\ref{sec:focal-method}; the original row is the primary recorded endpoint.}
\\label{tab:judge_panel}
\\end{table}
`
const targets = { 'paper/generated/llm-judge-panel.json': JSON.stringify(output, null, 2) + '\n', 'paper/generated/llm-judge-panel-table.tex': tex }
for (const [p, text] of Object.entries(targets)) {
  if (process.argv.includes('--check')) assert.equal(read(p), text, `drift: ${p}`)
  else fs.writeFileSync(join(root, p), text)
}
console.log(JSON.stringify({ judges: names, incomplete: Object.fromEntries(Object.entries(incomplete).map(([k, v]) => [k, v.valid])),
  endpoints: endpoints.map((e) => [e.judge, e.meanDelta, e.ci95]),
  pairwise: pairwise.map((p) => [p.a, p.b, p.criteria.exactRate, p.criteria.weightedKappa]),
  author: authorRef.map((r) => [r.judge, `${r.exact}/${r.n}`]) }, null, 1))
