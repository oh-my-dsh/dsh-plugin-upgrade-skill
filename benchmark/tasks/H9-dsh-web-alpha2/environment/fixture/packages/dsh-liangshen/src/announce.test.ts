/**
 * Announcement behavior (issue #839): the system-prompt announcement ships
 * OFF by default and only registers when announceToAgent is on. The apply
 * path is exercised against a minimal fake context; each test re-imports the
 * module so the mount-once guard cannot swallow a second apply call.
 */
import { mkdtempSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import process from 'node:process'
import { describe, expect, it, vi } from 'vitest'

interface FakePrompt {
  section: (spec: { name: string; order: number; text: string }) => () => void
}

function makeCtx(sections: ReturnType<typeof vi.fn>[] = []) {
  const registered: Array<{ name: string; order: number; text: string }> = []
  const systemPrompt: FakePrompt = {
    section(spec) {
      registered.push(spec)
      return () => {}
    },
  }
  return {
    ctx: {
      systemPrompt,
      effect: (fn: () => () => void) => fn(),
      inject: vi.fn(),
      logger: { warn: vi.fn(), info: vi.fn() },
    } as never,
    registered,
  }
}

describe('dsh-liangshen announcement (issue #839)', () => {
  it('resolves announceToAgent to false by default in the schema', async () => {
    vi.resetModules()
    const mod = await import('../src/index.ts')
    const value = mod.Config({})
    expect(value.announceToAgent).toBe(false)
    expect(value.enabled).toBe(true)
  })

  it('registers the announcement section when announceToAgent is on', async () => {
    vi.resetModules()
    const home = mkdtempSync(join(tmpdir(), 'liangshen-announce-'))
    const previous = process.env.DSH_HOME
    process.env.DSH_HOME = home
    try {
      const mod = await import('../src/index.ts')
      const { ctx, registered } = makeCtx()
      mod.apply(ctx, { announceToAgent: true })
      expect(registered.length).toBe(1)
      expect(registered[0]?.name).toBe('plugin:dsh-liangshen')
      expect(registered[0]?.text).toBe(mod.LIANGSHEN_GUIDANCE)
    } finally {
      process.env.DSH_HOME = previous
    }
  })

  it('keeps silent with the default config (announceToAgent off)', async () => {
    vi.resetModules()
    const home = mkdtempSync(join(tmpdir(), 'liangshen-announce-'))
    const previous = process.env.DSH_HOME
    process.env.DSH_HOME = home
    try {
      const mod = await import('../src/index.ts')
      const { ctx, registered } = makeCtx()
      mod.apply(ctx, undefined)
      expect(registered.length).toBe(0)
    } finally {
      process.env.DSH_HOME = previous
    }
  })
})
