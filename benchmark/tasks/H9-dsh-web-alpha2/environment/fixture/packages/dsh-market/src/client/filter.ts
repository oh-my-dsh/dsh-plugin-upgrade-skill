/**
 * Pure filtering helpers for the Workshop plugin list. Category (one level)
 * and subcategory (second level) ids come straight from the market manifest;
 * 'all' is the no-filter sentinel. Kept in a plain module so the two-level
 * filter logic is unit-testable without rendering the card.
 */

export interface CategorizedItem {
  category?: string
  subcategory?: string
}

/** Keep items whose category matches; 'all' keeps everything. */
export function byCategory<T extends CategorizedItem>(items: readonly T[], cat: string): T[] {
  if (cat === 'all') return [...items]
  return items.filter((it) => (it.category ?? 'other') === cat)
}

/** Keep items whose subcategory matches; 'all' keeps everything. */
export function bySubcategory<T extends CategorizedItem>(items: readonly T[], subcat: string): T[] {
  if (subcat === 'all') return [...items]
  return items.filter((it) => it.subcategory === subcat)
}

/** Present categories with counts (missing category counts as 'other'). */
export function categoryCounts<T extends CategorizedItem>(items: readonly T[]): { id: string; count: number }[] {
  const counts = new Map<string, number>()
  for (const it of items) {
    const id = it.category ?? 'other'
    counts.set(id, (counts.get(id) ?? 0) + 1)
  }
  return [...counts.entries()].map(([id, count]) => ({ id, count })).sort((a, b) => a.id.localeCompare(b.id))
}

/**
 * Present subcategory counts of one category. Canonical order (the
 * category's legal subcategory list) first, extras after, then alphabetical.
 */
export function subcategoryCounts<T extends CategorizedItem>(
  items: readonly T[],
  cat: string,
  order: readonly string[] = [],
): { id: string; count: number }[] {
  const counts = new Map<string, number>()
  for (const it of items) {
    if (it.category !== cat || !it.subcategory) continue
    counts.set(it.subcategory, (counts.get(it.subcategory) ?? 0) + 1)
  }
  return [...counts.entries()]
    .map(([id, count]) => ({ id, count }))
    .sort((a, b) => {
      const ia = order.indexOf(a.id)
      const ib = order.indexOf(b.id)
      if (ia !== -1 && ib !== -1) return ia - ib
      if (ia !== -1) return -1
      if (ib !== -1) return 1
      return a.id.localeCompare(b.id)
    })
}
