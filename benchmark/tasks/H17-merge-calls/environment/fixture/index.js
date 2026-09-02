// Host half (minimal): the plugin is browser-only — it shadows the shipped
// `read`/`grep`/`glob` toolviews inside the `tool.call.toolview` slot (see
// client.js). The host half exists to declare the validated config shape for
// the bundle row; its apply is intentionally empty.
//
// 0.1.1-era cohort (pre v0.1.2-alpha): the config schema is declared with
// schemastery in the real plugin (a host-side value import, elided here);
// the browser half pulled its client context type and the chat node types
// from the client-runtime package. The in-source migration memo lives in
// client.js — do not take it at face value.

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
 * @param {import('cordis').Context} ctx - bare-cordis cohort (unused).
 */
export function apply(ctx, config) {
  const cfg = { ...DEFAULT_MERGE_CONFIG, ...config }
  console.error(`[bench-merge-calls] host apply(): client-only toolview takeover (tools=${JSON.stringify(cfg.tools)}, groupBy=${cfg.groupBy}, maxGroupSize=${cfg.maxGroupSize})`)

  ctx.effect(() => {
    console.error('[bench-merge-calls] no host-plane registrations (the merged tool rows are client-only)')
  }, 'bench-merge-calls: host')
}
