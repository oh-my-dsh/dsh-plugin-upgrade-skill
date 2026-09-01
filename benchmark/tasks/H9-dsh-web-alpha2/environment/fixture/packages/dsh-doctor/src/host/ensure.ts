import { spawn } from 'node:child_process'
import { access, readFile } from 'node:fs/promises'
import { join } from 'node:path'
import { credentialsFingerprint, removeCapsuleCredentialFiles } from '../agent/capsule.ts'
import type { DoctorPaths } from '../agent/paths.ts'
import type { SupervisorResponse } from '../core/protocol.ts'

/**
 * Lifecycle orchestration for the Doctor supervisor service.
 *
 * The host half (the dsh web process) owns deployment because it always runs
 * the current package: it redeploys the user-level supervisor service through
 * the same package's CLI (idempotent, restart-inclusive), waits for the
 * supervisor to answer, refreshes the rescue capsule when its pinned version
 * is stale, and (on uninstall) marks the supervisor state before removing the
 * service. Every external effect sits behind injectable seams so tests verify
 * the full sequence without touching launchctl or a real dsh.
 * @module @linxin666/dsh-doctor/host
 */

/** Result of one spawned command. */
export interface SpawnResult { code: number; stdout: string; stderr: string }

/** Spawn seam: default runs the real process. */
export type SpawnFn = (command: string, args: string[], opts: { timeoutMs: number; env?: NodeJS.ProcessEnv }) => Promise<SpawnResult>

/** Supervisor IPC seam (throws while the supervisor is down). */
export type StatusFn = () => Promise<SupervisorResponse>

/** Verdict of one lifecycle verb. */
export interface LifecycleReport {
  ok: boolean
  code: string
  message?: string
  /** Human-readable steps that ran, in order. */
  steps: string[]
}

export interface DoctorLifecycleDeps {
  paths: DoctorPaths
  /** Absolute path of the package CLI (lib/cli.mjs) driving the service. */
  cliPath: string
  /** Version of the host half (package.json); capsule staleness compares against it. */
  version: string
  status: StatusFn
  /** Mark the supervisor state uninstalling before service removal. */
  markUninstall?: () => Promise<unknown>
  spawn?: SpawnFn
  /** Whether the supervisor state is provisioned (token file exists). */
  provisioned?: () => Promise<boolean>
  /** Whether the rescue capsule is missing or pinned to another doctor/credentials version. */
  capsuleStale?: (currentVersion: string, source?: { home: string; profile: string }) => Promise<boolean>
  /** Source profile whose credentials mirror staleness is checked against. */
  source?: { home: string; profile: string }
  pollAttempts?: number
  pollDelayMs?: number
}

/** In-flight dedupe face exposed to the routes. */
export interface DoctorLifecycle {
  ensure(): Promise<LifecycleReport>
  uninstall(): Promise<LifecycleReport>
}

const DEPLOY_TIMEOUT_MS = 90_000
const PROVISION_TIMEOUT_MS = 10 * 60_000

/** Default spawn: buffer stdout/stderr, kill on timeout, never reject. */
function defaultSpawn(command: string, args: string[], opts: { timeoutMs: number; env?: NodeJS.ProcessEnv }): Promise<SpawnResult> {
  return new Promise(resolve => {
    let child: ReturnType<typeof spawn>
    try {
      child = spawn(command, args, { env: opts.env ?? process.env, stdio: ['ignore', 'pipe', 'pipe'] })
    } catch (error) {
      resolve({ code: -1, stdout: '', stderr: String(error) })
      return
    }
    let stdout = ''; let stderr = ''
    child.stdout?.on('data', (chunk: Buffer) => { stdout += chunk.toString('utf8') })
    child.stderr?.on('data', (chunk: Buffer) => { stderr += chunk.toString('utf8') })
    const timer = setTimeout(() => child.kill('SIGKILL'), opts.timeoutMs)
    child.once('error', error => { clearTimeout(timer); resolve({ code: -1, stdout, stderr: String(error) }) })
    child.once('close', code => { clearTimeout(timer); resolve({ code: code ?? -1, stdout, stderr }) })
  })
}

/** True when the supervisor state directory holds the IPC token. */
export async function defaultProvisioned(paths: DoctorPaths): Promise<boolean> {
  try {
    await access(paths.token)
    return true
  } catch {
    return false
  }
}

/**
 * True when the capsule is absent, pinned to another doctor version, or its
 * mirrored credentials no longer match the current source files (the user
 * changed providers or keys since the last provision).
 */
export async function defaultCapsuleStale(paths: DoctorPaths, currentVersion: string, source?: { home: string; profile: string }): Promise<boolean> {
  try {
    const raw = await readFile(join(paths.capsule, 'current', 'manifest.json'), 'utf8')
    const manifest = JSON.parse(raw) as { doctorVersion?: unknown; credentialsMirror?: unknown; credentialsFingerprint?: unknown }
    if (manifest.doctorVersion !== currentVersion) return true
    const mirror = Array.isArray(manifest.credentialsMirror) ? manifest.credentialsMirror : []
    if (mirror.length === 0) return false
    if (source === undefined) return true
    const current = await credentialsFingerprint(source.home, source.profile)
    return manifest.credentialsFingerprint !== current
  } catch {
    return true
  }
}

/** Run one lifecycle verb; concurrent calls of the same verb share the run. */
export function createDoctorLifecycle(deps: DoctorLifecycleDeps): DoctorLifecycle {
  let ensuring: Promise<LifecycleReport> | undefined
  let uninstalling: Promise<LifecycleReport> | undefined
  return {
    ensure(): Promise<LifecycleReport> {
      ensuring ??= ensureDoctor(deps).finally(() => { ensuring = undefined })
      return ensuring
    },
    uninstall(): Promise<LifecycleReport> {
      uninstalling ??= uninstallDoctor(deps).finally(() => { uninstalling = undefined })
      return uninstalling
    },
  }
}

/** Redeploy the service, wait for the supervisor, then refresh a stale capsule. */
export async function ensureDoctor(deps: DoctorLifecycleDeps): Promise<LifecycleReport> {
  const steps: string[] = []
  const spawnImpl = deps.spawn ?? defaultSpawn
  const first = await spawnImpl(process.execPath, [deps.cliPath, 'service-install'], { timeoutMs: DEPLOY_TIMEOUT_MS })
  if (first.code !== 0) {
    return { ok: false, code: 'SERVICE_INSTALL_FAILED', message: first.stderr.trim() || first.stdout.trim() || 'service install exited ' + String(first.code), steps }
  }
  steps.push('service')
  const awaited = await waitForSupervisor(deps)
  if (!awaited.ok) {
    return { ok: false, code: 'SUPERVISOR_UNAVAILABLE', message: awaited.message ?? 'supervisor did not answer', steps }
  }
  if (await (deps.capsuleStale ?? defaultCapsuleStale.bind(undefined, deps.paths))(deps.version, deps.source)) {
    const second = await spawnImpl(process.execPath, [deps.cliPath, 'provision'], { timeoutMs: PROVISION_TIMEOUT_MS })
    if (second.code !== 0) {
      return { ok: false, code: 'PROVISION_FAILED', message: second.stderr.trim() || second.stdout.trim() || 'provision exited ' + String(second.code), steps }
    }
    steps.push('capsule')
    const refreshed = await waitForSupervisor(deps)
    if (!refreshed.ok) {
      return { ok: false, code: 'SUPERVISOR_UNAVAILABLE', message: refreshed.message ?? 'supervisor did not answer after capsule refresh', steps }
    }
  }
  return { ok: true, code: 'OK', steps }
}

/** Mark the supervisor state, then remove the user-level service. */
export async function uninstallDoctor(deps: DoctorLifecycleDeps): Promise<LifecycleReport> {
  const steps: string[] = []
  try {
    await deps.markUninstall?.()
  } catch {
    // The supervisor may already be gone; the service removal still runs.
  }
  const spawnImpl = deps.spawn ?? defaultSpawn
  const result = await spawnImpl(process.execPath, [deps.cliPath, 'service-uninstall'], { timeoutMs: DEPLOY_TIMEOUT_MS })
  if (result.code !== 0) {
    return { ok: false, code: 'SERVICE_UNINSTALL_FAILED', message: result.stderr.trim() || result.stdout.trim() || 'service uninstall exited ' + String(result.code), steps }
  }
  steps.push('service')
  const removed = await removeCapsuleCredentialFiles(deps.paths).catch(() => ({ removed: 0 }))
  if (removed.removed > 0) steps.push('credentials')
  return { ok: true, code: 'OK', steps }
}

/** Poll the supervisor until it answers or the attempts run out. */
async function waitForSupervisor(deps: DoctorLifecycleDeps): Promise<{ ok: boolean; message?: string }> {
  const attempts = deps.pollAttempts ?? 20
  const delay = deps.pollDelayMs ?? 1000
  const provisioned = deps.provisioned ?? defaultProvisioned.bind(undefined, deps.paths)
  let last = ''
  for (let attempt = 0; attempt < attempts; attempt++) {
    try {
      const response = await deps.status()
      if (response.ok) return { ok: true }
      last = response.error?.message ?? 'supervisor refused'
    } catch (error) {
      last = error instanceof Error ? error.message : String(error)
    }
    await new Promise(resolve => setTimeout(resolve, delay))
  }
  const hasState = await provisioned().catch(() => false)
  if (!hasState) return { ok: false, message: 'supervisor is not provisioned' }
  return { ok: false, message: last || 'supervisor did not answer' }
}
