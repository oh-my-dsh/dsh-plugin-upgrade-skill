// 0.1.2-alpha.2 migration (mirrors @huanlin/dsh-plugin-sidebar-brand-text
// 81d9d46): the host half is unchanged across the migration — the break is on
// the browser plane (snapshot-store engine move, client inject recomposition,
// peer cohort). The settings namespace + HTTP gateway registration stay as-is.

export const name = 'bench-brand-text'

// `webServer` is required for the HTTP gateway that backs the settings card.
export const inject = ['webServer']

/**
 * Plugin body: install the settings bridge and register the HTTP gateway.
 * @param {import('@deepseek-ai/cordis').Context} ctx
 * @param {unknown} config - resolved config (seed values: name, revision).
 */
export function apply(ctx, config) {
  console.error('[bench-brand-text] host apply(): settings namespace + /bench-brand-text/api gateway')

  ctx.effect(() => {
    // The settings bridge + HTTP gateway registration is elided in this
    // fixture (unchanged across the migration; never the exam surface).
    console.error(`[bench-brand-text] gateway /bench-brand-text/api registered (config: ${JSON.stringify(config ?? {})})`)
  }, 'bench-brand-text: gateway')
}
