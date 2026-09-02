// Host half (minimal) — migrated to 0.1.2-alpha.2 (mirrors
// @huanlin/dsh-plugin-merge-tool-calls 720a077):
//   - bare `cordis` is no longer the host contract → the Context type moves
//     to @deepseek-ai/cordis and the bare `cordis` peer is removed;
//   - the client inject list is recomposed to the six alpha-cohort modules
//     (locale, ui-renderer, ui-tool, ui-chat, ui-slots, ui-primitives); the
//     deleted runtime module is gone from the list, so the web tree composes.

export const name = 'bench-merge-calls'

// Client-only plugin: the host half declares no injections (the toolview
// takeover is a browser-side slot contribution).
export const inject = []

// Config defaults applied by the (elided) schemastery schema — these are the
// row's runtime defaults: empty `tools` = merge every built-in
// generic-family tool; `adjacent` merges any consecutive run in the chat
// flow; at most 8 calls per merged group.
const DEFAULT_MERGE_CONFIG = { tools: [], groupBy: 'adjacent', maxGroupSize: 8 }

/**
 * Host apply — no-op: all registrations live in the browser half.
 * @param {import('@deepseek-ai/cordis').Context} ctx - scoped-cordis cohort (unused).
 */
export function apply(ctx, config) {
  const cfg = { ...DEFAULT_MERGE_CONFIG, ...config }
  console.error(`[bench-merge-calls] host apply(): client-only toolview takeover (tools=${JSON.stringify(cfg.tools)}, groupBy=${cfg.groupBy}, maxGroupSize=${cfg.maxGroupSize})`)

  ctx.effect(() => {
    console.error('[bench-merge-calls] no host-plane registrations (the merged tool rows are client-only)')
  }, 'bench-merge-calls: host')
}
