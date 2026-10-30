// ESM-safe rewrite of the judge driver (no require() inside ESM).
import { readFileSync, writeFileSync, existsSync, mkdirSync, readdirSync, lstatSync } from 'node:fs'
import { join } from 'node:path'

const REPO = 'E:/deepseek-harness/dsh-plugin-upgrade-skill'
const RUN = join(REPO, 'benchmark/results/artifacts/2026-10-12-step5-preview-s1-s24-r1')
const { RUBRICS } = await import('file:///' + join(REPO, 'benchmark/report-judge/rubrics.mjs').replace(/\\/g, '/'))

// Judge-side adjudication (judge-side-adjudication.md + 2026-10-16 follow-up):
// only S19/noskill stays invalid; rerun-clean S19/skill and S11/skill re-enter scoring.
const INVALID = new Set(['S19-phantom-update-stale-host/noskill'])

const findReports = (arm, task) => {
  const outRoot = join(RUN, arm, task, 'agent-output')
  if (!existsSync(outRoot)) return []
  const files = []
  const walk = (dir, prefix = '') => {
    for (const e of readdirSync(dir).sort()) {
      const p = join(dir, e)
      const st = lstatSync(p)
      if (st.isDirectory()) walk(p, prefix + e + '/')
      else if (st.isFile() && /\.(md|txt|json|jsonl|log)$/.test(e)) files.push({ rel: prefix + e, text: readFileSync(p, 'utf8') })
    }
  }
  walk(outRoot)
  return files
}

const cells = []
// Only tasks that actually ran in this benchmark (S1–S24 both arms on disk).
const ranTasks = new Set(readdirSync(join(RUN, 'noskill')).filter(t => existsSync(join(RUN, 'skill', t))))
for (const task of Object.keys(RUBRICS).filter(t => ranTasks.has(t))) {
  for (const arm of ['noskill', 'skill']) {
    if (INVALID.has(`${task}/${arm}`)) continue
    cells.push({ arm, task, reports: findReports(arm, task) })
  }
}

const mode = process.argv[2]

if (mode === 'briefs') {
  mkdirSync(join(RUN, 'judge-briefs'), { recursive: true })
  let n = 0
  for (const c of cells) {
    const rubric = RUBRICS[c.task]
    const crit = rubric.criteria.map(x => `- [${x.id}] (${x.points}pt) ${x.requirement}`).join('\n')
    const caps = (rubric.caps ?? []).map(x => `- CAP [${x.id}] ceiling=${x.total} ${x.requirement ?? ''}`).join('\n') || '(none)'
    const reports = c.reports
      .map(f => `#### FILE: ${f.rel}\n\n${f.text.length > 60000 ? f.text.slice(0, 60000) + '\n…[truncated]' : f.text}`)
      .join('\n\n') || '(NO REPORT)'
    const brief = `# JUDGE BRIEF · ${c.arm}.${c.task}

## Criteria (sealed rubric)
${crit}

## Caps (score ceilings; judge returns each with triggered true/false)
${caps}

## Candidate report(s)
${reports}

## Required output (JSON only)
{"decisions":[{"id":"<criterion-id>","verdict":"pass|partial|fail|missing","reason":"short"}],"caps":[{"id":"<cap-id>","triggered":false,"reason":"short"}]}
Every criterion and cap exactly once. pass=full points, partial=half, fail/missing=0; a triggered cap caps the total.`
    writeFileSync(join(RUN, 'judge-briefs', `${c.arm}.${c.task}.md`), brief)
    n++
  }
  console.log(`briefs written: ${n} (skipped invalid: ${INVALID.size})`)
}

if (mode === 'score') {
  const outDirName = process.argv[3] ?? 'judge-out'
  const resultsName = process.argv[4] ?? 'judge-results.json'
  const results = []
  for (const c of cells) {
    const rubric = RUBRICS[c.task]
    const outPath = join(RUN, outDirName, `${c.arm}.${c.task}.json`)
    if (!c.reports.some(f => f.text.trim())) { results.push({ arm: c.arm, task: c.task, status: 'scored', score: 0, reason: 'no report provided' }); continue }
    if (!existsSync(outPath)) { results.push({ arm: c.arm, task: c.task, status: 'UNJUDGED', score: null }); continue }
    let v
    try { v = JSON.parse(readFileSync(outPath, 'utf8')) } catch { results.push({ arm: c.arm, task: c.task, status: 'BAD_JSON', score: null }); continue }
    const critMap = new Map(rubric.criteria.map(x => [x.id, x]))
    const capMap = new Map((rubric.caps ?? []).map(x => [x.id, x]))
    const seen = new Set(); const seenCaps = new Set()
    let raw = 0; const decisions = []; const caps = []; let err = null
    for (const d of v.decisions ?? []) {
      const c2 = critMap.get(d?.id)
      if (!c2 || seen.has(d.id)) { err = `unknown/duplicate criterion ${d?.id}`; break }
      seen.add(d.id)
      if (!['pass', 'partial', 'fail', 'missing'].includes(d.verdict)) { err = `bad verdict ${d.id}`; break }
      const credit = d.verdict === 'pass' ? 1 : d.verdict === 'partial' ? 0.5 : 0
      decisions.push({ id: d.id, verdict: d.verdict, points: c2.points, awarded: c2.points * credit, reason: d.reason })
      raw += c2.points * credit
    }
    if (!err && seen.size !== critMap.size) err = `missing criteria (${seen.size}/${critMap.size})`
    if (!err) for (const cp of v.caps ?? []) {
      const def = capMap.get(cp?.id)
      if (!def || seenCaps.has(cp.id) || typeof cp.triggered !== 'boolean') { err = `bad cap ${cp?.id}`; break }
      seenCaps.add(cp.id)
      caps.push({ id: cp.id, triggered: cp.triggered, total: def.total, reason: cp.reason })
    }
    if (!err && seenCaps.size !== capMap.size) err = `missing caps (${seenCaps.size}/${capMap.size})`
    if (err) { results.push({ arm: c.arm, task: c.task, status: 'INVALID_DECISIONS', error: err, score: null }); continue }
    const score = Math.min(raw, ...caps.filter(x => x.triggered).map(x => x.total))
    results.push({ arm: c.arm, task: c.task, status: 'scored', score, decisions, caps })
  }
  const agg = {}
  for (const r of results) {
    if (r.status !== 'scored') continue
    agg[r.arm] = agg[r.arm] ?? { n: 0, total: 0, byTask: {} }
    agg[r.arm].n++; agg[r.arm].total += r.score
    agg[r.arm].byTask[r.task] = r.score
  }
  for (const a of Object.values(agg)) a.mean = +(a.total / a.n).toFixed(1)
  const invalidRows = [...INVALID].map(k => ({ cell: k, score: 0, reason: 'invalid:roaming (real out-of-allowlist write; adjudication)' }))
  writeFileSync(join(RUN, resultsName), JSON.stringify({ generated_at: new Date().toISOString(), judge: outDirName, invalid: invalidRows, results, aggregate: agg }, null, 2) + '\n')
  for (const [arm, a] of Object.entries(agg)) console.log(`${arm}: n=${a.n} mean=${a.mean}`)
  console.log('unscored/problem cells:', results.filter(r => r.status !== 'scored').length)
}

if (!mode) console.log('usage: node .judge-drive.mjs briefs|score')
