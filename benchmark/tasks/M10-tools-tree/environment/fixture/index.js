// 0.1.0-era cohort (pre v0.1.2-alpha.1): the host half was already written
// against the scoped @deepseek-ai/cordis Context — the migration is entirely
// on the client plane.
//
// The real host body is elided in this fixture; its shape, for reference:
//   - ToolRegistry: attributes each registered tool to its source plugin by
//     snapshot-diffing ctx.tools.schemas() on every tools/change;
//   - two-layer enable/disable gate: system-prompt/assemble hides disabled
//     tools from the model, ctx.tools.guard() denies their execution;
//   - /tools-manager/api/list|set HTTP gateway for the browser panel;
//   - the disabled set persists through the `tools-manager` settings
//     namespace in $DSH_HOME/settings.yaml (no restart needed).

export const name = 'bench-tools-tree'

// Host half: tools (registry + guard), webServer (the HTTP gateway), and
// systemPrompt (the assemble hook that hides disabled tools from the model).
export const inject = ['tools', 'webServer', 'systemPrompt']

/**
 * @param {import('@deepseek-ai/cordis').Context} ctx
 */
export function apply(ctx, config) {
  console.error('[bench-tools-tree] apply() on the 0.1.0-era cohort: client plane still typed against the client-runtime ClientContext')

  ctx.effect(() => {
    console.error('[bench-tools-tree] host half active: tool registry + enable/disable policy + /tools-manager/api gateway (real body elided)')
  }, 'bench-tools-tree: host')
}
