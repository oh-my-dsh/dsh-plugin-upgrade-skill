# Diagnosis — bench-blame-bubbles on dsh 0.1.2-alpha.2

Plugin: `bench-blame-bubbles` (host half: `/auto-blame` RPC channel +
`autoBlame` projection unit; browser half: composer-dock suggestion bubbles
+ settings master toggle; both planes examined).

## Breaks found

1. **The gateway facade is deleted (host plane, card `DSH-0.1.2-A1-01`).**
   The peer block still names `@deepseek-ai/dsh-host-apiproxy`, and the
   ok/fail helpers type the wire shape as
   `import('@deepseek-ai/dsh-host-apiproxy/api').RpcResult<…>`. The
   carrier-neutral replacement is `ConnectionRpcResult` from
   `@deepseek-ai/dsh-client-connection`.
2. **The `rpc.handle` call contract shrank.** The 0.1.2-era shape was
   `rpc.handle(channel, handler, { authority: 'trusted-host' })`; the
   0.1.2-alpha contract is exactly `rpc.handle(channel, handler)`. The
   in-source memo claiming the split made the third argument mandatory is
   false — keeping it means the migration never happened.
3. **The projection register generic requires the dual-table declaration
   (card `DSH-0.1.2-A2-08`).** Registering the `autoBlame` cell in the
   projection key map alone no longer type-checks: the cell must also be
   declared in a `SessionProjectionStateMap` merge (the state IS the wire
   value). The memo claiming the merge is optional/inferrable is false.
4. **The useProjection seat re-homed (client plane).** The seat's
   `SessionStandardProps` merge moved from the deleted runtime package to
   `@deepseek-ai/dsh-client-ui-session`; the browser half's context type is
   `Context` from `@deepseek-ai/cordis` with type-only merges (ui-renderer
   for `ctx.slots`).
5. **The client inject list names a deleted package.** `dsh.client.inject`
   still lists `@deepseek-ai/dsh-client-runtime` (removed and split by
   domain, card `DSH-0.1.2-A1-25`); the web tree cannot compose with it in
   the list.
6. **Peer floors are on a dead cohort.** `^0.0.1-rc.1` / `^4.0.1-rc.1`
   floors do not match `0.1.2-alpha.2`; rewrite to `^0.1.2-alpha.1` (+ cordis
   `^4.0.1`), drop `dsh-host-apiproxy` + the runtime peer, add
   `dsh-client-ui-session`.

## Cards

- `DSH-0.1.2-A1-01` — APIProxy removed, Host/Web Client calls moved to
  `@Remote`/domain services (the `RpcResult` → `ConnectionRpcResult` move
  and the two-argument handle contract).
- `DSH-0.1.2-A2-08` — session projections become a required, declared
  surface for tool packages (the dual-table `SessionProjectionStateMap`
  declaration of the `autoBlame` cell).
- `DSH-0.1.2-A1-25` — `dsh-client-runtime` removed, symbols migrated by
  domain (the client inject list and the browser type surface).
- `R-01` — back the fixture up before touching it (baseline commit present).

## Fix plan

- Host half: 2-arg `rpc.handle('/auto-blame', handler)`; `ConnectionRpcResult`
  from `@deepseek-ai/dsh-client-connection`; declare the
  `SessionProjectionStateMap { autoBlame }` merge; delete the apiproxy
  references (both the dependency blocks and the `…/api` import paths).
- Browser half: context type from cordis with type-only merges
  (`dsh-client-ui-session/client` for the useProjection seat,
  `dsh-client-ui-renderer/client` for ctx.slots,
  `dsh-client-connection/client` for the RPC types).
- `package.json`: peers → the `0.1.2-alpha` cohort (+ cordis `^4.0.1`);
  drop apiproxy + runtime everywhere; add `dsh-client-ui-session`; version
  `0.1.2` → `0.2.0`.
- Deploy: isolated web profile; the roster (`__DSH_BOOT__.entries`) must
  list `<pkg>/client.js` after the client plane re-composes.
