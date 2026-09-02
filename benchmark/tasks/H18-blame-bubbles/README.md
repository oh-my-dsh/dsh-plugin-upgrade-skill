# H18 · Blame Bubbles

**One of the 13-task `H14/M6` portfolio series** — each task distills one real
community plugin migration from the 0.1.1 era onto dsh 0.1.2-alpha.2.

## What it tests

The **APIProxy removal** trap on the host plane (card `DSH-0.1.2-A1-01`)
plus the **projection dual-table declaration** (card `DSH-0.1.2-A2-08`),
across both planes:

- the host RPC result type moves from the deleted `dsh-host-apiproxy/api`
  (`RpcResult`) to `@deepseek-ai/dsh-client-connection`
  (`ConnectionRpcResult`);
- the `rpc.handle` call contract shrinks from
  `(channel, handler, { authority })` to `(channel, handler)` — the
  fixture's memo claims the split made `authority` mandatory AND that the
  `SessionProjectionStateMap` merge is optional (both false); following it
  caps at 60;
- the projection register generic now requires a dual-table declaration:
  the plugin's cell (`autoBlame`) must appear in a
  `SessionProjectionStateMap` merge, not only in the projection key map;
- the `useProjection` seat's `SessionStandardProps` merge moves to
  `dsh-client-ui-session`, and the client inject list still names the
  deleted `dsh-client-runtime` → boot-fatal until recomposed;
- peer floors rewritten to the `0.1.2-alpha` cohort (+ cordis `^4.0.1`),
  `dsh-host-apiproxy` and the runtime peer deleted, `dsh-client-ui-session`
  peer added.

## Provenance

Distilled from `@huanlin/dsh-plugin-auto-blame` (repo
`huanlinoto/dsh-plugin-auto-blame`), adaptation commit `b552b03` "feat!:
适配 DSH v0.1.2-alpha.1 breaking changes（0.1.2 -> 0.2.0）" (`RpcResult` ←
apiproxy → `ConnectionRpcResult`; third `authority` argument removed;
`SessionProjectionStateMap` dual-table declaration added; useProjection
seat re-homed to ui-session; client inject rework; peer cohort rewrite).
The LLM generation body and the settings schema are elided.

## Layout

Standard Harbor task: `instruction.md` (agent prompt, `BENCHMARK-AUTH-v1`),
`task.toml`, `environment/` (Dockerfile + fixture, git baseline), `tests/`
(`test.sh` → `judge.mjs` → 0–1 reward), `solution/` (oracle: expected 1.0).

```sh
harbor run -p benchmark/tasks/H18-blame-bubbles -a oracle   # reference answer must score 1.0
```
