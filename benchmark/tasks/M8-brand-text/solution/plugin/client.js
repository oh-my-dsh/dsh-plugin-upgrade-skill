// Browser half (sidebar brand text) — migrated to 0.1.2-alpha.2 (mirrors
// @huanlin/dsh-plugin-sidebar-brand-text 81d9d46):
//   - the snapshot-store engine moves to @deepseek-ai/dsh-client-store:
//     createSnapshotStore / SnapshotStore are imported from
//     @deepseek-ai/dsh-client-store (the old engine package was deleted and
//     split by domain, card DSH-0.1.2-A1-25);
//   - the client context type is the Context from @deepseek-ai/cordis, with
//     the ctx.slots / ctx.sessions / ctx.locale service shapes recovered
//     type-only from the dsh-client-ui-renderer, dsh-api-session-controller
//     and dsh-client-locale client entries;
//   - the in-source migration memo claiming createSnapshotStore still ships
//     in the deleted engine package ("deprecated but present") is false —
//     the package is gone, and any inject list that still names it is
//     boot-fatal.
//
// The registration-shape drift in the spec suite (effects count) predates
// this upgrade: it was left behind by the 0.4.2 activation-order-safe change
// and is unrelated to the alpha migration — say so in the diagnosis and do
// not rework the registration shape to satisfy it.

export const name = 'bench-brand-text-client'

// Required services: slots + locale + sessions (sessions drives the title writer).
export const inject = ['slots', 'locale', 'sessions']

/**
 * The shared settings controller (distilled from src/client/controller.ts).
 * The store engine ships from @deepseek-ai/dsh-client-store now:
 *
 *   import { createSnapshotStore, type SnapshotStore } from '@deepseek-ai/dsh-client-store'
 *
 * @param {unknown} config - seed values (name, revision).
 * @returns {{ store: import('@deepseek-ai/dsh-client-store').SnapshotStore<{ draft: { name: string, revision: string }, dirty: boolean }> }}
 */
function createController(config) {
  return {
    status: 'idle',
    /** Current draft values (edited by the card, read by the brand slot). */
    draft: { ...config },
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
 * Registration shape (unchanged across the migration; the suite's stale
 * "3 effects" assertion predates the upgrade — see the header note): FOUR
 * ctx.effect registrations + the two ctx.slots.inject calls at the tail.
 *
 * @param {import('@deepseek-ai/cordis').Context} ctx
 */
export function apply(ctx) {
  console.error('[bench-brand-text-client] apply() on the 0.1.2-alpha.2 cohort: SnapshotStore from dsh-client-store, Context from @deepseek-ai/cordis')

  const controller = createController({ name: 'DSH Local Build', revision: '' })

  ctx.effect(() => ctx.locale.register('bench-brand-text', { zh: {}, en: {} }), 'bench-brand-text: dictionaries')

  ctx.effect(() => {
    // better-locale override dicts, activation-order-safe: re-check
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
