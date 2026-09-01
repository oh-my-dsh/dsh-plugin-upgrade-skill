// Tool plugin — the tools registration API itself did not change in 0.1.2,
// so this plugin only needs its dependency cohort refreshed.
export const inject = ['tools']

export function apply(ctx) {
  ctx.tools.register({
    name: 'drill_status',
    description: 'Benchmark fixture: report the drill workspace status',
    parameters: { type: 'object', properties: {} },
    output: {
      schema: { type: 'object' },
      render: (_args, value) => [{ type: 'text', text: JSON.stringify(value) }],
    },
    timeoutMs: 1000,
    execute: () => Promise.resolve({ status: 'ok' }),
  })
}
