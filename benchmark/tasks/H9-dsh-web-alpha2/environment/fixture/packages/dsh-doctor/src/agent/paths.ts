import { createHash } from 'node:crypto'
import { homedir } from 'node:os'
import { join, resolve } from 'node:path'
import { join as posixJoin, resolve as posixResolve } from 'node:path/posix'

export interface DoctorPaths {
  root: string
  state: string
  registry: string
  incidents: string
  snapshots: string
  candidates: string
  quarantine: string
  capsule: string
  logs: string
  socket: string
  token: string
}

export function doctorPaths(env: NodeJS.ProcessEnv = process.env, home = homedir()): DoctorPaths {
  const raw = env.DSH_DOCTOR_HOME?.trim()
  const isPosix = (raw && raw.startsWith('/')) || (!raw && home.startsWith('/'))
  const res = isPosix ? posixResolve : resolve
  const j = isPosix ? posixJoin : join
  const root = res(raw && raw !== '' ? raw : j(home, '.dsh-doctor'))
  return {
    root,
    state: j(root, 'state'),
    registry: j(root, 'registry'),
    incidents: j(root, 'incidents'),
    snapshots: j(root, 'snapshots'),
    candidates: j(root, 'candidates'),
    quarantine: j(root, 'quarantine'),
    capsule: j(root, 'capsule'),
    logs: j(root, 'logs'),
    socket: process.platform === 'win32'
      ? `\\\\.\\pipe\\dsh-doctor-${createHash('sha256').update(root).digest('hex').slice(0, 16)}`
      : j(root, 'state', 'supervisor.sock'),
    token: j(root, 'state', 'supervisor.token'),
  }
}
