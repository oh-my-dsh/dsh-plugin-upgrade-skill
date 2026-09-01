/**
 * Data-source contract: community.json is the single source of the DSH
 * Market store plugin list (market-build emits manifest/plugins.json from
 * it). Every entry must satisfy the index contract so the market surfaces
 * never see malformed records.
 */
import { describe, expect, it } from 'vitest'
import entries from '../community.json'

const REQUIRED = ['id', 'name', 'nameEn', 'author', 'repo'] as const
const CATEGORIES = ['ui', 'agent', 'tools', 'knowledge', 'integration', 'security', 'utility'] as const
const SUBCATEGORIES: Record<string, readonly string[]> = {
  ui: ['terminal', 'chat', 'render', 'panel'],
  agent: ['preset'],
  tools: ['context', 'browser', 'api', 'model', 'dev'],
  knowledge: ['memory', 'reading', 'qa'],
  integration: ['remote', 'bridge', 'sync', 'external-ai'],
  security: ['access', 'policy'],
  utility: ['cleanup', 'stats', 'notify', 'net'],
} as const

describe('community.json index contract', () => {
  it('is a non-empty array of fully specified entries', () => {
    const list = entries as unknown[]
    expect(Array.isArray(list)).toBe(true)
    expect(list.length).toBeGreaterThan(0)
    for (const raw of list) {
      const entry = raw as Record<string, unknown>
      for (const key of REQUIRED) {
        expect(typeof entry[key], key + ' of ' + String(entry.id)).toBe('string')
        expect((entry[key] as string).trim()).not.toBe('')
      }
      expect(String(entry.repo)).toMatch(/^https:\/\/[A-Za-z0-9._~\/-]+$/)
      if (entry.npm !== undefined) {
        expect(String(entry.npm)).toMatch(/^(@[a-z0-9][a-z0-9._-]*\/)?[a-z0-9][a-z0-9._-]*$/)
      }
      if (entry.category !== undefined) {
        expect(CATEGORIES).toContain(entry.category)
      }
      if (entry.subcategory !== undefined) {
        expect(entry.category, 'subcategory requires a category: ' + String(entry.id)).toBeDefined()
        expect(SUBCATEGORIES[String(entry.category)]).toContain(entry.subcategory)
      }
    }
  })

  it('keeps entry ids unique', () => {
    const ids = (entries as Array<{ id: string }>).map((e) => e.id)
    expect(new Set(ids).size).toBe(ids.length)
  })
})
