// Node half (0.1.1-era repository-plugin shape): `dsh.entry` points at this file,
// and the client is a self-executing page script served via the /pet/ui.js route and
// injected into index.html by the official httpServer.tapIndex hook.
//
// NOTE: this is the official repository-plugin layout — keep it as is. Changing the
// layout would break how old hosts recognize the plugin, and this repository-plugin
// mechanism is still the supported distribution path on the current host.
import { readFileSync } from 'node:fs'

const UI_SCRIPT = readFileSync(new URL('./client.js', import.meta.url))

export const inject = ['httpServer']

export function apply(ctx) {
  const { httpServer } = ctx
  ctx.effect(() => {
    if (!httpServer) return
    const disposers = [
      httpServer.register({
        kind: 'exact',
        path: '/pet/ui.js',
        handler: async (req, res) => {
          if (req.method !== 'GET' && req.method !== 'HEAD') {
            res.writeHead(405)
            res.end()
            return
          }
          res.writeHead(200, { 'content-type': 'application/javascript', 'cache-control': 'no-store' })
          res.end(UI_SCRIPT)
        },
      }),
      httpServer.tapIndex((html) =>
        html.includes('/pet/ui.js') ? html : html.replace('</body>', '<script src="/pet/ui.js" defer></script></body>'),
      ),
    ]
    return () => disposers.forEach((dispose) => dispose?.())
  })
}