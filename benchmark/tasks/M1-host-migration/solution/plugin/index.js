// 0.1.2-alpha.2 migration version — locate the change via the skill card, then migrate plane by plane:
//   ALPHA1-01: APIProxy removed entirely.
//     · host plane (the plane this plugin originally lived in): no longer goes through the gateway facade;
//       inject the domain service directly — inject "apiProxy" → inject "llm"; llm.providers → ctx.llm.listProviders()
//     · client plane (browser plugin): inject "remote", go through ctx.remote.llm.listProviders()
//       (never rejects; business failures are judged by result.ok === false — ALPHA2-02)
//   Also: remove the dependency @deepseek-ai/dsh-host-apiproxy (the SDK package was removed as of alpha.1)
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
