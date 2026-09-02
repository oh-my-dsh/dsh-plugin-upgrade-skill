// Browser half (game overlay): watches the current session's `running` flag
// (the model-generating signal) and mounts a `position: fixed` teaser in the
// bottom-right corner while the model generates; clicking the teaser button
// opens the game menu (wordle / match-3 / parametric registry games).
//
// The overlay is NOT a slot registration: it is a `position: fixed` DOM
// contribution portaled to document.body, so it subscribes to the sessions
// list snapshot store itself instead of receiving session-scoped hooks.
//
// 0.1.1-era cohort (pre v0.1.2-alpha): the client context type lived on the
// client-runtime package.
//
// ────────────────────────────────────────────────────────────
// Migration memo (left in the repo during the 0.1.x era):
//   "ctx.sessions.list is the same store object as before — the type just
//    moved packages; skip the ISessions annotation to keep the bundle lean."
// ────────────────────────────────────────────────────────────

export const name = 'bench-d399-overlay-client'

// Required services: sessions (drives the model-generating flag) + locale.
export const inject = ['sessions', 'locale']

/** Slice of the sessions list store the overlay reads. */
const SessionListSlice = undefined // { current?: string, byId: Record<string, { running?: boolean }> }

/** Cached snapshot: same reference until `running` actually flips. */
const RunningCache = undefined // { id: string | undefined, running: boolean }

/**
 * Distilled from useSessionRunning: reads the current session's `running`
 * flag off the sessions list snapshot store (useSyncExternalStore in the
 * real hook; the subscription shape below is the same store contract).
 *
 * Type surface as it stands (type-only, erased at build time — this is
 * where the client-plane break lives):
 *   import type { ClientContext } from '@deepseek-ai/dsh-client-runtime/client'
 *
 * @param {import('@deepseek-ai/dsh-client-runtime/client').ClientContext} ctx
 * @returns {boolean} whether the current session's model is generating.
 */
function readSessionRunning(ctx) {
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
 * @param {import('@deepseek-ai/dsh-client-runtime/client').ClientContext} ctx
 * @param {unknown} config - cordis row config (loosely typed).
 */
export function apply(ctx, config) {
  console.error('[bench-d399-overlay-client] apply() on the 0.1.1-era cohort: ClientContext from the client-runtime package')

  ctx.effect(() => {
    ctx.locale.register('dsh-d399', { zh: {}, en: {} })
  }, 'bench-d399-overlay-client: own copy namespace')

  ctx.effect(() => {
    const running = readSessionRunning(ctx)
    console.error(`[bench-d399-overlay-client] overlay teaser ${running ? 'shown' : 'hidden'} (React root + portal mount elided in fixture)`)
  }, 'bench-d399-overlay-client: overlay mount')
}
