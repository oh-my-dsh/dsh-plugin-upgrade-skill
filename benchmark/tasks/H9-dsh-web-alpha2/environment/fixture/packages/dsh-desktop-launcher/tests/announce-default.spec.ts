/**
 * Announcement default (issue #839): announceToAgent resolves to false so
 * agent system prompts stay clean unless the user opts in.
 */
import { describe, expect, it } from 'vitest'
import { Config } from '../src/index.ts'

describe('announcement default (issue #839)', () => {
  it('resolves announceToAgent to false by default', () => {
    const value = Config({}) as { announceToAgent: boolean; enabled: boolean }
    expect(value.announceToAgent).toBe(false)
    expect(value.enabled).toBe(false)
  })

  it('keeps an explicit true override', () => {
    const value = Config({ announceToAgent: true }) as { announceToAgent: boolean }
    expect(value.announceToAgent).toBe(true)
  })
})
