import { describe, expect, it } from 'vitest'
import { byCategory, bySubcategory, categoryCounts, subcategoryCounts, type CategorizedItem } from './filter.ts'

interface Item extends CategorizedItem { id: string }

const ITEMS: Item[] = [
  { id: 'a', category: 'ui', subcategory: 'chat' },
  { id: 'b', category: 'tools', subcategory: 'dev' },
  { id: 'c', category: 'tools', subcategory: 'api' },
  { id: 'd', category: 'tools', subcategory: 'dev' },
  { id: 'e', category: 'ui', subcategory: 'terminal' },
  { id: 'f' },
] as const

describe('two-level plugin filter', () => {
  it('keeps everything for the all sentinel', () => {
    expect(byCategory(ITEMS, 'all')).toHaveLength(ITEMS.length)
    expect(bySubcategory(ITEMS, 'all')).toHaveLength(ITEMS.length)
  })

  it('filters by category and counts missing category as other', () => {
    expect(byCategory(ITEMS, 'tools').map((x) => x.id)).toEqual(['b', 'c', 'd'])
    expect(categoryCounts(ITEMS)).toEqual([
      { id: 'other', count: 1 },
      { id: 'tools', count: 3 },
      { id: 'ui', count: 2 },
    ])
  })

  it('filters by subcategory within a category', () => {
    expect(bySubcategory(byCategory(ITEMS, 'tools'), 'dev').map((x) => x.id)).toEqual(['b', 'd'])
    expect(bySubcategory(byCategory(ITEMS, 'ui'), 'dev')).toEqual([])
    expect(bySubcategory(ITEMS, 'missing')).toEqual([])
  })

  it('counts present subcategories in canonical order', () => {
    expect(subcategoryCounts(ITEMS, 'tools', ['api', 'dev', 'browser'])).toEqual([
      { id: 'api', count: 1 },
      { id: 'dev', count: 2 },
    ])
    expect(subcategoryCounts(ITEMS, 'ui')).toEqual([
      { id: 'chat', count: 1 },
      { id: 'terminal', count: 1 },
    ])
    expect(subcategoryCounts(ITEMS, 'tools')).toEqual([
      { id: 'api', count: 1 },
      { id: 'dev', count: 2 },
    ])
  })
})
