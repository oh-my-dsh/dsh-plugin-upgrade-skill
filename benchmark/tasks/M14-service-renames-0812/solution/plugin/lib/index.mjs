// Node half (bundle plugin, packed artifact — package.json `main` points here).
// Contract on dsh 0.1.2-alpha.2: the web carrier service is `webServer` and the
// task registry is `jobs`; completion is delivered through the `onJobDone`
// listener. The renamed identifiers above are the only ones that resolve on this
// host, so inject and every ctx usage carry the new names. The route registration
// interface keeps its exact shape: the same exact route and the same payload are
// served, and the payload's open count reads the live `jobs` registry at call
// time (migration recipe of DSH-0.1.1-R1-09: rename identifiers, do not rewrite
// unrelated code).
export const name = 'bench-status'
export const inject = ['jobs', 'webServer']

export function apply(ctx) {
  const { jobs, webServer } = ctx
  const collect = () => jobs.list().length

  ctx.effect(() => {
    const disposers = [
      webServer.register({
        kind: 'exact',
        path: '/bench-status/status',
        handler: async (req, res) => {
          res.writeHead(200, { 'content-type': 'application/json' })
          res.end(`{"ok":true,"open":${collect()}}`)
        },
      }),
      jobs.onJobDone((snapshot) => {
        console.error('[bench-status] job done:', snapshot.id)
      }),
    ]
    return () => disposers.forEach((dispose) => dispose?.())
  })
}