// Host half (minimal) — migrated to 0.1.2-alpha.2 (mirrors
// @huanlin/dsh-plugin-better-locale 6770ca4): the plugin is now a pure
// language pack for the native third-language API; the host half stays a
// no-op stub and the client inject narrows to the single locale module.

export const name = 'bench-locale-pack'

// Client-only plugin: the host half declares no injections.
export const inject = []

/**
 * Host apply — no-op. Everything the browser half registers lives in the
 * native language API (catalog entries + namespace dictionaries).
 * @param {import('@deepseek-ai/cordis').Context} ctx
 */
export function apply(ctx, config) {
  console.error('[bench-locale-pack] host apply(): client-only language pack; the browser half registers every bundled language through the native third-language API')

  ctx.effect(() => {
    console.error('[bench-locale-pack] no host-plane registrations (the language pack is client-only)')
  }, 'bench-locale-pack: host')
}
