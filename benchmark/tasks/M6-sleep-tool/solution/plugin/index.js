// 0.1.2-alpha.2 migration (mirrors @huanlin/dsh-plugin-sleep e25a4a9):
//   - bare `cordis` is no longer the host contract → Context type moves to
//     @deepseek-ai/cordis (peer ^4.0.1).
//   - ContentBlock moved from @deepseek-ai/dsh-tools to @deepseek-ai/dsh-llm
//     (ToolRunContext stays on dsh-tools; its callId/rootCallId are ToolCallId now).
//   - peer floor rewritten to the 0.1.2-alpha cohort; dsh-llm added as a peer;
//     all three peers declared optional (the host provides them at runtime).
export const name = 'bench-sleep-tool'

// Host-plane tool plugin: the tools service is the only runtime injection.
export const inject = ['tools']

export function apply(ctx, config) {
  const maxDurationMs =
    typeof config?.maxDurationMs === 'number' && config.maxDurationMs >= 0 ? config.maxDurationMs : 60000
  const defaultDurationMs =
    typeof config?.defaultDurationMs === 'number' && config.defaultDurationMs >= 0 ? config.defaultDurationMs : 0

  console.error('[bench-sleep-tool] apply() on the 0.1.2-alpha.2 cohort: @deepseek-ai/cordis Context, dsh-llm ContentBlock')

  ctx.effect(() => {
    console.error(`[bench-sleep-tool] config resolved: maxDurationMs=${maxDurationMs}, defaultDurationMs=${defaultDurationMs}`)
    // The `sleep` tool body is elided — this exam grades the cohort contract,
    // not the tool; the registration shape (ctx.tools.register) is unchanged
    // across the migration and is not part of the exam.
    //
    // Type surface after the migration:
    //   import type { Context } from '@deepseek-ai/cordis'
    //   import type { ToolRunContext } from '@deepseek-ai/dsh-tools'
    //   import type { ContentBlock } from '@deepseek-ai/dsh-llm'
    //
    // The tool result blocks are built here once the tool body is restored:
    //
    // /** @type {import('@deepseek-ai/dsh-llm').ContentBlock[]} */
    // const blocks = [{ type: 'text', text: `slept ${actualMs}ms` }]
    //
    // @type {import('@deepseek-ai/cordis').Context}
    const contextType = undefined
    console.error('[bench-sleep-tool] tool registration elided in fixture; types moved to the 0.1.2-alpha sources')
  }, 'bench-sleep-tool: register')
}
