/**
 * Engine path helpers layered over profile.ts.
 *
 * profile.ts owns the canonical profile-name rule and the harness-home
 * resolution. This module adds the engine-specific roots (quarantine,
 * staging, capsule), profile-relative path safety, and profile discovery.
 */
import { join } from 'node:path/posix'
import type { FsLike } from './fs.ts'
import { assertSafeProfileName } from './profile.ts'
import { sha256Short } from './hash.ts'

/** Error for unsafe relative paths and engine segments. */
export class PathError extends Error {
  readonly value: string
  constructor(value: string, reason: string) {
    super('invalid path ' + JSON.stringify(value) + ': ' + reason)
    this.name = 'PathError'
    this.value = value
  }
}

/** The profiles directory under a harness home. */
export function profilesDir(home: string): string {
  return join(home, 'profiles')
}

/** Resolve one profile directory (validates the name). */
export function resolveProfileDir(home: string, name: string): string {
  return join(profilesDir(home), assertSafeProfileName(name))
}

/** The DSH-managed flat module fallback directory (symlink closure). */
export function profilesNodeModulesDir(home: string): string {
  return join(profilesDir(home), 'node_modules')
}

/** Resolve the capsule root under a harness home. */
export function doctorRoot(home: string): string {
  return join(home, '.dsh-doctor')
}

/** Resolve the quarantine root under a harness home. */
export function quarantineDir(home: string): string {
  return join(doctorRoot(home), 'quarantine')
}

/** Resolve the staging root (same filesystem as profiles, rename(2)-safe). */
export function stagingDir(home: string): string {
  return join(profilesDir(home), '.doctor-staging')
}

/** Resolve the capsule work root under a harness home. */
export function workDir(home: string): string {
  return join(doctorRoot(home), 'work')
}

/** Resolve the capsule logs root under a harness home. */
export function logsDir(home: string): string {
  return join(doctorRoot(home), 'logs')
}

/** Resolve the capsule lock root under a harness home. */
export function locksDir(home: string): string {
  return join(doctorRoot(home), 'locks')
}

/** Resolve the capsule snapshots root under a harness home. */
export function snapshotsDir(home: string): string {
  return join(doctorRoot(home), 'snapshots')
}

/** Resolve the capsule journal file under a harness home. */
export function journalPath(home: string): string {
  return join(doctorRoot(home), 'journal.jsonl')
}
/**
 * Validate a profile-relative file path: no absolute paths, no backslashes,
 * no '..' segments. Returns the normalized relative path.
 */
export function safeRelativePath(value: string, label = 'path'): string {
  if (typeof value !== 'string' || value === '') throw new PathError(value, label + ' is empty')
  if (value.startsWith('/') || value.startsWith(String.fromCharCode(92))) {
    throw new PathError(value, label + ' must be relative')
  }
  if (value.includes(String.fromCharCode(92))) throw new PathError(value, label + ' must not contain backslashes')
  const parts = value.split('/')
  for (const part of parts) {
    if (part === '..') throw new PathError(value, label + ' must not contain .. segments')
  }
  return parts.filter((part) => part !== '' && part !== '.').join('/')
}

/** Whether a child path stays strictly inside a parent path. */
export function isInside(child: string, parent: string): boolean {
  const base = parent.endsWith('/') ? parent.slice(0, -1) : parent
  return child === base || child.startsWith(base + '/')
}

/** Directory segment every snapshot/transaction id must satisfy. */
export const TXN_SEGMENT_RE = /^[A-Za-z0-9][A-Za-z0-9._-]{0,127}$/

/** Validate an engine-generated directory segment (txn id, snapshot id). */
export function validateSegment(value: string, label: string): string {
  if (!TXN_SEGMENT_RE.test(value)) {
    throw new PathError(value, label + ' must be a safe segment')
  }
  return value
}

/** Build a deterministic snapshot id from a profile name, timestamp, digest. */
export function makeSnapshotId(profile: string, tsCompact: string, content: string): string {
  return profile + '.' + tsCompact + '-' + sha256Short(content)
}

/**
 * Enumerate profile directories under a home.
 *
 * Only real directories are reported; every other entry (files, symlinks,
 * invalid names, the module-fallback node_modules dir) is collected in
 * `ignored` with a stable reason so discovery never silently drops state.
 */
export async function discoverProfiles(fs: FsLike, home: string): Promise<{ profiles: string[]; ignored: { name: string; reason: string }[] }> {
  const dir = profilesDir(home)
  if (!(await fs.exists(dir))) return { profiles: [], ignored: [] }
  const entries = await fs.readdir(dir)
  const profiles: string[] = []
  const ignored: { name: string; reason: string }[] = []
  for (const entry of entries) {
    if (entry.kind !== 'dir') {
      ignored.push({ name: entry.name, reason: 'not a directory (' + entry.kind + ')' })
      continue
    }
    if (entry.name === 'node_modules') {
      ignored.push({ name: entry.name, reason: 'DSH-managed module fallback directory' })
      continue
    }
    try {
      resolveProfileDir(home, entry.name)
    } catch (error) {
      ignored.push({ name: entry.name, reason: String(error) })
      continue
    }
    profiles.push(entry.name)
  }
  return { profiles: profiles.sort(), ignored }
}

