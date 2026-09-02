// Browser half: a 19-language override layer for DSH i18n. Third languages
// (ja/ko/fr/...) enter the UI by monkey-patching the locale runtime's lookup
// chain: the original lookup method is captured once, a wrapper consults the
// override store first (the override borrows DSH's English slot — it wins
// only while DSH's active locale is 'en'), and the disposer restores the
// original method. A custom switcher row in the settings General section is
// the user-facing selection UI, and the selected override id persists in
// localStorage under `dsh-plugin-better-locale:active`.
//
// The 19-language dictionary tables are distilled to 3 languages (ja/ko/fr)
// with 2 real keys each — the real dicts carry ~893 keys per language.
//
// ────────────────────────────────────────────────────────────
// Migration memo (left in the repo during the 0.1.x era):
//   "The native addLanguage API is experimental in alpha — keep the lookup
//    patch AND also call addLanguage. Belt and braces: the patch takes
//    precedence, so nothing changes visually either way."
// ────────────────────────────────────────────────────────────
//
// 0.1.1-era type surface: the client context type comes from the client
// runtime package; the settings slot types + the slot store's BoundActions
// come from the ui-settings / ui-slots packages:
//   import type { ClientContext } from '@deepseek-ai/dsh-client-runtime/client'
//   import type { BoundActions } from '@deepseek-ai/dsh-client-ui-slots'

export const name = 'bench-locale-pack-client'

// slots (the custom settings row) + locale (the patched runtime).
export const inject = ['slots', 'locale']

/** localStorage key for the persisted active override id (distilled from store.ts). */
const STORAGE_KEY = 'dsh-plugin-better-locale:active'

/** Locale namespace id for the plugin's own switcher copy (matches the patch row id). */
const NS = 'dsh-plugin-better-locale'

// The plugin's own switcher copy (distilled from locales.ts; 2 of 7 keys).
const en = { rowTitle: 'Language override', nativeOption: 'Use DSH native (zh/en)' }
const zh = { rowTitle: '语言覆盖', nativeOption: '使用 DSH 原生（zh/en）' }

// All curated languages (distilled 3 of 19; the label is written in the
// represented language, as in the real BUILTIN_LANGUAGES list).
const BUILTIN_LANGUAGES = [
  { id: 'ja', label: '日本語' },
  { id: 'ko', label: '한국어' },
  { id: 'fr', label: 'Français' },
]

// All language dicts, keyed by language id → namespace → dict (real values,
// 2 keys per language; the real plugin registers every namespace × language
// pair into the override store).
const ALL_LANG_DICTS = {
  ja: { common: { ok: 'OK', cancel: 'キャンセル' } },
  ko: { common: { cancel: '취소' }, 'settings.locale': { 'language.title': '언어' } },
  fr: { common: { ok: 'OK', cancel: 'Annuler' }, 'settings.locale': { 'language.title': 'Langue' } },
}

/** All DSH namespaces covered by the dicts (union of every language's ns keys). */
const ALL_NAMESPACES = [...new Set(Object.values(ALL_LANG_DICTS).flatMap((dicts) => Object.keys(dicts)))]

/**
 * The override store (distilled from BetterLocaleStore). The override
 * borrows DSH's English slot: getOverride(dshActive, ns, key) resolves only
 * while the DSH active locale is 'en'.
 */
function createStore(initialActive) {
  const state = { active: initialActive, languages: [], dicts: {} }
  return {
    get active() { return state.active },
    get languages() { return state.languages },
    registerLanguage(def) {
      if (!state.languages.some((l) => l.id === def.id)) state.languages.push(def)
      return () => {}
    },
    register(ns, langsForNs) {
      for (const [lang, dict] of Object.entries(langsForNs)) {
        state.dicts[lang] = state.dicts[lang] ?? {}
        state.dicts[lang][ns] = dict
      }
      return () => {}
    },
    getOverride(dshActive, ns, key) {
      if (state.active === undefined || dshActive !== 'en') return undefined
      return state.dicts[state.active]?.[ns]?.[key]
    },
    setActive(localeId) {
      state.active = localeId
      // Best-effort persist of the active override id (localStorage errors
      // are swallowed: privacy mode, quota, ssr — the in-memory state wins).
      if (typeof localStorage === 'undefined') return
      if (localeId === undefined) localStorage.removeItem(STORAGE_KEY)
      else localStorage.setItem(STORAGE_KEY, localeId)
    },
  }
}

/** Read the persisted active override id from localStorage (best-effort). */
function loadActiveFromStorage() {
  if (typeof localStorage === 'undefined') return undefined
  return localStorage.getItem(STORAGE_KEY) ?? undefined
}

/**
 * Distilled from the real patch.ts: the class-level LocaleRuntime lookup
 * patch, expressed through the runtime instance's prototype. The wrapper
 * consults the override store first; the original lookup runs otherwise.
 * Probing first lets an upstream refactor downgrade to a no-op instead of
 * crashing the apply path.
 * @param {import('@deepseek-ai/dsh-client-runtime/client').ClientContext} ctx
 */
function installPatch(ctx, store) {
  const proto = Object.getPrototypeOf(ctx.locale)
  const origLookup = proto?.lookup
  if (typeof origLookup !== 'function') {
    console.error('[bench-locale-pack] LocaleRuntime lookup not found; upstream changed shape. Patch skipped; override layer inert.')
    return () => {}
  }
  const wrapper = function (ns, key) {
    const override = store.getOverride(this.getLocale().active, ns, key)
    if (override !== undefined) return override
    return origLookup.call(this, ns, key)
  }
  proto.lookup = wrapper
  return () => {
    if (proto.lookup !== wrapper) return // someone else replaced it; leave alone
    proto.lookup = origLookup
  }
}

/**
 * Bump the locale runtime's snapshot revision and emit `locale/change` so
 * outlets re-render through the patched lookup (`publish` is private; the
 * escape hatch is the documented one).
 */
function bumpRevision(locale) {
  const active = locale.getLocale().active
  locale.publish(active, true)
}

/** The custom switcher row component (elided; dropdown + "use native" option). */
function LanguageRowStub() {
  return null
}

/**
 * Client plugin body: own copy namespace → override store → lookup patch →
 * ctx.betterLocale service → per-namespace dict registration → the custom
 * settings row.
 * @param {import('@deepseek-ai/dsh-client-runtime/client').ClientContext} ctx
 */
export function apply(ctx) {
  console.error('[bench-locale-pack-client] apply() on the 0.1.1-era cohort: LocaleRuntime lookup patch + custom settings row + localStorage persistence')

  // 1. The plugin's own copy namespace — follows DSH's zh/en preference.
  ctx.effect(
    () => ctx.locale.register(NS, { zh, en }),
    'bench-locale-pack: own copy namespace',
  )

  // 2. Construct the override store; restore the persisted selection.
  const store = createStore(loadActiveFromStorage())

  // 3. Install the lookup patch (HMR-safe: the disposer restores the
  //    original method on fiber disposal).
  ctx.effect(() => installPatch(ctx, store), 'bench-locale-pack: locale lookup patch')

  // 4. Publish the override store so third-party plugins can register
  //    their own dictionaries for the new languages (inject = ['betterLocale']).
  ctx.provide('betterLocale', store)

  // 5. Curated languages (the switcher's options) + all (ns, language) pairs.
  for (const lang of BUILTIN_LANGUAGES) {
    ctx.effect(() => store.registerLanguage(lang), `bench-locale-pack: language ${lang.id}`)
  }
  for (const ns of ALL_NAMESPACES) {
    const langsForNs = {}
    for (const [lang, dicts] of Object.entries(ALL_LANG_DICTS)) {
      if (dicts[ns] !== undefined) langsForNs[lang] = dicts[ns]
    }
    ctx.effect(() => store.register(ns, langsForNs), `bench-locale-pack: dicts for ns ${ns}`)
  }

  // 6. Store changes bump the runtime revision so re-renders consult the
  //    patched lookup (locale/change fires for attachLocale-style listeners).
  ctx.effect(
    () => store.subscribe(() => bumpRevision(ctx.locale)),
    'bench-locale-pack: store → revision bump bridge',
  )

  // 7. The custom switcher row in the settings General section — the
  //    user-facing selection UI (the row's store/subscriptions elided).
  ctx.slots.inject('settings.general.item', () =>
    ctx.slots.register({
      name: 'settings.general.item',
      id: 'better-locale',
      order: 10, // after the locale package's own Language row (order 0)
      locale: NS,
    }, LanguageRowStub))
}
