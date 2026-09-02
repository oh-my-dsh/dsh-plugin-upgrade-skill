# M12 Reference Solution

## Reference Changes

See [solution/plugin/](plugin/) (mirrors the real
`@huanlin/dsh-plugin-interpreters` adaptation commit `6e3d2d2`):

1. `package.json` — `dsh.client.inject` drops the deleted
   `@deepseek-ai/dsh-client-runtime` and the now-redundant `ui-slots`
   runtime entry, adding `@deepseek-ai/dsh-client-ui-renderer`; the peer
   block swaps the runtime peer for `@deepseek-ai/dsh-client-store` (the
   snapshot store's new home) and rewrites every floor to
   `^0.1.2-alpha.1` (+ `@deepseek-ai/cordis ^4.0.1`);
   `peerDependenciesMeta` kept in sync; version bumped `0.2.3` → `0.3.0`
   (the real commit's own bump).
2. `index.js` (host plane) — the settings bridge's annotation is repointed
   from `import('@deepseek-ai/dsh-settings').Settings` to
   `…).SettingsProvider` (a pure type rename, API unchanged). The
   `/interpreters/api` route registration call shape
   (`ctx.webServer.register({ kind: 'prefix', … })`) and the
   `ctx.inject(['settings'], …)` bridge are unchanged.
3. `client.js` (browser half) — `createSnapshotStore`/`SnapshotStore` are
   re-anchored to `@deepseek-ai/dsh-client-store` via the JSDoc import path;
   the context is `@deepseek-ai/cordis` `Context` with type-only merges
   (`dsh-client-connection/client`, `dsh-client-locale/client`,
   `dsh-client-ui-renderer/client`, `dsh-client-ui-settings-plugins/client`);
   the `connection/reset` convergence and the generator card registration
   shapes are unchanged. The in-source memo ("SettingsProvider is just an
   alias … the snapshot store still ships in the runtime on alpha") is
   doubly false: both symbols moved off the deleted package.

## Expected judge score: 100

15 (diagnosis: names `bench-interpreters-card`, cites `DSH-0.1.2-A1-25` +
`R-01`) + 50 (static contract across both planes) + 25 (add + web cold boot +
roster entry) + 10 (version bump + private flag) = 100.

## Core point (in one sentence)

The client-runtime split moved the snapshot store to `@deepseek-ai/dsh-client-store`
and renamed the dsh-settings type `Settings` → `SettingsProvider` — an agent
that trusts the memo (alias claim, "deprecated but present" runtime) has
migrated neither, and the deleted runtime in the client inject keeps the web
tree from composing at all.
