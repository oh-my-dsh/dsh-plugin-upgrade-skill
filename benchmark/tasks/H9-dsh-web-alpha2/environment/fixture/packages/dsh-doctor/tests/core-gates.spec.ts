/**
 * Injectable health gates: dump-default and isolated start.
 */
import { describe, expect, it } from 'vitest'
import { countOccurrences, gateEnvironment, parseServerUrl, runDumpDefaultGate, runStartGate } from '../src/core/gates.ts'
import type { GateDeps, HttpClient, ProcessClient, SpawnHandle } from '../src/core/gates.ts'
import { createYamlEngine } from '../src/core/yaml.ts'
import { defaultRules, redactText } from '../src/core/redact.ts'

const DUMP = `# == @deepseek-ai/dsh-base
- id: timer
  name: '@deepseek-ai/cordis-plugin-timer'
- id: mem
  name: '@deepseek-ai/dsh-mcp-client'
  config:
    headers:
      Authorization: Token m0-secretsecretsecret12
`

function makeDeps(client: ProcessClient, http: HttpClient): GateDeps {
  return {
    client,
    http,
    engine: createYamlEngine(),
    redactText: (text) => redactText(text, defaultRules()),
    clock: () => 0,
  }
}

type Emitter = { emitOut: (chunk: string) => void; emitErr: (chunk: string) => void; emitExit: (code: number | null, signal: string | null) => void }

function makeClient(seed: (emit: Emitter, handle: SpawnHandle) => void): ProcessClient {
  return {
    spawn(): SpawnHandle {
      const listeners: { out: ((c: string) => void)[]; err: ((c: string) => void)[]; exit: ((c: number | null, s: string | null) => void)[] } = { out: [], err: [], exit: [] }
      const emit: Emitter = {
        emitOut: (chunk: string) => { for (const cb of listeners.out) cb(chunk) },
        emitErr: (chunk: string) => { for (const cb of listeners.err) cb(chunk) },
        emitExit: (code: number | null, signal: string | null) => { for (const cb of listeners.exit) cb(code, signal) },
      }
      const handle: SpawnHandle = {
        onStdout: (cb) => listeners.out.push(cb),
        onStderr: (cb) => listeners.err.push(cb),
        onExit: (cb) => listeners.exit.push(cb),
        kill: () => { queueMicrotask(() => emit.emitExit(0, 'SIGTERM')) },
      }
      queueMicrotask(() => seed(emit, handle))
      return handle
    },
  }
}

function baseEnv(): Record<string, string | undefined> {
  return { PATH: '/bin', HOME: '/users/z' }
}

const opts = { dshPath: '/bin/dsh', isolatedHome: '/iso', profile: 'web', env: baseEnv(), timeoutMs: 4000, stopGraceMs: 3000 }

describe('helpers', () => {
  it('parses the printed server URL', () => {
    expect(parseServerUrl('boot log\ndsh web: http://127.0.0.1:54906\n')).toBe('http://127.0.0.1:54906')
    expect(parseServerUrl('nothing here')).toBeUndefined()
  })

  it('builds an isolated gate environment, forcing DSH_HOME and telemetry', () => {
    const env = gateEnvironment(baseEnv(), '/iso')
    expect(env.DSH_HOME).toBe('/iso')
    expect(env.DSH_TELEMETRY_DISABLED).toBe('1')
    expect(env.PATH).toBe('/bin')
  })

  it('counts marker occurrences', () => {
    expect(countOccurrences('__DSH_BOOT__x__DSH_BOOT__', '__DSH_BOOT__')).toBe(2)
    expect(countOccurrences('', 'a')).toBe(0)
  })
})

describe('gate 1: dump-default', () => {
  it('passes on exit 0 with a parsable entry array and redacts secrets', async () => {
    const client = makeClient((emit) => { emit.emitOut(DUMP); emit.emitExit(0, null) })
    const report = await runDumpDefaultGate(makeDeps(client, {} as HttpClient), opts, baseEnv())
    expect(report.ok).toBe(true)
    expect(report.fingerprint).toHaveLength(8)
    expect(report.stderrSample ?? '').not.toContain('m0-secretsecretsecret12')
  })

  it('fails on non-zero exit', async () => {
    const client = makeClient((emit) => { emit.emitErr('dsh: fatal load failure'); emit.emitExit(1, null) })
    const report = await runDumpDefaultGate(makeDeps(client, {} as HttpClient), opts, baseEnv())
    expect(report.ok).toBe(false)
    expect(report.exitCode).toBe(1)
    expect(report.error).toContain('exit')
  })

  it('fails when the dump is not valid YAML or not an array', async () => {
    const client1 = makeClient((emit) => { emit.emitOut(': bad: ['); emit.emitExit(0, null) })
    const report1 = await runDumpDefaultGate(makeDeps(client1, {} as HttpClient), opts, baseEnv())
    expect(report1.ok).toBe(false)
    const client2 = makeClient((emit) => { emit.emitOut('a: b'); emit.emitExit(0, null) })
    const report2 = await runDumpDefaultGate(makeDeps(client2, {} as HttpClient), opts, baseEnv())
    expect(report2.ok).toBe(false)
    expect(report2.error).toContain('entry array')
  })
})

describe('gate 2: start', () => {
  const httpOk: HttpClient = { get: async (url) => ({ status: 200, body: '<html><script>window.__DSH_BOOT__</script></html>' }) }

  it('passes when the boot prints a URL, the probe returns 200 with a marker, and exit is graceful', async () => {
    const client = makeClient((emit) => {
      emit.emitOut('dsh web: http://127.0.0.1:54906\n')
    })
    const report = await runStartGate(makeDeps(client, httpOk), opts, baseEnv())
    expect(report.ok).toBe(true)
    expect(report.url).toBe('http://127.0.0.1:54906')
    expect(report.httpStatus).toBe(200)
    expect(report.markerHits).toBe(1)
    expect(report.signal).toBe('SIGTERM')
  })

  it('fails when no server URL is printed', async () => {
    const client = makeClient((emit) => { emit.emitOut('nothing'); emit.emitExit(0, null) })
    const report = await runStartGate(makeDeps(client, { get: async () => ({ status: 200, body: '' }) }), opts, baseEnv())
    expect(report.ok).toBe(false)
    expect(report.error).toContain('announcing')
  })

  it('fails on probe status mismatch or a missing marker', async () => {
    const client = makeClient((emit) => { emit.emitOut('dsh web: http://127.0.0.1:1\n') })
    const badStatus = await runStartGate(makeDeps(client, { get: async () => ({ status: 500, body: 'err' }) }), opts, baseEnv())
    expect(badStatus.ok).toBe(false)
    const badMarker = await runStartGate(makeDeps(client, { get: async () => ({ status: 200, body: '<html></html>' }) }), opts, baseEnv())
    expect(badMarker.error).toContain('boot marker')
  })

  it('fails on a non-graceful exit after SIGTERM', async () => {
    const client: ProcessClient = {
      spawn(): SpawnHandle {
        const listeners: { out: ((c: string) => void)[]; err: ((c: string) => void)[]; exit: ((c: number | null, s: string | null) => void)[] } = { out: [], err: [], exit: [] }
        const handle: SpawnHandle = {
          onStdout: (cb) => listeners.out.push(cb),
          onStderr: (cb) => listeners.err.push(cb),
          onExit: (cb) => listeners.exit.push(cb),
          kill: () => { queueMicrotask(() => { for (const cb of listeners.exit) cb(1, 'SIGTERM') }) },
        }
        queueMicrotask(() => { for (const cb of listeners.out) cb('dsh web: http://127.0.0.1:2\n') })
        return handle
      },
    }
    const report = await runStartGate(makeDeps(client, httpOk), opts, baseEnv())
    expect(report.ok).toBe(false)
    expect(report.error).toContain('graceful')
  })

  it('fails when stderr carries a fatal load failure', async () => {
    const client = makeClient((emit) => {
      emit.emitOut('dsh web: http://127.0.0.1:3\n')
      emit.emitErr('dsh: fatal load failure: boom')
    })
    const report = await runStartGate(makeDeps(client, httpOk), opts, baseEnv())
    expect(report.ok).toBe(false)
    expect(report.error).toContain('fatal')
  })

  it('times out and kills a boot that never becomes ready', async () => {
    let killed = ''
    const client: ProcessClient = {
      spawn(): SpawnHandle {
        const listeners: { out: ((c: string) => void)[]; err: ((c: string) => void)[]; exit: ((c: number | null, s: string | null) => void)[] } = { out: [], err: [], exit: [] }
        return {
          onStdout: (cb) => listeners.out.push(cb),
          onStderr: (cb) => listeners.err.push(cb),
          onExit: (cb) => listeners.exit.push(cb),
          kill: (signal) => {
            killed = signal ?? ''
            queueMicrotask(() => { for (const cb of listeners.exit) cb(null, 'SIGKILL') })
          },
        }
      },
    }
    const report = await runStartGate(makeDeps(client, { get: async () => ({ status: 200, body: '' }) }), { ...opts, timeoutMs: 200, stopGraceMs: 500 }, baseEnv())
    expect(report.ok).toBe(false)
    expect(report.timedOut).toBe(true)
    expect(killed).toBe('SIGKILL')
  })
})

