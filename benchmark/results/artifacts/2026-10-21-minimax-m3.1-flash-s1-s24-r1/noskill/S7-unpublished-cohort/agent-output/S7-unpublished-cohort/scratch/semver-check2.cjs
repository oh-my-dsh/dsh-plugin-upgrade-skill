'use strict';
const S=require('./semver-core.cjs');
const {parse,caret,tilde,rangeTest,maxSatisfying}=S;
const PUBLISHED=['0.1.1-rc.1','0.1.1-rc.2','0.1.2-alpha.2'];
const out=[];
out.push('=== A) ways to land on 0.1.1-rc.2 (the old cohort) ===');
for(const r of ['^0.1.1-rc.1','^0.1.1-rc.2','~0.1.1-rc.2','>=0.1.1-rc.1 <0.2.0','>=0.1.1-rc.2 <0.1.2','0.1.1-rc.2']){
  out.push('  '+r.padEnd(24)+' -> '+maxSatisfying(PUBLISHED,r));
}
out.push('');
out.push('=== B) caret vs tilde on 0.1.x ===');
for(const v of ['0.1.2-alpha.1','0.1.2','0.1.1-rc.2']){
  out.push('  ^'+v.padEnd(14)+' -> '+caret(v).padEnd(28)+'  ~'+v.padEnd(14)+' -> '+tilde(v));
}
out.push('');
out.push('=== C) repin candidates against the published set ===');
for(const r of ['0.1.2-alpha.2','^0.1.2-alpha.2','~0.1.2-alpha.2','0.1.1-rc.2','^0.1.1-rc.2']){
  out.push('  '+r.padEnd(20)+' -> '+(maxSatisfying(PUBLISHED,r)??'NO MATCH'));
}
out.push('');
out.push('=== D) includePrerelease effect on the DECLARED range ===');
for(const c of ['0.1.2-alpha.1','0.1.2-alpha.2','0.1.3-alpha.1','0.1.3','0.2.0-alpha.1','0.2.0']){
  out.push('  '+c.padEnd(16)+'default='+(rangeTest('^0.1.2-alpha.1',parse(c),false)?'Y':'n')+'   inclPre='+(rangeTest('^0.1.2-alpha.1',parse(c),true)?'Y':'n'));
}
out.push('');
out.push('=== E) exact-pin reachability of the 3 published versions ===');
for(const v of PUBLISHED){
  out.push('  exact '+v.padEnd(14)+' -> '+(maxSatisfying(PUBLISHED,v)===v?'resolvable':'n/a')+';  via ^'+v+' -> '+maxSatisfying(PUBLISHED,'^'+v));
}
const timeline=[['now (published set)',PUBLISHED],['after 0.1.2 stable',PUBLISHED.concat(['0.1.2'])],['after 0.1.3 stable',PUBLISHED.concat(['0.1.2','0.1.3'])],['after 0.2.0-alpha.1',PUBLISHED.concat(['0.1.2','0.1.3','0.2.0-alpha.1'])]];
for(const r of ['^0.1.2-alpha.1','^0.1.2-alpha.2','^0.1.1-rc.2','0.1.2-alpha.2']){
  out.push('');
  out.push('=== drift over time: '+r+' ===');
  for(const [label,set] of timeline){
    out.push('  '+label.padEnd(24)+' -> '+(maxSatisfying(set,r)??'NO MATCH'));
  }
}
console.log(out.join('\n'));