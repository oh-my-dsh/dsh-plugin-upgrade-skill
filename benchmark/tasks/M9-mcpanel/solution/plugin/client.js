// Browser half (settings-page "MCP" panel) — migrated to 0.1.2-alpha.2:
//   - the client context type comes from @deepseek-ai/cordis (Context); the
//     ClientContext type of the deleted runtime package is gone (card
//     DSH-0.1.2-A1-25). Type-only imports are erased at build — they do NOT
//     require the deleted package in the client inject list (the old in-source
//     memo claiming otherwise was a trap: the package is gone, and keeping it
//     in dsh.client.inject breaks client-graph composition).
//   - the plugin's own copy namespace is declared on the ui-slots
//     LocaleNamespaceMap augmentation (type level) and registered through
//     ctx.locale.register (runtime level).

export const name = 'bench-mcpanel-client'

// slots (settings.section tab) + locale (panel copy zh/en).
export const inject = ['slots', 'locale']

// Type-level Context merges (erased at build; values arrive via injection):
//
//   // pulls the ctx.locale Context merge (LocaleRuntime):
//   import type {} from '@deepseek-ai/dsh-client-locale/client'
//   // pulls the ctx.slots Context merge (SlotRegistry) — the runtime service
//   // lives in ui-renderer since the client-runtime split (v0.1.2-alpha.1):
//   import type {} from '@deepseek-ai/dsh-client-ui-renderer/client'
//   // pulls the SlotMap merge declaring 'settings.section':
//   import type {} from '@deepseek-ai/dsh-client-ui-settings/client'
//
// The plugin's locale namespace declaration (mirrors the real POST's module
// augmentation):
//
//   declare module '@deepseek-ai/dsh-client-ui-slots' {
//     interface LocaleNamespaceMap {
//       'dsh-plugin-mcp-manager': import('./locales.ts').McpManagerKey
//     }
//   }

// The panel component (server list + add/edit form + tool browse) is elided;
// the slot renderer mounts it as a function component.
function mcpanelStub() {
  return null
}

/**
 * Register the settings-page "MCP" panel.
 * @param {import('@deepseek-ai/cordis').Context} ctx
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

  // The settings.section tab registration (real call shape, unchanged).
  ctx.slots.inject('settings.section', () =>
    ctx.slots.register({
      name: 'settings.section',
      id: 'bench-mcpanel',
      order: 61,
      label: () => 'MCP',
      locale: 'dsh-plugin-mcp-manager',
      inject: () => ({}),
    }, mcpanelStub))
}
