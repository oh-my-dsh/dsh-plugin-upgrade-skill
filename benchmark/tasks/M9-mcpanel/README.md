# M9 · MCP Server Management Panel

**One of the 13-task `H9/M6` portfolio series** — each task distills one real
community plugin migration onto dsh 0.1.2-alpha.2.

## What it tests

The **client-runtime split** trap (card `DSH-0.1.2-A1-25`) on a web two-plane
plugin, plus the web acceptance anchor (card `DSH-0.1.2-A1-19`):

- the client inject list still names the deleted `dsh-client-runtime` → the
  web tree cannot compose (boot-fatal); it must be recomposed to exactly
  `dsh-client-ui-primitives` + `dsh-client-ui-slots` + `dsh-client-locale`;
- the fixture's memo claims type-only imports keep `dsh-client-runtime` in the
  inject list ("type imports need the package present") — false: type-only
  imports are erased at build, and the deleted package in the list breaks
  client-graph composition; following the memo caps at 20;
- the plugin's locale namespace (`'dsh-plugin-mcp-manager'`) must be declared
  on the ui-slots `LocaleNamespaceMap` augmentation and registered through
  `ctx.locale.register`;
- the peer block is rewritten: bare `cordis` → `@deepseek-ai/cordis ^4.0.1`
  (also in the source type surface), the `dsh-client-runtime` peer dropped,
  `dsh-client-ui-renderer` + `dsh-client-locale` added, every `@deepseek-ai/dsh-*`
  floor on the `0.1.2-alpha` cohort;
- the browser roster (`__DSH_BOOT__.entries`) must list the client entry.

## Provenance

Distilled from `@huanlin/dsh-plugin-mcp-manager` (repo
`huanlinoto/dsh-plugin-mcp-manager`), adaptation commit `e196302`
"适配 DSH v0.1.2-alpha.1：client-runtime 拆分迁移（0.1.2 -> 0.2.0）"
(client inject recomposed; bare cordis scoped; locale namespace declared on the
ui-slots `LocaleNamespaceMap`; peer cohort rewritten). The yaml-registry +
web-route + mcp_* tools host body is elided.

## Layout

Standard Harbor task: `instruction.md` (agent prompt, `BENCHMARK-AUTH-v1`),
`task.toml`, `environment/` (Dockerfile + fixture, git baseline), `tests/`
(`test.sh` → `judge.mjs` → 0–1 reward), `solution/` (oracle: expected 1.0).

```sh
harbor run -p benchmark/tasks/M9-mcpanel -a oracle   # reference answer must score 1.0
```
