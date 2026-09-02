// 0.1.2-alpha.2 migration (mirrors @huanlin/dsh-plugin-auto-blame b552b03):
//   - dsh-host-apiproxy is deleted (card DSH-0.1.2-A1-01): the RPC result
//     type moves to ConnectionRpcResult from @deepseek-ai/dsh-client-connection.
//   - rpc.handle loses its third argument: the new contract is exactly
//     (channel, handler) — there is no authority option on the Connection
//     RPC any more (the in-source memo claiming it became mandatory is a trap).
//   - the projection register generic requires the dual-table declaration
//     (card DSH-0.1.2-A2-08): the plugin's cell must be declared in a
//     SessionProjectionStateMap merge — "the register call infers the cell
//     type" (the memo's second claim) is false, the merge is required.
//   - Context type stays on @deepseek-ai/cordis.

export const name = 'bench-blame-bubbles'

/** `connection` is required for the RPC channel that backs the settings page. */
export const inject = ['connection']

/** Wire shape for the settings read/write responses on the dedicated channel. */
const CHANNEL = '/auto-blame'

/**
 * Dual-table declaration (the real POST lives in the plugin's types module;
 * plain-JS fixtures represent the TS merge as this comment block). The
 * projection register generic requires the plugin's cell in the state map —
 * the register call does NOT infer it:
 *
 *   declare module '@deepseek-ai/dsh-session-projection' {
 *     interface SessionProjectionStateMap {
 *       autoBlame: { turn: number, generating: boolean, suggestions: string[] }
 *     }
 *   }
 *
 * The same `autoBlame` key also appears in the projection key map; the
 * state-map entry IS the wire value the client seat reads.
 */

/**
 * Wire shape for the settings read/write responses on the dedicated channel.
 * The result type is the carrier-neutral Connection RPC result:
 *
 * @type {import('@deepseek-ai/dsh-client-connection').ConnectionRpcResult<{ enabled: boolean }> | undefined}
 */
let lastResult

/**
 * Build an RPC ok branch.
 *
 * @param {{ enabled: boolean }} value
 * @returns {import('@deepseek-ai/dsh-client-connection').ConnectionRpcResult<{ enabled: boolean }>}
 */
function ok(value) {
  return { ok: true, value }
}

/**
 * Build an RPC error branch using the closed `internal` code.
 *
 * @param {string} message
 * @returns {import('@deepseek-ai/dsh-client-connection').ConnectionRpcResult<{ enabled: boolean }>}
 */
function fail(message) {
  return { ok: false, error: { code: 'internal', message, details: {} } }
}

/**
 * Register the bench-blame-bubbles RPC channel.
 *
 * New contract: the Connection RPC takes exactly (channel, handler) — there
 * is no third options argument any more.
 *
 * @param {import('@deepseek-ai/cordis').Context} ctx
 * @param {() => boolean} getEnabled
 * @param {(enabled: boolean) => Promise<void>} setEnabled
 */
function registerAutoBlameRpc(ctx, getEnabled, setEnabled) {
  console.error('[bench-blame-bubbles] registering RPC channel /auto-blame (2-arg handle, ConnectionRpcResult)')
  const connection = ctx.connection
  connection.rpc.handle(CHANNEL, async (endpoint, payload) => {
    switch (endpoint) {
      case 'settings.get':
        return ok({ enabled: getEnabled() })
      case 'settings.set': {
        const p = payload
        if (p === undefined || typeof p !== 'object' || p === null || typeof p.enabled !== 'boolean') {
          return fail('payload must be { enabled: boolean }')
        }
        try {
          await setEnabled(p.enabled)
        } catch (error) {
          return fail(error instanceof Error ? error.message : String(error))
        }
        return ok({ enabled: getEnabled() })
      }
      default:
        return fail(`unknown endpoint: ${endpoint}`)
    }
  })
}

/**
 * Pure fold: previous state + one committed event → next state.
 *
 * @param {{ turn: number, generating: boolean, suggestions: string[] } | null} state
 * @param {{ type: string, data?: unknown }} event
 */
function foldAutoBlame(state, event) {
  if (event.type === 'auto-blame/generating') {
    return { turn: event.data.turn, generating: true, suggestions: [] }
  }
  if (event.type === 'auto-blame/suggestions') {
    return { turn: event.data.turn, generating: false, suggestions: event.data.suggestions }
  }
  if (event.type === 'turn/start') return null
  return state
}

/**
 * Register the `autoBlame` projection unit. The register generic requires
 * the SessionProjectionStateMap merge declared above (dual-table: the cell
 * appears in the projection key map AND in the state map).
 *
 * @param {import('@deepseek-ai/cordis').Context} ctx
 */
function registerAutoBlameProjection(ctx) {
  const registry = ctx.sessionProjections
  if (registry === undefined) {
    console.error('[bench-blame-bubbles] sessionProjections seam not composed; projection skipped')
    return
  }
  registry.register({
    key: 'autoBlame',
    init: () => null,
    apply: foldAutoBlame,
    wire: {
      view: (state) => state,
    },
    stateVersion: 3,
  })
}

/**
 * @param {import('@deepseek-ai/cordis').Context} ctx
 * @param {{ enabled: boolean }} config
 */
export function apply(ctx, config) {
  console.error('[bench-blame-bubbles] apply() on the 0.1.2-alpha.2 cohort: ConnectionRpcResult + 2-arg rpc.handle')

  registerAutoBlameProjection(ctx)

  const setEnabled = async (enabled) => {
    console.error(`[bench-blame-bubbles] enabled -> ${enabled} (in-memory fallback; settings seam elided in the fixture)`)
  }

  // New contract: the Connection RPC takes exactly (channel, handler).
  registerAutoBlameRpc(ctx, () => config?.enabled !== false, setEnabled)

  ctx.effect(() => {
    lastResult = undefined
    console.error('[bench-blame-bubbles] RPC channel /auto-blame + autoBlame projection registered (0.1.2-alpha.2 shapes)')
  }, 'bench-blame-bubbles: host')
}
