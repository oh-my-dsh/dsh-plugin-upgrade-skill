/**
 * Patch-list parsing and composition for the DSH entry-list dialect.
 *
 * The patch algorithm re-implements the documented loader semantics: an
 * entry list is patched in place by id-targeted overrides; `insert` entries
 * append to the root list or into a named group; a patch that matches no
 * target or names a different row warns and is skipped. The base list is
 * never mutated.
 */
import type { EntryRow, PatchEntry, PatchParseResult } from './types.ts'
import type { YamlEngine } from './yaml.ts'
import { parseEntryList, YamlEngineError } from './yaml.ts'

/** Parse a patch-list document (top-level YAML array of patch entries). */
export function parsePatchList(text: string, engine: YamlEngine, label: string): PatchParseResult {
  let entries: unknown[]
  try {
    entries = parseEntryList(text, engine, label)
  } catch (error) {
    return { entries: [], error: (error as YamlEngineError).message, warnings: [] }
  }
  const warnings: string[] = []
  const patches: PatchEntry[] = []
  for (let index = 0; index < entries.length; index += 1) {
    const entry = entries[index]
    if (typeof entry !== 'object' || entry === null || Array.isArray(entry)) {
      return {
        entries: [],
        error: label + ' entry ' + (index + 1) + ' must be a mapping (a loader patch entry)',
        warnings,
      }
    }
    patches.push(entry as PatchEntry)
  }
  const structural = validatePatchEntries(patches)
  return { entries: patches, warnings: [...warnings, ...structural] }
}

/**
 * Structural validation of patch entries (no composition context needed).
 * Returns non-fatal warnings: no-op entries, bad insert members, non-string
 * identifiers.
 */
export function validatePatchEntries(entries: PatchEntry[], label = 'patch list'): string[] {
  const warnings: string[] = []
  for (let index = 0; index < entries.length; index += 1) {
    const entry = entries[index]
    const where = label + ' entry ' + (index + 1)
    const hasId = typeof entry.id === 'string'
    const hasInsert = entry.insert !== undefined
    const hasOverride = !hasInsert && hasId && Object.keys(entry).some((key) => key !== 'id' && key !== 'name' && key !== 'insert')
    if (!hasId && !hasInsert && !hasOverride) warnings.push(where + ' is a no-op (no id, no insert, no overrides)')
    if (entry.id !== undefined && typeof entry.id !== 'string') warnings.push(where + ': id must be a string')
    if (entry.name !== undefined && typeof entry.name !== 'string') warnings.push(where + ': name must be a string')
    if (hasInsert) {
      if (!Array.isArray(entry.insert)) {
        warnings.push(where + ': insert must be an array of entry rows')
        continue
      }
      for (let inner = 0; inner < entry.insert.length; inner += 1) {
        const row = entry.insert[inner]
        if (typeof row !== 'object' || row === null || Array.isArray(row)) {
          warnings.push(where + ': insert member ' + (inner + 1) + ' must be a mapping')
        }
      }
    }
  }
  return warnings
}

/**
 * Apply patch lists to an entry list. The input is never mutated; the result
 * is always detached from it. Warnings mirror the loader wording for
 * reportability (patch insert: entry "x" not found; patch: name mismatch
 * for "x" ...).
 */
export function applyPatches(base: EntryRow[], patches: PatchEntry[], warn: (message: string) => void = () => {}): EntryRow[] {
  const data = clone(base)
  if (patches.length === 0) return data
  const entryMap = new Map<string, EntryRow>()
  const buildMap = (entries: EntryRow[]): void => {
    for (const entry of entries) {
      if (typeof entry.id === 'string') entryMap.set(entry.id, entry)
      if (entry.group !== undefined && Array.isArray(entry.config)) {
        buildMap(entry.config as EntryRow[])
      }
    }
  }
  buildMap(data)
  for (const patch of patches) {
    const insert = Array.isArray(patch.insert) ? patch.insert : undefined
    const id = patch.id
    if (insert !== undefined) {
      if (typeof id === 'string') {
        const target = entryMap.get(id)
        if (target === undefined) {
          warn('patch insert: entry ' + quote(id) + ' not found')
          continue
        }
        if (target.group === undefined) {
          warn('patch insert: entry ' + quote(id) + ' is not a group')
          continue
        }
        if (!Array.isArray(target.config)) target.config = []
        const groupConfig = target.config as EntryRow[]
        groupConfig.push(...insert)
      } else {
        data.push(...insert)
      }
      buildMap(insert)
      continue
    }
    if (typeof id !== 'string') {
      warn('patch: id is required for non-insert patches')
      continue
    }
    const target = entryMap.get(id)
    if (target === undefined) {
      warn('patch: entry ' + quote(id) + ' not found')
      continue
    }
    if (patch.name !== undefined && patch.name !== target.name) {
      warn('patch: name mismatch for ' + quote(id) + ' (expected ' + quote(String(target.name)) + ', got ' + quote(String(patch.name)) + '), skipping')
      continue
    }
    for (const key of Object.keys(patch)) {
      if (key === 'id' || key === 'insert' || key === 'name') continue
      target[key] = patch[key]
    }
  }
  return data
}

function quote(value: string): string {
  return JSON.stringify(value)
}

function clone<T>(value: T): T {
  return JSON.parse(JSON.stringify(value)) as T
}

/** Apply ordered layers over an empty root, in order (later wins). */
export function composeRows(layers: PatchEntry[][], warn: (message: string) => void = () => {}): EntryRow[] {
  let rows: EntryRow[] = []
  for (const layer of layers) {
    rows = applyPatches(rows, layer, warn)
  }
  return rows
}


/**
 * Collect every row id in a composed tree, including nested group children.
 */
export function collectIds(rows: EntryRow[]): string[] {
  const ids: string[] = []
  const walk = (entries: EntryRow[]): void => {
    for (const entry of entries) {
      if (typeof entry.id === 'string') ids.push(entry.id)
      if (entry.group !== undefined && Array.isArray(entry.config)) {
        walk(entry.config as EntryRow[])
      }
    }
  }
  walk(rows)
  return ids
}

/** Duplicate row ids in a composed tree: id -> occurrence count. */
export function duplicateIds(rows: EntryRow[]): { id: string; count: number }[] {
  const counts = new Map<string, number>()
  for (const id of collectIds(rows)) counts.set(id, (counts.get(id) ?? 0) + 1)
  const result: { id: string; count: number }[] = []
  for (const [id, count] of counts) {
    if (count > 1) result.push({ id, count })
  }
  return result.sort((a, b) => (a.id < b.id ? -1 : a.id > b.id ? 1 : 0))
}

/** Every plugin name referenced by the rows (excluding disabled rows). */
export function rowNames(rows: EntryRow[]): { name: string; count: number }[] {
  const counts = new Map<string, number>()
  const walk = (entries: EntryRow[]): void => {
    for (const entry of entries) {
      if (typeof entry.name === 'string' && entry.disabled !== true) {
        counts.set(entry.name, (counts.get(entry.name) ?? 0) + 1)
      }
      if (entry.group !== undefined && Array.isArray(entry.config)) {
        walk(entry.config as EntryRow[])
      }
    }
  }
  walk(rows)
  const result: { name: string; count: number }[] = []
  for (const [name, count] of counts) result.push({ name, count })
  return result.sort((a, b) => (a.name < b.name ? -1 : a.name > b.name ? 1 : 0))
}

/** Find the settings row (id 'settings') and report its configured path. */
export function findSettingsRow(rows: EntryRow[]): { path: string; absolute: boolean } | undefined {
  const walk = (entries: EntryRow[]): EntryRow | undefined => {
    for (const entry of entries) {
      if (entry.id === 'settings' && entry.config !== undefined && typeof entry.config === 'object' && !Array.isArray(entry.config)) {
        return entry
      }
      if (entry.group !== undefined && Array.isArray(entry.config)) {
        const nested = walk(entry.config as EntryRow[])
        if (nested !== undefined) return nested
      }
    }
    return undefined
  }
  const row = walk(rows)
  if (row === undefined || row.config === undefined || typeof row.config !== 'object' || Array.isArray(row.config)) return undefined
  const config = row.config as Record<string, unknown>
  if (typeof config.path !== 'string') return undefined
  const value = config.path
  return { path: value, absolute: value.startsWith('/') || /^[A-Za-z]:\//.test(value) }
}

