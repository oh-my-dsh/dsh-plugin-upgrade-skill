import { mkdtemp, rm, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { describe, expect, it } from 'vitest'
import { classifyInvocation, managedLaunch, parseProfile } from '../src/agent/launch.ts'

describe('launcher argument classification', () => {
  it('parses the profile flag and the web alias', () => {
    expect(parseProfile(['dsh', '--profile', 'tui'])).toBe('tui')
    expect(parseProfile(['dsh', 'web'])).toBe('web')
    expect(parseProfile(['dsh', '--help'])).toBeUndefined()
  })

  it('classifies invocations', () => {
    expect(classifyInvocation(['dsh', 'web'])).toBe('profile')
    expect(classifyInvocation(['dsh', '--profile', 'headless', 'run'])).toBe('profile')
    expect(classifyInvocation(['dsh', 'plugin', '--profile', 'web', 'add', 'x'])).toBe('plugin')
    expect(classifyInvocation(['dsh', '--profile', 'web', '--dump-config'])).toBe('dump')
    expect(classifyInvocation(['dsh', '--help'])).toBe('utility')
    expect(classifyInvocation(['dsh', '--version'])).toBe('utility')
  })

  it('relays an invocation verbatim and forwards the run identity', async () => {
    const dir = await mkdtemp(join(tmpdir(), 'dsh-doctor-launch-'))
    try {
      const marker = join(dir, 'marker.json')
      const stub = join(dir, 'stub.mjs')
      await writeFile(stub, '#!/usr/bin/env node\nimport { writeFileSync } from "node:fs"; import { env } from "node:process"; writeFileSync(env.DSH_DOCTOR_TEST_MARKER, JSON.stringify({ runId: env.DSH_DOCTOR_RUN_ID, profileId: env.DSH_DOCTOR_PROFILE_ID, argv: process.argv.slice(2) }))', { mode: 0o755 })
      const code = await managedLaunch({
        argv: ['--profile', 'web', '--no-open'],
        endpoint: join(dir, 'missing.sock'),
        token: 'tok',
        realDsh: stub,
        env: { ...process.env, DSH_HOME: '/home/u/.dsh', PATH: process.env.PATH ?? '', DSH_DOCTOR_TEST_MARKER: marker },
        now: () => '2026-01-01T00:00:00Z',
      } as Parameters<typeof managedLaunch>[0])
      expect(code).toBe(0)
      const { readFile } = await import('node:fs/promises')
      const facts = JSON.parse(await readFile(marker, 'utf8')) as { runId: string; profileId: string; argv: string[] }
      expect(facts.runId).toMatch(/^[0-9a-f-]{8,}$/)
      expect(facts.profileId).toMatch(/^[0-9a-f]{64}$/)
      expect(facts.argv).toEqual(['--profile', 'web', '--no-open'])
    } finally {
      await rm(dir, { recursive: true, force: true })
    }
  })
})
