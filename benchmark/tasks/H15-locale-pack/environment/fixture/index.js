// Host half (minimal): the language-override layer is a client-only
// contribution — the host half has no runtime work (mirrors the real
// plugin's src/index.ts).
//
// 0.1.1-era cohort (pre v0.1.2-alpha): the browser half pulled its client
// context type from the client-runtime package, and third languages could
// only enter the UI by patching the locale runtime's lookup chain.

export const name = 'bench-locale-pack'

// Client-only plugin: the host half declares no injections.
export const inject = []

/**
 * Host apply — no-op. The override layer is mounted entirely by the browser
 * half (lookup patch + custom settings row + per-language dictionaries).
 * @param {import('@deepseek-ai/cordis').Context} ctx
 */
export function apply(ctx, config) {
  console.error('[bench-locale-pack] host apply(): client-only language-override plugin; the browser half patches the locale runtime and registers the switcher row')

  ctx.effect(() => {
    console.error('[bench-locale-pack] no host-plane registrations (the language override layer is client-only)')
  }, 'bench-locale-pack: host')
}
