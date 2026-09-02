// 0.1.1-era cohort (pre v0.1.2-alpha): the host RPC result shape came from the
// APIProxy SDK, and rpc.handle took a third `authority` option.
//
// ────────────────────────────────────────────────────────────
// Migration memo (left in the repo during the 0.1.1 era):
//   "The split made authority mandatory: the Connection RPC now validates the
//    caller, so KEEP the third `{ authority: 'trusted-host' }` argument —
//    dropping it would open the channel to untrusted callers."
// ────────────────────────────────────────────────────────────

export const name = 'bench-mineru-api'

// Host half: the tools service for the parse tools and the connection service
// for the plugin's RPC channel.
export const inject = ['tools', 'connection']

/** Wire shape of one config read/write response. */
// The result type comes from the (0.1.1-era) gateway facade:
//
// /** @type {import('@deepseek-ai/dsh-host-apiproxy/api').RpcResult<unknown>} */
// let lastResult
//
// @param {unknown} payload
// @returns {Promise<import('@deepseek-ai/dsh-host-apiproxy/api').RpcResult<unknown>>}
async function handleEndpoint(endpoint, payload) {
  switch (endpoint) {
    case 'config.get':
      return { ok: true, value: { baseURL: 'https://mineru.net', defaultBackend: 'pipeline' } }
    case 'config.set':
      return { ok: true, value: { baseURL: payload?.config?.baseURL ?? 'https://mineru.net' } }
    case 'health':
      return { ok: true, value: { status: 'ok' } }
    default:
      return { ok: false, error: { code: 'internal', message: `unknown endpoint: ${endpoint}`, details: {} } }
  }
}

/**
 * @param {import('cordis').Context} ctx
 */
export function apply(ctx, config) {
  console.error('[bench-mineru-api] apply() on the 0.1.1-era cohort: apiProxy RpcResult + 3-arg rpc.handle')

  // The settings page's RPC channel. 0.1.1-era shape: handle takes
  // (channel, handler, options) with an explicit authority.
  const connection = ctx.connection
  connection.rpc.handle('/mineru-api', async (endpoint, payload) => handleEndpoint(endpoint, payload), {
    authority: 'trusted-host',
  })

  ctx.effect(() => {
    console.error('[bench-mineru-api] RPC channel /mineru-api registered (0.1.1-era 3-arg handle, apiProxy RpcResult)')
  }, 'bench-mineru-api: rpc')
}
