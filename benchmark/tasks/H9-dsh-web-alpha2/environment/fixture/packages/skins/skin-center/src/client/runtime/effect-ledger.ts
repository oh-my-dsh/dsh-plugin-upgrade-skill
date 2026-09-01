/**
 * Effect ledger (issue #506, contract section 6).
 *
 * Every runtime effect a skin activation creates — style tags, CSS variable
 * overrides, decoration-layer content, listeners, hook cleanups — is recorded
 * here as an append-only entry bound to its activation identity. Switching
 * skins releases the old activation's entries in reverse order; disposal is
 * idempotent and may run 0, 1 or N times.
 *
 * lifecycleScope split:
 *  - "activation": everything injectable — released on every skin switch;
 *  - "component": skin static assets and the user's selection — survive
 *    switches, reloads and HMR. The ledger only tracks activation scope.
 *
 * Pure logic, no DOM types required (entries are opaque teardown closures).
 */

export type EffectKind = 'create' | 'bind' | 'replace' | 'release' | 'cleanup-failed'

export interface EffectLedgerEntry {
  /** Monotonic sequence number (append-only). */
  seq: number
  activationId: number
  kind: EffectKind
  /** Human-readable label for diagnostics (e.g. "style:skin.css"). */
  label: string
  /** For replace: the seq of the superseded entry. */
  replacesSeq?: number
  at: number
}

interface LiveEffect {
  seq: number
  label: string
  teardown: () => void
  released: boolean
}

export interface EffectLedger {
  /** Start a new activation identity. Returns its id. */
  beginActivation(): number
  /**
   * Record an effect under the activation. The teardown must be idempotent.
   * Throws if the activation was already disposed (fail-closed: no orphan
   * effects after a switch).
   */
  record(activationId: number, label: string, teardown: () => void): number
  /**
   * Record that `label` replaces a previous entry (e.g. decoration-layer
   * content swap). The replaced entry is released immediately.
   */
  replace(activationId: number, label: string, previousSeq: number | undefined, teardown: () => void): number
  /**
   * Release every live effect of the activation, newest first. Idempotent;
   * individual teardown failures are caught and logged as cleanup-failed
   * entries (one failing teardown never blocks the rest).
   */
  disposeActivation(activationId: number): void
  /** Whether disposeActivation has run for this activation. */
  isDisposed(activationId: number): boolean
  /** Read-only view of the append-only log (diagnostics / tests). */
  entries(): readonly EffectLedgerEntry[]
}

export function createEffectLedger(now: () => number = () => Date.now()): EffectLedger {
  let seq = 0
  let nextActivation = 1
  const log: EffectLedgerEntry[] = []
  const live = new Map<number, LiveEffect[]>()
  const disposed = new Set<number>()

  function push(activationId: number, kind: EffectKind, label: string, replacesSeq?: number): number {
    seq += 1
    log.push({ seq, activationId, kind, label, replacesSeq, at: now() })
    return seq
  }

  function release(effect: LiveEffect, activationId: number): void {
    if (effect.released) return
    effect.released = true
    push(activationId, 'release', effect.label)
    try {
      effect.teardown()
    } catch {
      // A failing teardown must never block the remaining cleanup; the
      // failure itself is a ledger fact for diagnostics.
      push(activationId, 'cleanup-failed', effect.label)
    }
  }

  return {
    beginActivation() {
      const id = nextActivation++
      live.set(id, [])
      push(id, 'create', 'activation')
      return id
    },

    record(activationId, label, teardown) {
      const bucket = live.get(activationId)
      if (!bucket || disposed.has(activationId)) {
        throw new Error(`effect "${label}" recorded on disposed/unknown activation ${activationId}`)
      }
      const entrySeq = push(activationId, 'create', label)
      bucket.push({ seq: entrySeq, label, teardown, released: false })
      return entrySeq
    },

    replace(activationId, label, previousSeq, teardown) {
      const bucket = live.get(activationId)
      if (!bucket || disposed.has(activationId)) {
        throw new Error(`effect "${label}" replaced on disposed/unknown activation ${activationId}`)
      }
      if (previousSeq !== undefined) {
        const previous = bucket.find((e) => e.seq === previousSeq)
        if (previous) release(previous, activationId)
      }
      const entrySeq = push(activationId, 'replace', label, previousSeq)
      bucket.push({ seq: entrySeq, label, teardown, released: false })
      return entrySeq
    },

    disposeActivation(activationId) {
      if (disposed.has(activationId)) return
      disposed.add(activationId)
      const bucket = live.get(activationId) ?? []
      for (const effect of [...bucket].reverse()) release(effect, activationId)
    },

    isDisposed(activationId) {
      return disposed.has(activationId)
    },

    entries() {
      return log
    },
  }
}
