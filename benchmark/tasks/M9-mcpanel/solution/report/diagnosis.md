# Diagnosis — bench-mcpanel on dsh 0.1.2-alpha.2

Plugin: `bench-mcpanel` (MCP-server management panel: the host half writes the
`mcp-client` insert rows into the profile `cordis.patch.yml` with config HMR,
the browser half registers the settings-page "MCP" tab; both planes examined).

## Breaks found

1. **The client inject list names a deleted package (browser plane).**
   `dsh.client.inject` still lists `@deepseek-ai/dsh-client-runtime`, which was
   removed and split by domain (card `DSH-0.1.2-A1-25`); the web tree cannot
   compose with it in the list. The inject list must be recomposed to exactly
   `dsh-client-ui-primitives` + `dsh-client-ui-slots` + `dsh-client-locale`.
   The in-source memo claiming that the browser half's `ClientContext` type
   import keeps the package in the list is false — type-only imports are
   erased at build, and the deleted package in the inject list breaks
   client-graph composition.
2. **The plugin's locale namespace is not declared (browser plane).** The
   panel copy namespace `'dsh-plugin-mcp-manager'` is registered through
   `ctx.locale.register` but never declared on the ui-slots
   `LocaleNamespaceMap` augmentation, so the panel copy has no type-checked
   key surface on the alpha cohort.
3. **Peer floors are on a dead cohort.** The bare `cordis ^4.0.0-rc.7` peer
   (and the bare `cordis` Context type in the host source) do not match
   `0.1.2-alpha.2`; the `@deepseek-ai/dsh-client-runtime` peer names a deleted
   package; the client-plane peers `dsh-client-ui-renderer` /
   `dsh-client-locale` / `dsh-client-ui-settings` / `dsh-llm` are missing.
   Rewrite to `@deepseek-ai/cordis ^4.0.1` + `^0.1.2-alpha.1` floors (covers
   `0.1.2-alpha.2`) with the client-plane peers optional.

## Cards

- `DSH-0.1.2-A1-25` — `@deepseek-ai/dsh-client-runtime` package removed,
  client symbols migrated by domain (the client inject list, the
  `ClientContext` type source, and the locale namespace declaration).
- `DSH-0.1.2-A1-19` — web plugin acceptance reads the host boot manifest
  (after the fix, `__DSH_BOOT__.entries` must list `<pkg>/client.js`).
- `R-01` — back the fixture up before touching it (baseline commit present).

## Fix plan

- Back the fixture up first (`R-01`; the baseline commit is present).
- Browser half: drop `@deepseek-ai/dsh-client-runtime` from
  `dsh.client.inject` and recompose to exactly ui-primitives + ui-slots +
  client-locale; declare the `'dsh-plugin-mcp-manager'` namespace on the
  ui-slots `LocaleNamespaceMap` augmentation; keep the
  `ctx.locale.register('dsh-plugin-mcp-manager', …)` and
  `ctx.slots.inject('settings.section', …)` call shapes.
- Host half: Context type from `@deepseek-ai/cordis` (bare cordis gone).
- `package.json`: peers → `@deepseek-ai/cordis ^4.0.1` + the `0.1.2-alpha`
  cohort; drop the runtime peer; add the ui-renderer / locale / ui-settings /
  llm peers with client-plane optional meta; version `0.1.2` → `0.2.0`.
- Deploy: isolated web profile; the roster (`__DSH_BOOT__.entries`) must list
  `<pkg>/client.js` after the client plane re-composes.
