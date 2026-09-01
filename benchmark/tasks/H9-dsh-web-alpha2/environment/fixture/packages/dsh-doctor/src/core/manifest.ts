/**
 * Profile manifest reading and validation. This layer only reads and
 * validates; mutation is expressed by PlanActions and executed elsewhere.
 */
import { join } from 'node:path/posix'
import type { FsLike } from './fs.ts'
import type { ManifestFacts } from './types.ts'

export class ManifestError extends Error {
  readonly path: string
  constructor(message: string, path: string) {
    super(message)
    this.name = 'ManifestError'
    this.path = path
  }
}

/** Standard profile file names inside a profile directory. */
export const PROFILE_PATCH_FILENAME = 'cordis.patch.yml'
export const PROFILE_ROOT_FILENAME = 'cordis.yml'
export const PROFILE_WORKSPACE_FILENAME = 'pnpm-workspace.yaml'
export const PROFILE_LOCKFILE_FILENAME = 'pnpm-lock.yaml'
export const PROFILE_SETTINGS_FILENAME = 'settings.yaml'

/** Parse and validate a profile manifest text. */
export function parseProfileManifest(text: string, path: string): { facts: ManifestFacts; error?: string } {
  let parsed: unknown
  try {
    parsed = JSON.parse(text)
  } catch (error) {
    return { facts: emptyFacts(), error: 'profile manifest ' + path + ' is not valid JSON: ' + String(error) }
  }
  if (parsed === null || typeof parsed !== 'object' || Array.isArray(parsed)) {
    return { facts: emptyFacts(), error: 'profile manifest ' + path + ' must hold a JSON object' }
  }
  const raw = parsed as Record<string, unknown>
  const dshSection = isObject(raw.dsh) ? (raw.dsh as Record<string, unknown>) : undefined
  const profileSection = dshSection !== undefined && isObject(dshSection.profile) ? (dshSection.profile as Record<string, unknown>) : undefined
  let bundles: string[] = []
  if (profileSection !== undefined && profileSection.bundles !== undefined) {
    if (!Array.isArray(profileSection.bundles) || profileSection.bundles.some((item) => typeof item !== 'string')) {
      return { facts: emptyFacts(), error: 'profile manifest ' + path + ': dsh.profile.bundles must be an array of strings' }
    }
    bundles = [...(profileSection.bundles as string[])]
  }
  let dependencies: Record<string, string> = {}
  if (raw.dependencies !== undefined) {
    if (!isObject(raw.dependencies)) {
      return { facts: emptyFacts(), error: 'profile manifest ' + path + ': dependencies must be an object' }
    }
    const rawDeps = raw.dependencies as Record<string, unknown>
    for (const key of Object.keys(rawDeps)) {
      if (typeof rawDeps[key] !== 'string') {
        return { facts: emptyFacts(), error: 'profile manifest ' + path + ': dependency ' + key + ' must be a string specifier' }
      }
    }
    dependencies = Object.fromEntries(Object.entries(rawDeps).map(([key, value]) => [key, value as string]))
  }
  const facts: ManifestFacts = {
    raw,
    private: raw.private === true ? true : undefined,
    bundles,
    hasDshProfile: profileSection !== undefined,
    dependencies,
  }
  return { facts }
}

function emptyFacts(): ManifestFacts {
  return { raw: {}, bundles: [], hasDshProfile: false, dependencies: {} }
}

function isObject(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value)
}

/** Read and parse the manifest of one profile directory. */
export async function readProfileManifest(fs: FsLike, dir: string): Promise<{ facts: ManifestFacts; text: string; error?: string }> {
  const path = join(dir, 'package.json')
  let text: string
  try {
    text = await fs.readText(path)
  } catch (error) {
    const code = (error as { code?: string }).code
    if (code === 'ENOENT') return { facts: emptyFacts(), text: '', error: 'profile manifest missing at ' + path }
    throw error
  }
  const parsed = parseProfileManifest(text, path)
  return { facts: parsed.facts, text, error: parsed.error }
}

/** Serialize a manifest back in the DSH-writer format (2-space + newline). */
export function writeProfileManifestJson(manifest: Record<string, unknown>): string {
  return JSON.stringify(manifest, undefined, 2) + '\n'
}

/**
 * Apply structured edits to a manifest JSON text without touching other
 * fields. Paths are dotted (dsh.profile.bundles). Returns the new text and
 * whether anything changed.
 */
export function editManifestJson(text: string, edits: { set?: Record<string, unknown>; remove?: string[] }): { text: string; changed: boolean } {
  let parsed: unknown
  try {
    parsed = JSON.parse(text)
  } catch (error) {
    throw new ManifestError('cannot edit unparsable manifest: ' + String(error), '<manifest>')
  }
  if (typeof parsed !== 'object' || parsed === null || Array.isArray(parsed)) {
    throw new ManifestError('manifest is not a JSON object', '<manifest>')
  }
  const root = parsed as Record<string, unknown>
  let changed = false
  for (const key of Object.keys(edits.set ?? {})) {
    const segments = key.split('.')
    const value = (edits.set ?? {})[key]
    const target = resolvePathIn(root, segments, true)
    if (target === undefined) throw new ManifestError('cannot resolve edit path ' + key, '<manifest>')
    if (JSON.stringify(target[segments[segments.length - 1]]) !== JSON.stringify(value)) {
      target[segments[segments.length - 1]] = value
      changed = true
    }
  }
  for (const key of edits.remove ?? []) {
    const segments = key.split('.')
    const target = resolvePathIn(root, segments, false)
    if (target === undefined) continue
    if (segments[segments.length - 1] in target) {
      delete target[segments[segments.length - 1]]
      changed = true
    }
  }
  return { text: changed ? writeProfileManifestJson(root) : text, changed }
}

function resolvePathIn(root: Record<string, unknown>, segments: string[], create: boolean): Record<string, unknown> | undefined {
  let current = root
  const last = segments[segments.length - 1]
  for (let index = 0; index < segments.length - 1; index += 1) {
    const segment = segments[index]
    let next = current[segment]
    if (typeof next !== 'object' || next === null || Array.isArray(next)) {
      if (!create) return undefined
      next = {}
      current[segment] = next
    }
    current = next as Record<string, unknown>
  }
  if (last === '') return undefined
  return current
}

