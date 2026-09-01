/**
 * Deterministic diagnosis over parsed profile state.
 *
 * Pure over its inputs: no process spawning, no network, no writes. Callers
 * assemble the inputs (manifest, patch reports, inventory, fallback scan,
 * env scan, toolchain) and receive a sorted Diagnostic list.
 */
import { join } from 'node:path/posix'
import type { FsLike } from './fs.ts'
import { profilesNodeModulesDir } from './paths.ts'
import { isPinned, isLocalSpec } from './spec.ts'
import type { Diagnostic, DependencySpec, EntryRow, InventoryReport, ManifestFacts, PatchParseResult, Severity, ToolchainReport, WorkspaceSettings } from './types.ts'
import { duplicateIds, findSettingsRow, rowNames } from './patch.ts'

/** Order for severity buckets; stable sort by this then code then path. */
const SEVERITY_ORDER: Record<Severity, number> = { critical: 0, error: 1, warn: 2, info: 3 }

export interface ProfileDiagnosisInput {
  home: string
  profile: string
  dir: string
  fs: FsLike
  manifest: ManifestFacts
  manifestText: string
  /** Delegate: whether a bundle package is resolvable from install or profile. */
  bundleResolvable(name: string): boolean
  /** Delegate: whether a resolved bundle declares dsh.bundle.patch. */
  bundleDeclaresPatch(name: string): boolean | undefined
  profilePatch?: PatchParseResult
  homePatch?: PatchParseResult
  /** Composed rows of every parseable patch layer, for row-level checks. */
  rows?: EntryRow[]
  inventory?: InventoryReport
  toolchain?: ToolchainReport
  env: { DSH_HOME?: string }
}

/** Diagnose one profile from pre-fetched state. */
export function diagnoseProfile(input: ProfileDiagnosisInput): Diagnostic[] {
  const diagnostics: Diagnostic[] = []
  const diag = (code: string, severity: Severity, path: string, detail: string, remediation?: string, gate?: Diagnostic['gate'], evidence?: string): void => {
    diagnostics.push({ code, severity, path, detail, remediation, gate, evidence })
  }

  if (!input.manifest.hasDshProfile) {
    diag('D-010', 'warn', 'package.json', 'manifest has no dsh.profile.bundles; the profile boots the default bundle set', 'add dsh.profile.bundles to the manifest')
  }

  for (const bundle of input.manifest.bundles) {
    if (!input.bundleResolvable(bundle)) {
      diag('D-020', 'error', 'package.json', 'profile bundle ' + JSON.stringify(bundle) + ' is not resolvable from the dsh installation or the profile dir', 'remove the bundle row or provision ' + bundle + ' as an exact version', 'dump-default')
      continue
    }
    const declares = input.bundleDeclaresPatch(bundle)
    if (declares === false) {
      diag('D-030', 'error', 'package.json', 'profile bundle ' + JSON.stringify(bundle) + ' declares no dsh.bundle in its package.json', 'remove the bundle row or upgrade the package', 'dump-default')
    }
  }

  const patchReports: { label: string; report: PatchParseResult | undefined; code: string }[] = [
    { label: 'profile patch', report: input.profilePatch, code: 'D-040' },
    { label: 'home patch', report: input.homePatch, code: 'D-050' },
  ]
  for (const item of patchReports) {
    if (item.report?.error !== undefined) {
      diag(item.code, 'critical', join(input.dir, 'cordis.patch.yml'), item.label + ' is unparseable: ' + item.report.error, 'quarantine the broken file and write an empty patch list', 'dump-default')
    }
  }

  if (input.rows !== undefined) {
    for (const named of rowNames(input.rows)) {
      const name = named.name
      const pin = classifyRowName(name)
      if (pin !== undefined && !input.bundleResolvable(name)) {
        diag('D-021', 'warn', 'cordis.patch.yml', 'row plugin ' + JSON.stringify(name) + ' may not resolve (not in the installation closure or profile node_modules)', 'ensure the plugin is an installed dependency')
      }
    }
    for (const dup of duplicateIds(input.rows)) {
      diag('D-230', 'error', 'cordis.patch.yml', 'duplicate entry id ' + JSON.stringify(dup.id) + ' (count ' + dup.count + ') in the composed tree', 'disable the later row by id')
    }
    const settings = findSettingsRow(input.rows)
    if (settings !== undefined && settings.absolute) {
      const insideHome = settings.path.startsWith(input.home + '/')
      if (!insideHome) {
        diag('D-080', 'warn', 'cordis.patch.yml', 'settings row path is absolute and outside the current home: ' + settings.path, 'rewrite the path to a dshHomePath expression')
      }
    }
  }

  if (input.inventory !== undefined) {
    diagnoseInventory(input.inventory, diag)
  }
  if (input.toolchain !== undefined) {
    diagnoseToolchain(input.toolchain, diag)
  }

  return sortDiagnostics(diagnostics)
}

function classifyRowName(name: string): string | undefined {
  if (name.startsWith('@deepseek-ai/')) return name
  if (name.startsWith('@')) return name
  if (name.includes('/')) return name
  return undefined
}

function diagnoseInventory(inventory: InventoryReport, diag: (code: string, severity: Severity, path: string, detail: string, remediation?: string, gate?: Diagnostic['gate']) => void): void {
  for (const row of inventory.rows) {
    const spec: DependencySpec = row.spec
    if (isLocalSpec(spec) && spec.target !== undefined && spec.target.startsWith('/')) {
      // Presence is checked by the caller through the fs; the target path is
      // recorded here as evidence for the layer above.
    }
    if (spec.kind === 'github' || spec.kind === 'git') {
      if (!isPinned(spec)) {
        diag('D-100', 'warn', 'package.json', 'git dependency ' + row.name + ' is not commit-pinned (' + row.declared + '); the lockfile pins the resolved commit but a fresh install resolves the branch again', 'record the lockfile commit and repin the spec')
      }
    }
    if (row.mismatch) {
      diag('D-120', 'error', 'pnpm-lock.yaml', 'lockfile disagrees with pinned spec ' + row.name + ' (declared ' + spec.version + ', locked ' + row.locked + ')', 'regenerate the lockfile with the pinned pnpm')
    }
    if (!row.installed && row.name.startsWith('@linxin666/')) {
      diag('D-130', 'warn', 'node_modules', 'plugin ' + row.name + ' is declared but not installed', 'run a frozen-lockfile install in the profile dir')
    }
  }
  if (inventory.lockfile === 'missing' && inventory.rows.length > 0) {
    diag('D-110', 'warn', 'pnpm-lock.yaml', 'dependencies are declared but no lockfile exists; installs are not frozen', 'generate the lockfile (pnpm install --lockfile-only)')
  }
  if (inventory.lockfile === 'broken') {
    diag('D-115', 'error', 'pnpm-lock.yaml', 'lockfile is unparseable', 'regenerate or restore the lockfile from a snapshot')
  }
  if (inventory.lockfile === 'ok' && inventory.lockfileVersion !== undefined && !/^9\b/.test(inventory.lockfileVersion)) {
    diag('D-214', 'info', 'pnpm-lock.yaml', 'lockfileVersion ' + inventory.lockfileVersion + ' is not v9; the engine targets pnpm v9 layout', 'pin a matching pnpm')
  }
  const ws: WorkspaceSettings | undefined = inventory.workspace
  if (ws !== undefined && ws.nodeLinker !== undefined && ws.nodeLinker !== 'hoisted') {
    diag('D-140', 'warn', 'pnpm-workspace.yaml', 'nodeLinker is ' + ws.nodeLinker + '; DSH profiles use hoisted linking', 'restore the workspace setting')
  }
  if (ws !== undefined && ws.minimumReleaseAgeExclude.length > 0) {
    diag('D-150', 'info', 'pnpm-workspace.yaml', 'minimumReleaseAgeExclude is present; release-age filtering needs registry metadata and can break offline installs', 'strip for offline provision')
  }
  if (inventory.nodeModules === 'unreadable') {
    diag('D-132', 'warn', 'node_modules', 'node_modules is present but unreadable', 'reprovision the profile')
  }
}

function diagnoseToolchain(toolchain: ToolchainReport, diag: (code: string, severity: Severity, path: string, detail: string, remediation?: string) => void): void {
  const minor = parseNodeVersion(toolchain.node)
  if (minor !== undefined && minor < 2219) {
    diag('D-210', 'error', '<toolchain>', 'node ' + toolchain.node + ' is below the 22.19 floor the DSH runtime needs', 'use node 22.19 or newer')
  } else if (minor === undefined) {
    diag('D-210', 'warn', '<toolchain>', 'cannot parse node version ' + toolchain.node, 'report the exact node -v output')
  }
}

function parseNodeVersion(value: string): number | undefined {
  const match = /^(\d+)\.(\d+)\.(\d+)/.exec(value.trim())
  if (match === null) return undefined
  return Number(match[1]) * 100 + Number(match[2])
}

/** Sort diagnostics deterministically: severity, code, path. */
export function sortDiagnostics(diagnostics: Diagnostic[]): Diagnostic[] {
  return [...diagnostics].sort((a, b) => {
    const bySeverity = SEVERITY_ORDER[a.severity] - SEVERITY_ORDER[b.severity]
    if (bySeverity !== 0) return bySeverity
    if (a.code !== b.code) return a.code < b.code ? -1 : 1
    if (a.path !== b.path) return a.path < b.path ? -1 : 1
    if (a.detail !== b.detail) return a.detail < b.detail ? -1 : 1
    return 0
  })
}

/** Scan the DSH-managed fallback directory for link anomalies. */
export async function diagnoseFallback(fs: FsLike, home: string): Promise<Diagnostic[]> {
  const fallback = profilesNodeModulesDir(home)
  if (!(await fs.exists(fallback))) return []
  const diagnostics: Diagnostic[] = []
  const top = await fs.readdir(fallback)
  for (const entry of top) {
    const path = join(fallback, entry.name)
    if (entry.kind === 'link') {
      const read = await fs.readlink(path)
      let alive = true
      try {
        await fs.stat(path)
      } catch (error) {
        alive = false
      }
      if (!alive) {
        diagnostics.push({ code: 'D-170', severity: 'info', path, detail: 'fallback link ' + entry.name + ' is dangling (target ' + read + ' missing)', evidence: 'dangling' })
      }
      continue
    }
    if (entry.kind === 'dir' && !entry.name.startsWith('@')) {
      diagnostics.push({ code: 'D-180', severity: 'error', path, detail: 'fallback ' + entry.name + ' is a real directory where dsh maintains a symlink; the next boot fails', remediation: 'move it aside and let dsh re-heal the fallback' })
      continue
    }
    if (entry.kind === 'dir' && entry.name.startsWith('@')) {
      for (const scoped of await fs.readdir(path)) {
        if (scoped.kind !== 'link') continue
        const scopedPath = join(path, scoped.name)
        let alive = true
        try {
          await fs.stat(scopedPath)
        } catch (error) {
          alive = false
        }
        if (!alive) {
          diagnostics.push({ code: 'D-170', severity: 'info', path: scopedPath, detail: 'fallback link ' + entry.name + '/' + scoped.name + ' is dangling', evidence: 'dangling' })
        }
      }
    }
  }
  return sortDiagnostics(diagnostics)
}
