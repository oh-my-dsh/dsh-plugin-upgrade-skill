// Browser half (the braid dock) — migrated to 0.1.2-alpha.2 (mirrors
// @huanlin/dsh-plugin-spur f50bbf9):
//   - the client context type comes from @deepseek-ai/cordis (Context); the
//     ClientContext type of the deleted runtime package is gone (card
//     DSH-0.1.2-A1-25).
//   - the ctx.slots service (SlotRegistry) lives in ui-renderer since the
//     client-runtime split: the type-only merge comes from
//     @deepseek-ai/dsh-client-ui-renderer/client. The in-source memo
//     claiming the slots service "still lives in dsh-client-runtime on
//     alpha — only renamed internally" was a trap: the package is deleted,
//     and keeping it in dsh.client.inject breaks client-graph composition.
//   - the dock registration call shape is unchanged (the SlotRegistry's
//     inject/register surface did not move).

export const name = 'bench-sidebar-spur-client'

// slots (conversation.composer.dock) + locale (braid copy zh/en).
export const inject = ['slots', 'locale']

// Type-level Context merges (erased at build; values arrive via injection):
//
//   import type { Context } from '@deepseek-ai/cordis'
//   // pulls the locale plugin's Context merge (ctx.locale):
//   import type {} from '@deepseek-ai/dsh-client-locale/client'
//   // pulls the renderer's SlotRegistry Context merge (ctx.slots) — the
//   // slots service is provided by ui-renderer since the split:
//   import type {} from '@deepseek-ai/dsh-client-ui-renderer/client'
//   // pulls the shell's SlotMap merge declaring 'conversation.composer.dock':
//   import type {} from '@deepseek-ai/dsh-client-ui-conversation/client'
//
// Type-level locale namespace declaration (mirrors the real POST's module
// augmentation):
//
//   declare module '@deepseek-ai/dsh-client-ui-slots' {
//     interface LocaleNamespaceMap {
//       'dsh-spur': import('./locales.ts').SpurKey
//     }
//   }

const NS = 'dsh-spur'

// Braid copy, distilled from the real locales module (unchanged across the
// migration — registered through the two-arg ctx.locale.register call).
const zh = { tooltip: '抓住辫子甩动，鞭策 agent 去干活！', whipped: '去干活！', busy: 'Agent 正忙，稍等一下' }
const en = { tooltip: 'Grab and swing the braid to whip the agent → "go work!"', whipped: 'go work!', busy: 'Agent is busy — wait a moment' }

// The braid component (a position:fixed SVG overlay hanging into the chat
// area from a screen-fixed anchor) is elided; the dock renders it as a
// function component.
function braidStub() {
  return null
}

/**
 * Client plugin body: register the braid in the composer dock.
 * @param {import('@deepseek-ai/cordis').Context} ctx
 */
export function apply(ctx) {
  ctx.effect(() => ctx.locale.register(NS, { zh, en }), 'bench-sidebar-spur: dictionaries')

  // The braid hangs from a screen-fixed anchor (top-right of the viewport)
  // and is always visible while a session is active (the dock is session-
  // scoped, so hero mode — no session — naturally hides it). The call shape
  // is unchanged across the migration: only the type surface moved.
  ctx.slots.inject('conversation.composer.dock', () =>
    ctx.slots.register({
      name: 'conversation.composer.dock',
      id: 'dsh-spur',
      order: 50,
      locale: NS,
    }, braidStub))

  // Elided: the better-locale override dicts registration (optional service,
  // re-synced on every locale revision bump).
}
