# M9 Reference Solution

## Reference Changes

See [solution/plugin/](plugin/) (mirrors the real `@huanlin/dsh-plugin-mcp-manager`
adaptation commit `e196302`):

1. `package.json` — `dsh.client.inject` recomposed to exactly
   `@deepseek-ai/dsh-client-ui-primitives`, `@deepseek-ai/dsh-client-ui-slots`,
   `@deepseek-ai/dsh-client-locale`: the deleted `dsh-client-runtime` is gone
   from deps, peers, and the inject list (card `DSH-0.1.2-A1-25`); peers
   rewritten (bare `cordis` → `@deepseek-ai/cordis ^4.0.1`, the runtime peer
   dropped, `dsh-client-ui-renderer` + `dsh-client-locale` +
   `dsh-client-ui-settings` + `dsh-llm` added, every `@deepseek-ai/dsh-*` floor
   on `^0.1.2-alpha.1`, the client-plane peers marked optional); version
   bumped `0.1.2` → `0.2.0` (matches the real adaptation's bump).
2. `client.js` (browser half) — the Context type comes from
   `@deepseek-ai/cordis` with type-only Context merges; the plugin's locale
   namespace is declared on the ui-slots `LocaleNamespaceMap` augmentation
   (`'dsh-plugin-mcp-manager'`) and registered via
   `ctx.locale.register('dsh-plugin-mcp-manager', …)`. The in-source memo
   ("keep dsh-client-runtime in the client inject — type imports need the
   package present") is a trap: type-only imports are erased at build, and a
   deleted package in the inject list breaks client-graph composition
   (boot-fatal).
3. `index.js` (host half) — the Context type moves to `@deepseek-ai/cordis`;
   the panel-management role is unchanged (the real yaml-writing body is
   elided in the fixture, and the real adaptation only retyped it).

## Expected judge score: 100

15 (diagnosis: names the plugin, cites `DSH-0.1.2-A1-25` + `DSH-0.1.2-A1-19` + `R-01`)
+ 50 (static contract across both planes) + 25 (add + web cold boot + roster entry)
+ 10 (version bump `0.1.2` → `0.2.0` + private flag) = 100.

## Core point (in one sentence)

The client-runtime package is deleted and split by domain: the client inject
list must be recomposed to the surviving platform modules (a type-only import
does NOT need the package in the list — the memo's bait is boot-fatal), and
the plugin's locale namespace must be declared on the ui-slots
`LocaleNamespaceMap` augmentation.
