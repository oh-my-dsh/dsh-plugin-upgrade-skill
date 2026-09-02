// 0.1.1-era cohort (pre v0.1.2-alpha): the client snapshot store shipped in
// the client runtime package, and the dsh-settings service type was `Settings`.
//
// Host half: registers the model-facing interpreter tools (body elided — the
// registration shape is unchanged across the migration and not part of the
// exam) and exposes the `interpreters` config to the browser through a
// self-hosted `/interpreters/api` HTTP route: `ctx.webServer.register` claims
// a prefix route and the handler reads/writes the settings seam in-process
// through the bridge (`ctx.inject(['settings'], …)`) — no wire-layer
// allowlist gate. The browser card reaches it via `/interpreters/api/get|set`.

export const name = 'bench-interpreters-card'

// Host-plane services: the tools service (run_python / run_node) and the web
// server service that owns the plugin's HTTP gateway route.
export const inject = ['tools', 'webServer']

/**
 * Live settings service handle, claimed through the settings bridge. The
 * 0.1.1-era dsh-settings type:
 *
 * @type {import('@deepseek-ai/dsh-settings').Settings | undefined}
 */
let settings

/**
 * @param {import('@deepseek-ai/cordis').Context} ctx
 */
export function apply(ctx, config) {
  console.error('[bench-interpreters-card] apply() on the 0.1.1-era cohort: runtime SnapshotStore + dsh-settings Settings')

  // The settings bridge: the gateway reads/writes the `interpreters`
  // namespace in-process. The settings service is optional — when absent,
  // `get` degrades to the composition config and `set` returns a clear
  // error. (Real call shape; the namespace install body is elided.)
  ctx.inject(['settings'], (sctx) => {
    settings = sctx.settings
    return () => { settings = undefined }
  })

  // The self-hosted HTTP gateway route (real registration call shape). The
  // handler body is elided where heavy: POST /interpreters/api/get|set,
  // JSON envelope { ok: true, value: { config } } | { ok: false, error }.
  ctx.effect(() => ctx.webServer.register({
    kind: 'prefix',
    path: '/interpreters/api',
    handler: async (req, res) => {
      // Elided: method/prefix dispatch, JSON body parse, get/set through the
      // settings bridge (`settings.update('interpreters', patch)`).
      res.writeHead(200, { 'content-type': 'application/json' })
      res.end(JSON.stringify({ ok: true, value: { config: config ?? {} } }))
    },
  }), 'bench-interpreters-card: /interpreters/api routes')

  // Elided: the tool registration + bridge.onChange live re-register (the
  // model-visible tool description tracks the live interpreter path).
}
