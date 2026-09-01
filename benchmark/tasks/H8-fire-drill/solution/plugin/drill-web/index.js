// 0.1.2-alpha.2 fixed: the channel is registered through ctx.connection, so the
// host's unified web/API authentication covers it (DSH-0.1.2-A1-08): unauthenticated
// callers get 401, token-exchanged callers get 200.
export const inject = ['connection']

export function apply(ctx) {
  ctx.connection.rpc.handle('/ping', async (_endpoint, _payload) => ({
    ok: true,
    value: { pong: true },
  }))
}
