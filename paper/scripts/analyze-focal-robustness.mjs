// Exhaustive descriptive sensitivity; no random draws or new model calls.
import fs from 'node:fs';
import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { fileURLToPath } from 'node:url';
import path from 'node:path';
const root=fileURLToPath(new URL('../..',import.meta.url));
const base='benchmark/results/artifacts/2026-09-15-glm-5.3-flash-unified-s16';
const inputs=[base+'/aggregate.json','paper/generated/submission-evidence.json'];
const sourceHashes=Object.fromEntries(inputs.map(p=>[p,createHash('sha256').update(fs.readFileSync(path.join(root,p))).digest('hex')]));
const read=p=>JSON.parse(fs.readFileSync(path.join(root,p),'utf8'));
const orig=read(inputs[0]).rows, review=read(inputs[1]);
const mean=xs=>xs.reduce((a,b)=>a+b,0)/xs.length;
function endpoint(kind){
 const rows=structuredClone(orig);
 for(const c of review.rows){
  if(kind==='original'||(kind==='s11-only'&&!(c.task.startsWith('S11-')&&c.arm==='with-skill'&&c.repeat===1)))continue;
  const r=rows.find(r=>r.task===c.task),arm=c.arm==='no-skill'?'noskill':'skill';r[arm+'Cells'][c.repeat-1]=c.reviewed;
 }
 const taskDeltas=rows.map(r=>({task:r.task,delta:mean(r.skillCells)-mean(r.noskillCells)}));
 const nz=taskDeltas.map(r=>r.delta).filter(x=>x!==0), observed=Math.abs(nz.reduce((a,b)=>a+b,0));
 let extreme=0;const assignments=2**nz.length;
 for(let mask=0;mask<assignments;mask++){const stat=Math.abs(nz.reduce((sum,x,j)=>sum+((mask>>j)&1?x:-x),0));if(stat>=observed-1e-12)extreme++;}
 const leaveOneOut=taskDeltas.map((r,j)=>({omittedTask:r.task,meanDelta:mean(taskDeltas.filter((_,i)=>i!==j).map(r=>r.delta))}));
 const delta=mean(taskDeltas.map(r=>r.delta));
 const expected=kind==='original'?review.original.meanDelta:kind==='s11-only'?review.priorTargetedSensitivity.meanDelta:review.allReviewedReplacementSensitivity.meanDelta;
 assert.ok(Math.abs(delta-expected)<0.0001);
 return{endpoint:kind,meanDelta:delta,taskDeltas,positive:taskDeltas.filter(r=>r.delta>0).length,negative:taskDeltas.filter(r=>r.delta<0).length,zero:taskDeltas.filter(r=>r.delta===0).length,repeatMeanDeltas:[0,1].map(i=>mean(rows.map(r=>r.skillCells[i]-r.noskillCells[i]))),signEnumeration:{nonzeroPairs:nz.length,assignments,extreme,twoSidedTailFraction:extreme/assignments},leaveOneOut,leaveOneOutRange:[Math.min(...leaveOneOut.map(r=>r.meanDelta)),Math.max(...leaveOneOut.map(r=>r.meanDelta))]};
}
const output={sourceHashes,assumption:'Conditional sign symmetry/exchangeability of independent task differences. Deterministic execution order and development exposure do not justify causal randomization inference. Retrospective descriptive sensitivity, not an additional confirmatory test.',statistic:'Absolute sum of paired task differences; enumerate every sign assignment, exclude zero pairs, count ties as extreme.',endpoints:['original','s11-only','all-reviewed'].map(endpoint)};
const serialized=JSON.stringify(output,null,2)+'\n',target=path.join(root,'paper/generated/focal-robustness.json');
if(process.argv.includes('--check'))assert.equal(fs.readFileSync(target,'utf8'),serialized);else fs.writeFileSync(target,serialized);
console.log(JSON.stringify(output.endpoints.map(({endpoint,meanDelta,repeatMeanDeltas,signEnumeration,leaveOneOutRange})=>({endpoint,meanDelta,repeatMeanDeltas,signEnumeration,leaveOneOutRange})),null,2));
