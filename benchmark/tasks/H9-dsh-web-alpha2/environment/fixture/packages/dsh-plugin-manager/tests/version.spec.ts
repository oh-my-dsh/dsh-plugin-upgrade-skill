import { describe, expect, it } from 'vitest'
import { compareVersions, displayMinimumVersion, dshRequirementOf, meetsMinimumDsh, parseDshVersion } from '../src/core/version.ts'

describe('parseDshVersion', () => {
  it('parses plain and prerelease versions, with v prefix and whitespace', () => {
    expect(parseDshVersion('0.1.1-rc.2')).toEqual({ major: 0, minor: 1, patch: 1, prerelease: ['rc', 2] })
    expect(parseDshVersion('v1.2.3')).toEqual({ major: 1, minor: 2, patch: 3, prerelease: [] })
    expect(parseDshVersion('  0.1.0-rc.8  ')).toEqual({ major: 0, minor: 1, patch: 0, prerelease: ['rc', 8] })
    expect(parseDshVersion('1.0.0-alpha.beta')).toEqual({ major: 1, minor: 0, patch: 0, prerelease: ['alpha', 'beta'] })
  })

  it('rejects malformed input', () => {
    for (const bad of ['', '1.2', '1.2.3.4', 'rc.8', '1.2.3-', '1.2.3-rc.', 'not-a-version']) {
      expect(parseDshVersion(bad)).toBeUndefined()
    }
  })
})

describe('compareVersions', () => {
  it('orders numeric prerelease identifiers numerically (semver, not lexical)', () => {
    expect(compareVersions('0.1.0-rc.8', '0.1.0-rc.10')).toBe(-1)
    expect(compareVersions('0.1.0-rc.10', '0.1.0-rc.8')).toBe(1)
    expect(compareVersions('0.1.0-rc.8', '0.1.0-rc.8')).toBe(0)
  })

  it('orders a newer host line above an older declared minimum across tuples', () => {
    expect(compareVersions('0.1.1-rc.2', '0.1.0-rc.8')).toBe(1)
    expect(compareVersions('0.1.0-rc.7', '0.1.0-rc.8')).toBe(-1)
  })

  it('orders a release above a prerelease of the same tuple', () => {
    expect(compareVersions('0.1.0', '0.1.0-rc.1')).toBe(1)
    expect(compareVersions('0.1.0-rc.1', '0.1.0')).toBe(-1)
  })

  it('orders numeric identifiers below alphanumeric ones and longer lists above prefixes', () => {
    expect(compareVersions('1.0.0-alpha', '1.0.0-alpha.1')).toBe(-1)
    expect(compareVersions('1.0.0-alpha.1', '1.0.0-alpha.beta')).toBe(-1)
    expect(compareVersions('1.0.0-alpha.beta', '1.0.0-beta')).toBe(-1)
    expect(compareVersions('1.0.0-beta.2', '1.0.0-beta.11')).toBe(-1)
  })

  it('returns undefined when either side is malformed', () => {
    expect(compareVersions('not-a-version', '1.0.0')).toBeUndefined()
    expect(compareVersions('1.0.0', '1.0')).toBeUndefined()
  })
})

describe('meetsMinimumDsh', () => {
  it('accepts a host above the declared minimum across prerelease lines', () => {
    expect(meetsMinimumDsh('0.1.1-rc.2', '>=0.1.0-rc.8')).toBe(true)
    expect(meetsMinimumDsh('0.1.1-rc.2', '>=0.1.1-rc.1')).toBe(true)
    expect(meetsMinimumDsh('0.1.0-rc.8', '>=0.1.0-rc.8')).toBe(true)
  })

  it('rejects a host below the declared minimum', () => {
    expect(meetsMinimumDsh('0.1.0-rc.7', '>=0.1.0-rc.8')).toBe(false)
    expect(meetsMinimumDsh('0.1.0-rc.8', '>=0.1.1-rc.1')).toBe(false)
  })

  it('means no constraint for unsupported range forms and malformed hosts', () => {
    expect(meetsMinimumDsh('0.1.1-rc.2', '^0.1.0-rc.8')).toBeUndefined()
    expect(meetsMinimumDsh('0.1.1-rc.2', '0.1.0-rc.8')).toBeUndefined()
    expect(meetsMinimumDsh('0.1.1-rc.2', '')).toBeUndefined()
    expect(meetsMinimumDsh('0.1.1-rc.2', '>= *')).toBeUndefined()
    expect(meetsMinimumDsh('nope', '>=0.1.0-rc.8')).toBeUndefined()
  })

  it('accepts a v prefix and surrounding whitespace in the declared minimum', () => {
    expect(meetsMinimumDsh('0.1.1-rc.2', '>= v0.1.0-rc.8')).toBe(true)
  })
})

describe('dshRequirementOf', () => {
  it('reads dsh.engines.dsh first', () => {
    expect(dshRequirementOf({ dsh: { engines: { dsh: '>=0.1.0-rc.8' } } })).toBe('>=0.1.0-rc.8')
  })

  it('falls back to the top-level engines.dsh', () => {
    expect(dshRequirementOf({ engines: { dsh: '>=0.1.0-rc.8' } })).toBe('>=0.1.0-rc.8')
    expect(dshRequirementOf({ dsh: { engines: { dsh: '>=0.1.1-rc.1' } }, engines: { dsh: '>=0.1.0-rc.8' } }))
      .toBe('>=0.1.1-rc.1')
  })

  it('ignores missing or non-string metadata', () => {
    expect(dshRequirementOf({})).toBeUndefined()
    expect(dshRequirementOf({ dsh: { engines: 7 } })).toBeUndefined()
    expect(dshRequirementOf({ engines: { dsh: 7 } })).toBeUndefined()
    expect(dshRequirementOf({ dsh: 'not-an-object', engines: null })).toBeUndefined()
    expect(dshRequirementOf({ dsh: { engines: { dsh: '   ' } } })).toBeUndefined()
  })
})

describe('displayMinimumVersion', () => {
  it('strips the >= operator and v prefix so UI copy stays unambiguous', () => {
    expect(displayMinimumVersion('>=0.1.1-rc.1')).toBe('0.1.1-rc.1')
    expect(displayMinimumVersion('>= v0.1.0-rc.8')).toBe('0.1.0-rc.8')
  })

  it('renders unsupported forms unchanged', () => {
    expect(displayMinimumVersion('^0.1.0-rc.8')).toBe('^0.1.0-rc.8')
  })
})
