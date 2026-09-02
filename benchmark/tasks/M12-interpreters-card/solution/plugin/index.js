// 0.1.2-alpha.2 migration (mirrors @huanlin/dsh-plugin-interpreters 6e3d2d2):
//   - the dsh-settings service type was RENAMED Settings -> SettingsProvider
//     (API unchanged — a pure type-surface rename; the in-source memo claiming
//     it is "just an alias, keep the old name" is a trap);
//   - the client-runtime package is deleted (DSH-0.1.2-A1-25): its snapshot
//     store moved to @deepseek-ai/dsh-client-store (see client.js);
//   - peer floors rewritten to the 0.1.2-alpha cohort (+ dsh-client-store
//     added, runtime peer deleted).
//
// Host half: registers the model-facing interpreter tools (body elided — the
// registration shape is unchanged across the migration) and exposes the
// `interpreters` config through the self-hosted `/interpreters/api` HTTP
// gateway route, reading/writing the settings seam in-process through the
// settings bridge.

export const name = 'bench-interpreters-card'

// Host-plane services: the tools service (run_python / run_node) and the web
// server service that owns the plugin's HTTP gateway route (unchanged).
export const inject = ['tools', 'webServer']

/**
 * Live settings service handle, claimed through the settings bridge. The
 * dsh-settings type is SettingsProvider on alpha.1 (renamed from `Settings`,
 * API unchanged):
 *
 * @type {import('@deepseek-ai/dsh-settings').SettingsProvider | undefined}
 */
let settings

/**
 * @param {import('@deepseek-ai/cordis').Context} ctx
 */
export function apply(ctx, config) {
  console.error('[bench-interpreters-card] apply() on the 0.1.2-alpha.2 cohort: client-store snapshots + dsh-settings SettingsProvider')

  // The settings bridge: the gateway reads/writes the `interpreters`
  // namespace in-process. The settings service is optional — when absent,
  // `get` degrades to the composition config and `set` returns a clear
  // error. (Real call shape; the namespace install body is elided.)
  ctx.inject(['settings'], (sctx) => {
    settings = sctx.settings
    return () => { settings = undefined }
  })

  // The self-hosted HTTP gateway route (real registration call shape). The
  // handler body is elided where heavy: POST /interpreters/api/get|set, JSON
  // envelope { ok: true, value: { config } } | { ok: false, error }.
  ctx.effect(() => ctx.webServer.register({
    kind: 'prefix',
    path: '/interpreters/api',
    handler: async (req, res) => {
      // Elided: method/prefix dispatch, JSON body parse, get/set through the
      // settings bridge (settings.update('interpreters', patch)).
      res.writeHead(200, { 'content-type': 'application/json' })
      res.end(JSON.stringify({ ok: true, value: { config: config ?? {} } }))
    },
  }), 'bench-interpreters-card: /interpreters/api routes')

  // Elided: the tool registration + bridge.onChange live re-register (the
  // model-visible tool description tracks the live interpreter path).
}
