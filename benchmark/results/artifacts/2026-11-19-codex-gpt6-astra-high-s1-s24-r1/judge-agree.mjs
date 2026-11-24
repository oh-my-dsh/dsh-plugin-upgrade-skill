// 两代判官一致性：judge-results.json (GLM-5.3) vs judge-results-53f.json (Flash)
import { readFileSync } from 'node:fs'
import { join } from 'node:path'
const RUN = import.meta.dirname
const a = JSON.parse(readFileSync(join(RUN, 'judge-results.json'), 'utf8'))
const b = JSON.parse(readFileSync(join(RUN, 'judge-results-53f.json'), 'utf8'))
const ma = new Map(a.results.filter(r => r.status === 'scored').map(r => [r.arm + '.' + r.task, r.score]))
const mb = new Map(b.results.filter(r => r.status === 'scored').map(r => [r.arm + '.' + r.task, r.score]))
let n = 0, diff = 0, maxD = 0
const rows = []
for (const [k, sa] of ma) {
  const sb = mb.get(k)
  if (sb === undefined) continue
  n += 1
  const d = sa - sb
  if (d !== 0) { diff += 1; maxD = Math.max(maxD, Math.abs(d)) }
  if (Math.abs(d) >= 10) rows.push(k + ': ' + sa + ' vs ' + sb + ' (delta ' + d + ')')
}
for (const arm of ['skill', 'noskill']) {
  console.log(arm, '| glm5.3 mean', (a.aggregate[arm].total / a.aggregate[arm].n).toFixed(2), '| flash mean', (b.aggregate[arm].total / b.aggregate[arm].n).toFixed(2))
}
console.log('cells compared:', n, '| differing:', diff, '| max |delta|:', maxD)
console.log('cells with |delta| >= 10:')
console.log(rows.join('\n') || '(none)')