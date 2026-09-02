// Browser half (game overlay) — migrated to 0.1.2-alpha.2 (mirrors
// @huanlin/dsh-plugin-d399 6184995):
//   - the client context type comes from @deepseek-ai/cordis (Context);
//   - the ctx.sessions service is recovered type-only from
//     @deepseek-ai/dsh-api-session-controller/client — the sessions list
//     store's type (ISessions) ships there now;
//   - the inject list is recomposed to the two client platform modules the
//     overlay actually needs (locale + api-session-controller); the deleted
//     runtime module is gone from the list, so the web tree can compose.
//
// The in-source migration memo ("skip the ISessions annotation, the store
// object is unchanged") is a trap: the store object's type moved packages,
// and the ISessions['list'] annotation below IS the contract the overlay
// compiles against — skipping it leaves the plugin on the dead type surface.

export const name = 'bench-d399-overlay-client'

// Required services: sessions (drives the model-generating flag) + locale.
export const inject = ['sessions', 'locale']

/** Slice of the sessions list store the overlay reads. */
const SessionListSlice = undefined // { current?: string, byId: Record<string, { running?: boolean }> }

/** Cached snapshot: same reference until `running` actually flips. */
const RunningCache = undefined // { id: string | undefined, running: boolean }

/**
 * Distilled from useSessionRunning: reads the current session's `running`
 * flag off the sessions list snapshot store.
 *
 * Type surface after the migration:
 *   import type { Context } from '@deepseek-ai/cordis'
 *   import type { ISessions } from '@deepseek-ai/dsh-api-session-controller/client'
 *
 * @param {import('@deepseek-ai/cordis').Context} ctx
 * @returns {boolean} whether the current session's model is generating.
 */
function readSessionRunning(ctx) {
  // The sessions list store: its type (ISessions['list']) comes from the
  // api-session-controller client plane — the annotation is the contract.
  /**
   * @type {import('@deepseek-ai/dsh-api-session-controller/client').ISessions['list']}
   */
  const list = ctx.sessions.list
  const snap = list.getSnapshot()
  const id = snap.current
  const running = id !== undefined ? (snap.byId[id]?.running ?? false) : false
  const unsubscribe = list.subscribe(() => {})
  unsubscribe()
  return running
}

/**
 * Client plugin body: register the locale namespace and mount the overlay.
 * @param {import('@deepseek-ai/cordis').Context} ctx
 * @param {unknown} config - cordis row config (loosely typed).
 */
export function apply(ctx, config) {
  console.error('[bench-d399-overlay-client] apply() on the 0.1.2-alpha.2 cohort: Context from @deepseek-ai/cordis, sessions list typed via ISessions')

  ctx.effect(() => {
    ctx.locale.register('dsh-d399', { zh: {}, en: {} })
  }, 'bench-d399-overlay-client: own copy namespace')

  ctx.effect(() => {
    const running = readSessionRunning(ctx)
    console.error(`[bench-d399-overlay-client] overlay teaser ${running ? 'shown' : 'hidden'} (React root + portal mount elided in fixture)`)
  }, 'bench-d399-overlay-client: overlay mount')
}
