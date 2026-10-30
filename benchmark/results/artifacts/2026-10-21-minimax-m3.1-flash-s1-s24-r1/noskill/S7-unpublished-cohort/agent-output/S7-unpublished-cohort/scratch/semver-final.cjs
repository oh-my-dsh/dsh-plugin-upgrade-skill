'use strict';
const S=require('./semver-core.cjs');
const {parse,caret,tilde,rangeTest,maxSatisfying,parseComparator}=S;
let fails=0;
function chk(label,got,want){ const ok=(got===want); if(!ok) fails++; console.log((ok?'  PASS  ':'  FAIL  ')+label.padEnd(34)+' got='+String(got).padEnd(26)+' want='+want); }
console.log('=== SELF-TEST: expansion vs known node-semver reference values ===');
chk('^1.2.3',caret('1.2.3'),'>=1.2.3 <2.0.0-0');
chk('^0.2.3',caret('0.2.3'),'>=0.2.3 <0.3.0-0');
chk('^0.0.3',caret('0.0.3'),'>=0.0.3 <0.0.4-0');
chk('^0.1.2',caret('0.1.2'),'>=0.1.2 <0.2.0-0');
chk('^0.1.2-alpha.1',caret('0.1.2-alpha.1'),'>=0.1.2-alpha.1 <0.2.0-0');
chk('~1.2.3',tilde('1.2.3'),'>=1.2.3 <1.3.0-0');
chk('~0.1.2',tilde('0.1.2'),'>=0.1.2 <0.2.0-0');
chk('~0.1.2-alpha.1',tilde('0.1.2-alpha.1'),'>=0.1.2-alpha.1 <0.2.0-0');
console.log('=== SELF-TEST: known node-semver satisfy() results ===');
const T=[['1.2.3','^1.2.3',true],['2.0.0','^1.2.3',false],['1.2.3-alpha.1','^1.2.3',false],['1.2.4-alpha.1','^1.2.3',false],['1.3.0-beta.1','^1.2.3',false],['0.1.2-alpha.2','^0.1.2-alpha.1',true],['0.1.1-rc.2','^0.1.2-alpha.1',false],['0.2.0','^0.1.2-alpha.1',false],['0.1.2-alpha.2','^0.1.2',false],['0.1.2','^0.1.2',true],['0.1.3-alpha.1','^0.1.2',false]];
for(const [v,r,want] of T){ chk(want?'sat':'excl', rangeTest(r,parse(v),false)?'sat':'excl', want?'sat':'excl'); }
console.log('  (context) '+T.map(t=>t[0]+' vs '+t[1]+' => '+(rangeTest(t[1],parse(t[0]),false)?'MATCH':'no')).join(' | '));
console.log('  self-test failures: '+fails);

const PUBLISHED=['0.1.1-rc.1','0.1.1-rc.2','0.1.2-alpha.2'];
console.log('');
console.log('=== FINAL: resolution of the DECLARED range ===');
console.log('  ^0.1.2-alpha.1  expands to  '+caret('0.1.2-alpha.1'));
console.log('  resolves against published set -> '+(maxSatisfying(PUBLISHED,'^0.1.2-alpha.1')??'ETARGET (install FAILS)'));
console.log('');
console.log('=== FINAL: recommended repin candidates (all resolve today) ===');
const REC=['0.1.2-alpha.2','^0.1.2-alpha.2','~0.1.2-alpha.2','0.1.1-rc.2','^0.1.1-rc.2','^0.1.1-rc.1 || ^0.1.2-alpha.2','>=0.1.1-rc.2 <0.1.2-alpha.3','0.1.2-alpha.2 || 0.1.1-rc.2'];
for(const r of REC){ console.log('  '+r.padEnd(36)+' -> '+(maxSatisfying(PUBLISHED,r)??'NO MATCH')); }
console.log('');
console.log('=== FINAL: ranges that FAIL today (must be avoided) ===');
const BAD=['0.1.2-alpha.1','=0.1.2-alpha.1','^0.1.2','~0.1.2','>=0.1.2 <0.2.0','^0.1.2-alpha.1 <0.1.2-alpha.2'];
for(const r of BAD){ console.log('  '+r.padEnd(36)+' -> '+(maxSatisfying(PUBLISHED,r)??'NO MATCH (ETARGET -> npm install FAILS)')); }
console.log('');
console.log('=== FINAL: union/OR semantics check for ^0.1.1-rc.1 || ^0.1.2-alpha.2 ===');
for(const v of PUBLISHED){ console.log('  '+v.padEnd(16)+(rangeTest('^0.1.1-rc.1 || ^0.1.2-alpha.2',parse(v),false)?'MATCH':'no')); }
console.log('');
console.log('=== FINAL: npm install failure mode for an exact-phantom pin ===');
console.log('  0.1.2-alpha.1 exact -> '+(maxSatisfying(PUBLISHED,'0.1.2-alpha.1')??'ETARGET: No matching version found for @deepseek-ai/dsh-llm@0.1.2-alpha.1'));
console.log('');
console.log('=== FINAL: is 0.1.2-alpha.2 inside the DECLARED range? (the drift that silently happens) ===');
console.log('  0.1.2-alpha.2 vs ^0.1.2-alpha.1 -> '+(rangeTest('^0.1.2-alpha.1',parse('0.1.2-alpha.2'),false)?'MATCH (install succeeds, but NOT the declared floor)':'no'));
console.log('  0.1.1-rc.2    vs ^0.1.2-alpha.1 -> '+(rangeTest('^0.1.2-alpha.1',parse('0.1.1-rc.2'),false)?'MATCH':'no (below floor)'));
console.log('');
console.log('=== FINAL: drift surface of ^0.1.2-alpha.1 (0.1.x line) ===');
const DRIFT=['0.1.2','0.1.3','0.1.9','0.1.99','0.2.0','1.0.0'];
for(const v of DRIFT){ console.log('  '+v.padEnd(10)+(rangeTest('^0.1.2-alpha.1',parse(v),false)?'absorbed by ^0.1.2-alpha.1':'outside')); }
console.log('  self-test failures: '+fails);