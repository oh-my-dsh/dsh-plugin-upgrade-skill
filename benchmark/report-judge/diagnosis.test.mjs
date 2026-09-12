import test from 'node:test'
import assert from 'node:assert/strict'
import { cpSync, mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { dirname, join } from 'node:path'
import { DIAGNOSIS_RUBRICS } from './diagnosis-rubrics.mjs'
import { samples } from './calibrate.mjs'
import { collectFiles, grade, judgeInput } from './judge.mjs'
import { makePacket, REPO } from './prepare.mjs'

function sandbox(t, task) {
  const root = mkdtempSync(join(tmpdir(), 'diagnosis-judge-test-'))
  t.after(() => rmSync(root, { recursive: true, force: true }))
  cpSync(join(REPO, 'benchmark/tasks', task, 'environment/fixture'), join(root, 'fixture'), { recursive: true })
  return root
}

for (const task of Object.keys(DIAGNOSIS_RUBRICS)) {
  test(`${task}: bilingual, partial, negated and contradictory calibration cases remain available`, () => {
    const cases = samples(task)
    for (const id of ['complete', 'reordered', 'keywords', 'wrong', 'injection', 'fabricated-citations',
      'prompt-echo', 'historical-oracle', 'paraphrase-zh', 'correct-negation', 'contradiction', 'partial']) {
      const sample = cases.find(c => c.id === id)
      assert.ok(sample?.report?.trim(), id)
    }
    assert.deepEqual(cases.find(c => c.id === 'paraphrase-zh').expected, [90, 100])
    assert.deepEqual(cases.find(c => c.id === 'correct-negation').expected, [90, 100])
    assert.ok(cases.find(c => c.id === 'partial').expected[1] < 100)
    assert.ok(cases.find(c => c.id === 'contradiction').expected[1] < 100)
    // These are corpus/protocol checks, not assertions about a model's scores.
  })

  test(`${task}: full report contents reach the judge unchanged without exposing the reference answer`, async t => {
    const root = sandbox(t, task), packet = makePacket(task)
    const out = join(root, 'agent-output', task)
    const expected = {
      'report-wrong.md': samples(task).find(c => c.id === 'paraphrase-zh').report,
      'nested/rejected-advice.log': samples(task).find(c => c.id === 'correct-negation').report,
    }
    for (const [path, text] of Object.entries(expected)) {
      mkdirSync(dirname(join(out, path)), { recursive: true }); writeFileSync(join(out, path), text)
    }
    const answerMarker = 'REFERENCE-ANSWER-MUST-NOT-ENTER-JUDGE-PAYLOAD'
    mkdirSync(join(root, 'solution')); writeFileSync(join(root, 'solution/report.md'), answerMarker)
    const before = collectFiles(out)
    let calls = 0
    await grade({ packet, appRoot: root, evaluate: async (sealed, reports) => {
      calls += 1
      assert.deepEqual(reports, expected)
      assert.deepEqual(judgeInput(sealed, reports).candidate_reports, expected)
      assert.equal(JSON.stringify(judgeInput(sealed, reports)).includes(answerMarker), false)
      return { score: 0 } // transport stub only
    } })
    assert.equal(calls, 1)
    assert.deepEqual(collectFiles(out), before, 'candidate artifacts must stay byte-identical')
  })

  test(`${task}: edits, deletions and new fixture files cannot bypass the sealed read-only gate`, async t => {
    const packet = makePacket(task)
    assert.equal(packet.allowedDeletions, undefined)
    const first = Object.keys(packet.fixture)[0]
    for (const mutate of [
      dir => writeFileSync(join(dir, first), 'tampered'),
      dir => rmSync(join(dir, first)),
      dir => writeFileSync(join(dir, '.new-hidden-file'), 'new'),
    ]) {
      const root = sandbox(t, task)
      const out = join(root, 'agent-output', task); mkdirSync(out, { recursive: true })
      writeFileSync(join(out, 'report.md'), samples(task)[0].report)
      // The verifier must not rely on a candidate-controlled Git baseline.
      mkdirSync(join(root, '.git')); writeFileSync(join(root, '.git/HEAD'), 'rewritten by candidate')
      mutate(join(root, 'fixture'))
      const result = await grade({ packet, appRoot: root, evaluate: () => assert.fail('invalid fixture reached LLM') })
      assert.equal(result.status, 'invalid_submission')
      assert.equal(result.score, 0)
    }
  })
}
