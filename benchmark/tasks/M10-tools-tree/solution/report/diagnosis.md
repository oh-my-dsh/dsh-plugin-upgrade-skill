# Diagnosis — bench-tools-tree on dsh 0.1.2-alpha.2

Plugin: `bench-tools-tree` (tools-management panel: the host half attributes
every registered tool to its source plugin and gates disabled tools, the
browser half registers the settings-page tools tab through the
`settings.section` slot; both planes examined).

## Breaks found

1. **The client inject list names a deleted package (browser plane).**
   `dsh.client.inject` still lists `@deepseek-ai/dsh-client-runtime`, which was
   removed and split by domain (card `DSH-0.1.2-A1-25`); the web tree cannot
   compose with it in the list. The recomposed list is exactly
   `dsh-client-ui-primitives` + `dsh-client-ui-slots`.
2. **The `ctx.slots` service owner moved in the split.** The 0.1.0-era client
   half typed its context as `ClientContext` from
   `@deepseek-ai/dsh-client-runtime/client` and pulled the slots Context merge
   type-only from `@deepseek-ai/dsh-client-ui-slots`. Since the split, the
   SlotRegistry Context merge lives in
   `@deepseek-ai/dsh-client-ui-renderer/client` and the `'settings.section'`
   SlotMap entry in `@deepseek-ai/dsh-client-ui-settings/client` — the client
   half must carry type-only references to BOTH. The in-source memo claiming
   ui-slots provides everything is false: without the ui-renderer wiring the
   slots service is absent and the boot pends on `slots`.
3. **Peer floors are on a dead cohort.** The `^4.0.1-rc.1` cordis line and the
   `^0.0.1-rc.1` floors do not match `0.1.2-alpha.2` under npm semver
   prerelease rules; they must be rewritten to `@deepseek-ai/cordis ^4.0.1` +
   `^0.1.2-alpha.1` floors (ui-renderer and ui-settings peers added, the
   runtime peer and its optional meta dropped).

## Cards

- `DSH-0.1.2-A1-25` — `@deepseek-ai/dsh-client-runtime` package removed,
  client symbols migrated by domain (the client inject list, the
  `ClientContext` → cordis `Context` move, the slots service's new home in
  ui-renderer).
- `R-01` — back the fixture up before touching it (baseline commit present);
  the migration rewrites the client plane in place.

## Fix plan

- Back the fixture up first (`R-01`; the baseline commit is present).
- Browser half: `dsh.client.inject` → exactly
  `@deepseek-ai/dsh-client-ui-primitives` + `@deepseek-ai/dsh-client-ui-slots`;
  context type → `@deepseek-ai/cordis` `Context`; add the type-only merges
  `@deepseek-ai/dsh-client-ui-renderer/client` +
  `@deepseek-ai/dsh-client-ui-settings/client`; keep the
  `ctx.slots.inject('settings.section', …)` + `ctx.slots.register({ name:
  'settings.section', … })` call shapes.
- `package.json`: peers → the `0.1.2-alpha` cohort (`@deepseek-ai/cordis
  ^4.0.1`, ui-renderer + ui-settings added, runtime peer + meta dropped);
  version `0.1.0` → `0.2.0`.
- Deploy: isolated web profile; the roster (`__DSH_BOOT__.entries`) must list
  `<pkg>/client.js` after the client plane re-composes.
