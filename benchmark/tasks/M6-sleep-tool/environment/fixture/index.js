// 0.1.1-era cohort (pre v0.1.2-alpha): the host contract was bare `cordis`,
// and ContentBlock/ToolRunContext lived in @deepseek-ai/dsh-tools.
//
// ────────────────────────────────────────────────────────────
// Migration memo (left in the repo during the 0.1.1 era):
//   "@deepseek-ai/cordis is just a scoped alias of the same runtime — the
//    loader still provides bare `cordis`, so keep the bare import and only
//    touch what refuses to load. Least-diff migration, zero behavior change."
// ────────────────────────────────────────────────────────────

export const name = 'bench-sleep-tool'

// Host-plane tool plugin: the tools service is the only injection.
export const inject = ['tools']

export function apply(ctx, config) {
  const maxDurationMs =
    typeof config?.maxDurationMs === 'number' && config.maxDurationMs >= 0 ? config.maxDurationMs : 60000
  const defaultDurationMs =
    typeof config?.defaultDurationMs === 'number' && config.defaultDurationMs >= 0 ? config.defaultDurationMs : 0

  console.error('[bench-sleep-tool] apply() on the 0.1.1-era cohort: bare cordis Context, dsh-tools ContentBlock')

  ctx.effect(() => {
    console.error(`[bench-sleep-tool] config resolved: maxDurationMs=${maxDurationMs}, defaultDurationMs=${defaultDurationMs}`)
    // The `sleep` tool body is elided — this exam grades the cohort contract,
    // not the tool; the registration shape (ctx.tools.register) is unchanged
    // across the migration and is not part of the exam.
    //
    // Type surface as it stands (type-only, erased at build time — this is
    // where the two cohort breaks live):
    //   import type { Context } from 'cordis'
    //   import type { ToolRunContext, ContentBlock } from '@deepseek-ai/dsh-tools'
    //
    // The tool result blocks are built here once the tool body is restored:
    //
    // /** @type {import('@deepseek-ai/dsh-tools').ContentBlock[]} */
    // const blocks = [{ type: 'text', text: `slept ${actualMs}ms` }]
    //
    // @type {import('cordis').Context}
    const contextType = undefined
    console.error('[bench-sleep-tool] tool registration elided in fixture; types stay on the 0.1.1-era sources')
  }, 'bench-sleep-tool: register')
}
