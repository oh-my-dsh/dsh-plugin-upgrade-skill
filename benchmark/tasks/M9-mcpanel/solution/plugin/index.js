// 0.1.2-alpha.2 migration (mirrors @huanlin/dsh-plugin-mcp-manager e196302):
//   - the Context type comes from @deepseek-ai/cordis (bare cordis is gone
//     from the peer block and the type surface);
//   - the client plane is recomposed off the deleted client-runtime package
//     (card DSH-0.1.2-A1-25) — see client.js;
//   - the host half's role is unchanged: it writes the mcp-client insert rows
//     into the profile cordis.patch.yml (config HMR) and serves the panel's
//     HTTP routes; the real yaml-writing body is elided in this fixture.

export const name = 'bench-mcpanel'

// Host half: the tools service registers the mcp_* management tools and feeds
// schemas() to the panel's tool browse. (The real plugin also injects
// 'webServer' for its HTTP routes; elided here.)
export const inject = ['tools']

/**
 * @param {import('@deepseek-ai/cordis').Context} ctx
 */
export function apply(ctx, config) {
  console.error('[bench-mcpanel] apply() on the 0.1.2-alpha.2 cohort: scoped cordis Context; client plane recomposed off the runtime split')

  ctx.effect(() => {
    console.error('[bench-mcpanel] host half active: mcp-client insert rows in the profile cordis.patch.yml + /api/mcp-manager routes + mcp_* tools (real body elided)')
  }, 'bench-mcpanel: host')
}
