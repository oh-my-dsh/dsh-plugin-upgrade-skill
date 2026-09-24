// Offline audit: frozen report hashes, all original verdict arithmetic,
// targeted AI review arithmetic and a disclosed sensitivity analysis.
// No solver or judge endpoint is called. --check never writes files.
import { readFileSync, writeFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { join, posix, win32 } from 'node:path'
import assert from 'node:assert/strict'
import { scoreDecisions, sha256 } from '../report-judge/judge.mjs'
import { aggregate } from './grade-unified-run.mjs'
import { analyze } from './analyze-unified-paired.mjs'
const repo = fileURLToPath(new URL('../..', import.meta.url))
const root = join(repo, 'benchmark/results/artifacts/2026-09-15-glm-5.3-flash-unified-s16')
const read = p => JSON.parse(readFileSync(p, 'utf8'))
const schedule = read(join(root, 'schedule.json'))
let directHashes = 0, restoredLinkHashes = 0, originalCriteria = 0
for (const cell of schedule.cells) {
  const sub = `${cell.arm}/r${cell.repeat}/${cell.task}`
  const report = readFileSync(join(root, 'reports', sub, 'report.md'), 'utf8')
  const details = read(join(root, 'judge', sub, 'details.json'))
  const verdict = read(join(root, 'judge', sub, 'verdict.json'))
  const score = read(join(root, 'scores', `${cell.task}__${cell.arm}__r${cell.repeat}.json`))
  const packet = read(join(repo, 'benchmark/tasks', cell.task, 'tests/packet.json'))
  assert.equal(sha256(JSON.stringify(packet)), details.packet_sha256)
  if (sha256(report) === details.reports['report.md']) directHashes++
  else {
    const rawLinks = report.replace(/\]\((?:\.\.\/)+skills\/plugin-upgrade\//g, '](../../skills/plugin-upgrade/')
    assert.equal(sha256(rawLinks), details.reports['report.md'], `unexplained report change: ${sub}`)
    restoredLinkHashes++
  }
  const result = scoreDecisions(packet, { 'report.md': report }, verdict)
  assert.equal(result.score, score.score)
  assert.equal(result.score, details.score)
  originalCriteria += result.decisions.length
}
const original = aggregate(schedule, root)
assert.deepEqual(original, read(join(root, 'aggregate.json')))
const audit = read(join(root, 'targeted-ai-review.json'))
const sensitivity = structuredClone(original)
let reviewedCriteria = 0, changedCriteria = 0
for (const c of audit.cases) {
  const report = readFileSync(join(root, c.report), 'utf8')
  assert.equal(sha256(report), c.reportSha256)
  const packet = read(join(repo, 'benchmark/tasks', c.task, 'tests/packet.json'))
  assert.equal(sha256(JSON.stringify(packet)), c.packetSha256)
  const result = scoreDecisions(packet, { 'report.md': report }, c)
  assert.equal(result.score, c.reviewScore)
  const originalVerdict = read(join(root, 'judge', c.arm, `r${c.repeat}`, c.task, 'verdict.json'))
  const originalScore = read(join(root, 'scores', `${c.task}__${c.arm}__r${c.repeat}.json`))
  assert.equal(originalScore.score, c.originalScore)
  reviewedCriteria += result.decisions.length
  changedCriteria += c.decisions.filter(x => originalVerdict.decisions.find(y => y.id === x.id).verdict !== x.verdict).length
  const row = sensitivity.rows.find(x => x.task === c.task)
  const key = c.arm === 'no-skill' ? 'noskillCells' : 'skillCells'
  row[key][c.repeat - 1] = result.score
  row[c.arm === 'no-skill' ? 'noskill' : 'skill'] = row[key].reduce((a,b) => a+b,0)/row[key].length
}
// Independently reproduce the S11 candidate helper's missed parent-directory case.
const counterexamples = [posix, win32].map(p => {
  const root = p === posix ? '/srv/lib' : 'E:\\srv\\lib'
  const target = p.dirname(root), rel = p.relative(root, target)
  const accepted = rel === '' || (!rel.startsWith('..' + p.sep) && !p.isAbsolute(rel))
  assert.equal(rel, '..'); assert.equal(accepted, true)
  return { root, target, rel, accepted }
})
const log = readFileSync(join(root,'execution-log.jsonl'),'utf8').trim().split('\n').map(JSON.parse)
const formal = log.filter(x => x.stage === 'solver' && x.cell && !x.cell.includes(':pilot'))
assert.equal(formal.length,64); assert.equal(new Set(formal.map(x=>x.cell)).size,64)
const resources = Object.fromEntries(['no-skill','with-skill'].map(arm=> {
  const rows = formal.filter(x=>x.cell.split(':')[1] === arm)
  return [arm,{cells:rows.length,subagentTokens:rows.reduce((s,x)=>s+x.subagent_tokens,0),summedCellSeconds:rows.reduce((s,x)=>s+x.duration_s,0),rangeSeconds:[Math.min(...rows.map(x=>x.duration_s)),Math.max(...rows.map(x=>x.duration_s))]}]
}))
const summarize = a => {const d=analyze(a);return {meanNoSkill:d.meanNoSkill,meanWithSkill:d.meanWithSkill,meanDelta:d.meanDelta,ci95:d.bootstrap.ci95,bootstrap:d.bootstrap,wilcoxon:d.wilcoxon}}
const output = {sourceCommit:audit.sourceCommit,originalCells:schedule.cells.length,originalCriteria,directHashes,restoredLinkHashes,reviewedReports:audit.cases.length,reviewedCriteria,changedCriteria,original:summarize(original),targetedReplacementSensitivity:summarize(sensitivity),sensitivityCaveat:'Selective non-blind AI re-review, not a fully regraded dataset or an independent confirmatory confidence interval. Original unreviewed scores retained.',resources,subagentTokenRatio:resources['with-skill'].subagentTokens/resources['no-skill'].subagentTokens,summedCellSecondsRatio:resources['with-skill'].summedCellSeconds/resources['no-skill'].summedCellSeconds,counterexamples}
const target = join(root,'targeted-ai-review-summary.json')
if(process.argv.includes('--check')) assert.deepEqual(output,read(target))
else writeFileSync(target,JSON.stringify(output,null,2)+'\n')
console.log(JSON.stringify(output,null,2))
