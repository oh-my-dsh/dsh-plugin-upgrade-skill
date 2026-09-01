/**
 * Effect ledger tests (issue #506): append-only, activation-scoped,
 * idempotent disposal, fail-closed recording after disposal.
 */

import { describe, expect, it, vi } from 'vitest'

import { createEffectLedger } from '../src/client/runtime/effect-ledger.ts'

describe('createEffectLedger', () => {
  it('begins monotonic activation identities', () => {
    const ledger = createEffectLedger()
    expect(ledger.beginActivation()).toBe(1)
    expect(ledger.beginActivation()).toBe(2)
    expect(ledger.isDisposed(1)).toBe(false)
  })

  it('releases effects newest-first on dispose', () => {
    const ledger = createEffectLedger()
    const a = ledger.beginActivation()
    const order: string[] = []
    ledger.record(a, 'style:skin.css', () => order.push('style'))
    ledger.record(a, 'layer:background', () => order.push('layer'))
    ledger.record(a, 'hook:cleanup', () => order.push('hook'))
    ledger.disposeActivation(a)
    expect(order).toEqual(['hook', 'layer', 'style'])
    expect(ledger.isDisposed(a)).toBe(true)
  })

  it('dispose is idempotent (0/1/N calls)', () => {
    const ledger = createEffectLedger()
    const a = ledger.beginActivation()
    const teardown = vi.fn()
    ledger.record(a, 'style', teardown)
    ledger.disposeActivation(a)
    ledger.disposeActivation(a)
    ledger.disposeActivation(a)
    expect(teardown).toHaveBeenCalledTimes(1)
  })

  it('fails closed when recording on a disposed activation', () => {
    const ledger = createEffectLedger()
    const a = ledger.beginActivation()
    ledger.disposeActivation(a)
    expect(() => ledger.record(a, 'late-style', () => {})).toThrow(/disposed/)
    expect(() => ledger.replace(a, 'late-layer', undefined, () => {})).toThrow(/disposed/)
  })

  it('a failing teardown never blocks the rest and is logged', () => {
    const ledger = createEffectLedger()
    const a = ledger.beginActivation()
    const ok = vi.fn()
    ledger.record(a, 'first', ok)
    ledger.record(a, 'bad', () => { throw new Error('boom') })
    ledger.record(a, 'last', ok)
    ledger.disposeActivation(a)
    expect(ok).toHaveBeenCalledTimes(2)
    const kinds = ledger.entries().map((e) => `${e.kind}:${e.label}`)
    expect(kinds).toContain('cleanup-failed:bad')
  })

  it('replace releases the superseded entry immediately', () => {
    const ledger = createEffectLedger()
    const a = ledger.beginActivation()
    const old = vi.fn()
    const added = ledger.record(a, 'layer:background', old)
    const next = vi.fn()
    ledger.replace(a, 'layer:background', added, next)
    expect(old).toHaveBeenCalledTimes(1)
    expect(next).not.toHaveBeenCalled()
    ledger.disposeActivation(a)
    expect(next).toHaveBeenCalledTimes(1)
    expect(old).toHaveBeenCalledTimes(1)
  })

  it('keeps an append-only log across activations', () => {
    const ledger = createEffectLedger()
    const a = ledger.beginActivation()
    ledger.record(a, 'style', () => {})
    ledger.disposeActivation(a)
    const b = ledger.beginActivation()
    ledger.record(b, 'style', () => {})
    const seqs = ledger.entries().map((e) => e.seq)
    expect(seqs).toEqual([...seqs].sort((x, y) => x - y))
    expect(ledger.entries().some((e) => e.activationId === a && e.kind === 'release')).toBe(true)
    expect(ledger.entries().some((e) => e.activationId === b && e.kind === 'create')).toBe(true)
  })

  it('isolates activations from each other', () => {
    const ledger = createEffectLedger()
    const a = ledger.beginActivation()
    const b = ledger.beginActivation()
    const ta = vi.fn()
    const tb = vi.fn()
    ledger.record(a, 'style-a', ta)
    ledger.record(b, 'style-b', tb)
    ledger.disposeActivation(a)
    expect(ta).toHaveBeenCalledTimes(1)
    expect(tb).not.toHaveBeenCalled()
  })
})
