// Browser half (settings-plugins card): registers the interpreters card into
// the shell-declared `settings.plugin.item` slot and converges on pushed
// connection resets instead of polling.
//
// ────────────────────────────────────────────────────────────
// Migration memo (left in the repo during the 0.1.1 era):
//   "SettingsProvider is just an alias of the old Settings type — keep the
//    old name. And the snapshot store still ships in dsh-client-runtime on
//    alpha (deprecated but present), so the runtime peer stays."
// ────────────────────────────────────────────────────────────
//
// 0.1.1-era type surface: the client context type comes from the client
// runtime package; the snapshot store ships with it.

// The persisted snapshot store behind the card. 0.1.1-era source (real
// import shape):
//
//   import { createSnapshotStore, type SnapshotStore } from '@deepseek-ai/dsh-client-runtime/client'
//
/**
 * @type {import('@deepseek-ai/dsh-client-runtime/client').SnapshotStore<Record<string, unknown>>}
 */
let store

const NS = 'interpreters'

// Card copy, distilled from the real locales module.
const zh = { heading: '解释器路径', pythonPath: 'Python 路径', nodePath: 'Node 路径' }
const en = { heading: 'Interpreter paths', pythonPath: 'Python path', nodePath: 'Node path' }

export const name = 'bench-interpreters-card-client'

// slots (settings.plugin.item card) + locale (card copy) + connection
// (pushed invalidations converge the open surface).
export const inject = ['slots', 'locale', 'connection']

// The card component (interpreter path inputs + timeout) is elided; the slot
// renderer mounts it as a function component.
function cardStub() {
  return null
}

/**
 * Register the interpreters card and wire its store to the connection.
 * @param {import('@deepseek-ai/dsh-client-runtime/client').ClientContext} ctx
 */
export function apply(ctx) {
  ctx.effect(() => ctx.locale.register(NS, { zh, en }), 'bench-interpreters-card: dictionaries')

  // The card's store reads/writes the interpreters config over the plugin's
  // self-hosted HTTP route (`/interpreters/api/get` + `/interpreters/api/set`),
  // built on the snapshot store above. Body elided.

  // Pushed invalidations converge the open surface without polling: the dsh
  // client Events vocabulary has no `settings/changed` host passthrough, so
  // convergence rides `connection/reset` — a burst of resets coalesces into
  // a single refetch via the microtask debounce. (Real effect shape.)
  ctx.effect(() => {
    let pending = false
    const refresh = () => {
      if (pending) return
      pending = true
      queueMicrotask(() => {
        pending = false
        // refreshIfLoaded(controller) — elided
      })
    }
    const disposers = [ctx.on('connection/reset', refresh)]
    return () => { for (const dispose of disposers) dispose() }
  }, 'bench-interpreters-card: pushed invalidations')

  // The card registers into the plugin-config page's card slot with the
  // upstream card shape — generator + `yield`, `locale: NS`, and an inject
  // face carrying only the business surface (elided).
  ctx.slots.inject('settings.plugin.item', function* () {
    yield ctx.slots.register({
      name: 'settings.plugin.item',
      key: NS,
      locale: NS,
      inject: () => ({}),
    }, cardStub)
  })
}
