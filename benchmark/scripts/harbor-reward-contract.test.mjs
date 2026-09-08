import assert from 'node:assert/strict'
import test from 'node:test'
import { runVerifier } from './verifier-test-support.mjs'

// Harbor prioritizes reward.json; structured evidence belongs in grading.json.
// Execute the shipped wrapper with a real judge process in an isolated directory.
for (const task of ['M5-token-auth-smoke', 'H8-fire-drill']) {
  test(`${task}: structured evidence cannot shadow Harbor's scalar reward`, () => {
    for (const score of [0, 73, 100]) {
      const packet = { score, max: 100, reasons: ['a structured reason'], checkpoints: [{ id: 'probe', awarded: score }] }
      const result = runVerifier(`console.log('diagnostic'); console.log(${JSON.stringify(JSON.stringify(packet))})`, task)
      assert.equal(result.status, 0, result.stderr)
      assert.equal(Number(result.files['reward.txt']), score / 100)
      assert.deepEqual(JSON.parse(result.files['grading.json']), packet)
      assert.deepEqual(JSON.parse(result.files['reward.json']), { reward: score / 100 })
    }
  })
}
