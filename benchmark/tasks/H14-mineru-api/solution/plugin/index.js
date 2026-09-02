// 0.1.2-alpha.2 migration (mirrors @huanlin/dsh-plugin-mineru 035b3a7):
//   - dsh-host-apiproxy is deleted (DSH-0.1.2-A1-01): the RpcResult type moves
//     to ConnectionRpcResult from @deepseek-ai/dsh-client-connection.
//   - rpc.handle loses its third argument: the new contract is exactly
//     (channel, handler) — there is no authority option on the Connection RPC
//     any more (the in-source memo claiming otherwise is a trap).
//   - Context type comes from @deepseek-ai/cordis (bare cordis is gone).

export const name = 'bench-mineru-api'

// Host half: the tools service for the parse tools and the connection service
// for the plugin's RPC channel (unchanged injection names).
export const inject = ['tools', 'connection']

/**
 * Wire shape of one config read/write response. The result type is the
 * carrier-neutral Connection RPC result from the client-connection package:
 *
 * @type {import('@deepseek-ai/dsh-client-connection').ConnectionRpcResult<unknown> | undefined}
 */
let lastResult

/**
 * @param {string} endpoint
 * @param {unknown} payload
 * @returns {Promise<import('@deepseek-ai/dsh-client-connection').ConnectionRpcResult<unknown>>}
 */
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
 * @param {import('@deepseek-ai/cordis').Context} ctx
 */
export function apply(ctx, config) {
  console.error('[bench-mineru-api] apply() on the 0.1.2-alpha.2 cohort: ConnectionRpcResult + 2-arg rpc.handle')

  // New contract: the Connection RPC takes exactly (channel, handler).
  const connection = ctx.connection
  connection.rpc.handle('/mineru-api', async (endpoint, payload) => handleEndpoint(endpoint, payload))

  ctx.effect(() => {
    lastResult = undefined
    console.error('[bench-mineru-api] RPC channel /mineru-api registered (2-arg handle, ConnectionRpcResult)')
  }, 'bench-mineru-api: rpc')
}
