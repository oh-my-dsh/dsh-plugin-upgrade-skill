# M7 · D399 Game Overlay

**One of the 13-task `H14/M6` portfolio series** — each task distills one real
community plugin migration from the 0.1.1 era onto dsh 0.1.2-alpha.2.

## What it tests

The **boot-fatal half of the client-runtime split** (card
`DSH-0.1.2-A1-25`) on a client-only web plugin:

- `dsh.client.inject` still names `@deepseek-ai/dsh-client-runtime`, which
  was deleted on alpha.2 → the web tree cannot compose (boot-fatal); the
  fix recomposes the list to exactly `@deepseek-ai/dsh-client-locale` +
  `@deepseek-ai/dsh-api-session-controller` (the modules the overlay's
  browser half actually needs);
- the browser half's `ClientContext` type lived on
  `dsh-client-runtime/client` → now `@deepseek-ai/cordis` `Context` with
  type-only merges;
- `ctx.sessions.list` keeps the same store object at runtime, but its type
  (`ISessions`) now ships from
  `@deepseek-ai/dsh-api-session-controller/client` — the fixture's memo
  claims the annotation can be skipped "since the store object is the
  same"; following it lands in the static-incomplete tier (cap 40);
- the dead peer cohort (`^0.0.1-rc.1` / `^4.0.1-rc.1`) rewritten to the
  `0.1.2-alpha` cohort + `@deepseek-ai/cordis ^4.0.1` (no `-rc` suffix);
- the browser roster (`__DSH_BOOT__.entries`) must list the client entry
  after the client plane re-composes.

## Provenance

Distilled from `@huanlin/dsh-plugin-d399` (repo `HuanLinOTO/dsh-plugin-d399`),
adaptation commit `6184995` "v0.2.0: 适配 DSH v0.1.2-alpha.1
（client-runtime 拆分迁移）" (`ClientContext` → cordis `Context`;
`useSessionRunning` annotates `ctx.sessions.list` as `ISessions['list']`
from `dsh-api-session-controller/client`; inject list → locale +
api-session-controller; peers `^0.0.1-rc.1`/`^4.0.1-rc.1` →
`^0.1.2-alpha.1`/`^4.0.1`; version `0.1.3` → `0.2.0`). The game registry,
built-in games, and the React overlay mount are elided.

## Layout

Standard Harbor task: `instruction.md` (agent prompt, `BENCHMARK-AUTH-v1`),
`task.toml`, `environment/` (Dockerfile + fixture, git baseline), `tests/`
(`test.sh` → `judge.mjs` → 0–1 reward), `solution/` (oracle: expected 1.0).

```sh
harbor run -p benchmark/tasks/M7-d399-overlay -a oracle   # reference answer must score 1.0
```
