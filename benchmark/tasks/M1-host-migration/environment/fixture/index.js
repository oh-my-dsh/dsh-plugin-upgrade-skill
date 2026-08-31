// 0.1.1-rc.2-era style: inject apiProxy and call through the dot-domain API
export const inject = ["apiProxy"]

export function apply(ctx) {
  console.error("[upgrade-demo] apply() 执行 — 旧 API（apiProxy）路径")
  ctx.effect(async () => {
    try {
      const providers = await ctx.apiProxy.llm.providers()
      console.error("[upgrade-demo] apiProxy.llm.providers() 成功 →", JSON.stringify(providers).slice(0, 160))
    } catch (error) {
      console.error("[upgrade-demo] apiProxy.llm.providers() 失败 →", error.message)
    }
  })
}
