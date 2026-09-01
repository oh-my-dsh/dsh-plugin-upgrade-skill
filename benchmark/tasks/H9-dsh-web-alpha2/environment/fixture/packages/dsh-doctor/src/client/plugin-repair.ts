/**
 * Plugin-repair port for the dsh-doctor recovery console.
 *
 * Wraps the optional `'pluginManager'` cordis service (provided by the
 * dsh-plugin-manager client half) into the narrow seam the console needs: the
 * recorded plugin boot-failure ring and the next-start disable verb. The
 * service is resolved structurally (no value import, no inject dependency),
 * so a shell without the plugin manager degrades the row actions instead of
 * failing apply.
 * @module @linxin666/dsh-doctor/client
 */

/** One recorded plugin boot failure (the service's failure-ring slice). */
export interface PluginsFailureItem {
  pluginId: string
  message: string
  stack?: string
}

/** Settled disable outcome. */
export type PluginDisableResult = { ok: true } | { ok: false; message: string }

/** The narrow face the console drives. */
export interface PluginRepairPort {
  /** Read the recorded boot-failure ring (empty when the runtime keeps none). */
  failures(): Promise<PluginsFailureItem[]>
  /** Flip one plugin's next-start enablement (takes effect after restart). */
  disable(pluginId: string): Promise<PluginDisableResult>
}

/** Structural slice of the pluginManager service this port reads. */
interface PluginManagerSeam {
  failures?: () => Promise<{ items?: { pluginId?: unknown; message?: unknown; stack?: unknown }[] }>
  setEnabled?: (id: string, enabled: boolean) => Promise<unknown>
}

/**
 * Build the port over the raw `ctx.get('pluginManager')` value. Returns
 * undefined when the service is absent.
 * @param pluginManager - the raw service value (unknown by design).
 */
export function createPluginRepairPort(pluginManager: unknown): PluginRepairPort | undefined {
  if (pluginManager === undefined || pluginManager === null) return undefined
  const service = pluginManager as PluginManagerSeam
  if (typeof service.failures !== 'function' || typeof service.setEnabled !== 'function') return undefined
  return {
    failures: async (): Promise<PluginsFailureItem[]> => {
      try {
        const snapshot = await service.failures?.()
        const items = snapshot?.items ?? []
        const out: PluginsFailureItem[] = []
        for (const item of items) {
          const pluginId = typeof item?.pluginId === 'string' ? item.pluginId : ''
          if (pluginId === '') continue
          out.push({
            pluginId,
            message: typeof item.message === 'string' ? item.message : '',
            stack: typeof item.stack === 'string' ? item.stack : undefined,
          })
        }
        return out
      } catch {
        return []
      }
    },
    disable: async (pluginId: string): Promise<PluginDisableResult> => {
      try {
        await service.setEnabled?.(pluginId, false)
        return { ok: true }
      } catch (error) {
        return { ok: false, message: error instanceof Error ? error.message : String(error) }
      }
    },
  }
}
