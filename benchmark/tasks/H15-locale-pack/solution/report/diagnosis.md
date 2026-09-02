# Diagnosis — bench-locale-pack on dsh 0.1.2-alpha.2

Plugin: `bench-locale-pack` (client-only 19-language override layer: lookup
patch + custom settings row + localStorage persistence + per-language
dictionaries; the host half is a no-op stub).

## Breaks found

1. **The native third-party language API replaces the whole patch layer**
   (card `DSH-0.1.2-A1-10`). Since alpha.1 the locale service exposes
   `ctx.locale.addLanguage({ id, label, fallback })` for catalog entries and
   the single-locale form `ctx.locale.register(ns, locale, dict)` for
   dictionaries. Everything the plugin hand-rolled is now native: the
   `LocaleRuntime` lookup monkey-patch (the override layer's core!), the
   custom switcher row in the settings General section, the localStorage
   persistence (`dsh-plugin-better-locale:active` — the durable
   `locale.preference` setting owns persistence now), the `<html lang>` sync
   and per-key fallback along the declared fallback chain, and the
   `ctx.betterLocale` service other plugins registered through. The
   in-source memo claiming the patch and `addLanguage` can coexist
   ("belt and braces") is false — that is double registration; the patch
   must be deleted entirely.
2. **The register call contract changed shape.** The 0.1.1-era calls were
   the two-argument own-copy form `ctx.locale.register(NS, { zh, en })` and
   the override store's per-namespace `store.register(ns, Record<locale,
   dict>)`. The native form is one three-argument call per namespace:
   `ctx.locale.register(ns, language.id, dict)`.
3. **The client inject list must slim to one module.** `dsh.client.inject`
   still names `@deepseek-ai/dsh-client-runtime` (removed and split by
   domain — card `DSH-0.1.2-A1-25`; boot-fatal) plus four ui-* modules the
   pure language pack no longer needs. The POST inject is exactly
   `["@deepseek-ai/dsh-client-locale"]`.
4. **The peer cohort is dead and over-broad.** `^0.1.0-rc.8` floors and
   `@deepseek-ai/cordis ^4.0.1-rc.1` do not match `0.1.2-alpha.2` under npm
   semver prerelease rules; react/react-dom and the ui-* peers are dropped
   (no UI of its own). The POST peer set is exactly `@deepseek-ai/cordis
   ^4.0.1`, `@deepseek-ai/dsh-client-locale ^0.1.2-alpha.1`,
   `@deepseek-ai/dsh-invariants ^0.1.2-alpha.1`.

## Cards

- `DSH-0.1.2-A1-10` — third-party language registration capability
  (`addLanguage` + the single-locale `register(ns, locale, dict)` form;
  selection UI, persistence and fallback move to the host).
- `DSH-0.1.2-A1-25` — `@deepseek-ai/dsh-client-runtime` package removed,
  client symbols migrated by domain (the inject list must not name it).
- `R-01` — back the fixture up before touching it (baseline commit present).

## Fix plan

- Client half: delete the patch/store/settings-row machinery; for every
  bundled language one `ctx.effect` calls
  `ctx.locale.addLanguage({ id, label, fallback })` plus
  `ctx.locale.register(ns, language.id, dict)` for each namespace dict, with
  a disposer removing exactly what was added. No UI of its own, no runtime
  DSH imports.
- `package.json`: `dsh.client.inject` → `["@deepseek-ai/dsh-client-locale"]`;
  peers → exactly `@deepseek-ai/cordis ^4.0.1` +
  `@deepseek-ai/dsh-client-locale ^0.1.2-alpha.1` +
  `@deepseek-ai/dsh-invariants ^0.1.2-alpha.1` (react/react-dom and all
  ui-* peers dropped); version `0.1.0` → `0.2.0`.
- Deploy: isolated web profile; the roster (`__DSH_BOOT__.entries`) must
  list `<pkg>/client.js` after the client plane re-composes.
