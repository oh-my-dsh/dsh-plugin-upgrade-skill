// Reproducible manuscript evidence; offline, no model calls. --check is read-only.
import fs from 'node:fs'
import assert from 'node:assert/strict'
import { fileURLToPath } from 'node:url'
import { join } from 'node:path'
import { scoreDecisions, sha256 } from '../../benchmark/report-judge/judge.mjs'
import { aggregate } from '../../benchmark/scripts/grade-unified-run.mjs'
import { analyze } from '../../benchmark/scripts/analyze-unified-paired.mjs'
const root=fileURLToPath(new URL('../..',import.meta.url));const read=p=>JSON.parse(fs.readFileSync(join(root,p),'utf8'))
const dir='benchmark/results/artifacts/2026-09-15-glm-5.3-flash-unified-s16'
const earlier=read(dir+'/targeted-human-review.json').cases
const selected=read('paper/audit/output-review-20260917/selection.json').cases
const later=read('paper/audit/output-review-20260917/verdicts.json').cases
assert.equal(later.length,selected.length)
assert.equal(new Set(selected.map(c=>`${c.task}:${c.arm}:${c.repeat}`)).size,selected.length)
assert.equal(new Set(later.map(c=>`${c.task}:${c.arm}:${c.repeat}`)).size,later.length)
const key=c=>`${c.task}:${c.arm}:${c.repeat}`
const all=new Map(earlier.map(c=>[key(c),{...c,report:dir+'/'+c.report,sha256:c.reportSha256}]))
for(const c of later){const s=selected.find(x=>key(x)===key(c));assert.ok(s);assert.equal(c.sha256,s.sha256);all.set(key(c),c)}
let criteria=0,changed=0;const rows=[]
const orig=aggregate(read(dir+'/schedule.json'),join(root,dir));const revised=structuredClone(orig)
for(const c of all.values()){
 const report=fs.readFileSync(join(root,c.report),'utf8');assert.equal(sha256(report),c.sha256)
 const packet=read(`${dir}/packets/${c.task}.json`)
 const result=scoreDecisions(packet,{'report.md':report},c);assert.equal(result.score,c.reviewScore)
 const prior=read(`${dir}/scores/${c.task}__${c.arm}__r${c.repeat}.json`)
 const n=c.decisions.filter(x=>prior.criteria.find(y=>y.id===x.id).verdict!==x.verdict).length
 criteria+=c.decisions.length;changed+=n
 rows.push({task:c.task,arm:c.arm,repeat:c.repeat,original:prior.score,reviewed:result.score,changedCriteria:n})
 const row=revised.rows.find(x=>x.task===c.task);const k=c.arm==='no-skill'?'noskill':'skill'
 row[k+'Cells'][c.repeat-1]=result.score;row[k]=row[k+'Cells'].reduce((a,b)=>a+b,0)/2
}
const summary=a=>{const x=analyze(a);return{meanNoSkill:x.meanNoSkill,meanWithSkill:x.meanWithSkill,meanDelta:x.meanDelta,ci95:x.bootstrap.ci95}}
const usage=read('benchmark/results/artifacts/2026-09-11-glm-5.3-flash-s1-s22/usage-summary.json')
const historicalResources=Object.fromEntries(['noskill','skill'].map(arm=>{const xs=Object.entries(usage).filter(([k])=>k.startsWith(arm+':')).map(([,v])=>v);return[arm,Object.fromEntries(['in','out','cache','total','ms'].map(k=>[k,xs.reduce((s,x)=>s+x[k],0)]).concat([['sessions',xs.length]]))]}))
const rubricHashes=Object.fromEntries([...new Set([...all.values()].map(c=>c.task))].sort().map(task=>[task,sha256(fs.readFileSync(join(root,`${dir}/packets/${task}.json`),'utf8'))]))
const output={rubricHashes,reviewedAnswers:all.size,reviewedCriteria:criteria,changedCriteria:changed,rows,original:summary(orig),allReviewedReplacementSensitivity:summary(revised),priorTargetedSensitivity:read(dir+'/targeted-human-review-summary.json').targetedReplacementSensitivity,historicalResources,interpretation:'Initial non-blind AI-assisted review with author-reported human follow-up; no separately measured inter-rater agreement. Original scores remain unchanged; report all sensitivities.'}
const target=join(root,'paper/generated/submission-evidence.json');const serialized=JSON.stringify(output,null,2)+'\n'
if(process.argv.includes('--check'))assert.equal(fs.readFileSync(target,'utf8'),serialized);else fs.writeFileSync(target,serialized)
console.log(serialized)

const fixed=x=>Number(x).toFixed(2)
const tex=String.raw`% AUTO-GENERATED from the original 64 scored cells; do not edit.
\begin{longtable}{lrrrrr}
\caption{Focal task-level original scores. Each arm has two repeats; differences use arm means. These are static rubric scores, not repair pass rates.}\label{tab:focal_tasks}\\
\toprule
Task & No skill r1 & No skill r2 & Skill r1 & Skill r2 & Mean $\Delta$\\
\midrule\endfirsthead
\toprule Task & No skill r1 & No skill r2 & Skill r1 & Skill r2 & Mean $\Delta$\\\midrule\endhead
`+orig.rows.toSorted((a,b)=>parseInt(a.task.slice(1))-parseInt(b.task.slice(1))).map(r=>`${r.task.split('-')[0]} & ${[...r.noskillCells,...r.skillCells,r.skill-r.noskill].map(fixed).join(' & ')} \\\\`).join('\n')+String.raw`
\bottomrule
\end{longtable}
`
const tablePath=join(root,'paper/generated/focal-task-table.tex')
if(process.argv.includes('--check'))assert.equal(fs.readFileSync(tablePath,'utf8'),tex);else fs.writeFileSync(tablePath,tex)
