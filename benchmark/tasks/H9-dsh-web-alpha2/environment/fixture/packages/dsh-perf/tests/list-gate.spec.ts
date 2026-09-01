import { describe, expect, it, vi } from 'vitest'
import { makeListSetGate, sameVisibleContent, type SessionListSnapshotLike } from '../src/client/perf-list-gate'

function snap(overrides: Partial<SessionListSnapshotLike> = {}): SessionListSnapshotLike {
  return {
    ids: ['a', 'b'],
    byId: {
      a: { id: 'a', displayTitle: 'A', running: true, updatedAt: 100 },
      b: { id: 'b', displayTitle: 'B', running: false, updatedAt: 90 },
    },
    current: 'a',
    phase: 'ready',
    subagentsByParent: {},
    jobsBySession: {},
    currentAddress: undefined,
    ...overrides,
  }
}

describe('sameVisibleContent', () => {
  it('仅 projectionValues 身份变化视为可见内容一致', () => {
    const a = snap()
    const b = snap({
      byId: {
        a: { id: 'a', displayTitle: 'A', running: true, updatedAt: 100, projectionValues: { tokenUsage: { total: 10 } } },
        b: { id: 'b', displayTitle: 'B', running: false, updatedAt: 90 },
      },
    })
    expect(sameVisibleContent(a, b)).toBe(true)
  })

  it('updatedAt 变化是可见变化', () => {
    const a = snap()
    const b = snap({ byId: { a: { id: 'a', displayTitle: 'A', running: true, updatedAt: 101 }, b: { id: 'b', displayTitle: 'B', running: false, updatedAt: 90 } } })
    expect(sameVisibleContent(a, b)).toBe(false)
  })

  it('running / displayTitle / current / phase 变化均为可见变化', () => {
    const a = snap()
    expect(sameVisibleContent(a, snap({ current: 'b' }))).toBe(false)
    expect(sameVisibleContent(a, snap({ phase: 'pending' }))).toBe(false)
    expect(sameVisibleContent(a, snap({ byId: { a: { id: 'a', displayTitle: 'A2', running: true, updatedAt: 100 }, b: a.byId?.b } }))).toBe(false)
    expect(sameVisibleContent(a, snap({ byId: { a: { id: 'a', displayTitle: 'A', running: false, updatedAt: 100 }, b: a.byId?.b } }))).toBe(false)
  })

  it('ids 顺序变化是可见变化', () => {
    expect(sameVisibleContent(snap(), snap({ ids: ['b', 'a'] }))).toBe(false)
  })

  it('subagentsByParent 内容变化是可见变化(徽标)', () => {
    expect(sameVisibleContent(snap(), snap({ subagentsByParent: { a: { state: 'ready', entries: [] } } }))).toBe(false)
  })
  it('subagentsByParent 同引用视为一致', () => {
    const shared = { a: { entries: [{ id: 'x' }] } }
    expect(sameVisibleContent(snap({ subagentsByParent: shared }), snap({ subagentsByParent: { a: shared.a } }))).toBe(true)
  })
})

describe('makeListSetGate', () => {
  it('可见变化立即发布并带走最新投影', () => {
    vi.useFakeTimers()
    const published: SessionListSnapshotLike[] = []
    let current = snap()
    const gate = makeListSetGate({
      coalesceMs: 1000,
      getPublished: () => current,
      publish: (next) => { published.push(next); current = next },
    })
    gate.set(snap({ current: 'b' }))
    expect(published.length).toBe(1)
    expect(gate.counts.published).toBe(1)
    vi.useRealTimers()
  })

  it('仅投影变化被合并, 尾部 1s 补发最新值', () => {
    vi.useFakeTimers()
    const published: SessionListSnapshotLike[] = []
    let current = snap()
    const gate = makeListSetGate({
      coalesceMs: 1000,
      getPublished: () => current,
      publish: (next) => { published.push(next); current = next },
    })
    const projOnly1 = snap({ byId: { a: { id: 'a', displayTitle: 'A', running: true, updatedAt: 100, projectionValues: { t: 1 } }, b: current.byId?.b } })
    const projOnly2 = snap({ byId: { a: { id: 'a', displayTitle: 'A', running: true, updatedAt: 100, projectionValues: { t: 2 } }, b: current.byId?.b } })
    gate.set(projOnly1)
    gate.set(projOnly2)
    expect(published.length).toBe(0)
    expect(gate.counts.coalesced).toBe(2)
    vi.advanceTimersByTime(1000)
    expect(published.length).toBe(1)
    expect(published[0]).toBe(projOnly2)
    expect(gate.counts.flushed).toBe(1)
    vi.useRealTimers()
  })

  it('合并期间出现可见变化 -> 立即发布且挂起作废', () => {
    vi.useFakeTimers()
    const published: SessionListSnapshotLike[] = []
    let current = snap()
    const gate = makeListSetGate({
      coalesceMs: 1000,
      getPublished: () => current,
      publish: (next) => { published.push(next); current = next },
    })
    gate.set(snap({ byId: { a: { id: 'a', displayTitle: 'A', running: true, updatedAt: 100, projectionValues: { t: 1 } }, b: current.byId?.b } }))
    expect(published.length).toBe(0)
    gate.set(snap({ current: 'b' }))
    expect(published.length).toBe(1)
    vi.advanceTimersByTime(5000)
    expect(published.length).toBe(1) // 无重复补发
    vi.useRealTimers()
  })

  it('dispose 补发挂起快照, 之后退化为直发', () => {
    vi.useFakeTimers()
    const published: SessionListSnapshotLike[] = []
    let current = snap()
    const gate = makeListSetGate({
      coalesceMs: 1000,
      getPublished: () => current,
      publish: (next) => { published.push(next); current = next },
    })
    gate.set(snap({ byId: { a: { id: 'a', displayTitle: 'A', running: true, updatedAt: 100, projectionValues: { t: 1 } }, b: current.byId?.b } }))
    gate.dispose()
    expect(published.length).toBe(1)
    gate.set(snap({ byId: { a: { id: 'a', displayTitle: 'A', running: true, updatedAt: 100, projectionValues: { t: 9 } }, b: current.byId?.b } }))
    expect(published.length).toBe(2)
    vi.useRealTimers()
  })
})