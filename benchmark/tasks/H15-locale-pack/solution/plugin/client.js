// Browser half — migrated to 0.1.2-alpha.2 (mirrors
// @huanlin/dsh-plugin-better-locale 6770ca4): a pure language pack for the
// native third-language API. For every bundled language ONE ctx.effect
// registers the catalog entry through ctx.locale.addLanguage({ id, label,
// fallback }) and all of its namespace dictionaries through the single-locale
// form ctx.locale.register(ns, language.id, dict); the effect's disposer
// removes exactly what was added, so HMR / fiber disposal unwinds cleanly.
//
// What the native API takes over (all of the 0.1.x machinery is DELETED, not
// kept alongside it):
//   - the lookup patch: addLanguage + the single-locale register overload
//     replace the wrapped-lookup chain entirely — keeping the patch next to
//     addLanguage would be double registration;
//   - selection UI: added languages appear in DSH's own Language row
//     (Settings → General), so the custom settings row is deleted;
//   - persistence: setLocale writes the durable locale.preference setting —
//     the localStorage branch disappears with the patch;
//   - <html lang> sync, locale/change emission, and per-key fallback along
//     the declared fallback chain (third language → en);
//   - third-party dictionaries: register through register(ns, locale, dict)
//     directly — no ctx.betterLocale service is published anymore.
//
// The plugin has no UI of its own and no runtime DSH imports; the DSH
// reference is type-only and erased at build time:
//   import type { Context } from '@deepseek-ai/cordis'
//   import type {} from '@deepseek-ai/dsh-client-locale/client'

export const name = 'bench-locale-pack-client'

/** Required services: the locale service (catalog + dictionary registry). */
export const inject = ['locale']

/**
 * Bundled languages — 3 of the real 19 (real metadata; dictionaries carry
 * 2 distilled real keys each; the real dicts ship ~893 keys per language
 * and are elided). Missing keys resolve through the per-key fallback chain
 * (declared fallback → en) — no per-language copy row is needed.
 */
const BUNDLED_LANGUAGES = [
  { id: 'ja', label: '日本語', fallback: 'en', dicts: { common: { ok: 'OK', cancel: 'キャンセル' } } },
  { id: 'ko', label: '한국어', fallback: 'en', dicts: { common: { cancel: '취소' }, 'settings.locale': { 'language.title': '언어' } } },
  { id: 'fr', label: 'Français', fallback: 'en', dicts: { common: { ok: 'OK', cancel: 'Annuler' }, 'settings.locale': { 'language.title': 'Langue' } } },
]

/**
 * Client plugin body: register every bundled language's catalog entry and
 * dictionaries, one ctx.effect per language.
 * @param {import('@deepseek-ai/cordis').Context} ctx
 */
export function apply(ctx) {
  console.error('[bench-locale-pack-client] apply() on the 0.1.2-alpha.2 cohort: native language pack (addLanguage + register(ns, locale, dict))')

  for (const language of BUNDLED_LANGUAGES) {
    ctx.effect(() => {
      const disposers = [
        ctx.locale.addLanguage({ id: language.id, label: language.label, fallback: language.fallback }),
        ...Object.entries(language.dicts).map(([ns, dict]) => ctx.locale.register(ns, language.id, dict)),
      ]
      return () => {
        for (const dispose of disposers) dispose()
      }
    }, `bench-locale-pack: language ${language.id}`)
  }
}
