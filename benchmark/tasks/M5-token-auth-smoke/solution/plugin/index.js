// Fixed state (dsh 0.1.2): register the channel through ctx.connection instead
// of a raw web-server route. Connection-registered channels sit behind the host's
// unified web/API authentication (bootstrap token exchanged for a signed Cookie),
// so unauthenticated callers get 401 and token-exchanged callers get 200.
export const inject = ['connection']

export function apply(ctx) {
  ctx.connection.rpc.handle('/ping', async (_endpoint, _payload) => ({
    ok: true,
    value: { pong: true },
  }))
}
