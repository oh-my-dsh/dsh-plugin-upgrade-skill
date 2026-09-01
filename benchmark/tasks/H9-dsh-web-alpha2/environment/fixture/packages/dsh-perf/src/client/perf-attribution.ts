/**
 * Per-plugin activity attribution for the dsh-perf HUD.
 *
 * One merged MutationObserver resolves every mutated node to its nearest
 * `[data-dsh-plugin]` root (semantic attribute convention,
 * skins/skin-center contracts/semantic-attrs-v1.md) and counts added nodes
 * into fixed time-grid buckets. The HUD renders a top-N scoreboard so
 * steady-state cost of our own plugins becomes measurable instead of
 * anecdotal. Classification and bucket math live here as pure injectable
 * logic; index.ts only wires the DOM observer and the render line.
 *
 * Semantics kept deliberately humble: rates are wall-clock (idle time
 * dilutes them on purpose), per-callback work above the budget and nodes
 * without a `data-dsh-plugin` ancestor share one "unattributed" bucket -
 * plugins that do not emit semantic attributes show up there, which is the
 * honest signal that drives adoption of the convention; totals include that bucket so an
 * all-unattributed page still reads nonzero. Everything fails
 * open: no MutationObserver or no roots means an empty scoreboard, never an
 * error surface.
 * @module @linxin666/dsh-perf/client
 */

/** Selector used to resolve a mutated node to its owning plugin root. */
export const ATTR_ROOT_SELECTOR = '[data-dsh-plugin]'

/** Default aggregation window; aligned with the HUD poll cadence. */
export const ATTR_WINDOW_MS = 2000
/** How many closed windows feed a snapshot (~16s at defaults). */
export const ATTR_HISTORY_WINDOWS = 8

interface Bucket {
  byPlugin: Map<string, number>
  unattributed: number
  records: number
}

export interface AttributionSnapshot {
  /** Wall-clock seconds covered by the merged windows. */
  spanSeconds: number
  /** All added-node rates merged, unattributed included. */
  totalNodesPerSec: number
  unattributedPerSec: number
  /** Added-node rate outside the top-N list. */
  otherNodesPerSec: number
  topPlugins: { name: string; nodesPerSec: number }[]
  recordsPerSec: number
}

export interface AttributionAggregator {
  add(plugin: string | null, nodes: number, nowMs: number): void
  addRecords(records: number, nowMs: number): void
  snapshot(nowMs: number, topN?: number): AttributionSnapshot
}

function bucketKey(nowMs: number, windowMs: number): number {
  return Math.floor(nowMs / windowMs)
}

/**
 * Fixed-grid attribution buckets. Timestamps come from the caller so the
 * math stays deterministic in tests; `windowMs` keeps rates comparable no
 * matter how irregularly mutations arrive.
 */
export function createAttributionAggregator(options: { windowMs?: number; history?: number } = {}): AttributionAggregator {
  const windowMs = options.windowMs ?? ATTR_WINDOW_MS
  const history = options.history ?? ATTR_HISTORY_WINDOWS
  const buckets = new Map<number, Bucket>()

  const getOrCreate = (key: number): Bucket => {
    // Insertion-side pruning: anything older than the retained grid slides out.
    const oldest = key - history + 1
    for (const existing of buckets.keys()) {
      if (existing < oldest) buckets.delete(existing)
    }
    let bucket = buckets.get(key)
    if (bucket === undefined) {
      bucket = { byPlugin: new Map<string, number>(), unattributed: 0, records: 0 }
      buckets.set(key, bucket)
    }
    return bucket
  }

  const bump = (plugin: string | null, nodes: number, nowMs: number): void => {
    if (!(nodes > 0)) return
    const bucket = getOrCreate(bucketKey(nowMs, windowMs))
    if (plugin === null) bucket.unattributed += nodes
    else bucket.byPlugin.set(plugin, (bucket.byPlugin.get(plugin) ?? 0) + nodes)
  }

  return {
    add(plugin, nodes, nowMs): void {
      bump(plugin, nodes, nowMs)
    },
    addRecords(records, nowMs): void {
      if (!(records > 0)) return
      getOrCreate(bucketKey(nowMs, windowMs)).records += records
    },
    snapshot(nowMs, topN = 3): AttributionSnapshot {
      const cursor = bucketKey(nowMs, windowMs)
      const oldest = cursor - history + 1
      const startMs = oldest * windowMs
      const byPlugin = new Map<string, number>()
      let unattributed = 0
      let records = 0
      for (const [key, bucket] of buckets) {
        if (key < oldest || key > cursor) continue
        for (const [name, nodes] of bucket.byPlugin) {
          byPlugin.set(name, (byPlugin.get(name) ?? 0) + nodes)
        }
        unattributed += bucket.unattributed
        records += bucket.records
      }
      const spanSeconds = Math.max((nowMs - startMs) / 1000, windowMs / 1000)
      const perSec = (nodes: number): number => Math.round((nodes / spanSeconds) * 10) / 10
      const ranked = [...byPlugin.entries()]
        .map(([name, nodes]) => ({ name, nodesPerSec: perSec(nodes) }))
        .sort((a, b) => b.nodesPerSec - a.nodesPerSec || (a.name < b.name ? -1 : 1))
      const attributedNodes = [...byPlugin.values()].reduce((sum, nodes) => sum + nodes, 0)
      const totalNodes = attributedNodes + unattributed
      const head = ranked.slice(0, Math.max(topN, 0))
      const restPerSec =
        ranked.slice(Math.max(topN, 0)).reduce((sum, entry) => sum + entry.nodesPerSec, 0) +
        perSec(unattributed)
      return {
        spanSeconds: Math.round(spanSeconds * 100) / 100,
        totalNodesPerSec: perSec(totalNodes),
        unattributedPerSec: perSec(unattributed),
        otherNodesPerSec: Math.round(restPerSec * 10) / 10,
        topPlugins: head,
        recordsPerSec: perSec(records),
      }
    },
  }
}

// --- 长任务来源记录 ----------------------------------------------------------

/** Default lookback for long-task bookkeeping. */
export const LONGTASK_WINDOW_MS = 60_000

export interface LongtaskRecord {
  t: number
  durationMs: number
  /** Best-effort container name from the spec attribution, else 'unknown'. */
  source: string
}

export interface LongtaskLog {
  push(record: LongtaskRecord): void
  prune(nowMs: number): void
  list(): readonly LongtaskRecord[]
  countSince(nowMs: number, windowMs: number): number
  maxSince(nowMs: number, windowMs: number): number
  /** Sources merged by summed duration, heaviest first. */
  topSources(nowMs: number, windowMs: number, n?: number): { source: string; count: number; durationMs: number }[]
}

/**
 * Ring of recent long tasks with coarse origin labels. The spec-level
 * attribution often carries no container name, so the most useful stable
 * output is still aggregate: count, worst duration, and whichever sources
 * did label themselves. Counting iterates batched entries (one observer
 * callback can deliver several tasks).
 */
export function createLongtaskLog(options: { windowMs?: number; capacity?: number } = {}): LongtaskLog {
  const windowMs = options.windowMs ?? LONGTASK_WINDOW_MS
  const capacity = options.capacity ?? 40
  const items: LongtaskRecord[] = []
  const sinceWindow = (nowMs: number): LongtaskRecord[] => {
    const cutoff = nowMs - windowMs
    return items.filter((item) => item.t >= cutoff)
  }
  return {
    push(record): void {
      items.push(record)
      while (items.length > capacity) items.shift()
    },
    prune(nowMs): void {
      const cutoff = nowMs - windowMs
      while (items.length > 0 && items[0].t < cutoff) items.shift()
    },
    list(): readonly LongtaskRecord[] {
      return items
    },
    countSince(nowMs, spanMs): number {
      return sinceWindow(nowMs).filter((item) => item.t >= nowMs - spanMs).length
    },
    maxSince(nowMs, spanMs): number {
      return sinceWindow(nowMs)
        .filter((item) => item.t >= nowMs - spanMs)
        .reduce((max, item) => Math.max(max, item.durationMs), 0)
    },
    topSources(nowMs, spanMs, n = 3): { source: string; count: number; durationMs: number }[] {
      const merged = new Map<string, { count: number; durationMs: number }>()
      for (const item of sinceWindow(nowMs)) {
        if (item.t < nowMs - spanMs) continue
        const entry = merged.get(item.source) ?? { count: 0, durationMs: 0 }
        entry.count += 1
        entry.durationMs += item.durationMs
        merged.set(item.source, entry)
      }
      return [...merged.entries()]
        .map(([source, agg]) => ({ source, ...agg }))
        .sort((a, b) => b.durationMs - a.durationMs || (a.source < b.source ? -1 : 1))
        .slice(0, Math.max(n, 0))
    },
  }
}

/** Extracts the best-effort source label from a raw long-task entry. */
export function readLongtaskSource(entry: PerformanceEntry): string {
  const extended = entry as PerformanceEntry & {
    attribution?: { containerName?: string; containerType?: string }[]
  }
  const first = Array.isArray(extended.attribution) ? extended.attribution[0] : undefined
  const name = first?.containerName
  return typeof name === 'string' && name.length > 0 ? name : 'unknown'
}

// --- DOM 采样器 -------------------------------------------------------------

export interface DomAttributionSamplerOptions {
  /** Max nodes classified per observer callback; overflow goes unattributed. */
  budget?: number
  now?: () => number
}

/**
 * Installs the merged body MutationObserver feeding the aggregator.
 * Returns a disposer, or `undefined` when the environment lacks the APIs -
 * callers treat that as an empty scoreboard, never a failure.
 */
export function startDomAttributionSampler(
  aggregator: AttributionAggregator,
  options: DomAttributionSamplerOptions = {},
): (() => void) | undefined {
  try {
    if (typeof document === 'undefined' || typeof MutationObserver !== 'function') return undefined
    const target = document.body
    if (target === null) return undefined
    const budget = options.budget ?? 400
    const now = options.now ?? ((): number => performance.now())
    let warned = false

    const classify = (element: Element | null): string | null => {
      if (element === null || typeof element.closest !== 'function') return null
      const value = element.closest(ATTR_ROOT_SELECTOR)?.getAttribute('data-dsh-plugin')
      return value ? value : null
    }

    const observer = new MutationObserver((records) => {
      try {
        const timestamp = now()
        aggregator.addRecords(records.length, timestamp)
        let processed = 0
        let overflow = 0
        for (const record of records) {
          for (const node of record.addedNodes) {
            let owner: string | null
            if (node.nodeType === 1) owner = classify(node as Element)
            else if (node.nodeType === 3) owner = classify(node.parentElement)
            else owner = null
            if (processed >= budget) {
              overflow += 1
              continue
            }
            processed += 1
            aggregator.add(owner, 1, timestamp)
          }
        }
        if (overflow > 0) aggregator.add(null, overflow, timestamp)
      } catch (error) {
        // 采样失败只降级一次: 计分板缺失, GUI 不受影响。
        if (!warned) {
          warned = true
          console.debug('[dsh-perf] attribution sampler degraded:', error)
        }
      }
    })
    observer.observe(target, { childList: true, subtree: true })
    return () => {
      observer.disconnect()
    }
  } catch (error) {
    console.debug('[dsh-perf] attribution sampler unavailable:', error)
    return undefined
  }
}