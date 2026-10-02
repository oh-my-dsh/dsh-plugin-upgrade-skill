import test from 'node:test'
import assert from 'node:assert/strict'
import { execFile } from 'node:child_process'
import { existsSync, mkdtempSync, readdirSync, readFileSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { setTimeout as delay } from 'node:timers/promises'
import { runInNewContext } from 'node:vm'

const tasksRoot = new URL('../tasks/', import.meta.url)
const localExecTasks = readdirSync(tasksRoot).sort().filter((task) => {
  const file = new URL(`${task}/tests/judge-utils.mjs`, tasksRoot)
  return existsSync(file) && /export\s+(?:async\s+)?function\s+localExec\(/.test(readFileSync(file, 'utf8'))
})
assert(localExecTasks.length > 0, 'Expected command helpers in the task inventory')

const quote = (value) => `'${value.replaceAll("'", "'\\''")}'`
const { localExec: h8Exec } = await import(new URL('H8-fire-drill/tests/judge-utils.mjs', tasksRoot))

for (const ignoresTermination of [false, true]) {
  test(`H8 timeout stops background descendant writes (ignores SIGTERM=${ignoresTermination})`, {
    skip: process.platform === 'win32', timeout: 8000,
  }, async () => {
    const dir = mkdtempSync(join(tmpdir(), 'h8-timeout-'))
    const heartbeat = join(dir, 'heartbeat')
    let pid
    try {
      const program = `const fs=require('node:fs');console.log(process.pid);${ignoresTermination ? "process.on('SIGTERM',()=>{});" : ''}setInterval(()=>fs.writeFileSync(${JSON.stringify(heartbeat)},String(Date.now())),20);setTimeout(()=>process.exit(0),2500)`
      const started = performance.now()
      const result = await h8Exec(`${quote(process.execPath)} -e ${quote(program)} & wait`, { timeout: 400 })
      pid = Number(result.stdout.trim())
      assert(pid > 0, 'expected the real background child to start')
      assert(performance.now() - started < 1200, 'helper waited for the child lifetime instead of enforcing its deadline')
      assert.equal(result.code, 1)
      assert.equal(result.killed, true)
      assert(existsSync(heartbeat), 'child must write before its timeout')
      await delay(50)
      const stopped = readFileSync(heartbeat, 'utf8')
      await delay(120)
      assert.equal(readFileSync(heartbeat, 'utf8'), stopped, 'timed-out descendant kept writing')
    } finally {
      if (pid) { try { process.kill(pid, 'SIGKILL') } catch (error) { if (error.code !== 'ESRCH') throw error } }
      rmSync(dir, { recursive: true, force: true })
    }
  })
}

test('H8 successful background launch remains available to the later boot probe', {
  skip: process.platform === 'win32', timeout: 8000,
}, async () => {
  const dir = mkdtempSync(join(tmpdir(), 'h8-background-'))
  const marker = join(dir, 'pid')
  let pid
  try {
    const program = `require('node:fs').writeFileSync(${JSON.stringify(marker)},String(process.pid));setTimeout(()=>process.exit(0),2500)`
    const result = await h8Exec(`${quote(process.execPath)} -e ${quote(program)} </dev/null >/dev/null 2>&1 &`, { timeout: 2000 })
    assert.equal(result.code, 0)
    assert.equal(result.killed, false)
    for (let i = 0; i < 50 && !existsSync(marker); i++) await delay(20)
    assert(existsSync(marker), 'the background process must remain alive long enough to start')
    pid = Number(readFileSync(marker, 'utf8'))
    assert.doesNotThrow(() => process.kill(pid, 0))
    const echoed = await h8Exec('cat', { stdin: 'probe-input', timeout: 2000 })
    assert.equal(echoed.stdout, 'probe-input')
  } finally {
    if (pid) { try { process.kill(pid, 'SIGKILL') } catch (error) { if (error.code !== 'ESRCH') throw error } }
    rmSync(dir, { recursive: true, force: true })
  }
})

test('H8 command capture preserves multibyte output and enforces the output limit', {
  skip: process.platform === 'win32', timeout: 8000,
}, async () => {
  const text = '中文🙂'.repeat(10000)
  const echoed = await h8Exec('cat', { stdin: text, timeout: 2000 })
  assert.equal(echoed.code, 0)
  assert.equal(echoed.stdout, text)
  const program = "process.stdout.write('x'.repeat(1200000));setTimeout(()=>{},2500)"
  const started = performance.now()
  const result = await h8Exec(`${quote(process.execPath)} -e ${quote(program)}`, { timeout: 4000 })
  assert.equal(result.code, 1)
  assert.match(result.stderr, /stdout exceeded maxBuffer/)
  assert(Buffer.byteLength(result.stdout) <= 1024 * 1024)
  assert(performance.now() - started < 1200, 'output-limit failure did not stop its process')
})

test('H8 rejects invalid command options before starting a process', async () => {
  const dir = mkdtempSync(join(tmpdir(), 'h8-invalid-input-'))
  const marker = join(dir, 'started')
  try {
    const script = `printf started > ${quote(marker)}`
    await assert.rejects(h8Exec(script, { stdin: {} }), TypeError)
    await assert.rejects(h8Exec(script, { timeout: -1 }), RangeError)
    await delay(50)
    assert.equal(existsSync(marker), false)
  } finally {
    rmSync(dir, { recursive: true, force: true })
  }
})

for (const task of localExecTasks) {
  test(`localExec rejects timeout and signal termination (${task})`, async () => {
    const { localExec } = await import(new URL(`${task}/tests/judge-utils.mjs`, tasksRoot))
    // exec replaces the shell so timeout cleanup cannot leave a grandchild.
    const timedOut = await localExec('exec sleep 1', { timeout: 50 })
    assert.equal(timedOut.code, 1)
    assert.equal(timedOut.killed, true)
    const signaled = await localExec('kill -TERM $$', { timeout: 5000 })
    assert.equal(signaled.code, 1)
  })

  test(`localExec preserves ordinary exit status and output (${task})`, async () => {
    const { localExec } = await import(new URL(`${task}/tests/judge-utils.mjs`, tasksRoot))
    const success = await localExec('printf ok', { timeout: 5000 })
    assert.equal(success.code, 0)
    assert.equal(success.stdout, 'ok')
    assert.equal(success.killed, false)
    const failure = await localExec('printf err >&2; exit 3', { timeout: 5000 })
    assert.equal(failure.code, 3)
    assert.equal(failure.stderr, 'err')
    assert.equal(failure.killed, false)
  })
}

const { run: runH10 } = await import(new URL('H10-browser-activation-trap/tests/judge-utils.mjs', tasksRoot))
// H9 starts its verifier on import. Evaluate its actual helper body without
// invoking the entrypoint or copying the exit-status logic into this test.
const h9Source = readFileSync(new URL('H9-dsh-web-alpha2/tests/judge.mjs', tasksRoot), 'utf8')
const h9RunSource = h9Source.match(/^function run\([\s\S]*?^\}/m)?.[0]
assert(h9RunSource, 'Expected H9 command helper')
const runH9 = runInNewContext(`(${h9RunSource})`, { execFile })
const runners = [
  ['H10', (file, args, timeout) => runH10(file, args, { timeout })],
  ['H9', (file, args, timeout) => runH9(file, args, undefined, timeout)],
]
for (const [name, run] of runners) {
  test(`${name} rejects timeout, signal termination, and spawn failure`, async () => {
    assert.equal((await run('sleep', ['1'], 50)).code, 1)
    assert.equal((await run('sh', ['-c', 'kill -TERM $$'], 5000)).code, 1)
    assert.equal((await run('/nonexistent-dsh-benchmark-test-command', [], 5000)).code, 1)
  })
  test(`${name} preserves ordinary exit status and output`, async () => {
    const success = await run('printf', ['ok'], 5000)
    assert.equal(success.code, 0)
    assert.equal(success.stdout, 'ok')
    const failure = await run('sh', ['-c', 'printf err >&2; exit 3'], 5000)
    assert.equal(failure.code, 3)
    assert.equal(failure.stderr, 'err')
  })
}
