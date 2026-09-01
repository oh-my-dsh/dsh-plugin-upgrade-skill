import { describe, expect, it } from 'vitest'
import { expandHome, resolveDshHome } from '../host/dsh-home.ts'

describe('expandHome', () => {
  it('expands a leading tilde onto the home directory', () => {
    const expanded = expandHome('~/x')
    expect(expanded).toMatch(/[\\/]x$/)
    expect(expanded.startsWith('~')).toBe(false)
  })

  it('leaves non-tilde paths untouched', () => {
    expect(expandHome('/abs/path')).toBe('/abs/path')
    expect(expandHome('rel/path')).toBe('rel/path')
  })
})

describe('resolveDshHome', () => {
  it('prefers the DSH_HOME environment override', () => {
    expect(resolveDshHome({ DSH_HOME: '/custom/dsh' }, '/home/u')).toBe('/custom/dsh')
    expect(resolveDshHome({ DSH_HOME: '~/custom' }, '/home/u')).toBe('/home/u/custom')
  })

  it('ignores a blank override and falls back to ~/.dsh', () => {
    expect(resolveDshHome({ DSH_HOME: '   ' }, '/home/u')).toBe('/home/u/.dsh')
    expect(resolveDshHome({}, '/home/u')).toBe('/home/u/.dsh')
  })
})
