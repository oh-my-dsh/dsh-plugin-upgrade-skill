# Diagnosis — bench-brand-text on dsh 0.1.2-alpha.2

Plugin: `bench-brand-text` (replaces the sidebar's top-left brand name and
revision badge via a live settings card; host settings namespace + HTTP
gateway, browser slot occupant + title writer — both planes examined).

## Breaks found

1. **The snapshot-store engine is deleted (browser plane).**
   `createSnapshotStore` / `SnapshotStore` came from
   `@deepseek-ai/dsh-client-runtime/client`; the package was removed and the
   symbols migrated by domain (card `DSH-0.1.2-A1-25`): the store engine now
   ships from `@deepseek-ai/dsh-client-store`. The in-source migration memo
   claiming `createSnapshotStore` "still ships in the runtime package,
   deprecated but present" is false — the package is deleted outright, and
   keeping the runtime import means the migration never happened.
2. **The client inject list names a deleted package.** `dsh.client.inject`
   still lists `@deepseek-ai/dsh-client-runtime` (card `DSH-0.1.2-A1-25`) —
   the web tree cannot compose with it in the list (boot-fatal). The POST
   list is the seven surviving platform modules: api-session-controller,
   client-locale, client-store, client-ui-renderer,
   client-ui-settings-plugins, client-ui-sidebar, client-ui-slots. The
   client context type becomes the cordis `Context` with type-only merges
   (ui-renderer for slots, api-session-controller for sessions, locale).
3. **The cordis peer keeps a `-rc` prerelease suffix.**
   `@deepseek-ai/cordis ^4.0.0-rc.7` never matches the alpha host under npm
   semver prerelease rules; it must be exactly `^4.0.1`.
4. **The peer cohort is pinned to a dead rc.8 line.** Every
   `0.1.0-rc.8`-pinned peer (locale, ui-slots, ui-sidebar,
   ui-settings-plugins, invariants, settings — and the runtime peer, which
   must be dropped entirely) does not match `0.1.2-alpha.2` under npm semver
   prerelease rules; they must be rewritten to `^0.1.2-alpha.1`, with
   `dsh-client-store` (the store engine's new home) and
   `dsh-client-ui-renderer` (the slots/sessions type merges) added.
5. **The registration-assertion drift predates the upgrade.**
   `tests/registration.client.spec.ts` asserts `expect(effects.length).toBe(3)`
   while the apply body registers 4 effects — this drift is pre-existing:
   it was introduced by the 0.4.2 activation-order-safe change (the
   better-locale override effect) and the spec was never updated, i.e. it is
   not caused by the upgrade. The migration must not rework the registration
   shape to satisfy the stale assertion — the fix belongs to the test file,
   which is outside this exam's fixture surface.

## Cards

- `DSH-0.1.2-A1-25` — `@deepseek-ai/dsh-client-runtime` package removed,
  client symbols migrated by domain (the store engine →
  `@deepseek-ai/dsh-client-store`; the client context type → cordis
  `Context` with type-only ui-renderer / api-session-controller merges; the
  inject list recomposition).
- `R-01` — back the fixture up before touching it (baseline commit present;
  verify before editing).

## Fix plan

- `package.json`: `dsh.client.inject` → `["@deepseek-ai/dsh-api-session-controller",
  "@deepseek-ai/dsh-client-locale", "@deepseek-ai/dsh-client-store",
  "@deepseek-ai/dsh-client-ui-renderer", "@deepseek-ai/dsh-client-ui-settings-plugins",
  "@deepseek-ai/dsh-client-ui-sidebar", "@deepseek-ai/dsh-client-ui-slots"]`;
  peers → `^0.1.2-alpha.1` across the board + `@deepseek-ai/cordis ^4.0.1`
  (no `-rc` suffix anywhere); add `dsh-client-store` + `dsh-client-ui-renderer`
  peers; drop the runtime peer + meta row; version `0.4.2` → `0.5.0`.
- `client.js`: store engine → `@deepseek-ai/dsh-client-store`
  (`createSnapshotStore` / `SnapshotStore`); context type → cordis `Context`
  with type-only merges (`dsh-client-ui-renderer/client`,
  `dsh-client-api-session-controller/client`, `dsh-client-locale/client`);
  delete the misleading memo; leave the 4-effect registration shape as-is
  (the 3-vs-4 assertion drift predates the upgrade).
- Deploy: isolated web profile; the roster (`__DSH_BOOT__.entries`) must list
  `<pkg>/client.js` after the client plane re-composes.
