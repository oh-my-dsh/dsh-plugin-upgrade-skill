const fs=require('fs'),path=require('path'),crypto=require('crypto');
const base='E:\\deepseek-harness\\dsh-plugin-upgrade-skill\\benchmark\\results\\artifacts\\2026-10-20-qwen3.8-max-s1-s24-r1\\noskill\\S7-unpublished-cohort';
const manifest=JSON.parse(fs.readFileSync(path.join(base,'fixture-hash-before.json'),'utf8'));
let ok=true;
for(const [f,exp] of Object.entries(manifest.files)){
  const act=crypto.createHash('sha256').update(fs.readFileSync(path.join(base,'fixture',f))).digest('hex');
  const m=act===exp; ok=ok&&m;
  console.log(f, m?'MATCH':'CHANGED', act);
}
console.log('fixture entries:', fs.readdirSync(path.join(base,'fixture')).join(', '));
const rep=path.join(base,'agent-output','S7-unpublished-cohort','S7-install-type-baseline-plan.md');
console.log('report exists:', fs.existsSync(rep), 'size:', fs.statSync(rep).size);
console.log('INTEGRITY:', ok?'PASS':'FAIL');
