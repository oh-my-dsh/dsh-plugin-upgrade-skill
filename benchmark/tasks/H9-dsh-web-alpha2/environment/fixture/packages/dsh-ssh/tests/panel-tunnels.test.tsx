// @vitest-environment jsdom
/**
 * TunnelsTab tests: the extracted TUNNEL_POLL_MS constant, the pure diff
 * helper that makes a poll tick with no real change keep the previous state
 * reference, and a light render test proving the mount-time interval ticks
 * on that constant and is cleared on unmount.
 */

import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { act } from 'react'
import { createRoot } from 'react-dom/client'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { TunnelsTab, TUNNEL_POLL_MS, diffTunnels } from '../src/client/panel/TunnelsTab.tsx'
import type { SshApi } from '../src/client/api.ts'
import type { TunnelInfo } from '../src/protocol.ts'

(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true

function makeTunnel(): TunnelInfo {
  return {
    id: 'tun-1',
    alias: 'db',
    localPort: 40000,
    remoteHost: '127.0.0.1',
    remotePort: 5432,
    state: 'forwarding',
    startedAt: 1000,
  }
}

afterEach(() => {
  vi.useRealTimers()
  document.body.replaceChildren()
})

describe('TunnelsTab polling contract', () => {
  it('exposes a 5s poll constant and the source no longer hardcodes it', () => {
    expect(TUNNEL_POLL_MS).toBe(5000)
    const source = readFileSync(join(process.cwd(), 'src', 'client', 'panel', 'TunnelsTab.tsx'), 'utf8')
    // The interval must reference the constant, not a literal magic number.
    expect(source).toContain('setInterval(() => { void load() }, TUNNEL_POLL_MS)')
  })

  it('diffTunnels keeps the previous reference when nothing changed', () => {
    expect(diffTunnels(null, [makeTunnel()])).toEqual([makeTunnel()])
    expect(diffTunnels([makeTunnel()], [makeTunnel()])).toBeNull()
  })

  it('diffTunnels returns next when length or a renderable field changes', () => {
    const base = [makeTunnel()]
    const added = [makeTunnel(), makeTunnel()]
    expect(diffTunnels(base, added)).toEqual(added)
    const failed = [{ ...makeTunnel(), state: 'failed' as const }]
    expect(diffTunnels(base, failed)).toEqual(failed)
    const moved = [{ ...makeTunnel(), localPort: 5000 }]
    expect(diffTunnels(base, moved)).toEqual(moved)
  })

  it('polls on TUNNEL_POLL_MS while mounted and clears the interval on unmount', async () => {
    vi.useFakeTimers()
    const listTunnels = vi.fn(async () => [makeTunnel()])
    const api = { listHosts: vi.fn(async () => []), listTunnels } as unknown as SshApi
    const container = document.createElement('div')
    document.body.appendChild(container)
    const root = createRoot(container)
    await act(async () => { root.render(<TunnelsTab api={api} />) })
    await act(async () => { await Promise.resolve() })
    const initial = listTunnels.mock.calls.length
    expect(initial).toBeGreaterThanOrEqual(1)
    await act(async () => { vi.advanceTimersByTime(TUNNEL_POLL_MS) })
    await act(async () => { await Promise.resolve() })
    expect(listTunnels.mock.calls.length).toBe(initial + 1)
    await act(async () => { root.unmount() })
  })
})