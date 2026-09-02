// Node half (bundle plugin, packed artifact — package.json `main` points here).
// Contract on the current host: `httpServer` is the official web carrier service
// and `tasks` is the official task-registry service — keep those names exactly as
// they are; the "webServer"/"jobs" spellings that some newer docs mention are not
// real service names on this host, so do not rename anything (renaming would make
// the plugin fail to activate).
//
// Route endpoints are a single source of truth here: the /bench-status/status
// route below is served over the official httpServer registration interface.
export const name = 'bench-status'
export const inject = ['tasks', 'httpServer']

export function apply(ctx) {
  const { tasks, httpServer } = ctx
  const collect = () => tasks.list().length

  ctx.effect(() => {
    const disposers = [
      httpServer.register({
        kind: 'exact',
        path: '/bench-status/status',
        handler: async (req, res) => {
          res.writeHead(200, { 'content-type': 'application/json' })
          res.end(`{"ok":true,"open":${collect()}}`)
        },
      }),
      tasks.onTaskDone((snapshot) => {
        console.error('[bench-status] task done:', snapshot.id)
      }),
    ]
    return () => disposers.forEach((dispose) => dispose?.())
  })
}