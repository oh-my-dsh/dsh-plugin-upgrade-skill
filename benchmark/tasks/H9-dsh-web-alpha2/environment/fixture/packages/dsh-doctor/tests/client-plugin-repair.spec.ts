/**
 * Plugin-repair port tests: structural service acquisition, the failure-ring
 * mapping, the disable verb, and the controller integration (ring refresh and
 * disable outcomes).
 */
import { describe, expect, it, vi } from 'vitest'
import { DoctorController } from '../src/client/doctor-controller.ts'
import { DoctorApi } from '../src/client/doctor-api.ts'
import { PassiveProbe } from '../src/client/doctor-passive.ts'
import { createPluginRepairPort } from '../src/client/plugin-repair.ts'

function stubControllerApi(): DoctorApi {
  return { status: vi.fn(async () => ({ ok: false, kind: 'not-available' as const })) } as unknown as DoctorApi
}

describe('createPluginRepairPort', () => {
  it('is undefined without the plugin manager service', () => {
    expect(createPluginRepairPort(undefined)).toBeUndefined()
    expect(createPluginRepairPort(null)).toBeUndefined()
    expect(createPluginRepairPort({ list: () => {} })).toBeUndefined()
  })

  it('maps the failure ring and filters malformed rows', async () => {
    const port = createPluginRepairPort({
      failures: async () => ({
        items: [
          { pluginId: 'qa-a', message: 'boom-a', stack: 'stack-a' },
          { pluginId: '', message: 'ignored' },
          { pluginId: 'qa-b', message: 'boom-b' },
        ],
      }),
      setEnabled: vi.fn(async () => ({})),
    })!
    expect(await port.failures()).toEqual([
      { pluginId: 'qa-a', message: 'boom-a', stack: 'stack-a' },
      { pluginId: 'qa-b', message: 'boom-b', stack: undefined },
    ])
  })

  it('degrades to an empty ring when the service throws', async () => {
    const port = createPluginRepairPort({
      failures: async () => { throw new Error('ring gone') },
      setEnabled: vi.fn(async () => ({})),
    })!
    expect(await port.failures()).toEqual([])
  })

  it('delegates disable and reports failures without throwing', async () => {
    const setEnabled = vi.fn(async () => ({ enabled: false }))
    const port = createPluginRepairPort({ failures: async () => ({ items: [] }), setEnabled })!
    expect(await port.disable('qa-a')).toEqual({ ok: true })
    expect(setEnabled).toHaveBeenCalledWith('qa-a', false)
    const broken = createPluginRepairPort({
      failures: async () => ({ items: [] }),
      setEnabled: vi.fn(async () => { throw new Error('write refused') }),
    })!
    expect(await broken.disable('qa-a')).toMatchObject({ ok: false, message: 'write refused' })
  })
})

describe('DoctorController plugin repair integration', () => {
  it('merges the failure ring into the view', async () => {
    const controller = new DoctorController({
      api: stubControllerApi(),
      passive: new PassiveProbe({ notify: () => {} }),
      pluginRepair: createPluginRepairPort({
        failures: async () => ({ items: [{ pluginId: 'qa-a', message: 'm', stack: 's' }] }),
        setEnabled: vi.fn(async () => ({})),
      }),
    })
    await controller.refreshPluginFailures()
    expect(controller.getSnapshot().pluginFailures).toEqual([{ pluginId: 'qa-a', message: 'm', stack: 's' }])
    await controller.refreshPluginFailures()
    expect(controller.getSnapshot().pluginFailures).toHaveLength(1)
  })

  it('records disable outcomes and falls back without a port', async () => {
    const controller = new DoctorController({
      api: stubControllerApi(),
      passive: new PassiveProbe({ notify: () => {} }),
      pluginRepair: createPluginRepairPort({
        failures: async () => ({ items: [] }),
        setEnabled: vi.fn(async () => ({ enabled: false })),
      }),
    })
    expect(await controller.disablePlugin('qa-a')).toEqual({ ok: true })
    expect(controller.getSnapshot().action).toEqual({ ok: true, kind: 'disabled', id: 'qa-a' })

    const denied = new DoctorController({
      api: stubControllerApi(),
      passive: new PassiveProbe({ notify: () => {} }),
      pluginRepair: createPluginRepairPort({
        failures: async () => ({ items: [] }),
        setEnabled: vi.fn(async () => { throw new Error('denied') }),
      }),
    })
    expect(await denied.disablePlugin('qa-a')).toMatchObject({ ok: false, message: 'denied' })

    const noPort = new DoctorController({ api: stubControllerApi(), passive: new PassiveProbe({ notify: () => {} }) })
    expect(await noPort.disablePlugin('qa-a')).toMatchObject({ ok: false, message: 'plugin manager unavailable' })
    expect(await noPort.disablePlugin('  ')).toMatchObject({ ok: false })
  })

  it('calls the failure ring from refresh without blocking', async () => {
    const failures = vi.fn(async () => ({ items: [{ pluginId: 'qa-a', message: 'm' }] }))
    const controller = new DoctorController({
      api: stubControllerApi(),
      passive: new PassiveProbe({ notify: () => {} }),
      pluginRepair: createPluginRepairPort({ failures, setEnabled: vi.fn(async () => ({})) }),
    })
    await controller.refresh()
    expect(failures).toHaveBeenCalled()
  })
})
