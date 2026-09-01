/**
 * Loopback API client tests against the real /api/doctor wire contract:
 * SupervisorResponse bodies, nested error objects, lenient row validation, the
 * failure taxonomy and request shapes. The client must never reject.
 */
import { describe, expect, it, vi } from 'vitest'
import {
  DoctorApi,
  parseSupervisorResponse,
  type DoctorHttpResponse,
} from '../src/client/doctor-api.ts'

function jsonResponse(status: number, body: unknown): DoctorHttpResponse {
  return {
    ok: status >= 200 && status < 300,
    status,
    json: async () => body,
    text: async () => JSON.stringify(body),
  }
}

function htmlResponse(): DoctorHttpResponse {
  return {
    ok: true,
    status: 200,
    json: async () => { throw new Error('not json') },
    text: async () => '<!doctype html><html>fallback</html>',
  }
}

function supervisorBody(overrides?: Record<string, unknown>): unknown {
  return {
    ok: true,
    snapshot: {
      protocol: 1,
      phase: 'armed',
      version: '0.2.7',
      profiles: [{ identity: { id: 'web', name: 'web' }, phase: 'healthy', managed: true }],
      incidents: [{ id: 'i1', kind: 'boot-failure', phase: 'opened', summary: 'boot failed', repairable: true }],
      updatedAt: '2026-01-01T00:00:00Z',
    },
    ...overrides,
  }
}

function apiWith(handler: (url: string, init?: { method?: string; headers?: Record<string, string>; body?: string }) => Promise<DoctorHttpResponse>): { api: DoctorApi; fetchSeam: ReturnType<typeof vi.fn> } {
  const fetchSeam = vi.fn(handler)
  return { api: new DoctorApi({ fetch: fetchSeam, base: 'http://loopback.test' }), fetchSeam }
}

describe('parseSupervisorResponse', () => {
  it('accepts an ok response with a snapshot', () => {
    const parsed = parseSupervisorResponse(supervisorBody())
    expect(parsed?.ok).toBe(true)
    expect(parsed?.snapshot?.phase).toBe('armed')
    expect(parsed?.snapshot?.profiles).toHaveLength(1)
    expect(parsed?.snapshot?.incidents).toHaveLength(1)
  })

  it('rejects bodies without an ok flag', () => {
    expect(parseSupervisorResponse({ snapshot: {} })).toBeUndefined()
    expect(parseSupervisorResponse(null)).toBeUndefined()
    expect(parseSupervisorResponse([1])).toBeUndefined()
  })

  it('reads the host version envelope field', () => {
    const parsed = parseSupervisorResponse({ ok: true, snapshot: {}, hostVersion: '1.2.3' })
    expect(parsed?.hostVersion).toBe('1.2.3')
    expect(parseSupervisorResponse({ ok: true, snapshot: {}, hostVersion: 4 })?.hostVersion).toBeUndefined()
  })

  it('preserves the business error', () => {
    const parsed = parseSupervisorResponse({ ok: false, error: { code: 'SUPERVISOR_DOWN', message: 'socket gone' } })
    expect(parsed?.ok).toBe(false)
    expect(parsed?.error?.message).toBe('socket gone')
  })

  it('drops malformed incident and profile rows', () => {
    const parsed = parseSupervisorResponse({
      ok: true,
      snapshot: {
        phase: 'degraded',
        profiles: [{ identity: { id: 'x' }, phase: 'weird-phase' }, { identity: { id: 'y' }, phase: 'failed' }],
        incidents: [{ id: 'good', kind: 'boot-failure', phase: 'opened', summary: 's' }, { id: 'bad', kind: 'nope', phase: 'opened', summary: 's' }],
      },
    })
    expect(parsed?.snapshot?.profiles).toHaveLength(1)
    expect(parsed?.snapshot?.incidents).toHaveLength(1)
  })
})

describe('DoctorApi.status', () => {
  it('returns the parsed snapshot', async () => {
    const { api } = apiWith(async () => jsonResponse(200, supervisorBody()))
    const result = await api.status()
    expect(result.ok).toBe(true)
    if (result.ok) {
      expect(result.value.snapshot?.phase).toBe('armed')
    }
  })

  it('maps 403 to loopback refusal', async () => {
    const { api } = apiWith(async () => jsonResponse(403, {}))
    const result = await api.status()
    expect(result).toMatchObject({ ok: false, kind: 'loopback', status: 403 })
  })

  it('maps 404 to not-available (host half disabled)', async () => {
    const { api } = apiWith(async () => jsonResponse(404, {}))
    const result = await api.status()
    expect(result).toMatchObject({ ok: false, kind: 'not-available', status: 404 })
  })

  it('maps 503 SUPERVISOR_UNPROVISIONED to the service kind with its code', async () => {
    const { api } = apiWith(async () => jsonResponse(503, { ok: false, error: { code: 'SUPERVISOR_UNPROVISIONED', message: 'ENOENT token' } }))
    const result = await api.status()
    expect(result).toMatchObject({ ok: false, kind: 'unprovisioned', status: 503, code: 'SUPERVISOR_UNPROVISIONED' })
    expect(result).toMatchObject({ message: 'ENOENT token' })
  })

  it('maps 503 SUPERVISOR_DOWN to the supervisor-down kind', async () => {
    const { api } = apiWith(async () => jsonResponse(503, { ok: false, error: { code: 'SUPERVISOR_DOWN', message: 'ECONNREFUSED' } }))
    const result = await api.status()
    expect(result).toMatchObject({ ok: false, kind: 'supervisor-down', code: 'SUPERVISOR_DOWN' })
  })

  it('degrades an unexpected 503 body to http', async () => {
    const { api } = apiWith(async () => jsonResponse(503, {}) )
    const result = await api.status()
    expect(result).toMatchObject({ ok: false, kind: 'http', status: 503 })
  })

  it('carries the host version from the envelope', async () => {
    const { api } = apiWith(async () => jsonResponse(200, supervisorBody({ hostVersion: '9.9.9' })))
    const result = await api.status()
    expect(result.ok).toBe(true)
    if (result.ok) expect(result.value.hostVersion).toBe('9.9.9')
  })

  it('maps a 200 HTML fallback to not-available', async () => {
    const { api } = apiWith(async () => htmlResponse())
    const result = await api.status()
    expect(result).toMatchObject({ ok: false, kind: 'not-available' })
  })

  it('maps a 500 nested error body to http with the message', async () => {
    const { api } = apiWith(async () => jsonResponse(500, { ok: false, error: { code: 'DOCTOR_ROUTE_FAILED', message: 'socket refused' } }))
    const result = await api.status()
    expect(result).toMatchObject({ ok: false, kind: 'http', status: 500, message: 'socket refused' })
  })

  it('maps a business ok:false verdict to supervisor', async () => {
    const { api } = apiWith(async () => jsonResponse(200, { ok: false, error: { code: 'X', message: 'supervisor says no' } }))
    const result = await api.status()
    expect(result).toMatchObject({ ok: false, kind: 'supervisor', message: 'supervisor says no' })
  })

  it('maps a malformed JSON shape to malformed', async () => {
    const { api } = apiWith(async () => jsonResponse(200, { nope: true }))
    const result = await api.status()
    expect(result).toMatchObject({ ok: false, kind: 'malformed' })
  })

  it('maps a network rejection to network and never rejects', async () => {
    const { api } = apiWith(async () => { throw new Error('dns down') })
    const result = await api.status()
    expect(result).toMatchObject({ ok: false, kind: 'network', message: 'dns down' })
  })

  it('uses the configured base prefix', async () => {
    const { api, fetchSeam } = apiWith(async () => jsonResponse(200, supervisorBody()))
    await api.status()
    expect(String(fetchSeam.mock.calls[0]![0])).toBe('http://loopback.test/status')
  })

  it('defaults the base to the loopback /api/doctor prefix', async () => {
    const fetchSeam = vi.fn(async (_url: string) => jsonResponse(200, supervisorBody()))
    const api = new DoctorApi({ fetch: fetchSeam })
    const result = await api.status()
    expect(result.ok).toBe(true)
    expect(String(fetchSeam.mock.calls[0]![0])).toBe('/api/doctor/status')
  })
})

describe('DoctorApi.action', () => {
  it('POSTs the action to /action and merges selection fields', async () => {
    const { api, fetchSeam } = apiWith(async () => jsonResponse(200, supervisorBody()))
    const result = await api.action('repair', { incidentId: 'i9', profileId: 'web' })
    expect(result.ok).toBe(true)
    const call = fetchSeam.mock.calls[0]!
    expect(String(call[0])).toBe('http://loopback.test/action')
    expect(call[1]).toMatchObject({ method: 'POST' })
    expect(JSON.parse(call[1]!.body!)).toEqual({ action: 'repair', incidentId: 'i9', profileId: 'web' })
  })

  it('omits absent selection fields', async () => {
    const { api, fetchSeam } = apiWith(async () => jsonResponse(200, supervisorBody()))
    await api.action('diagnose')
    expect(JSON.parse(fetchSeam.mock.calls[0]![1]!.body!)).toEqual({ action: 'diagnose' })
  })
})

describe('DoctorApi.reportClientFailure', () => {
  it('POSTs the normalized failure and truncates long payloads', async () => {
    const { api, fetchSeam } = apiWith(async () => jsonResponse(200, supervisorBody()))
    const result = await api.reportClientFailure({ message: 'm'.repeat(5000), stack: 's'.repeat(20_000), phase: 'recovery-console' })
    expect(result.ok).toBe(true)
    const call = fetchSeam.mock.calls[0]!
    expect(String(call[0])).toBe('http://loopback.test/client-failure')
    const body = JSON.parse(call[1]!.body!) as Record<string, string>
    expect(body['message']!.length).toBeLessThanOrEqual(4096)
    expect(body['stack']!.length).toBeLessThanOrEqual(16_384)
    expect(body['phase']).toBe('recovery-console')
  })
})
