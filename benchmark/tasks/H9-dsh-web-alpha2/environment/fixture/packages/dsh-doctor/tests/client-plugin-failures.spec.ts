/**
 * Failed-plugin reconciliation tests: manifest rows that never materialize
 * are exposed, materialized and absent systems are ignored, and hostile
 * seams degrade to an empty result.
 */
import { describe, expect, it } from 'vitest'
import { detectFailedPluginIds, type PluginModulesSeam } from '../src/client/plugin-failures.ts'

function modulesWith(ids: string[], present: (id: string) => boolean): PluginModulesSeam {
  return {
    manifest: { plugins: ids.map(id => ({ id })) },
    loadCache: { has: present },
  }
}

describe('detectFailedPluginIds', () => {
  it('reports listed ids that never materialized', () => {
    const modules = modulesWith(['a', 'b', 'c'], id => id === 'a')
    expect(detectFailedPluginIds(modules)).toEqual(['b', 'c'])
  })

  it('returns an empty list when every row materialized', () => {
    const modules = modulesWith(['a', 'b'], () => true)
    expect(detectFailedPluginIds(modules)).toEqual([])
  })

  it('returns an empty list without a module system', () => {
    expect(detectFailedPluginIds(undefined)).toEqual([])
    expect(detectFailedPluginIds(null)).toEqual([])
  })

  it('skips malformed rows and dedupes repeated ids', () => {
    const modules: PluginModulesSeam = {
      manifest: { plugins: [{ id: 'ok' }, { id: 42 }, { id: '' }, { id: 'ok' }, {}] },
      loadCache: { has: id => id === 'ok' },
    }
    expect(detectFailedPluginIds(modules)).toEqual([])
    const failing = modulesWith(['x', 'x'], () => false)
    expect(detectFailedPluginIds(failing)).toEqual(['x'])
  })

  it('treats a throwing registry as missing rather than crashing', () => {
    const modules: PluginModulesSeam = {
      manifest: { plugins: [{ id: 'a' }] },
      loadCache: { has: () => { throw new Error('hostile') } },
    }
    expect(detectFailedPluginIds(modules)).toEqual(['a'])
  })
})
