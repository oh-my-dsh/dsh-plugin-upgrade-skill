// Minimal plugin: hits only one touchpoint category, #3 (internal service/Remote).
// 0.1.1-rc.2 style: injects apiProxy, dot-domain calls.
export const inject = ["apiProxy"]

export function apply(ctx) {
  console.error("[minimal-llm] apply() 执行 — 旧 API（apiProxy）路径")
  ctx.effect(async () => {
    try {
      const providers = await ctx.apiProxy.llm.providers()
      console.error("[minimal-llm] apiProxy.llm.providers() 成功 →", JSON.stringify(providers).slice(0, 160))
    } catch (error) {
      console.error("[minimal-llm] apiProxy.llm.providers() 失败 →", error.message)
    }
  })
}
