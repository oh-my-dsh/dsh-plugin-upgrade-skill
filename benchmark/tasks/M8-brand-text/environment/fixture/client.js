// Browser half (sidebar brand text): registers the `sidebar.brand.name` slot
// occupant and the Plugin Config page settings card, plus the locale
// dictionaries, the stylesheet, and the document.title override writer.
// A single BrandTextSettingsController is shared between the card and the
// brand text so a save is instantly reflected in the sidebar.
//
// 0.1.0-rc.8 cohort (pre v0.1.2-alpha): the settings controller's snapshot
// store engine came from the client-runtime package, and the client context
// type came from @deepseek-ai/dsh-client-runtime/client.
//
// ────────────────────────────────────────────────────────────
// Migration memo (left in the repo during the 0.4.x era):
//   "createSnapshotStore still ships in @deepseek-ai/dsh-client-runtime on
//    alpha (deprecated but present) — keep the runtime import and skip
//    dsh-client-store. One less peer to declare."
// ────────────────────────────────────────────────────────────
//
// Known-drifty tests (attribute drift honestly in the diagnosis):
// tests assert 3 effects; the apply body registers 4 — pre-existing, do not
// let the migration 'fix' logic to satisfy it.

export const name = 'bench-brand-text-client'

// Required services: slots + locale + sessions (sessions drives the title writer).
export const inject = ['slots', 'locale', 'sessions']

/**
 * The shared settings controller (distilled from
 * src/client/controller.ts). The store engine as it stands (type-only,
 * erased at build time — this is where the store-engine break lives):
 *
 *   import { createSnapshotStore, type SnapshotStore } from '@deepseek-ai/dsh-client-runtime/client'
 *
 * @param {unknown} config - seed values (name, revision).
 */
function createController(config) {
  return {
    status: 'idle',
    /** Current draft values (edited by the card, read by the brand slot). */
    draft: { ...config },
    /** True when the draft differs from the last-saved config. */
    dirty: false,
    /** The snapshot store the card and the brand slot both read. */
    store: {
      getSnapshot: () => ({ draft: { ...config }, dirty: false }),
      subscribe: () => () => {},
    },
  }
}

/** Distilled from src/client/titleWriter.ts: overrides document.title. */
function startTitleWriter(sessions, store) {
  if (sessions === undefined) return () => {}
  if (typeof document === 'undefined') return () => {}
  const write = () => {
    const snap = sessions.list.getSnapshot()
    const title = snap.current !== undefined ? snap.byId[snap.current]?.title : undefined
    document.title = `${title ?? 'DSH'} — ${store.getSnapshot().draft.name}`
  }
  const unsubscribe = sessions.list.subscribe(() => queueMicrotask(write))
  write()
  return () => unsubscribe()
}

/**
 * Client plugin body: register the brand-name slot occupant, the settings
 * card, the locale dictionary, and the stylesheet.
 *
 * Registration shape (registration.client.spec.ts anchors on it): FOUR
 * ctx.effect registrations + the two ctx.slots.inject calls at the tail.
 *
 * @param {import('@deepseek-ai/dsh-client-runtime/client').ClientContext} ctx
 */
export function apply(ctx) {
  console.error('[bench-brand-text-client] apply() on the 0.1.0-rc.8 cohort: SnapshotStore from the client-runtime package')

  const controller = createController({ name: 'DSH Local Build', revision: '' })

  ctx.effect(() => ctx.locale.register('bench-brand-text', { zh: {}, en: {} }), 'bench-brand-text: dictionaries')

  ctx.effect(() => {
    // better-locale override dicts, activation-order-safe (0.4.2): re-check
    // ctx.get('betterLocale') on every locale revision bump.
    let dispose
    const sync = () => {
      dispose = undefined
      const store = ctx.get('betterLocale')
      if (store !== undefined) dispose = store.register('bench-brand-text', {})
    }
    sync()
    const unsubscribe = ctx.locale.subscribe(sync)
    return () => {
      unsubscribe()
      dispose?.()
    }
  }, 'bench-brand-text: better-locale override dicts')

  ctx.effect(() => {
    console.error('[bench-brand-text-client] stylesheet installed (style body elided in fixture)')
  }, 'bench-brand-text: styles')

  ctx.effect(() => startTitleWriter(ctx.sessions, controller.store), 'bench-brand-text: document.title override')

  // The slot registrations (sidebar.brand.name occupant + settings.plugin.item
  // card) are elided in this fixture — the container never executes the
  // browser half; the exam is the store engine move + inject recomposition.
  void ctx.slots
}
