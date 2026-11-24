/**
 * Pixel-pet plugin, browser half (0.1.1-rc.1 era): registers the resident
 * Pet into the session-header actions slot; animation follows the live
 * conversation snapshot (see Pet.tsx).
 */
import type { ClientContext } from '@deepseek-ai/dsh-client-runtime/client'
// Type-only: pulls the locale plugin's Context merge (ctx.locale).
import type {} from '@deepseek-ai/dsh-client-locale/client'
// Type-only: pulls the ui-conversation SlotMap merge (the header.actions entry).
import type {} from '@deepseek-ai/dsh-client-ui-conversation/client'
import { Pet } from './Pet.tsx'
import { en, zh, type PetKey } from './locales.ts'

declare module '@deepseek-ai/dsh-client-ui-slots' {
  interface LocaleNamespaceMap {
    /** The pet's copy. */
    pet: PetKey
  }
}

/** Dictionary namespace owned by this plugin. */
const NS = 'pet'

/**
 * Required services (cordis fiber inject). 'conversation' is an ordering
 * edge: the header.actions slot is declared by ui-conversation's apply, and
 * register() into an undeclared slot throws.
 */
export const inject = ['slots', 'conversation', 'locale']

/**
 * Client plugin body: register the `pet` dictionaries and the resident pet.
 * @param ctx - client root context.
 */
export function apply(ctx: ClientContext): void {
  ctx.effect(() => ctx.locale.register(NS, { zh, en }), 'pet: dictionaries')

  ctx.inject(['slots', 'conversation'], (scope: ClientContext) => {
    scope.slots.register(
      { name: 'conversation.session.header.actions', id: 'pet', order: 10 },
      Pet,
    )
  })
}
