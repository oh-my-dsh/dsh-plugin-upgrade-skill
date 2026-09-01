import { mkdtemp, mkdir, readFile, rm, stat, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { describe, expect, it } from 'vitest'
import { credentialsFingerprint, mirrorCredentialFiles, provisionCapsule, type CapsuleOptions } from '../src/agent/capsule.ts'

type FakePaths = Parameters<typeof provisionCapsule>[0]['paths']
function makePaths(dir: string): FakePaths {
  return {
    root: dir, state: join(dir, 'state'), registry: join(dir, 'registry'), incidents: join(dir, 'incidents'),
    snapshots: join(dir, 'snapshots'), candidates: join(dir, 'candidates'), quarantine: join(dir, 'quarantine'),
    capsule: join(dir, 'capsule'), logs: join(dir, 'logs'), socket: join(dir, 's.sock'), token: join(dir, 't.ok'),
  }
}

function fakeRun(): NonNullable<CapsuleOptions['run']> {
  return async (command, args) => {
    if (command === 'dsh' && args[0] === '--version') return { code: 0, stdout: '0.1.1-rc.2\n', stderr: '' }
    if (args[0] === 'plugin') return { code: 0, stdout: '', stderr: '' }
    if (args.includes('--dump-config')) return { code: 0, stdout: 'rows:\n  - id: doctor\n', stderr: '' }
    return { code: 0, stdout: '', stderr: '' }
  }
}

describe('rescue capsule provisioning', () => {
  it('provisions, verifies and swaps current with previous', async () => {
    const dir = await mkdtemp(join(tmpdir(), 'dsh-doctor-capsule-'))
    try {
      const calls: string[][] = []
      const run: CapsuleOptions['run'] = async (command, args, env) => {
        calls.push([command, ...args])
        if (command === 'dsh' && args[0] === '--version') return { code: 0, stdout: '0.1.1-rc.2\n', stderr: '' }
        if (args[0] === 'plugin' && args[1] === '--profile') return { code: 0, stdout: '', stderr: '' }
        if (args.includes('--dump-config')) return { code: 0, stdout: 'rows:\n  - id: doctor\n', stderr: '' }
        if (!args.includes('--dump-config')) return { code: 0, stdout: '', stderr: '' }
        return { code: 0, stdout: '', stderr: '' }
      }
      const manifest = await provisionCapsule({
        paths: {
          root: dir, state: join(dir, 'state'), registry: join(dir, 'registry'), incidents: join(dir, 'incidents'),
          snapshots: join(dir, 'snapshots'), candidates: join(dir, 'candidates'), quarantine: join(dir, 'quarantine'),
          capsule: join(dir, 'capsule'), logs: join(dir, 'logs'), socket: join(dir, 's.sock'), token: join(dir, 't.ok'),
        },
        dshExecutable: 'dsh',
        doctorSpec: '@linxin666/dsh-doctor@0.2.7',
        run,
        now: () => '2026-01-01T00:00:00Z',
      })
      expect(manifest.status).toBe('verified')
      expect(manifest.dshVersion).toBe('0.1.1-rc.2')
      expect(calls.some(c => c[0] === 'dsh' && c.includes('plugin'))).toBe(true)
      expect(calls.some(c => c.includes('--dump-config'))).toBe(true)
      const saved = JSON.parse(await readFile(join(dir, 'capsule', 'current', 'manifest.json'), 'utf8')) as typeof manifest
      expect(saved.rescueHome).toMatch(/[\\/]current/)
    } finally {
      await rm(dir, { recursive: true, force: true })
    }
  })

  it('mirrors the user credential files into the rescue home with 0600 and metadata only', async () => {
    const dir = await mkdtemp(join(tmpdir(), 'dsh-doctor-capsule-'))
    try {
      const source = join(dir, 'source-home')
      await mkdir(join(source, 'profiles', 'web'), { recursive: true })
      await writeFile(join(source, 'settings.yaml'), 'providers:\n  openai:\n    apiKey: sk-secret-abc123\n', 'utf8')
      await writeFile(join(source, '.credentials.yaml'), 'chatgpt: token-m0-secret-xyz\n', 'utf8')
      await writeFile(join(source, '.env'), 'DSH_API_KEY=env-key-987654\n', 'utf8')
      await writeFile(join(source, 'unrelated.txt'), 'not mirrored\n', 'utf8')
      const manifest = await provisionCapsule({
        paths: makePaths(dir),
        dshExecutable: 'dsh',
        doctorSpec: '@linxin666/dsh-doctor@0.2.7',
        sourceHome: source,
        sourceProfile: 'web',
        doctorVersion: '0.2.7',
        run: fakeRun(),
        now: () => '2026-01-01T00:00:00Z',
      })
      expect(manifest.credentialsMirror).toEqual(['settings.yaml', '.credentials.yaml', '.env'])
      expect(manifest.credentialsFingerprint).toMatch(/^[0-9a-f]{64}$/)
      expect(manifest.credentialsAt).toBe('2026-01-01T00:00:00Z')
      const rescueHome = join(dir, 'capsule', 'current', 'rescue-home')
      for (const rel of ['settings.yaml', '.credentials.yaml', '.env']) {
        if (process.platform !== 'win32') expect((await stat(join(rescueHome, rel))).mode & 0o777).toBe(0o600)
      }
      await expect(readFile(join(rescueHome, 'settings.yaml'), 'utf8')).resolves.toContain('sk-secret-abc123')
      await expect(stat(join(rescueHome, 'unrelated.txt'))).rejects.toThrow()
      const saved = await readFile(join(dir, 'capsule', 'current', 'manifest.json'), 'utf8')
      expect(saved).not.toContain('sk-secret-abc123')
      expect(saved).not.toContain('token-m0-secret-xyz')
      expect(saved).not.toContain('env-key-987654')
    } finally {
      await rm(dir, { recursive: true, force: true })
    }
  })

  it('skips the mirror when disabled or when the source has no credential files', async () => {
    const dir = await mkdtemp(join(tmpdir(), 'dsh-doctor-capsule-'))
    try {
      const source = join(dir, 'source-home')
      await mkdir(join(source, 'profiles', 'web'), { recursive: true })
      await writeFile(join(source, 'settings.yaml'), 'providers:\n  openai:\n    apiKey: x\n', 'utf8')
      const disabled = await provisionCapsule({
        paths: makePaths(dir), dshExecutable: 'dsh', doctorSpec: '@linxin666/dsh-doctor@0.2.7',
        sourceHome: source, sourceProfile: 'web', mirrorCredentials: false, run: fakeRun(),
        now: () => '2026-01-01T00:00:00Z',
      })
      expect(disabled.credentialsMirror).toBeUndefined()
      const emptySource = join(dir, 'empty-home')
      await mkdir(emptySource, { recursive: true })
      const empty = await provisionCapsule({
        paths: makePaths(dir), dshExecutable: 'dsh', doctorSpec: '@linxin666/dsh-doctor@0.2.7',
        sourceHome: emptySource, sourceProfile: 'web', run: fakeRun(),
        now: () => '2026-01-01T00:00:00Z',
      })
      expect(empty.credentialsMirror).toBeUndefined()
    } finally {
      await rm(dir, { recursive: true, force: true })
    }
  })

  it('fingerprints the sorted credential source set and mirrors only existing files', async () => {
    const dir = await mkdtemp(join(tmpdir(), 'dsh-doctor-capsule-'))
    try {
      const source = join(dir, 'source-home')
      await mkdir(join(source, 'profiles', 'web'), { recursive: true })
      await writeFile(join(source, '.env'), 'A=1\n', 'utf8')
      await writeFile(join(source, 'settings.yaml'), 'B: 2\n', 'utf8')
      const first = await credentialsFingerprint(source, 'web')
      expect(first).toMatch(/^[0-9a-f]{64}$/)
      await writeFile(join(source, '.env'), 'A=2\n', 'utf8')
      const second = await credentialsFingerprint(source, 'web')
      expect(second).not.toBe(first)
      const mirrored = await mirrorCredentialFiles({ sourceHome: source, sourceProfile: 'web', targetHome: join(dir, 'rescue') })
      expect(mirrored).toEqual(['settings.yaml', '.env'])
      expect(stat(join(dir, 'rescue', 'settings.yaml'))).resolves.toBeDefined()
    } finally {
      await rm(dir, { recursive: true, force: true })
    }
  })

  it('fails loud when the rescue Doctor cannot be installed', async () => {
    const dir = await mkdtemp(join(tmpdir(), 'dsh-doctor-capsule-'))
    try {
      const run: CapsuleOptions['run'] = async (command, args) => {
        if (command === 'dsh' && args[0] === '--version') return { code: 0, stdout: '0.1.1-rc.2\n', stderr: '' }
        return { code: 1, stdout: '', stderr: 'pnpm install failed' }
      }
      await expect(provisionCapsule({
        paths: {
          root: dir, state: join(dir, 'state'), registry: join(dir, 'registry'), incidents: join(dir, 'incidents'),
          snapshots: join(dir, 'snapshots'), candidates: join(dir, 'candidates'), quarantine: join(dir, 'quarantine'),
          capsule: join(dir, 'capsule'), logs: join(dir, 'logs'), socket: '', token: '',
        },
        dshExecutable: 'dsh', doctorSpec: '@linxin666/dsh-doctor@0.2.7', run,
      })).rejects.toThrow(/rescue Doctor install failed/)
    } finally {
      await rm(dir, { recursive: true, force: true })
    }
  })
})
