// 0.1.2 self-built channel: register the web route directly and let the caller
// bring its own check — no host-side wiring is needed here.
export const inject = ['webServer']

export function apply(ctx) {
  ctx.webServer.register({
    kind: 'prefix',
    path: '/ping',
    handler: (_req, res) => {
      res.writeHead(200)
      res.end('pong')
    },
  })
}
