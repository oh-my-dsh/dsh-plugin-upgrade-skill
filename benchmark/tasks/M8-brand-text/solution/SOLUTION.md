# M8 Reference Solution

## Reference Changes

See [solution/plugin/](plugin/) (mirrors the real
`@huanlin/dsh-plugin-sidebar-brand-text` adaptation commit `81d9d46`,
"适配 DSH v0.1.2-alpha.1（0.4.2 -> 0.5.0）"):

1. `package.json` — `dsh.client.inject` drops the deleted
   `dsh-client-runtime` and recomposes to the seven surviving client
   platform modules (locale, store, ui-renderer, ui-settings-plugins,
   ui-sidebar, ui-slots, api-session-controller); the rc.8-pinned peers and
   the `-rc`-suffixed cordis peer are rewritten to `^0.1.2-alpha.1` +
   `@deepseek-ai/cordis ^4.0.1`; `dsh-client-store` and
   `dsh-client-ui-renderer` join the peer block; version `0.4.2` → `0.5.0`.
2. `client.js` (browser half) — the snapshot-store engine moves to
   `@deepseek-ai/dsh-client-store` (`createSnapshotStore` / `SnapshotStore`
   are gone from the deleted engine package — the in-source memo claiming
   they still ship there "deprecated but present" is a trap); the client
   context type is the cordis `Context` with type-only merges from
   `dsh-client-ui-renderer/client` + `dsh-client-api-session-controller/client`
   (slots / sessions) and `dsh-client-locale/client`.
3. `index.js` (host half) — unchanged across the migration (the settings
   namespace + HTTP gateway ride `webServer`); only its context type source
   follows the cordis repoint.
4. The `registration.client.spec.ts` effects-count drift (`toBe(3)` vs the 4
   effects the apply body registers) **predates the upgrade** — it was left
   behind by the 0.4.2 activation-order-safe change. The honest diagnosis
   reports it as pre-existing instead of "fixing" the registration shape to
   satisfy the stale assertion.

## Expected judge score: 100

15 (diagnosis: names `bench-brand-text`, cites `DSH-0.1.2-A1-25` + `R-01`,
and attributes the assertion drift as pre-existing) + 50 (static contract:
runtime gone, store engine repointed, inject recomposed, cordis `^4.0.1`,
alpha cohort) + 25 (add + web cold boot + roster entry) + 10 (version bump +
private flag) = 100.

## Core point (in one sentence)

The snapshot-store engine (`createSnapshotStore`/`SnapshotStore`) moved from
the deleted `dsh-client-runtime` to `@deepseek-ai/dsh-client-store`, so the
plugin must re-point both the import surface and the inject list — and an
agent that "fixes" the pre-existing 3-vs-4 effects assertion drift instead
of reporting it has mis-attributed a baseline bug to the migration.
