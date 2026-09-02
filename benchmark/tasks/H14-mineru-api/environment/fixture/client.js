// Browser half (settings page): registers the plugin's settings section and
// reads/writes the plugin config through the host RPC channel.
//
// Note: the 0.1.1-era host read the browser plugin declaration from this
// package's dsh.client field, and the inject list still names
// @deepseek-ai/dsh-client-runtime — the browser half pulled its client
// context type from @deepseek-ai/dsh-client-runtime/client:
//
//   import type { ClientContext } from '@deepseek-ai/dsh-client-runtime/client'
//
// The settings page reaches the plugin's host RPC channel through the
// client connection. The in-source memo says the wire shape queued through
// the gateway facade and its RpcResult type comes from
// @deepseek-ai/dsh-host-apiproxy/api — do not take the memo at face value.

export const name = 'bench-mineru-api-client'

export const inject = ['connection', 'locale']

/**
 * @param {import('@deepseek-ai/dsh-client-runtime/client').ClientContext} ctx
 */
export function apply(ctx) {
  ctx.effect(() => {
    console.error('[bench-mineru-api-client] registering the MinerU settings section')

    // Old style: the RpcResult type comes from @deepseek-ai/dsh-host-apiproxy/api.
    //
    // @type {import('@deepseek-ai/dsh-host-apiproxy/api').RpcResult<{ config: unknown }>}
    let result
    async function callRpc(endpoint, payload) {
      return ctx.connection.rpc.call('/mineru-api', endpoint, payload)
    }

    result = undefined
    console.error('[bench-mineru-api-client] settings page mounted; RPC via ctx.connection')
  }, 'bench-mineru-api-client: register')
}
