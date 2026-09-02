# M12 · Interpreters Settings Card

**One of the 13-task `H9/M6` portfolio series** — each task distills one real
community plugin migration from the 0.1.1 era onto dsh 0.1.2-alpha.2.

## What it tests

The **client-runtime split's cross-plane fallout** (card `DSH-0.1.2-A1-25`)
on a plugin whose host half is *not* the break site:

- `createSnapshotStore` / `SnapshotStore` move from the deleted
  `dsh-client-runtime/client` to `@deepseek-ai/dsh-client-store` (a new peer);
- the `dsh-settings` type `Settings` was **renamed** to `SettingsProvider`
  (API unchanged — a pure type-surface rename an agent is tempted to skip);
- the client context is `cordis` `Context` + type-only ui-renderer merge;
- the client inject list still names the deleted `dsh-client-runtime` → the
  web tree cannot compose (boot-fatal); the browser roster
  (`__DSH_BOOT__.entries`) must list the client entry after the fix;
- peer floors rewritten to the `0.1.2-alpha` cohort + `@deepseek-ai/cordis
  ^4.0.1`.

The fixture's "migration memo" claims `SettingsProvider` is *just an alias*
("keep the old name") and that the snapshot store *still ships in
dsh-client-runtime on alpha (deprecated but present)* — both false. Keeping
the old `Settings` type annotation caps at 60; retaining the deleted runtime
(inject, peers, or import paths) caps at 20.

## Provenance

Distilled from `@huanlin/dsh-plugin-interpreters` (repo
`huanlinoto/dsh-plugin-interpreters`), adaptation commit `6e3d2d2`
"v0.3.0: 适配 DSH v0.1.2-alpha.1（dsh-client-runtime 拆分迁移）"
(`createSnapshotStore`/`SnapshotStore` ← runtime → `dsh-client-store`;
`Settings` → `SettingsProvider` rename in `dsh-settings`; `ClientContext` →
`cordis` `Context` + ui-renderer/client merge; client inject list rework;
peer cohort rewrite + `dsh-client-store` peer added). The tool bodies and the
card component are elided.

## Layout

Standard Harbor task: `instruction.md` (agent prompt, `BENCHMARK-AUTH-v1`),
`task.toml`, `environment/` (Dockerfile + fixture, git baseline), `tests/`
(`test.sh` → `judge.mjs` → 0–1 reward), `solution/` (oracle: expected 1.0).

```sh
harbor run -p benchmark/tasks/M12-interpreters-card -a oracle   # reference answer must score 1.0
```
