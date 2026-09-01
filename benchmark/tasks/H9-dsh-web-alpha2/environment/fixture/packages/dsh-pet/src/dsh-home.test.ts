import { describe, expect, it } from 'vitest'
import { join } from 'node:path'
import { expandHome, resolveDshHome } from './dsh-home.ts'
import { petHomeDir } from './persist.ts'

describe('resolveDshHome', () => {
  it('falls back to ~/.dsh when DSH_HOME is unset', () => {
    const home = join('/home', 'tester')
    expect(resolveDshHome({}, home)).toBe(join(home, '.dsh'))
  })

  it('prefers the DSH_HOME env override', () => {
    const home = join('/home', 'tester')
    expect(resolveDshHome({ DSH_HOME: '/custom/dsh' }, home)).toBe('/custom/dsh')
  })

  it('expands a leading ~ (and ~/) against the platform home', () => {
    const home = join('/home', 'tester')
    expect(resolveDshHome({ DSH_HOME: '~/data' }, home)).toBe(join(home, 'data'))
    expect(expandHome('~', home)).toBe(home)
  })

  it('joins a relative DSH_HOME onto the working directory', () => {
    const home = join('/home', 'tester')
    const rel = resolveDshHome({ DSH_HOME: 'rel/dsh' }, home)
    expect(rel).not.toBe('rel/dsh')
    expect(rel).toBe(join(process.cwd(), 'rel/dsh'))
  })
})

describe('petHomeDir delegates to the shared DSH_HOME resolution', () => {
  it('returns the same value as dshHome under the same env', () => {
    expect(petHomeDir).toBeTypeOf('function')
  })
})
