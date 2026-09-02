// 0.1.2-alpha.1 migration (mirrors @huanlin/dsh-plugin-tools-manager 4d70dfa):
// the host plane is unchanged — it was already written against the scoped
// @deepseek-ai/cordis Context and declares its service surface type-only from
// dsh-host-webserver / dsh-tools. The migration is on the client plane: the
// deleted client-runtime ClientContext moves to the cordis Context, and the
// ctx.slots service is rewired to its post-split owner (see client.js).
//
// The real host body (registry + policy + gateway) is elided in this fixture;
// its shape, for reference:
//   - ToolRegistry attributes each registered tool to its source plugin by
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
  console.error('[bench-tools-tree] apply() on the 0.1.2-alpha.2 cohort: client plane recomposed off the runtime split (slots service from ui-renderer)')

  ctx.effect(() => {
    console.error('[bench-tools-tree] host half active: tool registry + enable/disable policy + /tools-manager/api gateway (real body elided)')
  }, 'bench-tools-tree: host')
}
