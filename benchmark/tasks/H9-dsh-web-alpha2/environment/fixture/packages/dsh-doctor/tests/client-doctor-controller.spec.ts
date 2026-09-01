/**
 * Controller tests: refresh/action/report/clear/boundary/connection-reset verbs,
 * store subscription semantics and the fail-open contract. The controller must
 * never reject, even when the API does.
 */
import { describe, expect, it, vi } from 'vitest'
import { DoctorController, describeApiFailure, initialDoctorView } from '../src/client/doctor-controller.ts'
import { DoctorApi, type DoctorApiResult } from '../src/client/doctor-api.ts'
import { PassiveProbe } from '../src/client/doctor-passive.ts'
import type { DoctorSupervisorResponse } from '../src/client/doctor-types.ts'

type StubApi = {
  status: ReturnType<typeof vi.fn>
  action: ReturnType<typeof vi.fn>
  reportClientFailure: ReturnType<typeof vi.fn>
}

function supervisorResponse(overrides?: Partial<DoctorSupervisorResponse['snapshot']>): DoctorSupervisorResponse {
  return {
    ok: true,
    snapshot: {
      protocol: 1,
      phase: overrides?.phase ?? 'armed',
      version: '0.2.7',
      profiles: [{ identity: { id: 'web', name: 'web' }, phase: 'healthy', managed: true }],
      incidents: [{ id: 'i1', profileId: 'web', kind: 'boot-failure', phase: 'opened', summary: 'boot failed', repairable: true }],
      updatedAt: '2026-01-01T00:00:00Z',
    },
  }
}

function stubApi(overrides?: Partial<StubApi>): StubApi {
  return {
    status: vi.fn(async () => ({ ok: true, value: supervisorResponse() })),
    action: vi.fn(async () => ({ ok: true, value: supervisorResponse() })),
    reportClientFailure: vi.fn(async () => ({ ok: true, value: supervisorResponse() })),
    ...overrides,
  }
}

function makeController(api: StubApi, now = (): number => 1000): DoctorController {
  return new DoctorController({ api: api as unknown as DoctorApi, passive: new PassiveProbe({ notify: () => {}, now }), now })
}

const notAvailable = { ok: false, kind: 'not-available' as const }

describe('DoctorController.refresh', () => {
  it('merges the supervisor snapshot', async () => {
    const api = stubApi()
    const controller = makeController(api)
    await controller.refresh()
    const view = controller.getSnapshot()
    expect(view.host).toBe('available')
    expect(view.snapshot?.phase).toBe('armed')
    expect(view.profiles).toHaveLength(1)
    expect(view.incidents).toHaveLength(1)
    expect(view.lastCheckedAt).toBe(1000)
    expect(view.lastError).toBeUndefined()
  })

  it('degrades to host unavailable when the endpoint fails', async () => {
    const api = stubApi({ status: vi.fn(async () => notAvailable) })
    const controller = makeController(api)
    await controller.refresh()
    const view = controller.getSnapshot()
    expect(view.host).toBe('unavailable')
    expect(view.lastError).toBe('endpoint unavailable')
    expect(view.lastErrorCode).toBeUndefined()
    expect(view.phase).toBe('ready')
  })

  it('records the service failure code and clears the host version', async () => {
    const api = stubApi({ status: vi.fn(async () => ({ ok: false, kind: 'unprovisioned' as const, status: 503, code: 'SUPERVISOR_UNPROVISIONED', message: 'ENOENT token' })) })
    const controller = makeController(api)
    await controller.refresh()
    const view = controller.getSnapshot()
    expect(view.host).toBe('unavailable')
    expect(view.lastErrorCode).toBe('SUPERVISOR_UNPROVISIONED')
    expect(view.hostVersion).toBeUndefined()
  })

  it('carries the host version on success', async () => {
    const api = stubApi({ status: vi.fn(async () => ({ ok: true, value: { ...supervisorResponse(), hostVersion: '9.9.9' } })) })
    const controller = makeController(api)
    await controller.refresh()
    const view = controller.getSnapshot()
    expect(view.host).toBe('available')
    expect(view.hostVersion).toBe('9.9.9')
    expect(view.lastErrorCode).toBeUndefined()
  })

  it('never rejects even when the API rejects', async () => {
    const api = stubApi({ status: vi.fn(async () => { throw new Error('kaboom') }) })
    const controller = makeController(api)
    await expect(controller.refresh()).resolves.toBeUndefined()
    expect(controller.getSnapshot().host).toBe('unavailable')
  })
})

describe('DoctorController actions', () => {
  it('runs diagnose and merges the returned snapshot', async () => {
    const api = stubApi({ action: vi.fn(async () => ({ ok: true, value: supervisorResponse({ phase: 'degraded' }) })) })
    const controller = makeController(api)
    await controller.runDiagnose()
    expect(api.action).toHaveBeenCalledWith('diagnose', undefined)
    const view = controller.getSnapshot()
    expect(view.snapshot?.phase).toBe('degraded')
    expect(view.action).toEqual({ ok: true, kind: 'completed' })
  })

  it('repairs the first repairable incident', async () => {
    const api = stubApi()
    const controller = makeController(api)
    await controller.refresh()
    await controller.runRepair()
    expect(api.action).toHaveBeenCalledWith('repair', { incidentId: 'i1', profileId: 'web' })
  })

  it('refuses repair without a repairable incident', async () => {
    const api = stubApi()
    const controller = makeController(api)
    await controller.refresh()
    // Replace the incident list with one that is already settled.
    controller.store.set({ snapshot: undefined, profiles: [], incidents: [{ id: 'i2', kind: 'process-crash', phase: 'recovered', summary: 'ok' }] })
    await controller.runRepair()
    expect(api.action).not.toHaveBeenCalled()
    expect(controller.getSnapshot().action).toMatchObject({ ok: false })
  })

  it('records an action failure without throwing', async () => {
    const api = stubApi({ action: vi.fn(async () => ({ ok: false, kind: 'supervisor' as const, message: 'supervisor refuses' })) })
    const controller = makeController(api)
    await controller.runDiagnose()
    expect(controller.getSnapshot().action).toMatchObject({ ok: false, message: 'supervisor refuses' })
  })

  it('runs the lifecycle provision verb through the action API', async () => {
    const api = stubApi({ action: vi.fn(async () => ({ ok: true, value: { ...supervisorResponse({ phase: 'armed' }), hostVersion: '9.9.9' } })) })
    const controller = makeController(api)
    await controller.runProvision()
    expect(api.action).toHaveBeenCalledWith('provision', undefined)
    const view = controller.getSnapshot()
    expect(view.snapshot?.phase).toBe('armed')
    expect(view.hostVersion).toBe('9.9.9')
    expect(view.action).toEqual({ ok: true, kind: 'completed' })
  })

  it('runs the lifecycle uninstall verb through the action API', async () => {
    const api = stubApi()
    const controller = makeController(api)
    await controller.runUninstall()
    expect(api.action).toHaveBeenCalledWith('uninstall', undefined)
  })

  it('guards against overlapping actions', async () => {
    let release: (value: DoctorApiResult<DoctorSupervisorResponse>) => void = () => {}
    const gate = new Promise<DoctorApiResult<DoctorSupervisorResponse>>(resolve => { release = resolve as (value: DoctorApiResult<DoctorSupervisorResponse>) => void })
    const api = stubApi({ action: vi.fn(async () => gate) })
    const controller = makeController(api)
    const first = controller.runDiagnose()
    await controller.runDiagnose()
    expect(api.action).toHaveBeenCalledTimes(1)
    release({ ok: true, value: supervisorResponse() })
    await first
  })
})

describe('DoctorController probe reporting', () => {
  it('reports the newest passive incident to the supervisor', async () => {
    const api = stubApi()
    const controller = makeController(api)
    controller.recordBoundary(new Error('subview failed'))
    await controller.reportProbe()
    expect(api.reportClientFailure).toHaveBeenCalledWith({
      message: 'subview failed',
      stack: expect.any(String),
      phase: 'recovery-console:react-boundary',
    })
    expect(controller.getSnapshot().action).toEqual({ ok: true, kind: 'reported' })
  })

  it('refuses to report an empty probe list', async () => {
    const api = stubApi()
    const controller = makeController(api)
    await controller.reportProbe()
    expect(api.reportClientFailure).not.toHaveBeenCalled()
    expect(controller.getSnapshot().action).toMatchObject({ ok: false })
  })
})

describe('DoctorController signals', () => {
  it('records a boundary catch into the probe list', () => {
    const controller = makeController(stubApi())
    controller.recordBoundary(new Error('render fail'))
    const probe = controller.getSnapshot().probe
    expect(probe).toHaveLength(1)
    expect(probe[0]!.kind).toBe('react-boundary')
    expect(probe[0]!.message).toContain('render fail')
  })

  it('records a connection reset and refreshes', async () => {
    const api = stubApi()
    const controller = makeController(api)
    const before = api.status.mock.calls.length
    controller.noteConnectionReset()
    await vi.waitFor(() => { expect(api.status.mock.calls.length).toBeGreaterThan(before) })
    const view = controller.getSnapshot()
    expect(view.bootSignals).toHaveLength(1)
    expect(view.bootSignals[0]).toEqual({ kind: 'connection-reset', at: 1000 })
    expect(view.probe.some(incident => incident.kind === 'connection-reset')).toBe(true)
  })

  it('caps the boot signal ring', () => {
    const controller = makeController(stubApi())
    for (let index = 0; index < 12; index += 1) controller.noteConnectionReset()
    expect(controller.getSnapshot().bootSignals).toHaveLength(8)
  })

  it('clears the passive probe list', () => {
    const controller = makeController(stubApi())
    controller.recordBoundary(new Error('x'))
    expect(controller.getSnapshot().probe).toHaveLength(1)
    controller.clearProbe()
    expect(controller.getSnapshot().probe).toHaveLength(0)
  })
})

describe('DoctorController store', () => {
  it('notifies subscribers on refresh and keeps immutable snapshots', async () => {
    const api = stubApi()
    const controller = makeController(api)
    const listener = vi.fn()
    const unsubscribe = controller.subscribe(listener)
    const before = controller.getSnapshot()
    await controller.refresh()
    expect(listener).toHaveBeenCalled()
    expect(controller.getSnapshot()).not.toBe(before)
    unsubscribe()
    const count = listener.mock.calls.length
    await controller.refresh()
    expect(listener.mock.calls.length).toBe(count)
  })

  it('contains an initial view with no host facts', () => {
    const initial = initialDoctorView()
    expect(initial.host).toBe('unknown')
    expect(initial.phase).toBe('idle')
  })
})

describe('DoctorController.start', () => {
  it('refreshes immediately and schedules the loop', () => {
    const api = stubApi()
    const scheduled: (() => void)[] = []
    const timers = {
      set: vi.fn((callback: () => void) => { scheduled.push(callback); return scheduled.length }),
      clear: vi.fn(),
    }
    const controller = new DoctorController({
      api: api as unknown as DoctorApi,
      passive: new PassiveProbe({ notify: () => {}, now: () => 1 }),
      intervalMs: 5000,
      timers,
    })
    const dispose = controller.start()
    expect(timers.set).toHaveBeenCalledWith(expect.any(Function), 5000)
    expect(api.status).toHaveBeenCalled()
    dispose()
    expect(timers.clear).toHaveBeenCalled()
  })

  it('keeps polling so the interval callback refreshes', async () => {
    const api = stubApi()
    const scheduled: (() => void)[] = []
    const timers = {
      set: vi.fn((callback: () => void) => { scheduled.push(callback); return scheduled.length }),
      clear: vi.fn(),
    }
    const controller = new DoctorController({
      api: api as unknown as DoctorApi,
      passive: new PassiveProbe({ notify: () => {}, now: () => 2 }),
      intervalMs: 5000,
      timers,
    })
    controller.start()
    await scheduled[0]!()
    expect(api.status.mock.calls.length).toBeGreaterThan(1)
  })
})

describe('describeApiFailure', () => {
  it('prefers the host message', () => {
    expect(describeApiFailure({ ok: false, kind: 'network', message: 'cable out' })).toBe('cable out')
  })

  it('maps every kind', () => {
    expect(describeApiFailure({ ok: false, kind: 'loopback' })).toBe('loopback only')
    expect(describeApiFailure({ ok: false, kind: 'not-available' })).toBe('endpoint unavailable')
    expect(describeApiFailure({ ok: false, kind: 'malformed' })).toBe('malformed response')
    expect(describeApiFailure({ ok: false, kind: 'http', status: 502 })).toBe('HTTP 502')
    expect(describeApiFailure({ ok: false, kind: 'supervisor' })).toBe('supervisor refused')
  })
})
