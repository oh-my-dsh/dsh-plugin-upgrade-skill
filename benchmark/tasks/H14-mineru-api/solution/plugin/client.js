// Browser half (settings page) — migrated to 0.1.2-alpha.2:
//   - the client context type comes from @deepseek-ai/cordis (Context), with
//     the ctx.connection merge pulled in type-only from
//     @deepseek-ai/dsh-client-connection/client;
//   - the RPC result type is RpcResult from @deepseek-ai/dsh-client-connection/client
//     (the apiproxy type is gone);
//   - the call shape is exactly (channel, endpoint, payload) — no authority
//     option exists on the Connection RPC any more.

export const name = 'bench-mineru-api-client'

export const inject = ['connection', 'locale']

/**
 * @param {import('@deepseek-ai/cordis').Context} ctx
 */
export function apply(ctx) {
  ctx.effect(() => {
    console.error('[bench-mineru-api-client] registering the MinerU settings section')

    // New style: the client-side RpcResult type comes from
    // @deepseek-ai/dsh-client-connection/client.
    //
    // @type {import('@deepseek-ai/dsh-client-connection/client').RpcResult<{ config: unknown }>}
    let result
    async function callRpc(endpoint, payload) {
      // Carrier-neutral Connection RPC: (channel, endpoint, payload).
      return ctx.connection.rpc.call('/mineru-api', endpoint, payload)
    }

    result = undefined
    console.error('[bench-mineru-api-client] settings page mounted; RPC via ctx.connection (carrier-neutral call shape)')
  }, 'bench-mineru-api-client: register')
}
