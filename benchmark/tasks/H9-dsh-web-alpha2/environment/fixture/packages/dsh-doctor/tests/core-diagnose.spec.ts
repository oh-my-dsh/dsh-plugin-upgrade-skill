
/**
 * Deterministic diagnosis checks.
 */
import { describe, expect, it } from 'vitest'
import { createMemoryFs } from '../src/core/fs.ts'
import { diagnoseFallback, diagnoseProfile } from '../src/core/diagnose.ts'
import type { ProfileDiagnosisInput } from '../src/core/diagnose.ts'
import type { PatchParseResult } from '../src/core/types.ts'

const HOME = '/h'
const DIR = '/h/profiles/web'

function baseInput(overrides: Partial<ProfileDiagnosisInput> = {}): ProfileDiagnosisInput {
  return {
    home: HOME,
    profile: 'web',
    dir: DIR,
    fs: createMemoryFs(),
    manifest: { raw: {}, bundles: ['@deepseek-ai/dsh-base'], hasDshProfile: true, dependencies: {} },
    manifestText: '{}',
    bundleResolvable: (name) => name === '@deepseek-ai/dsh-base',
    bundleDeclaresPatch: (name) => (name === '@deepseek-ai/dsh-base' ? true : undefined),
    env: { DSH_HOME: HOME },
    ...overrides,
  }
}

describe('profile diagnosis', () => {
  it('flags a manifest without dsh.profile.bundles as D-010', () => {
    const input = baseInput({ manifest: { raw: {}, bundles: [], hasDshProfile: false, dependencies: {} } })
    const diags = diagnoseProfile(input)
    expect(diags.some((d) => d.code === 'D-010')).toBe(true)
  })

  it('flags unresolvable bundles as D-020 and bundle-less ones as D-030', () => {
    const diags = diagnoseProfile(baseInput({ bundleResolvable: () => false }))
    expect(diags.some((d) => d.code === 'D-020')).toBe(true)
    const diags2 = diagnoseProfile(baseInput({ bundleDeclaresPatch: () => false }))
    expect(diags2.some((d) => d.code === 'D-030')).toBe(true)
  })

  it('flags a broken profile patch as D-040 (critical, gate dump-default)', () => {
    const broken: PatchParseResult = { entries: [], error: 'failed to parse profile patch: bad', warnings: [] }
    const diags = diagnoseProfile(baseInput({ profilePatch: broken }))
    const found = diags.find((d) => d.code === 'D-040')
    expect(found?.severity).toBe('critical')
    expect(found?.gate).toBe('dump-default')
  })

  it('flags duplicate row ids as D-230', () => {
    const rows = [
      { id: 'dup', name: 'a' },
      { id: 'dup', name: 'b' },
    ]
    const diags = diagnoseProfile(baseInput({ rows }))
    expect(diags.some((d) => d.code === 'D-230')).toBe(true)
  })

  it('flags an absolute settings row outside the home as D-080', () => {
    const rows = [{ id: 'settings', config: { path: '/elsewhere/settings.yaml' } }]
    const diags = diagnoseProfile(baseInput({ rows }))
    expect(diags.some((d) => d.code === 'D-080')).toBe(true)
  })

  it('does not flag settings paths inside the home', () => {
    const rows = [{ id: 'settings', config: { path: HOME + '/profiles/web/settings.yaml' } }]
    const diags = diagnoseProfile(baseInput({ rows }))
    expect(diags.some((d) => d.code === 'D-080')).toBe(false)
  })

  it('warns about unpinned git deps (D-100) and missing lockfiles (D-110)', () => {
    const input = baseInput({
      inventory: {
        rows: [
          { name: 'gh', declared: 'github:o/r#main', spec: { raw: 'github:o/r#main', kind: 'github', name: 'o/r', ref: 'main' }, mismatch: false, installed: true },
        ],
        lockfile: 'missing',
        nodeModules: 'missing',
      },
    })
    const diags = diagnoseProfile(input)
    expect(diags.some((d) => d.code === 'D-100')).toBe(true)
    expect(diags.some((d) => d.code === 'D-110')).toBe(true)
  })

  it('flags lockfile spec mismatches as D-120 and broken lockfiles as D-115', () => {
    const base = {
      rows: [{ name: 'x', declared: 'x@1.0.0', spec: { raw: 'x@1.0.0', kind: 'exact' as const, name: 'x', version: '1.0.0' }, locked: '1.0.1', mismatch: true, installed: true }],
      nodeModules: 'present' as const,
    }
    expect(diagnoseProfile(baseInput({ inventory: { ...base, lockfile: 'ok', lockfileVersion: '9.0' } })).some((d) => d.code === 'D-120')).toBe(true)
    expect(diagnoseProfile(baseInput({ inventory: { rows: [], lockfile: 'broken', nodeModules: 'missing' } })).some((d) => d.code === 'D-115')).toBe(true)
  })

  it('flags non-hoisted workspace linker as D-140 and release-age excludes as D-150', () => {
    const input = baseInput({
      inventory: {
        rows: [],
        lockfile: 'missing',
        nodeModules: 'missing',
        workspace: { nodeLinker: 'isolated', autoInstallPeers: false, allowBuilds: [], minimumReleaseAgeExclude: ['x@1.0.0'] },
      },
    })
    const diags = diagnoseProfile(input)
    expect(diags.some((d) => d.code === 'D-140')).toBe(true)
    expect(diags.some((d) => d.code === 'D-150')).toBe(true)
  })

  it('flags a too-old node as D-210 and sorts by severity', () => {
    const diags = diagnoseProfile(baseInput({ toolchain: { node: '20.11.0' } }))
    expect(diags.some((d) => d.code === 'D-210')).toBe(true)
    const critical = diagnoseProfile(baseInput({ profilePatch: { entries: [], error: 'x', warnings: [] }, toolchain: { node: '20.11.0' } }))
    expect(critical[0]?.code).toBe('D-040')
  })
})

describe('fallback diagnosis', () => {
  it('flags real directories where symlinks are expected (D-180)', async () => {
    const fs = createMemoryFs()
    await fs.mkdir('/h/profiles/node_modules', { recursive: true })
    await fs.mkdir('/h/profiles/node_modules/accepts')
    const diags = await diagnoseFallback(fs, HOME)
    expect(diags.some((d) => d.code === 'D-180')).toBe(true)
  })

  it('flags dangling links (D-170) and tolerates real scope dirs', async () => {
    const fs = createMemoryFs()
    await fs.mkdir('/h/profiles/node_modules/@deepseek-ai', { recursive: true })
    await fs.symlink('/nowhere', '/h/profiles/node_modules/dangling')
    await fs.symlink('/virt', '/h/profiles/node_modules/@deepseek-ai/dsh-base')
    const diags = await diagnoseFallback(fs, HOME)
    expect(diags.filter((d) => d.code === 'D-170').length).toBeGreaterThanOrEqual(2)
    expect(diags.some((d) => d.code === 'D-180')).toBe(false)
  })

  it('returns clean when the fallback dir is absent', async () => {
    const fs = createMemoryFs()
    expect(await diagnoseFallback(fs, HOME)).toEqual([])
  })
})