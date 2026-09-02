# Diagnosis — bench-interpreters-card on dsh 0.1.2-alpha.2

Plugin: `bench-interpreters-card` (host half: `run_python`/`run_node` tools +
the self-hosted `/interpreters/api` HTTP gateway reading the settings bridge;
browser half: a settings-plugins card that converges on pushed
`connection/reset` invalidations — both planes examined).

## Breaks found

1. **The snapshot store moved (client plane).** `createSnapshotStore` /
   `SnapshotStore` came from `@deepseek-ai/dsh-client-runtime/client`, which
   was removed and split by domain in alpha.1 (card `DSH-0.1.2-A1-25`); their
   new home is `@deepseek-ai/dsh-client-store` (new peer). The in-source memo
   claiming the store "still ships in dsh-client-runtime on alpha
   (deprecated but present)" is false — the package is deleted.
2. **The dsh-settings service type was renamed.** `Settings` →
   `SettingsProvider` (API unchanged — a pure type-surface rename). The
   settings bridge's annotation
   `import('@deepseek-ai/dsh-settings').Settings` must become
   `…).SettingsProvider`. The memo's "just an alias, keep the old name" is
   false.
3. **The client context type comes from the deleted package.** The client
   half's `ctx` is typed `ClientContext` from
   `@deepseek-ai/dsh-client-runtime/client`; on alpha.1 it is
   `@deepseek-ai/cordis` `Context` with type-only merges
   (`dsh-client-connection/client`, `dsh-client-locale/client`,
   `dsh-client-ui-renderer/client` for `ctx.slots`,
   `dsh-client-ui-settings-plugins/client` for the card slot map).
4. **The client inject list names a deleted package.** `dsh.client.inject`
   still lists `@deepseek-ai/dsh-client-runtime` — the web tree cannot
   compose (boot-fatal). The list becomes locale, connection,
   ui-renderer, ui-settings-plugins.
5. **Peer floors are on a dead cohort.** The `^0.1.0-rc.8` floors and
   `@deepseek-ai/cordis ^4.0.1-rc.1` do not match `0.1.2-alpha.2` under npm
   semver prerelease rules; rewrite to `^0.1.2-alpha.1` +
   `@deepseek-ai/cordis ^4.0.1`; delete the runtime peer, add
   `@deepseek-ai/dsh-client-store` (and `dsh-client-ui-renderer`).

## Cards

- `DSH-0.1.2-A1-25` — `@deepseek-ai/dsh-client-runtime` package removed,
  client symbols migrated by domain (the snapshot store's move to
  `dsh-client-store`, the context type, the slots service's home in
  ui-renderer, and the client inject list).
- `R-01` — back the fixture up before touching it (baseline commit present).

## Fix plan

- Host half: repoint the bridge annotation to
  `import('@deepseek-ai/dsh-settings').SettingsProvider`; the gateway route
  registration and the settings bridge call shapes are unchanged.
- Browser half: re-anchor `createSnapshotStore`/`SnapshotStore` to
  `@deepseek-ai/dsh-client-store`; type the context from
  `@deepseek-ai/cordis` with the type-only merges; keep the
  `connection/reset` convergence and generator card registration shapes.
- `package.json`: `dsh.client.inject` → locale, connection, ui-renderer,
  ui-settings-plugins; peers → the `0.1.2-alpha` cohort (+ `@deepseek-ai/cordis
  ^4.0.1`), runtime peer → `dsh-client-store` peer; version `0.2.3` →
  `0.3.0` (the real commit's bump).
- Deploy: isolated web profile; the roster (`__DSH_BOOT__.entries`) must list
  `<pkg>/client.js` after the client plane re-composes.
