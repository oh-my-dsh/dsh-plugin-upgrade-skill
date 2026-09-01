/**
 * Patch-list parsing and composition (DSH loader semantics).
 */
import { describe, expect, it } from 'vitest'
import { applyPatches, composeRows, duplicateIds, findSettingsRow, parsePatchList, rowNames, validatePatchEntries } from '../src/core/patch.ts'
import { createYamlEngine } from '../src/core/yaml.ts'

const engine = createYamlEngine()

const BASE: Record<string, unknown>[] = [
  { id: 'timer', name: '@deepseek-ai/cordis-plugin-timer' },
  { id: 'tools', name: '@deepseek-ai/dsh-tools', config: { mode: 'native' } },
  { id: 'groups', name: '@deepseek-ai/cordis-plugin-group', group: 'ui', config: [] },
]

describe('parsePatchList', () => {
  it('parses a valid patch list', () => {
    const result = parsePatchList('- id: timer\n  disabled: true\n- insert:\n    - id: extra\n      name: x\n', engine, 'profile patch')
    expect(result.error).toBeUndefined()
    expect(result.entries.length).toBe(2)
    expect(result.entries[0]?.disabled).toBe(true)
  })

  it('parses !!js expression scalars as unevaluated nodes', () => {
    const result = parsePatchList('- id: tools\n  config:\n    mode: !!js process.env.DSH_TOOLS_MODE\n', engine, 'p')
    expect(result.error).toBeUndefined()
    const config = result.entries[0]?.config as Record<string, unknown>
    expect(config.mode).toEqual({ __jsExpr: 'process.env.DSH_TOOLS_MODE' })
  })

  it('rejects non-array documents and non-mapping entries', () => {
    expect(parsePatchList('a: b\n', engine, 'p').error).toContain('top-level')
    expect(parsePatchList('- just-a-string\n', engine, 'p').error).toContain('mapping')
    expect(parsePatchList('- !!seq [1]\n', engine, 'p').error).toContain('mapping')
  })

  it('warns on structurally no-op entries', () => {
    const result = parsePatchList('- {}\n- id: name\n  name: 5\n- insert: not-array\n', engine, 'p')
    expect(result.error).toBeUndefined()
    expect(result.warnings.length).toBeGreaterThanOrEqual(3)
  })
})

describe('validatePatchEntries', () => {
  it('flags non-string identifiers and bad insert members', () => {
    const warnings = validatePatchEntries([{ id: 5 as never }, { insert: [null as never] }])
    expect(warnings.join()).toContain('id must be a string')
    expect(warnings.join()).toContain('insert member')
  })
})

describe('applyPatches', () => {
  it('overrides a row by id without mutating the base', () => {
    const result = applyPatches(BASE as never, [{ id: 'timer', disabled: true }])
    expect((result.find((r) => r.id === 'timer') as { disabled?: boolean }).disabled).toBe(true)
    expect((BASE.find((r) => r.id === 'timer') as { disabled?: boolean }).disabled).toBeUndefined()
  })

  it('inserts bare rows into the root list', () => {
    const result = applyPatches(BASE as never, [{ insert: [{ id: 'one', name: 'pkg-one' }] }])
    expect(result.map((r) => r.id)).toContain('one')
  })

  it('inserts into a named group only when the target is a group', () => {
    const grouped = applyPatches(BASE as never, [{ id: 'groups', insert: [{ id: 'child', name: 'c' }] }])
    const group = grouped.find((r) => r.id === 'groups') as { config?: unknown[] }
    expect(group.config).toEqual([{ id: 'child', name: 'c' }])
    const viaNonGroup = applyPatches(BASE as never, [{ id: 'timer', insert: [{ id: 'x' }] }])
    expect(viaNonGroup.find((r) => r.id === 'x')).toBeUndefined()
  })

  it('warns for unknown targets and name mismatches, keeping later patches working', () => {
    const warnings: string[] = []
    const result = applyPatches(
      BASE as never,
      [
        { id: 'nope', disabled: true },
        { id: 'timer', name: '@other/not-the-row', disabled: true },
        { id: 'timer', disabled: true },
      ],
      (message) => warnings.push(message),
    )
    expect(warnings.some((w) => w.includes('patch insert: entry "nope" not found') || w.includes('patch: entry "nope" not found'))).toBe(true)
    expect(warnings.some((w) => w.includes('name mismatch'))).toBe(true)
    expect((result.find((r) => r.id === 'timer') as { disabled?: boolean }).disabled).toBe(true)
  })

  it('lets a later patch target a row an earlier patch inserted', () => {
    const result = applyPatches(BASE as never, [
      { insert: [{ id: 'fresh', name: 'x' }] },
      { id: 'fresh', disabled: true },
    ])
    expect((result.find((r) => r.id === 'fresh') as { disabled?: boolean }).disabled).toBe(true)
  })
})

describe('composeRows', () => {
  it('applies layers in order, later wins', () => {
    const rows = composeRows([
      [{ insert: [{ id: 'a', name: 'pkg', config: { v: 1 } }] }],
      [{ id: 'a', config: { v: 2 } }],
    ])
    expect((rows.find((r) => r.id === 'a')?.config as { v: number }).v).toBe(2)
  })
})

describe('row analysis', () => {
  it('finds duplicate ids including nested groups', () => {
    const rows = composeRows([[{ insert: [{ id: 'dup' }, { id: 'group', group: 'ui', config: [{ id: 'dup', name: 'nested' }] }] }]])
    const ds = duplicateIds(rows)
    expect(ds.length).toBe(1)
    expect(ds[0]?.id).toBe('dup')
    expect(ds[0]?.count).toBe(2)
  })

  it('collects row names excluding disabled rows', () => {
    const rows = composeRows([[{ insert: [{ id: 'a', name: 'pkg-a' }, { id: 'b', name: 'pkg-b', disabled: true }] }]])
    const names = rowNames(rows)
    expect(names.map((n) => n.name)).toEqual(['pkg-a'])
  })

  it('finds the settings row and reports absolute paths', () => {
    const rows = composeRows([[{ insert: [{ id: 'settings', config: { path: '/old/home/settings.yaml' } }] }]])
    const found = findSettingsRow(rows)
    expect(found?.absolute).toBe(true)
    expect(found?.path).toBe('/old/home/settings.yaml')
  })
})