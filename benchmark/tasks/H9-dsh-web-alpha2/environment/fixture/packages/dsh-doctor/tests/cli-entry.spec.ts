import { describe, expect, it } from 'vitest'
import { isDirectCliRun } from '../src/cli.ts'

describe('isDirectCliRun', () => {
  it('returns false for undefined or empty entry arg', () => {
    expect(isDirectCliRun('file:///path/to/cli.mjs', undefined)).toBe(false)
    expect(isDirectCliRun('file:///path/to/cli.mjs', '')).toBe(false)
    expect(isDirectCliRun('file:///path/to/cli.mjs', '   ')).toBe(false)
  })

  it('matches valid URLs against local file paths', () => {
    const isWin = process.platform === 'win32'
    if (isWin) {
      const metaUrl = 'file:///C:/Users/user/project/packages/dsh-doctor/lib/cli.mjs'
      expect(isDirectCliRun(metaUrl, 'C:\\Users\\user\\project\\packages\\dsh-doctor\\lib\\cli.mjs')).toBe(true)
      expect(isDirectCliRun(metaUrl, 'c:\\users\\user\\project\\packages\\dsh-doctor\\lib\\cli.mjs')).toBe(true)
      expect(isDirectCliRun(metaUrl, 'C:\\other\\cli.mjs')).toBe(false)

      const spaceUrl = 'file:///C:/Users/John%20Doe/AppData/Local/DSH%20Doctor/cli.mjs'
      expect(isDirectCliRun(spaceUrl, 'C:\\Users\\John Doe\\AppData\\Local\\DSH Doctor\\cli.mjs')).toBe(true)
    } else {
      const metaUrl = 'file:///home/user/project/packages/dsh-doctor/lib/cli.mjs'
      expect(isDirectCliRun(metaUrl, '/home/user/project/packages/dsh-doctor/lib/cli.mjs')).toBe(true)
      expect(isDirectCliRun(metaUrl, '/home/user/other/module.mjs')).toBe(false)
    }
  })
})
