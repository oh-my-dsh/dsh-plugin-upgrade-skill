// Offline mechanism probes, not full plugin execution or new solver grading.
import fs from 'node:fs';
import assert from 'node:assert/strict';
import path from 'node:path';
import { spawn } from 'node:child_process';
import { createHash } from 'node:crypto';
import { fileURLToPath } from 'node:url';
const root=fileURLToPath(new URL('../..',import.meta.url));
const base='benchmark/results/artifacts/2026-09-15-glm-5.3-flash-unified-s16';
const sources=[`${base}/reports/with-skill/r1/S11-mermaid-lazyload-trap/report.md`,`${base}/reports/with-skill/r2/S18-terminal-sprite-render-trap/report.md`,'benchmark/tasks/S18-terminal-sprite-render-trap/tests/packet.json'];
const texts=sources.map(p=>fs.readFileSync(path.join(root,p),'utf8'));
const hash=s=>createHash('sha256').update(s).digest('hex');
const sourceHashes=Object.fromEntries(sources.map((p,i)=>[p,hash(texts[i])]));
const extracted=texts[0].match(/const contained = \(root: string, target: string\): boolean => \{[\s\S]*?\n\}/)?.[0];
assert.ok(extracted,'archived function must be present');
const js=extracted.replace('(root: string, target: string): boolean','(root, target)');
// Reviewed pure function only; fail closed if source statements change.
assert.equal(js,"const contained = (root, target) => {\n  const rel = relative(root, target)\n  return rel === '' || (!rel.startsWith('..' + sep) && !isAbsolute(rel))\n}");
const cases=[['root','/srv/lib',true],['descendant','/srv/lib/x.js',true],['parent','/srv',false],['ancestor','/',false],['sibling-prefix','/srv/library/x.js',false],['dotted-descendant','/srv/lib/..cache/x.js',true],['case-sibling','/srv/LIB/x.js',false]];
const windows=[['root','E:\\srv\\lib',true],['descendant-case','e:\\srv\\lib\\x.js',true],['parent','E:\\srv',false],['ancestor','E:\\',false],['sibling-prefix','E:\\srv\\library\\x.js',false],['dotted-descendant','E:\\srv\\lib\\..cache\\x.js',true],['cross-drive','C:\\srv\\lib\\x.js',false]];
const containment=[];
for(const [flavor,api,basePath,inputs] of [['posix',path.posix,'/srv/lib',cases],['win32',path.win32,'E:\\srv\\lib',windows]]){
 const fn=new Function('relative','isAbsolute','sep',js+'; return contained;')(api.relative,api.isAbsolute,api.sep);
 for(const [name,target,expected] of inputs){const actual=fn(basePath,target);containment.push({flavor,name,root:basePath,target,relative:api.relative(basePath,target),expected,actual});assert.equal(actual!==expected,name==='parent');}
}
assert.ok(texts[1].includes('header.unmount();'));
const packet=JSON.parse(texts[2]);assert.ok(packet.rubric.criteria.find(c=>c.id==='timer-liveness').requirement.includes('Unref each newly scheduled'));
// Minimal reconstruction: no original planner source exists in the fixture.
const child=String.raw`
const mode=process.argv[1]; let mounted=true, handle, count=0;
function schedule(){if(!mounted)return;handle=setTimeout(()=>{count++;schedule()},20);if(mode==='every-unref'||(mode==='first-unref'&&count===0))handle.unref();}
function unmount(){mounted=false;clearTimeout(handle);}
schedule();
if(mode==='unmount')setTimeout(unmount,80);
if(mode==='first-unref')setTimeout(()=>{},100);
process.stdout.write('READY\n');
`;
async function probe(mode){
 return await new Promise((resolve,reject)=>{
  const p=spawn(process.execPath,['-e',child,mode],{stdio:['ignore','pipe','pipe']});let stdout='',stderr='',ready=false,cutoff=false;
  let timer=setTimeout(()=>{p.kill('SIGKILL');reject(new Error('child startup timeout'));},5000);
  p.stdout.on('data',b=>{stdout+=b;if(!ready&&stdout.includes('READY\n')){ready=true;clearTimeout(timer);timer=setTimeout(()=>{cutoff=true;p.kill('SIGKILL');},700);}});
  p.stderr.on('data',b=>stderr+=b);p.on('error',e=>{clearTimeout(timer);reject(e)});
  p.on('close',(code,signal)=>{clearTimeout(timer);if(!ready||stderr||(!cutoff&&code!==0))return reject(new Error(JSON.stringify({mode,ready,code,signal,stderr})));resolve({mode,outcome:cutoff?'alive-at-observation-limit':'natural-exit',exitCode:code,signal});});
 });
}
const timerResults=[];
for(const mode of ['referenced','cleanup-not-invoked','unmount','every-unref','first-unref']){
 const result=await probe(mode);assert.equal(result.outcome,['unmount','every-unref'].includes(mode)?'natural-exit':'alive-at-observation-limit');timerResults.push(result);
}
const output={sourceHashes,extractedFunction:extracted,scope:'Exact S11 pure predicate; reconstructed S18 timer mechanism, not end-to-end repairs.',containment,timerObservationMilliseconds:700,timerResults};
const target=path.join(root,'paper/audit/mechanism-checks-20260917/results.json');
const serialized=JSON.stringify(output,null,2)+'\n';
if(process.argv.includes('--check'))assert.equal(fs.readFileSync(target,'utf8'),serialized);else {fs.writeFileSync(target,serialized);fs.writeFileSync(path.join(root,'paper/audit/mechanism-checks-20260917/environment.json'),JSON.stringify({node:process.version,platform:process.platform,arch:process.arch,scriptSha256:hash(fs.readFileSync(fileURLToPath(import.meta.url)))},null,2)+'\n');}
console.log(`14 containment inputs checked; 2 parent-path discrepancies. Timer outcomes: ${timerResults.map(x=>x.mode+': '+x.outcome).join('; ')}.`);
