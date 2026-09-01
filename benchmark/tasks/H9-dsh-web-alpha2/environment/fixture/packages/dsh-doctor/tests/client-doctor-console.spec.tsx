// @vitest-environment jsdom
/**
 * Recovery console component tests: semantic attributes, localized rendering,
 * the action buttons against the loopback API, the enable switch, and the
 * error boundary fallback + report path.
 */
import { afterEach, describe, expect, it, vi } from 'vitest'
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react'
import type { ReactNode } from 'react'
import { DoctorController } from '../src/client/doctor-controller.ts'
import { DoctorApi } from '../src/client/doctor-api.ts'
import { PassiveProbe } from '../src/client/doctor-passive.ts'
import { DoctorErrorBoundary, DoctorRecoveryConsole } from '../src/client/DoctorRecoveryConsole.tsx'
import type { DoctorSettingsHandle, DoctorSettingsState } from '../src/client/doctor-settings.ts'
import type { DoctorIncident, DoctorSupervisorResponse } from '../src/client/doctor-types.ts'
import type { TranslateNS } from '@deepseek-ai/dsh-client-ui-slots'
import { en } from '../src/client/locales.ts'

/** Interpolating t stub over the English dictionary (common keys pass through). */
const t: TranslateNS<'doctor'> = (key, params) => {
  let text = (en as Record<string, string>)[key] ?? key
  for (const [name, value] of Object.entries(params ?? {})) {
    text = text.replaceAll('{' + name + '}', String(value))
  }
  return text
}

/** A supervisor response carrying one armed snapshot with one incident. */
function supervisorBody(incidents: DoctorIncident[] = [
  { id: 'i1', kind: 'boot-failure', phase: 'opened', summary: 'boot failed', repairable: true },
]): DoctorSupervisorResponse {
  return {
    ok: true,
    hostVersion: '0.2.7',
    snapshot: {
      protocol: 1,
      phase: 'armed',
      version: '0.2.7',
      profiles: [{ identity: { id: 'web', name: 'web' }, phase: 'healthy', pid: 42, restartCount: 2, managed: true }],
      incidents,
      updatedAt: '2026-01-01T00:00:00Z',
    },
  }
}

/** Fake settings scope handle with cached state and listener notifies. */
class FakeSettingsHandle implements DoctorSettingsHandle {
  private cached: DoctorSettingsState
  private readonly listeners = new Set<() => void>()
  readonly setEnabled = vi.fn(async (enabled: boolean): Promise<{ ok: true } | { ok: false; error: string }> => {
    this.cached = { status: 'ready', enabled, writable: true }
    for (const listener of [...this.listeners]) listener()
    return { ok: true }
  })

  constructor(enabled = true) {
    this.cached = { status: 'ready', enabled, writable: true }
  }

  getState = (): DoctorSettingsState => {
    return this.cached
  }

  listen = (listener: () => void): () => void => {
    this.listeners.add(listener)
    return () => { this.listeners.delete(listener) }
  }
}

/** Build a controller wired to stubbed API methods. */
function makeController(body: unknown = supervisorBody()): {
  controller: DoctorController
  api: { status: ReturnType<typeof vi.fn>; action: ReturnType<typeof vi.fn>; reportClientFailure: ReturnType<typeof vi.fn> }
} {
  const api = {
    status: vi.fn(async () => ({ ok: true, value: body })),
    action: vi.fn(async () => ({ ok: true, value: supervisorBody() })),
    reportClientFailure: vi.fn(async () => ({ ok: true, value: supervisorBody() })),
  }
  const passive = new PassiveProbe({ notify: () => {}, now: () => 3000 })
  const controller = new DoctorController({ api: api as unknown as DoctorApi, passive })
  return { controller, api }
}

afterEach(() => {
  cleanup()
})

describe('DoctorRecoveryConsole', () => {
  it('renders the section with semantic attributes and localized copy', async () => {
    const { controller } = makeController()
    await controller.refresh()
    render(<DoctorRecoveryConsole t={t} controller={controller} settings={null} />)
    const root = screen.getByLabelText(t('settings.title')) as HTMLElement
    expect(root.getAttribute('data-dsh-plugin')).toBe('doctor')
    for (const part of ['header', 'status', 'incidents', 'probe', 'actions', 'enable']) {
      expect(root.querySelector('[data-dsh-part="' + part + '"]')).not.toBeNull()
    }
    expect(screen.getByText(t('status.title'))).toBeTruthy()
    expect(screen.getByText(t('host.available'))).toBeTruthy()
    expect(screen.getByText(t('phase.armed'))).toBeTruthy()
    expect(screen.getByText('web')).toBeTruthy()
    expect(screen.getByText(t('phase.healthy'))).toBeTruthy()
    expect(screen.getByText(t('incident.kind.boot-failure'))).toBeTruthy()
    expect(screen.getByText('boot failed')).toBeTruthy()
    expect(screen.getByText(t('probe.empty'))).toBeTruthy()
  })

  it('shows the host-offline hints when the host half is absent', async () => {
    const api = {
      status: vi.fn(async () => ({ ok: false, kind: 'not-available' as const })),
      action: vi.fn(async () => ({ ok: false, kind: 'not-available' as const })),
      reportClientFailure: vi.fn(async () => ({ ok: false, kind: 'not-available' as const })),
    }
    const passive = new PassiveProbe({ notify: () => {}, now: () => 1 })
    const offline = new DoctorController({ api: api as unknown as DoctorApi, passive })
    await offline.refresh()
    render(<DoctorRecoveryConsole t={t} controller={offline} settings={null} />)
    expect(screen.getByText(t('host.unavailable'))).toBeTruthy()
    expect(screen.getByText(t('host.unavailableHint'))).toBeTruthy()
    expect((screen.getByText(t('actions.diagnose')) as HTMLButtonElement).disabled).toBe(true)
    expect((screen.getByText(t('actions.refresh')) as HTMLButtonElement).disabled).toBe(true)
  })

  it('runs the diagnose action and renders the returned snapshot', async () => {
    const { controller, api } = makeController(supervisorBody([]))
    await controller.refresh()
    render(<DoctorRecoveryConsole t={t} controller={controller} settings={null} />)
    fireEvent.click(screen.getByText(t('actions.diagnose')))
    await waitFor(() => { expect(api.action).toHaveBeenCalledWith('diagnose', undefined) })
    await waitFor(() => { expect(screen.getByText(t('actions.completed'))).toBeTruthy() })
  })

  it('disables repair without a repairable incident and enables it with one', async () => {
    const clean = makeController(supervisorBody([]))
    await clean.controller.refresh()
    render(<DoctorRecoveryConsole t={t} controller={clean.controller} settings={null} />)
    expect((screen.getByText(t('actions.repair')) as HTMLButtonElement).disabled).toBe(true)
    cleanup()
    const broken = makeController(supervisorBody([{ id: 'i1', kind: 'boot-failure', phase: 'opened', summary: 'boot failed', repairable: true }]))
    await broken.controller.refresh()
    render(<DoctorRecoveryConsole t={t} controller={broken.controller} settings={null} />)
    expect((screen.getByText(t('actions.repair')) as HTMLButtonElement).disabled).toBe(false)
  })

  it('records a boundary-style incident and clears the probe list', async () => {
    const { controller } = makeController()
    await controller.refresh()
    controller.recordBoundary(new Error('subview died'))
    controller.syncProbe()
    render(<DoctorRecoveryConsole t={t} controller={controller} settings={null} />)
    expect(await screen.findByText(t('kind.react-boundary'))).toBeTruthy()
    const clearButton = screen.getByText(t('actions.clearProbe')) as HTMLButtonElement
    expect(clearButton.disabled).toBe(false)
    fireEvent.click(clearButton)
    expect(screen.getByText(t('probe.empty'))).toBeTruthy()
  })

  it('reports the newest probe incident to the supervisor', async () => {
    const { controller, api } = makeController()
    await controller.refresh()
    controller.recordBoundary(new Error('subview died'))
    controller.syncProbe()
    render(<DoctorRecoveryConsole t={t} controller={controller} settings={null} />)
    fireEvent.click(screen.getByText(t('actions.report')))
    await waitFor(() => { expect(api.reportClientFailure).toHaveBeenCalledTimes(1) })
    await waitFor(() => { expect(screen.getByText(t('actions.reported'))).toBeTruthy() })
  })

  it('toggles the enable switch through the settings handle', async () => {
    const { controller } = makeController()
    const settings = new FakeSettingsHandle(true)
    await controller.refresh()
    render(<DoctorRecoveryConsole t={t} controller={controller} settings={settings} />)
    const toggle = screen.getByTestId('doctor-enable-switch') as HTMLButtonElement
    expect(toggle.getAttribute('aria-checked')).toBe('true')
    fireEvent.click(toggle)
    await waitFor(() => { expect(settings.setEnabled).toHaveBeenCalledWith(false) })
    await waitFor(() => { expect(toggle.getAttribute('aria-checked')).toBe('false') })
  })

  it('shows the disabled hint while the switch is off', async () => {
    const { controller } = makeController()
    const settings = new FakeSettingsHandle(false)
    await controller.refresh()
    render(<DoctorRecoveryConsole t={t} controller={controller} settings={settings} />)
    expect(screen.getByText(t('host.disabledHint'))).toBeTruthy()
    expect(screen.getAllByText(t('enable.off')).length).toBeGreaterThanOrEqual(1)
  })

  it('disables the switch when the settings namespace is unavailable', async () => {
    const { controller } = makeController()
    await controller.refresh()
    render(<DoctorRecoveryConsole t={t} controller={controller} settings={null} />)
    const toggle = screen.getByTestId('doctor-enable-switch') as HTMLButtonElement
    expect(toggle.disabled).toBe(true)
    expect(screen.getByText(t('enable.unavailable'))).toBeTruthy()
  })

  it('renders the lifecycle card with version identity', async () => {
    const { controller } = makeController(supervisorBody())
    await controller.refresh()
    render(<DoctorRecoveryConsole t={t} controller={controller} settings={null} />)
    expect(screen.getByText(t('lifecycle.title'))).toBeTruthy()
    expect(screen.getByText(t('lifecycle.version', { supervisor: '0.2.7', web: '0.2.7' }))).toBeTruthy()
    expect(screen.getByTestId('doctor-uninstall-button')).toBeTruthy()
  })

  it('offers one-click install when the supervisor service is not provisioned', async () => {
    const api = {
      status: vi.fn(async () => ({ ok: false, kind: 'unprovisioned' as const, status: 503, code: 'SUPERVISOR_UNPROVISIONED', message: 'ENOENT' })),
      action: vi.fn(async () => ({ ok: true, value: supervisorBody() })),
      reportClientFailure: vi.fn(async () => ({ ok: false, kind: 'unprovisioned' as const })),
    }
    const passive = new PassiveProbe({ notify: () => {}, now: () => 1 })
    const offline = new DoctorController({ api: api as unknown as DoctorApi, passive })
    await offline.refresh()
    render(<DoctorRecoveryConsole t={t} controller={offline} settings={null} />)
    expect(screen.getByText(t('lifecycle.neverInstalled'))).toBeTruthy()
    expect(screen.getByText(t('api.unprovisioned'))).toBeTruthy()
    const install = screen.getByTestId('doctor-ensure-button') as HTMLButtonElement
    expect(install.textContent).toBe(t('lifecycle.install'))
    expect(screen.queryByTestId('doctor-uninstall-button')).toBeNull()
    fireEvent.click(install)
    await waitFor(() => { expect(api.action).toHaveBeenCalledWith('provision', undefined) })
  })

  it('offers repair when the service is installed but silent', async () => {
    const api = {
      status: vi.fn(async () => ({ ok: false, kind: 'supervisor-down' as const, status: 503, code: 'SUPERVISOR_DOWN', message: 'ECONNREFUSED' })),
      action: vi.fn(async () => ({ ok: true, value: supervisorBody() })),
      reportClientFailure: vi.fn(async () => ({ ok: false, kind: 'supervisor-down' as const })),
    }
    const passive = new PassiveProbe({ notify: () => {}, now: () => 1 })
    const offline = new DoctorController({ api: api as unknown as DoctorApi, passive })
    await offline.refresh()
    render(<DoctorRecoveryConsole t={t} controller={offline} settings={null} />)
    expect(screen.getByText(t('lifecycle.serviceDown'))).toBeTruthy()
    const install = screen.getByTestId('doctor-ensure-button') as HTMLButtonElement
    expect(install.textContent).toBe(t('lifecycle.repair'))
  })

  it('offers upgrade when supervisor and web versions differ', async () => {
    const api = {
      status: vi.fn(async () => ({ ok: true, value: { ...supervisorBody(), hostVersion: '0.2.9' } })),
      action: vi.fn(async () => ({ ok: true, value: { ...supervisorBody(), snapshot: { ...supervisorBody().snapshot!, version: '0.2.9' } } })),
      reportClientFailure: vi.fn(async () => ({ ok: false, kind: 'not-available' as const })),
    }
    const passive = new PassiveProbe({ notify: () => {}, now: () => 1 })
    const stale = new DoctorController({ api: api as unknown as DoctorApi, passive })
    await stale.refresh()
    render(<DoctorRecoveryConsole t={t} controller={stale} settings={null} />)
    expect(screen.getByText(t('lifecycle.versionMismatch', { supervisor: '0.2.7', web: '0.2.9' }))).toBeTruthy()
    const upgrade = screen.getByTestId('doctor-ensure-button') as HTMLButtonElement
    expect(upgrade.textContent).toBe(t('lifecycle.upgrade'))
    fireEvent.click(upgrade)
    await waitFor(() => { expect(api.action).toHaveBeenCalledWith('provision', undefined) })
  })

  it('uninstalls the rescue service from the lifecycle card', async () => {
    const { controller, api } = makeController()
    await controller.refresh()
    render(<DoctorRecoveryConsole t={t} controller={controller} settings={null} />)
    fireEvent.click(screen.getByTestId('doctor-uninstall-button'))
    await waitFor(() => { expect(api.action).toHaveBeenCalledWith('uninstall', undefined) })
  })
})

describe('DoctorErrorBoundary', () => {
  it('reports and renders the fallback, then recovers on retry', () => {
    const onReport = vi.fn()
    let boom = true
    const errorSpy = vi.spyOn(console, 'error').mockImplementation(() => {})
    try {
      render(
        <DoctorErrorBoundary t={t} onReport={onReport} onRecover={() => { boom = false }}>
          {() => <Bomb active={boom} />}
        </DoctorErrorBoundary>,
      )
      expect(onReport).toHaveBeenCalled()
      expect(screen.getByText(t('boundary.fallback'))).toBeTruthy()
      fireEvent.click(screen.getByText(t('boundary.retry')))
      expect(screen.getByText('recovered content')).toBeTruthy()
    } finally {
      errorSpy.mockRestore()
    }
  })

  it('renders children when nothing fails', () => {
    render(
      <DoctorErrorBoundary t={t} onReport={vi.fn()} onRecover={() => {}}>
        {() => <div>healthy content</div>}
      </DoctorErrorBoundary>,
    )
    expect(screen.getByText('healthy content')).toBeTruthy()
  })
})

/** Child that throws while active: the retry path renders recovered content. */
function Bomb({ active }: { active: boolean }): ReactNode {
  if (active) throw new Error('bomb render')
  return <span>recovered content</span>
}
