// 0.1.1-era cohort (pre v0.1.2-alpha): the host contract was bare `cordis`,
// and the browser half's workspace/session types lived in the runtime
// package's /client entry.
//
// Host half for the browser-only workspace replacement. The real host plane
// is the session-title projection write-behind workaround (a `session/title`
// listener that writes title-only rows straight into the session_projcache
// store, debounced and fail-soft); its body is elided — the exam is the
// client plane (the workspace browser takeover), not the host half.

export const name = 'bench-workspace-ya'

/**
 * @param {import('cordis').Context} ctx
 */
export function apply(ctx) {
  console.error('[bench-workspace-ya] apply() on the 0.1.1-era cohort: bare cordis Context, runtime-package client plane')

  ctx.effect(() => {
    console.error('[bench-workspace-ya] host stub active; the session-title write-behind body is elided in the fixture')
  }, 'bench-workspace-ya: host')
}
