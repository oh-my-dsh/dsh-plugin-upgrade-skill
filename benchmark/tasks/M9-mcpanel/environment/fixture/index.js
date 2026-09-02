// 0.1.2-era cohort (pre v0.1.2-alpha.1): the host half is the write-side of the
// MCP-server registry — it edits the mcp-client insert rows in the profile
// cordis.patch.yml and the loader's config HMR mounts/unmounts/hot-swaps the
// official mcp-client instances. The connection lifecycle is fully delegated
// to @deepseek-ai/dsh-mcp-client; this plugin only writes the patch rows.
//
// The real host body (the yaml registry read/write layer, the
// /api/mcp-manager webServer routes for the browser panel, and the agent-side
// mcp_* tools registered through ctx.tools) is elided in this fixture — the
// exam is the client plane + the peer cohort.

export const name = 'bench-mcpanel'

// Host half: the tools service registers the mcp_* management tools and feeds
// schemas() to the panel's tool browse. (The real plugin also injects
// 'webServer' for its HTTP routes; elided here.)
export const inject = ['tools']

/**
 * @param {import('cordis').Context} ctx
 */
export function apply(ctx, config) {
  console.error('[bench-mcpanel] apply() on the 0.1.2-era cohort: bare cordis Context; client plane still on the client-runtime package')

  ctx.effect(() => {
    console.error('[bench-mcpanel] host half active: mcp-client insert rows in the profile cordis.patch.yml + /api/mcp-manager routes + mcp_* tools (real body elided)')
  }, 'bench-mcpanel: host')
}
