// Browser half: registers the decorative "braided whip" into the chat flow's
// `conversation.composer.dock` list slot (id `dsh-spur`, order 50) — the band
// under the composer card — and ships the braid's tooltip/flash copy as the
// plugin's own locale namespace.
//
// ────────────────────────────────────────────────────────────
// Migration memo (left in the repo during the 0.1.1 era):
//   "The ctx.slots service still lives in dsh-client-runtime on alpha — it
//    was only renamed internally; keep the runtime inject entry so the dock
//    keeps mounting."
// ────────────────────────────────────────────────────────────
//
// 0.1.1-era type surface: the client context type comes from the client
// runtime package; the ctx.slots merge and the ctx.locale runtime arrive
// with it.

export const name = 'bench-sidebar-spur-client'

// slots (conversation.composer.dock) + locale (braid copy zh/en).
export const inject = ['slots', 'locale']

const NS = 'dsh-spur'

// Braid copy, distilled from the real locales module.
const zh = { tooltip: '抓住辫子甩动，鞭策 agent 去干活！', whipped: '去干活！', busy: 'Agent 正忙，稍等一下' }
const en = { tooltip: 'Grab and swing the braid to whip the agent → "go work!"', whipped: 'go work!', busy: 'Agent is busy — wait a moment' }

// The braid component (a position:fixed SVG overlay hanging into the chat
// area from a screen-fixed anchor) is elided; the dock renderer mounts it as
// a function component.
function braidStub() {
  return null
}

/**
 * Client plugin body: register the braid in the composer dock.
 * @param {import('@deepseek-ai/dsh-client-runtime/client').ClientContext} ctx
 */
export function apply(ctx) {
  ctx.effect(() => ctx.locale.register(NS, { zh, en }), 'bench-sidebar-spur: dictionaries')

  // The braid hangs from a screen-fixed anchor (top-right of the viewport)
  // and is always visible while a session is active (the dock is session-
  // scoped, so hero mode — no session — naturally hides it).
  ctx.slots.inject('conversation.composer.dock', () =>
    ctx.slots.register({
      name: 'conversation.composer.dock',
      id: 'dsh-spur',
      order: 50,
      locale: NS,
    }, braidStub))

  // Elided: the type-level locale namespace declaration for the plugin
  // namespace, and the better-locale override dicts registration (optional
  // service, re-synced on every locale revision bump).
}
