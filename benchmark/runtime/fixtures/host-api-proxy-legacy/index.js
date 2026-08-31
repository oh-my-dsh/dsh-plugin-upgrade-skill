// Red control for DSH-0.1.2-A1-01: this is the real rc.2 Host-plane contract.
export const inject = ['apiProxy']

export function apply(ctx) {
  ctx.effect(async () => {
    const response = await ctx.apiProxy.llm.providers({
      rpcId: 'dsh-upgrade-fixture',
      payload: {},
    })
    if (!response?.result?.ok || !Array.isArray(response.result.value?.providers)) {
      throw new Error('legacy apiProxy provider probe returned an invalid response')
    }
    console.error(`[dsh-upgrade-fixture] legacy-api-proxy-ok providers=${response.result.value.providers.length}`)
  })
}
