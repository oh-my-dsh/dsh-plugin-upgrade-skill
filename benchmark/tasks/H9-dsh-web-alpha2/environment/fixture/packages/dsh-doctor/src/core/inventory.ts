/**
 * Profile install inventory: manifest deps against the lockfile importer and
 * the installed node_modules, plus workspace settings parsing.
 */
import { join } from 'node:path/posix'
import type { FsLike } from './fs.ts'
import { classifySpec } from './spec.ts'
import type { DependencySpec, InventoryReport, InventoryRow, ManifestFacts, WorkspaceSettings } from './types.ts'
import type { YamlEngine } from './yaml.ts'
import { PROFILE_LOCKFILE_FILENAME, PROFILE_WORKSPACE_FILENAME } from './manifest.ts'

interface LockedDep {
  specifier: string
  version: string
}

export interface LockfileParse {
  status: 'ok' | 'broken' | 'missing'
  lockfileVersion?: string
  importer?: Map<string, LockedDep>
  error?: string
}

/** Parse the importer dependencies out of a pnpm lockfile (v9 layout). */
export function parseLockfileImporter(text: string, engine: YamlEngine, label = 'lockfile'): LockfileParse {
  let doc: unknown
  try {
    doc = engine.parse(text)
  } catch (error) {
    return { status: 'broken', error: 'failed to parse ' + label + ': ' + String(error) }
  }
  if (typeof doc !== 'object' || doc === null || Array.isArray(doc)) return { status: 'broken', error: label + ' must be a mapping document' }
  const root = doc as Record<string, unknown>
  const version = typeof root.lockfileVersion === 'string' ? root.lockfileVersion : typeof root.lockfileVersion === 'number' ? String(root.lockfileVersion) : undefined
  const importers = root.importers
  if (typeof importers !== 'object' || importers === null) { return { status: 'ok', lockfileVersion: version, importer: new Map() } }
  const dot = (importers as Record<string, unknown>)['.']
  if (typeof dot !== 'object' || dot === null) {
    return { status: 'ok', lockfileVersion: version, importer: new Map() }
  }
  const importer = new Map<string, LockedDep>()
  const sections = ['dependencies', 'devDependencies']
  for (const section of sections) {
    const block = (dot as Record<string, unknown>)[section]
    if (typeof block !== 'object' || block === null) continue
    for (const [name, value] of Object.entries(block as Record<string, unknown>)) {
      if (typeof value !== 'object' || value === null) continue
      const record = value as Record<string, unknown>
      const specifier = typeof record.specifier === 'string' ? record.specifier : typeof record.version === 'string' ? record.version : ''
      const versionOf = typeof record.version === 'string' ? record.version : undefined
      if (specifier !== '' || versionOf !== undefined) {
        importer.set(name, { specifier, version: versionOf ?? specifier })
      }
    }
  }
  return { status: 'ok', lockfileVersion: version, importer }
}

/** Parse profile pnpm-workspace.yaml settings (missing file = unaffected). */
export function parseWorkspaceSettings(text: string | undefined, engine: YamlEngine): WorkspaceSettings | undefined {
  if (text === undefined || text.trim() === '') return undefined
  let doc: unknown
  try {
    doc = engine.parse(text)
  } catch {
    return undefined
  }
  if (typeof doc !== 'object' || doc === null) return undefined
  const root = doc as Record<string, unknown>
  const allowBuilds = typeof root.allowBuilds === 'object' && root.allowBuilds !== null ? Object.keys(root.allowBuilds as Record<string, unknown>) : []
  const minAge = Array.isArray(root.minimumReleaseAgeExclude) ? (root.minimumReleaseAgeExclude as unknown[]).filter((item): item is string => typeof item === 'string') : []
  return {
    nodeLinker: typeof root.nodeLinker === 'string' ? root.nodeLinker : undefined,
    autoInstallPeers: typeof root.autoInstallPeers === 'boolean' ? root.autoInstallPeers : undefined,
    allowBuilds: allowBuilds.sort(),
    minimumReleaseAgeExclude: minAge.sort(),
  }
}

/** Build the dependency/lockfile/install-state inventory for one profile. */
export async function inventoryProfile(fs: FsLike, dir: string, manifest: ManifestFacts, engine: YamlEngine): Promise<InventoryReport> {
  const rows: InventoryRow[] = []
  const lockfilePath = join(dir, PROFILE_LOCKFILE_FILENAME)
  const lockfilePresent = await fs.exists(lockfilePath)
  let parseResult: LockfileParse = { status: 'missing' }
  if (lockfilePresent) parseResult = await readAndParse(engine, fs, lockfilePath)
  const importer = parseResult.status === 'ok' ? parseResult.importer : undefined

  for (const [name, specifier] of Object.entries(manifest.dependencies).sort((a, b) => (a[0] < b[0] ? -1 : a[0] > b[0] ? 1 : 0))) {
    const spec: DependencySpec = classifySpec(specifier)
    const lockedEntry = importer?.get(name)
    const locked = lockedEntry?.version
    let mismatch = false
    if (spec.kind === 'exact' && spec.version !== undefined && (locked === undefined || locked !== spec.version)) {
      mismatch = true
    }
    const installed = await fs.exists(join(dir, 'node_modules', name))
    rows.push({ name, declared: specifier, spec, locked, mismatch, installed })
  }

  let nodeModules: InventoryReport['nodeModules'] = 'missing'
  try {
    const entries = await fs.readdir(join(dir, 'node_modules'))
    nodeModules = entries.length > 0 ? 'present' : 'present'
  } catch (error) {
    const code = (error as { code?: string }).code
    if (code === 'ENOENT') nodeModules = 'missing'
    else nodeModules = 'unreadable'
  }

  let workspace: WorkspaceSettings | undefined
  const workspacePath = join(dir, PROFILE_WORKSPACE_FILENAME)
  if (await fs.exists(workspacePath)) {
    try {
      workspace = parseWorkspaceSettings(await fs.readText(workspacePath), engine)
    } catch {
      workspace = undefined
    }
  }
  return {
    rows,
    lockfile: parseResult.status,
    lockfileVersion: parseResult.lockfileVersion,
    workspace,
    nodeModules,
  }
}

async function readAndParse(engine: YamlEngine, fs: FsLike, file: string): Promise<LockfileParse> {
  let text: string
  try {
    text = await fs.readText(file)
  } catch (error) {
    return { status: 'broken', error: 'failed to read ' + file + ': ' + String(error) }
  }
  return parseLockfileImporter(text, engine, file)
}

