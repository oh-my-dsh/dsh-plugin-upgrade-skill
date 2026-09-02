# H13 Reference Solution

## Reference Changes

See [solution/plugin/](plugin/) (mirrors the real `@huanlin/dsh-plugin-auto-blame`
adaptation commit `b552b03`):

1. `package.json` — `dsh-host-apiproxy` and `dsh-client-runtime` removed from
   the peer blocks (both deleted in alpha.1, cards `DSH-0.1.2-A1-01` /
   `DSH-0.1.2-A1-25`); `dsh-client-ui-session` added; `dsh.client.inject`
   recomposed (runtime gone, ui-session in); peer floors rewritten to
   `^0.1.2-alpha.1` (+ `@deepseek-ai/cordis ^4.0.1`); version `0.1.2` →
   `0.2.0`.
2. `index.js` (host plane) — `rpc.handle` now takes exactly
   `(channel, handler)`: the third `authority` option no longer exists. The
   ok/fail helpers are typed with `ConnectionRpcResult` from
   `@deepseek-ai/dsh-client-connection` (the apiproxy `RpcResult` is gone).
   The projection cell is declared in the dual table: a
   `SessionProjectionStateMap` merge carrying the `autoBlame` key (the
   register call does NOT infer it — the memo's second claim is also a
   trap).
3. `client.js` (browser half) — the client context type comes from
   `@deepseek-ai/cordis` with type-only merges; the `useProjection` seat's
   `SessionStandardProps` merge comes from `dsh-client-ui-session/client`;
   the RPC result type source is `dsh-client-connection/client`, not the
   deleted `dsh-host-apiproxy/api`.

## Expected judge score: 100

15 (diagnosis: names the plugin, cites `DSH-0.1.2-A1-01` + `DSH-0.1.2-A2-08`,
plus `DSH-0.1.2-A1-25`/`R-01` in the fix plan)
+ 50 (static contract across both planes) + 25 (add + web cold boot + roster
entry) + 10 (version bump + private flag) = 100.

## Core point (in one sentence)

The gateway facade is deleted and the RPC contract shrank to
`(channel, handler)` while the projection register now demands the dual-table
`SessionProjectionStateMap` merge — an agent that keeps the authority option
or skips the state-map declaration (per the memo) has migrated nothing; the
browser roster check proves the client plane re-composed.
