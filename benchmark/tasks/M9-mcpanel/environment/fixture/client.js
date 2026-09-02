// Browser half: registers the settings-page "MCP" panel tab through the
// settings.section slot, plus the plugin's own locale namespace for the panel
// copy (following DSH's native zh/en).
//
// ────────────────────────────────────────────────────────────
// Migration memo (left in the repo during the 0.1.2 era):
//   "Keep @deepseek-ai/dsh-client-runtime in the client inject — the browser
//    half still imports its ClientContext type, and type imports need the
//    package present in the client graph."
// ────────────────────────────────────────────────────────────
//
// 0.1.2-era type surface: the client context type comes from the client
// runtime package; the ctx.slots merge and the locale runtime arrive with it.

export const name = 'bench-mcpanel-client'

// slots (settings.section tab) + locale (panel copy zh/en).
export const inject = ['slots', 'locale']

// The panel component (server list + add/edit form + per-server tool browse)
// is elided; the slot renderer mounts it as a function component.
function mcpanelStub() {
  return null
}

/**
 * Register the settings-page "MCP" panel.
 * @param {import('@deepseek-ai/dsh-client-runtime/client').ClientContext} ctx
 */
export function apply(ctx) {
  // Plugin-own copy namespace, following DSH's native zh/en.
  ctx.effect(
    () => ctx.locale.register('dsh-plugin-mcp-manager', {
      zh: { heading: 'MCP 服务器', add: '新增服务器' },
      en: { heading: 'MCP servers', add: 'Add server' },
    }),
    'bench-mcpanel-client: own copy namespace',
  )

  // The settings.section tab registration (real call shape).
  ctx.slots.inject('settings.section', () =>
    ctx.slots.register({
      name: 'settings.section',
      id: 'bench-mcpanel',
      order: 61,
      label: () => 'MCP',
      locale: 'dsh-plugin-mcp-manager',
      inject: () => ({}),
    }, mcpanelStub))

  // Elided: the better-locale override dicts registration (re-synced on every
  // locale revision bump; optional service, no runtime dependency).
}
