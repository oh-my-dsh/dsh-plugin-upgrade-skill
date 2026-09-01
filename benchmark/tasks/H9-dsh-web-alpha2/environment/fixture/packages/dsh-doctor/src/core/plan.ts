/**
 * Deterministic repair planning.
 *
 * The planner maps diagnostics to a stable, ordered action list. It is pure
 * over its inputs and never touches the filesystem: file contents needed for
 * rewrites are supplied by the caller, and the plan hash lets callers detect
 * plan identity without inspecting actions.
 */
import { canonicalJson, sha256Short } from './hash.ts'
import { editManifestJson } from './manifest.ts'
import type { Diagnostic, PlanAction, PlanResult, Severity } from './types.ts'

export interface PlanInput {
  profile: string
  diagnostics: Diagnostic[]
  /** Content of files a fix may rewrite, keyed by the diagnostic's path. */
  files: Record<string, string>
  /** Overrides for the paths the D-040/D-050 fixes target (profile vs home patch). */
  patchPathByCode: Record<string, string>
}

const SEVERITY_ORDER: Record<Severity, number> = { critical: 0, error: 1, warn: 2, info: 3 }

/** Build the repair plan for a diagnostic list. Same inputs always produce the same actions. */
export function planRepair(input: PlanInput): PlanResult {
  const actions: PlanAction[] = []
  for (const diag of sortInput(input.diagnostics)) {
    const fixes = fixFor(diag, input)
    for (const fix of fixes) actions.push(fix)
  }
  const sorted = actions.sort(byActionOrder)
  return { actions: sorted, hash: planHash(sorted) }
}

/** Deterministic hash of an action list. */
export function planHash(actions: PlanAction[]): string {
  return sha256Short(canonicalJson(actions), 12)
}

/** Whether two plans carry the same actionable content. */
export function samePlan(a: PlanResult, b: PlanResult): boolean {
  return a.hash === b.hash && canonicalJson(a.actions) === canonicalJson(b.actions)
}

function sortInput(diagnostics: Diagnostic[]): Diagnostic[] {
  return [...diagnostics].sort((a, b) => {
    const bySeverity = SEVERITY_ORDER[a.severity] - SEVERITY_ORDER[b.severity]
    if (bySeverity !== 0) return bySeverity
    if (a.code !== b.code) return a.code < b.code ? -1 : 1
    if (a.path !== b.path) return a.path < b.path ? -1 : 1
    return 0
  })
}

function byActionOrder(a: PlanAction, b: PlanAction): number {
  if (a.target !== b.target) return a.target < b.target ? -1 : 1
  if (a.op !== b.op) return a.op < b.op ? -1 : 1
  return 0
}

function fixFor(diag: Diagnostic, input: PlanInput): PlanAction[] {
  switch (diag.code) {
    case 'D-040':
    case 'D-050': {
      const path = input.patchPathByCode[diag.code] ?? diag.path
      const original = input.files[path] ?? ''
      if (original === '') return []
      return [
        { op: 'move-path', target: path, to: path + '.doctor-broken', sourceCode: [diag.code] },
        {
          op: 'write-file',
          target: path,
          content: '# dsh-doctor: quarantined a broken patch (see ' + path + '.doctor-broken)\n[]\n',
          sourceCode: [diag.code],
        },
      ]
    }
    case 'D-020':
    case 'D-030': {
      const manifestPath = diag.path
      const text = input.files[manifestPath]
      if (text === undefined) return []
      const bundleName = extractBundleName(diag.detail)
      if (bundleName === undefined) return []
      const removed = removeBundle(text, bundleName)
      if (removed === undefined) return []
      return [{ op: 'write-file', target: manifestPath, content: removed, sourceCode: [diag.code] }]
    }
    case 'D-080': {
      const patchPath = diag.path
      const text = input.files[patchPath]
      if (text === undefined) return []
      const rewritten = rewriteSettingsPath(text, diag.evidence, input.profile)
      if (rewritten === undefined) return []
      return [{ op: 'write-file', target: patchPath, content: rewritten, sourceCode: [diag.code] }]
    }
    default:
      return []
  }
}

function extractBundleName(detail: string): string | undefined {
  const match = /profile bundle ("(?:[^"]*)")/.exec(detail)
  if (match === null) return undefined
  try {
    return JSON.parse(match[1]) as string
  } catch (error) {
    return undefined
  }
}

function removeBundle(text: string, bundleName: string): string | undefined {
  let manifest: unknown
  try {
    manifest = JSON.parse(text)
  } catch (error) {
    return undefined
  }
  if (manifest === null || typeof manifest !== 'object' || Array.isArray(manifest)) return undefined
  const root = manifest as Record<string, unknown>
  const dsh = root.dsh
  if (typeof dsh !== 'object' || dsh === null) return undefined
  const profile = (dsh as Record<string, unknown>).profile
  if (typeof profile !== 'object' || profile === null) return undefined
  const bundles = (profile as Record<string, unknown>).bundles
  if (!Array.isArray(bundles) || !bundles.includes(bundleName)) return undefined
  const next = bundles.filter((item) => item !== bundleName)
  try {
    const edited = editManifestJson(text, { set: { 'dsh.profile.bundles': next } })
    return edited.changed ? edited.text : undefined
  } catch (error) {
    return undefined
  }
}

function rewriteSettingsPath(text: string, oldPath: string | undefined, profile: string): string | undefined {
  if (oldPath === undefined) return undefined
  const newExpr = "!!js dshHomePath('profiles/" + profile + "/settings.yaml')"
  const escaped = escapeRegExp(oldPath)
  const pattern = new RegExp('(path\\s*:\\s*)("?' + escaped + '\\1?)')
  const replaced = text.replace(pattern, '$1' + newExpr)
  return replaced === text ? undefined : replaced
}

function escapeRegExp(value: string): string {
  return value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
}
