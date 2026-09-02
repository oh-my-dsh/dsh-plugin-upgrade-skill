# H9 Reference Solution

## Reference Changes

See [solution/plugin/](plugin/) (mirrors the real `@huanlin/dsh-plugin-mineru`
adaptation commit `035b3a7`):

1. `package.json` — `dsh-host-apiproxy` removed from dependencies and peers
   (the gateway facade was deleted in alpha.1, card `DSH-0.1.2-A1-01`); the
   result type moves to `ConnectionRpcResult` from
   `@deepseek-ai/dsh-client-connection`; `dsh.client.inject` drops
   `@deepseek-ai/dsh-client-runtime` and trims to the four client platform
   modules the settings page actually needs; peer floors rewritten to
   `^0.1.2-alpha.1` (+ `@deepseek-ai/cordis ^4.0.1`); version bumped.
2. `index.js` (host plane) — `rpc.handle` now takes exactly
   `(channel, handler)`: the third `authority` option no longer exists on the
   Connection RPC. The in-source memo ("the split made authority mandatory,
   keep it") is a trap — the option is gone, not enforced.
3. `client.js` (browser half) — the client context type comes from
   `@deepseek-ai/cordis` with type-only merges (`dsh-client-connection/client`
   for the RPC types); the `RpcResult` type source is `dsh-client-connection/client`,
   not the deleted `dsh-host-apiproxy/api`.

## Expected judge score: 100

15 (diagnosis: names the plugin, cites `DSH-0.1.2-A1-01` + `DSH-0.1.2-A1-25` + `R-01`)
+ 50 (static contract across both planes) + 25 (add + web cold boot + roster entry)
+ 10 (version bump + private flag) = 100.

## Core point (in one sentence)

The gateway facade (`dsh-host-apiproxy`) is deleted, and the RPC call contract
shrank from `(channel, handler, options)` to `(channel, handler)` — an agent
that keeps the authority option (per the memo) or the apiproxy type import has
migrated nothing; the browser roster check proves the client plane re-composed.
