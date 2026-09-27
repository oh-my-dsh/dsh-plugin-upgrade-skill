// Recompute the three GLM-5.3 rounds from frozen rubrics and original verdicts.
import fs from 'node:fs'
import path from 'node:path'
import assert from 'node:assert/strict'
import { execFileSync } from 'node:child_process'
import { fileURLToPath } from 'node:url'
import { sha256 } from '../../benchmark/report-judge/judge.mjs'
import { median, pairedBootstrap, wilcoxonSignedRank } from '../../benchmark/scripts/measure-paired-effect.mjs'
const root=fileURLToPath(new URL('../..',import.meta.url))
const git=p=>execFileSync('git',['show',`e0a9ff5:${p}`],{cwd:root,encoding:'utf8'})
const source=git('benchmark/report-judge/judge.mjs')
const {scoreDecisions}=await import('data:text/javascript;base64,'+Buffer.from(source).toString('base64'))
const read=p=>JSON.parse(fs.readFileSync(path.join(root,p),'utf8').replace(/^\uFEFF/,''))
const dirs=['2026-09-15-glm-5.3-s1-s22','2026-09-16-glm-5.3-s1-s22-r2','2026-09-17-glm-5.3-s1-s22-r3']
const rounds=dirs.map((dir,index)=>{
 const base='benchmark/results/artifacts/'+dir,rows=read(base+'/aggregate.json')
 assert.equal(rows.length,22);assert.equal(new Set(rows.map(r=>r.task)).size,22)
 const checked=[]
 for(const row of rows){const packet=JSON.parse(git(`benchmark/tasks/${row.task}/tests/packet.json`));const output={task:row.task}
  for(const arm of ['noskill','skill']){
   const report=fs.readFileSync(path.join(root,`${base}/${arm}/${row.task}/report.md`),'utf8')
   const verdict=read(`${base}/judge/${arm}/${row.task}.verdict.json`)
   const scored=scoreDecisions(packet,{'report.md':report},verdict)
   assert.equal(scored.score,row[arm],`${dir} ${row.task} ${arm}`)
   output[arm]=scored.score;output[arm+'ReportSha256']=sha256(report)
   output[arm+'VerdictSha256']=sha256(fs.readFileSync(path.join(root,`${base}/judge/${arm}/${row.task}.verdict.json`),'utf8'))
  }checked.push(output)
 }
 const totals=Object.fromEntries(['noskill','skill'].map(arm=>[arm,checked.reduce((s,r)=>s+r[arm],0)]))
 return {round:index+1,base,judge:index===2?'GLM-5.3':'GLM-5.3-Flash',totals,delta:(totals.skill-totals.noskill)/22,rows:checked}
})
const rows=rounds[0].rows.map(r=>({task:r.task,...Object.fromEntries(['noskill','skill'].map(a=>[a,median(rounds.map(x=>x.rows.find(y=>y.task===r.task)[a]))]))}))
const deltas=rows.map(r=>r.skill-r.noskill)
const totals=Object.fromEntries(['noskill','skill'].map(a=>[a,rows.reduce((s,r)=>s+r[a],0)]))
const output={rubricCommit:'e0a9ff5',scorerSha256:sha256(source),checkedAnswers:132,interpretation:'Mixed-judge descriptive supplement, not a controlled capability ladder. Bootstrap treats tasks as units; no independent validation implied.',rounds,median:{totals,meanDelta:(totals.skill-totals.noskill)/22,seed:20260907,bootstrap:pairedBootstrap(deltas),wilcoxon:wilcoxonSignedRank(deltas),rows},round3WithoutS17:rounds[2].rows.filter(r=>!r.task.startsWith('S17-')).reduce((s,r)=>s+r.skill-r.noskill,0)/21}
const target=path.join(root,'paper/generated/glm53-supplement.json'),serialized=JSON.stringify(output,null,2)+'\n'
if(process.argv.includes('--check'))assert.equal(fs.readFileSync(target,'utf8'),serialized);else fs.writeFileSync(target,serialized)
console.log(JSON.stringify({checkedAnswers:132,rounds:rounds.map(({rows,...r})=>r),median:output.median.meanDelta,ci95:output.median.bootstrap.ci95,withoutS17:output.round3WithoutS17},null,2))
