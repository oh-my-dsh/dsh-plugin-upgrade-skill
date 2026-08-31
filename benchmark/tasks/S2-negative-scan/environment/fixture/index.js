// 最小插件：只命中 #3（内部服务/Remote）一类触点。
// 0.1.1-rc.2 写法：注入 apiProxy，点号域调用。
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
