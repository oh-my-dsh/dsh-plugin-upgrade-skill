'use strict';
const fs=require('fs');
const src=fs.readFileSync('./semver-check.js','utf8');
// re-use the helpers by evaluating the file body minus its console.log block
const body=src.split('const PUBLISHED=')[0];
eval(body);

const PUBLISHED=['0.1.1-rc.1','0.1.1-rc.2','0.1.2-alpha.2'];
const out=[];
out.push('=== A) can ANY caret/tilde range over 0.1.x pin you to 0.1.1-rc.2? ===');
for(const r of ['^0.1.1-rc.1','^0.1.1-rc.2','~0.1.1-rc.2','>=0.1.1-rc.1 <0.2.0','>=0.1.1-rc.2 <0.1.2','0.1.1-rc.2']){
  out.push('  '+r.padEnd(24)+' -> '+maxSatisfying(PUBLISHED,r));
}
out.push('');
out.push('=== B) caret vs tilde for 0.1.x (are they identical?) ===');
for(const v of ['0.1.2-alpha.1','0.1.2','0.1.1-rc.2']){
  out.push('  '+('^'+v).padEnd(18)+' -> '+caret(v).padEnd(30)+'   ~'+v+' -> '+tilde(v));
}
out.push('');
out.push('=== C) proposed repin candidates vs published set ===');
for(const r of ['0.1.2-alpha.2','^0.1.2-alpha.2','~0.1.2-alpha.2','0.1.1-rc.2','^0.1.1-rc.2']){
  out.push('  '+r.padEnd(20)+' -> '+(maxSatisfying(PUBLISHED,r)??'NO MATCH'));
}
out.push('');
out.push('=== D) includePrerelease=true variant of the declared range ===');
const cands=['0.1.2-alpha.1','0.1.2-alpha.2','0.1.3-alpha.1','0.1.3','0.2.0-alpha.1','0.2.0'];
for(const c of cands){
  out.push('  '+c.padEnd(16)+'default='+(rangeTest('^0.1.2-alpha.1',parse(c),false)?'Y':'n')+'   inclPre='+(rangeTest('^0.1.2-alpha.1',parse(c),true)?'Y':'n'));
}
out.push('');
out.push('=== E) exact-pin failure surface: which of the 3 published versions are reachable? ===');
for(const v of PUBLISHED){
  out.push('  exact '+v.padEnd(16)+' -> '+(maxSatisfying(PUBLISHED,v)===v?'resolvable':'n/a')+';  also reachable via ^'+v+' -> '+maxSatisfying(PUBLISHED,'^'+v));
}
out.push('');
out.push('=== F) hypothetical future drift for ^0.1.2-alpha.1 (what a fresh install would pick over time) ===');
const timeline=[['now (published set)',PUBLISHED],['after 0.1.2 stable',PUBLISHED.concat(['0.1.2'])],['after 0.1.3 stable',PUBLISHED.concat(['0.1.2','0.1.3'])],['after 0.2.0-alpha.1',PUBLISHED.concat(['0.1.2','0.1.3','0.2.0-alpha.1'])]];
for(const [label,set] of timeline){
  out.push('  '+label.padEnd(24)+' -> ^0.1.2-alpha.1 picks '+(maxSatisfying(set,'^0.1.2-alpha.1')??'NO MATCH'));
}
console.log(out.join('\n'));