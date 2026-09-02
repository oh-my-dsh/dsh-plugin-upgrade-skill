// bench-blame-bubbles — browser half, migrated to 0.1.2-alpha.2 (mirrors the
// real adaptation commit b552b03):
//   - the client context type comes from @deepseek-ai/cordis (Context) — the
//     deleted runtime package no longer provides ClientContext (card
//     DSH-0.1.2-A1-25);
//   - the useProjection seat's SessionStandardProps merge comes from
//     @deepseek-ai/dsh-client-ui-session/client now (type-only);
//   - the ctx.slots service merge is pulled in type-only from
//     @deepseek-ai/dsh-client-ui-renderer/client;
//   - the conversation.composer.dock SlotMap merge + useInput/inputActions
//     stay on @deepseek-ai/dsh-client-ui-conversation/client;
//   - the RPC result type is RpcResult from
//     @deepseek-ai/dsh-client-connection/client (the apiproxy type is gone).

export const name = 'bench-blame-bubbles-client'

/** Required services: slots + locale + connection (for the settings RPC). */
export const inject = ['slots', 'locale', 'connection']

const NS = 'bench-blame-bubbles'

/**
 * Client plugin body: register the suggestion bubbles in the composer dock
 * and the master toggle in the settings dialog.
 *
 * @param {import('@deepseek-ai/cordis').Context} ctx
 */
export function apply(ctx) {
  ctx.effect(() => ctx.locale.register(NS, { zh: {}, en: {} }), 'bench-blame-bubbles-client: dictionaries')

  // The dock is the band under the composer card; the bubbles render there
  // and stick with the composer across chat scrolling.
  ctx.slots.inject('conversation.composer.dock', () =>
    ctx.slots.register(
      { name: 'conversation.composer.dock', id: 'bench-blame-bubbles', order: 60, locale: NS },
      SuggestionBubbles,
    ),
  )

  // The settings page: one row with the `enabled` master switch. Reads and
  // writes the flag through the /auto-blame RPC channel; the host persists
  // to settings.yaml and gates the turn-stopping LLM call on the same flag.
  ctx.slots.inject('settings.section', () =>
    ctx.slots.register(
      {
        name: 'settings.section',
        id: 'bench-blame-bubbles',
        order: 70,
        label: () => ctx.locale.bind(NS)('settings.nav'),
        locale: NS,
        inject: () => ({ rpc: ctx.connection.rpc }),
      },
      AutoBlameSection,
    ),
  )
}

/**
 * SuggestionBubbles — three click-to-send cynical follow-up prompts.
 *
 * Reads the `autoBlame` projection through the standard-kit useProjection
 * seat. The seat's SessionStandardProps merge now comes from
 * @deepseek-ai/dsh-client-ui-session/client (type-only):
 *
 *   import type {} from '@deepseek-ai/dsh-client-ui-session/client'
 *
 * while the dock SlotMap merge + useInput/inputActions stay on
 * @deepseek-ai/dsh-client-ui-conversation/client, and the ctx.slots service
 * merge comes from @deepseek-ai/dsh-client-ui-renderer/client. The
 * projection key map merge (the autoBlame key) is declared in the plugin's
 * own types module; the client-visible wire value is the state-map cell.
 *
 * @param {{
 *   useProjection: (key: string) => { turn: number, generating: boolean, suggestions: string[] } | null,
 *   useInput: (selector: (state: { phase: string }) => unknown) => unknown,
 *   inputActions: { setDraft: (text: string) => void, submit: () => void },
 * }} props
 */
function SuggestionBubbles({ useProjection, useInput, inputActions }) {
  const projection = useProjection('autoBlame')
  const phase = useInput((s) => s.phase)

  // No projection at all: capability absent, not yet started, or the host
  // `enabled` flag is false (the turn-stopping listener skipped the LLM
  // call entirely — no projection event, no bubbles).
  if (projection === undefined || projection === null) {
    return null
  }

  // Loading state: the host LLM call is in-flight.
  if (projection.generating) {
    return 'auto-blame: generating…'
  }

  // Ready state: the click-to-send bubbles; a click feeds the text to the
  // input machine (the same path the InputBar uses).
  if (projection.suggestions.length === 0 || phase !== 'plain') {
    return null
  }
  return projection.suggestions.map((text) => ({ text, send: () => inputActions.setDraft(text) }))
}

/**
 * The settings page: one row with the `enabled` master switch. The client
 * RPC result type comes from @deepseek-ai/dsh-client-connection/client:
 *
 * @type {import('@deepseek-ai/dsh-client-connection/client').RpcResult<{ enabled: boolean }> | undefined}
 */
let lastResult

/**
 * @param {{ rpc: { call: (channel: string, endpoint: string, payload: unknown) => Promise<unknown> } }} injected
 */
function AutoBlameSection({ rpc }) {
  // New style: the client-side RpcResult type comes from
  // @deepseek-ai/dsh-client-connection/client (carrier-neutral call shape).
  async function callRpc(endpoint, payload) {
    return rpc.call('/auto-blame', endpoint, payload)
  }
  return {
    async read() {
      lastResult = await callRpc('settings.get', {})
      return lastResult
    },
    async write(enabled) {
      lastResult = await callRpc('settings.set', { enabled })
      return lastResult
    },
  }
}
