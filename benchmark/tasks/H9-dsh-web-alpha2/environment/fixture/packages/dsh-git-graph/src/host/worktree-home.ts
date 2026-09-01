/**
 * Managed-worktree location: every plugin-created worktree lives under
 * `$DSH_HOME/worktrees/<repo-key>/<name>/` where repo-key pairs the
 * sanitized repository basename with a short hash of its canonical root, so
 * same-named repositories never collide. Host-only (node:crypto); the
 * browser learns the absolute prefix through the /git/config view.
 * @module dsh-git-graph/host/worktree-home
 */

import { createHash } from 'node:crypto'
import { basename, join, sep } from 'node:path'
import { dshHome } from './dsh-home.ts'
import { sanitizeWorktreeName } from '../core/git-command.ts'

/** The absolute directory every managed worktree family lives under. */
export function worktreesHome(): string {
  return join(dshHome(), 'worktrees')
}

/**
 * The stable key of one repository inside the managed home: sanitized
 * basename plus 8 hex chars of its canonical root's sha1.
 * @param root - canonical repository root (realpath'd).
 */
export function repoKeyFor(root: string): string {
  const base = sanitizeWorktreeName(basename(root)) ?? 'repo'
  const hash = createHash('sha1').update(root).digest('hex').slice(0, 8)
  return `${base}-${hash}`
}

/** The absolute path one named worktree of one repository would occupy. */
export function worktreePathFor(root: string, name: string): string {
  return join(worktreesHome(), repoKeyFor(root), name)
}

/** The absolute directory holding every managed worktree of one repository. */
export function repoWorktreesDir(root: string): string {
  return join(worktreesHome(), repoKeyFor(root))
}

/**
 * Containment check for removal: a managed worktree path must be a DIRECT
 * child of the repository's managed directory. Both inputs must already be
 * canonical (realpath'd) absolute paths — DSH_HOME may itself traverse
 * symlinks, so the call site canonicalizes the managed directory too.
 * @param dir - canonical managed directory (repoWorktreesDir output, resolved).
 * @param candidate - canonical worktree path.
 */
export function isManagedWorktreeOf(dir: string, candidate: string): boolean {
  if (!candidate.startsWith(dir + sep)) return false
  return !candidate.slice(dir.length + 1).includes(sep)
}