'use strict';
const S=require('./semver-core.cjs');
const {parse,rangeTest,maxSatisfying,caret,tilde}=S;
let fails=0;
function chk(l,g,w){const ok=g===w;if(!ok)fails++;console.log((ok?'  PASS  ':'  FAIL  ')+l.padEnd(26)+' got='+String(g).padEnd(24)+' want='+w);}
console.log('=== SELF-TEST A: caret/tilde expansions vs semver.org spec table ===');
chk('^1.2.3',caret('1.2.3'),'>=1.2.3 <2.0.0-0');
chk('^0.2.3',caret('0.2.3'),'>=0.2.3 <0.3.0-0');
chk('^0.0.3',caret('0.0.3'),'>=0.0.3 <0.0.4-0');
chk('^0.1.2',caret('0.1.2'),'>=0.1.2 <0.2.0-0');
chk('^0.1.2-alpha.1',caret('0.1.2-alpha.1'),'>=0.1.2-alpha.1 <0.2.0-0');
chk('^0.1.2-alpha.2',caret('0.1.2-alpha.2'),'>=0.1.2-alpha.2 <0.2.0-0');
chk('~1.2.3',tilde('1.2.3'),'>=1.2.3 <1.3.0-0');
chk('~0.1.2',tilde('0.1.2'),'>=0.1.2 <0.2.0-0');
chk('~0.0.3',tilde('0.0.3'),'>=0.0.3 <0.0.4-0');
chk('~0.1.2-alpha.1',tilde('0.1.2-alpha.1'),'>=0.1.2-alpha.1 <0.2.0-0');
console.log('=== SELF-TEST B: satisfy() behaviours ===');
const T=[['1.2.3','^1.2.3',1],['2.0.0','^1.2.3',0],['1.2.3-alpha.1','^1.2.3',0],['1.2.4-alpha.1','^1.2.3',0],['1.3.0-beta.1','^1.2.3',0],['1.2.4','^1.2.3',1],['1.3.0','^1.2.3',1],['1.9.9','^1.2.3',1],['2.0.0-0','^1.2.3',0],['0.1.2-alpha.2','^0.1.2-alpha.1',1],['0.1.1-rc.2','^0.1.2-alpha.1',0],['0.2.0','^0.1.2-alpha.1',0],['0.1.2-alpha.2','^0.1.2',0],['0.1.2','^0.1.2',1],['0.1.3-alpha.1','^0.1.2',0],['0.1.3','^0.1.2',1],['0.1.3','^0.1.2-alpha.1',1]];
for(const [v,r,w] of T) chk(v+' ~ '+r, rangeTest(r,parse(v),false)?1:0, w);
console.log('  self-test failures: '+fails);

const P=['0.1.1-rc.1','0.1.1-rc.2','0.1.2-alpha.2'];
console.log('');
console.log('=== HEADLINE: declared range ===');
console.log('  ^0.1.2-alpha.1  =>  '+caret('0.1.2-alpha.1'));
console.log('  max satisfying over published {0.1.1-rc.1, 0.1.1-rc.2, 0.1.2-alpha.2} => '+(maxSatisfying(P,'^0.1.2-alpha.1')??'ETARGET'));
console.log('  => npm install SUCCEEDS today; it does NOT fail.');
console.log('');
console.log('=== CANDIDATE REPINS (must resolve today) ===');
for(const r of ['0.1.2-alpha.2','^0.1.2-alpha.2','~0.1.2-alpha.2','0.1.1-rc.2','^0.1.1-rc.2','^0.1.1-rc.1 || ^0.1.2-alpha.2','>=0.1.2-alpha.2 <0.1.3-0','0.1.2-alpha.2 || 0.1.1-rc.2']){
  console.log('  '+r.padEnd(34)+' -> '+(maxSatisfying(P,r)??'NO MATCH'));
}
console.log('');
console.push=0;
console.log('=== ANTI-PATTERNS (fail today) ===');
for(const r of ['0.1.2-alpha.1','=0.1.2-alpha.1','^0.1.2','~0.1.2','>=0.1.2 <0.2.0','^0.1.2-alpha.1 <0.1.2-alpha.2']){
  console.log('  '+r.padEnd(34)+' -> '+(maxSatisfying(P,r)??'ETARGET -> npm install FAILS'));
}
console.log('');
console.log('=== PRERELEASE-ELIGIBILITY TRAP (why >=0.1.1-rc.2 <0.2.0 excludes 0.1.2-alpha.2) ===');
for(const r of ['>=0.1.1-rc.2 <0.2.0','>=0.1.2-alpha.2 <0.1.3-0','>=0.1.1-rc.2 <0.1.2-alpha.3']){
  console.log('  '+r.padEnd(34)+' -> 0.1.2-alpha.2 '+(rangeTest(r,parse('0.1.2-alpha.2'),false)?'ELIGIBLE':'EXCLUDED (tuple 0.1.2 has no prerelease comparator)'));
}
console.log('');
console.log('=== DRIFT over time (fresh-install target per range) ===');
const T2=[['now',P],['+0.1.2 stable',P.concat(['0.1.2'])],['+0.1.3 stable',P.concat(['0.1.2','0.1.3'])],['+0.2.0-alpha.1',P.concat(['0.1.2','0.1.3','0.2.0-alpha.1'])]];
for(const r of ['^0.1.2-alpha.1','^0.1.2-alpha.2','0.1.2-alpha.2','^0.1.1-rc.2','>=0.1.2-alpha.2 <0.1.3-0']){
  console.log('  '+r);
  for(const [l,set] of T2) console.log('     '+l.padEnd(16)+' -> '+(maxSatisfying(set,r)??'NO MATCH'));
}
console.log('');
console.log('=== includePrerelease=true effect on declared range ===');
for(const c of ['0.1.2-alpha.2','0.1.3-alpha.1','0.1.3','0.2.0-alpha.1']){
  console.log('  '+c.padEnd(16)+'default='+(rangeTest('^0.1.2-alpha.1',parse(c),false)?'Y':'n')+'  inclPre='+(rangeTest('^0.1.2-alpha.1',parse(c),true)?'Y':'n'));
}
console.log('');
console.log('  TOTAL self-test failures: '+fails);