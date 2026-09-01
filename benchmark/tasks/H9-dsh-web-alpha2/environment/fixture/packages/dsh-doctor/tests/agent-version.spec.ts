import { readFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { dirname, join } from 'node:path'
import { describe, expect, it } from 'vitest'
import { packageVersionAt, currentPackageVersion } from '../src/agent/version.ts'

describe('agent version identity', () => {
  it('reads the owning package version next to a module file', () => {
    const moduleFile = fileURLToPath(import.meta.url)
    const expected = (JSON.parse(readFileSync(join(dirname(moduleFile), '..', 'package.json'), 'utf8')) as { version: string }).version
    expect(packageVersionAt(moduleFile)).toBe(expected)
    expect(packageVersionAt('/nonexistent/mod.js')).toBe('0.0.0')
  })

  it('currentPackageVersion resolves through the bundle source layout', () => {
    expect(currentPackageVersion()).toMatch(/^\d+\.\d+\.\d+$/)
  })
})
