const path = require('path');
const semverPath = 'C:\\Users\\lhh\\AppData\\Local\\nvm\\v24.18.1\\node_modules\\npm\\node_modules\\semver';
const semver = require(semverPath);
console.log('node-semver', require(path.join(semverPath, 'package.json')).version);
console.log('exports:', Object.keys(semver).join(','));
const range = '^0.1.2-alpha.1';
console.log('range:', range, '-> expands to:', semver.validRange(range));

const maxSat = (vs, r) => vs.filter(v => semver.satisfies(v, r)).sort(semver.rcompare)[0] ?? null;

const published = ['0.1.1-rc.1', '0.1.1-rc.2', '0.1.2-alpha.2'];
console.log('\n-- satisfies() against published cohort --');
for (const v of published) console.log(v.padEnd(14), semver.satisfies(v, range));
console.log('max(published)             =', maxSat(published, range));
console.log('max(without alpha.2)       =', maxSat(['0.1.1-rc.1', '0.1.1-rc.2'], range));
console.log('max(if alpha.1 existed)    =', maxSat(['0.1.1-rc.1', '0.1.1-rc.2', '0.1.2-alpha.1', '0.1.2-alpha.2'], range));

console.log('\n-- hypothetical future publishes (drift check) --');
for (const v of ['0.1.2-alpha.3', '0.1.2-beta.1', '0.1.2', '0.1.3', '0.1.9', '0.1.3-alpha.1', '0.2.0', '0.2.0-alpha.1']) {
  console.log(v.padEnd(14), semver.satisfies(v, range));
}
console.log('\n-- exact-pin sanity: 0.1.2-alpha.2 satisfies "0.1.2-alpha.2":', semver.satisfies('0.1.2-alpha.2', '0.1.2-alpha.2'));
