import { describe, expect, it } from 'vitest'
import type { IncomingMessage } from 'node:http'
import { isLoopbackRequest } from '../src/host/loopback.ts'
import { currentProfile } from '../src/host/profile.ts'

function request(overrides: Partial<{ remoteAddress: string; host: string; origin?: string; secFetchSite?: string }>): IncomingMessage {
  return {
    socket: { remoteAddress: overrides.remoteAddress ?? '127.0.0.1' },
    headers: {
      host: overrides.host ?? '127.0.0.1:3080',
      ...(overrides.origin !== undefined ? { origin: overrides.origin } : {}),
      ...(overrides.secFetchSite !== undefined ? { 'sec-fetch-site': overrides.secFetchSite } : {}),
    },
  } as unknown as IncomingMessage
}

describe('loopback fence', () => {
  it('accepts loopback socket with loopback host', () => {
    expect(isLoopbackRequest(request({}))).toBe(true)
    expect(isLoopbackRequest(request({ remoteAddress: '::1', host: '[::1]:3080' }))).toBe(true)
    expect(isLoopbackRequest(request({ remoteAddress: '::ffff:127.0.0.1', host: 'localhost:3080' }))).toBe(true)
  })

  it('rejects non-loopback sockets, foreign hosts and cross-site fetches', () => {
    expect(isLoopbackRequest(request({ remoteAddress: '10.0.0.5' }))).toBe(false)
    expect(isLoopbackRequest(request({ host: 'example.com:3080' }))).toBe(false)
    expect(isLoopbackRequest(request({ secFetchSite: 'cross-site' }))).toBe(false)
    expect(isLoopbackRequest(request({ origin: 'http://example.com' }))).toBe(false)
    expect(isLoopbackRequest(request({ host: 'not a host' }))).toBe(false)
  })

  it('accepts a same-origin browser against the loopback authority', () => {
    expect(isLoopbackRequest(request({ origin: 'http://127.0.0.1:3080' }))).toBe(true)
  })
})

describe('current profile identity', () => {
  it('resolves argv, then env, then web', () => {
    expect(currentProfile(['node', 'cli', '--profile', 'tui'], { DSH_HOME: '/h' } as NodeJS.ProcessEnv).name).toBe('tui')
    expect(currentProfile(['node', 'cli', 'web'], { DSH_HOME: '/h' } as NodeJS.ProcessEnv).name).toBe('web')
    expect(currentProfile(['node', 'cli'], { DSH_HOME: '/h', DSH_PROFILE: 'headless' } as NodeJS.ProcessEnv).name).toBe('headless')
  })

  it('rejects unsafe profile names', () => {
    expect(() => currentProfile(['node', 'cli', '--profile', '../x'], { DSH_HOME: '/h' } as NodeJS.ProcessEnv)).toThrow(/unsafe profile name/)
  })
})
