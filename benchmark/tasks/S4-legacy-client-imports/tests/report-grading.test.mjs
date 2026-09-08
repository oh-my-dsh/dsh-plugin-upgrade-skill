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

const paraphrases = ["At src/client/index.ts the ClientContext import from dsh-client-runtime breaks because that package was removed. Import Context from the verified target owning package; exact exports remain unconfirmed.\nThe pet-legacy-bundle loader id is a mismatch with package.json name dsh-pet-session-bench: align the registration id with that name and verify client boot.\nindex.ts useSession exposes removed flat nodes: replace the content read with a supported durable window or public selector and preserve order.\nindex.ts connection.api.agentPresets.list uses a removed face: switch to a verified public API or Remote interface; exact operation names are unconfirmed.", "src/client/index.ts 从 dsh-client-runtime 导入 ClientContext，但该包已移除；Context 改从目标所属包导入，具体导出待确认。\npet-legacy-bundle 注册 id 与 package.json 的 dsh-pet-session-bench 不一致，注册 id 应与 name 对齐并验证启动。\nindex.ts 的 useSession 平铺 nodes 已移除；会话内容改走 durable 事件窗读取并保序。\nindex.ts 的 connection.api.agentPresets.list 所在访问面已删除，改走经验证的 Remote 公开接口，具体键名待确认。"]
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
  assert.ok(grade(paraphrases[0] + '\n' + "Replace apply with setup.").score < 100)
  assert.equal(grade(paraphrases[0] + '\n' + "Do not replace apply with setup.").score, 100)
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
test('negating the removed runtime diagnosis cannot borrow another paragraph removal', () => {
  const wrong = paraphrases[0].replace('that package was removed', 'that package was not removed')
  assert.ok(grade(wrong).score < 100)
})
