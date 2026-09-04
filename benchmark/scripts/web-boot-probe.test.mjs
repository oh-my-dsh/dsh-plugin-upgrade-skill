import assert from 'node:assert/strict'
import { execFileSync } from 'node:child_process'
import test from 'node:test'
import { bootWebAndFetchIndex as bootH8 } from '../tasks/H8-fire-drill/tests/judge-utils.mjs'
import { bootWebAndFetchIndex as bootM5 } from '../tasks/M5-token-auth-smoke/tests/judge-utils.mjs'

for (const [name, boot] of [['H8', bootH8], ['M5', bootM5]]) {
  test(`${name}: generated Web probe is valid JavaScript and returns observed host evidence`, async () => {
    const commands = []
    const evidence = { log: 'dsh web: http://127.0.0.1:3080/?token=fixture', html: '<html>fixture</html>' }
    const result = await boot('bench-test', '@demo/test', async (command) => {
      commands.push(command)
      return { stdout: commands.length === 1 ? 'started' : `__RESULT__${JSON.stringify(evidence)}`, stderr: '' }
    })
    assert.equal(commands.length, 2)
    const script = /node --input-type=module -e '([\s\S]+)'\s+'/.exec(commands[1])?.[1]
    assert(script, 'Expected an embedded Node probe')
    execFileSync(process.execPath, ['--input-type=module', '--check'], { input: script, stdio: ['pipe', 'pipe', 'pipe'] })
    assert.equal(result.output, evidence.log)
    assert.equal(result.html, evidence.html)
  })
}
