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

const paraphrases = ["Scan scope includes index.js, package.json, cordis.patch.yml and src/session-notes.js.\nindex.js inject apiProxy and providers call depend on a removed service. Host must switch to injected llm domain services.\npackage.json has a dead apiproxy dependency; remove it.\nNo source patch declarations.\nNo SessionEvent listeners.\nNo homedir filesystem access.\nNo UI registerCommand hooks.\nNo createServer channel.\nNo subprocess spawn or stdout processing.\nsession-notes.js is a pure string and array helper.\nZero hits cannot establish compatibility: this scan does not cover runtime dependency behavior.\nAfter migration, run build/typecheck and an isolated cold boot, check no pending and make a provider call.", "扫描 index.js、package.json、cordis.patch.yml、src/session-notes.js。\nindex.js 的 inject apiProxy 与 providers 调用依赖已移除的服务，Host 应注入 llm 领域服务。\npackage.json 的 apiproxy 依赖需要删除。\n未发现源码 patch 补丁。\n未发现 SessionEvent 事件。\n未发现 homedir 目录访问。\n未发现 UI 命令注册。\n未发现 createServer 通道。\n未发现 spawn 子进程。\nsession-notes.js 是纯字符串和数组工具。\n零命中不代表兼容，扫描不能覆盖运行时依赖。\n迁移后需要 typecheck、隔离冷启动并检查 pending，再进行 providers 调用。"]
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
  assert.ok(grade(paraphrases[0] + '\n' + "Keep apiProxy.").score < 100)
  assert.equal(grade(paraphrases[0] + '\n' + "Do not keep apiProxy.").score, 100)
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
