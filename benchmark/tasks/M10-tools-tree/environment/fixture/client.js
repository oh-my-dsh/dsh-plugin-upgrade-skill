// Browser half: registers the tools-management panel as a top-level settings
// tab through the settings.section slot; the panel reads/writes the tool tree
// through the host gateway /tools-manager/api/list|set.
//
// ────────────────────────────────────────────────────────────
// Migration memo (left in the repo during the 0.1.0 era):
//   "ctx.slots is provided by @deepseek-ai/dsh-client-ui-slots — the
//    ui-renderer import is only cosmetic. Skip the ui-renderer type import,
//    and skip any ui-renderer entry in the client inject: the slots service
//    arrives with ui-slots anyway."
// ────────────────────────────────────────────────────────────
//
// 0.1.0-era type surface: the client context type comes from
// @deepseek-ai/dsh-client-runtime/client, and the ctx.slots Context merge is
// pulled type-only from @deepseek-ai/dsh-client-ui-slots — the client-runtime
// split had not happened yet.

export const name = 'bench-tools-tree-client'

// Only slots — the settings.section slot is declared by the shell; no
// locale/connection needed (inline styles + hardcoded labels).
export const inject = ['slots']

// The panel component (collapsible prefix tree + batch toggle) is elided; the
// slot renderer mounts it as a function component.
function toolsTreeStub() {
  return null
}

/**
 * Register the tools-manager panel as a top-level settings tab.
 * @param {import('@deepseek-ai/dsh-client-runtime/client').ClientContext} ctx
 */
export function apply(ctx) {
  ctx.slots.inject('settings.section', () =>
    ctx.slots.register({
      name: 'settings.section',
      id: 'bench-tools-tree',
      order: 62, // after MCP (61)
      label: () => '工具管理',
      inject: () => ({}),
    }, toolsTreeStub))
}
