import { describe, expect, it } from 'vitest'
import { Config } from '../src/index.ts'

describe('desktop-launcher config defaults', () => {
  it('defaults the plugin master switch to off', () => {
    const resolved = Config({})
    expect(resolved.enabled).toBe(false)
    // Agent announcements are separately opt-in, even while the plugin is enabled.
    expect(resolved.announceToAgent).toBe(false)
  })

  it('preserves an explicit enabled value', () => {
    expect(Config({ enabled: true }).enabled).toBe(true)
    expect(Config({ enabled: false }).enabled).toBe(false)
  })
})
