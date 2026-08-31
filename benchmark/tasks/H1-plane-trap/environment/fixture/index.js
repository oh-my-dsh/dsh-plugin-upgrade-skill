// 0.1.1-rc.2 era style: inject apiProxy and call through its dotted domain
export const inject = ["apiProxy"]

// ────────────────────────────────────────────────────────────
// Migration memo (left by a community user in 2026-08):
//   If apiProxy is gone, try inject: ["remote"] — ctx.remote also has llm
//   capabilities; a neighboring project switched its injection name to
//   remote and changed the calls to ctx.remote.llm.listProviders(),
//   and it ran on the new host. This is the least-effort approach
//   during migration — try it first.
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
