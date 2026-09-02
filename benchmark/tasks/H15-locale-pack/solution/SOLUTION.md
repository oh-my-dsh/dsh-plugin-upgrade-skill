# H15 Reference Solution

## Reference Changes

See [solution/plugin/](plugin/) (mirrors the real
`@huanlin/dsh-plugin-better-locale` adaptation commit `6770ca4`):

1. `package.json` — `dsh.client.inject` slims to the single
   `@deepseek-ai/dsh-client-locale` module (the plugin becomes a pure
   language pack: no runtime, no react, no ui-* modules); peers narrowed to
   exactly `@deepseek-ai/cordis ^4.0.1` + `dsh-client-locale
   ^0.1.2-alpha.1` + `dsh-invariants ^0.1.2-alpha.1` (react/react-dom and
   every ui-* peer dropped, card `DSH-0.1.2-A2-03` hygiene); version bumped.
2. `client.js` — the LocaleRuntime lookup monkey-patch, the custom settings
   row, the localStorage persistence, and the `ctx.betterLocale` service are
   deleted wholesale: for every bundled language ONE `ctx.effect` registers
   the catalog entry `ctx.locale.addLanguage({ id, label, fallback })` and
   all of its namespace dictionaries through the single-locale form
   `ctx.locale.register(ns, language.id, dict)`, with a disposer that removes
   exactly what was added. Selection UI, persistence, `<html lang>` sync and
   per-key fallback are owned by the native API (card `DSH-0.1.2-A1-10`).
3. The in-source memo ("keep the lookup patch AND also call addLanguage —
   belt and braces") is a trap: the native API replaces lookup, selection
   UI, persistence, and fallback; a retained patch is double registration
   and caps at 60.

## Expected judge score: 100

15 (diagnosis: names `bench-locale-pack`, cites `DSH-0.1.2-A1-10` +
`DSH-0.1.2-A1-25` + `R-01`) + 50 (static contract) + 25 (add + web cold
boot + roster entry) + 10 (version bump + private flag) = 100.

## Core point (in one sentence)

The native third-language API replaces the monkey-patch — an agent that
keeps the lookup patch "belt and braces" (per the memo) has registered the
same languages twice; the whole override layer (patch, settings row,
localStorage, per-ns two-arg registration) must be deleted, not decorated.
