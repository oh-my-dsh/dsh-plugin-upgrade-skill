# Diagnosis — bench-mineru-api on dsh 0.1.2-alpha.2

Plugin: `bench-mineru-api` (host parsing tools + browser settings page served
through the `/mineru-api` RPC channel; both planes examined).

## Breaks found

1. **The gateway facade is deleted (host plane).** `dsh-host-apiproxy` was
   removed in alpha.1 (card `DSH-0.1.2-A1-01`): the dependency/peer blocks
   still name it, and the `RpcResult` type is imported from
   `@deepseek-ai/dsh-host-apiproxy/api`. The carrier-neutral replacement is
   `ConnectionRpcResult` from `@deepseek-ai/dsh-client-connection`.
2. **The `rpc.handle` call contract shrank.** The 0.1.1-era shape was
   `rpc.handle(channel, handler, { authority: 'trusted-host' })`; the
   0.1.2-alpha contract is exactly `rpc.handle(channel, handler)`. The
   in-source memo claiming the split made `authority` mandatory is false —
   keeping the third argument means the migration never happened.
3. **The client inject list names a deleted package.** `dsh.client.inject`
   still lists `@deepseek-ai/dsh-client-runtime`, which was removed and split
   by domain (card `DSH-0.1.2-A1-25`); the web tree cannot compose with it in
   the list. The browser half's `ClientContext` type must come from
   `@deepseek-ai/cordis` with type-only merges.
4. **Peer floors are on a dead cohort.** All `^0.0.1-rc.1` floors and the bare
   `cordis ^4.0.0-rc.7` peer do not match `0.1.2-alpha.2` under npm semver
   prerelease rules; they must be rewritten to `^0.1.2-alpha.1` (covers
   `0.1.2-alpha.2`) plus `@deepseek-ai/cordis ^4.0.1`.

## Cards

- `DSH-0.1.2-A1-01` — APIProxy removed, Host/Web Client calls moved to
  `@Remote`/domain services (the `RpcResult` → `ConnectionRpcResult` move and
  the two-argument handle contract).
- `DSH-0.1.2-A1-25` — `@deepseek-ai/dsh-client-runtime` package removed,
  client symbols migrated by domain (the client inject list and the browser
  type surface).
- `R-01` — back the fixture up before touching it (baseline commit present).

## Fix plan

- Host half: 2-arg `rpc.handle('/mineru-api', handler)`; `ConnectionRpcResult`
  from `@deepseek-ai/dsh-client-connection`; delete the apiproxy references.
- Browser half: `dsh.client.inject` → the four client platform modules
  actually injected (locale, connection, ui-settings, ui-slots); type sources
  repointed off the deleted packages.
- `package.json`: peers → the `0.1.2-alpha` cohort (+ `@deepseek-ai/cordis
  ^4.0.1`); drop `dsh-host-apiproxy` from dependencies, peers, and meta;
  version `0.2.4` → `0.2.5`.
- Deploy: isolated web profile; the roster (`__DSH_BOOT__.entries`) must list
  `<pkg>/client.js` after the client plane re-composes.
