import { describe, expect, it } from 'vitest'
import { emptyState, openIncident, recordFailure, snapshotOf, upsertProfile } from '../src/agent/state.ts'

describe('supervisor state helpers', () => {
  it('upserts a profile once and keeps runtime facts stable', () => {
    const state = emptyState()
    const profile = upsertProfile(state, { id: 'a', dshHome: '/h', name: 'web', dshExecutable: '/d', role: 'protected' })
    expect(profile.phase).toBe('idle')
    const again = upsertProfile(state, { id: 'a', dshHome: '/h', name: 'web', dshExecutable: '/d', role: 'protected' })
    expect(again).toBe(profile)
    expect(Object.keys(state.profiles)).toEqual(['a'])
  })

  it('reuses the active incident per profile and records evidence', () => {
    const state = emptyState()
    const first = openIncident(state, 'p', 'process-crash', 'boom', ['a'], '2026-01-01T00:00:00Z')
    const second = openIncident(state, 'p', 'boot-failure', 'again', ['b'], '2026-01-01T00:00:01Z')
    expect(second.id).toBe(first.id)
    expect(second.evidence).toEqual(['a', 'b'])
    const recovered = openIncident(state, 'p', 'process-crash', 'x', [], '2026-01-01T00:00:02Z')
    expect(recovered.phase).toBe('opened')
    ;(recovered as { phase: string }).phase = 'recovered'
    const third = openIncident(state, 'p', 'process-crash', 'y', [], '2026-01-01T00:00:03Z')
    expect(third.id).not.toBe(first.id)
  })

  it('counts failures inside the window and drops older ones', () => {
    const state = emptyState()
    expect(recordFailure(state, 'p', '2026-01-01T00:00:00Z', 600_000)).toBe(1)
    expect(recordFailure(state, 'p', '2026-01-01T00:05:00Z', 600_000)).toBe(2)
    expect(recordFailure(state, 'p', '2026-01-01T00:10:30Z', 600_000)).toBe(2)
  })

  it('builds a JSON-safe snapshot', () => {
    const state = emptyState()
    state.phase = 'armed'
    upsertProfile(state, { id: 'a', dshHome: '/h', name: 'web', dshExecutable: '/d', role: 'protected' }).phase = 'healthy'
    const snap = snapshotOf(state, '0.2.7', '2026-01-01T00:00:00Z')
    expect(snap.phase).toBe('armed')
    expect(snap.version).toBe('0.2.7')
    expect(JSON.parse(JSON.stringify(snap)).protocol).toBe(1)
  })
})
