# H14 · Workspace Sidebar Takeover

**One of the 13-task `H9/M6` portfolio series** — each task distills one real
community plugin migration from the 0.1.1 era onto dsh 0.1.2-alpha.2.

## What it tests

The **composition takeover** trap — the hardest client-plane task in the
series (cards `DSH-0.1.2-A1-25` + `DSH-0.1.2-A1-03`): a plugin whose bundle
patch *disables* an official client entry inherits every role that entry
played, and none of them may be satisfied by editing shipped packages:

- the client inject list still names the deleted `dsh-client-runtime`
  (boot-fatal; card `DSH-0.1.2-A1-25`) — recomposed to the API controllers
  (`dsh-api-workspace-controller`, `dsh-api-session-controller` — the
  session view split, card `DSH-0.1.2-A1-03`), `dsh-client-ui-renderer`
  (ctx.slots), `dsh-client-ui-session`, and the surviving UI modules;
- the disabled official `ui-workspace` provider's roles move into the
  plugin: the `GlobalStandardProps.useWorkspaces` module augmentation +
  `ctx.slots.provideRoot({ hooks: { workspaces: ctx.workspaces.list } })`,
  and a self-provided `uiWorkspace` service stand-in (without it the
  v0.1.2-alpha.1 WebUI boot dead-locks — UI domains injecting the service
  park forever);
- workspace navigation moves off the deleted runtime facade to a
  reuse-or-create blank-session policy over
  `ctx.workspaces.list.getSnapshot()` + `ctx.sessions.create`;
- the fixture's memo claims the official `dsh-client-ui-workspace` "still
  ships in the profile's node_modules — re-enable it by patching its dist
  bundle in place … do NOT write your own root hooks" (both claims false);
  following it caps at **20** (M3-session-projection precedent: never edit
  shipped packages);
- peer floors rewritten to the `0.1.2-alpha` cohort, runtime peer deleted,
  controller/ui-session/ui-workspace/remotes/typert peers added (+
  `@deepseek-ai/cordis` — the real repo pins it to the alpha line).

## Provenance

Distilled from `@huanlin/dsh-plugin-ya-workspace-sidebar` (repo
`huanlinoto/dsh-plugin-ya-workspace-sidebar`), adaptation commit `85f725a`
"feat!: 适配 DSH v0.1.2-alpha.1（client-runtime 拆分 / 接管 useWorkspaces 与
startSession）" + follow-up `a3f317d` "fix: 自供 uiWorkspace 服务替身，修复
v0.1.2-alpha.1 WebUI boot 死锁" (client-runtime split → API controllers;
`GlobalStandardProps.useWorkspaces` takeover via `slots.provideRoot`;
`uiWorkspace` service stand-in fixing the v0.1.2-alpha.1 WebUI boot
dead-lock; reuse-or-create navigation; peer cohort rewrite). The sidebar /
picker component bodies and the host title-cache workaround are elided.

## Layout

Standard Harbor task: `instruction.md` (agent prompt, `BENCHMARK-AUTH-v1`),
`task.toml`, `environment/` (Dockerfile + fixture, git baseline), `tests/`
(`test.sh` → `judge.mjs` → 0–1 reward), `solution/` (oracle: expected 1.0).

```sh
harbor run -p benchmark/tasks/H19-workspace-ya -a oracle   # reference answer must score 1.0
```
