import { join } from 'node:path'
import { profileIdentity, resolveDshHome } from '../core/profile.ts'

export function currentProfile(argv: readonly string[] = process.argv, env: NodeJS.ProcessEnv = process.env): { name: string; id: string; dshHome: string; dshExecutable: string } {
  const flag = argv.indexOf('--profile')
  const name = flag >= 0 && argv[flag + 1] ? argv[flag + 1]! : argv.includes('web') ? 'web' : env.DSH_PROFILE?.trim() || 'web'
  const dshHome = resolveDshHome(env)
  const dshExecutable = env.DSH_DOCTOR_REAL_DSH?.trim() || process.argv[1] || 'dsh'
  const identity = profileIdentity(dshHome, name, dshExecutable)
  return { name, id: identity.id, dshHome, dshExecutable }
}

export function doctorStateRoot(env: NodeJS.ProcessEnv = process.env): string { return env.DSH_DOCTOR_HOME?.trim() || join(resolveDshHome(env), 'doctor') }
