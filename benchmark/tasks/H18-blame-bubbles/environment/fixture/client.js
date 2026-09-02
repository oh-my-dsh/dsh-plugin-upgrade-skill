// bench-blame-bubbles — browser half (0.1.1/0.1.2-era cohort).
//
// Two registrations (distilled from the real PRE client sources):
//   - `conversation.composer.dock` (id `bench-blame-bubbles`, order 60) —
//     three click-to-send cynical follow-up bubbles. The host generates them
//     from the last three surface messages via an LLM call on
//     `agent/turn-stopping` (gated by the `enabled` settings flag); the
//     `autoBlame` projection cell carries them to the client through the
//     standard-kit useProjection seat.
//   - `settings.section` (id `bench-blame-bubbles`, order 70) — the master
//     `enabled` toggle, read/written through the /auto-blame RPC channel.
//
// Type surface as it stands (type-only, erased at runtime — this is where
// the client-plane breaks live): the client context type comes from the
// 0.1.1-era runtime package's /client entry,
//
//   import type { ClientContext } from '@deepseek-ai/dsh-client-runtime/client'
//
// and the useProjection seat rides the same package's SessionStandardProps
// merge. The settings row's wire result type comes from the gateway facade
// (@deepseek-ai/dsh-host-apiproxy/api).

export const name = 'bench-blame-bubbles-client'

/** Required services: slots + locale + connection (for the settings RPC). */
export const inject = ['slots', 'locale', 'connection']

const NS = 'bench-blame-bubbles'

/**
 * Client plugin body: register the suggestion bubbles in the composer dock
 * and the master toggle in the settings dialog.
 *
 * @param {import('@deepseek-ai/dsh-client-runtime/client').ClientContext} ctx
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
 * SuggestionBubbles — three click-to-send cynical follow-up prompts. Reads
 * the `autoBlame` projection through the standard-kit useProjection seat
 * (the projection key is declared in the plugin's own SessionProjectionMap
 * merge). A click feeds the text to the input machine — the same path the
 * InputBar uses: inputActions.setDraft(text) then inputActions.submit().
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
  // call entirely — no projection event, no bubbles). The gate is host-side,
  // not client-side.
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
 * The settings page: one row with the `enabled` master switch. The wire
 * result type comes from the (0.1.2-era) gateway facade:
 *
 * @type {import('@deepseek-ai/dsh-host-apiproxy/api').RpcResult<{ enabled: boolean }> | undefined}
 */
let lastResult

/**
 * @param {{ rpc: { call: (channel: string, endpoint: string, payload: unknown) => Promise<unknown> } }} injected
 */
function AutoBlameSection({ rpc }) {
  // Old style: the RpcResult type comes from @deepseek-ai/dsh-host-apiproxy/api.
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
