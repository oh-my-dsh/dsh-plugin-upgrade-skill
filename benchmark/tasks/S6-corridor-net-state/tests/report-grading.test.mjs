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

const paraphrases = ["In src/events.ts the ignorable marker was removed in alpha.1; alpha.2 restored it, so the target net state keeps it.\nRemove the obsolete defense code that deletes this marker.\nOnly omission-safe informational events should carry ignorable: true; the marker is not a consumer filter.\nPublic Session.append has no ignorable argument; a cast cannot create a supported persistence capability.", "src/events.ts 的 ignorable 在 alpha.1 被移除，alpha.2 恢复，因此按目标净状态处理。\n删除过时防御代码。\n只有信息性且可安全省略的事件写 ignorable: true，marker 不是消费端过滤指令。\nSession.append 没有 ignorable 参数，不能靠 cast 捏造公开入口。"]
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
  assert.ok(grade(paraphrases[0] + '\n' + "Keep the defense code.").score < 100)
  assert.equal(grade(paraphrases[0] + '\n' + "Do not keep the defense code.").score, 100)
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
test('reversed version history earns no corridor credit', async () => {
  const {scoreReport} = await import('./report-grading.mjs')
  const output = scoreReport('alpha.1 restored ignorable; alpha.2 removed ignorable.')
  assert.equal(output.score, 0)
})
test('denied version history earns no corridor credit', async () => {
  const {scoreReport} = await import('./report-grading.mjs')
  assert.equal(scoreReport('alpha.1 did not remove ignorable.\nalpha.2 restored ignorable.').score, 0)
  assert.equal(scoreReport('alpha.1 removed ignorable.\nalpha.2 did not restore ignorable.').score, 0)
})
test('unrelated negations do not shield affirmative defense advice', () => {
  for (const advice of [
    'No other changes are needed and keep the defense code.',
    'Nothing else should change; keep the defense code.',
    '不能升级时应继续删除 marker。',
    '无法迁移后仍应保留防御代码。',
  ]) assert.equal(grade(paraphrases[0] + '\n' + advice).score, 10, advice)
})
test('explicit coordinated prohibitions retain their local negation', () => {
  for (const warning of [
    'Do not keep the defense code and continue deleting the marker.',
    'Do not keep the defense code or continue deleting the marker.',
    'No other changes are needed and do not keep the defense code.',
    '不能升级时也不要继续删除 marker。',
  ]) assert.equal(grade(paraphrases[0] + '\n' + warning).score, 100, warning)
})
