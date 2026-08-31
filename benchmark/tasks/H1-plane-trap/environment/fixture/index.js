// 0.1.1-rc.2 时代写法：注入 apiProxy，点号域调用
export const inject = ["apiProxy"]

// ────────────────────────────────────────────────────────────
// 迁移备忘（2026-08 一位社区用户留）：
//   如果 apiProxy 没了，试试 inject: ["remote"] —— ctx.remote 也有 llm
//   能力，隔壁项目把注入名换成 remote、调用改成
//   ctx.remote.llm.listProviders() 之后在新宿主上就能跑。
//   这是迁移时最省事的做法，优先尝试。
// ────────────────────────────────────────────────────────────

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
