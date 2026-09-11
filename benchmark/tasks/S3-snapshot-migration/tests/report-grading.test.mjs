import test from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { execFileSync } from 'node:child_process'
const oracle = readFileSync(new URL('../solution/report.md', import.meta.url), 'utf8')
const stripCards = text => text.replace(/(?:DSH-0\.1\.2-)?A[12]-\d{2}\b/g, '')
// Exercise the production judge algorithm with input/output and fixture gate adapters.
// This remains useful for testing its wiring as well as the pure rubric.
function grade(text) {
  const url = new URL('./judge.mjs', import.meta.url)
  const source = readFileSync(url, 'utf8')
    .replace(/import \{[^}]+\} from '\.\/judge-utils\.mjs'/, `const emit = (score, reasons, extra={}) => { console.log(JSON.stringify({score, reasons, ...extra})); process.exit(0) }; const emitError = e => { throw e }; const fixtureChanges = async () => ({changed:false}); const readAgentText = () => ({text:process.env.REPORT_TEXT, files:['report.md']})`)
    .replaceAll("'./report-claims.mjs'", JSON.stringify(new URL('./report-claims.mjs', import.meta.url).href))
    .replaceAll("'./report-grading.mjs'", JSON.stringify(new URL('./report-grading.mjs', import.meta.url).href))
    .replace(/const isMain = .*\n/, 'const isMain = true\n')
  return JSON.parse(execFileSync(process.execPath, ['--input-type=module','-e',source], {env:{...process.env,REPORT_TEXT:text},encoding:'utf8'}).trim())
}
test('card list alone earns no diagnostic credit', () => {
  assert.equal(grade((oracle.match(/(?:DSH-0\.1\.2-)?A[12]-\d{2}\b/g)||[]).join(' ')).score, 0)
})
test('removing all card IDs preserves full diagnosis credit', () => {
  assert.equal(grade(stripCards(oracle)).score, 100)
})

const paraphrases = ["Pet.tsx reads partial, runningCalls and turnEnds. Read chat fields through the temporary legacy projection, then migrate to target-owned Chat views and timeline.\nPet.tsx running is lifecycle state: keep useSession for it outside chat legacy.\nindex.ts imports dsh-client-runtime which was deleted. Replace ClientContext with Context from its target owner; remove the package.json client.inject entry.\nindex.ts scope.slots.register must wait via scope.slots.inject, preserving the slot name and scoped lifetime.\nUse the temporary compatibility path for chat, then migrate it; immediate import and inject cleanup and slot registration changes are required.", "Pet.tsx 的 partial、runningCalls、turnEnds 先经过 chat 兼容投影 legacy，后续迁移到目标 views 和 timeline。\nPet.tsx 的 running 是生命周期字段，保持 useSession，仍在 chat legacy 外。\nindex.ts 导入的 dsh-client-runtime 已移除，ClientContext 替换为目标归属包的 Context，并删除 package.json 的 client.inject 入口。\nindex.ts 的 scope.slots.register 需要 scope.slots.inject 等待 conversation.session.header.actions，并保留作用域生命周期。\nchat 临时兼容后再迁移；立即修改类型导入和 inject，并适配 slot 注册。"]
for (const [i, report] of paraphrases.entries()) {
  test(`independent ${i === 0 ? 'English' : 'Chinese'} diagnosis earns full credit without cards`, () => {
    const output = grade(report)
    assert.equal(output.score, 100, output.reasons.join('\n'))
    assert.equal(grade(report + '\nA1-01 A1-03 A1-25 A1-26 A1-27 A1-30 A2-01').score, output.score)
  })
}
test('empty and disconnected keyword lists earn zero', () => {
  assert.equal(grade('').score, 0)
  assert.equal(grade('apiProxy\nSessionView\nignorable\nalpha.1\nalpha.2\nremoved\nrestored\npartial\nrunningCalls\nturnEnds\nlegacy\nviews\nuseSession\nrunning\nContext\n@deepseek-ai/cordis\nclient.inject\nslots.inject\nslots.register\nindex.ts\nPet.tsx\npackage.json\npet-legacy-bundle\ndsh-pet-session-bench\nnodes\nconnection.api\nagentPresets\nSession.append\ncast\ninformational\ntrue').score, 0)
})
test('affirmative wrong migration loses credit, rejecting it does not', () => {
  assert.ok(grade(paraphrases[0] + '\n' + "Move running into chat legacy.").score < 100)
  assert.equal(grade(paraphrases[0] + '\n' + "Do not move running into chat legacy.").score, 100)
})

// Importable API and serialized evidence are part of the evaluator contract.
test('pure rubric agrees with judge and exposes bounded criterion evidence', async () => {
  const {scoreReport, gradeReport} = await import('./report-grading.mjs')
  assert.equal(gradeReport, scoreReport)
  const output = scoreReport(paraphrases[0])
  assert.equal(output.score, grade(paraphrases[0]).score)
  assert.equal(output.gradingMode, 'deterministic-diagnostic-rubric')
  assert.equal(output.metrics.criteria.reduce((sum,c) => sum+c.points, 0), 100)
  assert.deepEqual(output.metrics.cardIds, [])
})
