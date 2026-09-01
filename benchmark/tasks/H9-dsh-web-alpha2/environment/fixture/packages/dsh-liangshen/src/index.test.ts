import { describe, expect, it } from 'vitest'
import { homedir } from 'node:os'
import { join } from 'node:path'
import process from 'node:process'
import { dshHome } from './index.ts'

/** Run `body` with the given DSH_HOME overrides, restoring the env afterwards. */
function withEnv(values: Record<string, string | undefined>, body: () => void): void {
  const previous = new Map<string, string | undefined>()
  for (const [key, value] of Object.entries(values)) {
    previous.set(key, process.env[key])
    if (value === undefined) delete process.env[key]
    else process.env[key] = value
  }
  try {
    body()
  } finally {
    for (const [key, value] of previous) {
      if (value === undefined) delete process.env[key]
      else process.env[key] = value
    }
  }
}

describe('dshHome', () => {
  it('expands a bare tilde to the user home directory', () => {
    withEnv({ DSH_HOME: '~' }, () => {
      expect(dshHome()).toBe(homedir())
    })
  })

  it('expands ~/ and ~\\ prefixes to home-relative paths', () => {
    withEnv({ DSH_HOME: '~/liangshen-home' }, () => {
      expect(dshHome()).toBe(join(homedir(), 'liangshen-home'))
    })
    withEnv({ DSH_HOME: '~\\liangshen-home' }, () => {
      expect(dshHome()).toBe(join(homedir(), 'liangshen-home'))
    })
  })

  it('trims the override before expanding', () => {
    withEnv({ DSH_HOME: '  ~/liangshen-home  ' }, () => {
      expect(dshHome()).toBe(join(homedir(), 'liangshen-home'))
    })
  })

  it('falls back to ~/.dsh for a missing or blank override', () => {
    withEnv({ DSH_HOME: undefined }, () => {
      expect(dshHome()).toBe(join(homedir(), '.dsh'))
    })
    withEnv({ DSH_HOME: '   ' }, () => {
      expect(dshHome()).toBe(join(homedir(), '.dsh'))
    })
  })

  it('keeps absolute overrides untouched', () => {
    withEnv({ DSH_HOME: '/srv/dsh-home' }, () => {
      expect(dshHome()).toBe('/srv/dsh-home')
    })
  })

  it('resolves a relative override against the process cwd (shared contract)', () => {
    withEnv({ DSH_HOME: 'data/home' }, () => {
      expect(dshHome()).toBe(join(process.cwd(), 'data', 'home'))
    })
  })
})
