/**
 * Safe names, home resolution, engine paths, and discovery.
 */
import { describe, expect, it } from 'vitest'
import { assertSafeProfileName, profileDir, profileIdentity, resolveDshHome } from '../src/core/profile.ts'
import {
  PathError,
  discoverProfiles,
  isInside,
  makeSnapshotId,
  quarantineDir,
  resolveProfileDir,
  safeRelativePath,
  stagingDir,
  validateSegment,
} from '../src/core/paths.ts'
import { createMemoryFs } from '../src/core/fs.ts'

describe('profile names', () => {
  it('accepts conservative names', () => {
    expect(assertSafeProfileName('web')).toBe('web')
    expect(assertSafeProfileName('liangshen-test')).toBe('liangshen-test')
    expect(assertSafeProfileName('x.y_z-1')).toBe('x.y_z-1')
  })

  it('rejects separators, reserved names, and unsafe segments', () => {
    for (const bad of ['', '.', '..', 'node_modules', 'a/b', String.fromCharCode(92) + 'a', 'a b', '.hidden']) {
      expect(() => assertSafeProfileName(bad)).toThrow()
    }
  })

  it('resolveDshHome mirrors the launcher precedence', () => {
    expect(resolveDshHome({ DSH_HOME: '/custom/home' }, '/u')).toBe('/custom/home')
    expect(resolveDshHome({ DSH_HOME: '   ' }, '/u')).toBe('/u/.dsh')
    expect(resolveDshHome({ HOME: '/u' }, '/u')).toBe('/u/.dsh')
    expect(resolveDshHome({ DSH_HOME: '~/x' }, '/u')).toBe('/u/x')
  })
})

describe('engine paths', () => {
  it('profile dirs stay under profiles and validate names', () => {
    expect(resolveProfileDir('/home/u/.dsh', 'web')).toBe('/home/u/.dsh/profiles/web')
    expect(() => resolveProfileDir('/home/u/.dsh', 'a/b')).toThrow()
  })

  it('safeRelativePath rejects traversal and absolutes', () => {
    expect(safeRelativePath('cordis.patch.yml')).toBe('cordis.patch.yml')
    expect(safeRelativePath('./a/./b.yml')).toBe('a/b.yml')
    for (const bad of ['/abs', '../up', 'a/../../b', String.fromCharCode(92) + 'win', '']) {
      expect(() => safeRelativePath(bad)).toThrow(PathError)
    }
  })

  it('isInside stays boundaries-safe', () => {
    expect(isInside('/h/profiles/web', '/h/profiles')).toBe(true)
    expect(isInside('/h/profiles/web', '/h/profiles/web')).toBe(true)
    expect(isInside('/h/profiles-web', '/h/profiles')).toBe(false)
    expect(isInside('/h/profiles', '/h/profiles/')).toBe(true)
  })

  it('segments and snapshot ids are safe and deterministic', () => {
    expect(validateSegment('txn-1', 'txn')).toBe('txn-1')
    expect(() => validateSegment('../up', 'txn')).toThrow(PathError)
    expect(makeSnapshotId('web', '20260821', 'abc')).toBe('web.20260821-' + makeSnapshotId('web', '20260821', 'abc').split('-')[1])
    expect(makeSnapshotId('web', '20260821', 'abc') === makeSnapshotId('web', '20260821', 'abc')).toBe(true)
  })

  it('engine roots live under the home', () => {
    expect(quarantineDir('/h')).toBe('/h/.dsh-doctor/quarantine')
    expect(stagingDir('/h')).toBe('/h/profiles/.doctor-staging')
  })

  it('profileIdentity distinguishes protected and rescue roles', () => {
    const protectedOne = profileIdentity('/h', 'web', '/bin/dsh')
    expect(protectedOne.role).toBe('protected')
    expect(protectedOne.id).toHaveLength(64)
    const rescue = profileIdentity('/h', 'web', '/bin/dsh', 'rescue')
    expect(rescue.id).toBe('system-rescue')
    const again = profileIdentity('/h', 'web', '/bin/dsh')
    expect(again.id).toBe(protectedOne.id)
  })
})

describe('discovery', () => {
  it('lists valid profile dirs and ignores the rest with reasons', async () => {
    const fs = createMemoryFs()
    await fs.mkdir('/h/profiles/web', { recursive: true })
    await fs.mkdir('/h/profiles/headless')
    await fs.mkdir('/h/profiles/node_modules')
    await fs.mkdir('/h/profiles/.hidden')
    await fs.writeText('/h/profiles/not-a-dir.txt', 'x')
    const result = await discoverProfiles(fs, '/h')
    expect(result.profiles).toEqual(['headless', 'web'])
    expect(result.ignored.map((i) => i.name)).toEqual(['.hidden', 'node_modules', 'not-a-dir.txt'])
    expect(result.ignored.find((i) => i.name === 'node_modules')?.reason).toContain('module fallback')
  })

  it('returns empty when the profiles dir is absent', async () => {
    const fs = createMemoryFs()
    expect((await discoverProfiles(fs, '/h')).profiles).toEqual([])
  })
})
