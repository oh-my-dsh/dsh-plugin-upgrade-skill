// Browser half (settings-plugins card) — migrated to 0.1.2-alpha.2 (mirrors
// @huanlin/dsh-plugin-interpreters 6e3d2d2):
//   - createSnapshotStore / SnapshotStore moved from the deleted client
//     runtime package to @deepseek-ai/dsh-client-store (the in-source memo
//     claiming the store "still ships in the runtime on alpha (deprecated
//     but present)" is a trap — the package is gone);
//   - the client context type comes from @deepseek-ai/cordis (Context) with
//     type-only merges; ctx.slots is provided by ui-renderer since the split;
//   - the dsh-settings type was renamed Settings -> SettingsProvider (API
//     unchanged) — the host half's bridge annotation is repointed.

export const name = 'bench-interpreters-card-client'

// slots (settings.plugin.item card) + locale (card copy) + connection
// (pushed invalidations converge the open surface).
export const inject = ['slots', 'locale', 'connection']

// Type-level Context merges (erased at build; values arrive via injection):
//
//   import type { Context as ClientContext } from '@deepseek-ai/cordis'
//   // pulls the client connection Context merge (ctx.connection) and the
//   // `connection/reset` event type (used for pushed invalidations):
//   import type {} from '@deepseek-ai/dsh-client-connection/client'
//   // pulls the locale plugin's Context merge (ctx.locale):
//   import type {} from '@deepseek-ai/dsh-client-locale/client'
//   // pulls the ui-renderer's Context merge (ctx.slots, the SlotRegistry
//   // the apply body registers through — its home since the split):
//   import type {} from '@deepseek-ai/dsh-client-ui-renderer/client'
//   // pulls the `settings.plugin.item` SlotMap entry so the slots.inject
//   // call matches the section's slot declaration:
//   import type {} from '@deepseek-ai/dsh-client-ui-settings-plugins/client'
//
// The snapshot store's new source (real import shape after the split):
//
//   import { createSnapshotStore, type SnapshotStore } from '@deepseek-ai/dsh-client-store'
//
/**
 * @type {import('@deepseek-ai/dsh-client-store').SnapshotStore<Record<string, unknown>>}
 */
let store

// Type-level locale namespace declaration (mirrors the real POST's module
// augmentation):
//
//   declare module '@deepseek-ai/dsh-client-ui-slots' {
//     interface LocaleNamespaceMap {
//       'interpreters': import('./locales.ts').InterpretersKey
//     }
//   }

const NS = 'interpreters'

// Card copy, distilled from the real locales module (unchanged across the
// migration — registered through the two-arg ctx.locale.register call).
const zh = { heading: '解释器路径', pythonPath: 'Python 路径', nodePath: 'Node 路径' }
const en = { heading: 'Interpreter paths', pythonPath: 'Python path', nodePath: 'Node path' }

// The card component (interpreter path inputs + timeout) is elided; the slot
// renderer mounts it as a function component.
function cardStub() {
  return null
}

/**
 * Register the interpreters card and wire its store to the connection.
 * @param {import('@deepseek-ai/cordis').Context} ctx
 */
export function apply(ctx) {
  ctx.effect(() => ctx.locale.register(NS, { zh, en }), 'bench-interpreters-card: dictionaries')

  // The card's store reads/writes the interpreters config over the plugin's
  // self-hosted HTTP route (`/interpreters/api/get` + `/interpreters/api/set`),
  // built on the snapshot store above. Body elided.

  // Pushed invalidations converge the open surface without polling: the dsh
  // client Events vocabulary has no `settings/changed` host passthrough, so
  // convergence rides `connection/reset` — a burst of resets coalesces into
  // a single refetch via the microtask debounce. (Real effect shape,
  // unchanged across the migration.)
  ctx.effect(() => {
    let pending = false
    const refresh = () => {
      if (pending) return
      pending = true
      queueMicrotask(() => {
        pending = false
        // refreshIfLoaded(controller) — elided.
      })
    }
    const disposers = [ctx.on('connection/reset', refresh)]
    return () => { for (const dispose of disposers) dispose() }
  }, 'bench-interpreters-card: pushed invalidations')

  // The card registers into the plugin-config page's card slot with the
  // upstream card shape — generator + `yield`, `locale: NS`, and an inject
  // face carrying only the business surface (elided). Unchanged shape.
  ctx.slots.inject('settings.plugin.item', function* () {
    yield ctx.slots.register({
      name: 'settings.plugin.item',
      key: NS,
      locale: NS,
      inject: () => ({}),
    }, cardStub)
  })
}
