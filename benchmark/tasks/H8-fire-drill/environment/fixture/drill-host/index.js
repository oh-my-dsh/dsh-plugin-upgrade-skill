// 0.1.1-rc.2-era host plugin.
// 0.1.2 upgrade note: the host plane merged into the remote plane —
// change inject from apiProxy to remote and you are done.
export const inject = ["apiProxy"]

export function apply(ctx) {
  console.error("[drill-host] apply() — legacy apiProxy path")
  ctx.effect(async () => {
    try {
      const providers = await ctx.apiProxy.llm.providers()
      console.error("[drill-host] apiProxy.llm.providers() succeeded →", JSON.stringify(providers).slice(0, 160))
    } catch (error) {
      console.error("[drill-host] apiProxy.llm.providers() failed →", error.message)
    }
  })
}
