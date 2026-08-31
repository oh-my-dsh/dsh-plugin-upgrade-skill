// 0.1.2-alpha.2 迁移版 —— 按 skill 卡片定位变更后分平面迁移：
//   ALPHA1-01: APIProxy 整体移除。
//     · host 平面（本插件原所在平面）：不再走网关门面，直接注入领域服务
//       inject "apiProxy" → inject "llm"；llm.providers → ctx.llm.listProviders()
//     · client 平面（浏览器插件）：inject "remote"，走 ctx.remote.llm.listProviders()
//       （永不 reject，业务失败判 result.ok === false —— ALPHA2-02）
//   另：删除依赖 @deepseek-ai/dsh-host-apiproxy（SDK 包已随 alpha.1 移除）
export const inject = ["llm"]

export function apply(ctx) {
  console.error("[upgrade-demo] apply() 执行 — 已迁移到 host 领域服务直连")
  ctx.effect(async () => {
    const providers = ctx.llm.listProviders()
    const configurable = ctx.llm.listConfigurableProviders()
    console.error("[upgrade-demo] llm.listProviders() 成功 → 路由数:", providers.length,
      "；可配置提供方:", configurable.length)
  })
}
