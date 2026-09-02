# H9 · MinerU API Channel

**One of the 13-task `H9/M6` portfolio series** — each task distills one real
community plugin migration from the 0.1.1 era onto dsh 0.1.2-alpha.2.

## What it tests

The **APIProxy removal** trap on both planes (card `DSH-0.1.2-A1-01`), plus the
client-runtime split (card `DSH-0.1.2-A1-25`):

- the host RPC result type moves from the deleted `dsh-host-apiproxy/api`
  (`RpcResult`) to `@deepseek-ai/dsh-client-connection` (`ConnectionRpcResult`);
- the `rpc.handle` call contract shrinks from
  `(channel, handler, { authority })` to `(channel, handler)` — the fixture's
  memo claims the split made `authority` mandatory; following it caps at 60;
- the client inject list still names the deleted `dsh-client-runtime` → the
  web tree cannot compose (boot-fatal); the browser roster
  (`__DSH_BOOT__.entries`) must list the client entry after the fix;
- peer floors rewritten to the `0.1.2-alpha` cohort + `@deepseek-ai/cordis`.

## Provenance

Distilled from `@huanlin/dsh-plugin-mineru` (repo `huanlinoto/dsh-plugin-mineru`),
adaptation commit `035b3a7` "适配 DSH v0.1.2-alpha.1：apiproxy/runtime 移除后的
Connection RPC 与 client 上下文迁移" (`RpcResult` ← apiproxy → `ConnectionRpcResult`;
`rpc.handle` third `authority` argument removed; `/mineru-api` dedicated channel;
client inject list rework; peer cohort rewrite). The parsing tool body is elided.

## Layout

Standard Harbor task: `instruction.md` (agent prompt, `BENCHMARK-AUTH-v1`),
`task.toml`, `environment/` (Dockerfile + fixture, git baseline), `tests/`
(`test.sh` → `judge.mjs` → 0–1 reward), `solution/` (oracle: expected 1.0).

```sh
harbor run -p benchmark/tasks/H14-mineru-api -a oracle   # reference answer must score 1.0
```
