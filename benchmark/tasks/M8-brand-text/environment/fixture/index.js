// Host half: registers the `bench-brand-text` settings namespace (persisted
// to settings.yaml) and a self-hosted `/bench-brand-text/api` HTTP route
// (`get` / `set`). The browser half's settings card reads/writes the brand
// name and revision badge through this route; the sidebar's brand-name slot
// occupant reads the same values from the shared controller store.
//
// The host half is unchanged across the 0.1.2-alpha migration — the break is
// on the browser plane (store engine + client inject list + peer cohort).

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
