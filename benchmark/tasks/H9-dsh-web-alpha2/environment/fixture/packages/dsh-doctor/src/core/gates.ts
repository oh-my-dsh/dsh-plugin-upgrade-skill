/**
 * Injectable health gates.
 *
 * Gate contracts:
 * - Gate 1 (dump-default): run an isolated-home dump of the bundle layers
 *   only. It never parses user patch layers, so a broken profile or home
 *   patch cannot block it - exactly the repair escape hatch the engine
 *   depends on.
 * - Gate 2 (start): boot an isolated copy, wait for the printed web URL,
 *   probe HTTP, then SIGTERM and require a graceful exit.
 *
 * Everything external (process spawn, HTTP, clock, redaction, YAML) is
 * injected so tests run hermetic.
 */
import { canonicalJson, sha256Short } from './hash.ts'
import type { GateReport, HttpResult, ProcessResult, RedactionResult } from './types.ts'
import type { YamlEngine } from './yaml.ts'

export interface SpawnHandle {
  onStdout(cb: (chunk: string) => void): void
  onStderr(cb: (chunk: string) => void): void
  onExit(cb: (code: number | null, signal: string | null) => void): void
  kill(signal?: string): void
}

export interface ProcessClient {
  spawn(cmd: string[], opts: { cwd?: string; env?: Record<string, string | undefined> }): SpawnHandle
}

export interface HttpClient {
  get(url: string, opts: { timeoutMs: number }): Promise<HttpResult>
}

export interface GateDeps {
  client: ProcessClient
  http: HttpClient
  engine: YamlEngine
  redactText(text: string): RedactionResult
  /** Milliseconds clock for duration reporting. */
  clock(): number
}

export interface GateOptions {
  dshPath: string
  /** Isolated home the profile copy lives in; must never be the live home. */
  isolatedHome: string
  profile: string
  /** Extra environment; DSH_HOME and the telemetry switch are forced. */
  env?: Record<string, string | undefined>
  timeoutMs?: number
  /** Gate 2 probe target path (default '/'), expected status, and marker. */
  probePath?: string
  probeStatus?: number
  probeMarker?: string
  /** Grace window after SIGTERM for a successful exit. */
  stopGraceMs?: number
}

const SERVER_URL_RE = /dsh web: http:\/\/127\.0\.0\.1:(\d+)/
const FATAL_PATTERNS = [/fatal load failure/i, /did not activate/i]

/** Parse the printed server URL from gate-2 stdout. */
export function parseServerUrl(stdout: string): string | undefined {
  const match = SERVER_URL_RE.exec(stdout)
  if (match === null) return undefined
  return 'http://127.0.0.1:' + match[1]
}

/** Merge an environment for an isolated gate run. */
export function gateEnvironment(base: Record<string, string | undefined>, isolatedHome: string): Record<string, string | undefined> {
  return {
    ...base,
    DSH_HOME: isolatedHome,
    DSH_TELEMETRY_DISABLED: '1',
  }
}

/** Run gate 1: bundle-layer dump under a broken-user-layer escape hatch. */
export async function runDumpDefaultGate(deps: GateDeps, options: GateOptions, env: Record<string, string | undefined>): Promise<GateReport> {
  const started = deps.clock()
  const result = await runToExit(deps.client, {
    cmd: [options.dshPath, '--profile', options.profile, '--dump-default-config'],
    cwd: options.isolatedHome,
    env: gateEnvironment(env, options.isolatedHome),
    timeoutMs: options.timeoutMs ?? 30000,
  })
  const report = baseReport(started, deps.clock(), result)
  report.gate = 'dump-default'
  report.profile = options.profile
  if (result.exitCode !== 0) {
    report.ok = false
    report.error = 'dump-default exited with code ' + String(result.exitCode) + (result.timedOut ? ' (timed out)' : '')
    report.stderrSample = tail(result.stderr, 800)
    return report
  }
  let parsed: unknown
  try {
    parsed = deps.engine.parse(result.stdout)
  } catch (error) {
    report.ok = false
    report.error = 'dump output is not valid YAML: ' + String(error)
    report.stderrSample = tail(result.stderr, 800)
    return report
  }
  if (!Array.isArray(parsed)) {
    report.ok = false
    report.error = 'dump output must be an entry array'
    report.stderrSample = tail(result.stderr, 800)
    return report
  }
  const redacted = deps.redactText(result.stdout)
  report.fingerprint = redacted.fingerprint
  report.ok = true
  return report
}

/** Run gate 2: isolated boot with HTTP probe and graceful termination. */
export async function runStartGate(deps: GateDeps, options: GateOptions, env: Record<string, string | undefined>): Promise<GateReport> {
  const started = deps.clock()
  const spawned = deps.client.spawn(
    [options.dshPath, '--profile', options.profile, '--no-open', '--port', '0'],
    {
      cwd: options.isolatedHome,
      env: gateEnvironment(env, options.isolatedHome),
    },
  )
  let stdout = ''
  let stderr = ''
  let url: string | undefined
  let settle: (result: ProcessResult) => void = () => {}
  const waitExit = new Promise<ProcessResult>((resolve) => {
    settle = resolve
  })
  spawned.onStdout((chunk) => {
    stdout += chunk
    if (url === undefined) url = parseServerUrl(stdout)
    if (url !== undefined && resolveReady !== undefined) resolveReady(url)
  })
  spawned.onStderr((chunk) => {
    stderr += chunk
  })
  spawned.onExit((code, signal) => {
    settle({ exitCode: code, signal, timedOut: false, durationMs: deps.clock() - started, stdout, stderr })
  })

  const timeoutMs = options.timeoutMs ?? 45000
  let resolveReady: ((url: string) => void) | undefined
  const ready = new Promise<string>((resolve) => { resolveReady = resolve })
  const timeout = new Promise<boolean>((resolve) => { setTimeout(() => resolve(true), timeoutMs) })
  const outcome = await Promise.race([
    ready.then((url) => ({ kind: 'ready' as const, url })),
    waitExit.then(() => ({ kind: 'exited' as const })),
    timeout.then(() => ({ kind: 'timeout' as const })),
  ])
  if (outcome.kind !== 'ready') {
    spawned.kill('SIGKILL')
    const result = await waitExit
    const report = baseReport(started, deps.clock(), result)
    report.gate = 'start'
    report.profile = options.profile
    report.timedOut = outcome.kind === 'timeout'
    report.ok = false
    report.error = outcome.kind === 'timeout' ? 'boot did not become ready within ' + timeoutMs + 'ms' : 'boot exited before announcing a server URL'
    report.stderrSample = tail(stderr, 800)
    return report
  }
  url = outcome.url
  const probeStatus = options.probeStatus ?? 200
  const probeMarker = options.probeMarker ?? '__DSH_BOOT__'
  let httpStatus = 0
  let body = ''
  if (url !== undefined) {
    try {
      const response = await deps.http.get(url + (options.probePath ?? '/'), { timeoutMs: 5000 })
      httpStatus = response.status
      body = response.body
    } catch (error) {
      httpStatus = 0
    }
  }
  const markerHits = countOccurrences(body, probeMarker)
  spawned.kill('SIGTERM')
  const grace = options.stopGraceMs ?? 7000
  const afterKill = await Promise.race([
    waitExit,
    new Promise<ProcessResult>((resolve) => {
      setTimeout(() => resolve(graceResult(deps.clock() - started, stdout, stderr)), grace)
    }),
  ])
  const report = baseReport(started, deps.clock(), afterKill)
  report.gate = 'start'
  report.profile = options.profile
  report.url = url
  report.httpStatus = httpStatus
  report.markerHits = markerHits
  report.stderrSample = tail(stderr, 800)
  if (url === undefined) {
    report.ok = false
    report.error = 'no server URL printed by the boot'
    return report
  }
  if (httpStatus !== probeStatus) {
    report.ok = false
    report.error = 'probe GET / returned HTTP ' + httpStatus + ' (expected ' + probeStatus + ')'
    return report
  }
  if (markerHits < 1) {
    report.ok = false
    report.error = 'probe body lacks the boot marker ' + JSON.stringify(probeMarker)
    return report
  }
  if (afterKill.exitCode !== 0) {
    report.ok = false
    report.error = 'boot exited with code ' + String(afterKill.exitCode) + ' after SIGTERM (graceful 0 expected)'
    return report
  }
  const fatal = FATAL_PATTERNS.find((pattern) => pattern.test(stderr))
  if (fatal !== undefined) {
    report.ok = false
    report.error = 'fatal boot failure detected in stderr: ' + String(fatal)
    return report
  }
  report.ok = true
  return report
}

function graceResult(durationMs: number, stdout: string, stderr: string): ProcessResult {
  return { exitCode: null, signal: 'SIGKILL', timedOut: true, durationMs, stdout, stderr }
}

function baseReport(started: number, now: number, result: ProcessResult): GateReport {
  return {
    gate: 'dump-default',
    profile: '',
    ok: false,
    exitCode: result.exitCode,
    signal: result.signal,
    timedOut: result.timedOut,
    durationMs: result.durationMs || now - started,
  }
}

/** Run a process to exit with output capture and timeout. */
export async function runToExit(client: ProcessClient, spec: { cmd: string[]; cwd?: string; env?: Record<string, string | undefined>; timeoutMs: number }): Promise<ProcessResult> {
  const startedAt = Date.now()
  const spawned = client.spawn(spec.cmd, { cwd: spec.cwd, env: spec.env })
  let stdout = ''
  let stderr = ''
  let settle: (result: ProcessResult) => void = () => {}
  const done = new Promise<ProcessResult>((resolve) => {
    settle = resolve
  })
  let timedOut = false
  const timer = setTimeout(() => {
    timedOut = true
    spawned.kill('SIGKILL')
  }, spec.timeoutMs)
  spawned.onStdout((chunk) => {
    stdout += chunk
  })
  spawned.onStderr((chunk) => {
    stderr += chunk
  })
  spawned.onExit((code, signal) => {
    clearTimeout(timer)
    settle({ exitCode: code, signal, timedOut, durationMs: Date.now() - startedAt, stdout, stderr })
  })
  return done
}

export function countOccurrences(text: string, needle: string): number {
  if (needle === '') return 0
  let count = 0
  let index = 0
  for (;;) {
    index = text.indexOf(needle, index)
    if (index === -1) return count
    count += 1
    index += needle.length
  }
}

function tail(text: string, max: number): string {
  return text.length <= max ? text : text.slice(text.length - max)
}

/** Fingerprint helper shared by gate reports: canonical JSON then digest. */
export function reportFingerprint(value: unknown): string {
  return sha256Short(canonicalJson(value), 12)
}
