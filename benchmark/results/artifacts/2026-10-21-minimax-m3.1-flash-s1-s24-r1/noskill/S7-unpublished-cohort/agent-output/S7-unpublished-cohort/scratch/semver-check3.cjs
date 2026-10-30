'use strict';
const S=require('./semver-core.cjs');
const {parse,caret,tilde,rangeTest,maxSatisfying}=S;
const PUBLISHED=['0.1.1-rc.1','0.1.1-rc.2','0.1.2-alpha.2'];
const out=[];
out.push('=== CORRECTED expansions ===');
for(const r of ['^0.1.2-alpha.1','^0.1.2-alpha.2','^0.1.2','~0.1.2-alpha.1','~0.1.2','^0.1.1-rc.2','^0.1.1-rc.1','^0.0.5']){
  out.push('  '+r.padEnd(18)+' -> '+S.parseComparator(r).expand);
}
out.push('');
out.push('=== CORRECTED maxSatisfying over PUBLISHED ===');
for(const r of ['^0.1.2-alpha.1','^0.1.2-alpha.2','^0.1.2','~0.1.2-alpha.1','0.1.2-alpha.1','^0.1.1-rc.1','^0.1.1-rc.2','>=0.1.1-rc.1 <0.2.0','>=0.1.1-rc.2 <0.1.2','0.1.1-rc.2','0.1.2-alpha.2']){
  out.push('  '+r.padEnd(24)+' -> '+(maxSatisfying(PUBLISHED,r)??'NO MATCH (ETARGET)'));
}
out.push('');
out.push('=== CORRECTED match matrix ===');
const CAND=['0.1.1-rc.1','0.1.1-rc.2','0.1.2-alpha.1','0.1.2-alpha.2','0.1.2-alpha.3','0.1.2-beta.0','0.1.2-rc.1','0.1.2','0.1.3-alpha.1','0.1.3','0.1.9','0.2.0-alpha.1','0.2.0'];
const RANGES=['^0.1.2-alpha.1','^0.1.2-alpha.2','^0.1.2','0.1.2-alpha.1','0.1.2-alpha.2','>=0.1.1-rc.1 <0.2.0','^0.1.1-rc.2'];
out.push(['range'.padEnd(24)].concat(CAND.map(c=>c.padEnd(14))).join(' '));
for(const r of RANGES){
  out.push([r.padEnd(24)].concat(CAND.map(c=>(rangeTest(r,parse(c),false)?'MATCH':'  -  ').padEnd(14))).join(' '));
}
out.push('');
out.push('=== includePrerelease variant ===');
for(const c of ['0.1.2-alpha.2','0.1.3-alpha.1','0.1.3','0.2.0-alpha.1']){
  out.push('  '+c.padEnd(16)+'default='+(rangeTest('^0.1.2-alpha.1',parse(c),false)?'Y':'n')+'  inclPre='+(rangeTest('^0.1.2-alpha.1',parse(c),true)?'Y':'n'));
}
const timeline=[['now (published)',PUBLISHED],['+0.1.2 stable',PUBLISHED.concat(['0.1.2'])],['+0.1.3 stable',PUBLISHED.concat(['0.1.2','0.1.3'])],['+0.2.0-alpha.1',PUBLISHED.concat(['0.1.2','0.1.3','0.2.0-alpha.1'])]];
for(const r of ['^0.1.2-alpha.1','^0.1.2-alpha.2','0.1.2-alpha.2','^0.1.1-rc.2']){
  out.push('');
  out.push('=== drift: '+r+' ===');
  for(const [label,set] of timeline){ out.push('  '+label.padEnd(18)+' -> '+(maxSatisfying(set,r)??'NO MATCH')); }
}
console.log(out.join('\n'));