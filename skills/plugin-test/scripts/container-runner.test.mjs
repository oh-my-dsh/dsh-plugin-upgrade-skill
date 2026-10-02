import assert from 'node:assert/strict'
import { spawnSync } from 'node:child_process'
import { chmod, mkdir, mkdtemp, readFile, rm, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import test from 'node:test'
import { fileURLToPath } from 'node:url'

import { buildReport, renderMarkdown } from './docker-release-smoke.mjs'

const runner = fileURLToPath(new URL('./container-runner.mjs', import.meta.url))
// The container entry point targets Linux. These fixtures use real POSIX signals,
// but replace every package-manager command so they need no Docker or network.
const options = { skip: process.platform === 'win32', timeout: 15_000 }

async function runFixture(t, shutdown, { probeExitCode, exitBeforeTeardown } = {}) {
  const root = await mkdtemp(join(tmpdir(), 'dsh-smoke-teardown-'))
  t.after(() => rm(root, { recursive: true, force: true }))
  const prefix = join(root, 'toolchain')
  const bin = join(prefix, 'bin')
  const modules = join(prefix, 'lib', 'node_modules')
  const output = join(root, 'output')
  await mkdir(bin, { recursive: true })
  for (const [name, version] of [['pnpm', '11.24.0'], ['@deepseek-ai/dsh', '0.1.2-alpha.2']]) {
    await mkdir(join(modules, name), { recursive: true })
    await writeFile(join(modules, name, 'package.json'), JSON.stringify({ name, version }))
  }
  const commands = {
    npm: `if (JSON.stringify(process.argv.slice(2)) !== '["root","--global"]') process.exit(90); console.log(${JSON.stringify(modules)})`,
    pnpm: `if (JSON.stringify(process.argv.slice(2)) !== '["--version"]') process.exit(90); console.log('11.24.0')`,
    dsh: `if (JSON.stringify(process.argv.slice(2, 6)) !== '["plugin","--profile","web","add"]') process.exit(90)`,
  }
  for (const [name, source] of Object.entries(commands)) {
    const file = join(bin, name)
    await writeFile(file, `#!${process.execPath}\n${source}\n`)
    await chmod(file, 0o755)
  }
  const server = join(root, 'server.cjs')
  const serverPid = join(root, 'server.pid')
  // Bound the fixture even if a future runner regression stops cleaning it up.
  await writeFile(server, [
    `require('node:fs').writeFileSync(${JSON.stringify(serverPid)}, String(process.pid));`,
    shutdown,
    'setTimeout(() => process.exit(91), 5000).unref();',
    "console.log('fixture ready');",
    exitBeforeTeardown === undefined ? 'setInterval(() => {}, 1000)' : `process.exit(${exitBeforeTeardown})`,
    '',
  ].join('\n'))
  const config = {
    schema: 1,
    image: 'node:24-bookworm',
    dshVersion: '0.1.2-alpha.2',
    pnpmVersion: '11.24.0',
    profile: 'web',
    startCommand: [process.execPath, server],
    readyPattern: 'fixture ready',
    timeoutSeconds: 2,
    shutdownGraceSeconds: 1,
    probeCommand: probeExitCode === undefined ? [] : [process.execPath, '-e', `process.exit(${probeExitCode})`],
  }
  if (exitBeforeTeardown !== undefined) {
    // Ensure teardown sees an already-exited server, even under scheduler load.
    config.probeCommand = [process.execPath, '-e', `
      const pid = Number(require('node:fs').readFileSync(${JSON.stringify(serverPid)}, 'utf8'));
      const deadline = Date.now() + 1500;
      function wait() {
        try { process.kill(pid, 0) } catch (error) { process.exit(error.code === 'ESRCH' ? 0 : 92) }
        if (Date.now() >= deadline) process.exit(93);
        setTimeout(wait, 10);
      }
      wait();
    `]
  }
  const configFile = join(root, 'config.json')
  const plugin = join(root, 'fixture.tgz')
  await writeFile(configFile, JSON.stringify(config))
  await writeFile(plugin, 'offline fixture: the installer is stubbed\n')
  const child = spawnSync(process.execPath, [runner, '--config', configFile, '--plugin', plugin, '--output', output], {
    // No inherited credentials, real npm commands, or global toolchain settings.
    env: { HOME: join(root, 'home'), PATH: bin, NPM_CONFIG_PREFIX: prefix },
    encoding: 'utf8',
    timeout: 10_000,
  })
  assert.ifError(child.error)
  const result = JSON.parse(await readFile(join(output, 'result.json'), 'utf8'))
  const stdout = await readFile(join(output, 'stdout.log'), 'utf8')
  const stderr = await readFile(join(output, 'stderr.log'), 'utf8')
  const report = buildReport({
    config,
    artifact: { name: 'fixture.tgz', sizeBytes: 0, sha256: 'offline-fixture' },
    containerExitCode: child.status,
    containerResult: result,
    elapsedMs: 0,
    stdout,
    stderr,
  })
  return { child, result, report, stderr }
}

test('a nonzero shutdown exit fails the CLI and release report', options, async (t) => {
  const { child, result, report, stderr } = await runFixture(t,
    `process.on('SIGTERM', () => { console.error('shutdown persistence failed'); process.exit(7) })`)
  assert.equal(child.status, 1)
  assert.equal(result.status, 'failed')
  assert.equal(result.failure.phase, 'teardown')
  assert.match(result.failure.message, /exit code 7/)
  const teardown = result.steps.filter((step) => step.name === 'teardown')
  assert.equal(teardown.length, 1)
  assert.equal(teardown[0].status, 'failed')
  assert.equal(teardown[0].exitCode, 7)
  assert.match(stderr, /shutdown persistence failed/)
  assert.equal(report.status, 'failed')
  assert.equal(report.failureClassification, 'teardown')
  assert.match(renderMarkdown(report), /failed/)
})

test('a successful shutdown handler passes', options, async (t) => {
  const { child, result, report } = await runFixture(t, `process.on('SIGTERM', () => process.exit(0))`)
  assert.equal(child.status, 0)
  assert.equal(result.status, 'passed')
  assert.equal(result.steps.at(-1).exitCode, 0)
  assert.equal(report.status, 'passed')
})

test('the requested SIGTERM is accepted without a custom handler', options, async (t) => {
  const { child, result } = await runFixture(t, '')
  assert.equal(child.status, 0)
  assert.equal(result.status, 'passed')
  assert.equal(result.steps.at(-1).status, 'passed')
  assert.equal(result.steps.at(-1).exitCode, null)
})

test('an unexpected signal during shutdown fails', options, async (t) => {
  const { child, result } = await runFixture(t, `process.on('SIGTERM', () => process.kill(process.pid, 'SIGUSR2'))`)
  assert.equal(child.status, 1)
  assert.equal(result.failure.phase, 'teardown')
  assert.match(result.failure.message, /signal SIGUSR2/)
  assert.equal(result.steps.filter((step) => step.name === 'teardown').length, 1)
})

test('a forced shutdown remains a teardown failure', options, async (t) => {
  const { child, result } = await runFixture(t, `process.on('SIGTERM', () => {})`)
  assert.equal(child.status, 1)
  assert.equal(result.failure.phase, 'teardown')
  assert.match(result.failure.message, /did not stop within 1s after SIGTERM/)
  assert.equal(result.steps.filter((step) => step.name === 'teardown').length, 1)
})

test('a probe failure stays primary while shutdown failure retains its exit code', options, async (t) => {
  const { child, result, report } = await runFixture(t,
    `process.on('SIGTERM', () => process.exit(7))`, { probeExitCode: 9 })
  assert.equal(child.status, 1)
  assert.equal(result.failure.phase, 'probe')
  assert.equal(report.failureClassification, 'probe')
  const teardown = result.steps.filter((step) => step.name === 'teardown')
  assert.equal(teardown.length, 1)
  assert.equal(teardown[0].status, 'failed')
  assert.equal(teardown[0].exitCode, 7)
})

test('an exit before teardown still fails for a nonzero status', options, async (t) => {
  const { child, result } = await runFixture(t, '', { exitBeforeTeardown: 7 })
  assert.equal(child.status, 1)
  assert.equal(result.failure.phase, 'teardown')
  assert.match(result.failure.message, /before teardown with exit code 7/)
  assert.equal(result.steps.filter((step) => step.name === 'teardown').length, 1)
})
