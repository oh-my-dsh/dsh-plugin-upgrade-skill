/**
 * Legacy bridge tests (issue #506): one-shot migration of the retired
 * dsh-skin managed-section state into the v2 selection store.
 */

import { mkdtempSync, mkdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'

import { afterEach, beforeEach, describe, expect, it } from 'vitest'

import {
  MANAGED_END,
  MANAGED_START,
  migrateLegacySelection,
  readLegacyActiveId,
  stripLegacySkinState,
  stripManaged,
} from '../src/legacy-bridge.ts'
import { readActiveSelection } from '../src/active-state.ts'

const KNOWN = ['harbor', 'xp', 'matrix']

const INSERT_PATCH = [
  '- insert:',
  '    - id: ui-skin-center',
  "      name: '@linxin666/dsh-client-ui-skin-center'",
  '',
  MANAGED_START,
  '- id: ui-skin-harbor',
  '  disabled: true',
  '- id: ui-skin-matrix',
  '  disabled: true',
  '- insert:',
  '    - id: ui-skin-xp',
  "      name: '@linxin666/dsh-client-ui-skin-xp'",
  MANAGED_END,
  '',
].join('\n')

const WIRED_PATCH = [
  MANAGED_START,
  '- id: ui-skin-xp',
  '  disabled: true',
  '- id: ui-skin-matrix',
  '  disabled: true',
  MANAGED_END,
  '',
].join('\n')

const STOCK_PATCH = [
  MANAGED_START,
  '- id: ui-skin-harbor',
  '  disabled: true',
  '- id: ui-skin-xp',
  '  disabled: true',
  '- id: ui-skin-matrix',
  '  disabled: true',
  MANAGED_END,
  '',
].join('\n')

let root: string
let statePath: string
let patchPath: string

beforeEach(() => {
  root = mkdtempSync(join(tmpdir(), 'legacy-bridge-'))
  statePath = join(root, 'skin-center-active.json')
  patchPath = join(root, 'cordis.patch.yml')
})

afterEach(() => {
  rmSync(root, { recursive: true, force: true })
})

describe('readLegacyActiveId', () => {
  it('reads the insert-row skin', () => {
    expect(readLegacyActiveId(INSERT_PATCH, KNOWN)).toBe('xp')
  })

  it('reads the bundle-wired skin as the known id not disabled', () => {
    expect(readLegacyActiveId(WIRED_PATCH, KNOWN)).toBe('harbor')
  })

  it('reads the bundle-wired skin on CRLF line endings too', () => {
    expect(readLegacyActiveId(WIRED_PATCH.replace(/\n/g, '\r\n'), KNOWN)).toBe('harbor')
  })

  it('returns null for the stock look and for no managed state', () => {
    expect(readLegacyActiveId(STOCK_PATCH, KNOWN)).toBeNull()
    expect(readLegacyActiveId('- insert: []\n', KNOWN)).toBeNull()
  })

  it('returns null when the non-disabled set is ambiguous', () => {
    const ambiguous = [MANAGED_START, '- id: ui-skin-xp', '  disabled: true', MANAGED_END, ''].join('\n')
    expect(readLegacyActiveId(ambiguous, KNOWN)).toBeNull()
  })
})

describe('stripManaged / stripLegacySkinState', () => {
  it('removes the managed section entirely', () => {
    const out = stripManaged(INSERT_PATCH)
    expect(out).not.toContain('ui-skin-xp')
    expect(out).toContain('ui-skin-center')
  })

  it('throws on an unterminated managed section', () => {
    expect(() => stripManaged(MANAGED_START + '\n- id: ui-skin-xp\n')).toThrow(/unterminated/)
  })

  it('strips legacy insert rows outside the section too', () => {
    const withStraggler = '- insert:\n    - id: ui-skin-old\n      name: \'@linxin666/dsh-client-ui-skin-old\'\n' + INSERT_PATCH
    const out = stripLegacySkinState(withStraggler)
    expect(out).not.toContain('ui-skin-old')
    expect(out).toContain('ui-skin-center')
  })

  it('removes every managed section, not just the first (issue #676)', () => {
    const doubleManaged = INSERT_PATCH + WIRED_PATCH
    const out = stripLegacySkinState(doubleManaged)
    expect(out).not.toContain(MANAGED_START)
    expect(out).not.toContain(MANAGED_END)
    expect(out).not.toContain('ui-skin-xp')
    expect(out).not.toContain('ui-skin-matrix')
    expect(out).toContain('ui-skin-center')
  })

  it('drops a stray empty - insert: [] row (issue #676)', () => {
    const withEmptyInsert = '- insert: []\n- insert:\n    - id: ui-skin-center\n      name: \'@linxin666/dsh-client-ui-skin-center\'\n'
    const out = stripLegacySkinState(withEmptyInsert)
    expect(out).not.toContain('insert: []')
    expect(out).toContain('ui-skin-center')
  })
})

describe('migrateLegacySelection', () => {
  it('migrates the active id and cleans the patch', () => {
    writeFileSync(patchPath, INSERT_PATCH)
    const result = migrateLegacySelection({ knownIds: KNOWN, activeStatePath: statePath, patchPath })
    expect(result.migrated).toBe('xp')
    expect(result.patchCleaned).toBe(true)
    expect(readActiveSelection(statePath)).toBe('xp')
    expect(readFileSync(patchPath, 'utf8')).not.toContain('dsh-skin managed')
  })

  it('migrates the active id from a CRLF patch', () => {
    writeFileSync(patchPath, WIRED_PATCH.replace(/\n/g, '\r\n'))
    const result = migrateLegacySelection({ knownIds: KNOWN, activeStatePath: statePath, patchPath })
    expect(result.migrated).toBe('harbor')
    expect(result.patchCleaned).toBe(true)
    expect(readActiveSelection(statePath)).toBe('harbor')
  })

  it('is a no-op on the second run', () => {
    writeFileSync(patchPath, INSERT_PATCH)
    migrateLegacySelection({ knownIds: KNOWN, activeStatePath: statePath, patchPath })
    const second = migrateLegacySelection({ knownIds: KNOWN, activeStatePath: statePath, patchPath })
    expect(second.migrated).toBeNull()
    expect(second.patchCleaned).toBe(false)
  })

  it('migrates once even when a second managed section lingers (issue #676)', () => {
    writeFileSync(patchPath, INSERT_PATCH + WIRED_PATCH)
    const first = migrateLegacySelection({ knownIds: KNOWN, activeStatePath: statePath, patchPath })
    expect(first.migrated).toBe('xp')
    expect(first.patchCleaned).toBe(true)
    const rewritten = readFileSync(patchPath, 'utf8')
    expect(rewritten).not.toContain(MANAGED_START)
    expect(rewritten).not.toContain(MANAGED_END)
    expect(rewritten).not.toContain('ui-skin-xp')
    expect(rewritten).toContain('ui-skin-center')
    const second = migrateLegacySelection({ knownIds: KNOWN, activeStatePath: statePath, patchPath })
    expect(second.migrated).toBeNull()
    expect(second.patchCleaned).toBe(false)
    expect(readFileSync(patchPath, 'utf8')).toBe(rewritten)
  })

  it('does not clobber an existing v2 selection but still cleans', () => {
    mkdirSync(join(statePath, '..'), { recursive: true })
    writeFileSync(statePath, JSON.stringify({ active: 'matrix' }))
    writeFileSync(patchPath, INSERT_PATCH)
    const result = migrateLegacySelection({ knownIds: KNOWN, activeStatePath: statePath, patchPath })
    expect(result.migrated).toBeNull()
    expect(result.patchCleaned).toBe(true)
    expect(readActiveSelection(statePath)).toBe('matrix')
  })

  it('reports nothing-to-migrate without legacy state', () => {
    writeFileSync(patchPath, '- insert: []\n')
    const result = migrateLegacySelection({ knownIds: KNOWN, activeStatePath: statePath, patchPath })
    expect(result.migrated).toBeNull()
    expect(result.patchCleaned).toBe(false)
    expect(result.notes.join(' ')).toContain('nothing to migrate')
  })

  it('fails closed without a readable patch', () => {
    const result = migrateLegacySelection({
      knownIds: KNOWN,
      activeStatePath: statePath,
      patchPath: join(root, 'nope.yml'),
    })
    expect(result.migrated).toBeNull()
    expect(result.notes.join(' ')).toContain('nothing to migrate')
  })

  it('a managed-only patch normalizes to [] instead of an empty file', () => {
    writeFileSync(patchPath, STOCK_PATCH)
    const result = migrateLegacySelection({ knownIds: KNOWN, activeStatePath: statePath, patchPath })
    expect(result.patchCleaned).toBe(true)
    const after = readFileSync(patchPath, 'utf8')
    expect(after.trim()).toBe('[]')
  })

  it('a comment-only patch after cleanup normalizes to []', () => {
    writeFileSync(patchPath, '# User patch layer.\n\n' + STOCK_PATCH)
    migrateLegacySelection({ knownIds: KNOWN, activeStatePath: statePath, patchPath })
    expect(readFileSync(patchPath, 'utf8')).toBe('[]\n')
  })

  it('stock-look legacy state migrates no id and still cleans', () => {
    writeFileSync(patchPath, STOCK_PATCH)
    const result = migrateLegacySelection({ knownIds: KNOWN, activeStatePath: statePath, patchPath })
    expect(result.migrated).toBeNull()
    expect(result.patchCleaned).toBe(true)
    expect(readActiveSelection(statePath)).toBeNull()
  })
})


describe('migrateLegacySelection home/profile patch probing (issue #788)', () => {
  let home: string
  let savedHome: string | undefined

  beforeEach(() => {
    home = mkdtempSync(join(tmpdir(), 'legacy-bridge-home-'))
    savedHome = process.env.DSH_HOME
    process.env.DSH_HOME = home
  })

  afterEach(() => {
    if (savedHome === undefined) delete process.env.DSH_HOME
    else process.env.DSH_HOME = savedHome
    rmSync(home, { recursive: true, force: true })
  })

  const homePatch = () => join(home, 'cordis.patch.yml')
  const profilePatch = () => join(home, 'profiles', 'web', 'cordis.patch.yml')

  it('migrates legacy state from the home patch when the profile patch does not exist', () => {
    writeFileSync(homePatch(), INSERT_PATCH)
    const result = migrateLegacySelection({ knownIds: KNOWN, activeStatePath: statePath })
    expect(result.migrated).toBe('xp')
    expect(result.patchCleaned).toBe(true)
    expect(result.failed).toBe(false)
    expect(readActiveSelection(statePath)).toBe('xp')
    expect(readFileSync(homePatch(), 'utf8')).not.toContain('dsh-skin managed')
  })

  it('still migrates from the profile patch when the home patch is clean', () => {
    writeFileSync(homePatch(), '- insert: []\n')
    mkdirSync(join(home, 'profiles', 'web'), { recursive: true })
    writeFileSync(profilePatch(), WIRED_PATCH)
    const result = migrateLegacySelection({ knownIds: KNOWN, activeStatePath: statePath })
    expect(result.migrated).toBe('harbor')
    expect(result.patchCleaned).toBe(true)
    expect(readFileSync(profilePatch(), 'utf8')).not.toContain(MANAGED_START)
    expect(readFileSync(homePatch(), 'utf8')).toBe('- insert: []\n')
  })

  it('migrates once and cleans both files when both carry legacy state', () => {
    writeFileSync(homePatch(), INSERT_PATCH)
    mkdirSync(join(home, 'profiles', 'web'), { recursive: true })
    writeFileSync(profilePatch(), WIRED_PATCH)
    const result = migrateLegacySelection({ knownIds: KNOWN, activeStatePath: statePath })
    expect(result.migrated).toBe('xp')
    expect(result.patchCleaned).toBe(true)
    expect(readActiveSelection(statePath)).toBe('xp')
    expect(readFileSync(homePatch(), 'utf8')).not.toContain(MANAGED_START)
    expect(readFileSync(profilePatch(), 'utf8')).not.toContain(MANAGED_START)
  })

  it('reports nothing to migrate when neither patch carries legacy state', () => {
    writeFileSync(homePatch(), '- insert: []\n')
    mkdirSync(join(home, 'profiles', 'web'), { recursive: true })
    writeFileSync(profilePatch(), '- insert: []\n')
    const result = migrateLegacySelection({ knownIds: KNOWN, activeStatePath: statePath })
    expect(result.migrated).toBeNull()
    expect(result.patchCleaned).toBe(false)
    expect(result.failed).toBe(false)
    expect(result.notes.join(' ')).toContain('nothing to migrate')
  })

  it('fails closed and leaves the home patch untouched on an unterminated section', () => {
    writeFileSync(homePatch(), MANAGED_START + '\n- id: ui-skin-xp\n')
    const result = migrateLegacySelection({ knownIds: KNOWN, activeStatePath: statePath })
    expect(result.failed).toBe(true)
    expect(result.migrated).toBeNull()
    expect(result.patchCleaned).toBe(false)
    expect(result.notes.join(' ')).toContain('failed closed')
    expect(readFileSync(homePatch(), 'utf8')).toContain(MANAGED_START)
  })
})
