// 0.1.2-alpha.2 migration (mirrors @huanlin/dsh-plugin-ya-workspace-sidebar
// 85f725a + a3f317d) — host half.
//   - bare `cordis` is no longer the host contract → Context type moves to
//     @deepseek-ai/cordis.
//   - The host plane is a thin stub for a browser-only plugin: the real host
//     half (the session-title projection write-behind workaround) is elided —
//     the exam is the client plane (the workspace browser takeover).

export const name = 'bench-workspace-ya'

// Host half: no runtime service injection — the browser-only plugin's host
// half only rides the lifecycle.
//
/**
 * @param {import('@deepseek-ai/cordis').Context} ctx
 */
export function apply(ctx) {
  console.error('[bench-workspace-ya] apply() on the 0.1.2-alpha.2 cohort: @deepseek-ai/cordis Context; the composition lives in the browser half')

  ctx.effect(() => {
    console.error('[bench-workspace-ya] host stub active; the session-title write-behind body is elided (client plane is the exam)')
  }, 'bench-workspace-ya: host')
}
