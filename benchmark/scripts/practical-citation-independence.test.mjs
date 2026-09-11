import test from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync, readdirSync } from 'node:fs'
const tasks = readdirSync(new URL('../tasks/', import.meta.url)).filter(id => /^(M(?:[6-9]|1[0-2])|H1[4-9])-/.test(id))
const cardRE = /\b(?:DSH-\d+\.\d+\.\d+-A\d+-\d+|R-\d+)\b/g
for (const task of tasks) {
  test(`${task}: real diagnosis scorer ignores oracle card deletion and insertion`, async () => {
    const { scoreDiagnosis } = await import(`../tasks/${task}/tests/judge.mjs`)
    const oracle = readFileSync(new URL(`../tasks/${task}/solution/report/diagnosis.md`, import.meta.url), 'utf8')
    const cards = [...new Set(oracle.match(cardRE) ?? [])].join(' ')
    assert.ok(cards)
    const plain = oracle.replace(cardRE, '')
    assert.equal(scoreDiagnosis(oracle).score, scoreDiagnosis(plain).score)
    assert.equal(scoreDiagnosis(plain).score, scoreDiagnosis(plain + '\n' + cards).score)
    assert.ok(scoreDiagnosis(cards).score < 10, 'card strings alone cannot earn full diagnosis credit')
    assert.equal(scoreDiagnosis(cards).score, scoreDiagnosis('').score, 'card-only text is not report evidence')
  })
}
for (const task of tasks) {
  test(`${task}: composite preserves non-citation components and percent caps`, async () => {
    const { scoreDiagnosis, scoreComposite } = await import(`../tasks/${task}/tests/judge.mjs`)
    const oracle = readFileSync(new URL(`../tasks/${task}/solution/report/diagnosis.md`, import.meta.url), 'utf8')
    const diagnosis = scoreDiagnosis(oracle)
    const stripped = scoreDiagnosis(oracle.replace(cardRE, ''))
    const contract = { score: 50, allPassed: true }
    const full = scoreComposite(diagnosis, contract, 25, { score: 10 })
    assert.equal(full.score, scoreComposite(stripped, contract, 25, { score: 10 }).score)
    assert.equal(full.metrics.composite.rawMax, 95)
    assert.equal(full.metrics.runtime.score, 25)
    assert.equal(full.metrics.staticContract.score, 50)
    assert.equal(scoreComposite(diagnosis, { ...contract, allPassed: false }, 25, { score: 10 }).score, 40)
    assert.equal(scoreComposite(diagnosis, contract, 0, { score: 10 }).score, (diagnosis.score + 60) * 100 / 95)
    assert.equal(full.metrics.citation.auxiliary, true)
  })
}
test('H8: citation checkpoint changes auxiliary metric only, with percentage caps', async () => {
  const { scoreReportCheckpoints, scoreCheckpointComposite } = await import('../tasks/H8-fire-drill/tests/judge.mjs')
  assert.equal(typeof scoreReportCheckpoints, 'function')
  const decl = JSON.parse(readFileSync(new URL('../tasks/H8-fire-drill/tests/checkpoints.json', import.meta.url)))
  const oracle = readFileSync(new URL('../tasks/H8-fire-drill/solution/report/diagnosis.md', import.meta.url), 'utf8')
  const baseline = Object.fromEntries(decl.checkpoints.map(cp => [cp.id, cp.type === 'fail-to-pass' ? 'fail' : 'pass']))
  const outcomes = Object.fromEntries(decl.checkpoints.map(cp => [cp.id, 'pass']))
  const report = scoreReportCheckpoints(oracle)
  const stripped = scoreReportCheckpoints(oracle.replace(cardRE, ''))
  const full = scoreCheckpointComposite({ ...outcomes, ...report }, baseline)
  const plain = scoreCheckpointComposite({ ...outcomes, ...stripped }, baseline)
  assert.equal(full.score, plain.score)
  assert.equal(full.metrics.composite.rawMax, 95)
  assert.equal(full.metrics.composite.rawScore, 95)
  assert.equal(full.score, 100)
  assert.ok(!full.checkpoints.some(cp => cp.id === 'cites-cards'))
  assert.equal(scoreCheckpointComposite({ ...outcomes, 'host-no-remote': 'fail' }, baseline).score, 20)
  assert.equal(scoreCheckpointComposite({ ...outcomes, 'web-raw-removed': 'fail' }, baseline).score, 60)
  assert.equal(scoreReportCheckpoints('DSH-0.1.2-A1-01 DSH-0.1.2-A1-08 R-01')['names-drill-host'], 'fail')
})
