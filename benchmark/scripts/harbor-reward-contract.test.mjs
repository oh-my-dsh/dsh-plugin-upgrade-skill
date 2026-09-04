import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { runInNewContext } from 'node:vm'
import test from 'node:test'

// Exercise the actual embedded verifier writer without needing /app or /logs on
// the developer's machine. Harbor gives reward.json priority over reward.txt;
// a structured checkpoint ledger in that reserved file causes ValidationError.
for (const task of ['M5-token-auth-smoke', 'H8-fire-drill']) {
  test(`${task}: structured evidence cannot shadow Harbor's scalar reward`, () => {
    const shell = readFileSync(new URL(`../tasks/${task}/tests/test.sh`, import.meta.url), 'utf8')
    const writer = /node -e '([\s\S]*)'\s*$/.exec(shell)?.[1]
    assert(writer, 'Verifier must expose its reward writer')
    for (const score of [0, 73, 100]) {
      const result = { score, max: 100, reasons: ['a structured reason'], checkpoints: [{ id: 'probe', awarded: score }] }
      const outputs = new Map()
      runInNewContext(writer, {
        require(name) {
          assert.equal(name, 'node:fs')
          return {
            readFileSync: () => `diagnostic text\n${JSON.stringify(result)}\n`,
            writeFileSync: (path, data) => outputs.set(path, data),
          }
        },
        console: { log() {} },
      })
      assert.equal(Number(outputs.get('/logs/verifier/reward.txt')), score / 100)
      assert.deepEqual(JSON.parse(outputs.get('/logs/verifier/grading.json')), result)
      if (outputs.has('/logs/verifier/reward.json')) {
        const rewards = JSON.parse(outputs.get('/logs/verifier/reward.json'))
        assert.deepEqual(rewards, { reward: score / 100 }, 'Harbor reward.json must contain only numeric rewards')
      }
    }
  })
}
