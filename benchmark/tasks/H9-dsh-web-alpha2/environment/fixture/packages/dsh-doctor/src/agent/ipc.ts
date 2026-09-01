import { randomBytes, timingSafeEqual } from 'node:crypto'
import { chmod, mkdir, readFile, writeFile } from 'node:fs/promises'
import { dirname } from 'node:path/posix'
import type { SupervisorRequest, SupervisorResponse } from '../core/protocol.ts'

export interface WireEnvelope { token: string; request: SupervisorRequest }

export function createSupervisorToken(): string { return randomBytes(32).toString('hex') }

export function tokensEqual(actual: string, expected: string): boolean {
  const a = Buffer.from(actual)
  const b = Buffer.from(expected)
  return a.length === b.length && timingSafeEqual(a, b)
}

export async function ensureToken(path: string): Promise<string> {
  try { return (await readFile(path, 'utf8')).trim() } catch (error) {
    if ((error as NodeJS.ErrnoException).code !== 'ENOENT') throw error
    const token = createSupervisorToken()
    await mkdir(dirname(path), { recursive: true, mode: 0o700 })
    await writeFile(path, token, { mode: 0o600, flag: 'wx' })
    await chmod(path, 0o600).catch(() => {})
    return token
  }
}

export async function callSupervisor(endpoint: string, token: string, request: SupervisorRequest, timeoutMs = 3000): Promise<SupervisorResponse> {
  const body = JSON.stringify({ token, request } satisfies WireEnvelope)
  if (endpoint.startsWith('http://') || endpoint.startsWith('https://')) {
    const response = await fetch(endpoint, { method: 'POST', headers: { 'content-type': 'application/json' }, body, signal: AbortSignal.timeout(timeoutMs) })
    return await response.json() as SupervisorResponse
  }
  const { createConnection } = await import('node:net')
  return await new Promise((resolve, reject) => {
    const socket = createConnection(endpoint)
    let received = ''
    const timer = setTimeout(() => { socket.destroy(new Error('doctor: supervisor timeout')) }, timeoutMs)
    socket.setEncoding('utf8')
    socket.on('connect', () => { socket.write(body + '\n') })
    socket.on('data', chunk => { received += chunk })
    socket.on('end', () => {
      clearTimeout(timer)
      try { resolve(JSON.parse(received) as SupervisorResponse) } catch (error) { reject(error) }
    })
    socket.on('error', error => { clearTimeout(timer); reject(error) })
  })
}
