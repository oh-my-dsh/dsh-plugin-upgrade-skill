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

const paraphrases = ["patch.yml and scripts/apply-patch.mjs target SessionView private source text: verify that patch against the split owner's exports.\nsrc/index.ts session/event sends an informational ignorable marker: alpha.1 removed it, alpha.2 restored it; preserve this marker.\nsrc/index.ts apiProxy calls llm.providers: this service was removed; migrate Host code to injected llm domain services.\nsrc/index.ts has a hard-coded homedir .dsh profiles/default path; use runtime DSH_HOME and the selected profile.\nThe private SessionView and registerCommand coupling needs checking: verify public UI and command owners.\nThe createServer loopback channel requires auth at the supported boundary even on 127.0.0.1.\nThe stdout JSON.parse assumption is an existing bug: stdout is final text and stderr carries progress.\nThis scan cannot prove runtime compatibility; propose build/typecheck, isolated cold boot and a functional provider path.", "patch.yml 及 apply-patch.mjs 修改 SessionView 私有源码补丁，需要核对目标导出。\nsrc/index.ts 的 session/event 发送信息性 ignorable 标记，alpha.1 移除而 alpha.2 恢复，保留 marker。\nsrc/index.ts 中 apiProxy 的 llm.providers 已删除，Host 应迁移到注入 llm 领域服务。\nsrc/index.ts 的 homedir 和 .dsh default 是硬编码路径，改用运行时 DSH_HOME 与 profile。\nSessionView 私有导入和 registerCommand 关联 UI 命令，应核对公开 UI 接口。\ncreateServer 监听 127.0.0.1 也必须接入认证。\nJSON.parse 解析 stdout 是已有错误，stdout 为最终文本，stderr 承载进度。\n扫描不能证明兼容；建议 typecheck、隔离冷启动与功能路径验证。"]
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
test('a denied loopback authentication requirement earns no channel credit', async () => {
  const {scoreReport} = await import('./report-grading.mjs')
  assert.equal(scoreReport('The 127.0.0.1 loopback server does not require auth.').score, 0)
})
