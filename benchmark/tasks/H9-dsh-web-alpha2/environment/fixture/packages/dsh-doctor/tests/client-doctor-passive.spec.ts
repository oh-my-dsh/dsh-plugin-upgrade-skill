// @vitest-environment jsdom
/**
 * Passive probe unit tests: safe description helpers, event normalization, the
 * bounded ring, dedupe, and the window listener wiring. Everything here must
 * hold even when the underlying event is hostile.
 */
import { describe, expect, it, vi } from 'vitest'
import {
  capText,
  normalizeRejection,
  normalizeWindowError,
  PassiveProbe,
  safeDescribe,
  type PassiveIncident,
} from '../src/client/doctor-passive.ts'

const tick = (offset: number): (() => number) => (() => offset)

describe('safeDescribe', () => {
  it('describes primitives', () => {
    expect(safeDescribe(undefined)).toBe('undefined')
    expect(safeDescribe(null)).toBe('null')
    expect(safeDescribe(42)).toBe('42')
    expect(safeDescribe('boom')).toBe('boom')
  })

  it('describes errors with name, message and stack', () => {
    const error = new Error('kaputt')
    const text = safeDescribe(error)
    expect(text).toContain('Error')
    expect(text).toContain('kaputt')
    expect(text).toContain('\n')
  })

  it('caps long strings', () => {
    expect(safeDescribe('x'.repeat(5000)).length).toBeLessThanOrEqual(804)
    expect(capText('abc', 100)).toBe('abc')
    expect(capText('abcdef', 3)).toBe('abc...')
  })

  it('handles circular JSON structures', () => {
    const node: Record<string, unknown> = { name: 'ring' }
    node['self'] = node
    const text = safeDescribe(node)
    expect(text).toContain('ring')
    expect(text).toContain('[circular]')
  })

  it('never throws on hostile toJSON', () => {
    const hostile = { toJSON: () => { throw new Error('no') } }
    expect(() => safeDescribe(hostile)).not.toThrow()
  })
})

describe('normalizeWindowError', () => {
  it('reads structured fields', () => {
    const fields = normalizeWindowError({
      message: 'script fail',
      filename: 'https://example.test/app.js',
      lineno: 12,
      colno: 7,
      error: new Error('inner'),
    })
    expect(fields.message).toBe('script fail')
    expect(fields.source).toBe('https://example.test/app.js')
    expect(fields.line).toBe(12)
    expect(fields.column).toBe(7)
    expect(fields.detail).toContain('inner')
  })

  it('falls back to the raw value when fields are missing', () => {
    const fields = normalizeWindowError('weird')
    expect(fields.message).toBe('weird')
    expect(fields.source).toBeUndefined()
  })

  it('ignores non-finite positions', () => {
    const fields = normalizeWindowError({ message: 'm', lineno: Number.NaN, colno: Infinity })
    expect(fields.line).toBeUndefined()
    expect(fields.column).toBeUndefined()
  })
})

describe('normalizeRejection', () => {
  it('reads the reason', () => {
    const fields = normalizeRejection({ reason: new Error('async fail') })
    expect(fields.message).toContain('async fail')
    expect(fields.detail).toContain('async fail')
  })

  it('handles a missing reason', () => {
    const fields = normalizeRejection({})
    expect(fields.message).toBeTruthy()
  })
})

describe('PassiveProbe', () => {
  it('captures window error events and notifies', () => {
    let batch: readonly PassiveIncident[] = []
    const probe = new PassiveProbe({ notify: incidents => { batch = incidents }, now: tick(100) })
    probe.start()
    try {
      const event = new Event('error')
      Object.assign(event, { message: 'window boom', filename: 'file.js', lineno: 3, colno: 9 })
      window.dispatchEvent(event)
      expect(batch).toHaveLength(1)
      expect(batch[0]!.kind).toBe('window-error')
      expect(batch[0]!.message).toBe('window boom')
      expect(probe.snapshot()).toHaveLength(1)
    } finally {
      probe.stop()
    }
  })

  it('captures unhandledrejection events', () => {
    let batch: readonly PassiveIncident[] = []
    const probe = new PassiveProbe({ notify: incidents => { batch = incidents }, now: tick(200) })
    probe.start()
    try {
      const event = new Event('unhandledrejection')
      Object.assign(event, { reason: new Error('promise fail') })
      window.dispatchEvent(event)
      expect(batch[0]!.kind).toBe('unhandled-rejection')
      expect(batch[0]!.message).toContain('promise fail')
    } finally {
      probe.stop()
    }
  })

  it('stops capturing after stop()', () => {
    let count = 0
    const probe = new PassiveProbe({ notify: () => { count += 1 }, now: tick(300) })
    probe.start()
    probe.stop()
    window.dispatchEvent(Object.assign(new Event('error'), { message: 'after stop' }))
    expect(count).toBe(0)
    expect(probe.snapshot()).toHaveLength(0)
  })

  it('dedupes an exact repeat within the window', () => {
    const probe = new PassiveProbe({ notify: () => {}, now: tick(400) })
    probe.record('react-boundary', 'same', 'x')
    probe.record('react-boundary', 'same', 'x')
    expect(probe.snapshot()).toHaveLength(1)
  })

  it('keeps distinct signals and honors the ring cap', () => {
    const probe = new PassiveProbe({ notify: () => {}, now: tick(500), max: 3 })
    probe.record('react-boundary', 'a')
    probe.record('connection-reset', 'b')
    probe.record('react-boundary', 'c')
    probe.record('connection-reset', 'd')
    const snapshot = probe.snapshot()
    expect(snapshot).toHaveLength(3)
    expect(snapshot[0]!.message).toBe('b')
    expect(snapshot[2]!.message).toBe('d')
  })

  it('clear notifies an empty batch', () => {
    const notify = vi.fn()
    const probe = new PassiveProbe({ notify, now: tick(600) })
    probe.record('react-boundary', 'x')
    probe.clear()
    expect(probe.snapshot()).toHaveLength(0)
    expect(notify).toHaveBeenLastCalledWith([])
  })

  it('swallows hostile notify callbacks', () => {
    const probe = new PassiveProbe({ notify: () => { throw new Error('bad consumer') }, now: tick(700) })
    expect(() => probe.record('react-boundary', 'x')).not.toThrow()
    expect(probe.snapshot()).toHaveLength(1)
  })

  it('reads the dedupe window from the clock seam', () => {
    let now = 1000
    const probe = new PassiveProbe({ notify: () => {}, now: () => now, max: 10 })
    probe.record('react-boundary', 'same')
    now = 1500
    probe.record('react-boundary', 'same')
    expect(probe.snapshot()).toHaveLength(1)
    now = 3100
    probe.record('react-boundary', 'same')
    expect(probe.snapshot()).toHaveLength(2)
  })
})
