'use strict';
const S=require('./semver-core.cjs');
const {parse,rangeTest,maxSatisfying}=S;
const P=['0.1.1-rc.1','0.1.1-rc.2','0.1.2-alpha.2'];
const RANGES=['^0.1.2-alpha.1','^0.1.2-alpha.2','0.1.2-alpha.2','>=0.1.2-alpha.2 <0.1.3-0','0.1.1-rc.2','^0.1.1-rc.2','^0.1.2','0.1.2-alpha.1','>=0.1.1-rc.2 <0.2.0'];
const VERS=['0.1.1-rc.1','0.1.1-rc.2','0.1.2-alpha.1','0.1.2-alpha.2','0.1.2-alpha.3','0.1.2-beta.0','0.1.2-rc.1','0.1.2','0.1.3-alpha.1','0.1.3','0.1.9','0.2.0-alpha.1','0.2.0'];
const out=[];
out.push('=== FINAL TABLE: range -> resolves today | matches ===');
for(const r of RANGES){
  const res=maxSatisfying(P,r);
  out.push('');
  out.push('RANGE '+r+'   ->  resolves today to: '+(res??'*** NO MATCH / ETARGET -> npm install FAILS ***'));
  out.push('  matches: '+VERS.map(v=>(rangeTest(r,parse(v),false)?'[x] ':'[ ] ')+v).join(' '));
}
out.push('');
out.push('=== bounded-window check: >=0.1.2-alpha.2 <0.1.3-0 ===');
for(const v of ['0.1.2-alpha.2','0.1.2-alpha.3','0.1.2-beta.0','0.1.2-rc.1','0.1.2','0.1.3-alpha.1','0.1.3','0.2.0-alpha.1']){
  out.push('  '+v.padEnd(16)+(rangeTest('>=0.1.2-alpha.2 <0.1.3-0',parse(v),false)?'IN':'out'));
}
console.log(out.join('\n'));