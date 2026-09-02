# M11 · Sidebar Spur Dock

**One of the 13-task `H9/M6` portfolio series** — each task distills one real
community plugin migration from the 0.1.1 era onto dsh 0.1.2-alpha.2.

## What it tests

The **client-runtime split** on a pure client plane (card `DSH-0.1.2-A1-25`):

- `ClientContext` came from the deleted
  `@deepseek-ai/dsh-client-runtime/client` → the context is `cordis`
  `Context` with the `ctx.slots` merge pulled in type-only from
  `@deepseek-ai/dsh-client-ui-renderer/client` (the SlotRegistry lives in
  ui-renderer since the split);
- the client inject list still names the deleted `dsh-client-runtime` → the
  web tree cannot compose (boot-fatal); the browser roster
  (`__DSH_BOOT__.entries`) must list the client entry after the fix;
- the dock registration (`conversation.composer.dock` via
  `ctx.slots.inject` + `ctx.slots.register`) and the two-arg
  `ctx.locale.register` are unchanged across the migration — the agent must
  not break them while repointing the type surface;
- peer floors rewritten to the `0.1.2-alpha` cohort + `@deepseek-ai/cordis
  ^4.0.1`; no bare `cordis` key.

The fixture's "migration memo" claims the `ctx.slots` service *still lives in
dsh-client-runtime on alpha* ("only renamed internally; keep the runtime
inject entry so the dock keeps mounting") — false: the package is deleted.
Following it caps at 20 (boot-fatal bait, H9 precedent). An agent that drops
the runtime entry but forgets to re-source `ctx.slots` from ui-renderer while
keeping the dock registration caps at 40.

## Provenance

Distilled from `@huanlin/dsh-plugin-spur` (repo `huanlinoto/dsh-plugin-spur`),
adaptation commit `f50bbf9` "适配 DSH v0.1.2-alpha.1：移除 dsh-client-runtime，
ctx 改用 cordis Context + ui-renderer slots merge" (`ClientContext` ← runtime
→ `cordis` `Context` + type-only `dsh-client-ui-renderer/client` merge;
client inject list rework; peer cohort rewrite). The braid SVG component is
elided. Note: the real commit did **not** bump the version (`0.1.2` pre and
post) — the oracle bumps to `0.1.3` purely as the release-act hygiene the
exam demands (documented in `solution/SOLUTION.md`).

## Layout

Standard Harbor task: `instruction.md` (agent prompt, `BENCHMARK-AUTH-v1`),
`task.toml`, `environment/` (Dockerfile + fixture, git baseline), `tests/`
(`test.sh` → `judge.mjs` → 0–1 reward), `solution/` (oracle: expected 1.0).

```sh
harbor run -p benchmark/tasks/M11-sidebar-spur -a oracle   # reference answer must score 1.0
```
