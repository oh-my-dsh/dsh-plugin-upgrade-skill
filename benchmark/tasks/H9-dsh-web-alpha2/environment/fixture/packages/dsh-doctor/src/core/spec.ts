/**
 * Dependency specification classification for profile manifests.
 *
 * The classifier is intentionally conservative: anything it cannot place into
 * a pinned, offline-provable form is reported as 'range' or 'unknown' so the
 * diagnosis layer can warn instead of silently assuming reproducibility.
 */
import type { DependencyKind, DependencySpec } from './types.ts'

const EXACT_VERSION_RE = /^\d+\.\d+\.\d+(?:[-+][0-9A-Za-z.-]+)?$/
const RANGE_PREFIX_RE = /^[~^><=*]/
const TARBALL_RE = /^https?:\/\/.*\.(?:tgz|tar\.gz)(?:\?.*)?$/
const GIT_URL_RE = /^(?:git\+|git:\/\/|git@|[\w.-]+@[\w.-]+:(?:[^/]+\/)*[^/]+\.git)/

/** Split 'name@specifier' handling scoped names; returns [name, sub] or null. */
export function splitPackageSpec(raw: string): { name: string; sub?: string } | null {
  if (raw.startsWith('@')) {
    const match = /^(@[^/]+\/[^@/]+)(?:@(.+))?$/.exec(raw)
    if (match === null) return null
    return { name: match[1], sub: match[2] }
  }
  const index = raw.indexOf('@')
  if (index <= 0) return raw.length > 0 ? { name: raw } : null
  const name = raw.slice(0, index)
  if (name.includes('/')) return null
  return { name, sub: raw.slice(index + 1) }
}

/** Classify one dependency specifier. */
export function classifySpec(raw: string): DependencySpec {
  const spec = raw.trim()
  if (spec === '') return { raw, kind: 'unknown' }

  if (spec.startsWith('link:')) return { raw, kind: 'link', target: spec.slice(5) }
  if (spec.startsWith('file:')) return { raw, kind: 'file', target: spec.slice(5) }
  if (spec.startsWith('workspace:')) return { raw, kind: 'workspace', target: spec.slice(10) }

  if (spec.startsWith('github:')) {
    const rest = spec.slice(7)
    const hash = rest.indexOf('#')
    const repo = hash === -1 ? rest : rest.slice(0, hash)
    const ref = hash === -1 ? undefined : rest.slice(hash + 1)
    return { raw, kind: 'github', name: repo, ref, version: ref }
  }

  if (GIT_URL_RE.test(spec)) {
    const hash = spec.indexOf('#')
    const ref = hash === -1 ? undefined : spec.slice(hash + 1)
    return { raw, kind: 'git', version: ref, ref }
  }

  if (TARBALL_RE.test(spec)) return { raw, kind: 'tarball', version: spec }

  if (spec.startsWith('npm:')) {
    const inner = spec.slice(4)
    const split = splitPackageSpec(inner)
    if (split === null) return { raw, kind: 'unknown' }
    return { ...classifyVersion(split.sub), raw, kind: renameKind(classifyVersion(split.sub).kind), name: split.name }
  }

  // Bare version specs: the dependency key carries the package name.
  if (EXACT_VERSION_RE.test(spec)) return { raw, kind: 'exact', version: spec }
  if (RANGE_PREFIX_RE.test(spec) || /\.x$/i.test(spec)) return { raw, kind: 'range', version: spec }

  const split = splitPackageSpec(spec)
  if (split === null) return { raw, kind: 'unknown' }
  const version = classifyVersion(split.sub)
  return { raw, kind: version.kind, name: split.name, version: version.version }
}

function renameKind(kind: DependencyKind): DependencyKind {
  return kind === 'unknown' ? 'registry' : kind
}

function classifyVersion(sub?: string): { kind: DependencyKind; version?: string } {
  if (sub === undefined || sub === '') return { kind: 'registry' }
  if (EXACT_VERSION_RE.test(sub)) return { kind: 'exact', version: sub }
  if (RANGE_PREFIX_RE.test(sub) || sub.includes('.x') || sub.toLowerCase() === 'latest' || sub.toLowerCase() === 'next') {
    return { kind: 'range', version: sub }
  }
  return { kind: 'range', version: sub }
}

/** Whether a spec is already pinned to a single exact artifact. */
export function isPinned(spec: DependencySpec): boolean {
  return spec.kind === 'exact' || spec.kind === 'file' || spec.kind === 'tarball' || spec.kind === 'workspace' || isCommitPinnedGit(spec)
}

/** Whether a git spec names a commit-ish ref (7+ hex digits). */
export function isCommitPinnedGit(spec: DependencySpec): boolean {
  if (spec.kind !== 'git' && spec.kind !== 'github') return false
  if (spec.ref === undefined) return false
  return /^[0-9a-fA-F]{7,40}$/.test(spec.ref)
}

/** Canonical display form for one spec. */
export function canonicalSpec(spec: DependencySpec): string {
  switch (spec.kind) {
    case 'link':
    case 'file':
    case 'workspace':
      return spec.kind + ':' + (spec.target ?? '')
    case 'github':
      return 'github:' + (spec.name ?? '') + (spec.ref === undefined ? '' : '#' + spec.ref)
    case 'git':
    case 'tarball':
      return spec.raw
    default:
      return (spec.name ?? '') + (spec.version === undefined ? '' : '@' + spec.version)
  }
}

/** Whether a spec points at a local filesystem path (link/file). */
export function isLocalSpec(spec: DependencySpec): boolean {
  return spec.kind === 'link' || spec.kind === 'file' || spec.kind === 'workspace'
}

