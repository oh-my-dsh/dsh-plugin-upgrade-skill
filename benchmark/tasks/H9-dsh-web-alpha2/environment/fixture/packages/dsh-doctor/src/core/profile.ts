import { createHash } from 'node:crypto'
import { homedir } from 'node:os'
import { isAbsolute, join, resolve } from 'node:path'
import { join as posixJoin, resolve as posixResolve } from 'node:path/posix'
import type { ProfileIdentity } from './protocol.ts'

const PROFILE_NAME = /^[A-Za-z0-9][A-Za-z0-9._-]*$/

export function assertSafeProfileName(name: string): string {
  if (!PROFILE_NAME.test(name) || name === '.' || name === '..' || name === 'node_modules') {
    throw new Error(`doctor: unsafe profile name ${JSON.stringify(name)}`)
  }
  return name
}

export function resolveDshHome(env: NodeJS.ProcessEnv = process.env, home = homedir(), cwd = process.cwd()): string {
  const raw = env.DSH_HOME?.trim()
  const isPosix = home.startsWith('/') || (raw !== undefined && raw.startsWith('/'))
  if (!raw) return isPosix ? posixJoin(home, '.dsh') : join(home, '.dsh')
  const expanded = raw === '~'
    ? home
    : raw.startsWith('~/') || raw.startsWith('~\\')
      ? (isPosix ? posixJoin(home, raw.slice(2)) : join(home, raw.slice(2)))
      : raw
  if (isPosix || expanded.startsWith('/')) return posixResolve(expanded.replaceAll('\\', '/'))
  return isAbsolute(expanded) ? resolve(expanded) : resolve(cwd, expanded)
}

export function profileIdentity(dshHome: string, name: string, dshExecutable: string, role: 'protected' | 'rescue' = 'protected'): ProfileIdentity {
  assertSafeProfileName(name)
  const canonicalHome = dshHome.startsWith('/') ? posixResolve(dshHome) : resolve(dshHome)
  const canonicalDsh = dshExecutable.startsWith('/') ? posixResolve(dshExecutable) : resolve(dshExecutable)
  const id = role === 'rescue'
    ? 'system-rescue'
    : createHash('sha256').update([canonicalHome, name, canonicalDsh].join('\0')).digest('hex')
  return { id, dshHome: canonicalHome, name, dshExecutable: canonicalDsh, role }
}

export function profileDir(identity: Pick<ProfileIdentity, 'dshHome' | 'name'>): string {
  const isPosix = identity.dshHome.startsWith('/')
  const canonicalHome = isPosix ? posixResolve(identity.dshHome) : resolve(identity.dshHome)
  const j = isPosix ? posixJoin : join
  return j(canonicalHome, 'profiles', assertSafeProfileName(identity.name))
}
