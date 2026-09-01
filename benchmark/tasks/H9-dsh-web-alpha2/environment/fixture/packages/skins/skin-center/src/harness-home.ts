/**
 * DSH harness-home / profile path resolution. Extracted from the retired
 * skin-switch.ts (issue #506): the v2 runtime only needs to KNOW where the
 * harness home and the active profile's cordis.patch.yml live — the legacy
 * bridge reads/cleans the old managed section once, nothing rewrites it
 * afterwards.
 *
 * Precedence rules are the dsh launcher's own (kept byte-compatible with the
 * retired module so the bridge reads the same file the old CLI wrote).
 * @module @linxin666/dsh-client-ui-skin-center/harness-home
 */

import { realpathSync, statSync } from 'node:fs'
import { homedir } from 'node:os'
import { basename, dirname, join as joinPath, resolve as resolvePath } from 'node:path'
import { fileURLToPath } from 'node:url'

/** First non-blank string in a list of candidate values. */
export function firstNonBlank(...values: Array<string | undefined>): string | undefined {
  for (const value of values) {
    if (typeof value === 'string') {
      const trimmed = value.trim()
      if (trimmed !== '') return trimmed
    }
  }
  return undefined
}

/**
 * Derive the harness home + profile from this package's install layout
 * (…/<harnessHome>/profiles/<profile>/node_modules/<this package>). Returns
 * null outside such a layout (repo checkouts, tests).
 */
export function resolveInstallLayout(fromUrl: string = import.meta.url): { harnessHome: string; profile: string } | null {
  const starts = [fileURLToPath(fromUrl)]
  try {
    const real = realpathSync(starts[0])
    if (real !== starts[0]) starts.push(real)
  } catch {
    // Unreadable path: the literal chain alone still has a chance.
  }
  for (const start of starts) {
    let current = dirname(start)
    for (;;) {
      if (basename(current) === 'node_modules') {
        const profileDir = dirname(current)
        const profilesDir = dirname(profileDir)
        const profile = basename(profileDir)
        if (basename(profilesDir) === 'profiles' && profile !== '' && profile !== '.' && profile !== '..' && profile !== 'node_modules') {
          return { harnessHome: dirname(profilesDir), profile }
        }
      }
      const parent = dirname(current)
      if (parent === current) break
      current = parent
    }
  }
  return null
}

/**
 * Resolve the DSH harness home exactly like the dsh launcher:
 * injected home → <home>/.dsh; $DSH_HOME directly; install-layout home;
 * homedir()/.dsh.
 */
export function resolveHarnessHome(optsHome?: string, env: NodeJS.ProcessEnv = process.env, installHome?: string): string {
  if (optsHome !== undefined) return joinPath(optsHome, '.dsh')
  return firstNonBlank(env.DSH_HOME, installHome) ?? joinPath(homedir(), '.dsh')
}

/** The profile name when cwd sits directly under <harnessHome>/profiles/<name>. */
function profileFromCwd(cwd: string, profilesRoot: string): string | undefined {
  const root = resolvePath(profilesRoot)
  const normalizedCwd = resolvePath(cwd)
  const canonicalDir = (p: string): string => {
    try { return realpathSync(p) } catch { return resolvePath(p) }
  }
  if (canonicalDir(dirname(normalizedCwd)) === canonicalDir(root)) {
    const name = basename(normalizedCwd)
    try {
      if (name !== '' && statSync(normalizedCwd, { throwIfNoEntry: false })?.isDirectory() === true) return name
    } catch {
      // Unreadable cwd: fall through to the caller's default.
    }
  }
  return undefined
}

/** Paths the legacy bridge operates on. */
export interface HarnessPaths {
  patchPath: string
  legacyPatchPath: string
  profileModulesDir: string
  profileManifestPath: string
}

/**
 * Resolve the DSH paths under a HOME. Precedence (harness home): injected
 * home > $DSH_HOME > install layout > homedir()/.dsh. Precedence (profile):
 * injected profile > $DSH_SKIN_PROFILE > $DSH_PROFILE > cwd under
 * profiles/<name> > install layout profile > web.
 */
export function resolveHarnessPaths(home?: string, profile?: string, fromUrl: string = import.meta.url): HarnessPaths {
  const install = resolveInstallLayout(fromUrl)
  const harnessHome = resolveHarnessHome(home, process.env, install?.harnessHome)
  const profilesRoot = joinPath(harnessHome, 'profiles')
  const explicit = firstNonBlank(profile, process.env.DSH_SKIN_PROFILE, process.env.DSH_PROFILE)
  const activeProfile = explicit ?? profileFromCwd(process.cwd(), profilesRoot) ?? install?.profile ?? 'web'
  return {
    patchPath: joinPath(harnessHome, 'profiles', activeProfile, 'cordis.patch.yml'),
    legacyPatchPath: joinPath(harnessHome, 'cordis.patch.yml'),
    profileModulesDir: joinPath(harnessHome, 'profiles', activeProfile, 'node_modules'),
    profileManifestPath: joinPath(harnessHome, 'profiles', activeProfile, 'package.json'),
  }
}
