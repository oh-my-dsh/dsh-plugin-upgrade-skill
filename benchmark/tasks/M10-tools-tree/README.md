# M10 · Tools Management Tree

**One of the 13-task `H9/M6` portfolio series** — each task distills one real
community plugin migration onto dsh 0.1.2-alpha.2.

## What it tests

The **client-runtime split** trap (card `DSH-0.1.2-A1-25`) with the slots
service ownership twist, plus the backup-first hygiene (card `R-01`):

- the client inject list still names the deleted `dsh-client-runtime` → the
  web tree cannot compose (boot-fatal); it must be recomposed to exactly
  `dsh-client-ui-primitives` + `dsh-client-ui-slots`;
- since the split, the `ctx.slots` runtime (the SlotRegistry Context merge)
  lives in `@deepseek-ai/dsh-client-ui-renderer` and the `'settings.section'`
  SlotMap entry in `@deepseek-ai/dsh-client-ui-settings` — the client half must
  carry type-only references to BOTH `dsh-client-ui-renderer/client` and
  `dsh-client-ui-settings/client`; the fixture's memo claims ui-slots provides
  everything and the ui-renderer import is cosmetic — following it leaves the
  slots service absent (the boot pends on `slots`) and caps at 40;
- the `settings.section` tab registration call shape
  (`ctx.slots.inject('settings.section', …)` + `ctx.slots.register({ name:
  'settings.section', … })`) must survive with the slots service actually
  wired;
- peer floors rewritten to the `0.1.2-alpha` cohort (`@deepseek-ai/cordis`
  moves off its rc line; ui-renderer + ui-settings peers added);
- the browser roster (`__DSH_BOOT__.entries`) must list the client entry.

## Provenance

Distilled from `@huanlin/dsh-plugin-tools-manager` (repo
`huanlinoto/dsh-plugin-tools-manager`), adaptation commit `4d70dfa`
"适配 DSH v0.1.2-alpha.1：client-runtime 拆分迁移（0.1.0 -> 0.2.0）"
(`ClientContext` → cordis `Context`; type-only ui-renderer/client +
ui-settings/client merges added; client inject drops the deleted runtime; peer
cohort rewritten). The tool registry + policy + gateway host body is elided.

## Layout

Standard Harbor task: `instruction.md` (agent prompt, `BENCHMARK-AUTH-v1`),
`task.toml`, `environment/` (Dockerfile + fixture, git baseline), `tests/`
(`test.sh` → `judge.mjs` → 0–1 reward), `solution/` (oracle: expected 1.0).

```sh
harbor run -p benchmark/tasks/M10-tools-tree -a oracle   # reference answer must score 1.0
```
