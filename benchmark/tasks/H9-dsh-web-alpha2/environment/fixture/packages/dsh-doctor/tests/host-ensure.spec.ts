import { mkdtemp, mkdir, rm, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { describe, expect, it, vi } from 'vitest'
import { doctorPaths } from '../src/agent/paths.ts'
import {
  createDoctorLifecycle,
  defaultCapsuleStale,
  defaultProvisioned,
  ensureDoctor,
  uninstallDoctor,
  type DoctorLifecycleDeps,
  type SpawnResult,
} from '../src/host/ensure.ts'
import { credentialsFingerprint } from '../src/agent/capsule.ts'
import type { SupervisorResponse } from '../src/core/protocol.ts'

const okResponse: SupervisorResponse = { ok: true, snapshot: { protocol: 1, phase: 'armed', version: '9.9.9', profiles: [], incidents: [], updatedAt: '2026-01-01T00:00:00Z' } }

function okSpawn(code = 0): SpawnResult {
  return { code, stdout: '', stderr: code === 0 ? '' : 'boom' }
}

function depsWith(overrides: Partial<DoctorLifecycleDeps>): {
  deps: DoctorLifecycleDeps
  spawn: ReturnType<typeof vi.fn>
  status: ReturnType<typeof vi.fn>
  capsuleStale: ReturnType<typeof vi.fn>
} {
  const spawn = vi.fn(async () => okSpawn(0))
  const status = vi.fn(async () => okResponse)
  const capsuleStale = vi.fn(async () => false)
  const paths = doctorPaths({ DSH_DOCTOR_HOME: '/nonexistent' })
  const deps: DoctorLifecycleDeps = {
    paths,
    cliPath: '/site/lib/cli.mjs',
    version: '9.9.9',
    status,
    spawn,
    capsuleStale,
    ...overrides,
  }
  return { deps, spawn, status, capsuleStale }
}

describe('ensureDoctor', () => {
  it('deploys the service, waits for the supervisor and skips a fresh capsule', async () => {
    const { deps, spawn, status } = depsWith({})
    const outcome = await ensureDoctor(deps)
    expect(outcome.ok).toBe(true)
    expect(outcome.steps).toEqual(['service'])
    expect(spawn).toHaveBeenCalledTimes(1)
    expect(spawn.mock.calls[0]![1]).toEqual(['/site/lib/cli.mjs', 'service-install'])
    expect(status).toHaveBeenCalled()
  })

  it('refreshes the capsule when stale and polls again', async () => {
    const { deps, spawn, status, capsuleStale } = depsWith({})
    capsuleStale.mockResolvedValue(true)
    const outcome = await ensureDoctor(deps)
    expect(outcome.ok).toBe(true)
    expect(outcome.steps).toEqual(['service', 'capsule'])
    expect(spawn.mock.calls[1]![1]).toEqual(['/site/lib/cli.mjs', 'provision'])
    expect(status.mock.calls.length).toBeGreaterThanOrEqual(2)
  })

  it('fails fast on a failed service install and never provisions', async () => {
    const { deps, spawn, status, capsuleStale } = depsWith({})
    spawn.mockResolvedValue(okSpawn(1))
    const outcome = await ensureDoctor(deps)
    expect(outcome.ok).toBe(false)
    expect(outcome.code).toBe('SERVICE_INSTALL_FAILED')
    expect(status).not.toHaveBeenCalled()
    expect(capsuleStale).not.toHaveBeenCalled()
  })

  it('reports SUPERVISOR_UNAVAILABLE when the daemon never answers', async () => {
    const { deps, status, capsuleStale } = depsWith({})
    status.mockRejectedValue(new Error('ECONNREFUSED'))
    const outcome = await ensureDoctor({ ...deps, pollAttempts: 2, pollDelayMs: 1 })
    expect(outcome.ok).toBe(false)
    expect(outcome.code).toBe('SUPERVISOR_UNAVAILABLE')
    expect(capsuleStale).not.toHaveBeenCalled()
  })
})

describe('uninstallDoctor', () => {
  it('marks supervisor state and removes the service', async () => {
    const markUninstall = vi.fn(async () => undefined)
    const { deps, spawn } = depsWith({ markUninstall })
    const outcome = await uninstallDoctor(deps)
    expect(outcome.ok).toBe(true)
    expect(outcome.steps).toEqual(['service'])
    expect(markUninstall).toHaveBeenCalledTimes(1)
    expect(spawn.mock.calls[0]![1]).toEqual(['/site/lib/cli.mjs', 'service-uninstall'])
  })

  it('continues when the supervisor is already gone', async () => {
    const markUninstall = vi.fn(async () => { throw new Error('ECONNREFUSED') })
    const { deps } = depsWith({ markUninstall })
    const outcome = await uninstallDoctor(deps)
    expect(outcome.ok).toBe(true)
  })
})

describe('createDoctorLifecycle', () => {
  it('coalesces concurrent ensure calls into one deployment', async () => {
    const { deps } = depsWith({})
    const cycle = createDoctorLifecycle(deps)
    const [a, b] = await Promise.all([cycle.ensure(), cycle.ensure()])
    expect(a.ok).toBe(true)
    expect(b.ok).toBe(true)
    expect(deps.spawn).toHaveBeenCalledTimes(1)
  })
})

describe('capsule staleness and provisioning state', () => {
  it('detects a missing capsule, a stale pin and a fresh pin', async () => {
    const dir = await mkdtemp(join(tmpdir(), 'dsh-doctor-cap-'))
    const paths = doctorPaths({ DSH_DOCTOR_HOME: dir })
    await mkdir(join(paths.capsule, 'current'), { recursive: true })
    try {
      expect(await defaultCapsuleStale(paths, '1.0.0')).toBe(true)
      await writeFile(join(paths.capsule, 'current', 'manifest.json'), JSON.stringify({ doctorVersion: '1.0.0' }), 'utf8')
      expect(await defaultCapsuleStale(paths, '1.0.0')).toBe(false)
      expect(await defaultCapsuleStale(paths, '2.0.0')).toBe(true)
      await writeFile(join(paths.capsule, 'current', 'manifest.json'), JSON.stringify({}), 'utf8')
      expect(await defaultCapsuleStale(paths, '1.0.0')).toBe(true)
    } finally {
      await rm(dir, { recursive: true, force: true })
    }
  })

  it('treats a changed credential source as stale', async () => {
    const dir = await mkdtemp(join(tmpdir(), 'dsh-doctor-cap-'))
    const paths = doctorPaths({ DSH_DOCTOR_HOME: dir })
    const source = join(dir, 'source-home')
    await mkdir(join(source, 'profiles', 'web'), { recursive: true })
    await writeFile(join(source, '.env'), 'DSH_API_KEY=first\n', 'utf8')
    await mkdir(join(paths.capsule, 'current'), { recursive: true })
    try {
      const fingerprint = await credentialsFingerprint(source, 'web')
      await writeFile(join(paths.capsule, 'current', 'manifest.json'), JSON.stringify({ doctorVersion: '9.9.9', credentialsMirror: ['.env'], credentialsFingerprint: fingerprint }), 'utf8')
      expect(await defaultCapsuleStale(paths, '9.9.9', { home: source, profile: 'web' })).toBe(false)
      await writeFile(join(source, '.env'), 'DSH_API_KEY=changed\n', 'utf8')
      expect(await defaultCapsuleStale(paths, '9.9.9', { home: source, profile: 'web' })).toBe(true)
      expect(await defaultCapsuleStale(paths, '9.9.9')).toBe(true)
    } finally {
      await rm(dir, { recursive: true, force: true })
    }
  })

  it('treats the token file as the provisioning marker', async () => {
    const dir = await mkdtemp(join(tmpdir(), 'dsh-doctor-cap-'))
    const paths = doctorPaths({ DSH_DOCTOR_HOME: dir })
    try {
      expect(await defaultProvisioned(paths)).toBe(false)
      await mkdir(paths.state, { recursive: true })
      await writeFile(paths.token, 'x'.repeat(64), { mode: 0o600 })
      expect(await defaultProvisioned(paths)).toBe(true)
    } finally {
      await rm(dir, { recursive: true, force: true })
    }
  })
})
