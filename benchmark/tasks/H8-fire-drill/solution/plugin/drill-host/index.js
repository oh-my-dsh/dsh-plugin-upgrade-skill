// 0.1.2-alpha.2 migrated: the host plane injects the llm domain service directly.
// APIProxy was removed entirely; the client side of this capability moved to @Remote
// (DSH-0.1.2-A1-01). The "inject remote" advice in the old comment is the wrong plane.
export const inject = ["llm"]

export function apply(ctx) {
  console.error("[drill-host] apply() — migrated to the llm domain service")
  ctx.effect(async () => {
    const providers = ctx.llm.listProviders()
    console.error("[drill-host] llm.listProviders() succeeded → routes:", providers.length)
  })
}
