const path = require('path');
const fs = require('fs');
const crypto = require('crypto');

const base = 'E:\\deepseek-harness\\dsh-plugin-upgrade-skill\\benchmark\\results\\artifacts\\2026-10-20-qwen3.8-max-s1-s24-r1\\noskill\\S7-unpublished-cohort';

console.log('== fixture sha256 ==');
for (const f of ['package.json', 'README.md']) {
  const h = crypto.createHash('sha256').update(fs.readFileSync(path.join(base, 'fixture', f))).digest('hex');
  console.log(f, h);
}
console.log('fixture entries:', fs.readdirSync(path.join(base, 'fixture')).join(', '));

const semverPath = 'C:\\Users\\lhh\\AppData\\Local\\nvm\\v24.18.1\\node_modules\\npm\\node_modules\\semver';
const semver = require(semverPath);
console.log('\n== node-semver', require(path.join(semverPath, 'package.json')).version, '==');
const range = '^0.1.2-alpha.1';
console.log('range:', range, '-> expands to:', semver.validRange(range));

const published = ['0.1.1-rc.1', '0.1.1-rc.2', '0.1.2-alpha.2'];
console.log('\n-- satisfies() against published cohort --');
for (const v of published) console.log(v.padEnd(14), semver.satisfies(v, range));
console.log('maxSatisfies(published)      =', semver.maxSatisfies(published, range));
console.log('maxSatisfies(without alpha.2)=', semver.maxSatisfies(['0.1.1-rc.1', '0.1.1-rc.2'], range));

console.log('\n-- hypothetical future publishes (drift check) --');
for (const v of ['0.1.2-alpha.3', '0.1.2-beta.1', '0.1.2', '0.1.3', '0.1.9', '0.1.3-alpha.1', '0.2.0', '0.2.0-alpha.1']) {
  console.log(v.padEnd(14), semver.satisfies(v, range));
}
console.log('\n-- maxSatisfies if alpha.1 HAD been published --');
console.log(semver.maxSatisfies(['0.1.1-rc.1', '0.1.1-rc.2', '0.1.2-alpha.1', '0.1.2-alpha.2'], range));