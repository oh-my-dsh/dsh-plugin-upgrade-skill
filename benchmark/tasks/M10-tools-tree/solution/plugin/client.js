// Browser half — migrated to 0.1.2-alpha.1 (mirrors the real 4d70dfa):
//   - the client context type comes from @deepseek-ai/cordis (Context); the
//     ClientContext type of the deleted runtime package is gone (card
//     DSH-0.1.2-A1-25);
//   - the ctx.slots Context merge (SlotRegistry) lives in the ui-renderer
//     package since the client-runtime split, and the 'settings.section'
//     SlotMap entry in ui-settings — both are pulled type-only below. The old
//     in-source memo ("ctx.slots arrives with ui-slots; the ui-renderer import
//     is only cosmetic — skip it and the inject entry") was a trap: without the
//     ui-renderer wiring the slots service is absent and the panel registration
//     pends on 'slots'.
//   - the client inject list drops the deleted runtime package and keeps the
//     two surviving platform modules.

export const name = 'bench-tools-tree-client'

// Only slots — the settings.section slot is declared by the shell; no
// locale/connection needed (inline styles + hardcoded labels).
export const inject = ['slots']

// Type-only Context merges (erased at build; values arrive via injection):
//
//   import type { Context } from '@deepseek-ai/cordis'
//   // Type-only: pulls the ctx.slots Context merge (SlotRegistry) — the runtime
//   // service lives in ui-renderer since the client-runtime split (v0.1.2-alpha.1).
//   import type {} from '@deepseek-ai/dsh-client-ui-renderer/client'
//   // Type-only: pulls the SlotMap merge declaring 'settings.section' (the slot
//   // this plugin registers into).
//   import type {} from '@deepseek-ai/dsh-client-ui-settings/client'

// The panel component (collapsible prefix tree + batch toggle) is elided; the
// slot renderer mounts it as a function component.
function toolsTreeStub() {
  return null
}

/**
 * Register the tools-manager panel as a top-level settings tab.
 * @param {import('@deepseek-ai/cordis').Context} ctx
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
