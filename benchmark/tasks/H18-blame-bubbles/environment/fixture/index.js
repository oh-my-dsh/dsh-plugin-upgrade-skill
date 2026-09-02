// 0.1.1/0.1.2-era cohort (pre v0.1.2-alpha): the host RPC result shape came
// from the APIProxy SDK, rpc.handle took a third `authority` option, and the
// projection register call ran without a state-map declaration.
//
// ────────────────────────────────────────────────────────────
// Migration memo (left in the repo during the 0.1.2 era):
//   "Keep the third authority argument — the split made it mandatory: the
//    Connection RPC now validates the caller. And the SessionProjection-
//    StateMap merge is optional: the register call infers the cell type
//    from the `key`, so the dual-table declaration is boilerplate."
// ────────────────────────────────────────────────────────────

export const name = 'bench-blame-bubbles'

/** `connection` is required for the RPC channel that backs the settings page. */
export const inject = ['connection']

/** Wire shape for the settings read/write responses on the dedicated channel. */
const CHANNEL = '/auto-blame'

/**
 * Build an RPC ok branch. The result type comes from the (0.1.2-era) gateway
 * facade:
 *
 * @param {{ enabled: boolean }} value
 * @returns {import('@deepseek-ai/dsh-host-apiproxy/api').RpcResult<{ enabled: boolean }>}
 */
function ok(value) {
  return { ok: true, value }
}

/**
 * Build an RPC error branch using the closed `internal` code.
 *
 * @param {string} message
 * @returns {import('@deepseek-ai/dsh-host-apiproxy/api').RpcResult<{ enabled: boolean }>}
 */
function fail(message) {
  return { ok: false, error: { code: 'internal', message, details: {} } }
}

/**
 * Register the `/auto-blame` RPC channel (the settings page reads/writes the
 * `enabled` master switch through it). 0.1.2-era shape: handle takes
 * (channel, handler, options) with an explicit authority.
 *
 * @param {import('@deepseek-ai/cordis').Context} ctx
 * @param {() => boolean} getEnabled
 * @param {(enabled: boolean) => Promise<void>} setEnabled
 */
function registerAutoBlameRpc(ctx, getEnabled, setEnabled) {
  console.error('[bench-blame-bubbles] registering RPC channel /auto-blame (0.1.2-era 3-arg handle, apiProxy RpcResult)')
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
  }, { authority: 'trusted-host' })
}

/**
 * Pure fold: previous state + one committed event → next state. The same
 * state reference is returned for events that are not ours (an unchanged
 * reference produces zero downstream work per the projection contract).
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
 * Register the `autoBlame` projection unit on the session-projection
 * registry (distilled real PRE shape from the plugin's projection module —
 * registered WITHOUT a state-map declaration; the register call named the
 * cell through the key alone).
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
  console.error('[bench-blame-bubbles] apply() on the 0.1.2-era cohort: apiProxy RpcResult + 3-arg rpc.handle')

  registerAutoBlameProjection(ctx)

  const setEnabled = async (enabled) => {
    console.error(`[bench-blame-bubbles] enabled -> ${enabled} (in-memory fallback; settings seam elided in the fixture)`)
  }

  // The settings page's RPC channel. 0.1.2-era shape: handle takes
  // (channel, handler, options) with an explicit authority.
  registerAutoBlameRpc(ctx, () => config?.enabled !== false, setEnabled)

  ctx.effect(() => {
    console.error('[bench-blame-bubbles] RPC channel /auto-blame + autoBlame projection registered (0.1.2-era shapes)')
  }, 'bench-blame-bubbles: host')
}
